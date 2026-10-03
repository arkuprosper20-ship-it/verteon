import * as vscode from 'vscode';
import * as path from 'path';
import { ToolDefinition, ToolExecutionContext, ToolResult } from '../types';

async function fileExists(ctx: ToolExecutionContext, relPath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(path.join(ctx.workspaceRoot, relPath)));
    return true;
  } catch {
    return false;
  }
}

async function readIfExists(ctx: ToolExecutionContext, relPath: string): Promise<string | null> {
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(path.join(ctx.workspaceRoot, relPath)));
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return null;
  }
}

export async function detectProjectSummary(ctx: ToolExecutionContext): Promise<string> {
  const lines: string[] = [];
  lines.push(`workspaceRoot: ${ctx.workspaceRoot}`);

  const pkgJsonText = await readIfExists(ctx, 'package.json');
  let pkgJson: any = null;
  if (pkgJsonText) {
    try {
      pkgJson = JSON.parse(pkgJsonText);
    } catch {
      /* ignore parse errors */
    }
  }

  // package manager
  let pm = 'unknown';
  if (await fileExists(ctx, 'pnpm-lock.yaml')) pm = 'pnpm';
  else if (await fileExists(ctx, 'yarn.lock')) pm = 'yarn';
  else if (await fileExists(ctx, 'package-lock.json')) pm = 'npm';
  else if (await fileExists(ctx, 'bun.lockb')) pm = 'bun';
  else if (await fileExists(ctx, 'requirements.txt')) pm = 'pip';
  else if (await fileExists(ctx, 'pyproject.toml')) pm = 'poetry/pip';
  else if (await fileExists(ctx, 'Cargo.toml')) pm = 'cargo';
  else if (await fileExists(ctx, 'go.mod')) pm = 'go modules';
  lines.push(`packageManager: ${pm}`);

  // language / framework
  const deps = pkgJson ? { ...pkgJson.dependencies, ...pkgJson.devDependencies } : {};
  const frameworks: string[] = [];
  if (deps.next) frameworks.push('Next.js');
  if (deps.react && !deps.next) frameworks.push('React');
  if (deps.vue) frameworks.push('Vue');
  if (deps['@angular/core']) frameworks.push('Angular');
  if (deps.svelte) frameworks.push('Svelte');
  if (deps.express) frameworks.push('Express');
  if (deps.fastify) frameworks.push('Fastify');
  if (deps.vite) frameworks.push('Vite');
  if (await fileExists(ctx, 'manage.py')) frameworks.push('Django');
  if (await fileExists(ctx, 'requirements.txt')) frameworks.push('Python project');
  lines.push(`frameworks: ${frameworks.join(', ') || 'unknown'}`);

  const language = deps.typescript || (await fileExists(ctx, 'tsconfig.json')) ? 'TypeScript' : pkgJson ? 'JavaScript' : 'unknown';
  lines.push(`language: ${language}`);

  const configFiles = ['tsconfig.json', 'vite.config.ts', 'vite.config.js', 'next.config.js', 'next.config.mjs', '.eslintrc.json', '.eslintrc.js', 'jest.config.js', 'vitest.config.ts', 'pyproject.toml', 'Cargo.toml', 'go.mod'];
  const present: string[] = [];
  for (const f of configFiles) {
    if (await fileExists(ctx, f)) present.push(f);
  }
  lines.push(`configFiles: ${present.join(', ') || '(none detected)'}`);

  if (pkgJson?.scripts) {
    lines.push(`npmScripts: ${Object.keys(pkgJson.scripts).join(', ')}`);
  }

  const hasGit = await fileExists(ctx, '.git');
  lines.push(`gitRepository: ${hasGit}`);

  const testDirs = ['test', 'tests', '__tests__', 'src/__tests__', 'spec'];
  const foundTestDirs: string[] = [];
  for (const d of testDirs) {
    if (await fileExists(ctx, d)) foundTestDirs.push(d);
  }
  lines.push(`testDirectories: ${foundTestDirs.join(', ') || '(none detected — tests may be colocated)'}`);

  return lines.join('\n');
}

export const inspectWorkspaceTool: ToolDefinition = {
  name: 'inspectWorkspace',
  description: 'Produce a compact summary of the project: language, framework, package manager, config files, npm scripts, and whether it is a git repo. Call this first for any new task.',
  riskTier: 'safe',
  inputSchema: { type: 'object', properties: {} },
  async execute(_input, ctx): Promise<ToolResult> {
    const summary = await detectProjectSummary(ctx);
    return { ok: true, output: summary };
  },
};

export const detectProjectTypeTool: ToolDefinition = {
  name: 'detectProjectType',
  description: 'Detect the primary language/runtime of the project (e.g. Node/TypeScript, Python, Rust, Go).',
  riskTier: 'safe',
  inputSchema: { type: 'object', properties: {} },
  async execute(_input, ctx): Promise<ToolResult> {
    const summary = await detectProjectSummary(ctx);
    const languageLine = summary.split('\n').find((l) => l.startsWith('language:'));
    return { ok: true, output: languageLine ?? 'unknown' };
  },
};

export const detectPackageManagerTool: ToolDefinition = {
  name: 'detectPackageManager',
  description: 'Detect which package manager the project uses (npm, yarn, pnpm, bun, pip, cargo, go modules).',
  riskTier: 'safe',
  inputSchema: { type: 'object', properties: {} },
  async execute(_input, ctx): Promise<ToolResult> {
    const summary = await detectProjectSummary(ctx);
    const line = summary.split('\n').find((l) => l.startsWith('packageManager:'));
    return { ok: true, output: line ?? 'unknown' };
  },
};

export const detectFrameworkTool: ToolDefinition = {
  name: 'detectFramework',
  description: 'Detect the web/app framework(s) in use based on dependencies and config files.',
  riskTier: 'safe',
  inputSchema: { type: 'object', properties: {} },
  async execute(_input, ctx): Promise<ToolResult> {
    const summary = await detectProjectSummary(ctx);
    const line = summary.split('\n').find((l) => l.startsWith('frameworks:'));
    return { ok: true, output: line ?? 'unknown' };
  },
};

export const inspectPackageJsonTool: ToolDefinition = {
  name: 'inspectPackageJson',
  description: 'Return the parsed contents of package.json (scripts, dependencies, devDependencies) if present.',
  riskTier: 'safe',
  inputSchema: { type: 'object', properties: {} },
  async execute(_input, ctx): Promise<ToolResult> {
    const text = await readIfExists(ctx, 'package.json');
    if (!text) return { ok: false, output: '', error: 'No package.json found at workspace root.' };
    return { ok: true, output: text };
  },
};

export const inspectGitStatusTool: ToolDefinition = {
  name: 'inspectGitStatus',
  description: 'Quick check of whether this workspace is a git repository (delegates to gitStatus tool for full status).',
  riskTier: 'safe',
  inputSchema: { type: 'object', properties: {} },
  async execute(_input, ctx): Promise<ToolResult> {
    const isRepo = await fileExists(ctx, '.git');
    return { ok: true, output: isRepo ? 'This is a git repository. Use gitStatus/gitDiff/gitLog for details.' : 'Not a git repository.' };
  },
};

export const projectTools: ToolDefinition[] = [
  inspectWorkspaceTool,
  detectProjectTypeTool,
  detectPackageManagerTool,
  detectFrameworkTool,
  inspectPackageJsonTool,
  inspectGitStatusTool,
];
