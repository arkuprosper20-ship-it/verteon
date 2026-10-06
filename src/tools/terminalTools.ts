import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { ToolDefinition, ToolExecutionContext, ToolResult, TerminalResult } from '../types';
import { classifyCommand } from '../security/commandSafety';
import { getConfig } from '../config/configuration';
import { redactSecrets } from '../security/secretRedaction';

interface RunningProcess {
  proc: ChildProcess;
  command: string;
  startedAt: number;
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
        output: redactSecrets(`Command timed out after ${timeoutMs}ms and was killed: ${command}`),
        error: `Command timed out after ${timeoutMs}ms and was killed: ${command}`,
        data: {
          terminal: {
            command,
            exitCode: null,
            stdout: truncate(stdout),
            stderr: truncate(stderr),
            duration: Date.now() - start,
            timedOut: true,
            cancelled: false,
          } as TerminalResult,
        },
      });
    }, timeoutMs);

    child.stdout?.on('data', (d) => {
      const s = d.toString();
      stdout += s;
      emitActivity(redactSecrets(s));
    });
    child.stderr?.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      emitActivity(redactSecrets(s));
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        output: redactSecrets(truncate(stdout + stderr)),
        error: `Failed to start command: ${err.message}`,
        data: {
          terminal: {
            command,
            exitCode: null,
            stdout: truncate(stdout),
            stderr: truncate(stderr),
            duration: Date.now() - start,
            timedOut: false,
            cancelled: false,
          } as TerminalResult,
        },
      });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const duration = Date.now() - start;
      resolve({
        ok: code === 0,
        output: redactSecrets(`$ ${command}\n(exit code ${code}, ${duration}ms)\n${truncate(stdout + stderr)}`),
        error: code === 0 ? undefined : `Command exited with code ${code}`,
        data: {
          terminal: {
            command,
            exitCode: code,
            stdout: truncate(stdout),
            stderr: truncate(stderr),
            duration,
            timedOut: false,
            cancelled: false,
          } as TerminalResult,
          exitCode: code,
          durationMs: duration,
        },
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
    properties: {
      command: { type: 'string', description: 'The shell command to start, e.g. "npm run dev".' },
      timeoutMs: { type: 'number', description: 'Optional override for the command timeout in milliseconds.' },
      workingDirectory: { type: 'string', description: 'Optional working directory. Defaults to workspace root.' },
      shell: { type: 'string', description: 'Optional shell override: bash, sh, zsh, powershell, pwsh, cmd.' },
    },
    required: ['command'],
  },
  async execute(input, ctx): Promise<ToolResult> {
    const gate = await classifyAndApprove(input.command, ctx);
    if (!gate.allowed) return { ok: false, output: '', error: gate.error };
    const { cmd, args } = input.shell ? { cmd: input.shell, args: ['-c', input.command] } : shellFor(input.command);
    const cwd = input.workingDirectory || ctx.workspaceRoot;
    const child = spawn(cmd, args, { cwd, env: process.env });
    const id = `proc_${++processCounter}`;
    const record: RunningProcess = { proc: child, command: input.command, startedAt: Date.now(), output: [] };
    runningProcesses.set(id, record);
    child.stdout?.on('data', (d) => record.output.push(redactSecrets(d.toString())));
    child.stderr?.on('data', (d) => record.output.push(redactSecrets(d.toString())));
    child.on('close', (code) => record.output.push(`\n[process exited with code ${code}]`));
    return {
      ok: true,
      output: `Started background process ${id}: ${input.command}`,
      data: {
        processId: id,
        command: input.command,
        workingDirectory: cwd,
        shell: cmd,
        pid: child.pid,
      },
    };
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
    return { ok: true, output: `Stopped process ${input.processId}.`, data: { processId: input.processId, status: 'stopped' } };
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
    return { ok: true, output: redactSecrets(truncate(record.output.join(''))) };
  },
};

