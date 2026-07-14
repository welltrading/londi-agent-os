import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateGitProject, classifyWorkspaceValidationError } from './workspace-manager.js';
import { assertSecretAlias } from './secret-broker.js';
import { assertNetworkAllowed } from './network-grants.js';
import { assertCacheReadOnly, evaluateDependencyPolicy } from './tool-catalog.js';

export const PREFLIGHT_STATUSES = Object.freeze(['Ready', 'Ready with Warnings', 'Blocked']);
export const PREFLIGHT_CHECK_STATUSES = Object.freeze(['Ready', 'Warning', 'Blocked']);
export const PREFLIGHT_MIN_FREE_BYTES = 5 * 1024 * 1024 * 1024;

export class PreflightEngineError extends Error {
  constructor(message = 'Invalid preflight operation.', details = {}) {
    super(message);
    this.name = 'PreflightEngineError';
    this.code = 'ERR_PREFLIGHT_ENGINE';
    this.details = details;
  }
}

export function runFullPreflight({
  repositoryPath,
  targetBranch,
  runId,
  lockStore,
  adapters = [],
  runtime = {},
  aclPolicy = null,
  disk = {},
  contextSnapshot = null,
  secretAliases = [],
  credentialManager = null,
  networkRequests = [],
  networkAllowlist = null,
  maintenance = {},
  dependencyPolicy = null,
  packageLocks = null,
  cache = null,
  allowDirty = true
} = {}) {
  const checks = [];
  checks.push(...checkGit({ repositoryPath, targetBranch, runId, lockStore, allowDirty }));
  checks.push(...checkAdapters(adapters));
  checks.push(checkRuntime(runtime));
  checks.push(checkAcl(aclPolicy));
  checks.push(checkDisk({ disk, repositoryPath }));
  checks.push(checkContext(contextSnapshot));
  checks.push(checkSecretAliases({ secretAliases, credentialManager }));
  checks.push(...checkNetwork({ networkRequests, networkAllowlist, runId }));
  checks.push(checkLocks(lockStore));
  checks.push(checkMaintenance(maintenance));
  checks.push(checkDependencyPolicy({ dependencyPolicy, packageLocks }));
  checks.push(checkCache(cache));
  const status = summarizePreflightStatus(checks);
  return deepFreezePreflight({ status, checks, evidenceRedacted: redactPreflightEvidence(checks), overrideAllowed: status === 'Ready with Warnings' });
}

export function summarizePreflightStatus(checks) {
  if (!Array.isArray(checks)) throw new PreflightEngineError('Preflight checks must be an array.');
  if (checks.some((check) => check.status === 'Blocked')) return 'Blocked';
  if (checks.some((check) => check.status === 'Warning')) return 'Ready with Warnings';
  return 'Ready';
}

export function assertPreflightCanStart(preflight, { overrideWarnings = false } = {}) {
  if (!preflight || !PREFLIGHT_STATUSES.includes(preflight.status)) throw new PreflightEngineError('Preflight result is required.');
  if (preflight.status === 'Blocked') throw new PreflightEngineError('Blocked preflight cannot start.', { status: preflight.status, checks: preflight.checks });
  if (preflight.status === 'Ready with Warnings' && overrideWarnings !== true) throw new PreflightEngineError('Preflight warnings require explicit override.', { status: preflight.status });
  return true;
}

export function createPreflightCheck({ name, status, detail = null, evidence = null, overrideable = false } = {}) {
  if (!name || !PREFLIGHT_CHECK_STATUSES.includes(status)) throw new PreflightEngineError('Preflight check requires a valid name and status.', { name, status });
  if (status === 'Blocked' && overrideable === true) throw new PreflightEngineError('Blocked preflight checks cannot be overrideable.', { name });
  return deepFreezePreflight({ name, status, detail, evidence: redactEvidence(evidence), overrideable: status === 'Warning' ? Boolean(overrideable) : false });
}

function checkGit({ repositoryPath, targetBranch, runId, lockStore, allowDirty }) {
  try {
    const result = validateGitProject({ repositoryPath, targetBranch, runId, lockStore, allowDirty });
    const checks = (result.checks ?? []).map((check) => createPreflightCheck({ name: check.name, status: check.status === 'Warning' ? 'Warning' : check.status === 'Blocked' ? 'Blocked' : 'Ready', detail: check.detail, overrideable: check.status === 'Warning' }));
    if (result.status === 'Blocked') checks.push(createPreflightCheck({ name: 'git.validation', status: 'Blocked', detail: result.reason, evidence: result.details }));
    return checks.length ? checks : [createPreflightCheck({ name: 'git.validation', status: 'Ready' })];
  } catch (error) {
    const classified = classifyWorkspaceValidationError(error);
    return [createPreflightCheck({ name: 'git.validation', status: 'Blocked', detail: classified.reason, evidence: classified.details })];
  }
}

function checkAdapters(adapters) {
  if (!Array.isArray(adapters) || adapters.length === 0) return [createPreflightCheck({ name: 'adapters.health', status: 'Blocked', detail: 'At least one approved adapter health result is required.' })];
  return adapters.map((adapter) => createPreflightCheck({
    name: `adapter.${adapter.adapterId ?? 'unknown'}`,
    status: adapter.healthy === true || adapter.outcome === 'success' ? 'Ready' : 'Blocked',
    detail: adapter.displayName ?? adapter.adapterId ?? 'adapter',
    evidence: { adapterId: adapter.adapterId, outcome: adapter.outcome, healthy: adapter.healthy }
  }));
}

