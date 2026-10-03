import * as vscode from 'vscode';

class Logger {
  private channel: vscode.OutputChannel | undefined;
  private debugEnabled = false;

  init(context: vscode.ExtensionContext) {
    this.channel = vscode.window.createOutputChannel('AI Agent');
    context.subscriptions.push(this.channel);
    this.refreshDebugFlag();
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('agent.debugLogging')) {
          this.refreshDebugFlag();
        }
      })
    );
  }

  private refreshDebugFlag() {
    this.debugEnabled = vscode.workspace.getConfiguration('agent').get<boolean>('debugLogging', false);
  }

  info(msg: string) {
    this.channel?.appendLine(`[info] ${msg}`);
  }

  error(msg: string, err?: unknown) {
    const suffix = err instanceof Error ? ` — ${err.message}` : err ? ` — ${String(err)}` : '';
    this.channel?.appendLine(`[error] ${msg}${suffix}`);
  }

  debug(msg: string) {
    if (this.debugEnabled) {
      this.channel?.appendLine(`[debug] ${msg}`);
    }
  }

  show() {
    this.channel?.show(true);
  }
}

export const logger = new Logger();
