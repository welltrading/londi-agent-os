export const RUN_DETAIL_EVENT_LIMIT = 2000;
export const RUN_DETAIL_PAGE_SIZE = 100;
export const RUN_DETAIL_SECTIONS = Object.freeze(['state-stepper', 'progress', 'logs', 'artifacts', 'checkpoints', 'actions']);
export const RUN_DETAIL_VISUAL_TOKENS = Object.freeze({
  normal: { label: 'Normal', icon: 'circle', tone: 'neutral' },
  info: { label: 'Info', icon: 'info', tone: 'blue' },
  warning: { label: 'Warning', icon: 'warning', tone: 'amber' },
  success: { label: 'Success', icon: 'check', tone: 'green' },
  danger: { label: 'Danger', icon: 'stop', tone: 'red' }
});

export class RunDetailError extends Error {
  constructor(message, code = 'ERR_RUN_DETAIL', details = {}) {
    super(message);
    this.name = 'RunDetailError';
    this.code = code;
    this.details = details;
  }
}

export function createRunDetailModel({ run, steps = [], events = [], artifacts = [], checkpoints = [], actions = [], page = {}, now = new Date().toISOString() } = {}) {
  const normalizedRun = normalizeRun(run);
  const normalizedSteps = steps.map(normalizeStep);
  const visibleEvents = paginateRunEvents(events, page);
  const model = {
    generatedAt: now,
    run: normalizedRun,
    stateStepper: createStateStepper(normalizedRun, normalizedSteps),
    progress: createRunProgress(normalizedRun, normalizedSteps),
    logs: createFilteredLogs(visibleEvents.events, page.filters ?? {}),
    eventPage: visibleEvents.page,
    artifacts: createArtifactList(artifacts),
    checkpoints: createCheckpointList(checkpoints),
    actions: actions.map(normalizeRunDetailAction),
    accessibility: createRunDetailAccessibility()
  };
  return deepFreezeRunDetail(model);
}

export function paginateRunEvents(events = [], { cursor = 0, limit = RUN_DETAIL_PAGE_SIZE, filters = {} } = {}) {
  if (!Array.isArray(events)) throw new RunDetailError('Events must be an array.', 'ERR_RUN_DETAIL_EVENTS');
  const capped = events.slice(-RUN_DETAIL_EVENT_LIMIT).map(normalizeEvent);
  const filtered = capped.filter((event) => eventMatchesFilters(event, filters));
  const safeLimit = Math.min(Math.max(Number(limit) || RUN_DETAIL_PAGE_SIZE, 1), RUN_DETAIL_EVENT_LIMIT);
  const safeCursor = Math.max(Number(cursor) || 0, 0);
  const pageEvents = filtered.slice(safeCursor, safeCursor + safeLimit);
  return deepFreezeRunDetail({
    events: pageEvents,
    page: {
      cursor: safeCursor,
      limit: safeLimit,
      total: filtered.length,
      cappedTotal: capped.length,
      nextCursor: safeCursor + safeLimit < filtered.length ? safeCursor + safeLimit : null,
      truncatedToLast: events.length > RUN_DETAIL_EVENT_LIMIT ? RUN_DETAIL_EVENT_LIMIT : events.length
    }
  });
}

export function createStateStepper(run, steps = []) {
  const normalizedRun = normalizeRun(run);
  const normalizedSteps = steps.map(normalizeStep);
  const items = [
    stepperItem('draft', 'Draft', 'Draft', normalizedRun.state === 'Draft'),
    stepperItem('preflight', 'Preflight', 'Preflight Running', ['Preflight Running', 'Blocked', 'Ready'].includes(normalizedRun.state)),
    stepperItem('approval', 'Pipeline Approval', 'Awaiting Pipeline Approval', normalizedRun.state === 'Awaiting Pipeline Approval'),
    stepperItem('workspace', 'Workspace', 'Preparing Workspace', normalizedRun.state === 'Preparing Workspace'),
    stepperItem('running', 'Running', 'Running', ['Running', 'Awaiting Approval', 'Unresponsive', 'Recovery Required', 'Needs Attention'].includes(normalizedRun.state)),
    stepperItem('acceptance', 'Acceptance', 'Awaiting Acceptance', ['Awaiting Acceptance', 'Accepted'].includes(normalizedRun.state)),
    stepperItem('completed', 'Completed', 'Completed', normalizedRun.state === 'Completed')
  ];
  return deepFreezeRunDetail({ currentState: normalizedRun.state, items, stepStates: normalizedSteps.map((step) => ({ id: step.id, label: step.label, state: step.state, visual: visualForState(step.state) })) });
}

