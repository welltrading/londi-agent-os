import { createHash } from 'node:crypto';

export const TOOL_CATALOG_SCHEMA_VERSION = 1;
export const TRUSTED_TOOL_SOURCES = Object.freeze(['npm:registry.npmjs.org', 'local-workspace', 'builtin']);
export const DEPENDENCY_DECISIONS = Object.freeze(['allowed', 'requires_approval', 'blocked']);

export class ToolCatalogError extends Error {
  constructor(message = 'Invalid tool catalog operation.', details = {}) {
    super(message);
    this.name = 'ToolCatalogError';
    this.code = 'ERR_TOOL_CATALOG';
    this.details = details;
  }
}

export function createToolCatalog({ tools = [], schemaVersion = TOOL_CATALOG_SCHEMA_VERSION } = {}) {
  if (schemaVersion !== TOOL_CATALOG_SCHEMA_VERSION) throw new ToolCatalogError('Unsupported tool catalog schema version.', { schemaVersion });
  if (!Array.isArray(tools)) throw new ToolCatalogError('Tool catalog tools must be an array.');
  const normalized = tools.map(normalizeToolEntry).sort((a, b) => a.name.localeCompare(b.name));
  return deepFreezeToolCatalog({ schemaVersion, tools: normalized, readOnlyCache: true });
}

export function normalizeToolEntry({ name, version, source, checksum, signature = null, compatibility = {}, installMode = 'local' } = {}) {
  if (!name || !version || !source || !checksum) throw new ToolCatalogError('Tool entry requires name, version, source and checksum.', { name, version, source });
  if (!isTrustedToolSource(source)) throw new ToolCatalogError('Tool source is not trusted.', { name, source });
  if (!/^sha256:[a-f0-9]{64}$/i.test(checksum)) throw new ToolCatalogError('Tool checksum must be sha256:<64 hex chars>.', { name, checksum });
  if (!['local', 'read-only-cache'].includes(installMode)) throw new ToolCatalogError('Tool install mode must be local or read-only-cache.', { name, installMode });
  return deepFreezeToolCatalog({ name, version, source, checksum: checksum.toLowerCase(), signature, compatibility: { ...compatibility }, installMode });
}

export function createToolCatalogFromPackageLock(lockfile, { trustedSources = TRUSTED_TOOL_SOURCES } = {}) {
  const parsed = typeof lockfile === 'string' ? JSON.parse(lockfile) : lockfile;
  if (!parsed?.packages || typeof parsed.packages !== 'object') throw new ToolCatalogError('package-lock packages section is required.');
  const tools = [];
  for (const [path, entry] of Object.entries(parsed.packages)) {
    if (!path.startsWith('node_modules/') || entry.link === true) continue;
    const name = path.slice('node_modules/'.length);
    const source = sourceFromResolved(entry.resolved);
    if (!trustedSources.includes(source)) throw new ToolCatalogError('Lockfile contains untrusted package source.', { name, source, resolved: entry.resolved });
    tools.push(normalizeToolEntry({
      name,
      version: entry.version,
      source,
      checksum: integrityToChecksum(entry.integrity ?? `${name}@${entry.version}`),
      signature: entry.integrity ?? null,
      compatibility: { engines: entry.engines ?? {} },
      installMode: 'read-only-cache'
    }));
  }
  return createToolCatalog({ tools });
}

