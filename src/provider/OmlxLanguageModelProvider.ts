import * as vscode from 'vscode';
import { OmlxConfiguration } from '../config/OmlxConfiguration';
import { OmlxClient, OmlxMemoryError, OmlxPromptTooLongError } from './OmlxClient';
import { convertMessages, estimateTokenCount } from './messageConversion';
import { metadataForModelWithObservedLimit } from './modelMetadata';
import { OpenAIModel, OpenAITool } from './openAICompatTypes';

export class OmlxLanguageModelProvider implements vscode.LanguageModelChatProvider<vscode.LanguageModelChatInformation> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this.changeEmitter.event;

  constructor(
    private readonly configuration: OmlxConfiguration,
    private readonly output: vscode.OutputChannel
  ) {}

  refresh(): void {
    this.changeEmitter.fire();
  }

  async provideLanguageModelChatInformation(
    options: { readonly silent: boolean },
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatInformation[]> {
    const apiToken = await this.configuration.getApiToken();
    if (!apiToken) {
      if (!options.silent) {
        void vscode.window.showWarningMessage('Set your oMLX API token before loading oMLX models.', 'Set Token')
          .then(selection => selection === 'Set Token' ? vscode.commands.executeCommand('omlx.setApiToken') : undefined);
      }
      return [];
    }

    try {
      const settings = this.configuration.settings;
      const client = new OmlxClient(settings.baseUrl, apiToken, settings.requestTimeoutMs);
      const models = await client.fetchModels(token);
      const modelInformation = models.map(model => this.toLanguageModelInformation(model));
      for (const modelInfo of modelInformation) {
        this.output.appendLine(
          `Model ${modelInfo.id}: maxInputTokens=${modelInfo.maxInputTokens}, maxOutputTokens=${modelInfo.maxOutputTokens}, toolCalling=${modelInfo.capabilities.toolCalling ?? false}, images=${Boolean(modelInfo.capabilities.imageInput)}`
        );
      }
      return modelInformation;
    } catch (error) {
      this.output.appendLine(`Failed to fetch oMLX models: ${formatError(error)}`);
      if (!options.silent) {
        void vscode.window.showErrorMessage(`Failed to fetch oMLX models: ${formatError(error)}`);
      }
      return [];
    }
  }

  async provideLanguageModelChatResponse(
    model: vscode.LanguageModelChatInformation,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    const apiToken = await this.configuration.getApiToken();
    if (!apiToken) {
      throw new Error('Set your oMLX API token before sending chat requests.');
    }

    const settings = this.configuration.settings;
    const client = new OmlxClient(settings.baseUrl, apiToken, settings.requestTimeoutMs);
    const convertedMessages = convertMessages(messages, Boolean(model.capabilities.imageInput));
    const requestOptions = extractRequestOptions(options, settings.maxToolCount);
    const estimatedInputTokens = messages.reduce((total, message) => total + estimateTokenCount(message), 0);
    this.output.appendLine(
      `Request ${model.id}: messages=${messages.length}, estimatedInputTokens=${estimatedInputTokens}, maxInputTokens=${model.maxInputTokens}, tools=${requestOptions.tools?.length ?? 0}, toolChoice=${requestOptions.toolChoice ?? 'none'}`
    );

    try {
      for await (const part of client.streamChatCompletion(model.id, convertedMessages, requestOptions, token)) {
        if (part.type === 'text') {
          progress.report(new vscode.LanguageModelTextPart(part.value));
        } else {
          progress.report(new vscode.LanguageModelToolCallPart(part.callId, part.name, part.input));
        }
      }
    } catch (error) {
      if (error instanceof OmlxPromptTooLongError) {
        await this.configuration.setObservedContextWindow(model.id, error.maxContextTokens);
        this.output.appendLine(
          `Observed runtime context limit for ${model.id}: ${error.maxContextTokens}. Refreshing model metadata.`
        );
        this.refresh();
        throw new Error(`oMLX says this model's runtime context window is ${error.maxContextTokens.toLocaleString()} tokens. I updated the advertised limit; retry after VS Code refreshes the model metadata.`);
      }
      if (error instanceof OmlxMemoryError) {
        this.output.appendLine(`Memory error for ${model.id}: ${error.body}`);
        throw new Error(error.message);
      }
      throw error;
    }
  }

  async provideTokenCount(
    _model: vscode.LanguageModelChatInformation,
    text: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken
  ): Promise<number> {
    return estimateTokenCount(text);
  }

  private toLanguageModelInformation(model: OpenAIModel): vscode.LanguageModelChatInformation {
    const settings = this.configuration.settings;
    const metadata = metadataForModelWithObservedLimit(
      model,
      settings,
      this.configuration.observedContextWindow(model.id)
    );
    return {
      id: model.id,
      name: metadata.name,
      family: metadata.family,
      version: String(model.created ?? 'local'),
      maxInputTokens: metadata.maxInputTokens,
      maxOutputTokens: metadata.maxOutputTokens,
      detail: 'oMLX',
      tooltip: metadata.tooltip,
      capabilities: {
        imageInput: metadata.supportsImageInput,
        toolCalling: metadata.toolCalling
      }
    };
  }
}

function extractRequestOptions(
  options: vscode.ProvideLanguageModelChatResponseOptions,
  maxToolCount: number
): {
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly tools?: readonly OpenAITool[];
  readonly toolChoice?: 'auto' | 'required';
} {
  const raw = options as {
    readonly modelOptions?: {
      readonly temperature?: unknown;
      readonly max_tokens?: unknown;
      readonly maxTokens?: unknown;
    };
  };
  const tools = maxToolCount > 0
    ? options.tools?.slice(0, maxToolCount)
    : options.tools;
  return {
    temperature: typeof raw.modelOptions?.temperature === 'number' ? raw.modelOptions.temperature : undefined,
    maxTokens: firstNumber(raw.modelOptions?.max_tokens, raw.modelOptions?.maxTokens),
    tools: tools?.map(convertTool),
    toolChoice: tools && tools.length > 0
      ? options.toolMode === vscode.LanguageModelChatToolMode.Required ? 'required' : 'auto'
      : undefined
  };
}

function firstNumber(...values: readonly unknown[]): number | undefined {
  return values.find((value): value is number => typeof value === 'number');
}

function convertTool(tool: vscode.LanguageModelChatTool): OpenAITool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    }
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
