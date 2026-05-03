import * as vscode from 'vscode';
import { registerConnectionCommands } from './commands/testConnection';
import { registerManageProviderCommand } from './commands/manageProvider';
import { registerTokenCommands } from './commands/manageToken';
import { OmlxConfiguration } from './config/OmlxConfiguration';
import { OmlxLanguageModelProvider } from './provider/OmlxLanguageModelProvider';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('oMLX Copilot Chat');
  const configuration = new OmlxConfiguration(context.secrets, context.globalState);
  const provider = new OmlxLanguageModelProvider(configuration, output);

  context.subscriptions.push(output);
  context.subscriptions.push(vscode.lm.registerLanguageModelChatProvider('omlx', provider));

  registerManageProviderCommand(context);
  registerTokenCommands(context, configuration, provider);
  registerConnectionCommands(context, configuration, provider, output);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('omlx')) {
        provider.refresh();
      }
    })
  );
}

export function deactivate(): void {}
