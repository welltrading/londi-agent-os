import { existsSync, readFileSync } from 'node:fs';
import { assertReplayAllowedForExternalEffect } from './network-grants.js';
import { verifyArtifactRecord } from './artifact-layout.js';

export const RECOVERY_ACTIONS = Object.freeze(['Resume', 'Replace', 'Stop']);
export const RECOVERY_CHECK_STATUSES = Object.freeze(['Verified', 'Missing', 'Mismatch', 'Blocked', 'Unknown']);

export class RestartRecoveryError extends Error {
  constructor(message, code = 'ERR_RESTART_RECOVERY', details = {}) {
    super(message);
    this.name = 'RestartRecoveryError';
    this.code = code;
    this.details = details;
  }
}

export function createRecoveryConsistencyReport({
  run,
  checkpoint,
  artifactManifest,
  workspace,
  processSnapshot = {},
  externalEffects = [],
  now = new Date().toISOString()
} = {}) {
  if (!run || typeof run !== 'object' || !run.runId) throw new RestartRecoveryError('Recovery run metadata is required.', 'ERR_RECOVERY_RUN');
  const checks = [
    verifyCheckpointForRecovery(checkpoint),
    verifyArtifactManifestForRecovery(artifactManifest),
    verifyWorkspaceForRecovery(workspace),
    verifyProcessSnapshotForRecovery(processSnapshot),
    verifyExternalEffectsForRecovery(externalEffects)
  ];
  const blockedReasons = checks.flatMap((check) => check.status === 'Verified' ? [] : [{ check: check.name, status: check.status, reason: check.reason }]);
  const actions = createRecoveryActionGuards({ checks, externalEffects });
  return deepFreezeRecovery({
    runId: run.runId,
    previousState: run.state ?? null,
    recoveredState: 'Recovery Required',
    generatedAt: now,
    autoResume: false,
    checks,
    blocked: blockedReasons.length > 0,
    blockedReasons,
    actions,
    summary: blockedReasons.length === 0 ? 'Recovery guards passed; user decision required.' : 'Recovery requires attention before resume or replace.'
  });
}

export function verifyCheckpointForRecovery(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object') return check('checkpoint', 'Missing', 'latest checkpoint is missing');
  if (checkpoint.safeToResume !== true) return check('checkpoint', 'Blocked', 'checkpoint is not marked safe to resume');
  if (checkpoint.secretMatches && checkpoint.secretMatches > 0) return check('checkpoint', 'Blocked', 'checkpoint reports secret matches');
  if (checkpoint.path && !existsSync(checkpoint.path)) return check('checkpoint', 'Missing', 'checkpoint artifact path does not exist');
  return check('checkpoint', 'Verified', 'safe checkpoint available', { checkpointId: checkpoint.id ?? checkpoint.checkpointId ?? null, sequence: checkpoint.sequence ?? null });
}

export function verifyArtifactManifestForRecovery(artifactManifest) {
  if (!artifactManifest || typeof artifactManifest !== 'object') return check('artifact-manifest', 'Missing', 'artifact manifest is missing');
  const records = artifactManifest.records ?? [];
  if (!Array.isArray(records)) return check('artifact-manifest', 'Mismatch', 'manifest records must be an array');
  try {
    for (const record of records) verifyArtifactRecord(record);
  } catch (error) {
    return check('artifact-manifest', 'Mismatch', error.message, { code: error.code ?? null });
  }
  return check('artifact-manifest', 'Verified', 'manifest records verified', { records: records.length, manifestHash: artifactManifest.manifestHash ?? null });
}

