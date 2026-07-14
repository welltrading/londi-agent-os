import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { assertSupportedCompatibilityManifest } from '@londi-agent-os/contracts';
import { sha256 } from './command-pipeline.js';
import { createBackupManifest, selectBackupSources, verifyBackupIntegrity, writeBackup } from './backup-manager.js';

export const STABLE_UPDATE_VERSION = 1;
export const STABLE_UPDATE_STATES = Object.freeze(['Planned', 'Blocked', 'Installed Side By Side', 'Switched', 'Rolled Back', 'Verified']);
export const STABLE_UPDATE_MIN_HEALTHY_VERSIONS = 2;
export const STABLE_UPDATE_CHECK_CADENCE = 'weekly';

export class StableUpdateError extends Error {
  constructor(message = 'Stable update failed.', code = 'ERR_STABLE_UPDATE', details = {}) {
    super(message);
    this.name = 'StableUpdateError';
    this.code = code;
    this.details = details;
  }
}

export function createWeeklyUpdateCheck({ currentVersion, latestVersion, checkedAt = new Date().toISOString(), channel = 'stable' } = {}) {
  if (!currentVersion || !latestVersion) throw new StableUpdateError('currentVersion and latestVersion are required.', 'ERR_UPDATE_VERSION');
  return deepFreezeUpdate({
    cadence: STABLE_UPDATE_CHECK_CADENCE,
    channel,
    checkedAt,
    currentVersion,
    latestVersion,
    updateAvailable: currentVersion !== latestVersion
  });
}

export function createStableUpdatePlan({
  updateCheck,
  installRoot,
  activeRuns = [],
  compatibilityManifest,
  healthyVersions = [],
  now = new Date().toISOString()
} = {}) {
  if (!updateCheck) throw new StableUpdateError('updateCheck is required.', 'ERR_UPDATE_CHECK');
  if (!installRoot) throw new StableUpdateError('installRoot is required.', 'ERR_UPDATE_INSTALL_ROOT');
  if (!Array.isArray(activeRuns)) throw new StableUpdateError('activeRuns must be an array.', 'ERR_UPDATE_ACTIVE_RUNS');
  const blockedReasons = [];
  if (activeRuns.length > 0) blockedReasons.push('active-runs-present');
  if (updateCheck.updateAvailable !== true) blockedReasons.push('no-update-available');
  try { assertSupportedCompatibilityManifest(compatibilityManifest); } catch (error) { blockedReasons.push(`compatibility:${error.code ?? error.message}`); }
  return deepFreezeUpdate({
    version: STABLE_UPDATE_VERSION,
    updateId: `update-${Date.parse(now) || 0}`,
    state: blockedReasons.length > 0 ? 'Blocked' : 'Planned',
    createdAt: now,
    installRoot: resolve(installRoot),
    currentVersion: updateCheck.currentVersion,
    targetVersion: updateCheck.latestVersion,
    blockedReasons,
    healthyVersions: [...healthyVersions],
    requiresSnapshot: true,
    sideBySidePath: join(resolve(installRoot), `releases/${updateCheck.latestVersion}`),
    currentSymlinkPath: join(resolve(installRoot), 'current')
  });
}

export function createPreUpdateSnapshot({ plan, sourceRoot, backupRoot, databasePath, configPath, artifactRecords = [], now = new Date().toISOString() } = {}) {
  if (!plan || plan.state !== 'Planned') throw new StableUpdateError('Planned update is required before snapshot.', 'ERR_UPDATE_PLAN');
  const files = selectBackupSources({ sourceRoot, databasePath, configPath, artifactRecords });
  const manifest = createBackupManifest({ backupId: `${plan.updateId}-snapshot`, mode: 'pre-maintenance', files, sourceRoot, createdAt: now });
  const backup = writeBackup({ manifest, backupRoot });
  const integrity = verifyBackupIntegrity({ backup });
  if (integrity.verified !== true) throw new StableUpdateError('Pre-update snapshot integrity failed.', 'ERR_UPDATE_SNAPSHOT_INTEGRITY', { integrity });
  return deepFreezeUpdate({ updateId: plan.updateId, backup, integrity });
}

export function installSideBySide({ plan, releaseFiles = [], now = new Date().toISOString() } = {}) {
  if (!plan || plan.state !== 'Planned') throw new StableUpdateError('Only planned update can install side by side.', 'ERR_UPDATE_NOT_PLANNED', { state: plan?.state });
  if (!Array.isArray(releaseFiles) || releaseFiles.length === 0) throw new StableUpdateError('releaseFiles must be a non-empty array.', 'ERR_UPDATE_RELEASE_FILES');
  mkdirSync(plan.sideBySidePath, { recursive: true });
  const installed = [];
  for (const file of releaseFiles) {
    if (!file.relativePath || file.content === undefined) throw new StableUpdateError('Release file requires relativePath and content.', 'ERR_UPDATE_RELEASE_FILE');
    const target = join(plan.sideBySidePath, file.relativePath);
    mkdirSync(dirname(target), { recursive: true });
    const buffer = Buffer.isBuffer(file.content) ? file.content : Buffer.from(String(file.content), 'utf8');
    writeFileSync(target, buffer);
    installed.push({ relativePath: file.relativePath, path: target, hash: sha256(buffer), size: buffer.length });
  }
  return deepFreezeUpdate({ updateId: plan.updateId, state: 'Installed Side By Side', installedAt: now, releasePath: plan.sideBySidePath, files: installed });
}

