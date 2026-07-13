export const ADAPTER_CONTRACT_VERSION = '0.1.0';

export const ADAPTER_OPERATIONS = Object.freeze([
  'health',
  'capabilities',
  'start',
  'deliverTask',
  'heartbeat',
  'checkpoint',
  'cancel',
  'resume',
  'collectArtifacts'
]);

export const ADAPTER_OUTCOMES = Object.freeze([
  'success',
  'recoverable_failure',
  'terminal_failure',
  'cancelled',
  'unknown'
]);

export class AdapterContractError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'AdapterContractError';
    this.code = 'ERR_ADAPTER_CONTRACT';
    this.details = details;
  }
}

export function createAdapterDescriptor({ adapterId, displayName, version, executable, operations = ADAPTER_OPERATIONS, metadata = {} } = {}) {
  if (!adapterId || !displayName || !version) {
    throw new AdapterContractError('Adapter descriptor requires adapterId, displayName and version.', { adapterId, displayName, version });
  }
  const missingOperations = ADAPTER_OPERATIONS.filter((operation) => !operations.includes(operation));
  if (missingOperations.length > 0) {
    throw new AdapterContractError('Adapter descriptor is missing required contract operations.', { adapterId, missingOperations });
  }
  return deepFreeze({
    contractVersion: ADAPTER_CONTRACT_VERSION,
    adapterId,
    displayName,
    version,
    executable: executable ?? null,
    operations: [...ADAPTER_OPERATIONS],
    metadata: { ...metadata }
  });
}

export function normalizeAdapterResult({ operation, status, outcome, data = {}, error = null, recoverable = false, exitCode = null, signal = null, artifacts = [] } = {}) {
  if (!ADAPTER_OPERATIONS.includes(operation)) {
    throw new AdapterContractError('Unknown adapter operation.', { operation });
  }
  const normalizedOutcome = normalizeOutcome({ status, outcome, recoverable });
  return deepFreeze({
    contractVersion: ADAPTER_CONTRACT_VERSION,
    operation,
    outcome: normalizedOutcome,
    ok: normalizedOutcome === 'success',
    recoverable: normalizedOutcome === 'recoverable_failure',
    terminal: normalizedOutcome === 'terminal_failure' || normalizedOutcome === 'cancelled',
    exitCode,
    signal,
    data: { ...data },
    error: normalizeAdapterError(error),
    artifacts: artifacts.map(normalizeArtifact)
  });
}

export function assertAdapterContractImplementation(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new AdapterContractError('Adapter implementation must be an object.');
  const missingOperations = ADAPTER_OPERATIONS.filter((operation) => typeof adapter[operation] !== 'function');
  if (missingOperations.length > 0) throw new AdapterContractError('Adapter implementation is missing operations.', { missingOperations });
  return Object.freeze({ valid: true, operations: [...ADAPTER_OPERATIONS] });
}

export function createNullAdapterContractHarness({ adapterId = 'contract-harness' } = {}) {
  const descriptor = createAdapterDescriptor({ adapterId, displayName: 'Contract Harness', version: '0.0.0-harness' });
  return Object.freeze({
    descriptor,
    health: async () => normalizeAdapterResult({ operation: 'health', outcome: 'success', data: { healthy: true } }),
    capabilities: async () => normalizeAdapterResult({ operation: 'capabilities', outcome: 'success', data: { capabilities: [] } }),
    start: async () => normalizeAdapterResult({ operation: 'start', outcome: 'success', data: { attemptId: null } }),
    deliverTask: async () => normalizeAdapterResult({ operation: 'deliverTask', outcome: 'success' }),
    heartbeat: async () => normalizeAdapterResult({ operation: 'heartbeat', outcome: 'success', data: { alive: true } }),
    checkpoint: async () => normalizeAdapterResult({ operation: 'checkpoint', outcome: 'success', data: { checkpointId: null } }),
    cancel: async () => normalizeAdapterResult({ operation: 'cancel', outcome: 'cancelled' }),
    resume: async () => normalizeAdapterResult({ operation: 'resume', outcome: 'success' }),
    collectArtifacts: async () => normalizeAdapterResult({ operation: 'collectArtifacts', outcome: 'success', artifacts: [] })
  });
}

function normalizeOutcome({ status, outcome, recoverable }) {
  if (ADAPTER_OUTCOMES.includes(outcome)) return outcome;
  if (status === 'success' || status === 'ok') return 'success';
  if (status === 'cancelled' || status === 'canceled') return 'cancelled';
  if (status === 'failed' && recoverable === true) return 'recoverable_failure';
  if (status === 'failed') return 'terminal_failure';
  return 'unknown';
}

function normalizeAdapterError(error) {
  if (!error) return null;
  if (typeof error === 'string') return { message: error };
  return {
    message: String(error.message ?? 'Adapter error'),
    code: error.code ?? null,
    detail: error.detail ?? null
  };
}