export function createRunProgress(run, steps = []) {
  const normalizedRun = normalizeRun(run);
  const normalizedSteps = steps.map(normalizeStep);
  const total = normalizedSteps.length;
  const done = normalizedSteps.filter((step) => ['Succeeded', 'Skipped'].includes(step.state)).length;
  const failed = normalizedSteps.filter((step) => ['Failed', 'Cancelled'].includes(step.state)).length;
  const running = normalizedSteps.filter((step) => ['Running', 'Retrying', 'Awaiting Approval', 'Unresponsive'].includes(step.state)).length;
  const percent = total === 0 ? (normalizedRun.state === 'Completed' ? 100 : 0) : Math.round((done / total) * 100);
  return deepFreezeRunDetail({ totalSteps: total, doneSteps: done, failedSteps: failed, runningSteps: running, percent, label: `${done}/${total} steps complete`, visual: visualForState(normalizedRun.state) });
}

export function createFilteredLogs(events = [], filters = {}) {
  return deepFreezeRunDetail(events.map(normalizeEvent).filter((event) => eventMatchesFilters(event, filters)).map((event) => ({
    id: event.id,
    timestamp: event.timestamp,
    type: event.type,
    severity: event.severity,
    message: sanitizeText(event.message ?? event.payload?.message ?? event.type),
    visual: visualForSeverity(event.severity),
    payload: redactObject(event.payload ?? {})
  })));
}

export function createArtifactList(artifacts = []) {
  return deepFreezeRunDetail(artifacts.map((artifact) => ({
    path: sanitizeText(artifact.path ?? ''),
    category: artifact.category ?? artifact.kind ?? 'file',
    filename: sanitizeText(artifact.filename ?? artifact.path?.split('/').pop() ?? ''),
    size: artifact.size ?? artifact.sizeBytes ?? null,
    hash: artifact.hash ?? artifact.sha256 ?? null,
    visual: RUN_DETAIL_VISUAL_TOKENS.info
  })));
}

export function createCheckpointList(checkpoints = []) {
  return deepFreezeRunDetail(checkpoints.map((checkpoint) => ({
    id: checkpoint.id ?? checkpoint.checkpointId,
    createdAt: checkpoint.createdAt ?? checkpoint.timestamp ?? null,
    label: sanitizeText(checkpoint.label ?? checkpoint.id ?? checkpoint.checkpointId ?? 'checkpoint'),
    safeToResume: checkpoint.safeToResume !== false,
    visual: checkpoint.safeToResume === false ? RUN_DETAIL_VISUAL_TOKENS.warning : RUN_DETAIL_VISUAL_TOKENS.success
  })));
}

export function createRunDetailApiRequests({ apiClient, runId, cursor = 0, limit = RUN_DETAIL_PAGE_SIZE, requestId = 'ui-run-detail' } = {}) {
  if (!apiClient || typeof apiClient.createRequest !== 'function') throw new RunDetailError('API client is required.', 'ERR_RUN_DETAIL_API_CLIENT');
  if (!runId) throw new RunDetailError('runId is required.', 'ERR_RUN_DETAIL_RUN_ID');
  return Object.freeze({
    run: apiClient.createRequest('GET', `/runs/${encodeURIComponent(runId)}`, { requestId }),
    events: apiClient.createRequest('GET', `/runs/${encodeURIComponent(runId)}/events?cursor=${encodeURIComponent(cursor)}&limit=${encodeURIComponent(limit)}`, { requestId }),
    artifacts: apiClient.createRequest('GET', `/runs/${encodeURIComponent(runId)}/artifacts`, { requestId }),
    checkpoints: apiClient.createRequest('GET', `/runs/${encodeURIComponent(runId)}/checkpoints`, { requestId })
  });
}

