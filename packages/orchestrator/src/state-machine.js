export const RUN_STATES = Object.freeze([
  'Draft',
  'Preflight Running',
  'Blocked',
  'Ready',
  'Awaiting Pipeline Approval',
  'Preparing Workspace',
  'Running',
  'Awaiting Approval',
  'Unresponsive',
  'Recovery Required',
  'Awaiting Acceptance',
  'Accepted',
  'Needs Attention',
  'Failed',
  'Cancelled',
  'Completed',
  'Maintenance Hold'
]);

export const STEP_STATES = Object.freeze([
  'Pending',
  'Ready',
  'Running',
  'Awaiting Approval',
  'Unresponsive',
  'Retrying',
  'Succeeded',
  'Failed',
  'Cancelled',
  'Skipped'
]);

export const FINAL_RUN_STATES = Object.freeze(['Failed', 'Cancelled', 'Completed']);
export const RETENTION_STARTING_RUN_STATES = Object.freeze(['Completed']);

export class StateTransitionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'StateTransitionError';
    this.code = 'ERR_INVALID_STATE_TRANSITION';
    this.details = details;
  }
}

const RUN_TRANSITIONS = Object.freeze([
  transition('Draft', 'Start Preflight', 'Preflight Running', ({ requiredFieldsComplete, projectPathExists }) => requiredFieldsComplete === true && projectPathExists === true, 'required fields and project path are valid'),
  transition('Preflight Running', 'Critical check failed', 'Blocked', ({ blockedChecks = 0 }) => blockedChecks > 0, 'at least one check is Blocked'),
  transition('Preflight Running', 'Checks passed', 'Ready', ({ preflightStatus }) => preflightStatus === 'Ready' || preflightStatus === 'Ready with Warnings', 'preflight is Ready or Ready with Warnings'),
  transition('Ready', 'Present pipeline', 'Awaiting Pipeline Approval', ({ recommendationComplete, contextComplete, manifestComplete }) => recommendationComplete === true && contextComplete === true && manifestComplete === true, 'recommendation, context and manifest are complete'),
  transition('Awaiting Pipeline Approval', 'Approve', 'Preparing Workspace', ({ approvalMatchesRevision, warningsApproved }) => approvalMatchesRevision === true && warningsApproved === true, 'approval matches revision and warnings approved'),
  transition('Awaiting Pipeline Approval', 'Edit', 'Draft', () => true, 'configuration changed'),
  transition('Preparing Workspace', 'Worktree ready', 'Running', ({ gitReady, aclReady, lockAcquired, baseCommitValid }) => gitReady === true && aclReady === true && lockAcquired === true && baseCommitValid === true, 'Git, ACL, lock and base commit are valid'),
  transition('Preparing Workspace', 'Failure', 'Needs Attention', ({ safeWorkspace }) => safeWorkspace === false, 'no safe workspace'),
  transition('Running', 'Sensitive action requested', 'Awaiting Approval', ({ validGrant }) => validGrant !== true, 'no valid grant'),
  transition('Awaiting Approval', 'Approve', 'Running', ({ approvalValid, preflightValid }) => approvalValid === true && preflightValid !== false, 'approval valid and preflight still valid when required'),
  transition('Awaiting Approval', 'Reject essential', 'Needs Attention', ({ actionEssential }) => actionEssential === true, 'essential action rejected'),
  transition('Awaiting Approval', 'Reject optional', 'Running', ({ actionEssential }) => actionEssential === false, 'optional action rejected'),
  transition('Running', 'Heartbeat missing 120s', 'Unresponsive', ({ activeAttempt }) => activeAttempt === true, 'active attempt exists'),
  transition('Unresponsive', 'Reconnected before 300s', 'Running', ({ sessionVerified }) => sessionVerified === true, 'session verified'),
  transition('Unresponsive', 'No recovery at 300s', 'Needs Attention', ({ automaticRetryUsed }) => automaticRetryUsed === true, 'automatic retry was already used'),
  transition('Unresponsive', 'Crash/restart', 'Recovery Required', ({ attemptUncertain }) => attemptUncertain === true, 'attempt state is uncertain'),
  transition('Recovery Required', 'Resume approved', 'Running', ({ checkpointValid, externalEffectsVerified }) => checkpointValid === true && externalEffectsVerified === true, 'checkpoint and external effects verified'),
  transition('Recovery Required', 'Replace approved', 'Running', ({ replacementAdapterPreflightPassed }) => replacementAdapterPreflightPassed === true, 'replacement adapter passed Preflight'),
  transition('Recovery Required', 'Stop', 'Cancelled', ({ checkpointSaved }) => checkpointSaved === true, 'checkpoint saved'),
  transition('Running', 'Pipeline success', 'Awaiting Acceptance', ({ pipelineSuccessCriteriaMet }) => pipelineSuccessCriteriaMet === true, 'pipeline success criteria met'),
  transition('Running', 'Unrecoverable failure', 'Failed', ({ retryAllowed }) => retryAllowed === false, 'no retry is allowed'),
  transition('Running', 'Review failed correction', 'Running', ({ correctionCycle = 0, criticalFinding }) => correctionCycle < 2 && criticalFinding !== true, 'correction cycle below 2 and no Critical finding'),
  transition('Running', 'Review failed exhausted', 'Needs Attention', ({ correctionCycle = 0 }) => correctionCycle >= 2, 'correction cycle exhausted'),
  transition('Running', 'Critical finding', 'Awaiting Approval', ({ criticalFinding }) => criticalFinding === true, 'Critical finding'),
  transition('Awaiting Acceptance', 'Accept', 'Accepted', ({ diffPresented, testsPresented, reviewPresented }) => diffPresented === true && testsPresented === true && reviewPresented === true, 'diff, tests and review were presented'),
  transition('Awaiting Acceptance', 'Request changes', 'Needs Attention', ({ reasonSaved }) => reasonSaved === true, 'reason saved'),
  transition('Accepted', 'Verify merge success', 'Completed', ({ targetContainsChange, noConflict, acceptedAt, mergeVerifiedAt, targetCommit }) => targetContainsChange === true && noConflict === true && Boolean(acceptedAt) && Boolean(mergeVerifiedAt) && Boolean(targetCommit), 'target contains change, no conflict and completion metadata exists'),
  transition('Accepted', 'Merge verification failed', 'Needs Attention', ({ mergeFailed }) => mergeFailed === true, 'merge attempt failed'),
  transition('Needs Attention', 'Retry', 'Running', ({ approvalValid, preflightValid }) => approvalValid === true && preflightValid === true, 'approval and Preflight are valid'),
  transition('Needs Attention', 'Replace Agent', 'Running', ({ replacementAdapterQualified }) => replacementAdapterQualified === true, 'replacement adapter is qualified'),
  transition('Needs Attention', 'Stop', 'Cancelled', ({ userConfirmed }) => userConfirmed === true, 'user confirmed stop')
]);

