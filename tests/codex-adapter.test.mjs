import { strict as assert } from 'node:assert';
import {
  assertAdapterContractImplementation,
  CODEX_ADAPTER_ID,
  CODEX_EXEC_SANDBOX_MODE,
  CODEX_FORBIDDEN_SANDBOX_ARGS,
  CODEX_RESUME_SANDBOX_ARGS,
  createCodexAdapter,
  parseCodexSessionId,
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
const identityInvocation = (command, args) => ({ command, args });

const adapter = createCodexAdapter({
  version: '0.2.0',
  resolveInvocation: identityInvocation,
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

const fallbackCalls = [];
const fallbackHealth = await createCodexAdapter({
  resolveInvocation: identityInvocation,
  processManager: createFakeProcessManager(),
  runCommand(command, args) {
    fallbackCalls.push(args.join(' '));
    if (args.join(' ') === '--version') return { status: 0, stdout: 'codex current', stderr: '' };
    if (args.join(' ') === 'auth status') return { status: 2, stdout: '', stderr: "error: unrecognized subcommand 'auth'" };
    if (args.join(' ') === 'login status') return { status: 0, stdout: 'Logged in', stderr: '' };
    return { status: 1, stdout: '', stderr: 'unexpected' };
  }
}).health();
assert.equal(fallbackHealth.outcome, 'success');
assert.deepEqual(fallbackCalls, ['--version', 'auth status', 'login status']);

const capabilities = await adapter.capabilities();
assert.equal(capabilities.data.capabilities.includes('debugging'), true);
assert.equal(capabilities.data.constraints.includes('no-automatic-merge'), true);

const start = await adapter.start({ attemptId: 'codex-start-1', cwd: '/tmp/worktree', args: ['--sandbox', 'workspace-write'] });
assert.equal(start.outcome, 'success');
assert.equal(start.data.attempt.command, 'codex');
assert.deepEqual(start.data.attempt.args, ['--sandbox', 'workspace-write']);

const delivery = await adapter.deliverTask({ attemptId: 'codex-task-1', prompt: 'Edit README', cwd: '/tmp/worktree' });
assert.equal(delivery.outcome, 'success');
// `codex exec` defaults to a read-only sandbox: without this flag the agent is refused every
// write and still exits 0, which is exactly the verified no-op. Runs are confined to an isolated
// Git worktree, so workspace-write is the correct scope.
assert.deepEqual(delivery.data.attempt.args, ['exec', '--sandbox', 'workspace-write', 'Edit README']);
assert.equal(CODEX_EXEC_SANDBOX_MODE, 'workspace-write');
const deliveredArgs = delivery.data.attempt.args.join(' ');
for (const forbidden of CODEX_FORBIDDEN_SANDBOX_ARGS) {
  assert.equal(deliveredArgs.includes(forbidden), false, `Codex must not be invoked with ${forbidden}`);
}
assert.equal(deliveredArgs.includes('--full-auto'), false);
assert.equal(delivery.data.attempt.cwd, '/tmp/worktree', 'execution stays scoped to the run worktree');

// A follow-up message must continue the same session, or every turn starts with no memory of the
// previous one. `exec resume` has no `--sandbox` flag, so the mode is restated as a config
// override; without it the resumed turn silently falls back to the read-only default.
const resumed = await adapter.deliverTask({
  attemptId: 'codex-task-2',
  prompt: 'And now the second turn',
  cwd: '/tmp/worktree',
  sessionId: '019fae42-e725-7481-9540-06a16fb58612'
});
assert.equal(resumed.outcome, 'success');
assert.deepEqual(resumed.data.attempt.args, [
  'exec',
  'resume',
  '019fae42-e725-7481-9540-06a16fb58612',
  '-c',
  'sandbox_mode=workspace-write',
  'And now the second turn'
]);
assert.deepEqual(CODEX_RESUME_SANDBOX_ARGS, ['-c', 'sandbox_mode=workspace-write']);
const resumedArgs = resumed.data.attempt.args.join(' ');
assert.equal(resumedArgs.includes('--sandbox'), false, 'exec resume rejects the --sandbox flag');
for (const forbidden of CODEX_FORBIDDEN_SANDBOX_ARGS) {
  assert.equal(resumedArgs.includes(forbidden), false, `resumed Codex must not be invoked with ${forbidden}`);
}

// The session id is read back out of the CLI's own run header, which is ANSI-bold.
const esc = String.fromCharCode(27);
const header = [
  'OpenAI Codex v0.145.0',
  '--------',
  `${esc}[1mworkdir:${esc}[0m C:\\tmp\\worktree`,
  `${esc}[1msandbox:${esc}[0m workspace-write [workdir]`,
  `${esc}[1msession id:${esc}[0m 019fae44-6399-7c92-b146-baa0bfd7650d`,
  '--------'
].join('\n');
assert.equal(parseCodexSessionId(header), '019fae44-6399-7c92-b146-baa0bfd7650d');
assert.equal(parseCodexSessionId('session id: 019fae44-6399-7c92-b146-baa0bfd7650d'), '019fae44-6399-7c92-b146-baa0bfd7650d');
assert.equal(parseCodexSessionId('no session here'), null);
assert.equal(parseCodexSessionId(null), null);
assert.equal(adapter.parseSessionId(header), '019fae44-6399-7c92-b146-baa0bfd7650d');

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
  resolveInvocation: identityInvocation,
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


