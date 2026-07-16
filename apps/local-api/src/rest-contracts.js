import { createRequestId, sanitizeForLog } from './logging.js';

export const API_VERSION = 'v1';
export const API_BASE_PATH = '/api/v1';
export const RESOURCE_VERSION_HEADER = 'etag';
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

export const ERROR_CODES = Object.freeze({
  validation: 'validation',
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  conflict: 'conflict',
  staleRevision: 'stale_revision',
  blockedPreflight: 'blocked_preflight',
  invalidTransition: 'invalid_transition',
  notFound: 'not_found',
  rateLimited: 'rate_limited',
  internal: 'internal',
  idempotencyRequired: 'idempotency_required'
});

export const REST_ENDPOINTS = Object.freeze([
  endpoint('POST', '/runs', { command: true, idempotent: true }),
  endpoint('GET', '/runs', { paginated: true }),
  endpoint('GET', '/runs/{runId}'),
  endpoint('PATCH', '/runs/{runId}', { command: true, idempotent: true, concurrency: true }),
  endpoint('POST', '/runs/{runId}/preflight', { command: true, idempotent: true }),
  endpoint('GET', '/runs/{runId}/recommendations'),
  endpoint('POST', '/runs/{runId}/pipeline-approval', { command: true, idempotent: true, concurrency: true }),
  endpoint('POST', '/runs/{runId}/start', { command: true, idempotent: true }),
  endpoint('POST', '/runs/{runId}/cancel', { command: true, idempotent: true }),
  endpoint('GET', '/runs/{runId}/handoff'),
  endpoint('PUT', '/runs/{runId}/handoff', { command: true, idempotent: true, concurrency: true }),
  endpoint('POST', '/runs/{runId}/handoff-approval', { command: true, idempotent: true, concurrency: true }),
  endpoint('GET', '/runs/{runId}/review', { paginated: true }),
  endpoint('POST', '/runs/{runId}/acceptance', { command: true, idempotent: true, concurrency: true }),
  endpoint('POST', '/runs/{runId}/merge-verification', { command: true, idempotent: true, concurrency: true }),
  endpoint('POST', '/runs/{runId}/retry', { command: true, idempotent: true }),
  endpoint('POST', '/runs/{runId}/replace-agent', { command: true, idempotent: true }),
  endpoint('POST', '/runs/{runId}/resume', { command: true, idempotent: true }),
  endpoint('GET', '/runs/{runId}/checkpoints', { paginated: true }),
  endpoint('GET', '/runs/{runId}/artifacts', { paginated: true }),
  endpoint('GET', '/runs/{runId}/diff', { paginated: true }),
  endpoint('GET', '/runs/{runId}/logs', { paginated: true, cursor: true }),
  endpoint('GET', '/approvals', { paginated: true }),
  endpoint('POST', '/approvals/{approvalId}/decision', { command: true, idempotent: true, concurrency: true }),
  endpoint('GET', '/runs/{runId}/context'),
  endpoint('PUT', '/runs/{runId}/context', { command: true, idempotent: true, concurrency: true }),
  endpoint('GET', '/secret-aliases'),
  endpoint('POST', '/runs/{runId}/secret-grants', { command: true, idempotent: true }),
  endpoint('GET', '/runs/{runId}/audit', { paginated: true }),
  endpoint('POST', '/runs/{runId}/audit-export', { command: true, idempotent: true }),
  endpoint('GET', '/system/health'),
  endpoint('GET', '/system/adapters'),
  endpoint('GET', '/agents'),
  endpoint('GET', '/skills'),
  endpoint('GET', '/projects', { paginated: true }),
  endpoint('PUT', '/projects/{projectId}', { command: true, idempotent: true }),
  endpoint('GET', '/obsidian/status'),
  endpoint('POST', '/runs/obsidian-summary', { command: true, idempotent: true }),
  endpoint('POST', '/maintenance/backups', { command: true, idempotent: true }),
  endpoint('GET', '/maintenance/backups', { paginated: true }),
  endpoint('POST', '/maintenance/restore', { command: true, idempotent: true }),
  endpoint('GET', '/maintenance/updates'),
  endpoint('POST', '/maintenance/updates/{version}/install', { command: true, idempotent: true, concurrency: true }),
  endpoint('POST', '/maintenance/rollback', { command: true, idempotent: true })
]);

