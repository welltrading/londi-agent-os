import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BACKUP_DAILY_RETENTION,
  BACKUP_WEEKLY_RETENTION,
  BackupManagerError,
  assertBackupExcludesSecretsAndCode,
  createBackupManifest,
  createBackupRetentionPlan,
  listBackupDirectories,
  selectBackupSources,
  verifyBackupIntegrity,
  writeBackup
} from '../packages/orchestrator/src/index.js';

const root = mkdtempSync(join(tmpdir(), 'londi-backup-'));
try {
  const source = join(root, 'source');
  const backups = join(root, 'backups');
  mkdirSync(join(source, 'data', 'runs', 'run-1', 'handoff'), { recursive: true });
  mkdirSync(join(source, 'data', 'runs', 'run-1', 'review'), { recursive: true });
  mkdirSync(join(source, 'data', 'runs', 'run-1', 'summary'), { recursive: true });
  mkdirSync(join(source, 'config'), { recursive: true });
  writeFileSync(join(source, 'londi.sqlite'), 'sqlite-db');
  writeFileSync(join(source, 'config', 'local.json'), '{"port":43110}\n');
  writeFileSync(join(source, 'data', 'runs', 'run-1', 'handoff', 'handoff.md'), '# Handoff\nSafe content\n');
  writeFileSync(join(source, 'data', 'runs', 'run-1', 'review', 'review.md'), '# Review\nSafe content\n');
  writeFileSync(join(source, 'data', 'runs', 'run-1', 'summary', 'manifest.json'), '{"records":[]}\n');
  writeFileSync(join(source, 'data', 'runs', 'run-1', 'summary', 'summary.md'), '# Summary\nSafe content\n');

  const sources = selectBackupSources({
    sourceRoot: source,
    databasePath: join(source, 'londi.sqlite'),
    configPath: join(source, 'config', 'local.json'),
    artifactRecords: [
      { path: join(source, 'data', 'runs', 'run-1', 'handoff', 'handoff.md'), category: 'handoff', metadata: { kind: 'handoff' } },
      { path: join(source, 'data', 'runs', 'run-1', 'review', 'review.md'), category: 'review', metadata: { kind: 'review' } },
      { path: join(source, 'data', 'runs', 'run-1', 'summary', 'manifest.json'), category: 'summary', filename: 'manifest.json', metadata: { kind: 'artifact-manifest' } },
      { path: join(source, 'data', 'runs', 'run-1', 'summary', 'summary.md'), category: 'summary', metadata: { kind: 'summary' } }
    ]
  });
  assert.deepEqual(sources.map((file) => file.kind).sort(), ['config', 'database', 'handoff', 'manifest', 'review', 'summary']);
  assert.equal(assertBackupExcludesSecretsAndCode(sources), true);

  const manifest = createBackupManifest({ backupId: 'backup-1', mode: 'daily', files: sources, sourceRoot: source, createdAt: '2026-07-14T00:00:00.000Z' });
  assert.equal(manifest.excludesSecrets, true);
  assert.equal(manifest.excludesCode, true);
  assert.equal(manifest.retention.daily, BACKUP_DAILY_RETENTION);
  assert.equal(manifest.retention.weekly, BACKUP_WEEKLY_RETENTION);
  const written = writeBackup({ manifest, backupRoot: backups });
  const verified = verifyBackupIntegrity({ backup: written });
  assert.equal(verified.verified, true);
  assert.equal(verified.fileCount, 6);
  assert.equal(listBackupDirectories({ backupRoot: backups }).length, 1);

  writeFileSync(written.files[0].backupPath, 'tampered');
  assert.equal(verifyBackupIntegrity({ backup: written }).verified, false);

  writeFileSync(join(source, '.env.local'), 'OPENAI_API_KEY=sk-test-secret-value\n');
  assert.throws(() => selectBackupSources({ sourceRoot: source, extraFiles: [{ kind: 'config', path: join(source, '.env.local') }] }), BackupManagerError);
  mkdirSync(join(source, 'packages', 'x'), { recursive: true });
  writeFileSync(join(source, 'packages', 'x', 'index.js'), 'console.log(1)\n');
  assert.throws(() => selectBackupSources({ sourceRoot: source, extraFiles: [{ kind: 'summary', path: join(source, 'packages', 'x', 'index.js') }] }), BackupManagerError);

  const retention = createBackupRetentionPlan({ backups: Array.from({ length: 10 }, (_, index) => ({ backupId: `daily-${index}`, mode: 'daily', createdAt: `2026-07-${String(14 - index).padStart(2, '0')}T00:00:00.000Z` })) });
  assert.equal(retention.keep.length, 7);
  assert.equal(retention.delete.length, 3);
  const weeklyRetention = createBackupRetentionPlan({ backups: Array.from({ length: 6 }, (_, index) => ({ backupId: `weekly-${index}`, mode: 'weekly', createdAt: `2026-0${6 - index}-01T00:00:00.000Z` })) });
  assert.equal(weeklyRetention.keep.length, 4);
  assert.equal(weeklyRetention.delete.length, 2);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('Backup manager tests OK');