export const listProcessesTool: ToolDefinition = {
  name: 'listProcesses',
  description: 'List all background processes currently running.',
  riskTier: 'safe',
  inputSchema: { type: 'object', properties: {} },
  async execute(): Promise<ToolResult> {
    const procs = Array.from(runningProcesses.entries()).map(([id, r]) => ({
      id,
      command: r.command,
      pid: r.proc.pid,
      startedAt: r.startedAt,
      running: !r.proc.killed,
    }));
    return { ok: true, output: JSON.stringify(procs, null, 2), data: { processes: procs } };
  },
};

export const getProcessInfoTool: ToolDefinition = {
  name: 'getProcessInfo',
  description: 'Get detailed information about a specific background process.',
  riskTier: 'safe',
  inputSchema: {
    type: 'object',
    properties: { processId: { type: 'string', description: 'The processId returned by startProcess.' } },
    required: ['processId'],
  },
  async execute(input): Promise<ToolResult> {
    const record = runningProcesses.get(input.processId);
    if (!record) return { ok: false, output: '', error: `No running process with id ${input.processId}.` };
    return {
      ok: true,
      output: JSON.stringify({
        processId: input.processId,
        command: record.command,
        pid: record.proc.pid,
        startedAt: record.startedAt,
        running: !record.proc.killed,
      }, null, 2),
      data: {
        processId: input.processId,
        command: record.command,
        pid: record.proc.pid,
        startedAt: record.startedAt,
        running: !record.proc.killed,
      },
    };
  },
};

export const inspectEnvironmentTool: ToolDefinition = {
  name: 'inspectEnvironment',
  description: 'Inspect the development environment: which runtimes, package managers, and tools are available. Returns availability for node, npm, python, git, docker, etc.',
  riskTier: 'safe',
  inputSchema: { type: 'object', properties: {} },
  async execute(): Promise<ToolResult> {
    const checks: Array<{ name: string; available: boolean; version: string }> = [];
    const commands: Array<[string, string, string]> = [
      ['node', 'node', 'Node.js'],
      ['npm', 'npm', 'npm'],
      ['npx', 'npx', 'npx'],
      ['yarn', 'yarn', 'Yarn'],
      ['pnpm', 'pnpm', 'pnpm'],
      ['bun', 'bun', 'Bun'],
      ['python', 'python', 'Python'],
      ['python3', 'python3', 'Python 3'],
      ['pip', 'pip', 'pip'],
      ['git', 'git', 'Git'],
      ['docker', 'docker', 'Docker'],
      ['go', 'go', 'Go'],
      ['cargo', 'cargo', 'Rust'],
      ['rustc', 'rustc', 'Rust compiler'],
      ['java', 'java', 'Java'],
      ['javac', 'javac', 'Java compiler'],
      ['gcc', 'gcc', 'GCC'],
      ['clang', 'clang', 'Clang'],
      ['ruby', 'ruby', 'Ruby'],
      ['php', 'php', 'PHP'],
      ['dotnet', 'dotnet', '.NET'],
    ];
    for (const [cmd, label, name] of commands) {
      try {
        const result = await runOnce(`${cmd} --version`, process.cwd(), 5000, () => {});
        const version = result.output.trim().split('\n')[0];
        checks.push({ name, available: result.ok, version: result.ok ? version : '' });
      } catch {
        checks.push({ name, available: false, version: '' });
      }
    }
    const available = checks.filter(c => c.available);
    const unavailable = checks.filter(c => !c.available);
    const output = `Environment capabilities\n\nAvailable:\n${available.map(c => `✓ ${c.name}: ${c.version}`).join('\n')}\n\nNot available:\n${unavailable.map(c => `✕ ${c.name}`).join('\n')}`;
    return { ok: true, output, data: { available: available.map(c => c.name), unavailable: unavailable.map(c => c.name), details: checks } };
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
  listProcessesTool,
  getProcessInfoTool,
  inspectEnvironmentTool,
];
