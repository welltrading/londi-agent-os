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
