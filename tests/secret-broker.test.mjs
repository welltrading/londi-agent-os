import { strict as assert } from 'node:assert';
import {
  SECRET_GRANT_TTL_MINUTES,
  SECRET_VALUE_PLACEHOLDER,
  SecretBrokerError,
  assertGrantValid,
  assertSecretNotPersisted,
  createGrantCleanup,
  createInMemoryCredentialManager,
  expireSecretGrant,
  injectGrantedSecret,
  issueSecretGrant,
  redactGrantForAudit,
  revokeSecretGrant
} from '../packages/orchestrator/src/index.js';

const manager = createInMemoryCredentialManager({ OPENAI_API_KEY: 'sk-test-short' });
assert.equal(manager.describe().containsValues, false);
assert.equal(manager.describe().aliases.includes('OPENAI_API_KEY'), true);

const grant = issueSecretGrant({
  credentialManager: manager,
  approvedAliases: ['OPENAI_API_KEY'],
  alias: 'OPENAI_API_KEY',
  runId: 'run-1',
  stepId: 'step-1',
  agentId: 'agent-1',
  id: 'grant-1',
  issuedAt: '2026-01-01T00:00:00.000Z'
});
assert.equal(SECRET_GRANT_TTL_MINUTES, 30);
assert.equal(grant.expiresAt, '2026-01-01T00:30:00.000Z');
assert.equal(assertGrantValid(grant, { runId: 'run-1', stepId: 'step-1', agentId: 'agent-1', alias: 'OPENAI_API_KEY', now: '2026-01-01T00:29:59.000Z' }), true);

const injection = injectGrantedSecret({ credentialManager: manager, grant, env: { SAFE: '1' }, now: '2026-01-01T00:10:00.000Z' });
assert.equal(injection.env.OPENAI_API_KEY, 'sk-test-short');
assert.equal(injection.env.SAFE, '1');
assert.equal(injection.audit.value, SECRET_VALUE_PLACEHOLDER);
assert.equal(JSON.stringify(injection.audit).includes('abcdefghijklmnopqrstuvwxyz1234567890'), false);
assert.equal(injection.cleanup.status, 'revoked');

const cleanup = createGrantCleanup({ grant, cleanedAt: '2026-01-01T00:11:00.000Z' });
assert.equal(cleanup.status, 'revoked');
assert.equal(cleanup.reason, 'step-finished');

const revoked = revokeSecretGrant(grant, { revokedAt: '2026-01-01T00:12:00.000Z' });
assert.equal(revoked.status, 'revoked');
assert.throws(() => assertGrantValid(revoked, { now: '2026-01-01T00:12:01.000Z' }), SecretBrokerError);

const expired = expireSecretGrant(grant, { now: '2026-01-01T00:31:00.000Z' });
assert.equal(expired.status, 'expired');
assert.throws(() => injectGrantedSecret({ credentialManager: manager, grant, now: '2026-01-01T00:30:01.000Z' }), SecretBrokerError);
assert.throws(() => issueSecretGrant({ credentialManager: manager, approvedAliases: [], alias: 'OPENAI_API_KEY', runId: 'run-1', stepId: 'step-1', agentId: 'agent-1' }), SecretBrokerError);
assert.throws(() => issueSecretGrant({ credentialManager: manager, approvedAliases: ['MISSING_SECRET'], alias: 'MISSING_SECRET', runId: 'run-1', stepId: 'step-1', agentId: 'agent-1' }), SecretBrokerError);
assert.equal(assertSecretNotPersisted(redactGrantForAudit(grant)), true);
assert.throws(() => assertSecretNotPersisted({ value: 'Bearer abcdefghijklmnopqrstuvwxyz1234567890' }), SecretBrokerError);
assert.throws(() => issueSecretGrant({ credentialManager: manager, approvedAliases: ['bad'], alias: 'bad', runId: 'run-1', stepId: 'step-1', agentId: 'agent-1' }), SecretBrokerError);

console.log('Secret broker tests OK');
