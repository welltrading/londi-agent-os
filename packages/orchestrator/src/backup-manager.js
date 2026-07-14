import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { sha256 } from './command-pipeline.js';
import { detectSecretLeak } from './redaction-quarantine.js';

export const BACKUP_MANAGER_VERSION = 1;
export const BACKUP_DAILY_RETENTION = 7;
export const BACKUP_WEEKLY_RETENTION = 4;
export const BACKUP_MODES = Object.freeze(['daily', 'pre-maintenance', 'weekly']);
export const BACKUP_ALLOWED_KINDS = Object.freeze(['database', 'config', 'manifest', 'handoff', 'review', 'summary']);
export const BACKUP_FORBIDDEN_PATTERNS = Object.freeze([
  /(^|[/\\])\.git([/\\]|$)/i,
  /(^|[/\\])node_modules([/\\]|$)/i,
  /(^|[/\\])src([/\\]|$)/i,
  /(^|[/\\])apps([/\\]|$)/i,
  /(^|[/\\])packages([/\\]|$)/i,
  /(^|[/\\])tests([/\\]|$)/i,
  /(^|[/\\])\.env(\.|$)/i,
  /secret|credential|private[-_]?key/i
]);

export class BackupManagerError extends Error {
  constructor(message = 'Backup manager failed.', code = 'ERR_BACKUP_MANAGER', details = {}) {
    super(message);
    this.name = 'BackupManagerError';
    this.code = code;
    this.details = details;
  }
}

export function createBackupManifest({
  backupId,
  mode = 'daily',
  files = [],
  createdAt = new Date().toISOString(),
  sourceRoot = process.cwd()
} = {}) {
  if (!backupId) throw new BackupManagerError('backupId is required.', 'ERR_BACKUP_ID');
  if (!BACKUP_MODES.includes(mode)) throw new BackupManagerError('Unsupported backup mode.', 'ERR_BACKUP_MODE', { mode });
  if (!Array.isArray(files) || files.length === 0) throw new BackupManagerError('Backup files must be a non-empty array.', 'ERR_BACKUP_FILES');
  const root = resolve(sourceRoot);
  const normalizedFiles = files.map((file) => normalizeBackupFile(file, root));
  const manifestCore = {
    version: BACKUP_MANAGER_VERSION,
    backupId,
    mode,
    createdAt,
    sourceRoot: root,
    files: normalizedFiles,
    excludesSecrets: true,
    excludesCode: true,
    retention: { daily: BACKUP_DAILY_RETENTION, weekly: BACKUP_WEEKLY_RETENTION }
  };
  return deepFreezeBackup({ ...manifestCore, manifestHash: sha256(Buffer.from(JSON.stringify(manifestCore), 'utf8')) });
}

