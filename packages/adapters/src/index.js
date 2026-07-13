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
