export const CONNECTION_STATES = Object.freeze(['idle', 'connecting', 'connected', 'disconnected', 'reconnecting', 'error']);
export const DEFAULT_RECONNECT_POLICY = Object.freeze({ initialDelayMs: 500, maxDelayMs: 10_000, factor: 2, jitter: false });

export class UiClientStateError extends Error {
  constructor(message, code = 'ERR_UI_CLIENT_STATE', details = {}) {
    super(message);
    this.name = 'UiClientStateError';
    this.code = code;
    this.details = details;
  }
}

export function createClientState(initial = {}) {
  const state = {
    auth: normalizeAuthState(initial.auth),
    connection: normalizeConnectionState(initial.connection ?? { status: 'idle' }),
    focus: normalizeFocusState(initial.focus),
    navigation: { currentRoute: initial.currentRoute ?? '/', blockedByDisconnect: false },
    events: []
  };
  return Object.seal(state);
}

export function setAuthToken(state, token) {
  if (typeof token !== 'string' || token.length < 20) throw new UiClientStateError('A local API bearer token is required.', 'ERR_UI_AUTH_TOKEN');
  state.auth = Object.freeze({ hasToken: true, tokenRef: 'local-memory', tokenPreview: `${token.slice(0, 4)}…${token.slice(-4)}` });
  return state.auth;
}

export function clearAuthToken(state) {
  state.auth = Object.freeze({ hasToken: false, tokenRef: null, tokenPreview: null });
  return state.auth;
}

export function transitionConnection(state, status, metadata = {}) {
  if (!CONNECTION_STATES.includes(status)) throw new UiClientStateError('Unsupported UI connection state.', 'ERR_UI_CONNECTION_STATE', { status });
  state.connection = Object.freeze({ status, lastChangedAt: metadata.now ?? new Date().toISOString(), lastEventId: metadata.lastEventId ?? state.connection?.lastEventId ?? null, error: sanitizeUiText(metadata.error ?? null), reconnectAttempt: metadata.reconnectAttempt ?? state.connection?.reconnectAttempt ?? 0 });
  state.navigation = Object.freeze({ ...state.navigation, blockedByDisconnect: false });
  return state.connection;
}

export function recordUiEvent(state, event) {
  const normalized = Object.freeze({ type: sanitizeUiText(event.type), timestamp: event.timestamp ?? new Date().toISOString(), payload: redactUiPayload(event.payload ?? {}) });
  state.events = Object.freeze([...state.events.slice(-199), normalized]);
  return normalized;
}

export function computeReconnectDelay(attempt, policy = DEFAULT_RECONNECT_POLICY) {
  const parsedAttempt = Number.parseInt(attempt, 10);
  if (!Number.isInteger(parsedAttempt) || parsedAttempt < 0) throw new UiClientStateError('Reconnect attempt must be a non-negative integer.', 'ERR_UI_RECONNECT_ATTEMPT');
  return Math.min(policy.maxDelayMs, Math.round(policy.initialDelayMs * (policy.factor ** parsedAttempt)));
}

export function normalizeFocusState(focus = {}) {
  return Object.freeze({ skipLinkTarget: focus.skipLinkTarget ?? 'main-content', activeElementId: focus.activeElementId ?? null, keyboardMode: focus.keyboardMode ?? true });
}

function normalizeAuthState(auth = {}) {
  return Object.freeze({ hasToken: Boolean(auth.hasToken), tokenRef: auth.tokenRef ?? null, tokenPreview: auth.tokenPreview ?? null });
}

function normalizeConnectionState(connection = {}) {
  const status = connection.status ?? 'idle';
  if (!CONNECTION_STATES.includes(status)) throw new UiClientStateError('Unsupported UI connection state.', 'ERR_UI_CONNECTION_STATE', { status });
  return Object.freeze({ status, lastChangedAt: connection.lastChangedAt ?? null, lastEventId: connection.lastEventId ?? null, error: sanitizeUiText(connection.error ?? null), reconnectAttempt: connection.reconnectAttempt ?? 0 });
}

function redactUiPayload(value) {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(redactUiPayload);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, /token|password|secret|credential|api[_-]?key/i.test(key) ? '[REDACTED]' : redactUiPayload(child)]));
  if (typeof value === 'string') return sanitizeUiText(value);
  return value;
}

function sanitizeUiText(value) {
  if (value === null || value === undefined) return value;
  return String(value).replace(/sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+\/-]+=*|[A-Za-z0-9_-]{43,}/g, '[REDACTED]').replace(/[\r\n\u2028\u2029]+/g, ' ');
}
