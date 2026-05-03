import * as vscode from 'vscode';
import { OmlxConfiguration } from '../config/OmlxConfiguration';
import { OmlxLanguageModelProvider } from '../provider/OmlxLanguageModelProvider';

export function registerTokenCommands(
  context: vscode.ExtensionContext,
  configuration: OmlxConfiguration,
  provider: OmlxLanguageModelProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('omlx.setApiToken', async () => {
      const token = await vscode.window.showInputBox({
        title: 'Set oMLX API Token',
        prompt: 'Paste the token generated in the oMLX admin panel.',
        password: true,
        ignoreFocusOut: true,
        validateInput: value => value.trim().length === 0 ? 'Enter an oMLX API token.' : undefined
      });

      if (token === undefined) {
        return;
      }

      await configuration.setApiToken(token);
      provider.refresh();
      void vscode.window.showInformationMessage('oMLX API token saved.');
    }),

    vscode.commands.registerCommand('omlx.clearApiToken', async () => {
      const selection = await vscode.window.showWarningMessage(
        'Clear the stored oMLX API token?',
        { modal: true },
        'Clear Token'
      );
      if (selection !== 'Clear Token') {
        return;
      }

      await configuration.clearApiToken();
      provider.refresh();
      void vscode.window.showInformationMessage('oMLX API token cleared.');
    })
  );
}
