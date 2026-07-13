import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { createAttemptProcessManager, deriveJobObjectName, ProcessControlError } from '../packages/orchestrator/src/index.js';

const manager = createAttemptProcessManager({ killTimeoutMs: 100 });
assert.equal(deriveJobObjectName('attempt/1'), 'LondiAgentOS-attempt-1');
const attempt = manager.startAttempt({
  attemptId: 'attempt-1',
  command: process.execPath,
  args: ['-e', 'setInterval(() => {}, 1000)']
});
assert.equal(attempt.status, 'Running');
assert.match(attempt.jobObject, /^LondiAgentOS-attempt-1$/);
assert.equal(manager.assertControlledProcess({ attemptId: 'attempt-1', pid: attempt.pid }).controlled, true);
const cancelled = await manager.cancelAttempt({ attemptId: 'attempt-1' });
assert.equal(cancelled.status, 'Cancelled');
assert.notEqual(cancelled.exitedAt, null);
const ps = spawnSync('ps', ['-p', String(attempt.pid)], { encoding: 'utf8' });
assert.equal(ps.stdout.includes(String(attempt.pid)), false);
assert.throws(
  () => manager.assertControlledProcess({ attemptId: 'attempt-1', pid: process.pid }),
  ProcessControlError
);
assert.equal(manager.getEvents().some((event) => event.type === 'process.control.blocked'), true);
await assert.rejects(
  () => manager.cancelAttempt({ attemptId: 'unknown-attempt' }),
  ProcessControlError
);
console.log('Process manager tests OK');
