import {
  AIProvider,
  ActivityEvent,
  ApprovalRequest,
  ChatMessage,
  ModelToolCall,
  ToolDefinition,
} from '../types';
import { findTool } from '../tools/toolRegistry';
import { trimHistory } from '../context/contextManager';
import { logger } from '../logging/logger';

export interface AgentLoopOptions {
  provider: AIProvider;
  tools: ToolDefinition[];
  workspaceRoot: string;
  maxIterations: number;
  requestApproval: (request: ApprovalRequest) => Promise<boolean>;
  emitActivity: (activity: ActivityEvent) => void;
  onTextDelta: (delta: string) => void;
  showDiff: (filePath: string, before: string, after: string, title: string) => Promise<void>;
  onPlanUpdate?: (plan: any) => void;
  onSummary?: (summary: any) => void;
}

export interface AgentLoopResult {
  finalText: string;
  history: ChatMessage[];
  toolsUsed: string[];
  stoppedReason: 'completed' | 'max_iterations' | 'cancelled' | 'error';
}

/**
 * Runs the agent loop: send messages -> model responds with text and/or tool calls ->
 * execute tool calls -> feed results back -> repeat, until the model produces a final
 * answer with no further tool calls, the iteration cap is hit, or the task is cancelled.
 */
export async function runAgentLoop(
  messages: ChatMessage[],
  options: AgentLoopOptions,
  cancellationToken: { isCancelled: boolean }
): Promise<AgentLoopResult> {
  const history = [...messages];
  const toolsUsed: string[] = [];
  let finalText = '';

  for (let iteration = 0; iteration < options.maxIterations + 1; iteration++) {
    if (cancellationToken.isCancelled) {
      return { finalText, history, toolsUsed, stoppedReason: 'cancelled' };
    }

    const trimmedHistory = trimHistory(history);
    const controller = new AbortController();
    const cancelWatcher = setInterval(() => {
      if (cancellationToken.isCancelled) controller.abort();
    }, 200);

    let result: { finalText: string; toolCalls: ModelToolCall[] };
    try {
      result = await options.provider.chatStream(
        trimmedHistory,
        options.tools,
        (chunk) => {
          if (chunk.textDelta) options.onTextDelta(chunk.textDelta);
        },
        controller.signal
      );
    } catch (err: any) {
      clearInterval(cancelWatcher);
      logger.error('Agent loop: chatStream failed', err);
      options.emitActivity({ kind: 'error', text: `Model request failed: ${err.message ?? err}` });
      return { finalText, history, toolsUsed, stoppedReason: 'error' };
    }
    clearInterval(cancelWatcher);

    finalText = result.finalText;
    history.push({ role: 'assistant', content: result.finalText, toolCalls: result.toolCalls });

    if (!result.toolCalls || result.toolCalls.length === 0) {
      // Model is done — no more tool calls requested.
      return { finalText, history, toolsUsed, stoppedReason: 'completed' };
    }

    if (iteration >= options.maxIterations) {
      options.emitActivity({
        kind: 'message',
        text: `Reached the maximum of ${options.maxIterations} agent iterations. Stopping to avoid an unbounded loop — let me know how you'd like to proceed.`,
      });
      return { finalText, history, toolsUsed, stoppedReason: 'max_iterations' };
    }

    for (const call of result.toolCalls) {
      if (cancellationToken.isCancelled) {
        return { finalText, history, toolsUsed, stoppedReason: 'cancelled' };
      }
      const tool = findTool(options.tools, call.name);
      if (!tool) {
        history.push({
          role: 'tool',
          content: `Error: unknown tool "${call.name}". Available tools: ${options.tools.map((t) => t.name).join(', ')}`,
          toolName: call.name,
          toolCallId: call.id,
        });
        continue;
      }
      toolsUsed.push(tool.name);
      options.emitActivity({ kind: 'tool_start', text: `Running ${tool.name}...`, toolName: tool.name });
      try {
        const toolResult = await tool.execute(call.arguments ?? {}, {
          workspaceRoot: options.workspaceRoot,
          requestApproval: options.requestApproval,
          emitActivity: options.emitActivity,
          cancellationToken,
          showDiff: options.showDiff,
        });
        options.emitActivity({
          kind: 'tool_end',
          text: toolResult.ok ? `${tool.name} succeeded.` : `${tool.name} failed: ${toolResult.error ?? 'unknown error'}`,
          toolName: tool.name,
          success: toolResult.ok,
        });
        const content = toolResult.ok
          ? toolResult.output || '(no output)'
          : `ERROR: ${toolResult.error ?? 'tool failed'}\n${toolResult.output ?? ''}`;
        history.push({ role: 'tool', content: truncateForModel(content), toolName: tool.name, toolCallId: call.id });
        if (tool.name === 'updatePlan' && toolResult.data?.plan) {
          options.onPlanUpdate?.(toolResult.data.plan);
        }
        if (tool.name === 'summarizeTask' && toolResult.data?.summary) {
          options.onSummary?.(toolResult.data.summary);
        }
      } catch (err: any) {
        logger.error(`Tool ${tool.name} threw`, err);
        options.emitActivity({ kind: 'tool_end', text: `${tool.name} threw an error: ${err.message}`, toolName: tool.name, success: false });
        history.push({
          role: 'tool',
          content: `ERROR: tool threw an exception: ${err.message ?? err}`,
          toolName: tool.name,
          toolCallId: call.id,
        });
      }
    }
  }

  return { finalText, history, toolsUsed, stoppedReason: 'max_iterations' };
}

function truncateForModel(s: string, max = 6000): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n...[truncated ${s.length - max} more characters]...`;
}
