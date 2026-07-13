import { strict as assert } from 'node:assert';
import {
  MVP_PIPELINE_TEMPLATES,
  UnsupportedCompatibilityVersionError,
  assertSupportedCompatibilityManifest,
  loadCompatibilityManifest
} from '../packages/contracts/src/index.js';
import { getHealthModel } from '../apps/local-api/src/index.js';
import { getUiBootstrapModel } from '../apps/ui/src/index.js';

assert.deepEqual(MVP_PIPELINE_TEMPLATES, ['direct', 'plan-build', 'plan-build-review']);
assert.equal(getHealthModel().service, '@londi-agent-os/local-api');
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

console.log('Smoke tests OK');
