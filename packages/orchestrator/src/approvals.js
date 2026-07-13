import { sha256 } from './command-pipeline.js';

export class ApprovalError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ApprovalError';
    this.code = code;
    this.details = details;
  }
}

export class StaleApprovalError extends ApprovalError {
  constructor(message = 'Approval payload or revision is stale.', details = {}) {
    super(message, 'ERR_APPROVAL_STALE', details);
    this.name = 'StaleApprovalError';
  }
}

export class ExpiredApprovalError extends ApprovalError {
  constructor(message = 'Approval request expired.', details = {}) {
    super(message, 'ERR_APPROVAL_EXPIRED', details);
    this.name = 'ExpiredApprovalError';
  }
}

export class InvalidApprovalDecisionError extends ApprovalError {
  constructor(message = 'Invalid approval decision.', details = {}) {
    super(message, 'ERR_INVALID_APPROVAL_DECISION', details);
    this.name = 'InvalidApprovalDecisionError';
  }
}

export const APPROVAL_STATES = Object.freeze(['Pending', 'Approved', 'Rejected', 'Expired', 'Invalidated']);
export const APPROVAL_DECISIONS = Object.freeze(['approve', 'reject']);
export const SENSITIVE_APPROVAL_TTL_MINUTES = 60;

export function createApprovalRequest({
  id,
  kind,
  scope,
  payload,
  payloadHash = payload === undefined ? undefined : hashApprovalPayload(payload),
  revisionHash,
  actor = 'system',
  requestedAt = new Date().toISOString(),
  expiresAt,
  ttlMinutes = SENSITIVE_APPROVAL_TTL_MINUTES,
  state = 'Pending'
}) {
  if (!id || !kind || !scope || !payloadHash || !revisionHash) {
    throw new InvalidApprovalDecisionError('Approval request requires id, kind, scope, payloadHash and revisionHash.', { id, kind, scope });
  }
  return Object.freeze({
    id,
    kind,
    scope: structuredClone(scope),
    payloadHash,
    revisionHash,
    actor,
    requestedAt,
    expiresAt: expiresAt ?? addMinutesIso(requestedAt, ttlMinutes),
    state
  });
}

export function decideApproval(request, decision) {
  const normalized = normalizeDecision(decision);
  assertApprovalUsable(request, normalized);
  return Object.freeze({
    requestId: request.id,
    actor: normalized.actor,
    decision: normalized.decision,
    reason: normalized.reason ?? '',
    timestamp: normalized.timestamp,
    revisionHash: normalized.revisionHash,
    payloadHash: normalized.payloadHash,
    state: normalized.decision === 'approve' ? 'Approved' : 'Rejected'
  });
}

export function assertApprovalUsable(request, decision, now = decision?.timestamp ?? new Date().toISOString()) {
  if (!request || request.state !== 'Pending') {
    throw new InvalidApprovalDecisionError('Approval request is not pending.', { requestId: request?.id, state: request?.state });
  }
  if (Date.parse(now) > Date.parse(request.expiresAt)) {
    throw new ExpiredApprovalError('Approval request expired.', { requestId: request.id, expiresAt: request.expiresAt, now });
  }
  if (decision.payloadHash !== request.payloadHash || decision.revisionHash !== request.revisionHash) {
    throw new StaleApprovalError('Approval payload/revision mismatch.', {
      requestId: request.id,
      expectedPayloadHash: request.payloadHash,
      actualPayloadHash: decision.payloadHash,
      expectedRevisionHash: request.revisionHash,
      actualRevisionHash: decision.revisionHash
    });
  }
  return true;
}

export function invalidateApprovalOnChange(request, { payloadHash = request.payloadHash, revisionHash = request.revisionHash } = {}) {
  if (payloadHash !== request.payloadHash || revisionHash !== request.revisionHash) {
    return Object.freeze({ ...request, state: 'Invalidated' });
  }
  return request;
}

export function hashApprovalPayload(payload) {
  return sha256(stableJson(payload));
}

export function addMinutesIso(isoDate, minutes) {
  return new Date(Date.parse(isoDate) + minutes * 60_000).toISOString();
}

