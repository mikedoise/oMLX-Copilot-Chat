import * as vscode from 'vscode';
import {
  OpenAIChatMessage,
  OpenAIContent,
  OpenAIImageContentPart,
  OpenAITextContentPart,
  OpenAIToolCall
} from './openAICompatTypes';

export function convertMessages(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  supportsImages: boolean
): readonly OpenAIChatMessage[] {
  return messages.flatMap(message => convertMessage(message, supportsImages));
}

export function estimateTokenCount(text: string | vscode.LanguageModelChatRequestMessage): number {
  const content = typeof text === 'string' ? text : extractTextContent(text);
  return Math.max(1, Math.ceil(content.length / 4));
}

function convertMessage(
  message: vscode.LanguageModelChatRequestMessage,
  supportsImages: boolean
): readonly OpenAIChatMessage[] {
  const toolResults = toolResultMessages(message);
  if (toolResults.length > 0) {
    return toolResults;
  }

  const toolCalls = toolCallsForMessage(message);
  const content = convertContent(message.content, supportsImages);
  if (isEmptyContent(content) && toolCalls.length === 0) {
    return [];
  }

  return [{
    role: message.role === vscode.LanguageModelChatMessageRole.Assistant ? 'assistant' : 'user',
    content: isEmptyContent(content) ? null : content,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    name: message.name
  }];
}

function convertContent(
  parts: readonly unknown[],
  supportsImages: boolean
): OpenAIContent {
  const convertedParts: (OpenAITextContentPart | OpenAIImageContentPart)[] = [];

  for (const part of parts) {
    const text = getTextPartValue(part);
    if (text !== undefined) {
      convertedParts.push({ type: 'text', text });
      continue;
    }

    const image = supportsImages ? getImagePartValue(part) : undefined;
    if (image) {
      convertedParts.push(image);
    }
  }

  if (convertedParts.length === 1 && convertedParts[0].type === 'text') {
    return convertedParts[0].text;
  }

  return convertedParts;
}

function extractTextContent(message: vscode.LanguageModelChatRequestMessage): string {
  return message.content
    .map(part => getTextPartValue(part) ?? '')
    .join('');
}

function toolCallsForMessage(message: vscode.LanguageModelChatRequestMessage): readonly OpenAIToolCall[] {
  if (message.role !== vscode.LanguageModelChatMessageRole.Assistant) {
    return [];
  }

  return message.content
    .filter((part): part is vscode.LanguageModelToolCallPart => part instanceof vscode.LanguageModelToolCallPart)
    .map(part => ({
      id: part.callId,
      type: 'function',
      function: {
        name: part.name,
        arguments: JSON.stringify(part.input ?? {})
      }
    }));
}

function toolResultMessages(message: vscode.LanguageModelChatRequestMessage): readonly OpenAIChatMessage[] {
  const results = message.content
    .filter((part): part is vscode.LanguageModelToolResultPart => part instanceof vscode.LanguageModelToolResultPart);

  return results.map(result => ({
    role: 'tool',
    tool_call_id: result.callId,
    content: result.content.map(part => getTextPartValue(part) ?? '').join('')
  }));
}

function getTextPartValue(part: unknown): string | undefined {
  if (part instanceof vscode.LanguageModelTextPart) {
    return part.value;
  }

  const candidate = part as { readonly value?: unknown };
  return typeof candidate.value === 'string' ? candidate.value : undefined;
}

function getImagePartValue(part: unknown): OpenAIImageContentPart | undefined {
  const candidate = part as {
    readonly mimeType?: unknown;
    readonly data?: unknown;
  };

  if (typeof candidate.mimeType !== 'string' || !candidate.mimeType.startsWith('image/')) {
    return undefined;
  }

  const data = candidate.data;
  if (!(data instanceof Uint8Array)) {
    return undefined;
  }

  return {
    type: 'image_url',
    image_url: {
      url: `data:${candidate.mimeType};base64,${Buffer.from(data).toString('base64')}`
    }
  };
}

function isEmptyContent(content: OpenAIContent): boolean {
  return typeof content === 'string' ? content.length === 0 : content.length === 0;
}