export function assertRunDetailAccessibility(model) {
  const serialized = JSON.stringify(model);
  if (/"tone":"(red|green|blue|amber|neutral)"/.test(serialized) && !serialized.includes('"label"')) {
    throw new RunDetailError('Visual states must include text labels, not color only.', 'ERR_RUN_DETAIL_COLOR_ONLY');
  }
  if (!model.accessibility?.notColorOnly) throw new RunDetailError('Run detail accessibility baseline is missing.', 'ERR_RUN_DETAIL_ACCESSIBILITY');
  return true;
}

function normalizeRun(run = {}) {
  if (!run.id || !run.state) throw new RunDetailError('Run detail requires run id and state.', 'ERR_RUN_DETAIL_RUN', { run });
  return Object.freeze({ id: run.id, title: sanitizeText(run.title ?? run.id), state: run.state, resourceVersion: run.resourceVersion ?? run.version ?? null, updatedAt: run.updatedAt ?? null, visual: visualForState(run.state) });
}

function normalizeStep(step = {}) {
  if (!step.id || !step.state) throw new RunDetailError('Step requires id and state.', 'ERR_RUN_DETAIL_STEP', { step });
  return Object.freeze({ id: step.id, label: sanitizeText(step.label ?? step.id), state: step.state, updatedAt: step.updatedAt ?? null });
}

function normalizeEvent(event = {}) {
  return Object.freeze({ id: event.id ?? event.eventId ?? String(event.sequence ?? ''), timestamp: event.timestamp ?? event.createdAt ?? null, type: sanitizeText(event.type ?? 'event'), severity: normalizeSeverity(event.severity), message: sanitizeText(event.message ?? event.payload?.message ?? event.type ?? 'event'), payload: redactObject(event.payload ?? {}) });
}

function normalizeRunDetailAction(action = {}) {
  if (!action.id && !action.action) throw new RunDetailError('Run detail action requires id or action.', 'ERR_RUN_DETAIL_ACTION', { action });
  return Object.freeze({ ...action, id: action.id ?? action.action, label: sanitizeText(action.label ?? action.action ?? action.id), expectedTransition: sanitizeText(action.expectedTransition ?? '') });
}

function stepperItem(id, label, state, active) { return Object.freeze({ id, label, state, active, visual: visualForState(state) }); }
function createRunDetailAccessibility() { return Object.freeze({ notColorOnly: true, tokensIncludeText: true, logRowsHaveSeverityText: true, virtualizedEventsLimit: RUN_DETAIL_EVENT_LIMIT }); }
function eventMatchesFilters(event, filters = {}) { return (!filters.type || event.type === filters.type) && (!filters.severity || event.severity === filters.severity) && (!filters.text || `${event.message} ${JSON.stringify(event.payload)}`.toLowerCase().includes(String(filters.text).toLowerCase())); }
function normalizeSeverity(severity) { return ['debug', 'info', 'warning', 'error', 'critical'].includes(severity) ? severity : 'info'; }
function visualForSeverity(severity) { if (severity === 'critical' || severity === 'error') return RUN_DETAIL_VISUAL_TOKENS.danger; if (severity === 'warning') return RUN_DETAIL_VISUAL_TOKENS.warning; return RUN_DETAIL_VISUAL_TOKENS.info; }
function visualForState(state) { if (['Completed', 'Succeeded', 'Accepted'].includes(state)) return RUN_DETAIL_VISUAL_TOKENS.success; if (['Failed', 'Cancelled', 'Blocked'].includes(state)) return RUN_DETAIL_VISUAL_TOKENS.danger; if (['Needs Attention', 'Unresponsive', 'Recovery Required'].includes(state)) return RUN_DETAIL_VISUAL_TOKENS.warning; if (['Awaiting Approval', 'Awaiting Pipeline Approval', 'Awaiting Acceptance', 'Running', 'Preflight Running', 'Preparing Workspace'].includes(state)) return RUN_DETAIL_VISUAL_TOKENS.info; return RUN_DETAIL_VISUAL_TOKENS.normal; }
function sanitizeText(value) { return String(value ?? '').replace(/sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+\/-]+=*|[A-Za-z0-9_-]{43,}/g, '[REDACTED]').replace(/[\r\n\u2028\u2029]+/g, ' ').trim(); }
function redactObject(value) { return JSON.parse(sanitizeText(JSON.stringify(value ?? {})) || '{}'); }
function deepFreezeRunDetail(value) { if (!value || typeof value !== 'object') return value; for (const child of Object.values(value)) deepFreezeRunDetail(child); return Object.freeze(value); }