function normalizeDecision(decision = {}) {
  if (!APPROVAL_DECISIONS.includes(decision.decision)) {
    throw new InvalidApprovalDecisionError('Decision must be approve or reject.', { decision: decision.decision });
  }
  if (!decision.actor || !decision.payloadHash || !decision.revisionHash) {
    throw new InvalidApprovalDecisionError('Decision requires actor, payloadHash and revisionHash.', { actor: decision.actor });
  }
  return {
    ...decision,
    timestamp: decision.timestamp ?? new Date().toISOString()
  };
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

export const PIPELINE_APPROVAL_GATE_KIND = 'pipeline';
export const PIPELINE_APPROVAL_GATE_ID = 'Gate A';

export class PipelineApprovalGateError extends ApprovalError {
  constructor(message = 'Invalid pipeline approval gate.', details = {}) {
    super(message, 'ERR_PIPELINE_APPROVAL_GATE', details);
    this.name = 'PipelineApprovalGateError';
  }
}

export function createPipelineApprovalGate({
  id,
  runId,
  template,
  assignments,
  context,
  preflight,
  permissions,
  network,
  secretAliases,
  revisionHash,
  actor = 'system',
  requestedAt = new Date().toISOString(),
  ttlMinutes = SENSITIVE_APPROVAL_TTL_MINUTES,
  agentProcessStarted = false
} = {}) {
  const payload = createPipelineApprovalPayload({
    template,
    assignments,
    context,
    preflight,
    permissions,
    network,
    secretAliases,
    agentProcessStarted
  });
  assertPipelineApprovalPayload(payload);
  return createApprovalRequest({
    id: id ?? `pipeline-approval-${runId ?? 'unknown'}`,
    kind: PIPELINE_APPROVAL_GATE_KIND,
    scope: { gate: PIPELINE_APPROVAL_GATE_ID, runId: runId ?? null, templateId: payload.template.id },
    payload,
    revisionHash,
    actor,
    requestedAt,
    ttlMinutes
  });
}

export function createPipelineApprovalPayload({
  template,
  assignments,
  context = {},
  preflight = {},
  permissions = {},
  network = {},
  secretAliases = [],
  agentProcessStarted = false
} = {}) {
  const payload = {
    gate: PIPELINE_APPROVAL_GATE_ID,
    template: normalizeTemplateForApproval(template),
    assignments: structuredClone(assignments ?? {}),
    context: structuredClone(context),
    preflight: structuredClone(preflight),
    permissions: structuredClone(permissions),
    network: structuredClone(network),
    secretAliases: [...secretAliases],
    agentProcessStarted
  };
  assertPipelineApprovalPayload(payload);
  return deepFreezeApproval(payload);
}

export function assertPipelineApprovalPayload(payload) {
  if (!payload || payload.gate !== PIPELINE_APPROVAL_GATE_ID) throw new PipelineApprovalGateError('Pipeline approval payload must represent Gate A.', { gate: payload?.gate });
  if (payload.agentProcessStarted !== false) throw new PipelineApprovalGateError('Gate A cannot be created after an agent process starts.', { agentProcessStarted: payload.agentProcessStarted });
  if (!payload.template?.id || !Array.isArray(payload.template?.steps)) throw new PipelineApprovalGateError('Gate A requires a pipeline template snapshot.', { template: payload.template });
  assertObject(payload.assignments, 'assignments');
  assertObject(payload.context, 'context');
  assertObject(payload.preflight, 'preflight');
  assertObject(payload.permissions, 'permissions');
  assertObject(payload.network, 'network');
  if (!Array.isArray(payload.secretAliases)) throw new PipelineApprovalGateError('Gate A secret aliases must be an array.');
  if (payload.secretAliases.some((alias) => typeof alias !== 'string' || !alias.trim())) throw new PipelineApprovalGateError('Gate A secret aliases must be non-empty strings.', { secretAliases: payload.secretAliases });
  const secretLikeValues = findSecretLikeValues(payload);
  if (secretLikeValues.length > 0) throw new PipelineApprovalGateError('Gate A payload may reference secret aliases but must not contain secret values.', { secretLikeValues });
  return true;
}

export function decidePipelineApprovalGate(request, decision) {
  if (request?.kind !== PIPELINE_APPROVAL_GATE_KIND || request?.scope?.gate !== PIPELINE_APPROVAL_GATE_ID) {
    throw new PipelineApprovalGateError('Approval request is not a Gate A pipeline approval.', { requestId: request?.id, kind: request?.kind, gate: request?.scope?.gate });
  }
  return decideApproval(request, decision);
}

export function invalidatePipelineApprovalOnConfigChange(request, nextConfig) {
  const nextPayload = createPipelineApprovalPayload(nextConfig);
  assertPipelineApprovalPayload(nextPayload);
  return invalidateApprovalOnChange(request, { payloadHash: hashApprovalPayload(nextPayload), revisionHash: request.revisionHash });
}

function normalizeTemplateForApproval(template) {
  if (!template || typeof template !== 'object') throw new PipelineApprovalGateError('Gate A requires a pipeline template.');
  return {
    id: template.id,
    displayName: template.displayName,
    roles: structuredClone(template.roles ?? []),
    steps: structuredClone(template.steps ?? []),
    edges: structuredClone(template.edges ?? []),
    gates: structuredClone(template.gates ?? []),
    policies: structuredClone(template.policies ?? {})
  };
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PipelineApprovalGateError(`Gate A ${label} must be an object.`, { [label]: value });
}

function findSecretLikeValues(value, trail = []) {
  if (!value || typeof value !== 'object') return [];
  const matches = [];
  for (const [key, child] of Object.entries(value)) {
    const path = [...trail, key];
    if (typeof child === 'string' && /(?:sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._~+\/-]{12,}|[A-Za-z0-9_-]{32,})/.test(child)) {
      matches.push(path.join('.'));
    }
    if (child && typeof child === 'object') matches.push(...findSecretLikeValues(child, path));
  }
  return matches;
}

function deepFreezeApproval(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeApproval(child);
  return Object.freeze(value);
}
