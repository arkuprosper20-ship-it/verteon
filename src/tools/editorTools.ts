import * as vscode from 'vscode';
import * as path from 'path';
import { ToolDefinition, ToolExecutionContext, ToolResult } from '../types';

function toUri(ctx: ToolExecutionContext, relPath: string): vscode.Uri {
  return vscode.Uri.file(path.isAbsolute(relPath) ? relPath : path.join(ctx.workspaceRoot, relPath));
}

export const getActiveFileTool: ToolDefinition = {
  name: 'getActiveFile',
  description: 'Get the path, language, and full text of the file currently open/active in the VS Code editor.',
  riskTier: 'safe',
  inputSchema: { type: 'object', properties: {} },
  async execute(_input, ctx): Promise<ToolResult> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return { ok: true, output: '(no active editor)' };
    const doc = editor.document;
    const rel = path.relative(ctx.workspaceRoot, doc.uri.fsPath);
    return { ok: true, output: `path=${rel}\nlanguage=${doc.languageId}\n---\n${doc.getText()}` };
  },
};

export const getSelectionTool: ToolDefinition = {
  name: 'getSelection',
  description: 'Get the currently selected text in the active editor, with line numbers.',
  riskTier: 'safe',
  inputSchema: { type: 'object', properties: {} },
  async execute(): Promise<ToolResult> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) return { ok: true, output: '(no selection)' };
    const { start, end } = editor.selection;
    const text = editor.document.getText(editor.selection);
    return { ok: true, output: `lines ${start.line + 1}-${end.line + 1}\n---\n${text}` };
  },
};

export const getDiagnosticsTool: ToolDefinition = {
  name: 'getDiagnostics',
  description: 'Get compiler/linter diagnostics (errors, warnings) for a file, or the whole workspace if no path is given.',
  riskTier: 'safe',
  inputSchema: {
    type: 'object',
    properties: { filePath: { type: 'string', description: 'Optional path relative to workspace root.' } },
  },
  async execute(input, ctx): Promise<ToolResult> {
    const lines: string[] = [];
    const collect = (uri: vscode.Uri) => {
      const diags = vscode.languages.getDiagnostics(uri);
      const rel = path.relative(ctx.workspaceRoot, uri.fsPath);
      for (const d of diags) {
        const sev = vscode.DiagnosticSeverity[d.severity];
        lines.push(`${rel}:${d.range.start.line + 1}:${d.range.start.character + 1} [${sev}] ${d.message}`);
      }
    };
    if (input.filePath) {
      collect(toUri(ctx, input.filePath));
    } else {
      for (const [uri] of vscode.languages.getDiagnostics()) collect(uri);
    }
    return { ok: true, output: lines.join('\n') || '(no diagnostics)' };
  },
};

export const replaceTextTool: ToolDefinition = {
  name: 'replaceText',
  description: 'Replace an exact, unique snippet of text within a file with new text. Preferred over writeFile for small precise edits — safer and shows a smaller diff.',
  riskTier: 'approval',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Path relative to workspace root.' },
      oldText: { type: 'string', description: 'Exact existing text to find (must be unique in the file).' },
      newText: { type: 'string', description: 'Replacement text.' },
    },
    required: ['filePath', 'oldText', 'newText'],
  },
  async execute(input, ctx): Promise<ToolResult> {
    const uri = toUri(ctx, input.filePath);
    let content: string;
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      content = Buffer.from(bytes).toString('utf8');
    } catch (err: any) {
      return { ok: false, output: '', error: `Could not read ${input.filePath}: ${err.message}` };
    }
    const occurrences = content.split(input.oldText).length - 1;
    if (occurrences === 0) {
      return { ok: false, output: '', error: `oldText not found in ${input.filePath}. No changes made.` };
    }
    if (occurrences > 1) {
      return {
        ok: false,
        output: '',
        error: `oldText appears ${occurrences} times in ${input.filePath}; it must be unique. Include more surrounding context.`,
      };
    }
    const newContent = content.replace(input.oldText, input.newText);
    try {
      await ctx.showDiff(input.filePath, content, newContent, 'The agent needs to make a precise, targeted edit to this file.');
    } catch {
      // Diff preview is best-effort; the approval card still gates applying.
    }
    const approved = await ctx.requestApproval({
      title: `Edit: ${input.filePath}`,
      whatWillRun: `Apply an edit to ${input.filePath} (~${content.split('\n').length} lines → ~${newContent.split('\n').length} lines).`,
      why: 'The agent needs to make a precise, targeted edit to this file.',
      potentialEffect: 'The file content will change. Use "Apply" to confirm, or "Reject" to cancel.',
      tier: 'approval',
    });
    if (!approved) return { ok: false, output: '', error: 'User rejected the edit.' };
    await vscode.workspace.fs.writeFile(uri, Buffer.from(newContent, 'utf8'));
    return { ok: true, output: `Replaced text in ${input.filePath}.` };
  },
};

