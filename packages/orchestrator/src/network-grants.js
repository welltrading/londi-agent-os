export const NETWORK_GRANT_TTL_MINUTES = 30;
export const NETWORK_GRANT_STATUSES = Object.freeze(['approved', 'expired', 'revoked', 'denied']);
export const EXTERNAL_EFFECT_STATES = Object.freeze(['None', 'Known', 'Unknown']);

export class NetworkGrantError extends Error {
  constructor(message = 'Invalid network grant operation.', details = {}) {
    super(message);
    this.name = 'NetworkGrantError';
    this.code = 'ERR_NETWORK_GRANT';
    this.details = details;
  }
}

export function createNetworkGrant({
  id,
  hostname,
  purpose,
  runId,
  stepId,
  agentId,
  approvedAt = new Date().toISOString(),
  ttlMinutes = NETWORK_GRANT_TTL_MINUTES,
  status = 'approved'
} = {}) {
  assertHostname(hostname);
  if (!id || !purpose || !runId || !stepId || !agentId) throw new NetworkGrantError('Network grant requires id, hostname, purpose, runId, stepId and agentId.', { id, hostname, purpose, runId, stepId, agentId });
  if (!Number.isInteger(ttlMinutes) || ttlMinutes <= 0 || ttlMinutes > NETWORK_GRANT_TTL_MINUTES) throw new NetworkGrantError('Network grant ttl must be 1-30 minutes.', { ttlMinutes });
  if (!NETWORK_GRANT_STATUSES.includes(status)) throw new NetworkGrantError('Invalid network grant status.', { status });
  return deepFreezeNetwork({ id, hostname: normalizeHostname(hostname), purpose: String(purpose), runId, stepId, agentId, approvedAt, expiresAt: addMinutesIso(approvedAt, ttlMinutes), status });
}

export function createNetworkAllowlist({ grants = [], defaultMode = 'deny' } = {}) {
  if (!Array.isArray(grants)) throw new NetworkGrantError('Network grants must be an array.');
  if (!['deny', 'allow'].includes(defaultMode)) throw new NetworkGrantError('Unknown network allowlist default mode.', { defaultMode });
  return deepFreezeNetwork({ defaultMode, grants: grants.map(assertGrantShape) });
}

export function assertNetworkAllowed({ allowlist, hostname, purpose, runId, stepId, agentId, now = new Date().toISOString() } = {}) {
  assertHostname(hostname);
  if (!allowlist || typeof allowlist !== 'object') throw new NetworkGrantError('Network allowlist is required.');
  const normalizedHost = normalizeHostname(hostname);
  const matchingGrant = (allowlist.grants ?? []).find((grant) => {
    assertGrantShape(grant);
    return grant.hostname === normalizedHost && grant.purpose === purpose && grant.runId === runId && grant.stepId === stepId && grant.agentId === agentId;
  });
  if (!matchingGrant) {
    if (allowlist.defaultMode === 'allow') return deepFreezeNetwork({ allowed: true, hostname: normalizedHost, reason: 'default-allow' });
    throw new NetworkGrantError('Network destination is not approved for this step.', { hostname: normalizedHost, purpose, runId, stepId, agentId });
  }
  assertNetworkGrantUsable(matchingGrant, { now });
  return deepFreezeNetwork({ allowed: true, hostname: normalizedHost, grantId: matchingGrant.id, purpose });
}

export function assertNetworkGrantUsable(grant, { now = new Date().toISOString() } = {}) {
  assertGrantShape(grant);
  if (grant.status !== 'approved') throw new NetworkGrantError('Network grant is not approved.', { grantId: grant.id, status: grant.status });
  if (Date.parse(now) > Date.parse(grant.expiresAt)) throw new NetworkGrantError('Network grant expired.', { grantId: grant.id, expiresAt: grant.expiresAt, now });
  return true;
}

export function classifyExternalEffect({ attempted = false, allowed = false, completed = false, verified = false, resultKnown = false } = {}) {
  if (!attempted) return 'None';
  if (allowed === true && completed === true && (verified === true || resultKnown === true)) return 'Known';
  return 'Unknown';
}

