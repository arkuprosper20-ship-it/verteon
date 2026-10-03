import * as vscode from 'vscode';
import * as path from 'path';
import { ToolDefinition, ToolExecutionContext, ToolResult } from '../types';
import { isSensitiveFilename, redactSecrets } from '../security/secretDetection';

const DEFAULT_EXCLUDE = '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**,**/.next/**,**/coverage/**}';

function toUri(ctx: ToolExecutionContext, relPath: string): vscode.Uri {
  return vscode.Uri.file(path.isAbsolute(relPath) ? relPath : path.join(ctx.workspaceRoot, relPath));
}

function relativize(ctx: ToolExecutionContext, absPath: string): string {
  return path.relative(ctx.workspaceRoot, absPath) || absPath;
}

export const listFilesTool: ToolDefinition = {
  name: 'listFiles',
  description: 'List files and directories under a given path in the workspace (non-recursive by default).',
  riskTier: 'safe',
  inputSchema: {
    type: 'object',
    properties: {
      dirPath: { type: 'string', description: 'Path relative to workspace root. Use "." for root.' },
      recursive: { type: 'boolean', description: 'If true, list recursively (bounded depth).' },
    },
    required: ['dirPath'],
  },
  async execute(input, ctx): Promise<ToolResult> {
    const dirPath = input.dirPath ?? '.';
    const uri = toUri(ctx, dirPath);
    try {
      if (input.recursive) {
        const pattern = new vscode.RelativePattern(uri.fsPath === ctx.workspaceRoot ? ctx.workspaceRoot : uri.fsPath, '**/*');
        const files = await vscode.workspace.findFiles(pattern, DEFAULT_EXCLUDE, 500);
        const lines = files.map((f) => relativize(ctx, f.fsPath));
        return { ok: true, output: lines.join('\n') || '(empty)' };
      }
      const entries = await vscode.workspace.fs.readDirectory(uri);
      const lines = entries.map(([name, type]) => `${type === vscode.FileType.Directory ? '[dir]  ' : '[file] '}${name}`);
      return { ok: true, output: lines.join('\n') || '(empty)' };
    } catch (err: any) {
      return { ok: false, output: '', error: `Could not list ${dirPath}: ${err.message}` };
    }
  },
};

export const readFileTool: ToolDefinition = {
  name: 'readFile',
  description: 'Read the text contents of a file. Secrets matching known patterns are redacted before being returned.',
  riskTier: 'safe',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Path relative to workspace root.' },
      startLine: { type: 'number', description: 'Optional 1-indexed start line.' },
      endLine: { type: 'number', description: 'Optional 1-indexed end line (inclusive).' },
    },
    required: ['filePath'],
  },
  async execute(input, ctx): Promise<ToolResult> {
    const filePath: string = input.filePath;
    if (isSensitiveFilename(filePath)) {
      return {
        ok: false,
        output: '',
        error: `Refusing to read "${filePath}": it matches a sensitive-file pattern (env/credentials/keys). Ask the user for specific redacted values if needed.`,
      };
    }
    try {
      const uri = toUri(ctx, filePath);
      const bytes = await vscode.workspace.fs.readFile(uri);
      let text = Buffer.from(bytes).toString('utf8');
      if (input.startLine || input.endLine) {
        const lines = text.split('\n');
        const start = Math.max(1, input.startLine ?? 1) - 1;
        const end = Math.min(lines.length, input.endLine ?? lines.length);
        text = lines.slice(start, end).join('\n');
      }
      const { redacted, found } = redactSecrets(text);
      const note = found > 0 ? `\n\n[Note: ${found} value(s) redacted as likely secrets.]` : '';
      return { ok: true, output: redacted + note };
    } catch (err: any) {
      return { ok: false, output: '', error: `Could not read ${filePath}: ${err.message}` };
    }
  },
};

