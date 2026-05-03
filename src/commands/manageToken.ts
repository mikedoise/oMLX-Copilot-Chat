import * as vscode from 'vscode';
import { OmlxConfiguration } from '../config/OmlxConfiguration';
import { OmlxAuthenticationError, OmlxClient } from '../provider/OmlxClient';
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
      const validation = await validateToken(configuration, provider);
      if (validation === 'valid') {
        return;
      }

      if (validation === 'authFailed') {
        const selection = await vscode.window.showErrorMessage(
          'oMLX rejected that API token. Generate a token in the oMLX admin panel, then paste that exact value.',
          'Set Token Again',
          'Clear Token'
        );
        if (selection === 'Set Token Again') {
          await vscode.commands.executeCommand('omlx.setApiToken');
        } else if (selection === 'Clear Token') {
          await vscode.commands.executeCommand('omlx.clearApiToken');
        }
        return;
      }

      void vscode.window.showWarningMessage(
        'oMLX API token saved, but the extension could not verify it. Make sure oMLX is running, then run "oMLX: Test Connection".'
      );
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

async function validateToken(
  configuration: OmlxConfiguration,
  provider: OmlxLanguageModelProvider
): Promise<'valid' | 'authFailed' | 'unknownFailed'> {
  const apiToken = await configuration.getApiToken();
  if (!apiToken) {
    return 'authFailed';
  }

  const settings = configuration.settings;
  const cancellation = new vscode.CancellationTokenSource();
  try {
    const client = new OmlxClient(settings.baseUrl, apiToken, settings.requestTimeoutMs);
    const models = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Validating oMLX API token'
      },
      () => client.fetchModels(cancellation.token)
    );
    provider.refresh();
    void vscode.window.showInformationMessage(`oMLX API token saved and verified. Found ${models.length} model${models.length === 1 ? '' : 's'}.`);
    return 'valid';
  } catch (error) {
    if (error instanceof OmlxAuthenticationError) {
      return 'authFailed';
    }
    return 'unknownFailed';
  } finally {
    cancellation.dispose();
  }
}
