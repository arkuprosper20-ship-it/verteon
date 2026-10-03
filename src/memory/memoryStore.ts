import * as vscode from 'vscode';

export interface ProjectMemory {
  notes: string[];
  commands: string[];
  updatedAt: string;
}

const MEMORY_KEY = 'aiAgent.projectMemory';

export class MemoryStore {
  constructor(private context: vscode.ExtensionContext) {}

  get(): ProjectMemory {
    return (
      this.context.workspaceState.get<ProjectMemory>(MEMORY_KEY) ?? { notes: [], commands: [], updatedAt: '' }
    );
  }

  async addNote(note: string): Promise<void> {
    const mem = this.get();
    if (!mem.notes.includes(note)) {
      mem.notes.push(note);
      if (mem.notes.length > 50) mem.notes.shift();
    }
    mem.updatedAt = new Date().toISOString();
    await this.context.workspaceState.update(MEMORY_KEY, mem);
  }

  async addCommand(command: string): Promise<void> {
    const mem = this.get();
    if (!mem.commands.includes(command)) {
      mem.commands.push(command);
      if (mem.commands.length > 30) mem.commands.shift();
    }
    mem.updatedAt = new Date().toISOString();
    await this.context.workspaceState.update(MEMORY_KEY, mem);
  }

  async clear(): Promise<void> {
    await this.context.workspaceState.update(MEMORY_KEY, undefined);
  }
}