export const writeFileTool: ToolDefinition = {
  name: 'writeFile',
  description: 'Overwrite (or create) a file with the given full contents. Prefer replaceText for small precise edits to existing files.',
  riskTier: 'approval',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Path relative to workspace root.' },
      content: { type: 'string', description: 'Full new file contents.' },
    },
    required: ['filePath', 'content'],
  },
  async execute(input, ctx): Promise<ToolResult> {
    const filePath: string = input.filePath;
    let current = '';
    try {
      const bytes = await vscode.workspace.fs.readFile(toUri(ctx, filePath));
      current = Buffer.from(bytes).toString('utf8');
    } catch {
      // File does not exist yet — there is no "before" to diff against.
    }
    try {
      await ctx.showDiff(filePath, current, input.content, 'Write file');
    } catch {
      // Diff preview is best-effort; the approval card still gates applying.
    }
    const approved = await ctx.requestApproval({
      title: `Write file: ${filePath}`,
      whatWillRun: `Overwrite ${filePath} with ${input.content.length} characters of new content.`,
      why: 'The agent needs to create or fully rewrite this file to complete the task.',
      potentialEffect: 'Any existing content in this file will be replaced. Review the diff, then Approve or Reject.',
      tier: 'approval',
    });
    if (!approved) return { ok: false, output: '', error: 'User rejected the file write.' };
    try {
      const uri = toUri(ctx, filePath);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(input.content, 'utf8'));
      return { ok: true, output: `Wrote ${filePath} (${input.content.length} bytes).` };
    } catch (err: any) {
      return { ok: false, output: '', error: `Could not write ${filePath}: ${err.message}` };
    }
  },
};

export const createFileTool: ToolDefinition = {
  name: 'createFile',
  description: 'Create a new file with given content. Fails if the file already exists.',
  riskTier: 'approval',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Path relative to workspace root.' },
      content: { type: 'string', description: 'Initial file contents.' },
    },
    required: ['filePath', 'content'],
  },
  async execute(input, ctx): Promise<ToolResult> {
    const filePath: string = input.filePath;
    const uri = toUri(ctx, filePath);
    try {
      await vscode.workspace.fs.stat(uri);
      return { ok: false, output: '', error: `${filePath} already exists. Use writeFile or replaceText to modify it.` };
    } catch {
      // does not exist — good
    }
    try {
      await ctx.showDiff(filePath, '', input.content ?? '', 'Create file');
    } catch {
      // Diff preview is best-effort; the approval card still gates applying.
    }
    const approved = await ctx.requestApproval({
      title: `Create file: ${filePath}`,
      whatWillRun: `Create a new file at ${filePath}.`,
      why: 'The agent needs a new file to complete the task.',
      potentialEffect: 'A new file will be added to the project. Review the diff, then Approve or Reject.',
      tier: 'approval',
    });
    if (!approved) return { ok: false, output: '', error: 'User rejected the file creation.' };
    try {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(input.content ?? '', 'utf8'));
      return { ok: true, output: `Created ${filePath}.` };
    } catch (err: any) {
      return { ok: false, output: '', error: `Could not create ${filePath}: ${err.message}` };
    }
  },
};

export const deleteFileTool: ToolDefinition = {
  name: 'deleteFile',
  description: 'Delete a file from the workspace.',
  riskTier: 'approval',
  inputSchema: {
    type: 'object',
    properties: { filePath: { type: 'string', description: 'Path relative to workspace root.' } },
    required: ['filePath'],
  },
  async execute(input, ctx): Promise<ToolResult> {
    const filePath: string = input.filePath;
    const approved = await ctx.requestApproval({
      title: `Delete file: ${filePath}`,
      whatWillRun: `Delete ${filePath}.`,
      why: 'The agent has determined this file is no longer needed or must be replaced.',
      potentialEffect: 'This file will be permanently removed from disk (recoverable via VS Code local history / git if tracked).',
      tier: 'approval',
    });
    if (!approved) return { ok: false, output: '', error: 'User rejected the file deletion.' };
    try {
      await vscode.workspace.fs.delete(toUri(ctx, filePath), { useTrash: true });
      return { ok: true, output: `Deleted ${filePath} (moved to trash).` };
    } catch (err: any) {
      return { ok: false, output: '', error: `Could not delete ${filePath}: ${err.message}` };
    }
  },
};

