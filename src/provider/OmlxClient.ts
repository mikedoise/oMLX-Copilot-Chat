import * as vscode from 'vscode';
import {
  OpenAIChatCompletionChunk,
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
  OpenAIChatMessage,
  OpenAIModel,
  OpenAIModelListResponse,
  OpenAITool,
  OpenAIToolCall,
  OpenAIToolCallDelta
} from './openAICompatTypes';

export type OmlxStreamPart =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'toolCall'; readonly callId: string; readonly name: string; readonly input: object };

export class OmlxPromptTooLongError extends Error {
  constructor(
    readonly promptTokens: number,
    readonly maxContextTokens: number,
    readonly body: string
  ) {
    super(`Prompt too long: ${promptTokens} tokens exceeds max context window of ${maxContextTokens} tokens.`);
    this.name = 'OmlxPromptTooLongError';
  }
}

export class OmlxMemoryError extends Error {
  constructor(readonly body: string) {
    super('oMLX could not load the selected model because memory is currently exhausted. In the oMLX admin panel, unpin or unload other models, or choose a smaller/quantized model in VS Code.');
    this.name = 'OmlxMemoryError';
  }
}

export class OmlxClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiToken: string,
    private readonly timeoutMs: number
  ) {}

  async fetchModels(token: vscode.CancellationToken): Promise<readonly OpenAIModel[]> {
    const response = await this.fetchJson<OpenAIModelListResponse>(`${this.baseUrl}/models`, {
      method: 'GET',
      token
    });
    const models = response.data ?? response.models ?? [];
    return models.filter((model): model is OpenAIModel => typeof model?.id === 'string' && model.id.length > 0);
  }

  async *streamChatCompletion(
    model: string,
    messages: readonly OpenAIChatMessage[],
    options: {
      readonly temperature?: number;
      readonly maxTokens?: number;
      readonly tools?: readonly OpenAITool[];
      readonly toolChoice?: 'auto' | 'required';
    },
    token: vscode.CancellationToken
  ): AsyncGenerator<OmlxStreamPart> {
    const requestBody: OpenAIChatCompletionRequest = {
      model,
      messages,
      stream: true,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      tools: options.tools,
      tool_choice: options.toolChoice
    };

    const response = await this.fetchResponse(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      token,
      body: JSON.stringify(stripUndefined(requestBody))
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (!response.body || !contentType.includes('text/event-stream')) {
      const payload = await response.json() as OpenAIChatCompletionResponse;
      const content = payload.choices?.[0]?.message?.content;
      if (content) {
        yield { type: 'text', value: content };
      }
      for (const toolCall of payload.choices?.[0]?.message?.tool_calls ?? []) {
        yield completeToolCallPart(toolCall);
      }
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const toolCallAccumulators = new Map<number, MutableToolCall>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          const fragment = parseSseLine(line);
          if (fragment.done) {
            yield* completeToolCalls(toolCallAccumulators);
            return;
          }
          if (fragment.text) {
            yield { type: 'text', value: fragment.text };
          }
          for (const toolCall of fragment.toolCalls) {
            mergeToolCallDelta(toolCallAccumulators, toolCall);
          }
          newlineIndex = buffer.indexOf('\n');
        }
      }

      yield* completeToolCalls(toolCallAccumulators);
    } finally {
      reader.releaseLock();
    }
  }

  private async fetchJson<T>(
    url: string,
    options: { readonly method: string; readonly token: vscode.CancellationToken; readonly body?: string }
  ): Promise<T> {
    const response = await this.fetchResponse(url, options);
    return await response.json() as T;
  }

  private async fetchResponse(
    url: string,
    options: { readonly method: string; readonly token: vscode.CancellationToken; readonly body?: string }
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const cancellation = options.token.onCancellationRequested(() => controller.abort());

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: options.body,
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text();
        const promptTooLong = parsePromptTooLongError(body);
        if (promptTooLong) {
          throw new OmlxPromptTooLongError(promptTooLong.promptTokens, promptTooLong.maxContextTokens, body);
        }
        if (isMemoryError(body)) {
          throw new OmlxMemoryError(body);
        }
        throw new Error(formatHttpError(response.status, body));
      }

      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('The oMLX request was cancelled or timed out.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      cancellation.dispose();
    }
  }
}

interface MutableToolCall {
  callId: string;
  name: string;
  argumentsText: string;
}

interface ParsedSseLine {
  readonly done: boolean;
  readonly text?: string;
  readonly toolCalls: readonly OpenAIToolCallDelta[];
}

function parseSseLine(line: string): ParsedSseLine {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) {
    return { done: false, toolCalls: [] };
  }

  const data = trimmed.slice(5).trim();
  if (data === '[DONE]') {
    return { done: true, toolCalls: [] };
  }

  const chunk = JSON.parse(data) as OpenAIChatCompletionChunk;
  const delta = chunk.choices?.[0]?.delta;
  return {
    done: false,
    text: delta?.content ?? undefined,
    toolCalls: delta?.tool_calls ?? []
  };
}

function mergeToolCallDelta(accumulators: Map<number, MutableToolCall>, delta: OpenAIToolCallDelta): void {
  const index = delta.index ?? 0;
  const existing = accumulators.get(index) ?? { callId: '', name: '', argumentsText: '' };
  accumulators.set(index, {
    callId: delta.id ?? existing.callId,
    name: delta.function?.name ?? existing.name,
    argumentsText: existing.argumentsText + (delta.function?.arguments ?? '')
  });
}

function* completeToolCalls(accumulators: Map<number, MutableToolCall>): Generator<OmlxStreamPart> {
  for (const toolCall of [...accumulators.entries()].sort(([left], [right]) => left - right).map(([, value]) => value)) {
    if (!toolCall.callId || !toolCall.name) {
      continue;
    }
    yield {
      type: 'toolCall',
      callId: toolCall.callId,
      name: toolCall.name,
      input: parseToolArguments(toolCall.argumentsText)
    };
  }
  accumulators.clear();
}

function completeToolCallPart(toolCall: OpenAIToolCall): OmlxStreamPart {
  return {
    type: 'toolCall',
    callId: toolCall.id,
    name: toolCall.function.name,
    input: parseToolArguments(toolCall.function.arguments)
  };
}

function parseToolArguments(value: string): object {
  if (!value.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parsePromptTooLongError(body: string): { promptTokens: number; maxContextTokens: number } | undefined {
  const message = errorMessageFromBody(body);
  const match = /Prompt too long:\s*(\d+)\s*tokens exceeds max context window of\s*(\d+)\s*tokens/i.exec(message);
  if (!match) {
    return undefined;
  }

  return {
    promptTokens: Number(match[1]),
    maxContextTokens: Number(match[2])
  };
}

function errorMessageFromBody(body: string): string {
  try {
    const parsed = JSON.parse(body) as { readonly error?: { readonly message?: unknown } };
    return typeof parsed.error?.message === 'string' ? parsed.error.message : body;
  } catch {
    return body;
  }
}

function isMemoryError(body: string): boolean {
  const message = errorMessageFromBody(body);
  return /Cannot free enough memory|Need .*GB|all loaded models are pinned/i.test(message);
}

function formatHttpError(status: number, body: string): string {
  const trimmed = body.trim();
  return trimmed ? `oMLX returned HTTP ${status}: ${trimmed}` : `oMLX returned HTTP ${status}.`;
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null)) as T;
}
