import { assertReplayAllowedForExternalEffect } from './network-grants.js';
import { assertRecoveryActionAvailable } from './restart-recovery.js';

export const TECHNICAL_RETRY_LIMIT = 1;
export const REPLACEMENT_CONTEXT_FORBIDDEN_PATTERNS = Object.freeze([
  /raw conversation/i,
  /chat log/i,
  /transcript/i,
  /full log/i,
  /assistant:\s/i,
  /user:\s/i
]);

export class TechnicalRetryError extends Error {
  constructor(message, code = 'ERR_TECHNICAL_RETRY', details = {}) {
    super(message);
    this.name = 'TechnicalRetryError';
    this.code = code;
    this.details = details;
  }
}

export function createRetryDecision({
  runId,
  previousAttempt,
  recoveryReport,
  externalEffects = [],
  retryCount = 0,
  failureKind = 'technical',
  reconnectAvailable = false,
  now = new Date().toISOString()
} = {}) {
  if (!runId) throw new TechnicalRetryError('Retry decision runId is required.', 'ERR_RETRY_RUN_ID');
  if (!previousAttempt?.attemptId) throw new TechnicalRetryError('Previous attempt snapshot is required.', 'ERR_RETRY_PREVIOUS_ATTEMPT');
  if (failureKind !== 'technical') return blockedRetry({ runId, previousAttempt, retryCount, reason: 'only technical failures are retryable', now });
  if (retryCount >= TECHNICAL_RETRY_LIMIT) return blockedRetry({ runId, previousAttempt, retryCount, reason: 'automatic technical retry already used', now });
  for (const effect of externalEffects) assertReplayAllowedForExternalEffect(effect.state ?? effect.externalEffectState ?? 'Unknown');
  assertRecoveryActionAvailable(recoveryReport, 'Resume');
  return deepFreezeRetry({
    runId,
    decision: 'retry',
    allowed: true,
    automatic: true,
    retryCountBefore: retryCount,
    retryCountAfter: retryCount + 1,
    previousAttempt: snapshotPreviousAttempt(previousAttempt),
    reconnectFirst: reconnectAvailable === true,
    rawConversationTransferred: false,
    createdAt: now,
    reason: reconnectAvailable ? 'technical failure retry with reconnect' : 'technical failure retry'
  });
}

export function createAgentReplacementPlan({
  runId,
  previousAttempt,
  recoveryReport,
  recommendedAdapters = [],
  currentAdapterId,
  handoffSummary,
  now = new Date().toISOString()
} = {}) {
  if (!runId) throw new TechnicalRetryError('Replacement runId is required.', 'ERR_REPLACEMENT_RUN_ID');
  if (!previousAttempt?.attemptId) throw new TechnicalRetryError('Previous attempt snapshot is required.', 'ERR_REPLACEMENT_PREVIOUS_ATTEMPT');
  assertRecoveryActionAvailable(recoveryReport, 'Replace');
  assertReplacementContextSafe(handoffSummary);
  const replacement = recommendedAdapters.find((candidate) => candidate.eligible === true && candidate.adapterId !== currentAdapterId);
  if (!replacement) throw new TechnicalRetryError('No qualified replacement adapter is available.', 'ERR_REPLACEMENT_UNAVAILABLE', { currentAdapterId });
  return deepFreezeRetry({
    runId,
    decision: 'replace-agent',
    allowed: true,
    requiresApproval: true,
    previousAttempt: snapshotPreviousAttempt(previousAttempt),
    replacementAdapterId: replacement.adapterId,
    replacementDisplayName: replacement.displayName ?? replacement.adapterId,
    replacementScore: replacement.score ?? null,
    handoffSummary,
    rawConversationTransferred: false,
    createdAt: now,
    reason: 'qualified replacement adapter selected'
  });
}

export function createReconnectPlan({ runId, attemptId, heartbeatState, now = new Date().toISOString() } = {}) {
  if (!runId || !attemptId) throw new TechnicalRetryError('Reconnect plan requires runId and attemptId.', 'ERR_RECONNECT_REQUIRED');
  const reconnectable = ['Heartbeat Due', 'Unresponsive', 'Timeout Decision Required'].includes(heartbeatState);
  return deepFreezeRetry({
    runId,
    attemptId,
    action: 'reconnect',
    allowed: reconnectable,
    heartbeatState,
    createdAt: now,
    reason: reconnectable ? 'attempt may reconnect before replacement' : 'attempt heartbeat state is not reconnectable'
  });
}

export function assertReplacementContextSafe(handoffSummary) {
  if (!handoffSummary || typeof handoffSummary !== 'string') throw new TechnicalRetryError('Replacement handoff summary is required.', 'ERR_REPLACEMENT_HANDOFF');
  for (const pattern of REPLACEMENT_CONTEXT_FORBIDDEN_PATTERNS) {
    if (pattern.test(handoffSummary)) throw new TechnicalRetryError('Replacement handoff must not include raw conversation.', 'ERR_REPLACEMENT_RAW_CONVERSATION', { pattern: pattern.source });
  }
  return true;
}

function blockedRetry({ runId, previousAttempt, retryCount, reason, now }) {
  return deepFreezeRetry({
    runId,
    decision: 'retry',
    allowed: false,
    automatic: false,
    retryCountBefore: retryCount,
    retryCountAfter: retryCount,
    previousAttempt: snapshotPreviousAttempt(previousAttempt),
    rawConversationTransferred: false,
    createdAt: now,
    reason
  });
}

function snapshotPreviousAttempt(previousAttempt) {
  return {
    attemptId: previousAttempt.attemptId,
    adapterId: previousAttempt.adapterId ?? null,
    state: previousAttempt.state ?? previousAttempt.status ?? null,
    checkpointId: previousAttempt.checkpointId ?? null,
    outcome: previousAttempt.outcome ?? null,
    retained: true
  };
}

function deepFreezeRetry(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeRetry(child);
  return Object.freeze(value);
}
