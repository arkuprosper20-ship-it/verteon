export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, { type: string; description: string; items?: any; enum?: string[] }>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  /** Risk tier used by the safety layer to decide whether approval is required. */
  riskTier: 'safe' | 'approval' | 'blocked';
  execute: (input: Record<string, any>, ctx: ToolExecutionContext) => Promise<ToolResult>;
}

export interface ToolExecutionContext {
  workspaceRoot: string;
  requestApproval: (request: ApprovalRequest) => Promise<boolean>;
  emitActivity: (activity: ActivityEvent) => void;
  cancellationToken: { isCancelled: boolean };
  showDiff: (filePath: string, before: string, after: string, title: string) => Promise<void>;
}

export interface ToolResult {
  ok: boolean;
  output: string;
  error?: string;
  data?: any;
}

export interface ApprovalRequest {
  title: string;
  whatWillRun: string;
  why: string;
  potentialEffect: string;
  tier: 'approval' | 'blocked';
}

export interface ActivityEvent {
  kind: 'tool_start' | 'tool_end' | 'thinking' | 'message' | 'error' | 'command_output';
  text: string;
  toolName?: string;
  success?: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolCalls?: ModelToolCall[];
}

export interface ModelToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ChatStreamChunk {
  textDelta?: string;
  toolCalls?: ModelToolCall[];
  done?: boolean;
}

export interface AIProvider {
  id: string;
  /** Non-streaming health check: is the backend reachable and is the configured model present. */
  healthCheck(): Promise<{ ok: boolean; message: string }>;
  listModels(): Promise<string[]>;
  /** Streams a chat completion, optionally with tool definitions the model may call. */
  chatStream(
    messages: ChatMessage[],
    tools: ToolDefinition[] | undefined,
    onChunk: (chunk: ChatStreamChunk) => void,
    signal: AbortSignal
  ): Promise<{ finalText: string; toolCalls: ModelToolCall[] }>;
}
