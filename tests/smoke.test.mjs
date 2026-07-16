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
import {
  RUN_STATES,
  STEP_STATES,
  StateTransitionError,
  ArtifactMismatchError,
  IdempotencyConflictError,
  AuditAppendOnlyError,
  ExpiredApprovalError,
  StaleApprovalError,
  IdempotencyReplayError,
  StaleRevisionError,
  assertFreshRevision,
  appendEventAndAudit,
  compareEventOrder,
  createApprovalRequest,
  createInMemoryEventStore,
  decideApproval,
  hashApprovalPayload,
  invalidateApprovalOnChange,
  createInMemoryIdempotencyStore,
  withIdempotency,
  executeCommandPipeline,
  sha256,
  applyRunTransition,
  applyStepTransition,
  assertRunTransition,
  isRunFinal,
  startsRetention,
  ensureApprovedDataDirectories
} from '../packages/orchestrator/src/index.js';
import { DatabaseSync } from 'node:sqlite';
import { CURRENT_SCHEMA_VERSION, MigrationError, getSchemaVersion, runMigrations, withTransaction } from '../packages/migrations/src/index.js';

assert.deepEqual(MVP_PIPELINE_TEMPLATES, ['direct', 'plan-build', 'plan-build-review']);
assert.equal(RUN_STATES.includes('Accepted'), true);
assert.equal(STEP_STATES.includes('Retrying'), true);
assert.equal(applyRunTransition('Draft', 'Start Preflight', { requiredFieldsComplete: true, projectPathExists: true }).to, 'Preflight Running');
assert.throws(
  () => applyRunTransition('Draft', 'Start Preflight', { requiredFieldsComplete: true, projectPathExists: false }),
  (error) => error instanceof StateTransitionError
    && error.code === 'ERR_INVALID_STATE_TRANSITION'
    && error.details.state === 'Draft'
);
assert.equal(assertRunTransition('Preflight Running', 'Checks passed', { preflightStatus: 'Ready with Warnings' }), 'Ready');
assert.equal(assertRunTransition('Ready', 'Present pipeline', { recommendationComplete: true, contextComplete: true, manifestComplete: true }), 'Awaiting Pipeline Approval');
assert.equal(assertRunTransition('Awaiting Pipeline Approval', 'Approve', { approvalMatchesRevision: true, warningsApproved: true }), 'Preparing Workspace');
assert.equal(assertRunTransition('Preparing Workspace', 'Worktree ready', { gitReady: true, aclReady: true, lockAcquired: true, baseCommitValid: true }), 'Running');
assert.equal(assertRunTransition('Running', 'Sensitive action requested', { validGrant: false }), 'Awaiting Approval');
assert.equal(assertRunTransition('Awaiting Approval', 'Reject essential', { actionEssential: true }), 'Needs Attention');
assert.equal(assertRunTransition('Awaiting Approval', 'Reject optional', { actionEssential: false }), 'Running');
assert.equal(assertRunTransition('Running', 'Heartbeat missing 120s', { activeAttempt: true }), 'Unresponsive');
assert.equal(assertRunTransition('Unresponsive', 'Crash/restart', { attemptUncertain: true }), 'Recovery Required');
assert.equal(assertRunTransition('Recovery Required', 'Resume approved', { checkpointValid: true, externalEffectsVerified: true }), 'Running');
assert.equal(assertRunTransition('Running', 'Pipeline success', { pipelineSuccessCriteriaMet: true }), 'Awaiting Acceptance');
assert.equal(assertRunTransition('Awaiting Acceptance', 'Accept', { diffPresented: true, testsPresented: true, reviewPresented: true }), 'Accepted');
assert.equal(isRunFinal('Accepted'), false);
assert.equal(startsRetention('Accepted'), false);
assert.equal(startsRetention('Completed'), true);
assert.throws(
  () => assertRunTransition('Accepted', 'Verify merge success', { targetContainsChange: true, noConflict: true }),
  StateTransitionError
);
assert.equal(assertRunTransition('Accepted', 'Verify merge success', { targetContainsChange: true, noConflict: true, acceptedAt: '2026-01-01T00:00:00Z', mergeVerifiedAt: '2026-01-01T00:01:00Z', targetCommit: 'abc123' }), 'Completed');
assert.equal(assertRunTransition('Running', 'Controlled Stop', { transactionOpen: false }), 'Cancelled');
assert.equal(assertRunTransition('Running', 'Service shutdown', { checkpointSaved: true, childProcessesClosed: true }), 'Recovery Required');
assert.equal(applyStepTransition('Pending', 'Prepare', { dependenciesReady: true }).to, 'Ready');
assert.equal(applyStepTransition('Ready', 'Start', { assignedAdapterReady: true }).to, 'Running');
assert.equal(applyStepTransition('Running', 'Succeeded', { exitOk: true, acceptanceChecksPassed: true }).to, 'Succeeded');
assert.throws(
  () => applyStepTransition('Ready', 'Start', { assignedAdapterReady: false }),
  StateTransitionError
);
const pipelineCalls = [];
const artifactPath = './.tmp-test-data/pipeline/artifact.txt';
const artifactContent = 'pipeline artifact content';
const pipelineResult = executeCommandPipeline({
  type: 'test.pipeline',
  validate: () => pipelineCalls.push('validation'),
  guard: () => {
    pipelineCalls.push('guard');
    return { from: 'Ready', event: 'Present pipeline', to: 'Awaiting Pipeline Approval' };
  },
  transaction: (work) => {
    pipelineCalls.push('transaction:start');
    work({
      applyState: () => pipelineCalls.push('state'),
      appendEvent: () => pipelineCalls.push('event'),
      appendAudit: () => pipelineCalls.push('audit')
    });
    pipelineCalls.push('transaction:commit');
  },
  event: { type: 'run.state.changed', runId: 'run-pipeline', payloadRedacted: {} },
  audit: { id: 'audit-pipeline', actor: 'test', action: 'transition', target: 'run-pipeline', result: 'ok', metadataRedacted: {} },
  artifact: { path: artifactPath, content: artifactContent, required: true, expectedHash: sha256(artifactContent) },
  publish: () => {
    pipelineCalls.push('publish');
    return ['sse:run.state.changed'];
  }
});
assert.deepEqual(pipelineCalls, ['validation', 'guard', 'transaction:start', 'state', 'event', 'audit', 'transaction:commit', 'publish']);
assert.equal(pipelineResult.ok, true);
assert.equal(pipelineResult.artifact.hash, sha256(artifactContent));
assert.deepEqual(pipelineResult.publications, ['sse:run.state.changed']);
const failedPipelineCalls = [];
assert.throws(
  () => executeCommandPipeline({
    type: 'test.pipeline.fail',
    validate: () => failedPipelineCalls.push('validation'),
    guard: () => {
      failedPipelineCalls.push('guard');
      throw new Error('guard failed');
    },
    transaction: () => failedPipelineCalls.push('transaction'),
    publish: () => failedPipelineCalls.push('publish')
  }),
  (error) => error.code === 'ERR_COMMAND_PIPELINE_FAILED'
);
assert.deepEqual(failedPipelineCalls, ['validation', 'guard']);
let mismatchRecorded = false;
assert.throws(
  () => executeCommandPipeline({
    type: 'test.pipeline.mismatch',
    guard: () => ({ from: 'Running', event: 'Pipeline success', to: 'Recovery Required' }),
    transaction: (work) => work({ applyState: () => {}, appendEvent: () => {}, appendAudit: () => {} }),
    artifact: { path: './.tmp-test-data/pipeline/bad-artifact.txt', content: 'bad', required: true, expectedHash: sha256('good') },
    onArtifactMismatch: () => { mismatchRecorded = true; },
    publish: () => ['should-not-publish']
  }),
  ArtifactMismatchError
);
assert.equal(mismatchRecorded, true);
const idempotencyStore = createInMemoryIdempotencyStore();
let sideEffects = 0;
const firstIdempotent = withIdempotency({
  key: 'idem-1',
  fingerprint: 'run:run-1:start',
  store: idempotencyStore,
  execute: () => {
    sideEffects += 1;
    return { state: 'Running', revision: 2 };
  }
});
const replayedIdempotent = withIdempotency({
  key: 'idem-1',
  fingerprint: 'run:run-1:start',
  store: idempotencyStore,
  execute: () => {
    sideEffects += 1;
    return { state: 'ShouldNotHappen' };
  }
});
assert.equal(firstIdempotent.replayed, false);
assert.equal(replayedIdempotent.replayed, true);
assert.equal(sideEffects, 1);
assert.deepEqual(replayedIdempotent.result, { state: 'Running', revision: 2 });
assert.throws(
  () => withIdempotency({ key: 'idem-1', fingerprint: 'different', store: idempotencyStore, execute: () => ({}) }),
  IdempotencyConflictError
);
withIdempotency({ key: 'idem-unknown', fingerprint: 'external-call', externalEffectState: 'Unknown', store: idempotencyStore, execute: () => ({ externalEffectState: 'Unknown' }) });
assert.throws(
  () => withIdempotency({ key: 'idem-unknown', fingerprint: 'external-call', store: idempotencyStore, execute: () => ({}) }),
  IdempotencyReplayError
);
assert.equal(assertFreshRevision({ aggregateId: 'run-1', expectedRevision: 2, actualRevision: 2 }), true);
assert.throws(
  () => assertFreshRevision({ aggregateId: 'run-1', expectedRevision: 1, actualRevision: 2 }),
  (error) => error instanceof StaleRevisionError
    && error.code === 'ERR_STALE_REVISION'
    && error.details.expectedRevision === 1
    && error.details.actualRevision === 2
);
const approvalPayload = { action: 'install-package', package: 'safe-tool', version: '1.2.3' };
const approvalRequest = createApprovalRequest({
  id: 'approval-1',
  kind: 'dependency',
  scope: { runId: 'run-1', stepId: 'step-1', action: 'install-package' },
  payload: approvalPayload,
  revisionHash: 'revision-1',
  actor: 'system',
  requestedAt: '2026-01-01T00:00:00.000Z'
});
assert.equal(approvalRequest.payloadHash, hashApprovalPayload({ version: '1.2.3', package: 'safe-tool', action: 'install-package' }));
assert.equal(approvalRequest.expiresAt, '2026-01-01T01:00:00.000Z');
const approvalDecision = decideApproval(approvalRequest, {
  actor: 'londi',
  decision: 'approve',
  reason: 'approved test dependency',
  payloadHash: approvalRequest.payloadHash,
  revisionHash: approvalRequest.revisionHash,
  timestamp: '2026-01-01T00:05:00.000Z'
});
assert.equal(approvalDecision.state, 'Approved');
assert.equal(approvalDecision.requestId, 'approval-1');
assert.throws(
  () => decideApproval(approvalRequest, {
    actor: 'londi',
    decision: 'approve',
    payloadHash: hashApprovalPayload({ action: 'install-package', package: 'safe-tool', version: '9.9.9' }),
    revisionHash: approvalRequest.revisionHash,
    timestamp: '2026-01-01T00:06:00.000Z'
  }),
  StaleApprovalError
);
assert.throws(
  () => decideApproval(approvalRequest, {
    actor: 'londi',
    decision: 'approve',
    payloadHash: approvalRequest.payloadHash,
    revisionHash: 'revision-2',
    timestamp: '2026-01-01T00:06:00.000Z'
  }),
  StaleApprovalError
);
assert.throws(
  () => decideApproval(approvalRequest, {
    actor: 'londi',
    decision: 'approve',
    payloadHash: approvalRequest.payloadHash,
    revisionHash: approvalRequest.revisionHash,
    timestamp: '2026-01-01T01:00:01.000Z'
  }),
  ExpiredApprovalError
);
assert.equal(invalidateApprovalOnChange(approvalRequest, { revisionHash: 'revision-2' }).state, 'Invalidated');
assert.equal(invalidateApprovalOnChange(approvalRequest, { payloadHash: approvalRequest.payloadHash, revisionHash: approvalRequest.revisionHash }), approvalRequest);
const eventStore = createInMemoryEventStore();
const firstAuditPair = appendEventAndAudit(eventStore, {
  event: { type: 'run.created', runId: 'run-event-1', severity: 'info', payloadRedacted: { state: 'Draft' }, timestamp: '2026-01-01T00:10:00.000Z' },
  audit: { id: 'audit-event-1', actor: 'londi', action: 'create-run', target: 'run-event-1', result: 'ok', metadataRedacted: { ip: 'local' }, createdAt: '2026-01-01T00:10:00.000Z' }
});
const secondAuditPair = appendEventAndAudit(eventStore, {
  event: { type: 'run.state.changed', runId: 'run-event-1', severity: 'info', payloadRedacted: { from: 'Draft', to: 'Ready' }, timestamp: '2025-12-31T23:59:00.000Z' },
  audit: { id: 'audit-event-2', actor: 'system', action: 'transition', target: 'run-event-1', result: 'ok', metadataRedacted: {}, createdAt: '2025-12-31T23:59:00.000Z' }
});
assert.equal(firstAuditPair.event.eventId, 1);
assert.equal(secondAuditPair.event.eventId, 2);
assert.equal(compareEventOrder(firstAuditPair.event, secondAuditPair.event) < 0, true);
assert.deepEqual(eventStore.listEvents({ afterEventId: 1 }).map((event) => event.eventId), [2]);
assert.equal(eventStore.listAudit({ runId: 'run-event-1' }).length, 2);
assert.equal(eventStore.exportAudit({ runId: 'run-event-1', format: 'json' }).includes('audit-event-1'), true);
const auditCsv = eventStore.exportAudit({ runId: 'run-event-1', format: 'csv' });
assert.equal(auditCsv.split('\n')[0], 'id,eventId,actor,action,target,result,runId,stepId,createdAt');
assert.equal(auditCsv.includes('audit-event-2'), true);
assert.throws(() => eventStore.deleteAudit('audit-event-1'), AuditAppendOnlyError);
assert.throws(() => eventStore.updateAudit('audit-event-1', { result: 'edited' }), AuditAppendOnlyError);
assert.throws(
  () => eventStore.appendAudit({ id: 'audit-orphan', eventId: 999, actor: 'system', action: 'orphan', target: 'run-event-1', result: 'failed' }),
  (error) => error.code === 'ERR_AUDIT_EVENT_NOT_FOUND'
);
rmSync('./.tmp-test-data', { recursive: true, force: true });
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
const preflightResponse = await fetch('http://127.0.0.1:3212/api/v1/agents', {
  method: 'OPTIONS',
  headers: {
    origin: 'http://127.0.0.1:3211',
    'access-control-request-method': 'GET',
    'access-control-request-headers': 'authorization, content-type, x-request-id'
  }
});
assert.equal(preflightResponse.status, 204);
assert.equal(preflightResponse.headers.get('access-control-allow-origin'), 'http://127.0.0.1:3211');
assert.equal(preflightResponse.headers.get('access-control-allow-headers').includes('x-request-id'), true);
const healthResponse = await fetch('http://127.0.0.1:3212/system/health', { headers: { authorization: `Bearer ${TEST_TOKEN}`, origin: 'http://127.0.0.1:3211', 'x-request-id': 'ui-smoke-health' } });
assert.equal(healthResponse.status, 200);
assert.equal(healthResponse.headers.get('x-request-id'), 'ui-smoke-health');
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
assert.deepEqual(firstMigration.applied, [1, 2]);
assert.equal(firstMigration.backupPath, null);
assert.equal(getSchemaVersion(migrationConfig.paths.database), CURRENT_SCHEMA_VERSION);
const schemaDatabase = new DatabaseSync(migrationConfig.paths.database);
const tables = schemaDatabase.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name);
for (const tableName of [
  'projects',
  'runs',
  'steps',
  'agents',
  'capability_manifests',
  'attempts',
  'approval_requests',
  'approval_decisions',
  'context_sources',
  'artifacts',
  'checkpoints',
  'events',
  'audit_entries',
  'secret_grants',
  'preflight_results',
  'dependency_approvals',
  'backup_records',
  'update_records',
  'obsidian_writebacks'
]) assert.equal(tables.includes(tableName), true, `missing table: ${tableName}`);
schemaDatabase.prepare("INSERT INTO projects (id, repository_path, default_target_branch) VALUES ('project-1', './repo', 'main')").run();
assert.throws(
  () => schemaDatabase.prepare("INSERT INTO runs (id, status, template, project_id, task, pipeline_type, state) VALUES ('run-bad-completed', 'x', 'direct', 'project-1', 'task', 'direct', 'Completed')").run(),
  /Completed run requires accepted_at/
);
schemaDatabase.prepare("INSERT INTO runs (id, status, template, project_id, task, pipeline_type, state, accepted_at, merge_verified_at, target_commit) VALUES ('run-completed', 'x', 'direct', 'project-1', 'task', 'direct', 'Completed', '2026-01-01T00:00:00Z', '2026-01-01T00:01:00Z', 'abc123')").run();
schemaDatabase.prepare("INSERT INTO steps (id, run_id, role, ordinal) VALUES ('step-1', 'run-completed', 'build', 1)").run();
schemaDatabase.prepare("INSERT INTO agents (id, adapter_type, version, health, availability) VALUES ('agent-1', 'claude-code', '1.0.0', 'healthy', 'available')").run();
schemaDatabase.prepare("INSERT INTO attempts (id, step_id, agent_id) VALUES ('attempt-1', 'step-1', 'agent-1')").run();
assert.throws(
  () => schemaDatabase.prepare("INSERT INTO attempts (id, step_id, agent_id) VALUES ('attempt-2', 'step-1', 'agent-1')").run(),
  /UNIQUE constraint failed/
);
schemaDatabase.prepare("INSERT INTO secret_grants (id, secret_alias, run_id, step_id, agent_id, status, expires_at) VALUES ('grant-1', 'OPENAI_API_KEY', 'run-completed', 'step-1', 'agent-1', 'issued', '2026-01-01T00:30:00Z')").run();
const secretColumns = schemaDatabase.prepare("PRAGMA table_info(secret_grants)").all().map((column) => column.name);
assert.equal(secretColumns.some((name) => /value|secret_value|token|password/i.test(name)), false);
const eventOne = schemaDatabase.prepare("INSERT INTO events (type, run_id, payload_redacted) VALUES ('run.created', 'run-completed', '{}') RETURNING event_id").get().event_id;
const eventTwo = schemaDatabase.prepare("INSERT INTO events (type, run_id, payload_redacted) VALUES ('run.state.changed', 'run-completed', '{}') RETURNING event_id").get().event_id;
assert.equal(eventTwo, eventOne + 1);
schemaDatabase.close();
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