export class RestContractError extends Error {
  constructor(message = 'Invalid REST contract operation.', details = {}) {
    super(message);
    this.name = 'RestContractError';
    this.code = 'ERR_REST_CONTRACT';
    this.details = details;
  }
}

export function listRestEndpoints() {
  return REST_ENDPOINTS.map((item) => ({ ...item }));
}

export function findRestEndpoint(method, path) {
  const normalizedMethod = String(method ?? '').toUpperCase();
  const normalizedPath = normalizeApiPath(path);
  return REST_ENDPOINTS.find((candidate) => candidate.method === normalizedMethod && matchEndpointPath(candidate.path, normalizedPath)) ?? null;
}

export function assertRestRequestContract({ method, path, headers = {}, authenticated = false } = {}) {
  const endpoint = findRestEndpoint(method, path);
  const requestId = String(headers['x-request-id'] ?? headers['X-Request-ID'] ?? createRequestId());
  if (!endpoint) throw createRestError({ code: ERROR_CODES.notFound, requestId, message: 'Endpoint not found.', statusCode: 404 });
  if (authenticated !== true) throw createRestError({ code: ERROR_CODES.unauthorized, requestId, message: 'Bearer token is required.', statusCode: 401 });
  if (endpoint.idempotent && !readHeader(headers, IDEMPOTENCY_KEY_HEADER)) throw createRestError({ code: ERROR_CODES.idempotencyRequired, requestId, message: 'Idempotency key is required for write commands.', statusCode: 400 });
  if (endpoint.concurrency && !readHeader(headers, 'if-match')) throw createRestError({ code: ERROR_CODES.staleRevision, requestId, message: 'Resource version is required for optimistic concurrency.', statusCode: 409, retryable: true });
  return Object.freeze({ endpoint, requestId, ok: true });
}

export function createResourceResponse({ requestId = createRequestId(), resourceVersion, data = null, page = null, statusCode = 200 } = {}) {
  if (!resourceVersion) throw new RestContractError('Resource version is required in REST responses.');
  const body = { requestId, resourceVersion, data: redactApiPayload(data) };
  if (page) body.page = normalizePagination(page);
  return deepFreezeRest({ statusCode, headers: { [RESOURCE_VERSION_HEADER]: resourceVersion, 'x-request-id': requestId }, body });
}