export function writeBackup({ manifest, backupRoot } = {}) {
  assertBackupManifest(manifest);
  if (!backupRoot) throw new BackupManagerError('backupRoot is required.', 'ERR_BACKUP_ROOT');
  const root = resolve(backupRoot);
  const backupPath = join(root, manifest.mode, manifest.backupId);
  mkdirSync(backupPath, { recursive: true });
  const copied = [];
  for (const file of manifest.files) {
    const target = join(backupPath, file.relativePath);
    mkdirSync(dirname(target), { recursive: true });
    const content = readFileSync(file.path);
    if (sha256(content) !== file.hash) throw new BackupManagerError('Source file hash changed before backup write.', 'ERR_BACKUP_SOURCE_DRIFT', { path: file.path });
    writeFileSync(target, content);
    copied.push({ ...file, backupPath: target });
  }
  const manifestPath = join(backupPath, 'backup-manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, files: copied }, null, 2)}\n`);
  return deepFreezeBackup({ backupId: manifest.backupId, mode: manifest.mode, backupPath, manifestPath, files: copied, manifestHash: manifest.manifestHash });
}

export function verifyBackupIntegrity({ backup } = {}) {
  if (!backup?.manifestPath || !existsSync(backup.manifestPath)) throw new BackupManagerError('Backup manifest is missing.', 'ERR_BACKUP_MANIFEST_MISSING', { backup });
  const parsed = JSON.parse(readFileSync(backup.manifestPath, 'utf8'));
  const failures = [];
  for (const file of parsed.files ?? []) {
    if (!file.backupPath || !existsSync(file.backupPath)) {
      failures.push({ path: file.backupPath ?? file.relativePath, reason: 'missing' });
      continue;
    }
    const actualHash = sha256(readFileSync(file.backupPath));
    if (actualHash !== file.hash) failures.push({ path: file.backupPath, reason: 'hash-mismatch', expected: file.hash, actual: actualHash });
  }
  return deepFreezeBackup({ backupId: parsed.backupId, verified: failures.length === 0, fileCount: parsed.files?.length ?? 0, failures });
}

export function selectBackupSources({ databasePath, configPath, artifactRecords = [], extraFiles = [], sourceRoot = process.cwd() } = {}) {
  const candidates = [];
  if (databasePath) candidates.push({ kind: 'database', path: databasePath });
  if (configPath) candidates.push({ kind: 'config', path: configPath });
  for (const record of artifactRecords) {
    const kind = artifactKindToBackupKind(record);
    if (kind) candidates.push({ kind, path: record.path });
  }
  for (const file of extraFiles) candidates.push(file);
  return deepFreezeBackup(candidates.map((candidate) => normalizeBackupFile(candidate, resolve(sourceRoot))));
}

export function createBackupRetentionPlan({ backups = [], now = new Date().toISOString(), dailyKeep = BACKUP_DAILY_RETENTION, weeklyKeep = BACKUP_WEEKLY_RETENTION } = {}) {
  if (!Array.isArray(backups)) throw new BackupManagerError('backups must be an array.', 'ERR_BACKUP_RETENTION_INPUT');
  const sorted = [...backups].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const daily = sorted.filter((backup) => backup.mode === 'daily');
  const weekly = sorted.filter((backup) => backup.mode === 'weekly');
  const preMaintenance = sorted.filter((backup) => backup.mode === 'pre-maintenance');
  const keep = new Set([
    ...daily.slice(0, dailyKeep).map((backup) => backup.backupId),
    ...weekly.slice(0, weeklyKeep).map((backup) => backup.backupId),
    ...preMaintenance.slice(0, dailyKeep).map((backup) => backup.backupId)
  ]);
  return deepFreezeBackup({
    generatedAt: now,
    keep: sorted.filter((backup) => keep.has(backup.backupId)),
    delete: sorted.filter((backup) => !keep.has(backup.backupId)),
    policy: { dailyKeep, weeklyKeep, preMaintenanceKeep: dailyKeep }
  });
}

export function assertBackupExcludesSecretsAndCode(files = []) {
  for (const file of files) normalizeBackupFile(file, process.cwd());
  return true;
}

function normalizeBackupFile(file, sourceRoot) {
  if (!file || typeof file !== 'object') throw new BackupManagerError('Backup file must be an object.', 'ERR_BACKUP_FILE');
  if (!BACKUP_ALLOWED_KINDS.includes(file.kind)) throw new BackupManagerError('Unsupported backup file kind.', 'ERR_BACKUP_KIND', { kind: file.kind });
  if (!file.path) throw new BackupManagerError('Backup file path is required.', 'ERR_BACKUP_FILE_PATH');
  const path = resolve(file.path);
  const rel = safeRelative(sourceRoot, path);
  if (!existsSync(path) || !statSync(path).isFile()) throw new BackupManagerError('Backup source file is missing.', 'ERR_BACKUP_SOURCE_MISSING', { path });
  assertNotForbiddenPath(rel);
  const content = readFileSync(path);
  const text = content.toString('utf8');
  const leak = detectSecretLeak(text);
  if (leak.leaked) throw new BackupManagerError('Backup source contains secret-like material.', 'ERR_BACKUP_SECRET', { path, kind: file.kind });
  return deepFreezeBackup({ kind: file.kind, path, relativePath: file.relativePath ?? (rel || basename(path)), hash: sha256(content), size: content.length });
}

function artifactKindToBackupKind(record) {
  const kind = record?.metadata?.kind;
  if (kind === 'artifact-manifest' || record?.filename === 'manifest.json') return 'manifest';
  if (kind === 'handoff' || record?.category === 'handoff') return 'handoff';
  if (kind === 'review' || record?.category === 'review') return 'review';
  if (record?.category === 'summary') return 'summary';
  return null;
}

function safeRelative(sourceRoot, path) {
  const rel = relative(sourceRoot, path).replaceAll('\\', '/');
  return rel.startsWith('../') ? basename(path) : rel;
}

function assertNotForbiddenPath(relativePath) {
  for (const pattern of BACKUP_FORBIDDEN_PATTERNS) {
    if (pattern.test(relativePath)) throw new BackupManagerError('Backup excludes code, secrets and dependency directories.', 'ERR_BACKUP_FORBIDDEN_PATH', { relativePath, pattern: pattern.source });
  }
}

function assertBackupManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || manifest.version !== BACKUP_MANAGER_VERSION || !manifest.backupId || !Array.isArray(manifest.files)) {
    throw new BackupManagerError('Invalid backup manifest.', 'ERR_BACKUP_MANIFEST');
  }
  return true;
}

export function listBackupDirectories({ backupRoot } = {}) {
  if (!backupRoot || !existsSync(backupRoot)) return [];
  const root = resolve(backupRoot);
  const result = [];
  for (const mode of BACKUP_MODES) {
    const modePath = join(root, mode);
    if (!existsSync(modePath)) continue;
    for (const name of readdirSync(modePath)) result.push({ backupId: name, mode, path: join(modePath, name) });
  }
  return deepFreezeBackup(result);
}

function deepFreezeBackup(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeBackup(child);
  return Object.freeze(value);
}
