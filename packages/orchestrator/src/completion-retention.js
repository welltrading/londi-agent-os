import { applyRunTransition, startsRetention } from './state-machine.js';
import { MANUAL_MERGE_GATE_ID } from './manual-merge.js';

export const COMPLETION_RETENTION_DAYS = 7;

export class CompletionRetentionError extends Error {
  constructor(message, code = 'ERR_COMPLETION_RETENTION', details = {}) {
    super(message);
    this.name = 'CompletionRetentionError';
    this.code = code;
    this.details = details;
  }
}

export function completeRunAfterGateF({ run, gateFResult, completedAt = gateFResult?.verifiedAt ?? new Date().toISOString() } = {}) {
  if (!run?.runId) throw new CompletionRetentionError('Run metadata is required for completion.', 'ERR_COMPLETION_RUN');
  if (run.state !== 'Accepted') throw new CompletionRetentionError('Only Accepted runs can complete after Gate F.', 'ERR_COMPLETION_STATE', { state: run.state });
  assertGateFVerified(gateFResult);
  const transition = applyRunTransition('Accepted', 'Verify merge success', {
    targetContainsChange: gateFResult.containmentVerified === true || gateFResult.patchEquivalent === true,
    noConflict: true,
    acceptedAt: run.acceptedAt,
    mergeVerifiedAt: gateFResult.verifiedAt,
    targetCommit: gateFResult.targetCommit
  });
  return deepFreezeCompletion({
    ...run,
    state: transition.to,
    completedAt,
    mergeVerifiedAt: gateFResult.verifiedAt,
    targetCommit: gateFResult.targetCommit,
    retentionClass: 'completed',
    retentionStartedAt: completedAt,
    retentionDays: COMPLETION_RETENTION_DAYS,
    gateF: {
      gate: MANUAL_MERGE_GATE_ID,
      status: gateFResult.status,
      targetCommit: gateFResult.targetCommit
    }
  });
}

export function createRetentionTrigger({ run, now = run?.completedAt ?? new Date().toISOString() } = {}) {
  if (!run?.runId || !run?.state) throw new CompletionRetentionError('Run metadata is required for retention trigger.', 'ERR_RETENTION_RUN');
  if (run.state !== 'Completed') {
    return deepFreezeCompletion({
      runId: run.runId,
      state: run.state,
      eligible: false,
      retentionStarted: false,
      reason: run.state === 'Accepted' ? 'accepted-awaiting-gate-f' : 'state-not-completed'
    });
  }
  if (!run.completedAt || !run.mergeVerifiedAt || !run.targetCommit) throw new CompletionRetentionError('Completed run requires completedAt, mergeVerifiedAt and targetCommit.', 'ERR_COMPLETED_METADATA', { runId: run.runId });
  return deepFreezeCompletion({
    runId: run.runId,
    state: run.state,
    eligible: true,
    retentionStarted: true,
    retentionStartedAt: run.completedAt,
    retentionDays: COMPLETION_RETENTION_DAYS,
    cleanupEligibleAt: new Date(Date.parse(run.completedAt) + COMPLETION_RETENTION_DAYS * 86_400_000).toISOString(),
    generatedAt: now
  });
}

export function assertAcceptedNotCleanupEligible(run) {
  if (run?.state === 'Accepted') return true;
  throw new CompletionRetentionError('Run is not in Accepted state.', 'ERR_ACCEPTED_STATE', { state: run?.state });
}

function assertGateFVerified(gateFResult) {
  if (gateFResult?.gate !== MANUAL_MERGE_GATE_ID || gateFResult?.status !== 'Verified' || !gateFResult?.targetCommit || !gateFResult?.verifiedAt) {
    throw new CompletionRetentionError('Verified Gate F result is required for completion.', 'ERR_GATE_F_REQUIRED', { gate: gateFResult?.gate, status: gateFResult?.status });
  }
  return true;
}

function deepFreezeCompletion(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeCompletion(child);
  return Object.freeze(value);
}

export { startsRetention };
