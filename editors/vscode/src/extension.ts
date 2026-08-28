import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('J.A.R.V.I.S.');
  outputChannel.appendLine('J.A.R.V.I.S. extension activated');

  const openPanel = vscode.commands.registerCommand('jarvis.openPanel', () => {
    vscode.window.showInformationMessage('J.A.R.V.I.S. panel opens here');
  });

  const runOnSelection = vscode.commands.registerCommand('jarvis.runAgentOnSelection', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor selection');
      return;
    }

    const selection = editor.document.getText(editor.selection);
    if (!selection.trim()) {
      vscode.window.showWarningMessage('Select code or text to send to J.A.R.V.I.S.');
      return;
    }

    const config = vscode.workspace.getConfiguration('jarvis');
    const gatewayUrl = config.get<string>('gatewayUrl') || 'ws://localhost:18789';

    outputChannel.appendLine(`Sending selection to ${gatewayUrl}`);
    outputChannel.appendLine(selection.slice(0, 500));

    vscode.window.showInformationMessage('Sent selection to J.A.R.V.I.S. agent harness');
  });

  context.subscriptions.push(openPanel, runOnSelection, outputChannel);
}

export function deactivate(): void {
  // Cleanup when extension deactivates
}
