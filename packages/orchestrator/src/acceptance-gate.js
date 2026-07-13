import { createApprovalRequest, decideApproval, hashApprovalPayload, SENSITIVE_APPROVAL_TTL_MINUTES } from './approvals.js';
import { sha256 } from './command-pipeline.js';

export const ACCEPTANCE_GATE_ID = 'Gate E';
export const ACCEPTANCE_APPROVAL_KIND = 'acceptance';
export const ACCEPTANCE_DECISIONS = Object.freeze(['accept', 'request-changes']);
export const ACCEPTANCE_REQUIRED_SECTIONS = Object.freeze(['diff', 'tests', 'review', 'risks', 'artifacts']);

export class AcceptanceGateError extends Error {
  constructor(message = 'Invalid acceptance gate.', details = {}) {
    super(message);
    this.name = 'AcceptanceGateError';
    this.code = 'ERR_ACCEPTANCE_GATE';
    this.details = details;
  }
}

export function createAcceptanceSnapshot({
  runId,
  diff,
  tests,
  review,
  risks,
  artifacts,
  createdAt = new Date().toISOString(),
  acceptedAt
} = {}) {
  const snapshot = {
    gate: ACCEPTANCE_GATE_ID,
    runId,
    createdAt,
    acceptedAt: acceptedAt ?? null,
    diff: cloneRequired(diff, 'diff'),
    tests: cloneRequired(tests, 'tests'),
    review: cloneRequired(review, 'review'),
    risks: cloneRequired(risks, 'risks'),
    artifacts: cloneRequired(artifacts, 'artifacts')
  };
  assertAcceptanceSnapshotShape(snapshot);
  const snapshotHash = sha256(Buffer.from(stableJson(snapshot), 'utf8'));
  return deepFreezeAcceptance({ ...snapshot, snapshotHash, locked: true });
}

export function createAcceptanceGate({
  id,
  runId,
  snapshot,
  actor = 'system',
  requestedAt = new Date().toISOString(),
  ttlMinutes = SENSITIVE_APPROVAL_TTL_MINUTES
} = {}) {
  assertAcceptanceSnapshot(snapshot);
  return createApprovalRequest({
    id: id ?? `acceptance-${runId ?? snapshot.runId}`,
    kind: ACCEPTANCE_APPROVAL_KIND,
    scope: { gate: ACCEPTANCE_GATE_ID, runId: runId ?? snapshot.runId, snapshotHash: snapshot.snapshotHash },
    payload: createAcceptancePayload(snapshot),
    revisionHash: snapshot.snapshotHash,
    actor,
    requestedAt,
    ttlMinutes
  });
}

export function createAcceptancePayload(snapshot) {
  assertAcceptanceSnapshot(snapshot);
  return deepFreezeAcceptance({
    gate: ACCEPTANCE_GATE_ID,
    runId: snapshot.runId,
    snapshotHash: snapshot.snapshotHash,
    sections: Object.fromEntries(ACCEPTANCE_REQUIRED_SECTIONS.map((section) => [section, summarizeSection(snapshot[section])]))
  });
}

export function decideAcceptanceGate(request, decision) {
  if (request?.kind !== ACCEPTANCE_APPROVAL_KIND || request?.scope?.gate !== ACCEPTANCE_GATE_ID) {
    throw new AcceptanceGateError('Approval request is not a Gate E acceptance request.', { requestId: request?.id, kind: request?.kind, gate: request?.scope?.gate });
  }
  const normalized = normalizeAcceptanceDecision(decision);
  const approvalDecision = decideApproval(request, {
    actor: normalized.actor,
    decision: normalized.decision === 'accept' ? 'approve' : 'reject',
    reason: normalized.reason,
    timestamp: normalized.timestamp,
    payloadHash: normalized.payloadHash,
    revisionHash: normalized.revisionHash
  });
  return deepFreezeAcceptance({
    ...approvalDecision,
    acceptanceDecision: normalized.decision,
    targetRunState: normalized.decision === 'accept' ? 'Accepted' : 'Needs Attention',
    reasonSaved: normalized.decision === 'request-changes' ? Boolean(normalized.reason) : true
  });
}

export function invalidateAcceptanceOnSnapshotChange(request, nextSnapshot) {
  assertAcceptanceSnapshot(nextSnapshot);
  const nextPayloadHash = hashApprovalPayload(createAcceptancePayload(nextSnapshot));
  if (nextPayloadHash !== request.payloadHash || nextSnapshot.snapshotHash !== request.revisionHash) {
    return Object.freeze({ ...request, state: 'Invalidated' });
  }
  return request;
}

export function assertAcceptanceSnapshot(snapshot) {
  assertAcceptanceSnapshotShape(snapshot);
  if (snapshot.locked !== true) throw new AcceptanceGateError('Acceptance snapshot must be locked.', { locked: snapshot.locked });
  const { snapshotHash, locked, ...withoutHash } = snapshot;
  const actualHash = sha256(Buffer.from(stableJson(withoutHash), 'utf8'));
  if (actualHash !== snapshotHash) throw new AcceptanceGateError('Acceptance snapshot hash mismatch.', { expectedHash: snapshotHash, actualHash });
  return true;
}

function assertAcceptanceSnapshotShape(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') throw new AcceptanceGateError('Acceptance snapshot must be an object.');
  if (snapshot.gate !== ACCEPTANCE_GATE_ID || !snapshot.runId) throw new AcceptanceGateError('Acceptance snapshot requires Gate E and runId.', { gate: snapshot.gate, runId: snapshot.runId });
  for (const section of ACCEPTANCE_REQUIRED_SECTIONS) {
    if (!snapshot[section] || typeof snapshot[section] !== 'object') throw new AcceptanceGateError('Acceptance snapshot missing required section.', { section });
  }
  return true;
}

function normalizeAcceptanceDecision(decision = {}) {
  if (!ACCEPTANCE_DECISIONS.includes(decision.decision)) throw new AcceptanceGateError('Acceptance decision must be accept or request-changes.', { decision: decision.decision });
  if (!decision.actor || !decision.payloadHash || !decision.revisionHash) throw new AcceptanceGateError('Acceptance decision requires actor, payloadHash and revisionHash.');
  if (decision.decision === 'request-changes' && !decision.reason) throw new AcceptanceGateError('Request Changes requires a saved reason.');
  return { ...decision, timestamp: decision.timestamp ?? new Date().toISOString() };
}

function cloneRequired(value, label) {
  if (!value || typeof value !== 'object') throw new AcceptanceGateError(`Acceptance snapshot ${label} section is required.`);
  return structuredClone(value);
}

function summarizeSection(section) {
  const contentHash = sha256(Buffer.from(stableJson(section), 'utf8'));
  return { hash: contentHash, keys: Object.keys(section).sort() };
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function deepFreezeAcceptance(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeAcceptance(child);
  return Object.freeze(value);
}