export function assertReplayAllowedForExternalEffect(externalEffectState) {
  if (!EXTERNAL_EFFECT_STATES.includes(externalEffectState)) throw new NetworkGrantError('Unknown external effect state.', { externalEffectState });
  if (externalEffectState === 'Unknown') throw new NetworkGrantError('Replay blocked because External Effect state is Unknown.', { externalEffectState });
  return true;
}

export function recordNetworkAttempt({ allowlist, hostname, purpose, runId, stepId, agentId, completed = false, verified = false, resultKnown = false, now = new Date().toISOString() } = {}) {
  let decision;
  try {
    decision = assertNetworkAllowed({ allowlist, hostname, purpose, runId, stepId, agentId, now });
  } catch (error) {
    if (error instanceof NetworkGrantError) {
      return deepFreezeNetwork({ allowed: false, hostname: normalizeHostname(hostname), purpose, externalEffectState: 'Unknown', blocked: true, reason: error.message });
    }
    throw error;
  }
  const externalEffectState = classifyExternalEffect({ attempted: true, allowed: decision.allowed, completed, verified, resultKnown });
  return deepFreezeNetwork({ ...decision, completed, verified, resultKnown, externalEffectState, blocked: false });
}

export function createNetworkApprovalPayload({ requestedDestinations = [], grants = [], externalActions = [] } = {}) {
  if (!Array.isArray(requestedDestinations) || !Array.isArray(grants) || !Array.isArray(externalActions)) throw new NetworkGrantError('Network approval payload arrays are required.');
  return deepFreezeNetwork({
    requestedDestinations: requestedDestinations.map((destination) => ({ hostname: normalizeHostname(destination.hostname), purpose: String(destination.purpose), stepId: destination.stepId ?? null, durationMinutes: destination.durationMinutes ?? NETWORK_GRANT_TTL_MINUTES })),
    grants: grants.map(assertGrantShape),
    externalActions: externalActions.map((action) => ({ hostname: normalizeHostname(action.hostname), purpose: String(action.purpose), stepId: action.stepId ?? null, effect: action.effect ?? 'external' }))
  });
}

export function revokeNetworkGrant(grant, { revokedAt = new Date().toISOString(), reason = 'manual-revoke' } = {}) {
  assertGrantShape(grant);
  return deepFreezeNetwork({ ...grant, status: 'revoked', revokedAt, reason });
}

export function expireNetworkGrant(grant, { now = new Date().toISOString() } = {}) {
  assertGrantShape(grant);
  return Date.parse(now) > Date.parse(grant.expiresAt) ? deepFreezeNetwork({ ...grant, status: 'expired', expiredAt: now }) : grant;
}

export function assertHostname(hostname) {
  const normalized = normalizeHostname(hostname);
  if (!/^(?!-)([a-z0-9-]{1,63}\.)*[a-z0-9-]{1,63}\.[a-z]{2,63}$/.test(normalized) && normalized !== 'localhost') throw new NetworkGrantError('Hostname must be a safe hostname without protocol, port or path.', { hostname });
  return true;
}

function assertGrantShape(grant) {
  if (!grant || typeof grant !== 'object') throw new NetworkGrantError('Network grant is required.');
  for (const key of ['id', 'hostname', 'purpose', 'runId', 'stepId', 'agentId', 'approvedAt', 'expiresAt', 'status']) {
    if (!grant[key]) throw new NetworkGrantError('Network grant is incomplete.', { key, grant });
  }
  assertHostname(grant.hostname);
  if (!NETWORK_GRANT_STATUSES.includes(grant.status)) throw new NetworkGrantError('Invalid network grant status.', { status: grant.status });
  return deepFreezeNetwork({ ...grant, hostname: normalizeHostname(grant.hostname) });
}

function normalizeHostname(hostname) {
  if (typeof hostname !== 'string') throw new NetworkGrantError('Hostname must be a string.', { hostname });
  const trimmed = hostname.trim().toLowerCase();
  if (/^[a-z]+:\/\//i.test(trimmed) || trimmed.includes('/') || trimmed.includes(':') || trimmed.includes('@')) throw new NetworkGrantError('Hostname must not include protocol, credentials, port or path.', { hostname });
  return trimmed;
}

function addMinutesIso(isoDate, minutes) {
  return new Date(Date.parse(isoDate) + minutes * 60_000).toISOString();
}

function deepFreezeNetwork(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeNetwork(child);
  return Object.freeze(value);
}
