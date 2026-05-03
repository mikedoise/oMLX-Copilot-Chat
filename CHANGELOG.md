# Changelog

## 0.1.2

### Changed

- Validate the stored API token immediately after `oMLX: Set API Token`.
- Show a direct retry path when oMLX rejects a newly entered token.

## 0.1.1

### Changed

- Show a clearer invalid-token error when oMLX returns `401` or `403`.
- Offer to set or clear the stored oMLX API token directly from the failed connection test.
- Clarify that `oMLX: Set API Token` stores an existing oMLX admin token rather than creating one.

## 0.1.0

Initial public preview.

### Added

- Register oMLX as a VS Code Language Model Chat Provider for GitHub Copilot Chat.
- Discover OpenAI-compatible oMLX models from `/v1/models`.
- Send chat requests through the oMLX OpenAI-compatible `/v1/chat/completions` endpoint.
- Store the oMLX API token in VS Code Secret Storage.
- Add commands to manage the provider, set or clear the token, test the connection, and refresh models.
- Detect model context windows from OpenAI/Ollama-style model metadata.
- Support optional input and output token overrides.
- Support OpenAI-compatible tool calling with a configurable Agent-mode tool cap.
- Remember runtime prompt-too-long context limits reported by oMLX.
- Show a clearer error when oMLX cannot load a selected model because memory is exhausted.

### Notes

- This is a public preview. The provider depends on VS Code's Language Model Chat Provider API and GitHub Copilot Chat behavior, both of which may continue to evolve.
- Copilot Agent mode has a large built-in prompt. If oMLX is configured for 64k or 128k context, set `omlx.maxInputTokensOverride` to `65536` or `131072` to reduce frequent conversation compaction.
- The token override only changes what the extension advertises to Copilot; oMLX must also be configured to accept the selected context size.
