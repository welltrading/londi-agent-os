import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  TOOL_CATALOG_SCHEMA_VERSION,
  TRUSTED_TOOL_SOURCES,
  ToolCatalogError,
  assertCacheReadOnly,
  assertDependencyInstallAllowed,
  checksumText,
  createDependencyApprovalPayload,
  createToolCatalog,
  createToolCatalogFromPackageLock,
  evaluateDependencyPolicy,
  normalizeToolEntry
} from '../packages/orchestrator/src/index.js';

assert.equal(TOOL_CATALOG_SCHEMA_VERSION, 1);
assert.equal(TRUSTED_TOOL_SOURCES.includes('npm:registry.npmjs.org'), true);
const checksum = checksumText('tool');
const entry = normalizeToolEntry({ name: 'semver', version: '7.8.5', source: 'npm:registry.npmjs.org', checksum, signature: 'sig', compatibility: { node: '>=10' }, installMode: 'read-only-cache' });
assert.equal(entry.checksum, checksum);
assert.equal(entry.installMode, 'read-only-cache');
const catalog = createToolCatalog({ tools: [entry] });
assert.equal(catalog.schemaVersion, 1);
assert.equal(catalog.readOnlyCache, true);
assert.throws(() => normalizeToolEntry({ name: 'bad', version: '1.0.0', source: 'https://evil.example.com', checksum }), ToolCatalogError);
assert.throws(() => normalizeToolEntry({ name: 'bad', version: '1.0.0', source: 'npm:registry.npmjs.org', checksum: 'sha1:bad' }), ToolCatalogError);

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const lockCatalog = createToolCatalogFromPackageLock(lock);
assert.equal(lockCatalog.tools.some((tool) => tool.name === 'semver'), true);
assert.equal(lockCatalog.tools.every((tool) => tool.installMode === 'read-only-cache'), true);

const sameDecision = evaluateDependencyPolicy({ previousLockfile: lock, nextLockfile: structuredClone(lock) });
assert.equal(sameDecision.decision, 'allowed');
assert.equal(assertDependencyInstallAllowed(sameDecision), true);

const addedLock = structuredClone(lock);
addedLock.packages['node_modules/new-tool'] = { version: '1.0.0', resolved: 'https://registry.npmjs.org/new-tool/-/new-tool-1.0.0.tgz', integrity: 'sha512-new' };
const addedDecision = evaluateDependencyPolicy({ previousLockfile: lock, nextLockfile: addedLock, requestedPackage: 'new-tool' });
assert.equal(addedDecision.decision, 'requires_approval');
assert.deepEqual(addedDecision.added, ['new-tool']);
assert.throws(() => assertDependencyInstallAllowed(addedDecision), ToolCatalogError);
const approval = createDependencyApprovalPayload(addedDecision);
assert.equal(approval.gate, 'dependency-policy-approval');
assert.equal(approval.requestedPackage, 'new-tool');

const changedLock = structuredClone(lock);
changedLock.packages['node_modules/semver'].version = '8.0.0';
assert.equal(evaluateDependencyPolicy({ previousLockfile: lock, nextLockfile: changedLock }).decision, 'requires_approval');

const untrustedLock = structuredClone(lock);
untrustedLock.packages['node_modules/evil'] = { version: '1.0.0', resolved: 'https://evil.example.com/evil.tgz', integrity: 'sha512-evil' };
const blocked = evaluateDependencyPolicy({ previousLockfile: lock, nextLockfile: untrustedLock });
assert.equal(blocked.decision, 'blocked');
assert.equal(blocked.untrusted[0].name, 'evil');
assert.throws(() => assertDependencyInstallAllowed(blocked), ToolCatalogError);
assert.equal(assertCacheReadOnly({ cachePath: './data/tool-cache' }).readOnly, true);
assert.throws(() => assertCacheReadOnly({ cachePath: './data/tool-cache', writeAttempted: true }), ToolCatalogError);

console.log('Tool catalog tests OK');
