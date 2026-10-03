import { runAgentLoop } from '../../src/agent/agentLoop';
import { ToolDefinition, ToolExecutionContext, ToolResult } from '../../src/types';
import { expect } from 'chai';

interface FakeProviderResponse {
  finalText: string;
  toolCalls: { id: string; name: string; arguments: Record<string, any> }[];
}

class FakeAIProvider {
  id = 'fake';
  private responses: FakeProviderResponse[];
  private responseIndex = 0;

  constructor(responses: FakeProviderResponse[]) {
    this.responses = responses;
  }

  async healthCheck() {
    return { ok: true, message: 'fake provider healthy' };
  }

  async listModels() {
    return ['fake-model'];
  }

  async chatStream(
    _messages: any[],
    _tools: ToolDefinition[] | undefined,
    onChunk: (chunk: any) => void,
    _signal: AbortSignal
  ): Promise<{ finalText: string; toolCalls: { id: string; name: string; arguments: Record<string, any> }[] }> {
    const response = this.responses[this.responseIndex++] ?? { finalText: '', toolCalls: [] };
    if (response.finalText) {
      onChunk({ textDelta: response.finalText });
    }
    if (response.toolCalls.length > 0) {
      onChunk({ toolCalls: response.toolCalls });
    }
    onChunk({ done: true });
    return response;
  }
}

function createFakeTool(name: string, result: ToolResult): ToolDefinition {
  return {
    name,
    description: `Fake tool ${name}`,
    riskTier: 'safe',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => result,
  };
}

function createCtx(workspaceRoot = '/fake/workspace'): ToolExecutionContext {
  return {
    workspaceRoot,
    requestApproval: async () => true,
    emitActivity: () => {},
    cancellationToken: { isCancelled: false },
    showDiff: async () => {},
  };
}

