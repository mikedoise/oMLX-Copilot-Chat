import { OmlxSettings } from '../config/OmlxConfiguration';
import { OpenAIModel } from './openAICompatTypes';

const fallbackMaxOutputTokens = 4096;

export interface OmlxModelMetadata {
  readonly name: string;
  readonly family: string;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly contextWindow: number;
  readonly supportsImageInput: boolean;
  readonly toolCalling: boolean | number;
  readonly tooltip: string;
}

export function metadataForModel(model: OpenAIModel, settings: OmlxSettings): OmlxModelMetadata {
  const maxOutputTokens = maxOutputTokensForModel(model, settings.maxOutputTokensOverride);
  const contextWindow = contextWindowForModel(model);
  return {
    name: displayNameForModel(model),
    family: familyFromModel(model),
    maxInputTokens: settings.maxInputTokensOverride ?? contextWindow,
    maxOutputTokens,
    contextWindow,
    supportsImageInput: settings.enableImageInput || hasCapability(model, 'vision'),
    toolCalling: toolCallingCapability(model, settings),
    tooltip: `${model.id} from ${settings.baseUrl}. Detected context window: ${contextWindow.toLocaleString()} tokens.`
  };
}

export function metadataForModelWithObservedLimit(
  model: OpenAIModel,
  settings: OmlxSettings,
  observedContextWindow: number | undefined
): OmlxModelMetadata {
  const metadata = metadataForModel(model, settings);
  if (!observedContextWindow || settings.maxInputTokensOverride) {
    return metadata;
  }

  const contextWindow = Math.min(metadata.contextWindow, observedContextWindow);
  return {
    ...metadata,
    maxInputTokens: contextWindow,
    contextWindow,
    tooltip: `${model.id} from ${settings.baseUrl}. Runtime context window: ${contextWindow.toLocaleString()} tokens.`
  };
}

function displayNameForModel(model: OpenAIModel): string {
  const basename = model.model_info?.['general.basename'];
  return basename || model.id;
}

function familyFromModel(model: OpenAIModel): string {
  if (model.details?.family) {
    return model.details.family;
  }

  const architecture = model.model_info?.['general.architecture'];
  if (architecture) {
    return architecture;
  }

  const normalized = model.id.toLowerCase();
  if (normalized.includes('gemma')) {
    return 'gemma';
  }
  if (normalized.includes('llama')) {
    return 'llama';
  }
  if (normalized.includes('qwen')) {
    return 'qwen';
  }
  if (normalized.includes('mistral') || normalized.includes('mixtral')) {
    return 'mistral';
  }
  return 'omlx';
}

function maxOutputTokensForModel(model: OpenAIModel, override: number | undefined): number {
  return override ?? firstPositiveNumber(model.max_output_tokens, fallbackMaxOutputTokens) ?? fallbackMaxOutputTokens;
}

function contextWindowForModel(model: OpenAIModel): number {
  const modelInfo = model.model_info;
  const architecture = modelInfo?.['general.architecture'];
  return firstPositiveNumber(
    model.context_length,
    model.max_context_length,
    model.max_model_len,
    model.max_input_tokens,
    model.n_ctx,
    model.num_ctx,
    architecture ? numberFromUnknown(modelInfo?.[`${architecture}.context_length`]) : undefined,
    numberFromUnknown(modelInfo?.['llama.context_length']),
    numberFromUnknown(modelInfo?.['qwen2.context_length']),
    numberFromUnknown(modelInfo?.['gemma.context_length']),
    numberFromUnknown(modelInfo?.['mistral.context_length']),
    32768
  ) ?? 32768;
}

function hasCapability(model: OpenAIModel, capability: string): boolean {
  return Boolean(model.capabilities?.some(value => value.toLowerCase() === capability));
}

function toolCallingCapability(model: OpenAIModel, settings: OmlxSettings): boolean | number {
  if (!settings.enableToolCalling) {
    return false;
  }

  return Math.max(1, settings.maxToolCount);
}

function firstPositiveNumber(...values: readonly (number | undefined)[]): number | undefined {
  return values.find((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
}

function numberFromUnknown(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
