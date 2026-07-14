# E6-T03 UI Shell, Auth and Client State

The UI package now exposes a local shell bootstrap model, local API client, SSE client, reconnect state, and accessibility baseline.

## Guardrails

- UI code does not invoke CLI commands.
- UI code does not read secrets from environment variables.
- Bearer token is held behind a token provider and redacted in client state.
- Disconnect state does not block navigation.
- Accessibility baseline includes landmarks, skip link target, keyboard navigation, focus visibility, and non-color-only status.

## Client pieces

- `api-client.js` builds authenticated REST requests and SSE URLs.
- `sse-client.js` handles connect, disconnect, events, reconnect, and stream reset.
- `client-state.js` holds auth, connection, focus, navigation, and UI event state.
- `accessibility.js` defines the shell accessibility baseline.
