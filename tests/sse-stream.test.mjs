import { strict as assert } from 'node:assert';
import {
  assertNoSecretPayload,
  createHeartbeatEvent,
  createInMemoryEventStore,
  createSseHeaders,
  createSseStreamContract,
  formatSseEvent,
  parseSseRequest,
  replayEvents,
  SSE_EVENTS_PATH,
  SseStreamError,
  STREAM_RESET_EVENT_TYPE
} from '../apps/local-api/src/index.js';

const contract = createSseStreamContract({ batchSize: 2, heartbeatMs: 5000, retentionFloorEventId: 2 });
assert.equal(contract.path, '/api/v1/events');
assert.equal(contract.batchSize, 2);
assert.equal(contract.eventTypes.includes(STREAM_RESET_EVENT_TYPE), true);
assert.equal(createSseHeaders()['content-type'].startsWith('text/event-stream'), true);

const parsed = parseSseRequest({ url: `${SSE_EVENTS_PATH}?runId=run-1&limit=2`, headers: { 'Last-Event-ID': '2', 'x-request-id': 'req-sse' } }, contract);
assert.equal(parsed.runId, 'run-1');
assert.equal(parsed.lastEventId, 2);
assert.equal(parsed.limit, 2);
assert.equal(parsed.requestId, 'req-sse');
assert.throws(() => parseSseRequest({ url: '/api/v1/missing', headers: {} }, contract), SseStreamError);
assert.throws(() => parseSseRequest({ url: SSE_EVENTS_PATH, headers: { 'Last-Event-ID': '-1' } }, contract), SseStreamError);

const store = createInMemoryEventStore();
store.appendEvent({ type: 'run.created', runId: 'run-1', payloadRedacted: { title: 'safe' } });
store.appendEvent({ type: 'step.progress', runId: 'run-1', stepId: 'step-1', payloadRedacted: { percent: 50, secret: 'secret-token-value' } });
store.appendEvent({ type: 'run.created', runId: 'run-2', payloadRedacted: { title: 'other' } });
store.appendEvent({ type: 'log.appended', runId: 'run-1', payloadRedacted: { line: 'Bearer abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_' } });

const reset = replayEvents(store, { lastEventId: 1, runId: 'run-1', limit: 2, requestId: 'req-old' }, contract);
assert.equal(reset.length, 1);
assert.equal(reset[0].type, STREAM_RESET_EVENT_TYPE);
assert.equal(reset[0].payload.action, 'load.snapshot.rest');

const replay = replayEvents(store, { lastEventId: 2, runId: 'run-1', limit: 10, requestId: 'req-ok' }, contract);
assert.equal(replay.length, 1);
assert.equal(replay[0].type, 'log.appended');
assert.equal(JSON.stringify(replay).includes('Bearer abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_'), false);
assert.equal(JSON.stringify(replay).includes('secret-token-value'), false);
assert.equal(assertNoSecretPayload(replay), true);

const heartbeat = createHeartbeatEvent({ eventId: 4, requestId: 'req-heartbeat' });
assert.equal(heartbeat.type, 'heartbeat');
assert.equal(formatSseEvent(heartbeat).includes('event: heartbeat'), true);
assert.equal(formatSseEvent(replay[0]).includes('id: 4'), true);
assert.throws(() => assertNoSecretPayload([{ payload: 'sk-test-secret-value' }]), SseStreamError);

console.log('SSE stream tests OK');
