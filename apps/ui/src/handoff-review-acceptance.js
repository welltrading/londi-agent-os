export const HRA_SECTIONS = Object.freeze(['handoff', 'review', 'acceptance']);
export const HRA_ACTIONS = Object.freeze(['approve-handoff', 'request-handoff-revision', 'approve-critical-review', 'accept', 'request-changes', 'reload']);
export const HRA_VISUAL_TOKENS = Object.freeze({
  normal: { label: 'Normal', icon: 'circle', tone: 'neutral' },
  stale: { label: 'Stale revision', icon: 'reload', tone: 'amber' },
  critical: { label: 'Critical', icon: 'stop', tone: 'red' },
  blocked: { label: 'Blocked', icon: 'lock', tone: 'red' },
  ready: { label: 'Ready', icon: 'check', tone: 'green' },
  info: { label: 'Info', icon: 'info', tone: 'blue' }
});

export class HandoffReviewAcceptanceError extends Error {
  constructor(message, code = 'ERR_HANDOFF_REVIEW_ACCEPTANCE', details = {}) {
    super(message);
    this.name = 'HandoffReviewAcceptanceError';
    this.code = code;
    this.details = details;
  }
}

export function createHandoffReviewAcceptanceModel({
  runId,
  handoff = null,
  handoffApproval = null,
  review = null,
  acceptanceSnapshot = null,
  resourceVersion,
  latestResourceVersion,
  now = new Date().toISOString()
} = {}) {
  if (!runId) throw new HandoffReviewAcceptanceError('runId is required.', 'ERR_HRA_RUN_ID');
  const revisionState = evaluateRevisionFreshness({ resourceVersion, latestResourceVersion });
  const normalizedHandoff = handoff ? normalizeHandoff(handoff, handoffApproval, revisionState) : null;
  const normalizedReview = review ? normalizeReview(review, revisionState) : null;
  const normalizedAcceptance = acceptanceSnapshot ? normalizeAcceptance(acceptanceSnapshot, revisionState) : null;
  const model = {
    generatedAt: now,
    runId,
    resourceVersion: resourceVersion ?? null,
    latestResourceVersion: latestResourceVersion ?? null,
    revisionState,
    sections: {
      handoff: normalizedHandoff,
      review: normalizedReview,
      acceptance: normalizedAcceptance
    },
    actions: createHraActions({ handoff: normalizedHandoff, review: normalizedReview, acceptance: normalizedAcceptance, revisionState }),
    accessibility: { notColorOnly: true, criticalUsesTextAndIcon: true, staleRequiresReload: revisionState.stale }
  };
  return deepFreezeHra(model);
}

export function evaluateRevisionFreshness({ resourceVersion, latestResourceVersion } = {}) {
  const stale = Boolean(latestResourceVersion && resourceVersion && latestResourceVersion !== resourceVersion);
  return Object.freeze({
    stale,
    resourceVersion: resourceVersion ?? null,
    latestResourceVersion: latestResourceVersion ?? null,
    reloadRequired: stale,
    visual: stale ? HRA_VISUAL_TOKENS.stale : HRA_VISUAL_TOKENS.ready
  });
}

export function createHandoffRevisionDiff({ previous, current } = {}) {
  const prev = normalizeRevisionLike(previous, 'previous');
  const next = normalizeRevisionLike(current, 'current');
  return deepFreezeHra({
    previousRevision: prev.revision,
    currentRevision: next.revision,
    previousHash: prev.hash,
    currentHash: next.hash,
    changed: prev.hash !== next.hash,
    lines: diffLines(prev.content, next.content),
    stale: prev.hash === next.hash ? false : next.revision <= prev.revision
  });
}

export function createReviewScreenModel(review, revisionState = evaluateRevisionFreshness()) {
  return normalizeReview(review, revisionState);
}

export function createAcceptanceScreenModel(snapshot, revisionState = evaluateRevisionFreshness()) {
  return normalizeAcceptance(snapshot, revisionState);
}

export function assertHraActionAllowed(model, actionId) {
  if (!model || typeof model !== 'object') throw new HandoffReviewAcceptanceError('Model is required.', 'ERR_HRA_MODEL');
  const action = model.actions.find((item) => item.action === actionId || item.id === actionId);
  if (!action) throw new HandoffReviewAcceptanceError('Unknown HRA action.', 'ERR_HRA_ACTION_UNKNOWN', { actionId });
  if (action.state !== 'available') throw new HandoffReviewAcceptanceError('HRA action is not available.', 'ERR_HRA_ACTION_DISABLED', { actionId, state: action.state, reason: action.reason });
  return true;
}

