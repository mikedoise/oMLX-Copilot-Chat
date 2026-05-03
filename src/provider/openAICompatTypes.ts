export interface OpenAIModelListResponse {
  readonly data?: readonly OpenAIModel[];
  readonly models?: readonly OpenAIModel[];
}

export interface OpenAIModel {
  readonly id: string;
  readonly object?: string;
  readonly created?: number;
  readonly owned_by?: string;
  readonly capabilities?: readonly string[];
  readonly context_length?: number;
  readonly max_context_length?: number;
  readonly max_model_len?: number;
  readonly max_input_tokens?: number;
  readonly max_output_tokens?: number;
  readonly n_ctx?: number;
  readonly num_ctx?: number;
  readonly details?: {
    readonly family?: string;
  };
  readonly model_info?: {
    readonly 'general.basename'?: string;
    readonly 'general.architecture'?: string;
    readonly [key: string]: unknown;
  };
  readonly [key: string]: unknown;
}

export type OpenAIRole = 'system' | 'user' | 'assistant' | 'tool';

export interface OpenAITextContentPart {
  readonly type: 'text';
  readonly text: string;
}

export interface OpenAIImageContentPart {
  readonly type: 'image_url';
  readonly image_url: {
    readonly url: string;
  };
}

export type OpenAIContent = string | readonly (OpenAITextContentPart | OpenAIImageContentPart)[];

export interface OpenAIChatMessage {
  readonly role: OpenAIRole;
  readonly content?: OpenAIContent | null;
  readonly name?: string;
  readonly tool_call_id?: string;
  readonly tool_calls?: readonly OpenAIToolCall[];
}

export interface OpenAIChatCompletionRequest {
  readonly model: string;
  readonly messages: readonly OpenAIChatMessage[];
  readonly stream: boolean;
  readonly temperature?: number;
  readonly max_tokens?: number;
  readonly tools?: readonly OpenAITool[];
  readonly tool_choice?: 'auto' | 'required';
}

export interface OpenAITool {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters?: object;
  };
}

export interface OpenAIToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly arguments: string;
  };
}

export interface OpenAIChatCompletionResponse {
  readonly choices?: readonly {
    readonly message?: {
      readonly content?: string | null;
      readonly tool_calls?: readonly OpenAIToolCall[];
    };
  }[];
}

export interface OpenAIChatCompletionChunk {
  readonly choices?: readonly {
    readonly delta?: {
      readonly content?: string | null;
      readonly tool_calls?: readonly OpenAIToolCallDelta[];
    };
  }[];
}

export interface OpenAIToolCallDelta {
  readonly index?: number;
  readonly id?: string;
  readonly type?: 'function';
  readonly function?: {
    readonly name?: string;
    readonly arguments?: string;
  };
}
