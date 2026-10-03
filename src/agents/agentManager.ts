import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface AgentSession {
  id: string;
  name: string;
  provider: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  settings: Record<string, any>;
}

export interface CreateAgentOptions {
  name?: string;
  provider?: string;
  model?: string;
  settings?: Record<string, any>;
}

export class AgentManager {
  private static readonly STORAGE_KEY = 'aiAgent.agentManager.sessions';
  private static readonly FALLBACK_PATH = path.join(__dirname, '..', '..', '.ai-agent', 'sessions.json');
  private static instance: AgentManager;
  private readonly sessions: Map<string, AgentSession> = new Map();
  private readonly context: vscode.ExtensionContext;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.load();
  }

  static getInstance(context?: vscode.ExtensionContext): AgentManager {
    if (!AgentManager.instance) {
      if (!context) throw new Error('AgentManager not initialized');
      AgentManager.instance = new AgentManager(context);
    }
    return AgentManager.instance;
  }

  private storagePath(): string {
    try {
      return path.join(this.context.globalStorageUri.fsPath, 'sessions.json');
    } catch {
      return AgentManager.FALLBACK_PATH;
    }
  }

  private ensureDir(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private load(): void {
    try {
      const filePath = this.storagePath();
      if (!fs.existsSync(filePath)) return;
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw) as AgentSession[];
      if (Array.isArray(data)) {
        for (const session of data) {
          this.sessions.set(session.id, session);
        }
      }
    } catch {
      // ignore corrupt storage
    }
  }

  private persist(): void {
    try {
      const filePath = this.storagePath();
      this.ensureDir(filePath);
      const data = Array.from(this.sessions.values());
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // ignore storage failures
    }
  }

  list(): AgentSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): AgentSession | undefined {
    return this.sessions.get(id);
  }

  create(options: CreateAgentOptions = {}): AgentSession {
    const id = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();
    const session: AgentSession = {
      id,
      name: options.name || `Agent ${this.sessions.size + 1}`,
      provider: options.provider || 'ollama',
      model: options.model || '',
      createdAt: now,
      updatedAt: now,
      settings: options.settings || {},
    };
    this.sessions.set(id, session);
    this.persist();
    return session;
  }

  update(id: string, patch: Partial<Pick<AgentSession, 'name' | 'provider' | 'model' | 'settings'>>): AgentSession | undefined {
    const existing = this.sessions.get(id);
    if (!existing) return undefined;
    const updated: AgentSession = {
      ...existing,
      ...patch,
      updatedAt: Date.now(),
    };
    this.sessions.set(id, updated);
    this.persist();
    return updated;
  }

  remove(id: string): boolean {
    const deleted = this.sessions.delete(id);
    if (deleted) this.persist();
    return deleted;
  }
}
