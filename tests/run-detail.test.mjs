import { strict as assert } from 'node:assert';
import {
  RUN_DETAIL_EVENT_LIMIT,
  RunDetailError,
  assertRunDetailAccessibility,
  createApiClient,
  createMemoryTokenProvider,
  createRunDetailApiRequests,
  createRunDetailModel,
  getUiBootstrapModel,
  paginateRunEvents
} from '../apps/ui/src/index.js';

const events = Array.from({ length: 2105 }, (_, index) => ({
  id: `event-${index}`,
  timestamp: `2026-07-14T10:${String(index % 60).padStart(2, '0')}:00.000Z`,
  type: index % 2 ? 'log' : 'state',
  severity: index % 10 === 0 ? 'warning' : 'info',
  message: index === 2099 ? 'Bearer abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_' : `message ${index}`,
  payload: { message: `payload ${index}` }
}));

const model = createRunDetailModel({
  run: { id: 'run-1', title: 'Build feature', state: 'Running', resourceVersion: 'rv-1' },
  steps: [{ id: 'plan', state: 'Succeeded' }, { id: 'build', state: 'Running' }, { id: 'review', state: 'Pending' }],
  events,
  artifacts: [{ path: '/artifacts/review.md', category: 'review', size: 12, hash: 'abc' }],
  checkpoints: [{ id: 'chk-1', safeToResume: true }],
  actions: [{ action: 'cancel', label: 'Cancel', expectedTransition: 'Controlled stop saves checkpoint.' }],
  page: { cursor: 0, limit: 50, filters: { severity: 'warning' } }
});
assert.equal(model.progress.percent, 33);
assert.equal(model.progress.label, '1/3 steps complete');
assert.equal(model.logs.length, 50);
assert.equal(model.eventPage.truncatedToLast, RUN_DETAIL_EVENT_LIMIT);
assert.equal(model.artifacts[0].filename, 'review.md');
assert.equal(model.checkpoints[0].visual.label, 'Success');
assert.equal(model.stateStepper.items.every((item) => item.visual.label), true);
assert.equal(assertRunDetailAccessibility(model), true);
assert.equal(JSON.stringify(model).includes('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_'), false);

const page = paginateRunEvents(events, { cursor: 100, limit: 25, filters: { type: 'log' } });
assert.equal(page.events.length, 25);
assert.equal(page.page.nextCursor, 125);
assert.equal(page.page.cappedTotal, 2000);

const tokenProvider = createMemoryTokenProvider('local-token');
const apiClient = createApiClient({ tokenProvider });
const requests = createRunDetailApiRequests({ apiClient, runId: 'run-1', cursor: 5, limit: 10, requestId: 'req-detail' });
assert.equal(requests.run.url.endsWith('/runs/run-1'), true);
assert.equal(requests.events.url.includes('cursor=5&limit=10'), true);
assert.equal(requests.artifacts.url.endsWith('/runs/run-1/artifacts'), true);
assert.throws(() => createRunDetailModel({ run: { id: 'missing-state' } }), RunDetailError);
assert.equal(getUiBootstrapModel().runDetailSections.includes('logs'), true);

console.log('Run detail tests OK');
