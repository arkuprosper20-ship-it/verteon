import * as vscode from 'vscode';
import { SidebarProvider } from './ui/sidebarProvider';
import { logger } from './logging/logger';
import { getConfig, setCachedSecretGroqKey } from './config/configuration';
import { createProvider } from './providers/providerFactory';
import { killAllProcesses } from './tools/terminalTools';

const FIRST_RUN_KEY = 'aiAgent.hasRunBefore';

export function activate(context: vscode.ExtensionContext) {
  logger.init(context);
  logger.info('Verteon extension activating.');

  void loadSecrets(context);

  const sidebarProvider = new SidebarProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aiAgent.open', () => sidebarProvider.focus()),
    vscode.commands.registerCommand('aiAgent.newChat', () => sidebarProvider.focus()),
    vscode.commands.registerCommand('aiAgent.explainSelection', () => sidebarProvider.runSlashCommand('explain')),
    vscode.commands.registerCommand('aiAgent.fixSelection', () => sidebarProvider.runSlashCommand('fix')),
    vscode.commands.registerCommand('aiAgent.refactorSelection', () => sidebarProvider.runSlashCommand('refactor')),
    vscode.commands.registerCommand('aiAgent.fixErrors', () => sidebarProvider.runSlashCommand('fixErrors')),
    vscode.commands.registerCommand('aiAgent.inspectProject', () => sidebarProvider.runSlashCommand('inspect')),
    vscode.commands.registerCommand('aiAgent.stopAgent', () => sidebarProvider.stopAgent()),
    vscode.commands.registerCommand('aiAgent.openSettings', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', 'agent.')
    ),
    vscode.commands.registerCommand('aiAgent.clearMemory', () => sidebarProvider.clearMemory()),
    vscode.commands.registerCommand('aiAgent.uninstall', () => sidebarProvider.uninstall()),
    vscode.commands.registerCommand('aiAgent.refreshModels', () => vscode.commands.executeCommand('aiAgent.open'))
  );

  context.subscriptions.push({ dispose: () => killAllProcesses() });

  void runFirstRunCheck(context);
}

async function loadSecrets(context: vscode.ExtensionContext) {
  try {
    const secretStorage = (context as any).secretStorage as { get(key: string): Promise<string | undefined> } | undefined;
    if (secretStorage) {
      const groqKey = await secretStorage.get('agent.groq.apiKey');
      if (groqKey) {
        setCachedSecretGroqKey(groqKey);
      }
    }
  } catch (err: any) {
    logger.debug(`Could not load secrets: ${err.message}`);
  }
}

async function runFirstRunCheck(context: vscode.ExtensionContext) {
  const hasRunBefore = context.globalState.get<boolean>(FIRST_RUN_KEY, false);
  if (hasRunBefore) return;
  await context.globalState.update(FIRST_RUN_KEY, true);

  const config = getConfig();
  const provider = createProvider(config);
  const health = await provider.healthCheck().catch((e) => ({ ok: false, message: String(e) }));

  if (health.ok) {
    vscode.window.showInformationMessage(`Local AI Agent: ${health.message} Opening the AI Agent panel.`);
  } else {
    const choice = await vscode.window.showWarningMessage(
      `Local AI Agent needs a running Ollama server. ${health.message}`,
      'Open Settings',
      'Install Ollama'
    );
    if (choice === 'Open Settings') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'agent.');
    } else if (choice === 'Install Ollama') {
      vscode.env.openExternal(vscode.Uri.parse('https://ollama.com/download'));
    }
  }

  vscode.commands.executeCommand('workbench.view.extension.aiAgentContainer');
}

export function deactivate() {
  killAllProcesses();
}
