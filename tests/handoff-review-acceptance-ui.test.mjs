import { strict as assert } from 'node:assert';
import {
  HandoffReviewAcceptanceError,
  assertHraAccessibility,
  assertHraActionAllowed,
  createApiClient,
  createHandoffReviewAcceptanceModel,
  createHandoffRevisionDiff,
  createHraApiRequests,
  createMemoryTokenProvider,
  evaluateRevisionFreshness,
  getUiBootstrapModel
} from '../apps/ui/src/index.js';

const previous = { revision: 1, hash: 'old', content: '## Objective\nOld' };
const current = { revision: 2, hash: 'new', content: '## Objective\nNew' };
const diff = createHandoffRevisionDiff({ previous, current });
assert.equal(diff.changed, true);
assert.equal(diff.lines.length, 1);

const fresh = createHandoffReviewAcceptanceModel({
  runId: 'run-1',
  resourceVersion: 'rv-2',
  latestResourceVersion: 'rv-2',
  handoff: { ...current, filename: 'handoff.md', previous, approved: false },
  review: {
    filename: 'review.md',
    hash: 'review-hash',
    summary: 'Critical issue',
    highestSeverity: 'Critical',
    findings: [{ severity: 'Critical', evidence: 'writes secret sk-1234567890ABCDEF', requiredFix: 'remove secret', sensitive: true }],
    requiredFixes: ['remove secret']
  },
  acceptanceSnapshot: {
    gate: 'Gate E',
    snapshotHash: 'snap-1',
    locked: true,
    diff: { files: ['src/a.js'] },
    tests: { passed: true },
    review: { hash: 'review-hash' },
    risks: { count: 1 },
    artifacts: { files: ['review.md'] }
  }
});
assert.equal(fresh.revisionState.stale, false);
assert.equal(fresh.sections.review.critical, true);
assert.equal(fresh.sections.review.findings[0].evidence.includes('sk-1234567890ABCDEF'), false);
assert.equal(fresh.sections.acceptance.locked, true);
assert.equal(assertHraActionAllowed(fresh, 'approve-critical-review'), true);
assert.equal(assertHraActionAllowed(fresh, 'accept'), true);
assert.equal(assertHraAccessibility(fresh), true);

const stale = createHandoffReviewAcceptanceModel({
  runId: 'run-1',
  resourceVersion: 'rv-1',
  latestResourceVersion: 'rv-2',
  handoff: current,
  acceptanceSnapshot: { snapshotHash: 'snap-1', locked: true, diff: {}, tests: {}, review: {}, risks: {}, artifacts: {} }
});
assert.equal(stale.revisionState.reloadRequired, true);
assert.throws(() => assertHraActionAllowed(stale, 'accept'), HandoffReviewAcceptanceError);
assert.equal(assertHraActionAllowed(stale, 'reload'), true);
assert.equal(evaluateRevisionFreshness({ resourceVersion: 'a', latestResourceVersion: 'b' }).visual.label, 'Stale revision');

const apiClient = createApiClient({ tokenProvider: createMemoryTokenProvider('local-token') });
const requests = createHraApiRequests({ apiClient, runId: 'run-1', requestId: 'req-hra' });
assert.equal(requests.handoff.url.endsWith('/runs/run-1/handoff'), true);
assert.equal(requests.review.url.endsWith('/runs/run-1/review'), true);
assert.equal(requests.acceptance.url.endsWith('/runs/run-1/acceptance'), true);
assert.equal(requests.decide('acceptance', { decision: 'accept' }).method, 'POST');
assert.equal(getUiBootstrapModel().handoffReviewAcceptanceSections.includes('acceptance'), true);

console.log('Handoff review acceptance UI tests OK');
