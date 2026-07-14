import { strict as assert } from 'node:assert';
import {
  EXTERNAL_EFFECT_STATES,
  NETWORK_GRANT_TTL_MINUTES,
  NetworkGrantError,
  assertNetworkAllowed,
  assertReplayAllowedForExternalEffect,
  classifyExternalEffect,
  createNetworkAllowlist,
  createNetworkApprovalPayload,
  createNetworkGrant,
  expireNetworkGrant,
  recordNetworkAttempt,
  revokeNetworkGrant
} from '../packages/orchestrator/src/index.js';

const grant = createNetworkGrant({
  id: 'net-1',
  hostname: 'API.GitHub.com',
  purpose: 'create-pr',
  runId: 'run-1',
  stepId: 'step-1',
  agentId: 'agent-1',
  approvedAt: '2026-01-01T00:00:00.000Z'
});
assert.equal(NETWORK_GRANT_TTL_MINUTES, 30);
assert.deepEqual(EXTERNAL_EFFECT_STATES, ['None', 'Known', 'Unknown']);
assert.equal(grant.hostname, 'api.github.com');
assert.equal(grant.expiresAt, '2026-01-01T00:30:00.000Z');

const allowlist = createNetworkAllowlist({ grants: [grant] });
const allowed = assertNetworkAllowed({ allowlist, hostname: 'api.github.com', purpose: 'create-pr', runId: 'run-1', stepId: 'step-1', agentId: 'agent-1', now: '2026-01-01T00:10:00.000Z' });
assert.equal(allowed.allowed, true);
assert.equal(allowed.grantId, 'net-1');
assert.throws(() => assertNetworkAllowed({ allowlist, hostname: 'evil.example.com', purpose: 'create-pr', runId: 'run-1', stepId: 'step-1', agentId: 'agent-1' }), NetworkGrantError);
assert.throws(() => assertNetworkAllowed({ allowlist, hostname: 'https://api.github.com/path', purpose: 'create-pr', runId: 'run-1', stepId: 'step-1', agentId: 'agent-1' }), NetworkGrantError);
assert.throws(() => assertNetworkAllowed({ allowlist, hostname: 'api.github.com', purpose: 'create-pr', runId: 'run-1', stepId: 'step-1', agentId: 'agent-1', now: '2026-01-01T00:30:01.000Z' }), NetworkGrantError);

assert.equal(classifyExternalEffect({ attempted: false }), 'None');
assert.equal(classifyExternalEffect({ attempted: true, allowed: true, completed: true, verified: true }), 'Known');
assert.equal(classifyExternalEffect({ attempted: true, allowed: false }), 'Unknown');
assert.equal(assertReplayAllowedForExternalEffect('Known'), true);
assert.equal(assertReplayAllowedForExternalEffect('None'), true);
assert.throws(() => assertReplayAllowedForExternalEffect('Unknown'), NetworkGrantError);

const attempt = recordNetworkAttempt({ allowlist, hostname: 'api.github.com', purpose: 'create-pr', runId: 'run-1', stepId: 'step-1', agentId: 'agent-1', completed: true, verified: true, now: '2026-01-01T00:10:00.000Z' });
assert.equal(attempt.externalEffectState, 'Known');
assert.equal(attempt.blocked, false);
const blocked = recordNetworkAttempt({ allowlist, hostname: 'exfil.example.com', purpose: 'upload', runId: 'run-1', stepId: 'step-1', agentId: 'agent-1' });
assert.equal(blocked.allowed, false);
assert.equal(blocked.externalEffectState, 'Unknown');
assert.equal(blocked.blocked, true);

const payload = createNetworkApprovalPayload({ requestedDestinations: [{ hostname: 'api.github.com', purpose: 'create-pr', stepId: 'step-1', durationMinutes: 10 }], grants: [grant], externalActions: [{ hostname: 'api.github.com', purpose: 'create-pr', stepId: 'step-1', effect: 'pull-request' }] });
assert.equal(payload.requestedDestinations[0].hostname, 'api.github.com');
assert.equal(payload.grants[0].id, 'net-1');
assert.equal(payload.externalActions[0].effect, 'pull-request');

assert.equal(revokeNetworkGrant(grant, { revokedAt: '2026-01-01T00:11:00.000Z' }).status, 'revoked');
assert.equal(expireNetworkGrant(grant, { now: '2026-01-01T00:31:00.000Z' }).status, 'expired');
assert.throws(() => createNetworkGrant({ id: 'bad', hostname: 'api.github.com:443', purpose: 'x', runId: 'r', stepId: 's', agentId: 'a' }), NetworkGrantError);
assert.throws(() => createNetworkGrant({ id: 'bad', hostname: 'api.github.com', purpose: 'x', runId: 'r', stepId: 's', agentId: 'a', ttlMinutes: 31 }), NetworkGrantError);

console.log('Network grants tests OK');