function checkRuntime(runtime) {
  const nodeOk = runtime.nodeOk !== false;
  const gitOk = runtime.gitOk !== false;
  const osOk = runtime.osOk !== false;
  return createPreflightCheck({ name: 'runtime.compatibility', status: nodeOk && gitOk && osOk ? 'Ready' : 'Blocked', evidence: runtime });
}

function checkAcl(policy) {
  return createPreflightCheck({ name: 'acl.isolation', status: policy?.allowedWriteRoots?.length > 0 ? 'Ready' : 'Blocked', evidence: policy ? { serviceAccount: policy.serviceAccount, rules: policy.rules } : null });
}

function checkDisk({ disk, repositoryPath }) {
  const repoBytes = Number.isFinite(disk.repositoryBytes) ? disk.repositoryBytes : estimateDirectoryBytes(repositoryPath);
  const requiredBytes = Math.max(PREFLIGHT_MIN_FREE_BYTES, repoBytes * 2);
  const freeBytes = Number.isFinite(disk.freeBytes) ? disk.freeBytes : requiredBytes;
  return createPreflightCheck({ name: 'disk.capacity', status: freeBytes >= requiredBytes ? 'Ready' : 'Blocked', detail: { freeBytes, requiredBytes }, evidence: { freeBytes, repositoryBytes: repoBytes, requiredBytes } });
}

function checkContext(snapshot) {
  if (!snapshot) return createPreflightCheck({ name: 'context.snapshot', status: 'Warning', detail: 'No Obsidian context snapshot selected.', overrideable: true });
  return createPreflightCheck({ name: 'context.snapshot', status: snapshot.readOnly === false ? 'Blocked' : 'Ready', evidence: { snapshotId: snapshot.snapshotId, readOnly: snapshot.readOnly !== false } });
}

function checkSecretAliases({ secretAliases, credentialManager }) {
  try {
    for (const alias of secretAliases) {
      assertSecretAlias(alias);
      if (credentialManager?.hasSecret && !credentialManager.hasSecret(alias)) return createPreflightCheck({ name: 'secret.aliases', status: 'Blocked', detail: `Missing secret alias: ${alias}` });
    }
    return createPreflightCheck({ name: 'secret.aliases', status: 'Ready', evidence: { aliases: secretAliases } });
  } catch (error) {
    return createPreflightCheck({ name: 'secret.aliases', status: 'Blocked', detail: error.message });
  }
}

function checkNetwork({ networkRequests, networkAllowlist, runId }) {
  if (!Array.isArray(networkRequests) || networkRequests.length === 0) return [createPreflightCheck({ name: 'network.allowlist', status: 'Ready', detail: 'No network requested.' })];
  return networkRequests.map((request) => {
    try {
      const result = assertNetworkAllowed({ allowlist: networkAllowlist, runId, ...request });
      return createPreflightCheck({ name: `network.${request.hostname}`, status: 'Ready', evidence: result });
    } catch (error) {
      return createPreflightCheck({ name: `network.${request.hostname ?? 'unknown'}`, status: 'Blocked', detail: error.message });
    }
  });
}

function checkLocks(lockStore) {
  const locks = lockStore?.list?.() ?? [];
  return createPreflightCheck({ name: 'locks.workspace', status: 'Ready', evidence: { activeLocks: locks.length } });
}

function checkMaintenance(maintenance) {
  if (maintenance.active === true) return createPreflightCheck({ name: 'maintenance.window', status: 'Blocked', detail: maintenance.reason ?? 'Maintenance active.' });
  if (maintenance.scheduled === true) return createPreflightCheck({ name: 'maintenance.window', status: 'Warning', detail: maintenance.reason ?? 'Maintenance scheduled.', overrideable: true });
  return createPreflightCheck({ name: 'maintenance.window', status: 'Ready' });
}

function checkDependencyPolicy({ dependencyPolicy, packageLocks }) {
  const decision = dependencyPolicy ?? (packageLocks ? evaluateDependencyPolicy(packageLocks) : { decision: 'allowed', reason: 'not-applicable' });
  const status = decision.decision === 'blocked' ? 'Blocked' : decision.decision === 'requires_approval' ? 'Warning' : 'Ready';
  return createPreflightCheck({ name: 'dependency.policy', status, detail: decision.reason, evidence: decision, overrideable: status === 'Warning' });
}

function checkCache(cache) {
  try {
    const result = cache ? assertCacheReadOnly(cache) : { readOnly: true };
    return createPreflightCheck({ name: 'tool.cache', status: 'Ready', evidence: result });
  } catch (error) {
    return createPreflightCheck({ name: 'tool.cache', status: 'Blocked', detail: error.message });
  }
}

function estimateDirectoryBytes(path) {
  try {
    if (!path || !existsSync(resolve(path))) return 0;
    const stat = statSync(resolve(path));
    return stat.isDirectory() ? 0 : stat.size;
  } catch {
    return 0;
  }
}

function redactPreflightEvidence(checks) {
  return checks.map((check) => ({ name: check.name, status: check.status, detail: redactEvidence(check.detail), evidence: redactEvidence(check.evidence), overrideable: check.overrideable }));
}

function redactEvidence(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  const redacted = text.replace(/sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+\/-]{12,}|password=([^\s&]+)/gi, '[REDACTED]');
  try { return JSON.parse(redacted); } catch { return redacted; }
}

function deepFreezePreflight(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezePreflight(child);
  return Object.freeze(value);
}
