export const DASHBOARD_RUN_BUCKETS = Object.freeze(['active', 'waitingApproval', 'needsAttention', 'completed']);
export const ACTION_STATE = Object.freeze({ available: 'available', stale: 'stale', disabled: 'disabled' });

export class DashboardModelError extends Error {
  constructor(message, code = 'ERR_DASHBOARD_MODEL', details = {}) {
    super(message);
    this.name = 'DashboardModelError';
    this.code = code;
    this.details = details;
  }
}

export function createDashboardModel({ runs = [], approvals = [], systemHealth = {}, now = new Date().toISOString() } = {}) {
  const normalizedRuns = runs.map(normalizeRunSummary);
  const normalizedApprovals = approvals.map(normalizeApprovalSummary);
  const buckets = bucketRuns(normalizedRuns);
  const counts = Object.freeze({
    active: buckets.active.length,
    waitingApproval: buckets.waitingApproval.length + normalizedApprovals.filter((item) => item.state === 'Pending').length,
    needsAttention: buckets.needsAttention.length,
    completed: buckets.completed.length
  });
  return deepFreezeDashboard({
    generatedAt: now,
    counts,
    buckets,
    approvalsInbox: normalizedApprovals.filter((item) => item.state === 'Pending'),
    needsAttention: buckets.needsAttention,
    systemHealth: normalizeSystemHealth(systemHealth),
    actions: normalizedRuns.flatMap((run) => listRunActions(run))
  });
}

export function bucketRuns(runs = []) {
  const buckets = { active: [], waitingApproval: [], needsAttention: [], completed: [] };
  for (const run of runs.map(normalizeRunSummary)) {
    if (['Completed', 'Cancelled', 'Failed'].includes(run.state)) buckets.completed.push(run);
    else if (['Awaiting Approval', 'Awaiting Pipeline Approval', 'Awaiting Acceptance'].includes(run.state)) buckets.waitingApproval.push(run);
    else if (run.state === 'Needs Attention' || run.state === 'Blocked' || run.state === 'Recovery Required' || run.state === 'Unresponsive') buckets.needsAttention.push(run);
    else buckets.active.push(run);
  }
  return deepFreezeDashboard(buckets);
}

export function listRunActions(run) {
  const item = normalizeRunSummary(run);
  const byState = {
    Draft: [action(item, 'edit', 'Edit draft', 'Draft can be changed before preflight.'), action(item, 'run-preflight', 'Run preflight', 'Draft moves to Preflight Running.')],
    Ready: [action(item, 'present-pipeline', 'Present pipeline', 'Ready moves to Awaiting Pipeline Approval.')],
    'Awaiting Pipeline Approval': [action(item, 'approve-pipeline', 'Approve pipeline', 'Approval moves to Preparing Workspace.', { requiresFreshRevision: true })],
    Running: [action(item, 'cancel', 'Cancel run', 'Controlled stop saves checkpoint before cancellation.')],
    'Awaiting Approval': [action(item, 'approve-sensitive-action', 'Approve action', 'Approval returns the run to Running.', { requiresFreshRevision: true }), action(item, 'reject-action', 'Reject action', 'Essential rejection moves to Needs Attention.')],
    'Awaiting Acceptance': [action(item, 'accept', 'Accept', 'Accepted output moves to manual merge verification.', { requiresFreshRevision: true }), action(item, 'request-changes', 'Request changes', 'Run moves to Needs Attention.')],
    'Needs Attention': [action(item, 'retry', 'Retry', 'Retry returns to Running after approval and preflight are valid.', { requiresFreshRevision: true }), action(item, 'replace-agent', 'Replace agent', 'Qualified replacement returns to Running.'), action(item, 'stop', 'Stop', 'Confirmed stop cancels the run.')],
    'Recovery Required': [action(item, 'resume', 'Resume', 'Valid checkpoint returns to Running.', { requiresFreshRevision: true }), action(item, 'stop', 'Stop', 'Checkpoint is saved and run is cancelled.')]
  };
  return Object.freeze(byState[item.state] ?? []);
}

export function evaluateActionFreshness(actionItem, latestResourceVersion) {
  if (!actionItem.requiresFreshRevision) return Object.freeze({ ...actionItem, state: ACTION_STATE.available });
  if (!latestResourceVersion || actionItem.resourceVersion !== latestResourceVersion) return Object.freeze({ ...actionItem, state: ACTION_STATE.stale, reloadRequired: true });
  return Object.freeze({ ...actionItem, state: ACTION_STATE.available, reloadRequired: false });
}

export function describeExpectedTransition(actionItem) {
  if (!actionItem?.expectedTransition) throw new DashboardModelError('Dashboard action must expose expected transition.', 'ERR_DASHBOARD_ACTION_TRANSITION', { action: actionItem?.id });
  return actionItem.expectedTransition;
}

export function assertDashboardCountsMatchApi(dashboard, apiCounts) {
  for (const key of ['active', 'waitingApproval', 'needsAttention', 'completed']) {
    if (dashboard.counts[key] !== apiCounts[key]) throw new DashboardModelError('Dashboard count does not match API snapshot.', 'ERR_DASHBOARD_COUNT_MISMATCH', { key, dashboard: dashboard.counts[key], api: apiCounts[key] });
  }
  return true;
}

function normalizeRunSummary(run = {}) {
  if (!run.id || !run.state) throw new DashboardModelError('Run summary requires id and state.', 'ERR_DASHBOARD_RUN_SUMMARY', { run });
  return Object.freeze({ id: run.id, title: sanitizeText(run.title ?? run.id), state: run.state, resourceVersion: run.resourceVersion ?? run.version ?? null, updatedAt: run.updatedAt ?? null, severity: run.severity ?? severityForRunState(run.state) });
}

function normalizeApprovalSummary(approval = {}) {
  if (!approval.id || !approval.kind || !approval.state) throw new DashboardModelError('Approval summary requires id, kind and state.', 'ERR_DASHBOARD_APPROVAL_SUMMARY', { approval });
  return Object.freeze({ id: approval.id, kind: approval.kind, state: approval.state, runId: approval.runId ?? approval.scope?.runId ?? null, resourceVersion: approval.resourceVersion ?? approval.revisionHash ?? null, requestedAt: approval.requestedAt ?? null, expiresAt: approval.expiresAt ?? null });
}

function normalizeSystemHealth(health = {}) {
  return Object.freeze({ status: health.status ?? 'unknown', service: health.service ?? 'local-api', adapters: health.adapters ?? [], warnings: (health.warnings ?? []).map(sanitizeText) });
}

function action(run, id, label, expectedTransition, options = {}) {
  return Object.freeze({ id: `${run.id}:${id}`, runId: run.id, action: id, label, resourceVersion: run.resourceVersion, state: ACTION_STATE.available, requiresFreshRevision: Boolean(options.requiresFreshRevision), expectedTransition });
}

function severityForRunState(state) {
  if (['Needs Attention', 'Blocked', 'Recovery Required', 'Unresponsive', 'Failed'].includes(state)) return 'warning';
  if (['Awaiting Approval', 'Awaiting Pipeline Approval', 'Awaiting Acceptance'].includes(state)) return 'info';
  return 'normal';
}

function sanitizeText(value) {
  return String(value).replace(/sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+\/-]+=*|[A-Za-z0-9_-]{43,}/g, '[REDACTED]').replace(/[\r\n\u2028\u2029]+/g, ' ');
}

function deepFreezeDashboard(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeDashboard(child);
  return Object.freeze(value);
}
