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
  PipelineApprovalGateError,
  StaleApprovalError,
  ExpiredApprovalError,
  InvalidApprovalDecisionError,
  APPROVAL_STATES,
  APPROVAL_DECISIONS,
  PIPELINE_APPROVAL_GATE_ID,
  PIPELINE_APPROVAL_GATE_KIND,
  SENSITIVE_APPROVAL_TTL_MINUTES,
  createApprovalRequest,
  createPipelineApprovalGate,
  createPipelineApprovalPayload,
  decideApproval,
  decidePipelineApprovalGate,
  assertApprovalUsable,
  assertPipelineApprovalPayload,
  invalidateApprovalOnChange,
  invalidatePipelineApprovalOnConfigChange,
  hashApprovalPayload,
  addMinutesIso
} from './approvals.js';
export {
  HANDOFF_APPROVAL_GATE_ID,
  HANDOFF_APPROVAL_KIND,
  HANDOFF_ARTIFACT_FILENAME,
  HANDOFF_REQUIRED_SECTIONS,
  HandoffError,
  createHandoffRevision,
  createHandoffApprovalGate,
  createHandoffApprovalPayload,
  decideHandoffApprovalGate,
  markHandoffRevisionApproved,
  assertBuildReceivesApprovedHandoff,
  assertHandoffRevision,
  assertHandoffMarkdown
} from './handoff.js';
export {
  REVIEW_ARTIFACT_FILENAME,
  REVIEW_APPROVAL_GATE_ID,
  REVIEW_APPROVAL_KIND,
  REVIEW_SEVERITIES,
  REVIEW_BLOCKING_SEVERITIES,
  REVIEW_REQUIRED_SECTIONS,
  ReviewArtifactError,
  createReviewArtifact,
  createCriticalReviewApprovalGate,
  createCriticalReviewApprovalPayload,
  decideCriticalReviewApprovalGate,
  assertReviewArtifact,
  assertReviewMarkdown,
  getHighestReviewSeverity
} from './review.js';
export {
  CORRECTION_CYCLE_LIMIT,
  CORRECTION_CYCLE_STATES,
  CorrectionCycleError,
  createCorrectionCycleState,
  evaluateReviewForCorrection,
  applyCorrectionCycleDecision,
  assertThirdAttemptRequiresException
} from './correction-cycle.js';
export {
  ARTIFACT_LAYOUT_VERSION,
  ARTIFACT_DIRECTORIES,
  ARTIFACT_SECRET_PATTERNS,
  ArtifactLayoutError,
  createArtifactLayout,
  writeArtifactRecord,
  createArtifactManifest,
  writeArtifactManifest,
  verifyArtifactRecord,
  assertCheckpointWithoutSecrets
} from './artifact-layout.js';
export {
  ACCEPTANCE_GATE_ID,
  ACCEPTANCE_APPROVAL_KIND,
  ACCEPTANCE_DECISIONS,
  ACCEPTANCE_REQUIRED_SECTIONS,
  AcceptanceGateError,
  createAcceptanceSnapshot,
  createAcceptanceGate,
  createAcceptancePayload,
  decideAcceptanceGate,
  invalidateAcceptanceOnSnapshotChange,
  assertAcceptanceSnapshot
} from './acceptance-gate.js';
export {
  PIPELINE_INTEGRATION_SCENARIOS,
  PipelineIntegrationSuiteError,
  runPipelineIntegrationScenario,
  runPipelineIntegrationSuite
} from './pipeline-integration-suite.js';
export {
  OBSIDIAN_CONTEXT_BROKER_VERSION,
  OBSIDIAN_ALLOWED_EXTENSIONS,
  ObsidianContextBrokerError,
  createObsidianContextBroker,
  searchObsidianContext,
  assertCandidateInsideApprovedRoots
} from './obsidian-context-broker.js';
export {
  OBSIDIAN_CONTEXT_APPROVAL_KIND,
  OBSIDIAN_CONTEXT_APPROVAL_GATE_ID,
  OBSIDIAN_CONTEXT_SNAPSHOT_FILENAME,
  ObsidianContextApprovalError,
  createContextSelection,
  createContextApprovalPayload,
  createContextApprovalGate,
  decideContextApprovalGate,
  createReadOnlyContextSnapshot,
  writeContextSnapshotArtifact,
  createAgentContextInjection,
  invalidateContextApprovalOnRefresh,
  assertSnapshotUnaffectedBySourceChange
} from './obsidian-context-approval.js';
export {
  OBSIDIAN_WRITEBACK_APPROVAL_KIND,
  OBSIDIAN_WRITEBACK_APPROVAL_GATE_ID,
  OBSIDIAN_WRITEBACK_DRAFT_FILENAME,
  OBSIDIAN_WRITEBACK_ALLOWED_SECTIONS,
  OBSIDIAN_WRITEBACK_FORBIDDEN_PATTERNS,
  ObsidianWritebackError,
  createObsidianWritebackDraft,
  editObsidianWritebackDraft,
  createObsidianWritebackApprovalGate,
  createObsidianWritebackApprovalPayload,
  decideObsidianWritebackApprovalGate,
  markObsidianWritebackApproved,
  writeObsidianApprovedDraft,
  createConflictDraft,
  writeObsidianWritebackDraftArtifact,
  summarizeObsidianWritebackOutcome,
  assertObsidianWritebackContent
} from './obsidian-writeback.js';
export {
  SECRET_GRANT_TTL_MINUTES,
  SECRET_GRANT_STATUSES,
  SECRET_VALUE_PLACEHOLDER,
  SecretBrokerError,
  createInMemoryCredentialManager,
  createWindowsCredentialManager,
  createSecretGrant,
  assertGrantValid,
  issueSecretGrant,
  injectGrantedSecret,
  createGrantCleanup,
  revokeSecretGrant,
  expireSecretGrant,
  redactGrantForAudit,
  assertSecretNotPersisted,
  assertSecretAlias
} from './secret-broker.js';
export {
  REDACTION_PLACEHOLDER,
  QUARANTINE_EVENT_TYPE,
  REDACTION_SURFACES,
  SECRET_LEAKAGE_PATTERNS,
  RedactionQuarantineError,
  redactSecretText,
  redactSurface,
  redactEndToEnd,
  detectSecretLeak,
  quarantineLeakedArtifact,
  createSecurityEvent,
  assertNoSecretLeakage,
  runSecretLeakageCorpus
} from './redaction-quarantine.js';
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
  WorkspaceSnapshotError,
  getWorkspaceStatusSummary,
  getWorkspaceDiff,
  createWorkspaceAcceptanceSnapshot,
  WorkspaceCleanupError,
  createWorkspaceCleanupPlan,
  executeWorkspaceCleanupPlan,
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
  AttemptSupervisionError,
  ATTEMPT_SUPERVISION_DEFAULTS,
  ATTEMPT_SUPERVISION_STATES,
  createAttemptProcessManager,
  createAttemptSupervisor,
  deriveJobObjectName
} from './process-manager.js';
