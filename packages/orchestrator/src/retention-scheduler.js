import { createWorkspaceCleanupPlan, executeWorkspaceCleanupPlan } from './workspace-manager.js';
import { appendEventAndAudit } from './event-store.js';

export const RETENTION_SCHEDULER_ID = 'daily-retention-scheduler';
export const AUDIT_RETENTION_DAYS = 365;
export const TERMINAL_RETENTION_DAYS = 30;
export const COMPLETED_RETENTION_DAYS = 7;

export class RetentionSchedulerError extends Error {
  constructor(message = 'Retention scheduler failed.', code = 'ERR_RETENTION_SCHEDULER', details = {}) {
    super(message);
    this.name = 'RetentionSchedulerError';
    this.code = code;
    this.details = details;
  }
}

export function createRetentionSchedulerRun({
  runs = [],
  repositoryPathByRunId = {},
  eventStore,
  now = new Date().toISOString(),
  dryRun = true,
  execute = executeWorkspaceCleanupPlan
} = {}) {
  if (!Array.isArray(runs)) throw new RetentionSchedulerError('Runs must be an array.', 'ERR_RETENTION_RUNS');
  const plans = runs.map((run) => createWorkspaceCleanupPlan({ run, now }));
  const eligiblePlans = plans.filter((plan) => plan.eligible === true);
  const executions = [];

  if (dryRun !== true) {
    for (const plan of eligiblePlans) {
      const repositoryPath = repositoryPathByRunId[plan.runId];
      if (!repositoryPath) throw new RetentionSchedulerError('Repository path is required to execute cleanup.', 'ERR_RETENTION_REPOSITORY', { runId: plan.runId });
      executions.push(execute({ repositoryPath, plan }));
    }
  }

  const audit = createRetentionAuditEntry({ plans, executions, now, dryRun });
  let eventAudit = null;
  if (eventStore) {
    eventAudit = appendEventAndAudit(eventStore, {
      event: {
        type: 'retention.scheduler.run',
        runId: null,
        severity: eligiblePlans.length > 0 ? 'info' : 'debug',
        payloadRedacted: { dryRun, eligibleCount: eligiblePlans.length, totalCount: plans.length, generatedAt: now }
      },
      audit
    });
  }

  return deepFreezeRetention({
    schedulerId: RETENTION_SCHEDULER_ID,
    generatedAt: now,
    dryRun,
    totalRuns: plans.length,
    eligibleCount: eligiblePlans.length,
    plans,
    executions,
    audit,
    eventAudit
  });
}

export function createDailyRetentionSchedule({ hour = 3, minute = 0, timezone = 'local' } = {}) {
  assertIntegerRange(hour, 0, 23, 'hour');
  assertIntegerRange(minute, 0, 59, 'minute');
  return deepFreezeRetention({ schedulerId: RETENTION_SCHEDULER_ID, cadence: 'daily', hour, minute, timezone, dryRunSupported: true });
}

export function createRetentionAuditEntry({ plans = [], executions = [], now = new Date().toISOString(), dryRun = true } = {}) {
  const eligible = plans.filter((plan) => plan.eligible === true);
  return deepFreezeRetention({
    id: `audit-retention-${Date.parse(now) || 0}`,
    actor: 'system',
    action: dryRun ? 'retention-dry-run' : 'retention-cleanup',
    target: RETENTION_SCHEDULER_ID,
    result: 'ok',
    runId: null,
    metadataRedacted: {
      dryRun,
      totalPlans: plans.length,
      eligibleRunIds: eligible.map((plan) => plan.runId),
      blocked: plans.filter((plan) => plan.eligible !== true).map((plan) => ({ runId: plan.runId, state: plan.state, reasons: plan.reasons })),
      executions: executions.map((execution) => ({ runId: execution.runId, results: execution.results }))
    },
    createdAt: now
  });
}

export function createAuditRetentionPlan({ auditEntries = [], now = new Date().toISOString(), retentionDays = AUDIT_RETENTION_DAYS } = {}) {
  if (!Array.isArray(auditEntries)) throw new RetentionSchedulerError('Audit entries must be an array.', 'ERR_AUDIT_RETENTION_ENTRIES');
  assertIntegerRange(retentionDays, 1, 3650, 'retentionDays');
  const cutoffMs = Date.parse(now) - retentionDays * 86_400_000;
  const expired = [];
  const retained = [];
  for (const entry of auditEntries) {
    const createdAt = entry.createdAt ?? entry.timestamp;
    if (!createdAt || !Number.isFinite(Date.parse(createdAt))) {
      retained.push({ ...entry, retentionReason: 'missing-or-invalid-created-at' });
      continue;
    }
    if (Date.parse(createdAt) < cutoffMs) expired.push(entry);
    else retained.push(entry);
  }
  return deepFreezeRetention({
    generatedAt: now,
    retentionDays,
    cutoffAt: new Date(cutoffMs).toISOString(),
    expiredCount: expired.length,
    retainedCount: retained.length,
    expired,
    retained
  });
}

export function assertAcceptedRunsNotDeleted(plans = []) {
  for (const plan of plans) {
    if (plan.state === 'Accepted' && plan.eligible === true) {
      throw new RetentionSchedulerError('Accepted run must not be cleanup eligible.', 'ERR_ACCEPTED_CLEANUP_ELIGIBLE', { runId: plan.runId });
    }
  }
  return true;
}

function assertIntegerRange(value, min, max, field) {
  if (!Number.isInteger(value) || value < min || value > max) throw new RetentionSchedulerError(`${field} is out of range.`, 'ERR_RETENTION_RANGE', { field, value, min, max });
}

function deepFreezeRetention(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeRetention(child);
  return Object.freeze(value);
}
