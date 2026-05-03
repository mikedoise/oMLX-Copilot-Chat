# oMLX Copilot Chat

Use models served by oMLX from the Visual Studio Code Copilot Chat model picker.

Repository: https://github.com/mikedoise/oMLX-Copilot-Chat

This extension registers `oMLX` as a VS Code Language Model Chat Provider and
talks to the oMLX OpenAI-compatible API:

- `GET /v1/models`
- `POST /v1/chat/completions`

The default endpoint is `http://127.0.0.1:8000/v1`.

## Requirements

- VS Code 1.104 or newer
- GitHub Copilot Chat
- A running oMLX server
- An oMLX API token generated in the oMLX admin panel

## Setup

1. Start oMLX.
2. Generate an API token in the oMLX admin panel.
3. Run `oMLX: Set API Token` from the Command Palette.
4. Wait for the token validation message. If validation fails, paste the exact token from oMLX again.
5. Run `oMLX: Test Connection` if you want to retest later.
6. Open Copilot Chat, manage language models, and enable the oMLX models you want to use.

The token is stored in VS Code Secret Storage, not in `settings.json`.
`oMLX: Set API Token` only changes the token VS Code sends to oMLX; it does not
create or rotate a token in oMLX. The value must exactly match a token generated
in the oMLX admin panel.

## Copilot Agent Context

Copilot Agent mode has a large built-in prompt. If an oMLX model is advertised
with a 32k context window, Copilot may compact the conversation on nearly every
turn even for short prompts.

For normal Agent mode use, configure oMLX to allow a larger context window and
set the advertised input-token override in VS Code:

```json
"omlx.maxInputTokensOverride": 65536
```

Use `131072` if the selected oMLX model and runtime are configured for a 128k
context. Keep the override at `0` when you want the extension to use the context
reported by `/v1/models`.

The override only changes what the extension advertises to Copilot. The oMLX
server must also be configured to accept that context size, or oMLX will reject
long requests with a prompt-too-long error.

## Settings

- `omlx.baseUrl`: oMLX OpenAI-compatible base URL.
- `omlx.maxInputTokensOverride`: optional input-token override. Leave as `0` to auto-detect from model metadata. For Copilot Agent mode, use `65536` or higher if oMLX is configured for that context size.
- `omlx.maxOutputTokensOverride`: optional output-token override. Leave as `0` to use model metadata when available.
- `omlx.requestTimeoutMs`: request timeout for model discovery and chat requests.
- `omlx.enableImageInput`: advertise OpenAI-compatible image input support.
- `omlx.enableToolCalling`: advertise and forward OpenAI-compatible tool calls. Defaults to `true` for Agent mode compatibility.
- `omlx.maxToolCount`: maximum number of tools advertised for Agent mode requests. Defaults to `16`.

Image input defaults to off. Tool calling defaults to on because VS Code Agent
mode filters for tool-capable models. Disable tool calling if your selected
oMLX model/server rejects OpenAI-compatible tool schemas.

If oMLX rejects a request with a concrete runtime context-window error, the
extension remembers that limit for the model and refreshes the advertised model
metadata for future requests.

## Development

```sh
npm install
npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host.
