import { strict as assert } from 'node:assert';
import {
  ATTEMPT_SUPERVISION_DEFAULTS,
  ATTEMPT_SUPERVISION_STATES,
  AttemptSupervisionError,
  createAttemptSupervisor
} from '../packages/orchestrator/src/index.js';

let clock = 0;
const supervisor = createAttemptSupervisor({ nowMs: () => clock });
assert.equal(ATTEMPT_SUPERVISION_DEFAULTS.heartbeatIntervalMs, 30_000);
assert.equal(ATTEMPT_SUPERVISION_DEFAULTS.unresponsiveAfterMs, 120_000);
assert.equal(ATTEMPT_SUPERVISION_DEFAULTS.failureAfterMs, 300_000);
assert.equal(ATTEMPT_SUPERVISION_DEFAULTS.timeoutAfterMs, 1_800_000);
assert.equal(ATTEMPT_SUPERVISION_STATES.includes('Timeout Decision Required'), true);

const registered = supervisor.registerAttempt({ attemptId: 'attempt-supervised-1' });
assert.equal(registered.state, 'Running');
assert.equal(registered.reason, 'heartbeat-fresh');

clock = 29_999;
assert.equal(supervisor.evaluateAttempt({ attemptId: 'attempt-supervised-1' }).state, 'Running');
clock = 30_000;
const due = supervisor.evaluateAttempt({ attemptId: 'attempt-supervised-1' });
assert.equal(due.state, 'Heartbeat Due');
assert.equal(due.action, 'request-heartbeat');
assert.equal(due.reason, 'heartbeat-due-30s');

clock = 119_999;
assert.equal(supervisor.evaluateAttempt({ attemptId: 'attempt-supervised-1' }).state, 'Heartbeat Due');
clock = 120_000;
const unresponsive = supervisor.evaluateAttempt({ attemptId: 'attempt-supervised-1' });
assert.equal(unresponsive.state, 'Unresponsive');
assert.equal(unresponsive.action, 'mark-unresponsive');
assert.equal(unresponsive.reason, 'heartbeat-missing-120s');

clock = 299_999;
assert.equal(supervisor.evaluateAttempt({ attemptId: 'attempt-supervised-1' }).state, 'Unresponsive');
clock = 300_000;
const failed = supervisor.evaluateAttempt({ attemptId: 'attempt-supervised-1' });
assert.equal(failed.state, 'Failed');
assert.equal(failed.action, 'mark-failed');
assert.equal(failed.reason, 'heartbeat-missing-300s');

clock = 0;
const timeoutSupervisor = createAttemptSupervisor({ nowMs: () => clock });
timeoutSupervisor.registerAttempt({ attemptId: 'attempt-timeout-1' });
for (clock = 30_000; clock < 1_800_000; clock += 30_000) {
  const heartbeat = timeoutSupervisor.recordHeartbeat({ attemptId: 'attempt-timeout-1' });
  assert.notEqual(heartbeat.state, 'Unresponsive');
  assert.notEqual(heartbeat.state, 'Failed');
}
clock = 1_800_000;
const timeout = timeoutSupervisor.evaluateAttempt({ attemptId: 'attempt-timeout-1' });
assert.equal(timeout.state, 'Timeout Decision Required');
assert.equal(timeout.action, 'request-timeout-decision');
assert.equal(timeout.reason, 'attempt-timeout-with-recent-heartbeat');
assert.notEqual(timeout.state, 'Unresponsive');

clock = 1_890_000;
assert.equal(timeoutSupervisor.evaluateAttempt({ attemptId: 'attempt-timeout-1' }).state, 'Unresponsive');
clock = 1_980_000;
assert.equal(timeoutSupervisor.evaluateAttempt({ attemptId: 'attempt-timeout-1' }).state, 'Unresponsive');
clock = 2_100_000;
assert.equal(timeoutSupervisor.evaluateAttempt({ attemptId: 'attempt-timeout-1' }).state, 'Failed');

assert.throws(() => createAttemptSupervisor({ heartbeatIntervalMs: 120_000, unresponsiveAfterMs: 30_000 }), AttemptSupervisionError);
assert.throws(() => supervisor.evaluateAttempt({ attemptId: 'missing' }), AttemptSupervisionError);
assert.equal(supervisor.getEvents().some((event) => event.type === 'attempt.supervision.evaluated'), true);

console.log('Attempt supervision tests OK');
