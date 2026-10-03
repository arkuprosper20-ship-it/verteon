import * as vscode from 'vscode';
import * as path from 'path';
import { ChatMessage } from '../types';
import { ProjectMemory } from '../memory/memoryStore';

export interface ActiveEditorContext {
  path: string;
  language: string;
  selection?: string;
  surrounding?: string;
  diagnostics?: string;
}

export function getActiveEditorContext(workspaceRoot: string): ActiveEditorContext | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;
  const doc = editor.document;
  const rel = path.relative(workspaceRoot, doc.uri.fsPath);
  const selection = !editor.selection.isEmpty ? doc.getText(editor.selection) : undefined;

  let surrounding: string | undefined;
  if (!selection) {
    const line = editor.selection.active.line;
    const startLine = Math.max(0, line - 20);
    const endLine = Math.min(doc.lineCount - 1, line + 20);
    surrounding = doc.getText(new vscode.Range(startLine, 0, endLine, doc.lineAt(endLine).text.length));
  }

  const diags = vscode.languages.getDiagnostics(doc.uri);
  const diagnostics =
    diags.length > 0
      ? diags.map((d) => `${d.range.start.line + 1}: [${vscode.DiagnosticSeverity[d.severity]}] ${d.message}`).join('\n')
      : undefined;

  return { path: rel, language: doc.languageId, selection, surrounding, diagnostics };
}

const SYSTEM_PROMPT_BASE = `You are a local AI coding agent running inside VS Code. You have access to tools to inspect, read, search, edit, and test the user's real project on disk, and to run terminal commands.

Behave like a real coding agent, not a chatbot:
- When a task requires inspecting the project, editing files, or running commands, use tools to actually do it rather than only describing what should be done.
- Start unfamiliar tasks by calling inspectWorkspace, then read only the specific files you need — never assume file contents.
- Prefer replaceText for small precise edits over rewriting whole files with writeFile.
- After making changes that could break something, run the relevant tests/build/lint tool and read the output. If it fails, diagnose the cause from the output, fix it, and retry, up to the configured iteration limit.
- Some tools require user approval before they run (installing packages, deleting files, editing files, commands that change repository state). If a tool call is rejected, explain what you wanted to do and why, and propose an alternative or ask the user how to proceed — do not repeat the same rejected call.
- Never fabricate command output, file contents, or test results — only report what tools actually returned.
- Keep prose responses concise; let tool activity speak for the step-by-step work.
- Do not attempt to read or print files that look like secrets/credentials (.env, private keys, etc).`;

export function buildSystemPrompt(
  projectSummary: string | undefined,
  memory: ProjectMemory | undefined,
  editorCtx: ActiveEditorContext | null
): string {
  const parts = [SYSTEM_PROMPT_BASE];
  if (projectSummary) {
    parts.push(`\n## Project summary\n${projectSummary}`);
  }
  if (memory && (memory.notes.length > 0 || memory.commands.length > 0)) {
    parts.push(
      `\n## Remembered project notes\n${memory.notes.map((n) => `- ${n}`).join('\n')}` +
        (memory.commands.length ? `\n\nKnown useful commands:\n${memory.commands.map((c) => `- ${c}`).join('\n')}` : '')
    );
  }
  if (editorCtx) {
    parts.push(
      `\n## Active editor\npath: ${editorCtx.path}\nlanguage: ${editorCtx.language}` +
        (editorCtx.selection ? `\nselection:\n${editorCtx.selection}` : '') +
        (editorCtx.diagnostics ? `\ndiagnostics:\n${editorCtx.diagnostics}` : '')
    );
  }
  return parts.join('\n');
}

/** Trim conversation history to keep context bounded: keep system + most recent N turns. */
export function trimHistory(messages: ChatMessage[], maxTurns = 24): ChatMessage[] {
  const system = messages.filter((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  const trimmed = rest.slice(-maxTurns);
  return [...system, ...trimmed];
}
