import { strict as assert } from 'node:assert';
import {
  API_BASE_PATH,
  ERROR_CODES,
  IDEMPOTENCY_KEY_HEADER,
  MAX_PAGE_LIMIT,
  REST_ENDPOINTS,
  RestContractError,
  assertRestRequestContract,
  createResourceResponse,
  createRestError,
  findRestEndpoint,
  listRestEndpoints,
  mapDomainErrorToRestError,
  normalizePagination,
  validateRestContracts
} from '../apps/local-api/src/index.js';

function captureThrow(fn) {
  try { fn(); } catch (error) { return error; }
  throw new Error('Expected function to throw.');
}

assert.equal(API_BASE_PATH, '/api/v1');
assert.equal(validateRestContracts(), true);
assert.equal(REST_ENDPOINTS.length, 45);
assert.equal(listRestEndpoints().every((item) => item.fullPath.startsWith('/api/v1')), true);
assert.equal(findRestEndpoint('GET', '/api/v1/runs/run-1/logs').path, '/runs/{runId}/logs');
assert.equal(findRestEndpoint('POST', '/api/v1/approvals/a1/decision').concurrency, true);
assert.equal(findRestEndpoint('GET', '/api/v1/secret-aliases').command, false);
assert.equal(findRestEndpoint('GET', '/api/v1/agents').command, false);
assert.equal(findRestEndpoint('GET', '/api/v1/skills').command, false);
assert.equal(findRestEndpoint('GET', '/api/v1/projects').paginated, true);
assert.equal(findRestEndpoint('GET', '/api/v1/projects/client-ai-os/browser').paginated, true);
assert.equal(findRestEndpoint('PUT', '/api/v1/projects/client-ai-os').idempotent, true);
assert.equal(findRestEndpoint('GET', '/api/v1/obsidian/status').command, false);
assert.equal(findRestEndpoint('POST', '/api/v1/runs/obsidian-summary').idempotent, true);
assert.equal(createResourceResponse({ resourceVersion: 'v1', data: { action: 'ask-agent-zero-general-task', path: '/vault/run-1.md' } }).body.data.action, 'ask-agent-zero-general-task');
assert.equal(createResourceResponse({ resourceVersion: 'v1', data: { message: 'secret sk-1234567890abcdef' } }).body.data.message, 'secret [REDACTED]');

const read = assertRestRequestContract({ method: 'GET', path: '/api/v1/runs', headers: {}, authenticated: true });
assert.equal(read.ok, true);
assert.equal(read.endpoint.paginated, true);

const write = assertRestRequestContract({ method: 'POST', path: '/api/v1/runs', headers: { [IDEMPOTENCY_KEY_HEADER]: 'idem-1' }, authenticated: true });
assert.equal(write.endpoint.idempotent, true);
assert.throws(() => assertRestRequestContract({ method: 'POST', path: '/api/v1/runs', authenticated: true }), RestContractError);
const unauth = captureThrow(() => assertRestRequestContract({ method: 'POST', path: '/api/v1/runs', authenticated: false }));
assert.equal(unauth instanceof RestContractError, true);
assert.equal(unauth.details.body.error.code, ERROR_CODES.unauthorized);
const stale = captureThrow(() => assertRestRequestContract({ method: 'PATCH', path: '/api/v1/runs/r1', headers: { [IDEMPOTENCY_KEY_HEADER]: 'idem-2' }, authenticated: true }));
assert.equal(stale instanceof RestContractError, true);
assert.equal(stale.details.body.error.code, ERROR_CODES.staleRevision);

assert.deepEqual(normalizePagination({ limit: 25, cursor: 'c1', nextCursor: 'c2' }), { limit: 25, cursor: 'c1', nextCursor: 'c2', total: null });
assert.throws(() => normalizePagination({ limit: MAX_PAGE_LIMIT + 1 }), RestContractError);
const response = createResourceResponse({ requestId: 'req-1', resourceVersion: 'rv-1', data: { id: 'r1', token: 'secret-token-value' }, page: { limit: 10 } });
assert.equal(response.headers.etag, 'rv-1');
assert.equal(response.body.requestId, 'req-1');
assert.equal(JSON.stringify(response).includes('secret-token-value'), false);
const artifactResponse = createResourceResponse({ requestId: 'req-artifact', resourceVersion: 'rv-artifact', data: { artifactPath: 'data/obsidian-vault/Londi Agent OS/Runs/2026-07-16__run-live-obsidian-connect__live-obsidian-connection.md' } });
assert.equal(artifactResponse.body.data.artifactPath.endsWith('live-obsidian-connection.md'), true);

const validationError = createRestError({ code: ERROR_CODES.validation, requestId: 'req-2', message: 'Bad token=secret-token-value', validation: [{ field: 'name', message: 'contains sk-test-secret-value' }] });
assert.equal(validationError.details.statusCode, 400);
assert.equal(validationError.details.body.error.requestId, 'req-2');
assert.equal(JSON.stringify(validationError.details).includes('secret-token-value'), false);
assert.equal(JSON.stringify(validationError.details).includes('sk-test-secret-value'), false);

class StaleRevisionError extends Error { constructor(){ super('stale'); this.name='StaleRevisionError'; this.code='ERR_STALE_REVISION'; } }
const mapped = mapDomainErrorToRestError(new StaleRevisionError(), { requestId: 'req-3' });
assert.equal(mapped.details.body.error.code, ERROR_CODES.staleRevision);
assert.equal(mapped.details.body.error.retryable, true);

console.log('REST contract tests OK');
