import { REVIEW_BLOCKING_SEVERITIES } from './review.js';

export const CORRECTION_CYCLE_LIMIT = 2;
export const CORRECTION_CYCLE_STATES = Object.freeze(['Continue', 'Needs Attention', 'Requires Exception Approval', 'Critical Approval']);

export class CorrectionCycleError extends Error {
  constructor(message = 'Invalid correction cycle.', details = {}) {
    super(message);
    this.name = 'CorrectionCycleError';
    this.code = 'ERR_CORRECTION_CYCLE';
    this.details = details;
  }
}

export function createCorrectionCycleState({ runId, cycleCounter = 0, history = [] } = {}) {
  if (!runId || typeof runId !== 'string') throw new CorrectionCycleError('Correction cycle runId is required.');
  assertCycleCounter(cycleCounter);
  if (!Array.isArray(history)) throw new CorrectionCycleError('Correction cycle history must be an array.');
  return deepFreezeCycle({ runId, cycleCounter, history: history.map(normalizeHistoryEntry) });
}

export function evaluateReviewForCorrection(cycleState, reviewArtifact, { exceptionApproved = false } = {}) {
  const state = createCorrectionCycleState(cycleState);
  assertReviewShape(reviewArtifact);
  if (reviewArtifact.criticalSensitive === true) {
    return freezeDecision(state, reviewArtifact, 'Critical Approval', 'Critical sensitive review requires approval before correction.');
  }
  if (reviewArtifact.blocking !== true || !REVIEW_BLOCKING_SEVERITIES.includes(reviewArtifact.highestSeverity)) {
    return freezeDecision(state, reviewArtifact, 'Continue', 'Review is not blocking.', { nextCycleCounter: state.cycleCounter });
  }
  if (state.cycleCounter < CORRECTION_CYCLE_LIMIT) {
    return freezeDecision(state, reviewArtifact, 'Continue', 'Automatic Build -> Review correction cycle is allowed.', { nextCycleCounter: state.cycleCounter + 1 });
  }
  if (exceptionApproved === true) {
    return freezeDecision(state, reviewArtifact, 'Continue', 'Exception approval allows an additional correction cycle.', { nextCycleCounter: state.cycleCounter + 1, exceptionUsed: true });
  }
  return freezeDecision(state, reviewArtifact, 'Needs Attention', 'Second failed correction cycle is exhausted; third attempt requires exception approval.', { nextCycleCounter: state.cycleCounter, exceptionRequired: true });
}

export function applyCorrectionCycleDecision(cycleState, decision) {
  const state = createCorrectionCycleState(cycleState);
  if (!decision || typeof decision !== 'object') throw new CorrectionCycleError('Correction cycle decision is required.');
  if (!CORRECTION_CYCLE_STATES.includes(decision.action)) throw new CorrectionCycleError('Unknown correction cycle decision action.', { action: decision.action });
  const entry = normalizeHistoryEntry({
    cycle: decision.nextCycleCounter ?? state.cycleCounter,
    action: decision.action,
    reviewHash: decision.reviewHash,
    highestSeverity: decision.highestSeverity,
    reason: decision.reason,
    exceptionUsed: decision.exceptionUsed === true
  });
  return createCorrectionCycleState({ runId: state.runId, cycleCounter: decision.nextCycleCounter ?? state.cycleCounter, history: [...state.history, entry] });
}

export function assertThirdAttemptRequiresException(cycleState, reviewArtifact) {
  const decision = evaluateReviewForCorrection(cycleState, reviewArtifact);
  if (decision.action !== 'Needs Attention' || decision.exceptionRequired !== true) {
    throw new CorrectionCycleError('Third correction attempt did not require exception approval.', { decision });
  }
  return true;
}

function freezeDecision(state, reviewArtifact, action, reason, extra = {}) {
  return deepFreezeCycle({
    runId: state.runId,
    action,
    reason,
    reviewHash: reviewArtifact.hash,
    highestSeverity: reviewArtifact.highestSeverity,
    currentCycleCounter: state.cycleCounter,
    nextCycleCounter: extra.nextCycleCounter ?? state.cycleCounter,
    exceptionRequired: extra.exceptionRequired === true,
    exceptionUsed: extra.exceptionUsed === true
  });
}

function assertReviewShape(reviewArtifact) {
  if (!reviewArtifact || typeof reviewArtifact !== 'object') throw new CorrectionCycleError('Review artifact is required.');
  if (!reviewArtifact.hash || !reviewArtifact.highestSeverity) throw new CorrectionCycleError('Review artifact requires hash and highestSeverity.', { reviewArtifact });
}

function assertCycleCounter(cycleCounter) {
  if (!Number.isInteger(cycleCounter) || cycleCounter < 0) throw new CorrectionCycleError('Correction cycle counter must be a non-negative integer.', { cycleCounter });
}

function normalizeHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') throw new CorrectionCycleError('Correction cycle history entry must be an object.');
  assertCycleCounter(entry.cycle ?? 0);
  if (entry.action && !CORRECTION_CYCLE_STATES.includes(entry.action)) throw new CorrectionCycleError('Unknown correction cycle history action.', { action: entry.action });
  return {
    cycle: entry.cycle ?? 0,
    action: entry.action ?? 'Continue',
    reviewHash: entry.reviewHash ?? null,
    highestSeverity: entry.highestSeverity ?? 'Info',
    reason: entry.reason ?? '',
    exceptionUsed: entry.exceptionUsed === true
  };
}

function deepFreezeCycle(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeCycle(child);
  return Object.freeze(value);
}
