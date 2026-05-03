import * as vscode from 'vscode';
import { OmlxConfiguration } from '../config/OmlxConfiguration';
import { OmlxAuthenticationError, OmlxClient } from '../provider/OmlxClient';
import { OmlxLanguageModelProvider } from '../provider/OmlxLanguageModelProvider';

export function registerConnectionCommands(
  context: vscode.ExtensionContext,
  configuration: OmlxConfiguration,
  provider: OmlxLanguageModelProvider,
  output: vscode.OutputChannel
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('omlx.testConnection', async () => {
      const apiToken = await configuration.getApiToken();
      if (!apiToken) {
        const selection = await vscode.window.showWarningMessage(
          'Set your oMLX API token before testing the connection.',
          'Set Token'
        );
        if (selection === 'Set Token') {
          await vscode.commands.executeCommand('omlx.setApiToken');
        }
        return;
      }

      const settings = configuration.settings;
      const cancellation = new vscode.CancellationTokenSource();
      try {
        const client = new OmlxClient(settings.baseUrl, apiToken, settings.requestTimeoutMs);
        const models = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Testing oMLX connection'
          },
          () => client.fetchModels(cancellation.token)
        );

        provider.refresh();
        void vscode.window.showInformationMessage(`Connected to oMLX. Found ${models.length} model${models.length === 1 ? '' : 's'}.`);
      } catch (error) {
        const message = formatError(error);
        output.appendLine(`oMLX connection test failed: ${message}`);
        if (error instanceof OmlxAuthenticationError) {
          const selection = await vscode.window.showErrorMessage(
            message,
            'Set Token',
            'Clear Token'
          );
          if (selection === 'Set Token') {
            await vscode.commands.executeCommand('omlx.setApiToken');
          } else if (selection === 'Clear Token') {
            await vscode.commands.executeCommand('omlx.clearApiToken');
          }
          return;
        }

        void vscode.window.showErrorMessage(`oMLX connection test failed: ${message}`);
      } finally {
        cancellation.dispose();
      }
    }),

    vscode.commands.registerCommand('omlx.refreshModels', () => {
      provider.refresh();
      void vscode.window.showInformationMessage('Refreshing oMLX models.');
    })
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
