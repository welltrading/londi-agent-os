import { spawnSync } from 'node:child_process';

export const SECRET_GRANT_TTL_MINUTES = 30;
export const SECRET_GRANT_STATUSES = Object.freeze(['issued', 'expired', 'revoked', 'consumed']);
export const SECRET_VALUE_PLACEHOLDER = '[SECRET:GRANTED]';

export class SecretBrokerError extends Error {
  constructor(message = 'Invalid Secret Broker operation.', details = {}) {
    super(message);
    this.name = 'SecretBrokerError';
    this.code = 'ERR_SECRET_BROKER';
    this.details = details;
  }
}

export function createInMemoryCredentialManager(secrets = {}) {
  const store = new Map(Object.entries(secrets));
  return Object.freeze({
    getSecret(alias) {
      assertSecretAlias(alias);
      if (!store.has(alias)) throw new SecretBrokerError('Secret alias not found in credential manager.', { alias });
      return String(store.get(alias));
    },
    hasSecret(alias) {
      assertSecretAlias(alias);
      return store.has(alias);
    },
    describe() {
      return { source: 'memory-credential-manager', aliases: [...store.keys()].sort(), containsValues: false };
    }
  });
}

export function createWindowsCredentialManager({ targetPrefix = 'LondiAgentOS' } = {}) {
  return Object.freeze({
    getSecret(alias) {
      assertSecretAlias(alias);
      const target = `${targetPrefix}:${alias}`;
      const result = spawnSync('cmdkey', ['/list', target], { encoding: 'utf8', windowsHide: true });
      if (result.status !== 0) throw new SecretBrokerError('Credential Manager alias lookup failed.', { alias, target, status: result.status });
      throw new SecretBrokerError('Direct cmdkey secret material export is unavailable; provide a platform-specific secure reader.', { alias, target });
    },
    describe() {
      return { source: 'windows-credential-manager', targetPrefix, containsValues: false };
    }
  });
}

export function createSecretGrant({
  id,
  alias,
  runId,
  stepId,
  agentId,
  issuedAt = new Date().toISOString(),
  ttlMinutes = SECRET_GRANT_TTL_MINUTES,
  status = 'issued'
} = {}) {
  assertSecretAlias(alias);
  if (!id || !runId || !stepId || !agentId) throw new SecretBrokerError('Secret grant requires id, runId, stepId and agentId.', { id, runId, stepId, agentId });
  if (!Number.isInteger(ttlMinutes) || ttlMinutes <= 0 || ttlMinutes > SECRET_GRANT_TTL_MINUTES) throw new SecretBrokerError('Secret grant ttl must be 1-30 minutes.', { ttlMinutes });
  if (!SECRET_GRANT_STATUSES.includes(status)) throw new SecretBrokerError('Invalid secret grant status.', { status });
  return deepFreezeSecret({ id, alias, runId, stepId, agentId, issuedAt, expiresAt: addMinutesIso(issuedAt, ttlMinutes), status });
}

export function assertGrantValid(grant, { runId, stepId, agentId, alias, now = new Date().toISOString() } = {}) {
  assertGrantShape(grant);
  if (grant.status !== 'issued') throw new SecretBrokerError('Secret grant is not issued.', { grantId: grant.id, status: grant.status });
  if (Date.parse(now) > Date.parse(grant.expiresAt)) throw new SecretBrokerError('Secret grant expired.', { grantId: grant.id, expiresAt: grant.expiresAt, now });
  for (const [key, expected] of Object.entries({ runId, stepId, agentId, alias })) {
    if (expected !== undefined && grant[key] !== expected) throw new SecretBrokerError('Secret grant scope mismatch.', { grantId: grant.id, key, expected, actual: grant[key] });
  }
  return true;
}

export function issueSecretGrant({ credentialManager, approvedAliases = [], alias, runId, stepId, agentId, id, issuedAt, ttlMinutes } = {}) {
  assertSecretAlias(alias);
  if (!approvedAliases.includes(alias)) throw new SecretBrokerError('Secret alias was not approved for this run.', { alias });
  if (!credentialManager?.hasSecret?.(alias)) throw new SecretBrokerError('Secret alias is unavailable in credential manager.', { alias });
  return createSecretGrant({ id: id ?? `grant-${runId}-${stepId}-${alias}`, alias, runId, stepId, agentId, issuedAt, ttlMinutes });
}

export function injectGrantedSecret({ credentialManager, grant, env = {}, envName = grant?.alias, now = new Date().toISOString() } = {}) {
  assertGrantValid(grant, { now });
  assertSecretAlias(envName);
  const secretValue = credentialManager?.getSecret?.(grant.alias);
  if (typeof secretValue !== 'string' || secretValue.length === 0) throw new SecretBrokerError('Credential manager returned an invalid secret value.', { alias: grant.alias });
  return Object.freeze({ env: { ...env, [envName]: secretValue }, audit: redactGrantForAudit(grant), cleanup: createGrantCleanup({ grant }) });
}

export function createGrantCleanup({ grant, cleanedAt = new Date().toISOString(), reason = 'step-finished' } = {}) {
  assertGrantShape(grant);
  return deepFreezeSecret({ grantId: grant.id, alias: grant.alias, runId: grant.runId, stepId: grant.stepId, agentId: grant.agentId, status: 'revoked', cleanedAt, reason });
}

export function revokeSecretGrant(grant, { revokedAt = new Date().toISOString(), reason = 'manual-revoke' } = {}) {
  assertGrantShape(grant);
  return deepFreezeSecret({ ...grant, status: 'revoked', revokedAt, reason });
}

export function expireSecretGrant(grant, { now = new Date().toISOString() } = {}) {
  assertGrantShape(grant);
  return Date.parse(now) > Date.parse(grant.expiresAt) ? deepFreezeSecret({ ...grant, status: 'expired', expiredAt: now }) : grant;
}

export function redactGrantForAudit(grant) {
  assertGrantShape(grant);
  return deepFreezeSecret({ id: grant.id, alias: grant.alias, runId: grant.runId, stepId: grant.stepId, agentId: grant.agentId, status: grant.status, issuedAt: grant.issuedAt, expiresAt: grant.expiresAt, value: SECRET_VALUE_PLACEHOLDER });
}

export function assertSecretNotPersisted(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? {});
  if (/sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+\/-]{12,}|password=|secret-token-value/i.test(text)) {
    throw new SecretBrokerError('Secret value must not be persisted in DB/API/artifacts.', { redacted: true });
  }
  return true;
}

export function assertSecretAlias(alias) {
  if (typeof alias !== 'string' || !/^[A-Z][A-Z0-9_]{2,80}$/.test(alias)) throw new SecretBrokerError('Secret alias must be an uppercase safe identifier.', { alias });
  return true;
}

function assertGrantShape(grant) {
  if (!grant || typeof grant !== 'object') throw new SecretBrokerError('Secret grant is required.');
  for (const key of ['id', 'alias', 'runId', 'stepId', 'agentId', 'issuedAt', 'expiresAt', 'status']) {
    if (!grant[key]) throw new SecretBrokerError('Secret grant is incomplete.', { key, grant });
  }
  assertSecretAlias(grant.alias);
  if (!SECRET_GRANT_STATUSES.includes(grant.status)) throw new SecretBrokerError('Invalid secret grant status.', { status: grant.status });
  return true;
}

function addMinutesIso(isoDate, minutes) {
  return new Date(Date.parse(isoDate) + minutes * 60_000).toISOString();
}

function deepFreezeSecret(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeSecret(child);
  return Object.freeze(value);
}
