import { AIProvider, ChatMessage, ChatStreamChunk, ToolDefinition } from '../types';

export interface GroqProviderOptions {
  apiKey: string;
  model: string;
  temperature: number;
  maxContext: number;
  maxOutputTokens: number;
}

export class GroqProvider implements AIProvider {
  readonly id = 'groq';
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly temperature: number;
  private readonly maxContext: number;
  private readonly maxOutputTokens: number;

  constructor(options: GroqProviderOptions) {
    this.baseUrl = 'https://api.groq.com/openai/v1';
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.temperature = options.temperature;
    this.maxContext = options.maxContext;
    this.maxOutputTokens = options.maxOutputTokens;
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) {
        return { ok: false, message: `Groq error: ${res.status} ${res.statusText}` };
      }
      const data = (await res.json()) as any;
      const models = Array.isArray(data?.data) ? data.data.map((m: any) => m.id) : [];
      if (models.length === 0) {
        return { ok: false, message: 'Groq reachable, but no models returned.' };
      }
      const hasModel = models.some((id: string) => id === this.model);
      return {
        ok: hasModel,
        message: hasModel
          ? `Groq OK. Model "${this.model}" available.`
          : `Groq OK, but model "${this.model}" not found. Available: ${models.slice(0, 5).join(', ')}`,
      };
    } catch (err: any) {
      return { ok: false, message: `Groq unreachable: ${err.message}` };
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as any;
      return Array.isArray(data?.data) ? data.data.map((m: any) => m.id) : [];
    } catch {
      return [];
    }
  }

  async chatStream(
    messages: ChatMessage[],
    tools: ToolDefinition[] | undefined,
    onChunk: (chunk: ChatStreamChunk) => void,
    signal: AbortSignal
  ): Promise<{ finalText: string; toolCalls: any[] }> {
    const body: any = {
      model: this.model,
      messages: messages.map((m) => {
        if (m.role === 'tool') {
          return {
            role: 'tool',
            content: m.content,
            tool_call_id: m.toolCallId,
          };
        }
        if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
          return {
            role: 'assistant',
            content: m.content,
            tool_calls: m.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
            })),
          };
        }
        return { role: m.role, content: m.content };
      }),
      temperature: this.temperature,
      max_tokens: this.maxOutputTokens,
      stream: true,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));
      body.tool_choice = 'auto';
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Groq API error ${res.status}: ${text}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('Groq response body is not readable.');
    }

    const decoder = new TextDecoder();
    let finalText = '';
    const toolCalls: any[] = [];
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        const payload = trimmed.slice(6);
        try {
          const parsed = JSON.parse(payload);
          const choice = parsed?.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;
          if (delta?.content) {
            finalText += delta.content;
            onChunk({ textDelta: delta.content });
          }

          const tcDelta = delta?.tool_calls;
          if (tcDelta && tcDelta.length > 0) {
            for (const tc of tcDelta) {
              const existing = toolCalls.find((t) => t.id === tc.id);
              if (existing) {
                if (tc.function?.arguments) {
                  existing.arguments += tc.function.arguments;
                }
              } else {
                toolCalls.push({
                  id: tc.id,
                  name: tc.function?.name || '',
                  arguments: tc.function?.arguments || '{}',
                });
              }
            }
            onChunk({ toolCalls: toolCalls.map((tc) => ({ ...tc })) });
          }

          if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
            onChunk({ done: true });
          }
        } catch {
          // skip malformed JSON chunk
        }
      }
    }

    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer);
        const choice = parsed?.choices?.[0];
        if (choice?.delta?.content) {
          finalText += choice.delta.content;
          onChunk({ textDelta: choice.delta.content });
        }
      } catch {
        // ignore
      }
    }

    return {
      finalText,
      toolCalls: toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: JSON.parse(tc.arguments || '{}'),
      })),
    };
  }
}
