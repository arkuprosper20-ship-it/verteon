import { AIProvider } from '../types';
import { AgentConfig } from '../config/configuration';
import { OllamaProvider } from './ollamaProvider';
import { GroqProvider } from './groqProvider';

/**
 * Adding a new provider later: implement AIProvider (see types.ts) in its own file
 * under src/providers/, add its id to the `agent.provider` enum in package.json,
 * and add a case here. Nothing else in the extension needs to change — the agent
 * loop, tools, and UI all talk to the AIProvider interface only.
 */
export function createProvider(config: AgentConfig): AIProvider {
  switch (config.provider) {
    case 'groq':
      return new GroqProvider({
        apiKey: config.groqApiKey,
        model: config.model,
        temperature: config.temperature,
        maxContext: config.maxContext,
        maxOutputTokens: config.maxOutputTokens,
      });
    case 'ollama':
    default:
      return new OllamaProvider({
        baseUrl: config.ollamaUrl,
        model: config.model,
        temperature: config.temperature,
        numCtx: config.maxContext,
        numPredict: config.maxOutputTokens,
      });
  }
}
