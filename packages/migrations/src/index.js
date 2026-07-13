import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadDefaultLocalConfig, validateLocalConfig } from '@londi-agent-os/contracts';

export const MIGRATIONS_PACKAGE = '@londi-agent-os/migrations';
export const INITIAL_SCHEMA_VERSION = 0;
export const CURRENT_SCHEMA_VERSION = 1;

export const MIGRATIONS = Object.freeze([
  Object.freeze({
    version: 1,
    name: 'initial-foundation-schema',
    statements: Object.freeze([
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        template TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    ])
  })
]);

export class MigrationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'MigrationError';
    this.code = 'ERR_MIGRATION_FAILED';
    this.details = details;
  }
}

export function resolveDatabasePath(config = loadDefaultLocalConfig()) {
  validateLocalConfig(config);
  return config.paths.database;
}

export function createMigrationBackup(databasePath, backupRoot) {
  if (!existsSync(databasePath)) return null;
  mkdirSync(backupRoot, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const backupPath = join(backupRoot, `pre-migration-${stamp}.sqlite`);
  copyFileSync(databasePath, backupPath);
  return backupPath;
}

export function runMigrations(options = {}) {
  const config = options.config ?? loadDefaultLocalConfig();
  const databasePath = options.databasePath ?? resolveDatabasePath(config);
  const backupRoot = options.backupRoot ?? config.paths.backups;
  const migrations = options.migrations ?? MIGRATIONS;

  validateLocalConfig(config);
  mkdirSync(dirname(databasePath), { recursive: true });
  const backupPath = createMigrationBackup(databasePath, backupRoot);
  const database = new DatabaseSync(databasePath);

  try {
    database.exec('PRAGMA foreign_keys = ON');
    database.exec('BEGIN IMMEDIATE TRANSACTION');
    database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    const applied = new Set(database.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version));
    const appliedNow = [];

    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      for (const statement of migration.statements) database.exec(statement);
      database.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name);
      appliedNow.push(migration.version);
    }

    database.exec('COMMIT');
    const schemaVersion = getSchemaVersion(database);
    database.close();
    return { databasePath, backupPath, schemaVersion, applied: appliedNow };
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch {}
    database.close();
    throw new MigrationError('SQLite migration failed and was rolled back.', {
      databasePath,
      backupPath,
      cause: error.message
    });
  }
}

export function getSchemaVersion(databaseOrPath) {
  const ownsDatabase = typeof databaseOrPath === 'string';
  const database = ownsDatabase ? new DatabaseSync(databaseOrPath) : databaseOrPath;
  try {
    const tableExists = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
    if (!tableExists) return INITIAL_SCHEMA_VERSION;
    const row = database.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get();
    return row.version;
  } finally {
    if (ownsDatabase) database.close();
  }
}

export function withTransaction(database, work) {
  database.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    const result = work(database);
    database.exec('COMMIT');
    return result;
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

if (process.argv.includes('--build-check')) console.log(`${MIGRATIONS_PACKAGE} build OK`);
