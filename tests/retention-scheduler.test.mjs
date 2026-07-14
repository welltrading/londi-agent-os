import { strict as assert } from 'node:assert';
import {
  AUDIT_RETENTION_DAYS,
  COMPLETED_RETENTION_DAYS,
  TERMINAL_RETENTION_DAYS,
  RetentionSchedulerError,
  assertAcceptedRunsNotDeleted,
  createAuditRetentionPlan,
  createDailyRetentionSchedule,
  createInMemoryEventStore,
  createRetentionSchedulerRun
} from '../packages/orchestrator/src/index.js';

const now = '2026-07-14T00:00:00.000Z';
const oldCompleted = '2026-07-01T00:00:00.000Z';
const oldTerminal = '2026-06-01T00:00:00.000Z';
const recentTerminal = '2026-07-01T00:00:00.000Z';
const runs = [
  { runId: 'completed-old', state: 'Completed', completedAt: oldCompleted, mergeVerifiedAt: oldCompleted, targetCommit: 'abc', branchName: 'londi/completed-old', worktreePath: '/tmp/completed-old' },
  { runId: 'failed-old', state: 'Failed', terminalAt: oldTerminal, worktreePath: '/tmp/failed-old' },
  { runId: 'cancelled-recent', state: 'Cancelled', terminalAt: recentTerminal, worktreePath: '/tmp/cancelled-recent' },
  { runId: 'needs-attention-old', state: 'Needs Attention', terminalAt: oldTerminal, keep: true, worktreePath: '/tmp/needs-attention-old' },
  { runId: 'accepted-old', state: 'Accepted', acceptedAt: oldCompleted, worktreePath: '/tmp/accepted-old' },
  { runId: 'running-old', state: 'Running', updatedAt: oldTerminal, worktreePath: '/tmp/running-old' }
];

assert.equal(COMPLETED_RETENTION_DAYS, 7);
assert.equal(TERMINAL_RETENTION_DAYS, 30);
assert.equal(AUDIT_RETENTION_DAYS, 365);
assert.deepEqual(createDailyRetentionSchedule({ hour: 4, minute: 30, timezone: 'Asia/Jerusalem' }), {
  schedulerId: 'daily-retention-scheduler',
  cadence: 'daily',
  hour: 4,
  minute: 30,
  timezone: 'Asia/Jerusalem',
  dryRunSupported: true
});
assert.throws(() => createDailyRetentionSchedule({ hour: 24 }), RetentionSchedulerError);

const store = createInMemoryEventStore();
const dryRun = createRetentionSchedulerRun({ runs, eventStore: store, now, dryRun: true });
assert.equal(dryRun.dryRun, true);
assert.equal(dryRun.totalRuns, runs.length);
assert.equal(dryRun.eligibleCount, 2);
assert.equal(dryRun.executions.length, 0);
assert.equal(dryRun.plans.find((plan) => plan.runId === 'completed-old').eligible, true);
assert.equal(dryRun.plans.find((plan) => plan.runId === 'completed-old').retentionDays, 7);
assert.equal(dryRun.plans.find((plan) => plan.runId === 'failed-old').eligible, true);
assert.equal(dryRun.plans.find((plan) => plan.runId === 'failed-old').retentionDays, 30);
assert.equal(dryRun.plans.find((plan) => plan.runId === 'accepted-old').eligible, false);
assert.equal(dryRun.plans.find((plan) => plan.runId === 'accepted-old').reasons.includes('accepted-awaiting-merge-verification'), true);
assert.equal(dryRun.plans.find((plan) => plan.runId === 'cancelled-recent').reasons.includes('retention-window-active'), true);
assert.equal(dryRun.plans.find((plan) => plan.runId === 'needs-attention-old').reasons.includes('keep-enabled'), true);
assert.equal(store.listAudit({}).length, 1);
assert.equal(store.listAudit({})[0].action, 'retention-dry-run');
assert.equal(assertAcceptedRunsNotDeleted(dryRun.plans), true);

const executed = [];
const cleanup = createRetentionSchedulerRun({
  runs,
  now,
  dryRun: false,
  repositoryPathByRunId: { 'completed-old': '/repo', 'failed-old': '/repo' },
  execute: ({ repositoryPath, plan }) => {
    executed.push({ repositoryPath, runId: plan.runId });
    return { runId: plan.runId, results: [{ action: 'mock-cleanup', status: 'done' }] };
  }
});
assert.equal(cleanup.executions.length, 2);
assert.deepEqual(executed.map((item) => item.runId), ['completed-old', 'failed-old']);
assert.equal(cleanup.audit.action, 'retention-cleanup');

assert.throws(
  () => createRetentionSchedulerRun({ runs: [runs[0]], now, dryRun: false, repositoryPathByRunId: {}, execute: () => ({}) }),
  RetentionSchedulerError
);

const auditPlan = createAuditRetentionPlan({
  now: '2026-07-14T00:00:00.000Z',
  auditEntries: [
    { id: 'old', createdAt: '2025-01-01T00:00:00.000Z' },
    { id: 'fresh', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'unknown' }
  ]
});
assert.equal(auditPlan.retentionDays, 365);
assert.equal(auditPlan.expired.map((entry) => entry.id).includes('old'), true);
assert.equal(auditPlan.retained.map((entry) => entry.id).includes('fresh'), true);
assert.equal(auditPlan.retained.find((entry) => entry.id === 'unknown').retentionReason, 'missing-or-invalid-created-at');

assert.throws(() => assertAcceptedRunsNotDeleted([{ runId: 'bad', state: 'Accepted', eligible: true }]), RetentionSchedulerError);

console.log('Retention scheduler tests OK');
