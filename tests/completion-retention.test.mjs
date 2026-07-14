import { strict as assert } from 'node:assert';
import {
  COMPLETION_RETENTION_DAYS,
  CompletionRetentionError,
  assertAcceptedNotCleanupEligible,
  completeRunAfterGateF,
  createRetentionTrigger,
  createWorkspaceCleanupPlan,
  startsRetention
} from '../packages/orchestrator/src/index.js';

const acceptedRun = {
  runId: 'run-1',
  state: 'Accepted',
  acceptedAt: '2026-07-14T10:00:00.000Z',
  branchName: 'londi/run-1',
  worktreePath: '/tmp/londi/run-1'
};
const gateFResult = {
  gate: 'Gate F',
  status: 'Verified',
  targetCommit: 'abc123',
  verifiedAt: '2026-07-14T10:05:00.000Z',
  containmentVerified: true,
  patchEquivalent: false
};

assert.equal(COMPLETION_RETENTION_DAYS, 7);
assert.equal(startsRetention('Completed'), true);
assert.equal(startsRetention('Accepted'), false);
assert.equal(assertAcceptedNotCleanupEligible(acceptedRun), true);
assert.equal(createWorkspaceCleanupPlan({ run: { ...acceptedRun }, now: '2026-08-01T00:00:00.000Z' }).eligible, false);
assert.equal(createRetentionTrigger({ run: acceptedRun }).eligible, false);
assert.equal(createRetentionTrigger({ run: acceptedRun }).reason, 'accepted-awaiting-gate-f');

const completed = completeRunAfterGateF({ run: acceptedRun, gateFResult, completedAt: '2026-07-14T10:06:00.000Z' });
assert.equal(completed.state, 'Completed');
assert.equal(completed.targetCommit, 'abc123');
assert.equal(completed.retentionStartedAt, '2026-07-14T10:06:00.000Z');
assert.equal(completed.retentionDays, 7);

const trigger = createRetentionTrigger({ run: completed, now: '2026-07-14T10:06:30.000Z' });
assert.equal(trigger.eligible, true);
assert.equal(trigger.retentionStarted, true);
assert.equal(trigger.retentionStartedAt, completed.completedAt);
assert.equal(trigger.cleanupEligibleAt, '2026-07-21T10:06:00.000Z');

const notYetCleanup = createWorkspaceCleanupPlan({ run: completed, now: '2026-07-20T10:06:00.000Z' });
assert.equal(notYetCleanup.eligible, false);
assert.equal(notYetCleanup.reasons.includes('retention-window-active'), true);
const cleanupReady = createWorkspaceCleanupPlan({ run: completed, now: '2026-07-22T10:06:00.000Z' });
assert.equal(cleanupReady.eligible, true);

assert.throws(() => completeRunAfterGateF({ run: { ...acceptedRun, state: 'Running' }, gateFResult }), CompletionRetentionError);
assert.throws(() => completeRunAfterGateF({ run: acceptedRun, gateFResult: { ...gateFResult, status: 'Needs Attention' } }), CompletionRetentionError);
assert.throws(() => createRetentionTrigger({ run: { ...completed, targetCommit: null } }), CompletionRetentionError);

console.log('Completion retention tests OK');