export function normalizePagination({ limit = DEFAULT_PAGE_LIMIT, cursor = null, nextCursor = null, total = null } = {}) {
  const normalizedLimit = Number.parseInt(limit, 10);
  if (!Number.isInteger(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > MAX_PAGE_LIMIT) throw new RestContractError('Pagination limit is outside allowed range.', { limit });
  return deepFreezeRest({ limit: normalizedLimit, cursor, nextCursor, total });
}

export function createRestError({ code, message, requestId = createRequestId(), statusCode = statusForErrorCode(code), retryable = false, validation = [] } = {}) {
  if (!Object.values(ERROR_CODES).includes(code)) throw new RestContractError('Unknown stable REST error code.', { code });
  const safeValidation = validation.map((item) => ({ field: String(item.field ?? 'unknown'), message: sanitizeForLog(item.message ?? 'Invalid value') }));
  const error = deepFreezeRest({ statusCode, body: { error: { code, message: sanitizeForLog(message ?? code), requestId, retryable: Boolean(retryable), validation: safeValidation } } });
  return Object.assign(new RestContractError(error.body.error.message, error), error);
}

export function mapDomainErrorToRestError(error, { requestId = createRequestId() } = {}) {
  const name = error?.name ?? '';
  const code = error?.code ?? '';
  if (name.includes('Stale') || code.includes('STALE')) return createRestError({ code: ERROR_CODES.staleRevision, statusCode: 409, requestId, message: 'Resource revision is stale.', retryable: true });
  if (name.includes('Preflight') || code.includes('PREFLIGHT')) return createRestError({ code: ERROR_CODES.blockedPreflight, statusCode: 409, requestId, message: 'Preflight blocked the command.' });
  if (name.includes('Transition') || code.includes('TRANSITION')) return createRestError({ code: ERROR_CODES.invalidTransition, statusCode: 409, requestId, message: 'Invalid state transition.' });
  if (name.includes('Auth') || code.includes('AUTH')) return createRestError({ code: ERROR_CODES.unauthorized, statusCode: 401, requestId, message: 'Unauthorized.' });
  if (name.includes('Validation') || code.includes('VALIDATION')) return createRestError({ code: ERROR_CODES.validation, statusCode: 400, requestId, message: 'Validation failed.', validation: [{ field: 'request', message: error?.message ?? 'Invalid request' }] });
  return createRestError({ code: ERROR_CODES.internal, statusCode: 500, requestId, message: 'Internal error.' });
}

export function validateRestContracts() {
  const seen = new Set();
  for (const item of REST_ENDPOINTS) {
    if (!item.fullPath.startsWith(API_BASE_PATH)) throw new RestContractError('Endpoint must be under /api/v1.', { item });
    const key = `${item.method} ${item.path}`;
    if (seen.has(key)) throw new RestContractError('Duplicate REST endpoint contract.', { key });
    seen.add(key);
    if (item.command && item.idempotent !== true) throw new RestContractError('Write command must be idempotent.', { key });
  }
  return true;
}

function endpoint(method, path, options = {}) {
  return Object.freeze({ method, path, fullPath: `${API_BASE_PATH}${path}`, command: false, idempotent: false, concurrency: false, paginated: false, cursor: false, ...options });
}

function normalizeApiPath(path) {
  const raw = String(path ?? '').split('?')[0];
  return raw.startsWith(API_BASE_PATH) ? raw.slice(API_BASE_PATH.length) || '/' : raw;
}

function matchEndpointPath(pattern, path) {
  const regex = new RegExp(`^${pattern.replace(/\{[^/]+\}/g, '[^/]+')}$`);
  return regex.test(path);
}

function readHeader(headers, name) {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) if (key.toLowerCase() === lower) return Array.isArray(value) ? value[0] : value;
  return null;
}

function statusForErrorCode(code) {
  return {
    [ERROR_CODES.validation]: 400,
    [ERROR_CODES.unauthorized]: 401,
    [ERROR_CODES.forbidden]: 403,
    [ERROR_CODES.notFound]: 404,
    [ERROR_CODES.conflict]: 409,
    [ERROR_CODES.staleRevision]: 409,
    [ERROR_CODES.blockedPreflight]: 409,
    [ERROR_CODES.invalidTransition]: 409,
    [ERROR_CODES.rateLimited]: 429,
    [ERROR_CODES.idempotencyRequired]: 400,
    [ERROR_CODES.internal]: 500
  }[code] ?? 500;
}

function redactApiPayload(value) {
  if (value === undefined) return null;
  return redactSensitiveKeys(value);
}

function redactSensitiveKeys(value) {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(redactSensitiveKeys);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      /token|password|secret|credential|api[_-]?key/i.test(key) ? '[REDACTED]' : redactSensitiveKeys(child)
    ]));
  }
  if (typeof value === 'string') {
    return sanitizeApiString(value);
  }
  return value;
}

function sanitizeApiString(value) {
  return String(value)
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
    .replace(/ghp_[A-Za-z0-9]{20,}/g, '[REDACTED]')
    .replace(/xox[baprs]-[A-Za-z0-9-]{20,}/g, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/(token|password|secret|credential|api[_-]?key)=([^\s&]+)/gi, '$1=[REDACTED]')
    .replace(/[\r\n\u2028\u2029]+/g, ' ');
}

function deepFreezeRest(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeRest(child);
  return Object.freeze(value);
}
