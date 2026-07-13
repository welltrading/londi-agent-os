import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadDefaultLocalConfig, validateLocalConfig } from '@londi-agent-os/contracts';

export const MIGRATIONS_PACKAGE = '@londi-agent-os/migrations';
export const INITIAL_SCHEMA_VERSION = 0;
export const CURRENT_SCHEMA_VERSION = 2;

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
  }),
  Object.freeze({
    version: 2,
    name: 'domain-model-foundation',
    statements: Object.freeze([
      `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        repository_path TEXT NOT NULL,
        default_target_branch TEXT NOT NULL,
        vault_scope_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        revision INTEGER NOT NULL DEFAULT 1
      )`,
      `ALTER TABLE runs ADD COLUMN project_id TEXT REFERENCES projects(id)`,
      `ALTER TABLE runs ADD COLUMN task TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE runs ADD COLUMN pipeline_type TEXT NOT NULL DEFAULT 'direct'`,
      `ALTER TABLE runs ADD COLUMN state TEXT NOT NULL DEFAULT 'Draft'`,
      `ALTER TABLE runs ADD COLUMN base_commit TEXT`,
      `ALTER TABLE runs ADD COLUMN target_branch TEXT`,
      `ALTER TABLE runs ADD COLUMN branch_name TEXT`,
      `ALTER TABLE runs ADD COLUMN worktree_path TEXT`,
      `ALTER TABLE runs ADD COLUMN retention_class TEXT NOT NULL DEFAULT 'active'`,
      `ALTER TABLE runs ADD COLUMN keep INTEGER NOT NULL DEFAULT 0 CHECK (keep IN (0, 1))`,
      `ALTER TABLE runs ADD COLUMN accepted_at TEXT`,
      `ALTER TABLE runs ADD COLUMN merge_verified_at TEXT`,
      `ALTER TABLE runs ADD COLUMN target_commit TEXT`,
      `ALTER TABLE runs ADD COLUMN completed_at TEXT`,
      `ALTER TABLE runs ADD COLUMN revision INTEGER NOT NULL DEFAULT 1`,
      `CREATE TRIGGER IF NOT EXISTS runs_completed_insert_guard
        BEFORE INSERT ON runs
        WHEN NEW.state = 'Completed' AND (NEW.accepted_at IS NULL OR NEW.merge_verified_at IS NULL OR NEW.target_commit IS NULL)
        BEGIN
          SELECT RAISE(ABORT, 'Completed run requires accepted_at, merge_verified_at and target_commit');
        END`,
      `CREATE TRIGGER IF NOT EXISTS runs_completed_update_guard
        BEFORE UPDATE ON runs
        WHEN NEW.state = 'Completed' AND (NEW.accepted_at IS NULL OR NEW.merge_verified_at IS NULL OR NEW.target_commit IS NULL)
        BEGIN
          SELECT RAISE(ABORT, 'Completed run requires accepted_at, merge_verified_at and target_commit');
        END`,
      `CREATE TABLE IF NOT EXISTS steps (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        assigned_adapter TEXT,
        state TEXT NOT NULL DEFAULT 'Pending',
        timeout_ms INTEGER,
        retry_count INTEGER NOT NULL DEFAULT 0,
        correction_cycle INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(run_id, ordinal)
      )`,
      `CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        adapter_type TEXT NOT NULL CHECK (adapter_type IN ('claude-code', 'codex')),
        version TEXT NOT NULL,
        health TEXT NOT NULL,
        availability TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS capability_manifests (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        agent_version TEXT NOT NULL,
        capabilities_json TEXT NOT NULL,
        constraints_json TEXT NOT NULL,
        required_tools_json TEXT NOT NULL,
        context_limit INTEGER NOT NULL,
        permissions_json TEXT NOT NULL,
        health TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS attempts (
        id TEXT PRIMARY KEY,
        step_id TEXT NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
        agent_id TEXT REFERENCES agents(id),
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT,
        exit_classification TEXT,
        checkpoint_id TEXT,
        heartbeat_at TEXT,
        external_effect_state TEXT NOT NULL DEFAULT 'none',
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS one_active_attempt_per_step ON attempts(step_id) WHERE active = 1`,
      `CREATE TABLE IF NOT EXISTS approval_requests (
        id TEXT PRIMARY KEY,
        run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
        step_id TEXT REFERENCES steps(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        scope TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        revision_hash TEXT NOT NULL,
        expires_at TEXT,
        state TEXT NOT NULL DEFAULT 'Pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS approval_decisions (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
        actor TEXT NOT NULL,
        decision TEXT NOT NULL,
        reason TEXT,
        revision_hash TEXT NOT NULL,
        decided_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS context_sources (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        title TEXT NOT NULL,
        reason TEXT NOT NULL,
        hash TEXT NOT NULL,
        approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0, 1))
      )`,
      `CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        attempt_id TEXT REFERENCES attempts(id),
        type TEXT NOT NULL,
        path TEXT NOT NULL,
        hash TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        path TEXT NOT NULL,
        hash TEXT NOT NULL,
        resumability TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(attempt_id, sequence)
      )`,
      `CREATE TABLE IF NOT EXISTS events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
        step_id TEXT REFERENCES steps(id) ON DELETE CASCADE,
        severity TEXT NOT NULL DEFAULT 'info',
        payload_redacted TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS audit_entries (
        id TEXT PRIMARY KEY,
        event_id INTEGER NOT NULL REFERENCES events(event_id),
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT NOT NULL,
        result TEXT NOT NULL,
        metadata_redacted TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS secret_grants (
        id TEXT PRIMARY KEY,
        secret_alias TEXT NOT NULL,
        run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
        step_id TEXT REFERENCES steps(id) ON DELETE CASCADE,
        agent_id TEXT REFERENCES agents(id),
        status TEXT NOT NULL,
        issued_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS preflight_results (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('Ready', 'Ready with Warnings', 'Blocked')),
        checks_json TEXT NOT NULL,
        evidence_redacted TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS dependency_approvals (
        id TEXT PRIMARY KEY,
        package_or_tool TEXT NOT NULL,
        version TEXT NOT NULL,
        source TEXT NOT NULL,
        checksum TEXT NOT NULL,
        decision TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS backup_records (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        kind TEXT NOT NULL,
        hash TEXT NOT NULL,
        integrity_status TEXT NOT NULL,
        version TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS update_records (
        id TEXT PRIMARY KEY,
        from_version TEXT NOT NULL,
        to_version TEXT NOT NULL,
        snapshot TEXT NOT NULL,
        tests_json TEXT NOT NULL,
        result TEXT NOT NULL,
        rollback TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS obsidian_writebacks (
        id TEXT PRIMARY KEY,
        run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
        draft_path TEXT NOT NULL,
        destination_path TEXT NOT NULL,
        approved_hash TEXT NOT NULL,
        result TEXT NOT NULL,
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
