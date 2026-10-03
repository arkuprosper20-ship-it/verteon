import * as vscode from 'vscode';
import * as path from 'path';

export const DIFF_SCHEME = 'ai-agent-preview';

/**
 * Opens a real before/after diff preview for a proposed file change.
 *
 * The "after" (proposed) content is served by a {@link vscode.TextDocumentContentProvider}
 * registered on the `ai-agent-preview` scheme. The "before" side uses the real file on
 * disk when it exists, otherwise an in-memory empty document (e.g. for new files).
 *
 * The diff is opened non-modally via the `vscode.diff` command; the existing
 * ApprovalRequest card (handled by the caller) still gates whether the change
 * is actually applied.
 */
export class DiffPreviewService implements vscode.Disposable {
  private proposed = new Map<string, string>();
  private counter = 0;
  private disposable: vscode.Disposable;

  constructor(subscriptions: vscode.Disposable[]) {
    this.disposable = vscode.Disposable.from(
      vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, {
        provideTextDocumentContent: (uri: vscode.Uri): string => {
          return this.proposed.get(uri.path) ?? '';
        },
      })
    );
    subscriptions.push(this);
  }

  /**
   * Opens a diff editor where the left side is the current file content (or an
   * empty document for brand-new files) and the right side is `after`.
   */
  async showDiff(
    workspaceRoot: string,
    filePath: string,
    before: string,
    after: string,
    title = 'Proposed change',
  ): Promise<void> {
    const rel = path.isAbsolute(filePath) ? path.relative(workspaceRoot, filePath) : filePath;
    const relPosix = rel.split(path.sep).join('/');
    const label = `${title} \u2014 ${relPosix}`;

    const id = ++this.counter;
    const afterKey = `/__diff_${id}_after`;
    this.proposed.set(afterKey, after);
    const rightUri = vscode.Uri.parse(`${DIFF_SCHEME}:${afterKey}`);

    const absPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
    let leftUri: vscode.Uri;
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(absPath));
      // The real file exists — diff against its current on-disk content.
      leftUri = vscode.Uri.file(absPath);
    } catch {
      // New file: diff against an empty "before".
      const beforeKey = `/__diff_${id}_before`;
      this.proposed.set(beforeKey, before);
      leftUri = vscode.Uri.parse(`${DIFF_SCHEME}:${beforeKey}`);
    }

    try {
      await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, label);
    } catch {
      // Diff preview is best-effort; the approval card still gates the change.
    }
  }

  dispose(): void {
    this.disposable.dispose();
    this.proposed.clear();
  }
}