export function createHraApiRequests({ apiClient, runId, requestId = 'ui-hra' } = {}) {
  if (!apiClient || typeof apiClient.createRequest !== 'function') throw new HandoffReviewAcceptanceError('API client is required.', 'ERR_HRA_API_CLIENT');
  if (!runId) throw new HandoffReviewAcceptanceError('runId is required.', 'ERR_HRA_RUN_ID');
  const encoded = encodeURIComponent(runId);
  return Object.freeze({
    handoff: apiClient.createRequest('GET', `/runs/${encoded}/handoff`, { requestId }),
    review: apiClient.createRequest('GET', `/runs/${encoded}/review`, { requestId }),
    acceptance: apiClient.createRequest('GET', `/runs/${encoded}/acceptance`, { requestId }),
    decide: (kind, body) => apiClient.createRequest('POST', `/runs/${encoded}/${encodeURIComponent(kind)}/decisions`, { requestId, body })
  });
}

export function assertHraAccessibility(model) {
  if (!model.accessibility?.notColorOnly) throw new HandoffReviewAcceptanceError('HRA accessibility baseline is missing.', 'ERR_HRA_ACCESSIBILITY');
  const serialized = JSON.stringify(model);
  if (serialized.includes('"tone":"red"') && !serialized.includes('"label":"Critical"') && !serialized.includes('"label":"Blocked"')) {
    throw new HandoffReviewAcceptanceError('Critical or blocked states must include labels, not color only.', 'ERR_HRA_COLOR_ONLY');
  }
  return true;
}

function normalizeHandoff(handoff, approval, revisionState) {
  if (!handoff.hash || !handoff.revision) throw new HandoffReviewAcceptanceError('Handoff requires hash and revision.', 'ERR_HRA_HANDOFF', { handoff });
  return deepFreezeHra({
    revision: handoff.revision,
    hash: handoff.hash,
    filename: handoff.filename ?? 'handoff.md',
    content: sanitizeText(handoff.content ?? ''),
    approved: handoff.approved === true || approval?.state === 'Approved',
    approvalId: handoff.approvalId ?? approval?.id ?? null,
    diff: handoff.previous ? createHandoffRevisionDiff({ previous: handoff.previous, current: handoff }) : null,
    visual: revisionState.stale ? HRA_VISUAL_TOKENS.stale : (handoff.approved === true || approval?.state === 'Approved' ? HRA_VISUAL_TOKENS.ready : HRA_VISUAL_TOKENS.info),
    stale: revisionState.stale
  });
}

function normalizeReview(review, revisionState) {
  if (!review.hash && !review.filename) throw new HandoffReviewAcceptanceError('Review requires hash or filename.', 'ERR_HRA_REVIEW', { review });
  const findings = (review.findings ?? []).map((finding, index) => normalizeFinding(finding, index));
  const highestSeverity = review.highestSeverity ?? highestSeverity(findings);
  const critical = highestSeverity === 'Critical' || findings.some((finding) => finding.severity === 'Critical');
  const blocking = review.blocking === true || critical || highestSeverity === 'High';
  return deepFreezeHra({
    filename: review.filename ?? 'review.md',
    hash: review.hash ?? null,
    summary: sanitizeText(review.summary ?? ''),
    findings,
    failedTests: (review.failedTests ?? []).map(sanitizeText),
    requiredFixes: (review.requiredFixes ?? []).map(sanitizeText),
    highestSeverity,
    critical,
    blocking,
    decision: review.decision ?? (blocking ? 'Blocked' : 'Passed'),
    visual: revisionState.stale ? HRA_VISUAL_TOKENS.stale : critical ? HRA_VISUAL_TOKENS.critical : blocking ? HRA_VISUAL_TOKENS.blocked : HRA_VISUAL_TOKENS.ready,
    stale: revisionState.stale
  });
}

