import { strict as assert } from 'node:assert';
import {
  TECHNICAL_RETRY_LIMIT,
  TechnicalRetryError,
  assertReplacementContextSafe,
  createAgentReplacementPlan,
  createReconnectPlan,
  createRetryDecision
} from '../packages/orchestrator/src/index.js';

const recoveryReport = Object.freeze({
  autoResume: false,
  actions: Object.freeze({
    Resume: Object.freeze({ enabled: true }),
    Replace: Object.freeze({ enabled: true }),
    Stop: Object.freeze({ enabled: true })
  })
});
const previousAttempt = { attemptId: 'attempt-1', adapterId: 'claude-code', state: 'Failed', checkpointId: 'chk-1', rawConversation: 'must-not-copy' };

assert.equal(TECHNICAL_RETRY_LIMIT, 1);
const retry = createRetryDecision({
  runId: 'run-retry',
  previousAttempt,
  recoveryReport,
  externalEffects: [{ id: 'effect-1', state: 'Known' }],
  reconnectAvailable: true
});
assert.equal(retry.allowed, true);
assert.equal(retry.automatic, true);
assert.equal(retry.retryCountAfter, 1);
assert.equal(retry.previousAttempt.retained, true);
assert.equal(Object.hasOwn(retry.previousAttempt, 'rawConversation'), false);
assert.equal(retry.rawConversationTransferred, false);

const exhausted = createRetryDecision({ runId: 'run-retry', previousAttempt, recoveryReport, retryCount: 1 });
assert.equal(exhausted.allowed, false);
assert.equal(exhausted.reason, 'automatic technical retry already used');
assert.throws(
  () => createRetryDecision({ runId: 'run-retry', previousAttempt, recoveryReport, externalEffects: [{ id: 'effect-unknown', state: 'Unknown' }] }),
  (error) => error.code === 'ERR_NETWORK_GRANT'
);

const reconnect = createReconnectPlan({ runId: 'run-retry', attemptId: 'attempt-1', heartbeatState: 'Unresponsive' });
assert.equal(reconnect.allowed, true);
assert.equal(createReconnectPlan({ runId: 'run-retry', attemptId: 'attempt-1', heartbeatState: 'Running' }).allowed, false);

const replacement = createAgentReplacementPlan({
  runId: 'run-retry',
  previousAttempt,
  recoveryReport,
  currentAdapterId: 'claude-code',
  recommendedAdapters: [
    { adapterId: 'claude-code', eligible: true, score: 120 },
    { adapterId: 'codex', displayName: 'Codex CLI', eligible: true, score: 100 }
  ],
  handoffSummary: 'Safe handoff: objective, files changed, tests run, and next step only.'
});
assert.equal(replacement.replacementAdapterId, 'codex');
assert.equal(replacement.requiresApproval, true);
assert.equal(replacement.rawConversationTransferred, false);
assert.equal(Object.hasOwn(replacement.previousAttempt, 'rawConversation'), false);
assert.equal(assertReplacementContextSafe('Safe concise handoff summary.'), true);
assert.throws(() => assertReplacementContextSafe('raw conversation: user: secret'), TechnicalRetryError);
assert.throws(() => createAgentReplacementPlan({ runId: 'run-retry', previousAttempt, recoveryReport, currentAdapterId: 'claude-code', recommendedAdapters: [{ adapterId: 'claude-code', eligible: true }], handoffSummary: 'Safe handoff.' }), TechnicalRetryError);

console.log('Technical retry tests OK');