export function verifyWorkspaceForRecovery(workspace) {
  if (!workspace || typeof workspace !== 'object') return check('workspace', 'Missing', 'workspace snapshot is missing');
  if (workspace.worktreePath && !existsSync(workspace.worktreePath)) return check('workspace', 'Missing', 'worktree path is missing');
  if (workspace.manifestPath && !existsSync(workspace.manifestPath)) return check('workspace', 'Missing', 'workspace manifest path is missing');
  if (workspace.manifestPath) {
    try {
      const parsed = JSON.parse(readFileSync(workspace.manifestPath, 'utf8'));
      if (workspace.runId && parsed.runId !== workspace.runId) return check('workspace', 'Mismatch', 'workspace manifest runId mismatch');
    } catch (error) {
      return check('workspace', 'Mismatch', 'workspace manifest cannot be parsed', { cause: error.message });
    }
  }
  return check('workspace', 'Verified', 'workspace paths and manifest verified', { worktreePath: workspace.worktreePath ?? null, baseCommit: workspace.baseCommit ?? null });
}

export function verifyProcessSnapshotForRecovery(processSnapshot = {}) {
  const active = processSnapshot.activeAttempts ?? [];
  if (!Array.isArray(active)) return check('process', 'Mismatch', 'activeAttempts must be an array');
  if (active.length > 0) return check('process', 'Unknown', 'active child process state is uncertain', { activeAttempts: active });
  return check('process', 'Verified', 'no active child process remains');
}

export function verifyExternalEffectsForRecovery(externalEffects = []) {
  if (!Array.isArray(externalEffects)) return check('external-effects', 'Mismatch', 'externalEffects must be an array');
  for (const effect of externalEffects) {
    try {
      assertReplayAllowedForExternalEffect(effect.state ?? effect.externalEffectState ?? 'Unknown');
    } catch (error) {
      return check('external-effects', 'Blocked', 'external effect is unknown and blocks replay', { effectId: effect.id ?? null });
    }
  }
  return check('external-effects', 'Verified', 'external effects are replay-safe', { count: externalEffects.length });
}

export function createRecoveryActionGuards({ checks = [], externalEffects = [] } = {}) {
  const byName = Object.fromEntries(checks.map((item) => [item.name, item]));
  const checkpointValid = byName.checkpoint?.status === 'Verified';
  const artifactsValid = byName['artifact-manifest']?.status === 'Verified';
  const workspaceValid = byName.workspace?.status === 'Verified';
  const processClear = byName.process?.status === 'Verified';
  const externalEffectsVerified = byName['external-effects']?.status === 'Verified';
  const unknownExternal = externalEffects.some((effect) => (effect.state ?? effect.externalEffectState) === 'Unknown');
  return deepFreezeRecovery({
    Resume: { enabled: checkpointValid && artifactsValid && workspaceValid && processClear && externalEffectsVerified, requiresApproval: true, guard: 'checkpoint/artifacts/workspace/process/external effects verified' },
    Replace: { enabled: checkpointValid && workspaceValid && processClear && !unknownExternal, requiresApproval: true, guard: 'checkpoint/workspace/process verified and no unknown external effect' },
    Stop: { enabled: checkpointValid, requiresApproval: true, guard: 'checkpoint saved; user can stop safely' }
  });
}

export function assertRecoveryActionAvailable(report, action) {
  if (!RECOVERY_ACTIONS.includes(action)) throw new RestartRecoveryError('Unknown recovery action.', 'ERR_RECOVERY_ACTION', { action });
  if (report?.autoResume === true) throw new RestartRecoveryError('Recovery must not auto-resume.', 'ERR_RECOVERY_AUTO_RESUME');
  const guard = report?.actions?.[action];
  if (!guard?.enabled) throw new RestartRecoveryError('Recovery action is blocked by guards.', 'ERR_RECOVERY_ACTION_BLOCKED', { action, guard });
  return true;
}

function check(name, status, reason, details = {}) {
  if (!RECOVERY_CHECK_STATUSES.includes(status)) throw new RestartRecoveryError('Invalid recovery check status.', 'ERR_RECOVERY_CHECK_STATUS', { status });
  return deepFreezeRecovery({ name, status, reason, ...details });
}

function deepFreezeRecovery(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeRecovery(child);
  return Object.freeze(value);
}