export function runUpdateSmokeTests({ installation, smokeTests = [] } = {}) {
  if (!installation?.releasePath) throw new StableUpdateError('Installation is required for smoke tests.', 'ERR_UPDATE_INSTALLATION');
  const results = smokeTests.map((test) => {
    try {
      const passed = typeof test.run === 'function' ? test.run(installation) === true : test.passed === true;
      return { id: test.id ?? 'smoke', passed, detail: test.detail ?? null };
    } catch (error) {
      return { id: test.id ?? 'smoke', passed: false, detail: error.message };
    }
  });
  const passed = results.length > 0 && results.every((result) => result.passed === true);
  return deepFreezeUpdate({ updateId: installation.updateId, passed, results });
}

export function atomicSwitchUpdate({ plan, installation, smokeResult, currentPath = plan?.currentSymlinkPath, now = new Date().toISOString() } = {}) {
  if (!plan || !installation) throw new StableUpdateError('Plan and installation are required for atomic switch.', 'ERR_UPDATE_SWITCH_INPUT');
  if (smokeResult?.passed !== true) throw new StableUpdateError('Smoke tests must pass before atomic switch.', 'ERR_UPDATE_SMOKE_FAILED', { smokeResult });
  const marker = { updateId: plan.updateId, version: plan.targetVersion, releasePath: installation.releasePath, switchedAt: now };
  const switchPath = resolve(currentPath);
  mkdirSync(dirname(switchPath), { recursive: true });
  const tempPath = `${switchPath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tempPath, `${JSON.stringify(marker, null, 2)}\n`);
  renameSync(tempPath, switchPath);
  return deepFreezeUpdate({ ...marker, state: 'Switched', currentPath: switchPath, markerHash: sha256(Buffer.from(JSON.stringify(marker), 'utf8')) });
}

export function rollbackStableUpdate({ plan, snapshot, currentPath = plan?.currentSymlinkPath, previousVersion = plan?.currentVersion, now = new Date().toISOString() } = {}) {
  if (!plan) throw new StableUpdateError('Plan is required for rollback.', 'ERR_UPDATE_ROLLBACK_PLAN');
  if (!snapshot?.integrity?.verified) throw new StableUpdateError('Verified snapshot is required for rollback.', 'ERR_UPDATE_ROLLBACK_SNAPSHOT');
  const marker = { updateId: plan.updateId, version: previousVersion, rolledBackAt: now, snapshotBackupId: snapshot.backup.backupId };
  const resolvedCurrent = resolve(currentPath);
  mkdirSync(dirname(resolvedCurrent), { recursive: true });
  writeFileSync(resolvedCurrent, `${JSON.stringify(marker, null, 2)}\n`);
  if (existsSync(plan.sideBySidePath)) rmSync(plan.sideBySidePath, { recursive: true, force: true });
  return deepFreezeUpdate({ state: 'Rolled Back', currentPath: resolvedCurrent, marker });
}

export function verifyStableVersions({ installRoot, expectedVersions = [], currentPath = join(resolve(installRoot), 'current') } = {}) {
  if (!installRoot) throw new StableUpdateError('installRoot is required for version verification.', 'ERR_UPDATE_VERIFY_ROOT');
  const releaseRoot = join(resolve(installRoot), 'releases');
  const versions = expectedVersions.map((version) => {
    const path = join(releaseRoot, version);
    return { version, path, healthy: existsSync(path) };
  });
  const currentHealthy = existsSync(currentPath) && (() => {
    try { return Boolean(JSON.parse(readFileSync(currentPath, 'utf8')).version); } catch { return false; }
  })();
  const healthyCount = versions.filter((version) => version.healthy).length;
  return deepFreezeUpdate({ healthy: currentHealthy && healthyCount >= STABLE_UPDATE_MIN_HEALTHY_VERSIONS, currentHealthy, healthyCount, versions });
}

export function assertUpdateBlockedWithActiveRuns(plan) {
  if (plan?.blockedReasons?.includes('active-runs-present') !== true) throw new StableUpdateError('Update must be blocked when active runs exist.', 'ERR_UPDATE_ACTIVE_RUNS_NOT_BLOCKED', { plan });
  return true;
}

function deepFreezeUpdate(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeUpdate(child);
  return Object.freeze(value);
}
