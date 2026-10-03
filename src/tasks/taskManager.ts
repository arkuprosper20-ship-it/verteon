import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  agentId?: string;
  createdAt: number;
  updatedAt: number;
  result?: string;
}

export interface CreateTaskOptions {
  title: string;
  description?: string;
  priority?: TaskPriority;
  agentId?: string;
}

export class TaskManager {
  private static readonly STORAGE_KEY = 'aiAgent.taskManager.tasks';
  private static readonly FALLBACK_PATH = path.join(__dirname, '..', '..', '.ai-agent', 'tasks.json');
  private static instance: TaskManager;
  private readonly tasks: Map<string, Task> = new Map();
  private readonly context: vscode.ExtensionContext;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.load();
  }

  static getInstance(context?: vscode.ExtensionContext): TaskManager {
    if (!TaskManager.instance) {
      if (!context) throw new Error('TaskManager not initialized');
      TaskManager.instance = new TaskManager(context);
    }
    return TaskManager.instance;
  }

  private storagePath(): string {
    try {
      return path.join(this.context.globalStorageUri.fsPath, 'tasks.json');
    } catch {
      return TaskManager.FALLBACK_PATH;
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
      const data = JSON.parse(raw) as Task[];
      if (Array.isArray(data)) {
        for (const task of data) {
          this.tasks.set(task.id, task);
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
      const data = Array.from(this.tasks.values());
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // ignore storage failures
    }
  }

  list(filter?: { agentId?: string; status?: TaskStatus }): Task[] {
    let items = Array.from(this.tasks.values());
    if (filter?.agentId) {
      items = items.filter((t) => t.agentId === filter.agentId);
    }
    if (filter?.status) {
      items = items.filter((t) => t.status === filter.status);
    }
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  create(options: CreateTaskOptions): Task {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();
    const task: Task = {
      id,
      title: options.title,
      description: options.description,
      status: 'pending',
      priority: options.priority || 'medium',
      agentId: options.agentId,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(id, task);
    this.persist();
    return task;
  }

  update(id: string, patch: Partial<Pick<Task, 'status' | 'result' | 'title' | 'description' | 'priority' | 'agentId'>>): Task | undefined {
    const existing = this.tasks.get(id);
    if (!existing) return undefined;
    const updated: Task = {
      ...existing,
      ...patch,
      updatedAt: Date.now(),
    };
    this.tasks.set(id, updated);
    this.persist();
    return updated;
  }

  remove(id: string): boolean {
    const deleted = this.tasks.delete(id);
    if (deleted) this.persist();
    return deleted;
  }
}
