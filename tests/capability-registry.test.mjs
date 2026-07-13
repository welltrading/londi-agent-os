import { strict as assert } from 'node:assert';
import { COMPATIBILITY_MANIFEST } from '../packages/contracts/src/index.js';
import {
  APPROVED_ADAPTER_IDS,
  AdapterContractError,
  assertApprovedRegistry,
  getCapabilityRegistryEntry,
  listAvailableAdapters,
  loadCapabilityRegistry
} from '../packages/adapters/src/index.js';

assert.deepEqual(APPROVED_ADAPTER_IDS, ['claude-code', 'codex']);

const registry = loadCapabilityRegistry({ compatibilityManifest: COMPATIBILITY_MANIFEST });
assertApprovedRegistry(registry);
assert.deepEqual(Object.keys(registry.adapters), APPROVED_ADAPTER_IDS);
assert.equal(registry.adapters['claude-code'].availability, 'available');
assert.equal(registry.adapters.codex.availability, 'available');
assert.equal(registry.adapters['claude-code'].compatibility.supportedRange, '>=1.0.0');
assert.equal(registry.adapters.codex.compatibility.supportedRange, '>=0.1.0');
assert.equal(registry.adapters['claude-code'].priority > registry.adapters.codex.priority, true);
assert.equal(registry.adapters['claude-code'].capabilities.includes('planning'), true);
assert.equal(registry.adapters.codex.capabilities.includes('debugging'), true);

const unavailable = loadCapabilityRegistry({
  compatibilityManifest: COMPATIBILITY_MANIFEST,
  detectedVersions: { 'claude-code': '0.9.9', codex: '0.0.9' }
});
assert.equal(unavailable.adapters['claude-code'].availability, 'unavailable');
assert.equal(unavailable.adapters['claude-code'].availabilityReason, 'version-incompatible');
assert.equal(unavailable.adapters.codex.availability, 'unavailable');
assert.deepEqual(listAvailableAdapters(unavailable), []);

const mixed = loadCapabilityRegistry({
  compatibilityManifest: COMPATIBILITY_MANIFEST,
  detectedVersions: { 'claude-code': '1.2.0', codex: '0.0.9' },
  health: { 'claude-code': { status: 'healthy', checkedAt: '2026-07-13T20:00:00.000Z' } }
});
assert.deepEqual(listAvailableAdapters(mixed).map((entry) => entry.adapterId), ['claude-code']);
assert.equal(getCapabilityRegistryEntry(mixed, 'claude-code').health.status, 'healthy');
assert.throws(() => getCapabilityRegistryEntry(mixed, 'agent-zero'), AdapterContractError);
assert.throws(() => assertApprovedRegistry({ registryVersion: 1, adapters: { 'claude-code': {}, codex: {}, hermes: {} } }), AdapterContractError);
assert.throws(() => assertApprovedRegistry({ registryVersion: 1, adapters: { 'claude-code': {} } }), AdapterContractError);

console.log('Capability registry tests OK');
