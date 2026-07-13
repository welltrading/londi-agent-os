import { strict as assert } from 'node:assert';
import { MVP_PIPELINE_TEMPLATES } from '../packages/contracts/src/index.js';
import { getHealthModel } from '../apps/local-api/src/index.js';
import { getUiBootstrapModel } from '../apps/ui/src/index.js';

assert.deepEqual(MVP_PIPELINE_TEMPLATES, ['direct', 'plan-build', 'plan-build-review']);
assert.equal(getHealthModel().service, '@londi-agent-os/local-api');
assert.equal(getUiBootstrapModel().packageName, '@londi-agent-os/ui');
console.log('Smoke tests OK');