const STEP_TRANSITIONS = Object.freeze([
  transition('Pending', 'Prepare', 'Ready', ({ dependenciesReady }) => dependenciesReady === true, 'dependencies ready'),
  transition('Ready', 'Start', 'Running', ({ assignedAdapterReady }) => assignedAdapterReady === true, 'assigned adapter ready'),
  transition('Running', 'Sensitive action requested', 'Awaiting Approval', ({ validGrant }) => validGrant !== true, 'no valid grant'),
  transition('Awaiting Approval', 'Approve', 'Running', ({ approvalValid }) => approvalValid === true, 'approval valid'),
  transition('Awaiting Approval', 'Reject essential', 'Failed', ({ actionEssential }) => actionEssential === true, 'essential action rejected'),
  transition('Awaiting Approval', 'Reject optional', 'Running', ({ actionEssential }) => actionEssential === false, 'optional action rejected'),
  transition('Running', 'Heartbeat missing 120s', 'Unresponsive', ({ activeAttempt }) => activeAttempt === true, 'active attempt exists'),
  transition('Unresponsive', 'Retry', 'Retrying', ({ retryAllowed }) => retryAllowed === true, 'retry allowed'),
  transition('Retrying', 'Restarted', 'Running', ({ activeAttempt }) => activeAttempt === true, 'replacement attempt active'),
  transition('Unresponsive', 'Fail', 'Failed', ({ retryAllowed }) => retryAllowed === false, 'retry not allowed'),
  transition('Running', 'Succeeded', 'Succeeded', ({ exitOk, acceptanceChecksPassed }) => exitOk === true && acceptanceChecksPassed === true, 'exit and acceptance checks passed'),
  transition('Running', 'Failed', 'Failed', ({ unrecoverable }) => unrecoverable === true, 'unrecoverable failure'),
  transition('Running', 'Cancel', 'Cancelled', ({ checkpointSaved }) => checkpointSaved === true, 'checkpoint saved'),
  transition('Ready', 'Skip', 'Skipped', ({ skipApproved }) => skipApproved === true, 'skip approved')
]);

export function applyRunTransition(state, event, context = {}) {
  if (isOpenRunState(state) && event === 'Controlled Stop') return requireGuard(state, event, 'Cancelled', context, ({ transactionOpen }) => transactionOpen !== true, 'no state transaction is in progress');
  if (isActiveRunState(state) && event === 'Service shutdown') return requireGuard(state, event, 'Recovery Required', context, ({ checkpointSaved, childProcessesClosed }) => checkpointSaved === true && childProcessesClosed === true, 'checkpoint saved and child processes closed');
  return applyTransition(RUN_TRANSITIONS, state, event, context);
}

export function applyStepTransition(state, event, context = {}) {
  return applyTransition(STEP_TRANSITIONS, state, event, context);
}

export function assertRunTransition(state, event, context = {}) {
  return applyRunTransition(state, event, context).to;
}

export function assertStepTransition(state, event, context = {}) {
  return applyStepTransition(state, event, context).to;
}

export function startsRetention(state) {
  return state === 'Completed';
}

export function isRunFinal(state) {
  return FINAL_RUN_STATES.includes(state);
}

export function isOpenRunState(state) {
  return RUN_STATES.includes(state) && !FINAL_RUN_STATES.includes(state);
}

export function isActiveRunState(state) {
  return ['Preflight Running', 'Preparing Workspace', 'Running', 'Awaiting Approval', 'Unresponsive', 'Recovery Required', 'Needs Attention', 'Maintenance Hold'].includes(state);
}

function applyTransition(transitions, state, event, context) {
  const candidates = transitions.filter((candidate) => candidate.from === state && candidate.event === event);
  if (candidates.length === 0) throw new StateTransitionError('No transition exists for state/event.', { state, event });
  for (const candidate of candidates) {
    if (candidate.guard(context)) return { from: state, event, to: candidate.to, guard: candidate.guardDescription };
  }
  throw new StateTransitionError('Transition guard failed.', { state, event, guards: candidates.map((candidate) => candidate.guardDescription) });
}

function requireGuard(from, event, to, context, guard, guardDescription) {
  if (!guard(context)) throw new StateTransitionError('Transition guard failed.', { state: from, event, guards: [guardDescription] });
  return { from, event, to, guard: guardDescription };
}

function transition(from, event, to, guard, guardDescription) {
  return Object.freeze({ from, event, to, guard, guardDescription });
}
