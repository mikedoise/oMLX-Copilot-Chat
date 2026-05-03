import * as vscode from 'vscode';

const TOKEN_SECRET_KEY = 'omlx.apiToken';
const OBSERVED_CONTEXT_WINDOWS_KEY = 'omlx.observedContextWindows';

export interface OmlxSettings {
  readonly baseUrl: string;
  readonly maxInputTokensOverride: number | undefined;
  readonly maxOutputTokensOverride: number | undefined;
  readonly requestTimeoutMs: number;
  readonly enableImageInput: boolean;
  readonly enableToolCalling: boolean;
  readonly maxToolCount: number;
}

export class OmlxConfiguration {
  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly globalState: vscode.Memento
  ) {}

  get settings(): OmlxSettings {
    const config = vscode.workspace.getConfiguration('omlx');
    return {
      baseUrl: normalizeBaseUrl(config.get<string>('baseUrl', 'http://127.0.0.1:8000/v1')),
      maxInputTokensOverride: positiveNumberOrUndefined(config.get<number>('maxInputTokensOverride', 0)),
      maxOutputTokensOverride: positiveNumberOrUndefined(config.get<number>('maxOutputTokensOverride', 0)),
      requestTimeoutMs: config.get<number>('requestTimeoutMs', 300000),
      enableImageInput: config.get<boolean>('enableImageInput', false),
      enableToolCalling: config.get<boolean>('enableToolCalling', true),
      maxToolCount: Math.max(1, config.get<number>('maxToolCount', 16))
    };
  }

  async getApiToken(): Promise<string | undefined> {
    const token = await this.secrets.get(TOKEN_SECRET_KEY);
    return token?.trim() || undefined;
  }

  async setApiToken(token: string): Promise<void> {
    await this.secrets.store(TOKEN_SECRET_KEY, token.trim());
  }

  async clearApiToken(): Promise<void> {
    await this.secrets.delete(TOKEN_SECRET_KEY);
  }

  observedContextWindow(modelId: string): number | undefined {
    return this.observedContextWindows()[modelId];
  }

  async setObservedContextWindow(modelId: string, contextWindow: number): Promise<void> {
    const values = this.observedContextWindows();
    values[modelId] = contextWindow;
    await this.globalState.update(OBSERVED_CONTEXT_WINDOWS_KEY, values);
  }

  private observedContextWindows(): Record<string, number> {
    return this.globalState.get<Record<string, number>>(OBSERVED_CONTEXT_WINDOWS_KEY, {});
  }
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim() || 'http://127.0.0.1:8000/v1';
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function positiveNumberOrUndefined(value: number | undefined): number | undefined {
  return value !== undefined && value > 0 ? value : undefined;
}
