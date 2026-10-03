import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChatMessage } from '../types';

export interface ConversationRecord {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  agentId?: string;
}

export class HistoryStore {
  private static readonly FALLBACK_PATH = path.join(__dirname, '..', '..', '.ai-agent', 'history.json');
  private static instance: HistoryStore;
  private readonly conversations: Map<string, ConversationRecord> = new Map();
  private readonly context: vscode.ExtensionContext;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.load();
  }

  static getInstance(context?: vscode.ExtensionContext): HistoryStore {
    if (!HistoryStore.instance) {
      if (!context) throw new Error('HistoryStore not initialized');
      HistoryStore.instance = new HistoryStore(context);
    }
    return HistoryStore.instance;
  }

  private storagePath(): string {
    try {
      return path.join(this.context.globalStorageUri.fsPath, 'history.json');
    } catch {
      return HistoryStore.FALLBACK_PATH;
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
      const data = JSON.parse(raw) as ConversationRecord[];
      if (Array.isArray(data)) {
        for (const conv of data) {
          this.conversations.set(conv.id, conv);
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
      const data = Array.from(this.conversations.values());
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // ignore storage failures
    }
  }

  list(agentId?: string): ConversationRecord[] {
    let items = Array.from(this.conversations.values());
    if (agentId) {
      items = items.filter((c) => c.agentId === agentId);
    }
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): ConversationRecord | undefined {
    return this.conversations.get(id);
  }

  create(title: string, messages: ChatMessage[] = [], agentId?: string): ConversationRecord {
    const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();
    const record: ConversationRecord = {
      id,
      title,
      messages,
      createdAt: now,
      updatedAt: now,
      agentId,
    };
    this.conversations.set(id, record);
    this.persist();
    return record;
  }

  update(id: string, patch: Partial<Pick<ConversationRecord, 'title' | 'messages' | 'agentId'>>): ConversationRecord | undefined {
    const existing = this.conversations.get(id);
    if (!existing) return undefined;
    const updated: ConversationRecord = {
      ...existing,
      ...patch,
      updatedAt: Date.now(),
    };
    this.conversations.set(id, updated);
    this.persist();
    return updated;
  }

  appendMessage(id: string, message: ChatMessage): ConversationRecord | undefined {
    const existing = this.conversations.get(id);
    if (!existing) return undefined;
    return this.update(id, {
      messages: [...existing.messages, message],
    });
  }

  remove(id: string): boolean {
    const deleted = this.conversations.delete(id);
    if (deleted) this.persist();
    return deleted;
  }
}
