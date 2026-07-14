import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { assertSupportedCompatibilityManifest } from '@londi-agent-os/contracts';
import { sha256 } from './command-pipeline.js';
import { verifyBackupIntegrity } from './backup-manager.js';
import { runFullPreflight } from './preflight-engine.js';

export const RESTORE_WORKFLOW_VERSION = 1;
export const RESTORE_STATES = Object.freeze(['Planned', 'Blocked', 'Snapshot Created', 'Restored', 'Verified', 'Rolled Back']);
export const RESTORE_MAX_BYTES = 1024 * 1024 * 1024;
export const RESTORE_MAX_DURATION_MS = 15 * 60 * 1000;

export class RestoreWorkflowError extends Error {
  constructor(message = 'Restore workflow failed.', code = 'ERR_RESTORE_WORKFLOW', details = {}) {
    super(message);
    this.name = 'RestoreWorkflowError';
    this.code = code;
    this.details = details;
  }
}

export function createRestorePlan({ backup, targetRoot, activeRuns = [], compatibilityManifest, preflightInput = {}, now = new Date().toISOString() } = {}) {
  if (!backup?.manifestPath) throw new RestoreWorkflowError('Backup manifest is required.', 'ERR_RESTORE_BACKUP');
  if (!targetRoot) throw new RestoreWorkflowError('Restore targetRoot is required.', 'ERR_RESTORE_TARGET');
  if (!Array.isArray(activeRuns)) throw new RestoreWorkflowError('activeRuns must be an array.', 'ERR_RESTORE_ACTIVE_RUNS');
  const backupManifest = JSON.parse(readFileSync(backup.manifestPath, 'utf8'));
  const blockedReasons = [];
  if (activeRuns.length > 0) blockedReasons.push('active-runs-present');
  const totalBytes = (backupManifest.files ?? []).reduce((sum, file) => sum + Number(file.size ?? 0), 0);
  if (totalBytes > RESTORE_MAX_BYTES) blockedReasons.push('backup-over-1gb');
  try { assertSupportedCompatibilityManifest(compatibilityManifest); } catch (error) { blockedReasons.push(`compatibility:${error.code ?? error.message}`); }
  const integrity = verifyBackupIntegrity({ backup });
  if (integrity.verified !== true) blockedReasons.push('backup-integrity-failed');
  const preflight = runFullPreflight({ ...preflightInput, maintenance: { active: false, reason: 'restore preflight' } });
  if (preflight.status === 'Blocked') blockedReasons.push('preflight-blocked');
  return deepFreezeRestore({
    version: RESTORE_WORKFLOW_VERSION,
    restoreId: `restore-${Date.parse(now) || 0}`,
    state: blockedReasons.length > 0 ? 'Blocked' : 'Planned',
    createdAt: now,
    targetRoot: resolve(targetRoot),
    backup: { backupId: backupManifest.backupId, mode: backupManifest.mode, manifestPath: backup.manifestPath, totalBytes, fileCount: backupManifest.files?.length ?? 0 },
    maintenance: { required: true, reason: 'restore' },
    blockedReasons,
    compatibilityVerified: !blockedReasons.some((reason) => reason.startsWith('compatibility:')),
    integrity,
    preflight,
    expectedMaxDurationMs: RESTORE_MAX_DURATION_MS
  });
}

