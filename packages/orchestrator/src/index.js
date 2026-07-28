import { MVP_PIPELINE_TEMPLATES } from '@londi-agent-os/contracts';
export const ORCHESTRATOR_PACKAGE = '@londi-agent-os/orchestrator';
export function listSupportedPipelineTemplates() {
  return [...MVP_PIPELINE_TEMPLATES];
}
export { ensureApprovedDataDirectories } from './configuration.js';
export { createDirectManualRunExecutor, DirectManualRunExecutionError, captureDiagnostics, DIRECT_MANUAL_DIAGNOSTIC_TAIL_BYTES } from './direct-manual-run-executor.js';
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
  CHECKPOINT_REASONS,
  SAFE_SHUTDOWN_TIMEOUT_MS,
  CheckpointSchedulerError,
  createCheckpointRecord,
  writeCheckpointArtifact,
  createCheckpointScheduler,
  runSafeShutdown
} from './checkpoint-scheduler.js';
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
  COMPLETION_RETENTION_DAYS,
  CompletionRetentionError,
  completeRunAfterGateF,
  createRetentionTrigger,
  assertAcceptedNotCleanupEligible
} from './completion-retention.js';
export {
  MANUAL_MERGE_GATE_ID,
  MANUAL_MERGE_STATUSES,
  MANUAL_MERGE_FAILURE_REASONS,
  ManualMergeError,
  createManualMergeGate,
  verifyManualMerge,
  verifyPatchEquivalence,
  assertNoAutomaticMergeCommand
} from './manual-merge.js';
export {
  TECHNICAL_RETRY_LIMIT,
  REPLACEMENT_CONTEXT_FORBIDDEN_PATTERNS,
  TechnicalRetryError,
  createRetryDecision,
  createAgentReplacementPlan,
  createReconnectPlan,
  assertReplacementContextSafe
} from './technical-retry.js';
export {
  RECOVERY_ACTIONS,
  RECOVERY_CHECK_STATUSES,
  RestartRecoveryError,
  createRecoveryConsistencyReport,
  verifyCheckpointForRecovery,
  verifyArtifactManifestForRecovery,
  verifyWorkspaceForRecovery,
  verifyProcessSnapshotForRecovery,
  verifyExternalEffectsForRecovery,
  createRecoveryActionGuards,
  assertRecoveryActionAvailable
} from './restart-recovery.js';
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
  NETWORK_GRANT_TTL_MINUTES,
  NETWORK_GRANT_STATUSES,
  EXTERNAL_EFFECT_STATES,
  NetworkGrantError,
  createNetworkGrant,
  createNetworkAllowlist,
  assertNetworkAllowed,
  assertNetworkGrantUsable,
  classifyExternalEffect,
  assertReplayAllowedForExternalEffect,
  recordNetworkAttempt,
  createNetworkApprovalPayload,
  revokeNetworkGrant,
  expireNetworkGrant,
  assertHostname
} from './network-grants.js';
export {
  TOOL_CATALOG_SCHEMA_VERSION,
  TRUSTED_TOOL_SOURCES,
  DEPENDENCY_DECISIONS,
  ToolCatalogError,
  createToolCatalog,
  normalizeToolEntry,
  createToolCatalogFromPackageLock,
  evaluateDependencyPolicy,
  assertDependencyInstallAllowed,
  assertCacheReadOnly,
  createDependencyApprovalPayload,
  checksumText
} from './tool-catalog.js';
export {
  PREFLIGHT_STATUSES,
  PREFLIGHT_CHECK_STATUSES,
  PREFLIGHT_MIN_FREE_BYTES,
  PreflightEngineError,
  runFullPreflight,
  summarizePreflightStatus,
  assertPreflightCanStart,
  createPreflightCheck
} from './preflight-engine.js';
export {
  SECURITY_HARDENING_VERSION,
  SECURITY_BLOCKING_SEVERITIES,
  SECURITY_ALLOWED_LOCAL_BIND,
  SECURITY_REQUIRED_TOKEN_BITS,
  SECURITY_REQUIRED_CORS_MODE,
  SecurityHardeningError,
  validateLocalSecurityPosture,
  scanSecretCorpus,
  evaluateDependencyScan,
  createFinalLeakageScanReport,
  runFinalSecurityHardening
} from './security-hardening.js';
export {
  SECURITY_ACCEPTANCE_THREATS,
  SECURITY_ACCEPTANCE_OUTCOMES,
  SecurityAcceptanceError,
  runSecurityAcceptanceSuite,
  createSecurityAcceptanceReport,
  normalizeSecurityCase,
  assertSecurityAcceptancePassed,
  detectVaultPromptInjection
} from './security-acceptance-suite.js';
export {
  PERFORMANCE_SCALE_VERSION,
  PERFORMANCE_TARGETS,
  PerformanceScaleValidationError,
  percentile,
  evaluatePerformanceTargets,
  createScaleDataset,
  createLogRotationPolicy,
  rotateLogIfNeeded,
  createRestoreDrillDataset,
  createRestoreDrillReport,
  createPerformanceValidationReport
} from './performance-scale-validation.js';
export {
  STABLE_UPDATE_VERSION,
  STABLE_UPDATE_STATES,
  STABLE_UPDATE_MIN_HEALTHY_VERSIONS,
  STABLE_UPDATE_CHECK_CADENCE,
  StableUpdateError,
  createWeeklyUpdateCheck,
  createStableUpdatePlan,
  createPreUpdateSnapshot,
  installSideBySide,
  runUpdateSmokeTests,
  atomicSwitchUpdate,
  rollbackStableUpdate,
  verifyStableVersions,
  assertUpdateBlockedWithActiveRuns
} from './stable-update.js';
export {
  RESTORE_WORKFLOW_VERSION,
  RESTORE_STATES,
  RESTORE_MAX_BYTES,
  RESTORE_MAX_DURATION_MS,
  RestoreWorkflowError,
  createRestorePlan,
  createPreRestoreSnapshot,
  executeRestorePlan,
  verifyRestoredHealth,
  rollbackRestore,
  assertRestoreBlockedWithActiveRuns
} from './restore-workflow.js';
export {
  BACKUP_MANAGER_VERSION,
  BACKUP_DAILY_RETENTION,
  BACKUP_WEEKLY_RETENTION,
  BACKUP_MODES,
  BACKUP_ALLOWED_KINDS,
  BackupManagerError,
  createBackupManifest,
  writeBackup,
  verifyBackupIntegrity,
  selectBackupSources,
  createBackupRetentionPlan,
  assertBackupExcludesSecretsAndCode,
  listBackupDirectories
} from './backup-manager.js';
export {
  RETENTION_SCHEDULER_ID,
  AUDIT_RETENTION_DAYS,
  TERMINAL_RETENTION_DAYS,
  COMPLETED_RETENTION_DAYS,
  RetentionSchedulerError,
  createRetentionSchedulerRun,
  createDailyRetentionSchedule,
  createRetentionAuditEntry,
  createAuditRetentionPlan,
  assertAcceptedRunsNotDeleted
} from './retention-scheduler.js';
export {
  RELEASE_DECISION_VERSION,
  RELEASE_DECISIONS,
  FR_IDS,
  NFR_IDS,
  Q_IDS,
  MVP_ACCEPTANCE_IDS,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  ReleaseDecisionError,
  createTraceabilityMatrix,
  validateTraceabilityMatrix,
  createDefectRegister,
  createReleaseDecision,
  assertReleaseGo
} from './release-decision.js';
export {
  ACCEPTANCE_RUN_COUNT,
  ACCEPTANCE_REQUIRED_TEMPLATES,
  ACCEPTANCE_REQUIRED_ADAPTERS,
  AcceptanceRunsError,
  runFiveAcceptanceRuns,
  createAcceptanceRunsReport,
  assertAcceptanceRunsReport
} from './acceptance-runs.js';
export {
  FAULT_INJECTION_SCENARIOS,
  FAULT_EXPECTED_OUTCOMES,
  FaultInjectionSuiteError,
  runFaultInjectionScenario,
  runFaultInjectionSuite,
  validateFaultScenarioResult
} from './fault-injection-suite.js';
export {
  EventStoreError,
  AuditAppendOnlyError,
  createInMemoryEventStore,
  appendEventAndAudit,
  compareEventOrder,
  toAuditCsv,
  redactAuditEntries
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
  detectDefaultBranch,
  createRunWorkspace,
  releaseRunWorkspace,
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
