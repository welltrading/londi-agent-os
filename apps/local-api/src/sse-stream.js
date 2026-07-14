import { createRequestId, sanitizeForLog } from './logging.js';
import { API_BASE_PATH } from './rest-contracts.js';

export const SSE_EVENTS_PATH = `${API_BASE_PATH}/events`;
export const STREAM_RESET_EVENT_TYPE = 'stream.reset.required';
export const SSE_HEARTBEAT_EVENT_TYPE = 'heartbeat';
export const DEFAULT_SSE_BATCH_SIZE = 100;
export const MAX_SSE_BATCH_SIZE = 500;

export class SseStreamError extends Error {
  constructor(message, code = 'ERR_SSE_STREAM', details = {}) {
    super(message);
    this.name = 'SseStreamError';
    this.code = code;
    this.details = details;
  }
}

export function createSseStreamContract(options = {}) {
  const batchSize = normalizeBatchSize(options.batchSize ?? DEFAULT_SSE_BATCH_SIZE);
  const heartbeatMs = normalizeHeartbeatMs(options.heartbeatMs ?? 15_000);
  const retentionFloorEventId = Number.parseInt(options.retentionFloorEventId ?? 0, 10);

  return Object.freeze({
    path: SSE_EVENTS_PATH,
    batchSize,
    heartbeatMs,
    retentionFloorEventId,
    eventTypes: Object.freeze([
      'run.created', 'run.state.changed', 'run.completed',
      'step.started', 'step.progress', 'step.state.changed', 'step.finished',
      'agent.heartbeat', 'agent.unresponsive', 'agent.failed', 'agent.recovered',
      'preflight.started', 'preflight.check', 'preflight.finished',
      'approval.requested', 'approval.decided', 'approval.expired',
      'artifact.created', 'handoff.updated', 'review.updated', 'checkpoint.created',
      'log.appended', 'recovery.required', 'recovery.completed',
      'git.diff.updated', 'git.merge.verification',
      'security.action.blocked', 'secret.grant.changed',
      'backup.completed', 'restore.completed', 'update.changed',
      STREAM_RESET_EVENT_TYPE, SSE_HEARTBEAT_EVENT_TYPE
    ])
  });
}

export function parseSseRequest({ url = SSE_EVENTS_PATH, headers = {} } = {}, contract = createSseStreamContract()) {
  const parsed = new URL(url, 'http://127.0.0.1');
  if (parsed.pathname !== SSE_EVENTS_PATH) throw new SseStreamError('SSE endpoint not found.', 'ERR_SSE_NOT_FOUND', { path: parsed.pathname });
  const lastEventId = parseOptionalEventId(headers['last-event-id'] ?? headers['Last-Event-ID']);
  const runId = parsed.searchParams.get('runId');
  const limit = normalizeBatchSize(parsed.searchParams.get('limit') ?? contract.batchSize);
  return Object.freeze({ requestId: String(headers['x-request-id'] ?? createRequestId()), runId, lastEventId, limit });
}

export function replayEvents(store, request, contract = createSseStreamContract()) {
  const parsed = typeof request?.lastEventId === 'number' ? request : parseSseRequest(request, contract);
  if (parsed.lastEventId !== null && parsed.lastEventId < contract.retentionFloorEventId) {
    return [createStreamResetEvent({ requestId: parsed.requestId, lastEventId: parsed.lastEventId, retentionFloorEventId: contract.retentionFloorEventId })];
  }
  const afterEventId = parsed.lastEventId ?? 0;
  const events = store.listEvents({ afterEventId, limit: Math.min(parsed.limit ?? contract.batchSize, contract.batchSize) });
  return events
    .filter((event) => !parsed.runId || event.runId === parsed.runId)
    .map((event) => normalizeSseEvent(event));
}

export function normalizeSseEvent(event = {}) {
  if (!Number.isInteger(event.eventId)) throw new SseStreamError('SSE eventId must be an integer.', 'ERR_SSE_EVENT_ID');
  if (!event.type) throw new SseStreamError('SSE event type is required.', 'ERR_SSE_EVENT_TYPE');
  const payload = redactSsePayload(event.payloadRedacted ?? event.payload ?? {});
  return Object.freeze({
    eventId: event.eventId,
    type: event.type,
    timestamp: event.timestamp ?? new Date().toISOString(),
    runId: event.runId ?? null,
    stepId: event.stepId ?? null,
    severity: event.severity ?? 'info',
    payload
  });
}

export function createHeartbeatEvent({ eventId = 0, requestId = createRequestId() } = {}) {
  return Object.freeze({ eventId, type: SSE_HEARTBEAT_EVENT_TYPE, timestamp: new Date().toISOString(), runId: null, stepId: null, severity: 'debug', payload: { requestId } });
}

export function createStreamResetEvent({ requestId = createRequestId(), lastEventId, retentionFloorEventId } = {}) {
  return Object.freeze({
    eventId: retentionFloorEventId,
    type: STREAM_RESET_EVENT_TYPE,
    timestamp: new Date().toISOString(),
    runId: null,
    stepId: null,
    severity: 'warn',
    payload: { requestId, lastEventId, retentionFloorEventId, action: 'load.snapshot.rest' }
  });
}

export function formatSseEvent(event) {
  const normalized = normalizeSseEvent(event);
  return [`id: ${normalized.eventId}`, `event: ${normalized.type}`, `data: ${JSON.stringify(normalized)}`, ''].join('\n') + '\n';
}

export function createSseHeaders() {
  return Object.freeze({
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no'
  });
}

export function assertNoSecretPayload(events) {
  const text = JSON.stringify(events);
  if (/(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._~+\/-]+=*|secret-token-value)/.test(text)) {
    throw new SseStreamError('SSE payload contains an unredacted secret.', 'ERR_SSE_SECRET_PAYLOAD');
  }
  return true;
}

function parseOptionalEventId(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(Array.isArray(value) ? value[0] : value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) throw new SseStreamError('Last-Event-ID must be a non-negative integer.', 'ERR_SSE_LAST_EVENT_ID', { value });
  return parsed;
}

function normalizeBatchSize(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_SSE_BATCH_SIZE) throw new SseStreamError('SSE batch size is outside allowed range.', 'ERR_SSE_BATCH_SIZE', { value });
  return parsed;
}

function normalizeHeartbeatMs(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1_000 || parsed > 60_000) throw new SseStreamError('SSE heartbeat interval is outside allowed range.', 'ERR_SSE_HEARTBEAT', { value });
  return parsed;
}

function redactSsePayload(value) {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(redactSsePayload);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, /token|password|secret|credential|api[_-]?key/i.test(key) ? '[REDACTED]' : redactSsePayload(child)]));
  if (typeof value === 'string') return sanitizeForLog(value);
  return value;
}
