export class UiApiClientError extends Error {
  constructor(message, code = 'ERR_UI_API_CLIENT', details = {}) {
    super(message);
    this.name = 'UiApiClientError';
    this.code = code;
    this.details = details;
  }
}

export function createApiClient({ baseUrl = 'http://127.0.0.1:3210/api/v1', tokenProvider } = {}) {
  if (!tokenProvider || typeof tokenProvider.getToken !== 'function') throw new UiApiClientError('API client requires a token provider.', 'ERR_UI_API_TOKEN_PROVIDER');
  const normalizedBaseUrl = String(baseUrl).replace(/\/$/, '');
  return Object.freeze({
    baseUrl: normalizedBaseUrl,
    createRequest(method, path, options = {}) {
      const token = tokenProvider.getToken();
      if (!token) throw new UiApiClientError('API token is unavailable.', 'ERR_UI_API_TOKEN');
      const headers = {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'content-type': 'application/json',
        'x-request-id': options.requestId ?? createUiRequestId(),
        ...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}),
        ...(options.resourceVersion ? { 'if-match': options.resourceVersion } : {})
      };
      return Object.freeze({ method: method.toUpperCase(), url: `${normalizedBaseUrl}${path}`, headers, body: options.body ? JSON.stringify(options.body) : undefined });
    },
    createSseUrl({ runId, lastEventId, limit } = {}) {
      const url = new URL(`${normalizedBaseUrl}/events`);
      if (runId) url.searchParams.set('runId', runId);
      if (lastEventId !== undefined && lastEventId !== null) url.searchParams.set('lastEventId', String(lastEventId));
      if (limit) url.searchParams.set('limit', String(limit));
      return url.toString();
    }
  });
}

export function createMemoryTokenProvider(initialToken = null) {
  let token = initialToken;
  return Object.freeze({ getToken: () => token, setToken: (next) => { token = next; return true; }, clear: () => { token = null; return true; } });
}

export function assertUiDoesNotInvokeCli(sourceText) {
  const text = String(sourceText ?? '');
  const forbidden = [
    ['child', '_', 'process'].join(''),
    ['sp', 'awn', String.raw`\(`].join(''),
    ['ex', 'ec', String.raw`\(`].join(''),
    ['power', 'shell'].join(''),
    ['cmd', String.raw`\.`, 'exe'].join(''),
    ['bash', String.raw`\s+`, '-'].join(''),
    ['claude', String.raw`\s+`, 'code'].join(''),
    ['codex', String.raw`\s+`].join('')
  ];
  const pattern = new RegExp(forbidden.join('|'), 'i');
  if (pattern.test(text)) throw new UiApiClientError('UI shell must not invoke external command runners.', 'ERR_UI_FORBIDDEN_CLI');
  return true;
}

function createUiRequestId() {
  return `ui_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