function normalizeArtifact(artifact) {
  return {
    path: artifact.path,
    kind: artifact.kind ?? 'file',
    sha256: artifact.sha256 ?? null,
    sizeBytes: artifact.sizeBytes ?? null
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

if (process.argv.includes('--build-check')) console.log('@londi-agent-os/adapters build OK');

export const CAPABILITY_REGISTRY_VERSION = 1;

export const APPROVED_ADAPTER_IDS = Object.freeze(['claude-code', 'codex']);

const DEFAULT_CAPABILITY_REGISTRY = Object.freeze({
  registryVersion: CAPABILITY_REGISTRY_VERSION,
  adapters: Object.freeze({
    'claude-code': createRegistryEntry({
      adapterId: 'claude-code',
      displayName: 'Claude Code CLI',
      version: '1.0.0',
      executable: 'claude',
      supportedRange: '>=1.0.0',
      priority: 90,
      capabilities: ['code-editing', 'repository-analysis', 'test-running', 'refactoring', 'planning'],
      constraints: ['local-cli-required', 'git-worktree-only', 'no-automatic-merge'],
      access: ['workspace-read', 'workspace-write', 'artifact-write', 'process-spawn'],
      health: { status: 'unknown', checkedAt: null },
      compatibility: { source: 'compatibility-manifest', supportedRange: '>=1.0.0' }
    }),
    codex: createRegistryEntry({
      adapterId: 'codex',
      displayName: 'Codex CLI',
      version: '0.1.0',
      executable: 'codex',
      supportedRange: '>=0.1.0',
      priority: 80,
      capabilities: ['code-editing', 'repository-analysis', 'test-running', 'debugging'],
      constraints: ['local-cli-required', 'git-worktree-only', 'no-automatic-merge'],
      access: ['workspace-read', 'workspace-write', 'artifact-write', 'process-spawn'],
      health: { status: 'unknown', checkedAt: null },
      compatibility: { source: 'compatibility-manifest', supportedRange: '>=0.1.0' }
    })
  })
});

export function loadCapabilityRegistry({ compatibilityManifest, detectedVersions = {}, health = {} } = {}) {
  const manifestAgents = compatibilityManifest?.agents ?? {};
  const entries = Object.fromEntries(APPROVED_ADAPTER_IDS.map((adapterId) => {
    const base = DEFAULT_CAPABILITY_REGISTRY.adapters[adapterId];
    const manifestAgent = Object.values(manifestAgents).find((agent) => agent?.id === adapterId);
    const supportedRange = manifestAgent?.supportedRange ?? base.supportedRange;
    const version = detectedVersions[adapterId] ?? base.version;
    return [adapterId, evaluateRegistryEntry({
      ...base,
      version,
      supportedRange,
      health: health[adapterId] ?? base.health,
      compatibility: { ...base.compatibility, supportedRange }
    })];
  }));
  return deepFreeze({ registryVersion: CAPABILITY_REGISTRY_VERSION, adapters: entries });
}

export function listAvailableAdapters(registry = DEFAULT_CAPABILITY_REGISTRY) {
  assertApprovedRegistry(registry);
  return Object.values(registry.adapters).filter((entry) => entry.availability === 'available');
}

export function getCapabilityRegistryEntry(registry, adapterId) {
  assertApprovedRegistry(registry);
  const entry = registry.adapters[adapterId];
  if (!entry) throw new AdapterContractError('Unknown or unapproved adapter id.', { adapterId, approvedAdapterIds: APPROVED_ADAPTER_IDS });
  return entry;
}

export function assertApprovedRegistry(registry = DEFAULT_CAPABILITY_REGISTRY) {
  if (!registry || typeof registry !== 'object') throw new AdapterContractError('Capability registry must be an object.');
  const ids = Object.keys(registry.adapters ?? {});
  const unsupported = ids.filter((id) => !APPROVED_ADAPTER_IDS.includes(id));
  const missing = APPROVED_ADAPTER_IDS.filter((id) => !ids.includes(id));
  if (unsupported.length > 0 || missing.length > 0) {
    throw new AdapterContractError('Capability registry must contain exactly the approved MVP adapters.', { unsupported, missing, approvedAdapterIds: APPROVED_ADAPTER_IDS });
  }
  return Object.freeze({ valid: true, adapterIds: [...APPROVED_ADAPTER_IDS] });
}

function createRegistryEntry({ adapterId, displayName, version, executable, supportedRange, priority, capabilities, constraints, access, health, compatibility }) {
  return evaluateRegistryEntry({ adapterId, displayName, version, executable, supportedRange, priority, capabilities, constraints, access, health, compatibility });
}

function evaluateRegistryEntry(entry) {
  const compatible = satisfiesVersion(entry.version, entry.supportedRange);
  return deepFreeze({
    ...entry,
    descriptor: createAdapterDescriptor({
      adapterId: entry.adapterId,
      displayName: entry.displayName,
      version: entry.version,
      executable: entry.executable
    }),
    availability: compatible ? 'available' : 'unavailable',
    availabilityReason: compatible ? 'version-compatible' : 'version-incompatible'
  });
}

function satisfiesVersion(version, range) {
  const parsed = parseSemver(version);
  if (!parsed) return false;
  for (const clause of String(range ?? '').trim().split(/\s+/).filter(Boolean)) {
    const match = clause.match(/^(>=|>|<=|<|=)?(\d+)\.(\d+)\.(\d+)$/);
    if (!match) return false;
    const [, op = '=', major, minor, patch] = match;
    const cmp = compareSemver(parsed, { major: Number(major), minor: Number(minor), patch: Number(patch) });
    if (op === '>=' && cmp < 0) return false;
    if (op === '>' && cmp <= 0) return false;
    if (op === '<=' && cmp > 0) return false;
    if (op === '<' && cmp >= 0) return false;
    if (op === '=' && cmp !== 0) return false;
  }
  return true;
}

function parseSemver(version) {
  const match = String(version ?? '').match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compareSemver(left, right) {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}