export function evaluateDependencyPolicy({ previousLockfile, nextLockfile, requestedPackage = null, trustedSources = TRUSTED_TOOL_SOURCES } = {}) {
  const previous = parseLock(previousLockfile);
  const next = parseLock(nextLockfile);
  const previousPackages = lockPackages(previous);
  const nextPackages = lockPackages(next);
  const added = [...nextPackages.keys()].filter((name) => !previousPackages.has(name));
  const removed = [...previousPackages.keys()].filter((name) => !nextPackages.has(name));
  const changed = [...nextPackages.keys()].filter((name) => previousPackages.has(name) && JSON.stringify(previousPackages.get(name)) !== JSON.stringify(nextPackages.get(name)));
  const untrusted = [...nextPackages.entries()].filter(([, entry]) => !trustedSources.includes(sourceFromResolved(entry.resolved))).map(([name, entry]) => ({ name, source: sourceFromResolved(entry.resolved) }));
  if (untrusted.length > 0) return deepFreezeToolCatalog({ decision: 'blocked', reason: 'untrusted-source', added, removed, changed, untrusted, requestedPackage });
  if (added.length > 0 || changed.length > 0) return deepFreezeToolCatalog({ decision: 'requires_approval', reason: 'new-package-or-lockfile-changed', added, removed, changed, untrusted, requestedPackage });
  return deepFreezeToolCatalog({ decision: 'allowed', reason: 'existing-lockfile-unchanged', added, removed, changed, untrusted, requestedPackage });
}

export function assertDependencyInstallAllowed(policyDecision) {
  if (!policyDecision || !DEPENDENCY_DECISIONS.includes(policyDecision.decision)) throw new ToolCatalogError('Invalid dependency policy decision.', { policyDecision });
  if (policyDecision.decision === 'blocked') throw new ToolCatalogError('Dependency install blocked.', policyDecision);
  if (policyDecision.decision === 'requires_approval') throw new ToolCatalogError('Dependency install requires approval.', policyDecision);
  return true;
}

export function assertCacheReadOnly({ cachePath, writeAttempted = false } = {}) {
  if (!cachePath) throw new ToolCatalogError('Cache path is required.');
  if (writeAttempted) throw new ToolCatalogError('Tool cache is read-only; write/install must happen in local workspace only.', { cachePath });
  return deepFreezeToolCatalog({ cachePath, readOnly: true });
}

export function createDependencyApprovalPayload(policyDecision) {
  if (!policyDecision || !DEPENDENCY_DECISIONS.includes(policyDecision.decision)) throw new ToolCatalogError('Invalid dependency policy decision.', { policyDecision });
  return deepFreezeToolCatalog({
    gate: 'dependency-policy-approval',
    decision: policyDecision.decision,
    reason: policyDecision.reason,
    added: policyDecision.added ?? [],
    changed: policyDecision.changed ?? [],
    removed: policyDecision.removed ?? [],
    untrusted: policyDecision.untrusted ?? [],
    requestedPackage: policyDecision.requestedPackage ?? null
  });
}

export function checksumText(text) {
  return `sha256:${createHash('sha256').update(String(text)).digest('hex')}`;
}

function parseLock(lockfile) {
  if (!lockfile) throw new ToolCatalogError('Lockfile is required.');
  return typeof lockfile === 'string' ? JSON.parse(lockfile) : lockfile;
}

function lockPackages(lockfile) {
  const map = new Map();
  for (const [path, entry] of Object.entries(lockfile.packages ?? {})) {
    if (!path.startsWith('node_modules/') || entry.link === true) continue;
    map.set(path.slice('node_modules/'.length), { version: entry.version, resolved: entry.resolved, integrity: entry.integrity });
  }
  return map;
}

function sourceFromResolved(resolved = '') {
  if (!resolved) return 'local-workspace';
  if (resolved.startsWith('https://registry.npmjs.org/')) return 'npm:registry.npmjs.org';
  if (resolved.startsWith('file:') || resolved.startsWith('packages/') || resolved.startsWith('apps/')) return 'local-workspace';
  return `untrusted:${String(resolved).split('/').slice(0, 3).join('/')}`;
}

function isTrustedToolSource(source) {
  return TRUSTED_TOOL_SOURCES.includes(source);
}

function integrityToChecksum(integrity) {
  if (String(integrity).startsWith('sha512-')) return checksumText(integrity);
  if (String(integrity).startsWith('sha256:')) return String(integrity);
  return checksumText(integrity);
}

function deepFreezeToolCatalog(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeToolCatalog(child);
  return Object.freeze(value);
}
