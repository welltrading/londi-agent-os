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
import { getHealthModel, createServiceLifecycle, getWindowsServiceInstallPlan } from '../apps/local-api/src/index.js';
import { getUiBootstrapModel } from '../apps/ui/src/index.js';
import { ensureApprovedDataDirectories } from '../packages/orchestrator/src/index.js';

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
const service = createServiceLifecycle({ config: serviceConfig });
assert.equal(service.getHealth().status, 'stopped');
const startedHealth = await service.start();
assert.equal(startedHealth.status, 'running');
assert.equal(startedHealth.host, '127.0.0.1');
assert.equal(startedHealth.startupDeadlineMs, 30000);
assert.equal((await service.stop('test-complete')).status, 'stopped');
rmSync('./.tmp-service-data', { recursive: true, force: true });

const servicePlan = getWindowsServiceInstallPlan(config);
assert.equal(servicePlan.serviceName, 'LondiAgentOSLocalApi');
assert.equal(servicePlan.startupType, 'automatic');
assert.equal(servicePlan.healthEndpoint, 'http://127.0.0.1:3210/system/health');
assert.equal(servicePlan.startupDeadlineMs, 30000);

console.log('Smoke tests OK');
