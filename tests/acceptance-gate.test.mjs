import { strict as assert } from 'node:assert';
import {
  ACCEPTANCE_APPROVAL_KIND,
  ACCEPTANCE_GATE_ID,
  AcceptanceGateError,
  assertAcceptanceSnapshot,
  createAcceptanceGate,
  createAcceptancePayload,
  createAcceptanceSnapshot,
  decideAcceptanceGate,
  hashApprovalPayload,
  invalidateAcceptanceOnSnapshotChange
} from '../packages/orchestrator/src/index.js';

const baseSnapshotInput = {
  runId: 'run-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  diff: { summary: '2 files changed', patchHash: 'diff-hash' },
  tests: { status: 'passed', commands: ['npm run ci'] },
  review: { highestSeverity: 'Low', hash: 'review-hash' },
  risks: { items: ['manual merge still required'] },
  artifacts: { manifestHash: 'manifest-hash', records: ['handoff', 'review'] }
};

const snapshot = createAcceptanceSnapshot(baseSnapshotInput);
assert.equal(snapshot.gate, ACCEPTANCE_GATE_ID);
assert.equal(snapshot.locked, true);
assert.ok(snapshot.snapshotHash);
assert.equal(assertAcceptanceSnapshot(snapshot), true);

const payload = createAcceptancePayload(snapshot);
assert.equal(payload.sections.diff.hash.length, 64);
assert.deepEqual(payload.sections.tests.keys, ['commands', 'status']);

const request = createAcceptanceGate({ id: 'gate-e-1', snapshot, requestedAt: '2026-01-01T00:01:00.000Z' });
assert.equal(request.kind, ACCEPTANCE_APPROVAL_KIND);
assert.equal(request.scope.gate, ACCEPTANCE_GATE_ID);
assert.equal(request.payloadHash, hashApprovalPayload(payload));
assert.equal(request.revisionHash, snapshot.snapshotHash);

const acceptDecision = decideAcceptanceGate(request, {
  actor: 'londi',
  decision: 'accept',
  payloadHash: request.payloadHash,
  revisionHash: request.revisionHash,
  timestamp: '2026-01-01T00:05:00.000Z'
});
assert.equal(acceptDecision.state, 'Approved');
assert.equal(acceptDecision.acceptanceDecision, 'accept');
assert.equal(acceptDecision.targetRunState, 'Accepted');

const requestChanges = decideAcceptanceGate(request, {
  actor: 'londi',
  decision: 'request-changes',
  reason: 'Need a safer rollout note.',
  payloadHash: request.payloadHash,
  revisionHash: request.revisionHash,
  timestamp: '2026-01-01T00:06:00.000Z'
});
assert.equal(requestChanges.state, 'Rejected');
assert.equal(requestChanges.targetRunState, 'Needs Attention');
assert.equal(requestChanges.reasonSaved, true);

const changedSnapshot = createAcceptanceSnapshot({ ...baseSnapshotInput, diff: { summary: '3 files changed', patchHash: 'new-diff' } });
assert.equal(invalidateAcceptanceOnSnapshotChange(request, snapshot), request);
assert.equal(invalidateAcceptanceOnSnapshotChange(request, changedSnapshot).state, 'Invalidated');

assert.throws(() => decideAcceptanceGate(request, {
  actor: 'londi',
  decision: 'request-changes',
  payloadHash: request.payloadHash,
  revisionHash: request.revisionHash
}), AcceptanceGateError);
assert.throws(() => createAcceptanceSnapshot({ ...baseSnapshotInput, review: null }), AcceptanceGateError);
assert.throws(() => assertAcceptanceSnapshot({ ...snapshot, diff: { summary: 'tampered' } }), AcceptanceGateError);

console.log('Acceptance gate tests OK');