function normalizeAcceptance(snapshot, revisionState) {
  if (!snapshot.snapshotHash && !snapshot.hash) throw new HandoffReviewAcceptanceError('Acceptance snapshot requires hash.', 'ERR_HRA_ACCEPTANCE', { snapshot });
  const locked = snapshot.locked === true;
  return deepFreezeHra({
    gate: snapshot.gate ?? 'Gate E',
    snapshotHash: snapshot.snapshotHash ?? snapshot.hash,
    locked,
    diff: redactObject(snapshot.diff ?? {}),
    tests: redactObject(snapshot.tests ?? {}),
    review: redactObject(snapshot.review ?? {}),
    risks: redactObject(snapshot.risks ?? {}),
    artifacts: redactObject(snapshot.artifacts ?? {}),
    canAccept: locked && !revisionState.stale,
    canRequestChanges: locked && !revisionState.stale,
    visual: revisionState.stale ? HRA_VISUAL_TOKENS.stale : locked ? HRA_VISUAL_TOKENS.ready : HRA_VISUAL_TOKENS.blocked,
    stale: revisionState.stale
  });
}

function createHraActions({ handoff, review, acceptance, revisionState }) {
  const stale = revisionState.stale;
  const actions = [];
  if (stale) actions.push(action('reload', 'Reload', 'Reload required before deciding on a stale revision.', 'available'));
  if (handoff) {
    actions.push(action('approve-handoff', 'Approve handoff', 'Gate B approval sends approved revision to build.', stale || handoff.approved ? 'disabled' : 'available', stale ? 'revision stale' : handoff.approved ? 'already approved' : null));
    actions.push(action('request-handoff-revision', 'Request revision', 'Returns handoff to planning for edits.', stale ? 'disabled' : 'available', stale ? 'revision stale' : null));
  }
  if (review) actions.push(action('approve-critical-review', 'Approve critical review', 'Critical sensitive finding requires explicit approval.', stale || !review.critical ? 'disabled' : 'available', stale ? 'revision stale' : !review.critical ? 'no critical finding' : null));
  if (acceptance) {
    actions.push(action('accept', 'Accept', 'Moves run to Accepted for manual merge verification.', stale || !acceptance.locked ? 'disabled' : 'available', stale ? 'revision stale' : !acceptance.locked ? 'snapshot not locked' : null));
    actions.push(action('request-changes', 'Request Changes', 'Moves run to Needs Attention with saved reason.', stale || !acceptance.locked ? 'disabled' : 'available', stale ? 'revision stale' : !acceptance.locked ? 'snapshot not locked' : null));
  }
  return deepFreezeHra(actions);
}

function action(actionId, label, expectedTransition, state, reason = null) { return Object.freeze({ id: actionId, action: actionId, label, expectedTransition, state, reason }); }
function normalizeRevisionLike(value, label) { if (!value?.hash || !value?.content || !Number.isInteger(value.revision)) throw new HandoffReviewAcceptanceError(`Invalid ${label} revision.`, 'ERR_HRA_REVISION', { label }); return value; }
function diffLines(previous, current) { const a = String(previous).split('\n'); const b = String(current).split('\n'); const max = Math.max(a.length, b.length); const lines = []; for (let i = 0; i < max; i += 1) if (a[i] !== b[i]) lines.push({ line: i + 1, before: sanitizeText(a[i] ?? ''), after: sanitizeText(b[i] ?? '') }); return lines; }
function normalizeFinding(finding, index) { if (!finding?.severity) throw new HandoffReviewAcceptanceError('Finding severity is required.', 'ERR_HRA_FINDING', { index }); return Object.freeze({ severity: finding.severity, evidence: sanitizeText(finding.evidence ?? ''), requiredFix: sanitizeText(finding.requiredFix ?? ''), sensitive: finding.sensitive === true, visual: finding.severity === 'Critical' ? HRA_VISUAL_TOKENS.critical : finding.severity === 'High' ? HRA_VISUAL_TOKENS.blocked : HRA_VISUAL_TOKENS.info }); }
function highestSeverity(findings) { const order = ['Info', 'Low', 'Medium', 'High', 'Critical']; return findings.reduce((best, finding) => order.indexOf(finding.severity) > order.indexOf(best) ? finding.severity : best, 'Info'); }
function sanitizeText(value) { return String(value ?? '').replace(/sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+\/-]+=*|[A-Za-z0-9_-]{43,}/g, '[REDACTED]').replace(/[\r\n\u2028\u2029]+/g, ' ').trim(); }
function redactObject(value) { return JSON.parse(sanitizeText(JSON.stringify(value ?? {})) || '{}'); }
function deepFreezeHra(value) { if (!value || typeof value !== 'object') return value; for (const child of Object.values(value)) deepFreezeHra(child); return Object.freeze(value); }