export const insertTextTool: ToolDefinition = {
  name: 'insertText',
  description: 'Insert new text at a specific 1-indexed line in a file (before that line).',
  riskTier: 'approval',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Path relative to workspace root.' },
      line: { type: 'number', description: '1-indexed line number to insert before. Use a number greater than the file length to append.' },
      text: { type: 'string', description: 'Text to insert (should include its own trailing newline if needed).' },
    },
    required: ['filePath', 'line', 'text'],
  },
  async execute(input, ctx): Promise<ToolResult> {
    const uri = toUri(ctx, input.filePath);
    let content: string;
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      content = Buffer.from(bytes).toString('utf8');
    } catch (err: any) {
      return { ok: false, output: '', error: `Could not read ${input.filePath}: ${err.message}` };
    }
    const lines = content.split('\n');
    const idx = Math.max(0, Math.min(lines.length, (input.line ?? lines.length + 1) - 1));
    lines.splice(idx, 0, input.text.replace(/\n$/, ''));
    const newContent = lines.join('\n');
    try {
      await ctx.showDiff(input.filePath, content, newContent, 'The agent needs to add new content to this file.');
    } catch {
      // Diff preview is best-effort; the approval card still gates applying.
    }
    const approved = await ctx.requestApproval({
      title: `Insert into: ${input.filePath}`,
      whatWillRun: `Insert text at line ${input.line} of ${input.filePath}.`,
      why: 'The agent needs to add new content to this file.',
      potentialEffect: 'The file will grow by the inserted lines; nothing existing is removed.',
      tier: 'approval',
    });
    if (!approved) return { ok: false, output: '', error: 'User rejected the insertion.' };
    await vscode.workspace.fs.writeFile(uri, Buffer.from(newContent, 'utf8'));
    return { ok: true, output: `Inserted text at line ${input.line} of ${input.filePath}.` };
  },
};

export const applyEditTool: ToolDefinition = {
  name: 'applyEdit',
  description: 'Apply an edit directly to the currently open editor document (uses VS Code WorkspaceEdit, supports live undo).',
  riskTier: 'approval',
  inputSchema: {
    type: 'object',
    properties: {
      startLine: { type: 'number', description: '1-indexed start line of the range to replace.' },
      endLine: { type: 'number', description: '1-indexed end line of the range to replace (inclusive).' },
      newText: { type: 'string', description: 'Replacement text for that line range.' },
    },
    required: ['startLine', 'endLine', 'newText'],
  },
  async execute(input, ctx): Promise<ToolResult> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return { ok: false, output: '', error: 'No active editor to edit.' };
    const approved = await ctx.requestApproval({
      title: `Edit active file: ${path.basename(editor.document.uri.fsPath)}`,
      whatWillRun: `Replace lines ${input.startLine}-${input.endLine} in the active editor.`,
      why: 'The agent needs to modify the file currently open in the editor.',
      potentialEffect: 'This uses a normal editable edit — undo with Ctrl/Cmd+Z if unwanted.',
      tier: 'approval',
    });
    if (!approved) return { ok: false, output: '', error: 'User rejected the edit.' };
    const start = new vscode.Position(Math.max(0, input.startLine - 1), 0);
    const endLineIdx = Math.min(editor.document.lineCount - 1, input.endLine - 1);
    const end = editor.document.lineAt(endLineIdx).range.end;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(editor.document.uri, new vscode.Range(start, end), input.newText);
    const applied = await vscode.workspace.applyEdit(edit);
    return applied
      ? { ok: true, output: `Applied edit to lines ${input.startLine}-${input.endLine}.` }
      : { ok: false, output: '', error: 'VS Code rejected the edit (document may have changed).' };
  },
};

export const editorTools: ToolDefinition[] = [
  getActiveFileTool,
  getSelectionTool,
  getDiagnosticsTool,
  replaceTextTool,
  insertTextTool,
  applyEditTool,
];
