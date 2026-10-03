import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import { ActivityEvent, ApprovalRequest, ChatMessage } from '../types';
import { DiffPreviewService } from './diffPreview';
import { getConfig, setCachedSecretGroqKey } from '../config/configuration';
import { createProvider } from '../providers/providerFactory';
import { buildToolRegistry } from '../tools/toolRegistry';
import { runAgentLoop } from '../agent/agentLoop';
import { buildSystemPrompt, getActiveEditorContext } from '../context/contextManager';
import { detectProjectSummary } from '../tools/projectTools';
import { MemoryStore } from '../memory/memoryStore';
import { logger } from '../logging/logger';
import { killAllProcesses } from '../tools/terminalTools';
import { AgentManager } from '../agents/agentManager';
import { TaskManager } from '../tasks/taskManager';
import { HistoryStore } from '../history/historyStore';

interface PendingApproval {
  resolve: (approved: boolean) => void;
}

interface TerminalEntry {
  command: string;
  output: string;
  ts: number;
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aiAgent.chatView';
  private view?: vscode.WebviewView;
  private history: ChatMessage[] = [];
  private cancellationToken = { isCancelled: false };
  private isRunning = false;
  private pendingApprovals = new Map<string, PendingApproval>();
  private approvalCounter = 0;
  private memory: MemoryStore;
  private readonly diffService: DiffPreviewService;
  private terminalHistory: TerminalEntry[] = [];
  private currentCommand: string | null = null;
  private currentOutput: string[] = [];
  private agentManager: AgentManager;
  private taskManager: TaskManager;
  private historyStore: HistoryStore;