export const renameFileTool: ToolDefinition = {
  name: 'renameFile',
  description: 'Rename or move a file within the workspace.',
  riskTier: 'approval',
  inputSchema: {
    type: 'object',
    properties: {
      oldPath: { type: 'string', description: 'Current path relative to workspace root.' },
      newPath: { type: 'string', description: 'New path relative to workspace root.' },
    },
    required: ['oldPath', 'newPath'],
  },
  async execute(input, ctx): Promise<ToolResult> {
    const approved = await ctx.requestApproval({
      title: `Rename: ${input.oldPath} → ${input.newPath}`,
      whatWillRun: `Rename/move ${input.oldPath} to ${input.newPath}.`,
      why: 'Part of a refactor or reorganization requested by the task.',
      potentialEffect: 'Any imports/references to the old path will need updating separately.',
      tier: 'approval',
    });
    if (!approved) return { ok: false, output: '', error: 'User rejected the rename.' };
    try {
      await vscode.workspace.fs.rename(toUri(ctx, input.oldPath), toUri(ctx, input.newPath), { overwrite: false });
      return { ok: true, output: `Renamed ${input.oldPath} to ${input.newPath}.` };
    } catch (err: any) {
      return { ok: false, output: '', error: `Could not rename: ${err.message}` };
    }
  },
};

export const searchFilesTool: ToolDefinition = {
  name: 'searchFiles',
  description: 'Find files by glob pattern, e.g. "**/*.ts" or "src/**/login*".',
  riskTier: 'safe',
  inputSchema: {
    type: 'object',
    properties: { pattern: { type: 'string', description: 'Glob pattern relative to workspace root.' } },
    required: ['pattern'],
  },
  async execute(input, ctx): Promise<ToolResult> {
    try {
      const files = await vscode.workspace.findFiles(input.pattern, DEFAULT_EXCLUDE, 200);
      const lines = files.map((f) => relativize(ctx, f.fsPath));
      return { ok: true, output: lines.join('\n') || '(no matches)' };
    } catch (err: any) {
      return { ok: false, output: '', error: `Search failed: ${err.message}` };
    }
  },
};

export const searchTextTool: ToolDefinition = {
  name: 'searchText',
  description: 'Search file contents for a text or regex query across the workspace (like grep). Returns matching file:line and the line content.',
  riskTier: 'safe',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Text or regex to search for.' },
      isRegex: { type: 'boolean', description: 'Treat query as a regular expression.' },
      globPattern: { type: 'string', description: 'Optional glob to restrict which files are searched, e.g. "src/**/*.ts".' },
      maxResults: { type: 'number', description: 'Max number of matches to return (default 100).' },
    },
    required: ['query'],
  },
  async execute(input, ctx): Promise<ToolResult> {
    const files = await vscode.workspace.findFiles(input.globPattern ?? '**/*', DEFAULT_EXCLUDE, 2000);
    const maxResults = input.maxResults ?? 100;
    const matcher = input.isRegex ? new RegExp(input.query, 'g') : null;
    const results: string[] = [];
    for (const f of files) {
      if (results.length >= maxResults) break;
      let text: string;
      try {
        const bytes = await vscode.workspace.fs.readFile(f);
        text = Buffer.from(bytes).toString('utf8');
      } catch {
        continue;
      }
      const lines = text.split('\n');
      for (let i = 0; i < lines.length && results.length < maxResults; i++) {
        const line = lines[i];
        const hit = matcher ? matcher.test(line) : line.includes(input.query);
        if (matcher) matcher.lastIndex = 0;
        if (hit) {
          results.push(`${relativize(ctx, f.fsPath)}:${i + 1}: ${line.trim().slice(0, 300)}`);
        }
      }
    }
    return { ok: true, output: results.join('\n') || '(no matches)' };
  },
};

export const getFileInfoTool: ToolDefinition = {
  name: 'getFileInfo',
  description: 'Get metadata about a file: size, last modified time, and whether it exists.',
  riskTier: 'safe',
  inputSchema: {
    type: 'object',
    properties: { filePath: { type: 'string', description: 'Path relative to workspace root.' } },
    required: ['filePath'],
  },
  async execute(input, ctx): Promise<ToolResult> {
    try {
      const stat = await vscode.workspace.fs.stat(toUri(ctx, input.filePath));
      const type = stat.type === vscode.FileType.Directory ? 'directory' : 'file';
      return {
        ok: true,
        output: `type=${type} size=${stat.size} mtime=${new Date(stat.mtime).toISOString()}`,
      };
    } catch {
      return { ok: true, output: 'does not exist' };
    }
  },
};

export const filesystemTools: ToolDefinition[] = [
  listFilesTool,
  readFileTool,
  writeFileTool,
  createFileTool,
  deleteFileTool,
  renameFileTool,
  searchFilesTool,
  searchTextTool,
  getFileInfoTool,
];
