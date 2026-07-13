import { MVP_PIPELINE_TEMPLATES } from '@londi-agent-os/contracts';
export const ORCHESTRATOR_PACKAGE = '@londi-agent-os/orchestrator';
export function listSupportedPipelineTemplates() {
  return [...MVP_PIPELINE_TEMPLATES];
}
export { ensureApprovedDataDirectories } from './configuration.js';
export {
  RUN_STATES,
  STEP_STATES,
  FINAL_RUN_STATES,
  RETENTION_STARTING_RUN_STATES,
  StateTransitionError,
  applyRunTransition,
  applyStepTransition,
  assertRunTransition,
  assertStepTransition,
  isRunFinal,
  isOpenRunState,
  startsRetention
} from './state-machine.js';
export {
  CommandPipelineError,
  ArtifactMismatchError,
  executeCommandPipeline,
  writeAtomicArtifact,
  createSqliteCommandTransaction,
  sha256
} from './command-pipeline.js';
export {
  IdempotencyReplayError,
  StaleRevisionError,
  IdempotencyConflictError,
  createInMemoryIdempotencyStore,
  createSqliteIdempotencyStore,
  assertFreshRevision,
  withIdempotency
} from './idempotency.js';
export {
  ApprovalError,
  StaleApprovalError,
  ExpiredApprovalError,
  InvalidApprovalDecisionError,
  APPROVAL_STATES,
  APPROVAL_DECISIONS,
  SENSITIVE_APPROVAL_TTL_MINUTES,
  createApprovalRequest,
  decideApproval,
  assertApprovalUsable,
  invalidateApprovalOnChange,
  hashApprovalPayload,
  addMinutesIso
} from './approvals.js';
export {
  EventStoreError,
  AuditAppendOnlyError,
  createInMemoryEventStore,
  appendEventAndAudit,
  compareEventOrder,
  toAuditCsv
} from './event-store.js';
export {
  WorkspaceValidationError,
  WorkspaceLockConflictError,
  WorkspaceLifecycleError,
  WorkspaceIsolationError,
  createServiceAccountIsolationPolicy,
  assertWorkspaceWriteAllowed,
  simulateWorkspaceWrite,
  deriveRunBranchName,
  deriveRunWorktreePath,
  createRunWorkspace,
  validateGitProject,
  createInMemoryWorkspaceLockStore,
  classifyWorkspaceValidationError
} from './workspace-manager.js';
if (process.argv.includes('--build-check')) console.log(`${ORCHESTRATOR_PACKAGE} build OK`);

export {
  ProcessControlError,
  createAttemptProcessManager,
  deriveJobObjectName
} from './process-manager.js';