  constructor(private readonly extensionUri: vscode.Uri, private readonly context: vscode.ExtensionContext) {
    this.memory = new MemoryStore(context);
    this.diffService = new DiffPreviewService(context.subscriptions);
    this.agentManager = AgentManager.getInstance(context);
    this.taskManager = TaskManager.getInstance(context);
    this.historyStore = HistoryStore.getInstance(context);
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'ready':
          this.postStatus();
          this.postWorkspaceInfo();
          this.postRecentList();
          break;
        case 'sendMessage':
          await this.handleUserMessage(msg.text);
          break;
        case 'stopAgent':
          this.stopAgent();
          break;
        case 'approvalResponse':
          this.resolveApproval(msg.approvalId, msg.approved);
          break;
        case 'newChat':
          this.history = [];
          this.post({ type: 'cleared' });
          break;
        case 'refreshModels':
          await this.handleRefreshModels();
          break;
        case 'openSettings':
          vscode.commands.executeCommand('workbench.action.openSettings', 'agent.');
          break;
        case 'checkHealth':
          await this.postStatus();
          break;
        case 'getWorkspaceInfo':
          this.postWorkspaceInfo();
          break;
        case 'getFiles':
          await this.handleGetFiles();
          break;
        case 'getTerminalHistory':
          this.post({ type: 'terminalHistory', history: this.terminalHistory.slice(-50) });
          break;
        case 'getGitStatus':
          await this.handleGetGitStatus();
          break;
        case 'getSettings':
          this.postSettings();
          break;
        case 'updateSetting':
          await this.handleUpdateSetting(msg.key, msg.value);
          break;
        case 'switchProvider':
          await this.handleSwitchProvider(msg.provider);
          break;
        case 'saveGroqKey':
          await this.handleSaveGroqKey(msg.key);
          break;
        case 'openFile':
          await this.handleOpenFile(msg.path);
          break;
        case 'copyToClipboard':
          vscode.env.clipboard.writeText(msg.text);
          break;
        case 'rerunCommand':
          await this.handleRerunCommand(msg.command);
          break;
        case 'toggleProviderPanel':
          break;
        case 'openHistory':
          await this.handleOpenHistory(msg.id);
          break;
      }
    });
  }

  private post(msg: any) {
    this.view?.webview.postMessage(msg);
  }

  private async postStatus() {
    const config = getConfig();
    const provider = createProvider(config);
    const health = await provider.healthCheck().catch((e) => ({ ok: false, message: String(e) }));
    this.post({ type: 'status', connected: health.ok, message: health.message, model: config.model, provider: config.provider });
  }

  private async handleRefreshModels() {
    const config = getConfig();
    const provider = createProvider(config);
    try {
      const models = await provider.listModels();
      this.post({ type: 'models', models });
    } catch (err: any) {
      this.post({ type: 'models', models: [], error: err.message ?? String(err) });
    }
  }

  private postWorkspaceInfo() {
    const folders = vscode.workspace.workspaceFolders;
    const root = folders && folders.length > 0 ? folders[0].uri.fsPath : '';
    const name = folders && folders.length > 0 ? folders[0].name : '';
    this.post({ type: 'workspaceInfo', root, name });
  }

  private postRecentList() {
    try {
      const recent = this.historyStore.list().slice(0, 10).map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt,
      }));
      this.post({ type: 'recentList', recent });
    } catch {
      this.post({ type: 'recentList', recent: [] });
    }
  }

  private postSettings() {
    const config = getConfig();
    this.post({
      type: 'settingsData',
      settings: {
        provider: config.provider,
        model: config.model,
        maxAgentIterations: config.maxAgentIterations,
        requireCommandApproval: config.requireCommandApproval,
        requireFileApproval: config.requireFileApproval,
        enableProjectMemory: config.enableProjectMemory,
        groqApiKey: config.groqApiKey ? '••••••••' : '',
      },
    });
  }

  private async handleUpdateSetting(key: string, value: any) {
    const settingMap: Record<string, string> = {
      provider: 'agent.provider',
      model: 'agent.model',
      maxAgentIterations: 'agent.maxAgentIterations',
      requireCommandApproval: 'agent.requireCommandApproval',
      requireFileApproval: 'agent.requireFileApproval',
      enableProjectMemory: 'agent.enableProjectMemory',
    };
    const target = settingMap[key];
    if (!target) return;
    await vscode.workspace.getConfiguration().update(target, value, vscode.ConfigurationTarget.Global);
    this.postSettings();
    if (key === 'provider' || key === 'model') {
      await this.postStatus();
    }
  }

  private async handleSwitchProvider(provider: string) {
    await vscode.workspace.getConfiguration().update('agent.provider', provider, vscode.ConfigurationTarget.Global);
    await this.postStatus();
    this.postSettings();
  }

  private async handleSaveGroqKey(key: string) {
    if (!key || !key.trim()) return;
    try {
      const secretStorage = (this.context as any).secretStorage as { store(key: string, value: string): Promise<void> } | undefined;
      if (secretStorage) {
        await secretStorage.store('agent.groq.apiKey', key.trim());
        setCachedSecretGroqKey(key.trim());
        vscode.window.showInformationMessage('Verteon: Groq API key saved securely.');
      } else {
        await vscode.workspace.getConfiguration().update('agent.groq.apiKey', key.trim(), vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('Verteon: Groq API key saved to settings.');
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to save Groq API key: ${err.message}`);
    }
    await this.postStatus();
  }

  private async handleGetFiles() {
    const root = this.getWorkspaceRoot();
    if (!root) {
      this.post({ type: 'filesList', files: [] });
      return;
    }
    const files: Array<{ name: string; path: string; isDirectory: boolean }> = [];
    const ignore = new Set(['node_modules', '.git', 'out', 'dist', 'build', '.vscode', 'coverage', '__pycache__', '.ai-agent']);
    const walk = async (dir: string, rel: string, depth: number) => {
      if (depth > 3) return;
      try {
        const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
        for (const [name, type] of entries) {
          if (ignore.has(name) || name.startsWith('.')) continue;
          const relPath = rel ? `${rel}/${name}` : name;
          const isDir = type === vscode.FileType.Directory;
          files.push({ name, path: relPath, isDirectory: isDir });
          if (isDir && depth < 2) {
            await walk(path.join(dir, name), relPath, depth + 1);
          }
        }
      } catch {
        // ignore unreadable directories
      }
    };
    await walk(root, '', 0);
    files.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
    this.post({ type: 'filesList', files: files.slice(0, 500) });
  }

  private async handleGetGitStatus() {
    const root = this.getWorkspaceRoot();
    if (!root) {
      this.post({ type: 'gitStatus', status: null });
      return;
    }
    try {
      const output = await this.runGitCommand(root, 'status --porcelain=v1 -b');
      const status = this.parseGitStatus(output);
      this.post({ type: 'gitStatus', status });
    } catch {
      this.post({ type: 'gitStatus', status: null });
    }
  }

  private runGitCommand(cwd: string, args: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args.split(' '), { cwd });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d) => { stdout += d.toString(); });
      child.stderr?.on('data', (d) => { stderr += d.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr || `git exited with code ${code}`));
      });
    });
  }

  private parseGitStatus(output: string): { branch: string; clean: boolean; changes: number; files: Array<{ path: string; status: string }> } | null {
    const lines = output.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return null;
    let branch = 'unknown';
    const files: Array<{ path: string; status: string }> = [];
    for (const line of lines) {
      if (line.startsWith('## ')) {
        const branchPart = line.slice(3).split('...')[0];
        branch = branchPart || 'unknown';
        continue;
      }
      const statusCode = line.slice(0, 2).trim();
      const filePath = line.slice(3).trim();
      let status = 'untracked';
      if (statusCode.includes('M')) status = 'modified';
      else if (statusCode.includes('A')) status = 'added';
      else if (statusCode.includes('D')) status = 'deleted';
      else if (statusCode.includes('?')) status = 'untracked';
      files.push({ path: filePath, status });
    }
    return { branch, clean: files.length === 0, changes: files.length, files };
  }

  private async handleOpenFile(filePath: string) {
    const root = this.getWorkspaceRoot();
    if (!root) return;
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root, filePath)));
      await vscode.window.showTextDocument(doc);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Could not open file: ${err.message}`);
    }
  }

  private async handleRerunCommand(command: string) {
    await this.focus();
    await this.handleUserMessage(`Run this command and show me the output: ${command}`);
  }

  private async handleOpenHistory(id: string) {
    const record = this.historyStore.get(id);
    if (!record) return;
    this.history = record.messages.map((m) => ({ ...m }));
    this.post({ type: 'cleared' });
    for (const msg of this.history) {
      if (msg.role === 'user') {
        this.post({ type: 'userMessage', text: msg.content });
      } else if (msg.role === 'assistant' && msg.content) {
        this.post({ type: 'activity', activity: { kind: 'message', text: msg.content } });
      }
    }
  }

  private trackTerminalActivity(activity: ActivityEvent) {
    if (activity.kind !== 'command_output') return;
    const text = activity.text;
    if (text.startsWith('$ ')) {
      if (this.currentCommand) {
        this.terminalHistory.push({
          command: this.currentCommand,
          output: this.currentOutput.join(''),
          ts: Date.now(),
        });
      }
      this.currentCommand = text.slice(2);
      this.currentOutput = [];
    } else if (this.currentCommand) {
      this.currentOutput.push(text);
    }
  }

  private emitActivityToWebview(activity: ActivityEvent) {
    this.trackTerminalActivity(activity);
    this.post({ type: 'activity', activity });
  }

  public async runSlashCommand(kind: 'explain' | 'fix' | 'refactor' | 'fixErrors' | 'inspect', text?: string) {
    await this.focus();
    const prompts: Record<string, string> = {
      explain: 'Explain the currently selected code.',
      fix: 'Fix the currently selected code (or the active file if nothing is selected).',
      refactor: 'Refactor the currently selected code for clarity and maintainability, preserving behavior.',
      fixErrors: 'Find and fix all current errors/diagnostics in this project. Run relevant checks (build/test/lint) to verify.',
      inspect: 'Inspect this project and give me a concise summary of its structure, framework, and how to run/test it.',
    };
    await this.handleUserMessage(text ?? prompts[kind]);
  }

  public async focus() {
    await vscode.commands.executeCommand('workbench.view.extension.aiAgentContainer');
  }

  private getWorkspaceRoot(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return null;
    return folders[0].uri.fsPath;
  }

  private async handleUserMessage(text: string) {
    if (!text || !text.trim()) return;
    if (this.isRunning) {
      this.post({ type: 'error', text: 'The agent is still working on the previous request. Stop it first or wait.' });
      return;
    }
    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) {
      this.post({ type: 'error', text: 'No workspace folder is open. Open a folder to use the AI agent.' });
      return;
    }

    const config = getConfig();
    const provider = createProvider(config);
    const health = await provider.healthCheck();
    if (!health.ok) {
      this.post({ type: 'error', text: health.message });
      return;
    }

    this.isRunning = true;
    this.cancellationToken = { isCancelled: false };
    this.post({ type: 'userMessage', text });
    this.post({ type: 'agentStart' });

    try {
      const tools = buildToolRegistry(config);
      let projectSummary: string | undefined;
      try {
        projectSummary = await detectProjectSummary({
          workspaceRoot,
          requestApproval: async () => true,
          emitActivity: () => {},
          cancellationToken: this.cancellationToken,
          showDiff: async () => {},
        });
      } catch (e) {
        logger.debug(`Could not build project summary: ${e}`);
      }
      const editorCtx = getActiveEditorContext(workspaceRoot);
      const mem = config.enableProjectMemory ? this.memory.get() : undefined;
      const systemPrompt = buildSystemPrompt(projectSummary, mem, editorCtx);

      if (this.history.length === 0 || this.history[0].role !== 'system') {
        this.history.unshift({ role: 'system', content: systemPrompt });
      } else {
        this.history[0] = { role: 'system', content: systemPrompt };
      }
      this.history.push({ role: 'user', content: text });

      const result = await runAgentLoop(
        this.history,
        {
          provider,
          tools,
          workspaceRoot,
          maxIterations: config.maxAgentIterations,
          requestApproval: config.requireCommandApproval || config.requireFileApproval ? this.requestApproval.bind(this) : async () => true,
          emitActivity: (activity: ActivityEvent) => this.emitActivityToWebview(activity),
          onTextDelta: (delta: string) => this.post({ type: 'textDelta', delta }),
          showDiff: (filePath, before, after, title) =>
            this.diffService.showDiff(workspaceRoot, filePath, before, after, title),
        },
        this.cancellationToken
      );

      this.history = result.history;

      // Save conversation summary to history store
      try {
        const firstUser = this.history.find((m) => m.role === 'user');
        const title = firstUser ? firstUser.content.slice(0, 60) : 'Conversation';
        const existing = this.historyStore.list().find((c) => c.title === title);
        if (!existing) {
          this.historyStore.create(title, this.history);
        } else {
          this.historyStore.update(existing.id, { messages: this.history });
        }
        this.postRecentList();
      } catch (e) {
        logger.debug(`Could not save history: ${e}`);
      }

      if (result.stoppedReason === 'cancelled') {
        this.post({ type: 'agentStopped', reason: 'Stopped by user.' });
      } else if (result.stoppedReason === 'error') {
        this.post({ type: 'agentStopped', reason: 'An error occurred. See the "AI Agent" output channel for details.' });
      } else if (result.stoppedReason === 'max_iterations') {
        this.post({ type: 'agentStopped', reason: `Reached the iteration limit (${config.maxAgentIterations}).` });
      } else {
        this.post({ type: 'agentDone' });
      }

      if (this.currentCommand) {
        this.terminalHistory.push({
          command: this.currentCommand,
          output: this.currentOutput.join(''),
          ts: Date.now(),
        });
        this.currentCommand = null;
        this.currentOutput = [];
      }

      if (config.enableProjectMemory && result.toolsUsed.length > 0) {
        const uniqueCommands = new Set<string>();
        for (const line of result.history) {
          if (line.role === 'tool' && line.content.startsWith('$ ')) {
            uniqueCommands.add(line.content.split('\n')[0].slice(2));
          }
        }
        for (const cmd of uniqueCommands) {
          await this.memory.addCommand(cmd);
        }
      }
    } catch (err: any) {
      logger.error('Agent run failed', err);
      this.post({ type: 'error', text: `Unexpected error: ${err.message ?? err}` });
    } finally {
      this.isRunning = false;
    }
  }

  private requestApproval(request: ApprovalRequest): Promise<boolean> {
    const config = getConfig();
    const isFileOp = /^(Write file|Create file|Delete file|Rename|Edit|Insert into|Edit active file)/.test(request.title);
    const needsApproval = isFileOp ? config.requireFileApproval : config.requireCommandApproval;
    if (!needsApproval && request.tier !== 'blocked') {
      return Promise.resolve(true);
    }
    const approvalId = `approval_${++this.approvalCounter}`;
    this.post({ type: 'approvalRequest', approvalId, request });
    return new Promise<boolean>((resolve) => {
      this.pendingApprovals.set(approvalId, { resolve });
    });
  }

  private resolveApproval(approvalId: string, approved: boolean) {
    const pending = this.pendingApprovals.get(approvalId);
    if (pending) {
      pending.resolve(approved);
      this.pendingApprovals.delete(approvalId);
    }
  }

  public stopAgent() {
    this.cancellationToken.isCancelled = true;
    killAllProcesses();
  }

  public async clearMemory() {
    await this.memory.clear();
    vscode.window.showInformationMessage('AI Agent: project memory cleared.');
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css'));
    const nonce = String(Date.now());
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>Verteon</title>
</head>
<body>
  <div id="app">
    <div id="top-header">
      <div id="header-brand">
        <span class="logo-mark">&#9670;</span>
        <span class="brand-name">Verteon</span>
      </div>
      <div id="header-provider">
        <button id="provider-selector" title="Switch AI provider">
          <span id="provider-status-dot" class="status-dot unknown"></span>
          <span id="provider-name">ollama</span>
          <span class="caret">&#9662;</span>
        </button>
      </div>
    </div>
    <div id="main-layout">
      <div id="sidebar">
        <div id="sidebar-brand">
          <span class="logo-mark">&#9670;</span>
          <span>VERTEON</span>
        </div>
        <button id="new-task-btn">&#43; New Task</button>
        <div id="sidebar-nav">
          <div class="nav-section">Workspace</div>
          <div class="nav-item active" data-view="agent"><span class="nav-icon">&#9672;</span>Agent</div>
          <div class="nav-item" data-view="files"><span class="nav-icon">&#9708;</span>Files</div>
          <div class="nav-item" data-view="terminal"><span class="nav-icon">&#9656;</span>Terminal</div>
          <div class="nav-item" data-view="git"><span class="nav-icon">&#10038;</span>Git</div>
          <div class="nav-item" data-view="settings"><span class="nav-icon">&#9881;</span>Settings</div>
          <div class="nav-section">Recent</div>
          <div id="recent-list"></div>
        </div>
        <div id="sidebar-footer">
          <div class="workspace-status">&#128193; <span id="footer-workspace">No workspace</span></div>
          <div class="provider-status"><span id="footer-provider-status">Provider: checking...</span></div>
        </div>
      </div>
      <div id="main-agent">
        <div id="agent-content">
          <div id="welcome-state">
            <div class="welcome-logo">&#9670;</div>
            <h2>Verteon Agent</h2>
            <div class="welcome-subtitle">Your AI coding assistant. Ask me to inspect, edit, build, or fix your project.</div>
            <div id="welcome-suggestions">
              <button class="suggestion-btn" data-prompt="Inspect this project and summarize its structure, framework, and how to run/test it.">Inspect project</button>
              <button class="suggestion-btn" data-prompt="Find and fix all current errors/diagnostics in this project. Run relevant checks to verify.">Fix errors</button>
              <button class="suggestion-btn" data-prompt="Explain the currently selected code.">Explain code</button>
              <button class="suggestion-btn" data-prompt="Refactor the currently selected code for clarity and maintainability, preserving behavior.">Refactor</button>
            </div>
          </div>
        </div>
        <div id="files-panel"></div>
        <div id="terminal-panel"></div>
        <div id="git-panel"></div>
        <div id="settings-panel"></div>
        <div id="composer">
          <div id="composer-input-wrapper">
            <textarea id="composer-input" placeholder="Ask the agent to inspect, edit, or fix something..." rows="2"></textarea>
            <div id="composer-toolbar">
              <div id="composer-actions">
                <button id="new-chat-btn" title="New chat">New</button>
              </div>
              <div style="display:flex;gap:6px;">
                <button id="stop-btn" class="hidden" title="Stop agent">Stop</button>
                <button id="composer-send" title="Send">Send</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div id="activity-panel">
        <div id="activity-panel-header">Activity</div>
        <div id="activity-panel-content">
          <div class="activity-section">
            <div class="activity-section-title">Agent Status</div>
            <div id="agent-status"></div>
          </div>
          <div class="activity-section">
            <div class="activity-section-title">Workspace</div>
            <div id="workspace-info"></div>
          </div>
          <div class="activity-section">
            <div class="activity-section-title">Live Activity</div>
            <div id="live-activity"></div>
          </div>
          <div class="activity-section">
            <div class="activity-section-title">Provider</div>
            <div id="provider-panel" class="provider-list"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