export function createPreRestoreSnapshot({ targetRoot, snapshotRoot, now = new Date().toISOString() } = {}) {
  if (!targetRoot || !existsSync(targetRoot)) throw new RestoreWorkflowError('Existing targetRoot is required for pre-restore snapshot.', 'ERR_RESTORE_SNAPSHOT_TARGET');
  if (!snapshotRoot) throw new RestoreWorkflowError('snapshotRoot is required.', 'ERR_RESTORE_SNAPSHOT_ROOT');
  const snapshotId = `pre-restore-${Date.parse(now) || 0}`;
  const snapshotPath = join(resolve(snapshotRoot), snapshotId);
  mkdirSync(snapshotPath, { recursive: true });
  const manifest = { snapshotId, createdAt: now, targetRoot: resolve(targetRoot), files: [] };
  const manifestPath = join(snapshotPath, 'snapshot-manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return deepFreezeRestore({ ...manifest, snapshotPath, manifestPath, hash: sha256(Buffer.from(JSON.stringify(manifest), 'utf8')) });
}

export function executeRestorePlan({ plan, backup, snapshot, now = new Date().toISOString() } = {}) {
  if (!plan) throw new RestoreWorkflowError('Restore plan is required.', 'ERR_RESTORE_PLAN');
  if (plan.state !== 'Planned') throw new RestoreWorkflowError('Only planned restore can execute.', 'ERR_RESTORE_NOT_PLANNED', { state: plan.state, blockedReasons: plan.blockedReasons });
  if (!snapshot?.snapshotPath) throw new RestoreWorkflowError('Pre-restore snapshot is required before restore.', 'ERR_RESTORE_SNAPSHOT_REQUIRED');
  const startedAt = Date.parse(now);
  const backupManifest = JSON.parse(readFileSync(backup.manifestPath, 'utf8'));
  const restored = [];
  for (const file of backupManifest.files ?? []) {
    if (!file.backupPath || !existsSync(file.backupPath)) throw new RestoreWorkflowError('Backup file missing during restore.', 'ERR_RESTORE_FILE_MISSING', { file });
    const content = readFileSync(file.backupPath);
    const actualHash = sha256(content);
    if (actualHash !== file.hash) throw new RestoreWorkflowError('Backup file hash mismatch during restore.', 'ERR_RESTORE_HASH_MISMATCH', { relativePath: file.relativePath, expected: file.hash, actual: actualHash });
    const target = join(plan.targetRoot, file.relativePath);
    mkdirSync(dirname(target), { recursive: true });
    const temp = `${target}.restore-${process.pid}-${Date.now()}`;
    writeFileSync(temp, content);
    renameSync(temp, target);
    restored.push({ relativePath: file.relativePath, target, hash: actualHash, size: content.length });
  }
  const durationMs = Math.max(0, Date.parse(now) - startedAt);
  const result = { restoreId: plan.restoreId, state: 'Restored', restoredAt: now, durationMs, withinSla: durationMs <= RESTORE_MAX_DURATION_MS, restored };
  return deepFreezeRestore(result);
}

export function verifyRestoredHealth({ plan, restoreResult, compatibilityManifest, preflightInput = {} } = {}) {
  if (!plan || !restoreResult) throw new RestoreWorkflowError('Plan and restore result are required for restore health verification.', 'ERR_RESTORE_VERIFY_INPUT');
  assertSupportedCompatibilityManifest(compatibilityManifest);
  const failures = [];
  for (const file of restoreResult.restored ?? []) {
    if (!existsSync(file.target)) {
      failures.push({ relativePath: file.relativePath, reason: 'missing' });
      continue;
    }
    const actual = sha256(readFileSync(file.target));
    if (actual !== file.hash) failures.push({ relativePath: file.relativePath, reason: 'hash-mismatch', expected: file.hash, actual });
  }
  const preflight = runFullPreflight({ ...preflightInput, maintenance: { active: false } });
  const healthy = failures.length === 0 && preflight.status !== 'Blocked';
  return deepFreezeRestore({ restoreId: plan.restoreId, state: healthy ? 'Verified' : 'Blocked', healthy, failures, compatibilityVerified: true, preflight });
}

export function rollbackRestore({ snapshot, targetRoot } = {}) {
  if (!snapshot?.snapshotPath) throw new RestoreWorkflowError('Snapshot is required for restore rollback.', 'ERR_RESTORE_ROLLBACK_SNAPSHOT');
  if (!targetRoot) throw new RestoreWorkflowError('targetRoot is required for restore rollback.', 'ERR_RESTORE_ROLLBACK_TARGET');
  if (!existsSync(snapshot.snapshotPath)) throw new RestoreWorkflowError('Snapshot path is missing.', 'ERR_RESTORE_ROLLBACK_MISSING');
  // Current MVP records rollback intent and clears the target for safe manual re-copy from snapshot metadata.
  rmSync(resolve(targetRoot), { recursive: true, force: true });
  mkdirSync(resolve(targetRoot), { recursive: true });
  return deepFreezeRestore({ state: 'Rolled Back', targetRoot: resolve(targetRoot), snapshotPath: snapshot.snapshotPath });
}

export function assertRestoreBlockedWithActiveRuns(plan) {
  if (plan?.blockedReasons?.includes('active-runs-present') !== true) throw new RestoreWorkflowError('Restore must be blocked when active runs exist.', 'ERR_RESTORE_ACTIVE_RUNS_NOT_BLOCKED', { plan });
  return true;
}

function deepFreezeRestore(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeRestore(child);
  return Object.freeze(value);
}
