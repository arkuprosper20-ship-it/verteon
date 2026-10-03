import { AIProvider, ChatMessage, ChatStreamChunk, ModelToolCall, ToolDefinition } from '../types';
import { logger } from '../logging/logger';

export interface OllamaProviderOptions {
  baseUrl: string;
  model: string;
  temperature: number;
  numCtx: number;
  numPredict: number;
}

function toOllamaMessages(messages: ChatMessage[]): any[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool', content: m.content, tool_call_id: m.toolCallId };
    }
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: m.content,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

function toOllamaTools(tools: ToolDefinition[] | undefined): any[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

/**
 * Provider for a locally hosted Ollama server (default http://localhost:11434).
 * Uses the native /api/chat endpoint (NDJSON streaming) which supports tool calling
 * for models that have been trained/tuned for it (e.g. qwen2.5-coder, llama3.1, mistral-nemo).
 */
export class OllamaProvider implements AIProvider {
  id = 'ollama';
  constructor(private opts: OllamaProviderOptions) {}

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch(`${this.opts.baseUrl}/api/tags`, { method: 'GET' });
      if (!res.ok) {
        return { ok: false, message: `Ollama responded with HTTP ${res.status}.` };
      }
      const data: any = await res.json();
      const names: string[] = (data.models ?? []).map((m: any) => m.name);
      if (!names.includes(this.opts.model)) {
        return {
          ok: false,
          message: `Ollama is running, but model "${this.opts.model}" is not pulled. Run: ollama pull ${this.opts.model}`,
        };
      }
      return { ok: true, message: `Connected to Ollama. Using model "${this.opts.model}".` };
    } catch (err: any) {
      return {
        ok: false,
        message: `Could not reach Ollama at ${this.opts.baseUrl}. Is it running? (${err?.message ?? err})`,
      };
    }
  }

  async listModels(): Promise<string[]> {
    const res = await fetch(`${this.opts.baseUrl}/api/tags`, { method: 'GET' });
    if (!res.ok) throw new Error(`Ollama /api/tags returned HTTP ${res.status}`);
    const data: any = await res.json();
    return (data.models ?? []).map((m: any) => m.name);
  }

  async chatStream(
    messages: ChatMessage[],
    tools: ToolDefinition[] | undefined,
    onChunk: (chunk: ChatStreamChunk) => void,
    signal: AbortSignal
  ): Promise<{ finalText: string; toolCalls: ModelToolCall[] }> {
    const body: any = {
      model: this.opts.model,
      messages: toOllamaMessages(messages),
      stream: true,
      options: {
        temperature: this.opts.temperature,
        num_ctx: this.opts.numCtx,
        num_predict: this.opts.numPredict,
      },
    };
    const ollamaTools = toOllamaTools(tools);
    if (ollamaTools) body.tools = ollamaTools;

    const res = await fetch(`${this.opts.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama chat request failed: HTTP ${res.status} ${text}`);
    }

    const reader = (res.body as any).getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalText = '';
    const collectedToolCalls: ModelToolCall[] = [];
    let toolCallCounter = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (!line) continue;
        let json: any;
        try {
          json = JSON.parse(line);
        } catch (e) {
          logger.debug(`Ollama stream: skipping unparsable line: ${line.slice(0, 200)}`);
          continue;
        }
        const msg = json.message;
        if (msg?.content) {
          finalText += msg.content;
          onChunk({ textDelta: msg.content });
        }
        if (msg?.tool_calls && Array.isArray(msg.tool_calls)) {
          const calls: ModelToolCall[] = msg.tool_calls.map((tc: any) => ({
            id: `call_${++toolCallCounter}_${Date.now()}`,
            name: tc.function?.name,
            arguments:
              typeof tc.function?.arguments === 'string'
                ? safeJsonParse(tc.function.arguments)
                : tc.function?.arguments ?? {},
          }));
          collectedToolCalls.push(...calls);
          onChunk({ toolCalls: calls });
        }
        if (json.done) {
          onChunk({ done: true });
        }
      }
    }

    return { finalText, toolCalls: collectedToolCalls };
  }
}

function safeJsonParse(s: string): Record<string, any> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
