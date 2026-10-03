import * as vscode from 'vscode';
import * as path from 'path';
import { ToolDefinition, ToolExecutionContext, ToolResult } from '../types';
import { runCommandTool } from './terminalTools';

async function readPkgScripts(ctx: ToolExecutionContext): Promise<Record<string, string>> {
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(path.join(ctx.workspaceRoot, 'package.json')));
    const pkg = JSON.parse(Buffer.from(bytes).toString('utf8'));
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

function pickScript(scripts: Record<string, string>, candidates: string[]): string | null {
  for (const c of candidates) {
    if (scripts[c]) return c;
  }
  return null;
}

async function runNpmScriptOrFallback(
  ctx: ToolExecutionContext,
  candidates: string[],
  fallbackCommand: string
): Promise<ToolResult> {
  const scripts = await readPkgScripts(ctx);
  const scriptName = pickScript(scripts, candidates);
  const command = scriptName ? `npm run ${scriptName}` : fallbackCommand;
  return runCommandTool.execute({ command }, ctx);
}

export const runTestsTool: ToolDefinition = {
  name: 'runTests',
  description: 'Run the project\'s test suite (auto-detects npm script "test" or falls back to a sensible default per project type).',
  riskTier: 'safe',
  inputSchema: {
    type: 'object',
    properties: { testPathOrPattern: { type: 'string', description: 'Optional specific test file/pattern to run.' } },
  },
  async execute(input, ctx): Promise<ToolResult> {
    const scripts = await readPkgScripts(ctx);
    if (scripts.test) {
      const cmd = input.testPathOrPattern ? `npm test -- ${input.testPathOrPattern}` : 'npm test';
      return runCommandTool.execute({ command: cmd }, ctx);
    }
    // Fallbacks for non-npm projects
    const hasPytest = true; // best-effort; runCommand will report failure clearly if not applicable
    const fallback = input.testPathOrPattern ? `pytest ${input.testPathOrPattern}` : 'pytest';
    return runCommandTool.execute({ command: fallback }, ctx);
  },
};

export const runBuildTool: ToolDefinition = {
  name: 'runBuild',
  description: 'Run the project\'s build (auto-detects npm script "build").',
  riskTier: 'safe',
  inputSchema: { type: 'object', properties: {} },
  async execute(_input, ctx): Promise<ToolResult> {
    return runNpmScriptOrFallback(ctx, ['build'], 'npm run build');
  },
};

export const runLintTool: ToolDefinition = {
  name: 'runLint',
  description: 'Run the project\'s linter (auto-detects npm script "lint").',
  riskTier: 'safe',
  inputSchema: { type: 'object', properties: {} },
  async execute(_input, ctx): Promise<ToolResult> {
    return runNpmScriptOrFallback(ctx, ['lint'], 'npx eslint .');
  },
};

export const testingTools: ToolDefinition[] = [runTestsTool, runBuildTool, runLintTool];

// --- Git tools ---

export const gitStatusTool: ToolDefinition = {
  name: 'gitStatus',
  description: 'Show git status (staged/unstaged/untracked files).',
  riskTier: 'safe',
  inputSchema: { type: 'object', properties: {} },
  async execute(_input, ctx): Promise<ToolResult> {
    return runCommandTool.execute({ command: 'git status --porcelain=v1 -b' }, ctx);
  },
};

export const gitDiffTool: ToolDefinition = {
  name: 'gitDiff',
  description: 'Show git diff of current changes (unstaged by default).',
  riskTier: 'safe',
  inputSchema: {
    type: 'object',
    properties: { staged: { type: 'boolean', description: 'If true, show staged (--cached) diff instead.' } },
  },
  async execute(input, ctx): Promise<ToolResult> {
    const cmd = input.staged ? 'git diff --cached' : 'git diff';
    return runCommandTool.execute({ command: cmd }, ctx);
  },
};

export const gitLogTool: ToolDefinition = {
  name: 'gitLog',
  description: 'Show recent git commit history.',
  riskTier: 'safe',
  inputSchema: { type: 'object', properties: { count: { type: 'number', description: 'Number of commits to show (default 10).' } } },
  async execute(input, ctx): Promise<ToolResult> {
    const count = input.count ?? 10;
    return runCommandTool.execute({ command: `git log -n ${count} --oneline` }, ctx);
  },
};

export const gitTools: ToolDefinition[] = [gitStatusTool, gitDiffTool, gitLogTool];
