import { rmSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import {
  MVP_PIPELINE_TEMPLATES,
  UnsupportedCompatibilityVersionError,
  assertSupportedCompatibilityManifest,
  loadCompatibilityManifest,
  LocalConfigValidationError,
  loadDefaultLocalConfig,
  validateLocalConfig
} from '../packages/contracts/src/index.js';
import { getHealthModel, createServiceLifecycle, getWindowsServiceInstallPlan, createCredentialManagerTokenProvider, createLogger, sanitizeForLog } from '../apps/local-api/src/index.js';
import { getUiBootstrapModel } from '../apps/ui/src/index.js';
import { ensureApprovedDataDirectories } from '../packages/orchestrator/src/index.js';
import { DatabaseSync } from 'node:sqlite';
import { CURRENT_SCHEMA_VERSION, MigrationError, getSchemaVersion, runMigrations, withTransaction } from '../packages/migrations/src/index.js';

assert.deepEqual(MVP_PIPELINE_TEMPLATES, ['direct', 'plan-build', 'plan-build-review']);
assert.equal(getHealthModel().packageName, '@londi-agent-os/local-api');
assert.equal(getHealthModel().service, 'LondiAgentOSLocalApi');
assert.equal(getUiBootstrapModel().packageName, '@londi-agent-os/ui');

const manifest = loadCompatibilityManifest();
assert.equal(manifest.runtime.operatingSystems[0].id, 'windows-11');
assert.equal(manifest.runtime.node.channel, 'LTS');
assert.equal(manifest.agents.claudeCode.id, 'claude-code');
assert.equal(manifest.agents.codex.id, 'codex');
assert.deepEqual(manifest.unsupportedAgents, ['agent-zero', 'hermes']);
assert.equal(assertSupportedCompatibilityManifest(manifest), true);
assert.throws(
  () => assertSupportedCompatibilityManifest({ ...manifest, manifestVersion: 999 }),
  (error) => error instanceof UnsupportedCompatibilityVersionError
    && error.code === 'ERR_UNSUPPORTED_COMPATIBILITY_VERSION'
    && error.details.expected === 1
    && error.details.actual === 999
);

const config = loadDefaultLocalConfig();
assert.equal(validateLocalConfig(config), true);
assert.equal(config.paths.runs, './data/runs');
assert.equal(config.ports.localApi, 3210);
assert.equal(config.retention.completedRunDays, 7);
assert.deepEqual(config.obsidian.roots, []);
assert.throws(
  () => validateLocalConfig({ ...config, paths: { ...config.paths, runs: '../outside' } }),
  (error) => error instanceof LocalConfigValidationError
    && error.code === 'ERR_INVALID_LOCAL_CONFIG'
);
assert.throws(
  () => validateLocalConfig({ ...config, apiToken: 'not-allowed' }),
  (error) => error instanceof LocalConfigValidationError
    && error.details.key === 'apiToken'
);
assert.throws(
  () => validateLocalConfig({ ...config, ports: { ...config.ports, localApi: 80 } }),
  LocalConfigValidationError
);

const tempDataRoot = './.tmp-test-data';
const testConfig = {
  ...config,
  dataRoot: tempDataRoot,
  paths: {
    database: `${tempDataRoot}/db/londi-agent-os.sqlite`,
    runs: `${tempDataRoot}/runs`,
    worktrees: `${tempDataRoot}/worktrees`,
    backups: `${tempDataRoot}/backups`,
    obsidianSnapshots: `${tempDataRoot}/obsidian-snapshots`
  }
};
const createdDirectories = ensureApprovedDataDirectories(testConfig);
assert.deepEqual(createdDirectories, [
  './.tmp-test-data',
  './.tmp-test-data/backups',
  './.tmp-test-data/db',
  './.tmp-test-data/obsidian-snapshots',
  './.tmp-test-data/runs',
  './.tmp-test-data/worktrees'
]);
rmSync(tempDataRoot, { recursive: true, force: true });

const TEST_TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_';
const serviceConfig = {
  ...config,
  dataRoot: './.tmp-service-data',
  paths: {
    database: './.tmp-service-data/db/londi-agent-os.sqlite',
    runs: './.tmp-service-data/runs',
    worktrees: './.tmp-service-data/worktrees',
    backups: './.tmp-service-data/backups',
    obsidianSnapshots: './.tmp-service-data/obsidian-snapshots'
  },
  ports: { ...config.ports, localApi: 3212 }
};
const logSink = [];
const logger = createLogger({ sink: logSink, knownSecrets: [TEST_TOKEN, 'plain-password-value'] });
const service = createServiceLifecycle({
  config: serviceConfig,
  security: { tokenProvider: createCredentialManagerTokenProvider(TEST_TOKEN) },
  logger,
  knownSecrets: [TEST_TOKEN]
});
assert.equal(service.getHealth().status, 'stopped');
const startedHealth = await service.start();
assert.equal(startedHealth.status, 'running');
assert.equal(startedHealth.host, '127.0.0.1');
assert.equal(startedHealth.startupDeadlineMs, 30000);
assert.equal(startedHealth.security.allowedOrigin, 'http://127.0.0.1:3211');
assert.equal(startedHealth.security.credentialSource, 'windows-credential-manager');
assert.equal(startedHealth.security.tokenBytes, 32);
const healthResponse = await fetch('http://127.0.0.1:3212/system/health', { headers: { authorization: `Bearer ${TEST_TOKEN}`, origin: 'http://127.0.0.1:3211' } });
assert.equal(healthResponse.status, 200);
assert.match(healthResponse.headers.get('x-request-id'), /^req_/);
const healthText = await healthResponse.text();
assert.equal(healthText.includes(TEST_TOKEN), false);
const missingTokenResponse = await fetch('http://127.0.0.1:3212/system/health', { headers: { origin: 'http://127.0.0.1:3211' } });
assert.equal(missingTokenResponse.status, 401);
const wrongOriginResponse = await fetch('http://127.0.0.1:3212/system/health', { headers: { authorization: `Bearer ${TEST_TOKEN}`, origin: 'http://evil.example' } });
assert.equal(wrongOriginResponse.status, 403);
const queryTokenResponse = await fetch(`http://127.0.0.1:3212/system/health?token=${TEST_TOKEN}`, { headers: { authorization: `Bearer ${TEST_TOKEN}`, origin: 'http://127.0.0.1:3211' } });
assert.equal(queryTokenResponse.status, 400);
assert.equal((await service.stop('test-complete')).status, 'stopped');
rmSync('./.tmp-service-data', { recursive: true, force: true });

const migrationDataRoot = './.tmp-migration-data';
const migrationConfig = {
  ...config,
  dataRoot: migrationDataRoot,
  paths: {
    database: `${migrationDataRoot}/db/londi-agent-os.sqlite`,
    runs: `${migrationDataRoot}/runs`,
    worktrees: `${migrationDataRoot}/worktrees`,
    backups: `${migrationDataRoot}/backups`,
    obsidianSnapshots: `${migrationDataRoot}/obsidian-snapshots`
  }
};
const firstMigration = runMigrations({ config: migrationConfig });
assert.equal(firstMigration.schemaVersion, CURRENT_SCHEMA_VERSION);
assert.deepEqual(firstMigration.applied, [1]);
assert.equal(firstMigration.backupPath, null);
assert.equal(getSchemaVersion(migrationConfig.paths.database), CURRENT_SCHEMA_VERSION);
const secondMigration = runMigrations({ config: migrationConfig });
assert.deepEqual(secondMigration.applied, []);
assert.equal(typeof secondMigration.backupPath, 'string');
const rollbackPath = `${migrationDataRoot}/db/rollback.sqlite`;
assert.throws(
  () => runMigrations({
    config: { ...migrationConfig, paths: { ...migrationConfig.paths, database: rollbackPath } },
    migrations: [{ version: 1, name: 'broken', statements: ['CREATE TABLE will_rollback (id TEXT PRIMARY KEY)', 'INSERT INTO missing_table VALUES (1)'] }]
  }),
  (error) => error instanceof MigrationError
    && error.code === 'ERR_MIGRATION_FAILED'
);
const rollbackDatabase = new DatabaseSync(rollbackPath);
assert.equal(rollbackDatabase.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'will_rollback'").get(), undefined);
withTransaction(rollbackDatabase, (database) => {
  database.exec('CREATE TABLE tx_check (id TEXT PRIMARY KEY)');
});
assert.equal(rollbackDatabase.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tx_check'").get().name, 'tx_check');
rollbackDatabase.close();
rmSync(migrationDataRoot, { recursive: true, force: true });

const servicePlan = getWindowsServiceInstallPlan(config);
assert.equal(servicePlan.serviceName, 'LondiAgentOSLocalApi');
assert.equal(servicePlan.startupType, 'automatic');
assert.equal(servicePlan.healthEndpoint, 'http://127.0.0.1:3210/system/health');
assert.equal(servicePlan.startupDeadlineMs, 30000);

const injectedLog = logger.security('security.test\nforged-line', {
  authorization: `Bearer ${TEST_TOKEN}`,
  password: 'plain-password-value',
  message: 'hello\r\nworld'
}, { requestId: 'req_test' });
const serializedLogs = JSON.stringify(logSink);
assert.equal(serializedLogs.includes(TEST_TOKEN), false);
assert.equal(serializedLogs.includes('plain-password-value'), false);
assert.equal(serializedLogs.includes('\nforged-line'), false);
assert.equal(injectedLog.severity, 'security');
assert.equal(injectedLog.requestId, 'req_test');
assert.equal(sanitizeForLog(`token=${TEST_TOKEN}`, [TEST_TOKEN]), 'token=[REDACTED]');

console.log('Smoke tests OK');
