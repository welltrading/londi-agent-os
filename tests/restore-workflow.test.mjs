import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COMPATIBILITY_MANIFEST } from '@londi-agent-os/contracts';
import {
  RESTORE_MAX_DURATION_MS,
  RestoreWorkflowError,
  assertRestoreBlockedWithActiveRuns,
  createBackupManifest,
  createPreRestoreSnapshot,
  createRestorePlan,
  executeRestorePlan,
  selectBackupSources,
  verifyRestoredHealth,
  writeBackup
} from '../packages/orchestrator/src/index.js';

const root = mkdtempSync(join(tmpdir(), 'londi-restore-'));
try {
  execFileSync('git', ['init', '-b', 'main'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'restore@example.test'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Restore Test'], { cwd: root });
  writeFileSync(join(root, 'README.md'), '# restore fixture\n');
  execFileSync('git', ['add', 'README.md'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root, stdio: 'ignore' });
  const source = join(root, 'source');
  const target = join(root, 'target');
  const backupRoot = join(root, 'backups');
  const snapshots = join(root, 'snapshots');
  mkdirSync(join(source, 'config'), { recursive: true });
  mkdirSync(join(target, 'config'), { recursive: true });
  writeFileSync(join(source, 'londi.sqlite'), 'db-v2');
  writeFileSync(join(source, 'config', 'local.json'), '{"restored":true}\n');
  writeFileSync(join(target, 'config', 'local.json'), '{"restored":false}\n');
  const files = selectBackupSources({ sourceRoot: source, databasePath: join(source, 'londi.sqlite'), configPath: join(source, 'config', 'local.json') });
  const manifest = createBackupManifest({ backupId: 'restore-backup-1', mode: 'pre-maintenance', files, sourceRoot: source, createdAt: '2026-07-14T00:00:00.000Z' });
  const backup = writeBackup({ manifest, backupRoot });

  const preflightInput = {
    repositoryPath: root,
    targetBranch: 'main',
    runId: 'restore-run',
    adapters: [{ adapterId: 'claude-code', healthy: true }],
    runtime: { nodeOk: true, gitOk: true, osOk: true },
    aclPolicy: { allowedWriteRoots: [target], serviceAccount: 'local', rules: [] },
    disk: { freeBytes: 10 * 1024 * 1024 * 1024, repositoryBytes: 1 },
    contextSnapshot: { snapshotId: 'ctx', readOnly: true },
    lockStore: { list: () => [] },
    cache: { cachePath: join(root, 'cache'), readOnly: true }
  };

  const blocked = createRestorePlan({ backup, targetRoot: target, activeRuns: [{ runId: 'active' }], compatibilityManifest: COMPATIBILITY_MANIFEST, preflightInput });
  assert.equal(blocked.state, 'Blocked');
  assert.equal(assertRestoreBlockedWithActiveRuns(blocked), true);

  const plan = createRestorePlan({ backup, targetRoot: target, activeRuns: [], compatibilityManifest: COMPATIBILITY_MANIFEST, preflightInput });
  assert.equal(plan.state, 'Planned');
  assert.equal(plan.integrity.verified, true);
  assert.equal(plan.expectedMaxDurationMs, RESTORE_MAX_DURATION_MS);
  const snapshot = createPreRestoreSnapshot({ targetRoot: target, snapshotRoot: snapshots, now: '2026-07-14T00:01:00.000Z' });
  assert.equal(existsSync(snapshot.manifestPath), true);
  const result = executeRestorePlan({ plan, backup, snapshot, now: '2026-07-14T00:02:00.000Z' });
  assert.equal(result.state, 'Restored');
  assert.equal(result.withinSla, true);
  const health = verifyRestoredHealth({ plan, restoreResult: result, compatibilityManifest: COMPATIBILITY_MANIFEST, preflightInput });
  assert.equal(health.state, 'Verified');
  assert.equal(health.healthy, true);

  assert.throws(() => executeRestorePlan({ plan: blocked, backup, snapshot }), RestoreWorkflowError);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('Restore workflow tests OK');
