import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

function loadEnvFile(filePath: string): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        env[key] = value;
      }
    }
  } catch {
    // ignore missing env file
  }
  return env;
}

let cachedSecretGroqKey = '';

export function setCachedSecretGroqKey(key: string): void {
  cachedSecretGroqKey = key;
}

function getGroqApiKey(): string {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const candidates: string[] = [];
  if (workspaceRoot) {
    candidates.push(path.join(workspaceRoot, '.env'));
  }
  candidates.push(path.join(__dirname, '..', '..', '.env'));

  for (const filePath of candidates) {
    const env = loadEnvFile(filePath);
    const value = env['GROQ_API_KEY'];
    if (value && value.length > 0) return value;
  }

  if (cachedSecretGroqKey && cachedSecretGroqKey.length > 0) return cachedSecretGroqKey;

  return process.env.GROQ_API_KEY ?? '';
}

export interface AgentConfig {
  provider: 'ollama' | 'groq';
  ollamaUrl: string;
  groqApiKey: string;
  model: string;
  temperature: number;
  maxContext: number;
  maxOutputTokens: number;
  commandTimeout: number;
  maxAgentIterations: number;
  requireCommandApproval: boolean;
  requireFileApproval: boolean;
  enableProjectMemory: boolean;
  enableGitTools: boolean;
  debugLogging: boolean;
}

export function getConfig(): AgentConfig {
  const c = vscode.workspace.getConfiguration('agent');
  const groqApiKey = c.get('groq.apiKey', '') || getGroqApiKey();
  return {
    provider: c.get('provider', 'ollama'),
    ollamaUrl: c.get('ollama.url', 'http://localhost:11434'),
    groqApiKey,
    model: c.get('model', 'qwen2.5-coder:7b'),
    temperature: c.get('temperature', 0.2),
    maxContext: c.get('maxContext', 8192),
    maxOutputTokens: c.get('maxOutputTokens', 2048),
    commandTimeout: c.get('commandTimeout', 120000),
    maxAgentIterations: c.get('maxAgentIterations', 5),
    requireCommandApproval: c.get('requireCommandApproval', true),
    requireFileApproval: c.get('requireFileApproval', true),
    enableProjectMemory: c.get('enableProjectMemory', true),
    enableGitTools: c.get('enableGitTools', true),
    debugLogging: c.get('debugLogging', false),
  };
}
