import { strict as assert } from 'node:assert';
import { COMPATIBILITY_MANIFEST } from '../packages/contracts/src/index.js';
import {
  AdapterContractError,
  explainAdapterRecommendation,
  loadCapabilityRegistry,
  recommendAdapters
} from '../packages/adapters/src/index.js';

const registry = loadCapabilityRegistry({ compatibilityManifest: COMPATIBILITY_MANIFEST });

const planning = recommendAdapters({
  registry,
  requirements: [
    { id: 'must-edit-code', kind: 'capability', value: 'code-editing', category: 'technical', required: true },
    { id: 'must-run-tests', kind: 'capability', value: 'test-running', category: 'technical', required: true },
    { id: 'prefer-planning', kind: 'capability', value: 'planning', category: 'quality', required: true }
  ]
});
assert.deepEqual(planning.recommended.map((item) => item.adapterId), ['claude-code']);
assert.deepEqual(planning.blocked.map((item) => item.adapterId), ['codex']);
assert.equal(planning.blocked[0].failures[0].category, 'quality');
assert.equal(explainAdapterRecommendation(planning.recommended[0]).length, 3);

const qualityOverride = recommendAdapters({
  registry,
  allowQualityOverride: true,
  requirements: [
    { id: 'must-edit-code', kind: 'capability', value: 'code-editing', category: 'technical', required: true },
    { id: 'prefer-planning', kind: 'capability', value: 'planning', category: 'quality', required: true }
  ]
});
assert.deepEqual(qualityOverride.recommended.map((item) => item.adapterId), ['claude-code', 'codex']);
assert.equal(qualityOverride.recommended[1].overrideUsed, true);
assert.equal(qualityOverride.recommended[1].warnings[0].category, 'quality');

const noSafetyOverride = recommendAdapters({
  registry,
  allowQualityOverride: true,
  requirements: [
    { id: 'must-have-shell-deny', kind: 'constraint', value: 'no-shell-ever', category: 'safety', required: true }
  ]
});
assert.deepEqual(noSafetyOverride.recommended, []);
assert.deepEqual(noSafetyOverride.blocked.map((item) => item.adapterId), ['claude-code', 'codex']);
assert.equal(noSafetyOverride.blocked.every((item) => item.failures[0].category === 'safety'), true);

const unavailableRegistry = loadCapabilityRegistry({
  compatibilityManifest: COMPATIBILITY_MANIFEST,
  detectedVersions: { 'claude-code': '0.9.9', codex: '0.0.9' }
});
const unavailable = recommendAdapters({ registry: unavailableRegistry });
assert.deepEqual(unavailable.recommended, []);
assert.equal(unavailable.blocked.every((item) => item.availability === 'unavailable'), true);

assert.throws(
  () => recommendAdapters({ registry, requirements: [{ kind: 'capability', value: 'code-editing', category: 'business' }] }),
  AdapterContractError
);
assert.throws(
  () => recommendAdapters({ registry, requirements: [{ kind: 'unknown', value: 'x', category: 'technical' }] }),
  AdapterContractError
);

console.log('Recommendation engine tests OK');
