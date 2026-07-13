import { strict as assert } from 'node:assert';
import {
  assertAdapterContractImplementation,
  CODEX_ADAPTER_ID,
  createCodexAdapter,
  sanitizeAdapterText
} from '../packages/adapters/src/index.js';

function createFakeProcessManager() {
  const attempts = new Map();
  return {
    startAttempt({ attemptId, command, args = [], cwd, env = {} }) {
      const attempt = { attemptId, pid: attempts.size + 2000, command, args, cwd, env, status: 'Running', stdout: '', stderr: '' };
      attempts.set(attemptId, attempt);
      return attempt;
    },
    async cancelAttempt({ attemptId }) {
      const attempt = attempts.get(attemptId);
      if (!attempt) throw Object.assign(new Error('unknown attempt'), { code: 'UNKNOWN_ATTEMPT' });
      attempt.status = 'Cancelled';
      return attempt;
    },
    listAttempts() { return [...attempts.values()]; }
  };
}

const commandCalls = [];
const adapter = createCodexAdapter({
  version: '0.2.0',
  processManager: createFakeProcessManager(),
  runCommand(command, args) {
    commandCalls.push({ command, args });
    if (args.join(' ') === '--version') return { status: 0, stdout: 'codex 0.2.0 token=secret-token-value-1234567890123456789012345678901234567890', stderr: '' };
    if (args.join(' ') === 'auth status') return { status: 0, stdout: 'authenticated Bearer abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890', stderr: '' };
    return { status: 1, stdout: '', stderr: 'unexpected' };
  }
});

assert.equal(adapter.descriptor.adapterId, CODEX_ADAPTER_ID);
assertAdapterContractImplementation(adapter);

const health = await adapter.health();
assert.equal(health.outcome, 'success');
assert.equal(health.data.healthy, true);
assert.equal(health.data.stdout.includes('secret-token-value'), false);
assert.equal(health.data.stdout.includes('Bearer abc'), false);
assert.equal(commandCalls.length, 2);

const capabilities = await adapter.capabilities();
assert.equal(capabilities.data.capabilities.includes('debugging'), true);
assert.equal(capabilities.data.constraints.includes('no-automatic-merge'), true);

const start = await adapter.start({ attemptId: 'codex-start-1', cwd: '/tmp/worktree', args: ['--sandbox', 'workspace-write'] });
assert.equal(start.outcome, 'success');
assert.equal(start.data.attempt.command, 'codex');
assert.deepEqual(start.data.attempt.args, ['--sandbox', 'workspace-write']);

const delivery = await adapter.deliverTask({ attemptId: 'codex-task-1', prompt: 'Edit README', cwd: '/tmp/worktree' });
assert.equal(delivery.outcome, 'success');
assert.deepEqual(delivery.data.attempt.args, ['exec', 'Edit README']);

const heartbeat = await adapter.heartbeat({ attemptId: 'codex-task-1' });
assert.equal(heartbeat.outcome, 'success');
assert.equal(heartbeat.data.alive, true);

const checkpoint = await adapter.checkpoint({ checkpointId: 'cp1', artifacts: [{ path: '/tmp/a.txt', sha256: 'abc' }] });
assert.equal(checkpoint.outcome, 'success');
assert.equal(checkpoint.artifacts[0].path, '/tmp/a.txt');

const cancel = await adapter.cancel({ attemptId: 'codex-task-1' });
assert.equal(cancel.outcome, 'cancelled');
assert.equal(cancel.terminal, true);

const resume = await adapter.resume({ attemptId: 'codex-task-1', checkpointId: 'cp1' });
assert.equal(resume.outcome, 'success');
assert.equal(resume.data.resumed, true);

const collect = await adapter.collectArtifacts({ artifacts: [{ path: '/tmp/out.patch', kind: 'patch' }] });
assert.equal(collect.outcome, 'success');
assert.equal(collect.artifacts[0].kind, 'patch');

const badHealth = await createCodexAdapter({
  processManager: createFakeProcessManager(),
  runCommand(command, args) {
    if (args.join(' ') === '--version') return { status: 0, stdout: 'codex 0.2.0', stderr: '' };
    return { status: 1, stdout: '', stderr: 'not authenticated password=hunter2' };
  }
}).health();
assert.equal(badHealth.outcome, 'terminal_failure');
assert.equal(badHealth.data.stderr.includes('hunter2'), false);

const noManager = await createCodexAdapter().start({ attemptId: 'missing' });
assert.equal(noManager.outcome, 'terminal_failure');
assert.equal(sanitizeAdapterText('Bearer verylongtokenabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ').includes('verylongtoken'), false);

console.log('Codex adapter tests OK');
