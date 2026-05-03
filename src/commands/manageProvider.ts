import * as vscode from 'vscode';

export function registerManageProviderCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('omlx.manage', async () => {
      const selection = await vscode.window.showQuickPick(
        [
          {
            label: 'Set API Token',
            description: 'Save the token generated in the oMLX admin panel',
            command: 'omlx.setApiToken'
          },
          {
            label: 'Test Connection',
            description: 'Fetch models from the configured oMLX endpoint',
            command: 'omlx.testConnection'
          },
          {
            label: 'Refresh Models',
            description: 'Ask VS Code to reload the oMLX model list',
            command: 'omlx.refreshModels'
          },
          {
            label: 'Open Settings',
            description: 'Edit oMLX endpoint and capability settings',
            command: 'workbench.action.openSettings',
            args: ['@ext:techopolis.omlx-copilot-chat']
          },
          {
            label: 'Clear API Token',
            description: 'Remove the stored oMLX token from VS Code Secret Storage',
            command: 'omlx.clearApiToken'
          }
        ],
        {
          title: 'Manage oMLX Provider',
          placeHolder: 'Choose an oMLX action'
        }
      );

      if (!selection) {
        return;
      }

      await vscode.commands.executeCommand(selection.command, ...(selection.args ?? []));
    })
  );
}
