import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { ToolDefinition, ToolExecutionContext, ToolResult } from '../types';
import { classifyCommand } from '../security/commandSafety';
import { getConfig } from '../config/configuration';

interface RunningProcess {
  proc: ChildProcess;
  output: string[];
}

const runningProcesses = new Map<string, RunningProcess>();
let processCounter = 0;

function shellFor(command: string): { cmd: string; args: string[] } {
  if (process.platform === 'win32') {
    // Prefer PowerShell if available conceptually; cmd.exe is always present and simplest to invoke reliably.
    return { cmd: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', command] };
  }
  const shell = process.env.SHELL && process.env.SHELL.length > 0 ? process.env.SHELL : '/bin/sh';
  return { cmd: shell, args: ['-c', command] };
}

async function runOnce(
  command: string,
  cwd: string,
  timeoutMs: number,
  emitActivity: (line: string) => void
): Promise<ToolResult> {
  const { cmd, args } = shellFor(command);
  return new Promise((resolve) => {
    const start = Date.now();
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(cmd, args, { cwd, env: process.env });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({
        ok: false,
        output: truncate(stdout + stderr),
        error: `Command timed out after ${timeoutMs}ms and was killed: ${command}`,
      });
    }, timeoutMs);

    child.stdout?.on('data', (d) => {
      const s = d.toString();
      stdout += s;
      emitActivity(s);
    });
    child.stderr?.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      emitActivity(s);
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, output: truncate(stdout + stderr), error: `Failed to start command: ${err.message}` });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const duration = Date.now() - start;
      resolve({
        ok: code === 0,
        output: `$ ${command}\n(exit code ${code}, ${duration}ms)\n${truncate(stdout + stderr)}`,
        data: { exitCode: code, durationMs: duration },
      });
    });
  });
}

function truncate(s: string, max = 8000): string {
  if (s.length <= max) return s;
  const head = s.slice(0, max / 2);
  const tail = s.slice(-max / 2);
  return `${head}\n...[truncated ${s.length - max} chars]...\n${tail}`;
}

async function classifyAndApprove(command: string, ctx: ToolExecutionContext): Promise<{ allowed: boolean; error?: string }> {
  const { tier, reason } = classifyCommand(command);
  if (tier === 'blocked') {
    return { allowed: false, error: `Blocked: "${command}" — ${reason} This command will not be run under any circumstances.` };
  }
  const config = getConfig();
  if (tier === 'approval' && config.requireCommandApproval) {
    const approved = await ctx.requestApproval({
      title: 'Run command',
      whatWillRun: command,
      why: reason,
      potentialEffect: 'This command can modify files, dependencies, or repository state.',
      tier: 'approval',
    });
    if (!approved) return { allowed: false, error: 'User rejected running this command.' };
  }
  return { allowed: true };
}

export const runCommandTool: ToolDefinition = {
  name: 'runCommand',
  description:
    'Run a shell command in the workspace root and wait for it to finish (with a timeout). Automatically uses the right shell for the current OS. Safe read-only commands run immediately; commands that modify files/dependencies/repo state require user approval; destructive commands are blocked.',
  riskTier: 'approval',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to run, e.g. "npm test".' },
      timeoutMs: { type: 'number', description: 'Optional override for the command timeout in milliseconds.' },
    },
    required: ['command'],
  },
  async execute(input, ctx): Promise<ToolResult> {
    const gate = await classifyAndApprove(input.command, ctx);
    if (!gate.allowed) return { ok: false, output: '', error: gate.error };
    const config = getConfig();
    const timeoutMs = input.timeoutMs ?? config.commandTimeout;
    ctx.emitActivity({ kind: 'command_output', text: `$ ${input.command}` });
    const result = await runOnce(input.command, ctx.workspaceRoot, timeoutMs, (line) =>
      ctx.emitActivity({ kind: 'command_output', text: line })
    );
    return result;
  },
};

// Alias tool name used by some agent prompts; identical behavior to runCommand.
export const runCommandAndWaitTool: ToolDefinition = {
  ...runCommandTool,
  name: 'runCommandAndWait',
  description: 'Alias of runCommand: run a shell command and wait for completion.',
};

export const startProcessTool: ToolDefinition = {
  name: 'startProcess',
  description: 'Start a long-running background process (e.g. a dev server) without waiting for it to exit. Returns a processId to check output or stop it later.',
  riskTier: 'approval',
  inputSchema: {
    type: 'object',
    properties: { command: { type: 'string', description: 'The shell command to start, e.g. "npm run dev".' } },
    required: ['command'],
  },
  async execute(input, ctx): Promise<ToolResult> {
    const gate = await classifyAndApprove(input.command, ctx);
    if (!gate.allowed) return { ok: false, output: '', error: gate.error };
    const { cmd, args } = shellFor(input.command);
    const child = spawn(cmd, args, { cwd: ctx.workspaceRoot, env: process.env });
    const id = `proc_${++processCounter}`;
    const record: RunningProcess = { proc: child, output: [] };
    runningProcesses.set(id, record);
    child.stdout?.on('data', (d) => record.output.push(d.toString()));
    child.stderr?.on('data', (d) => record.output.push(d.toString()));
    child.on('close', (code) => record.output.push(`\n[process exited with code ${code}]`));
    return { ok: true, output: `Started background process ${id}: ${input.command}`, data: { processId: id } };
  },
};

export const stopProcessTool: ToolDefinition = {
  name: 'stopProcess',
  description: 'Stop a background process previously started with startProcess.',
  riskTier: 'safe',
  inputSchema: {
    type: 'object',
    properties: { processId: { type: 'string', description: 'The processId returned by startProcess.' } },
    required: ['processId'],
  },
  async execute(input): Promise<ToolResult> {
    const record = runningProcesses.get(input.processId);
    if (!record) return { ok: false, output: '', error: `No running process with id ${input.processId}.` };
    record.proc.kill();
    runningProcesses.delete(input.processId);
    return { ok: true, output: `Stopped process ${input.processId}.` };
  },
};

export const getProcessOutputTool: ToolDefinition = {
  name: 'getProcessOutput',
  description: 'Get accumulated stdout/stderr output for a background process started with startProcess.',
  riskTier: 'safe',
  inputSchema: {
    type: 'object',
    properties: { processId: { type: 'string', description: 'The processId returned by startProcess.' } },
    required: ['processId'],
  },
  async execute(input): Promise<ToolResult> {
    const record = runningProcesses.get(input.processId);
    if (!record) return { ok: false, output: '', error: `No running process with id ${input.processId}.` };
    return { ok: true, output: truncate(record.output.join('')) };
  },
};

export function killAllProcesses() {
  for (const [, record] of runningProcesses) {
    try {
      record.proc.kill();
    } catch {
      /* ignore */
    }
  }
  runningProcesses.clear();
}

export const terminalTools: ToolDefinition[] = [
  runCommandTool,
  runCommandAndWaitTool,
  startProcessTool,
  stopProcessTool,
  getProcessOutputTool,
];