describe('runAgentLoop', () => {
  it('returns final text when provider emits no tool calls', async () => {
    const provider = new FakeAIProvider([
      { finalText: 'Hello, world!', toolCalls: [] },
    ]);

    const result = await runAgentLoop(
      [{ role: 'user', content: 'Say hello' }],
      {
        provider,
        tools: [],
        workspaceRoot: '/fake/workspace',
        maxIterations: 3,
        requestApproval: async () => true,
        emitActivity: () => {},
        onTextDelta: () => {},
        showDiff: async () => {},
      },
      { isCancelled: false }
    );

    expect(result.finalText).to.equal('Hello, world!');
    expect(result.stoppedReason).to.equal('completed');
    expect(result.toolsUsed).to.deep.equal([]);
  });

  it('executes a single tool call and returns final text', async () => {
    const provider = new FakeAIProvider([
      {
        finalText: '',
        toolCalls: [{ id: 'call_1', name: 'listFiles', arguments: { dirPath: '.' } }],
      },
      { finalText: 'Done listing files.', toolCalls: [] },
    ]);

    const tool = createFakeTool('listFiles', { ok: true, output: 'file1.txt\nfile2.ts' });

    const result = await runAgentLoop(
      [{ role: 'user', content: 'List files' }],
      {
        provider,
        tools: [tool],
        workspaceRoot: '/fake/workspace',
        maxIterations: 3,
        requestApproval: async () => true,
        emitActivity: () => {},
        onTextDelta: () => {},
        showDiff: async () => {},
      },
      { isCancelled: false }
    );

    expect(result.toolsUsed).to.deep.equal(['listFiles']);
    expect(result.finalText).to.equal('Done listing files.');
    expect(result.stoppedReason).to.equal('completed');
  });

  it('chains multiple tool calls across iterations', async () => {
    const provider = new FakeAIProvider([
      {
        finalText: '',
        toolCalls: [{ id: 'call_1', name: 'step1', arguments: {} }],
      },
      {
        finalText: '',
        toolCalls: [{ id: 'call_2', name: 'step2', arguments: {} }],
      },
      { finalText: 'All steps complete.', toolCalls: [] },
    ]);

    const tools = [
      createFakeTool('step1', { ok: true, output: 'step1 result' }),
      createFakeTool('step2', { ok: true, output: 'step2 result' }),
    ];

    const result = await runAgentLoop(
      [{ role: 'user', content: 'Do steps' }],
      {
        provider,
        tools,
        workspaceRoot: '/fake/workspace',
        maxIterations: 5,
        requestApproval: async () => true,
        emitActivity: () => {},
        onTextDelta: () => {},
        showDiff: async () => {},
      },
      { isCancelled: false }
    );

    expect(result.toolsUsed).to.deep.equal(['step1', 'step2']);
    expect(result.finalText).to.equal('All steps complete.');
    expect(result.stoppedReason).to.equal('completed');
  });

  it('records tool result in history', async () => {
    const provider = new FakeAIProvider([
      {
        finalText: '',
        toolCalls: [{ id: 'call_1', name: 'echo', arguments: { text: 'hi' } }],
      },
      { finalText: 'ack', toolCalls: [] },
    ]);

    const tool = createFakeTool('echo', { ok: true, output: 'hi' });

    const result = await runAgentLoop(
      [{ role: 'user', content: 'echo hi' }],
      {
        provider,
        tools: [tool],
        workspaceRoot: '/fake/workspace',
        maxIterations: 3,
        requestApproval: async () => true,
        emitActivity: () => {},
        onTextDelta: () => {},
        showDiff: async () => {},
      },
      { isCancelled: false }
    );

    const toolMessages = result.history.filter((m) => m.role === 'tool');
    expect(toolMessages.length).to.equal(1);
    expect(toolMessages[0].toolName).to.equal('echo');
    expect(toolMessages[0].content).to.include('hi');
  });

  it('handles tool failure and continues', async () => {
    const provider = new FakeAIProvider([
      {
        finalText: '',
        toolCalls: [{ id: 'call_1', name: 'failingTool', arguments: {} }],
      },
      { finalText: 'Tool failed but I recovered.', toolCalls: [] },
    ]);

    const tool = createFakeTool('failingTool', { ok: false, output: '', error: 'boom' });

    const result = await runAgentLoop(
      [{ role: 'user', content: 'run failing tool' }],
      {
        provider,
        tools: [tool],
        workspaceRoot: '/fake/workspace',
        maxIterations: 3,
        requestApproval: async () => true,
        emitActivity: () => {},
        onTextDelta: () => {},
        showDiff: async () => {},
      },
      { isCancelled: false }
    );

    expect(result.toolsUsed).to.deep.equal(['failingTool']);
    expect(result.finalText).to.equal('Tool failed but I recovered.');
    expect(result.stoppedReason).to.equal('completed');
  });

  it('records unknown tool error in history', async () => {
    const provider = new FakeAIProvider([
      {
        finalText: '',
        toolCalls: [{ id: 'call_1', name: 'nonexistent', arguments: {} }],
      },
      { finalText: 'unknown tool handled', toolCalls: [] },
    ]);

    const result = await runAgentLoop(
      [{ role: 'user', content: 'run nonexistent' }],
      {
        provider,
        tools: [],
        workspaceRoot: '/fake/workspace',
        maxIterations: 3,
        requestApproval: async () => true,
        emitActivity: () => {},
        onTextDelta: () => {},
        showDiff: async () => {},
      },
      { isCancelled: false }
    );

    const toolMessages = result.history.filter((m) => m.role === 'tool');
    expect(toolMessages.length).to.equal(1);
    expect(toolMessages[0].content).to.include('unknown tool');
  });

  it('stops at max iterations', async () => {
    const provider = new FakeAIProvider(
      Array.from({ length: 10 }, (_, i) => ({
        finalText: `iteration ${i}`,
        toolCalls: [{ id: `call_${i}`, name: 'loopTool', arguments: {} }],
      }))
    );

    const tool = createFakeTool('loopTool', { ok: true, output: 'ok' });

    const result = await runAgentLoop(
      [{ role: 'user', content: 'loop forever' }],
      {
        provider,
        tools: [tool],
        workspaceRoot: '/fake/workspace',
        maxIterations: 2,
        requestApproval: async () => true,
        emitActivity: () => {},
        onTextDelta: () => {},
        showDiff: async () => {},
      },
      { isCancelled: false }
    );

    expect(result.stoppedReason).to.equal('max_iterations');
  });

  it('cancels when cancellation token is set', async () => {
    const provider = new FakeAIProvider([
      {
        finalText: '',
        toolCalls: [{ id: 'call_1', name: 'step1', arguments: {} }],
      },
    ]);

    const tool = createFakeTool('step1', { ok: true, output: 'ok' });

    const result = await runAgentLoop(
      [{ role: 'user', content: 'step1' }],
      {
        provider,
        tools: [tool],
        workspaceRoot: '/fake/workspace',
        maxIterations: 3,
        requestApproval: async () => true,
        emitActivity: () => {},
        onTextDelta: () => {},
        showDiff: async () => {},
      },
      { isCancelled: true }
    );

    expect(result.stoppedReason).to.equal('cancelled');
  });
});
