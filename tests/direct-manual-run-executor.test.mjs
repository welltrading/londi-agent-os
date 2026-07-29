import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  DIRECT_MANUAL_DIAGNOSTIC_TAIL_BYTES,
  DirectManualRunExecutionError,
  captureDiagnostics,
  createDirectManualRunExecutor,
  createInMemoryWorkspaceLockStore
} from '../packages/orchestrator/src/index.js';

const root = mkdtempSync(join(tmpdir(), 'londi-direct-manual-run-'));
try {
  const repo = join(root, 'repo');
  mkdirSync(repo);
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 'manual-run@example.local']);
  git(repo, ['config', 'user.name', 'Manual Run Harness']);
  writeFileSync(join(repo, 'README.md'), '# Manual run executor\n');
  git(repo, ['add', 'README.md']);
  git(repo, ['commit', '-m', 'init']);

  const noChangeExecutor = createDirectManualRunExecutor({
    dataRoot: join(root, 'no-change-data'),
    settleMs: 0,
    adapterFactories: { codex: () => fakeAdapter({ exitCode: 0 }) }
  });
  await assert.rejects(
    () => noChangeExecutor({
      run: manualRun('run-no-change'),
      input: { targetBranch: 'main' },
      project: { id: 'project-1', rootPath: repo }
    }),
    (error) => {
      assert.equal(error instanceof DirectManualRunExecutionError, true);
      assert.equal(error.message, 'Agent exited successfully but produced no workspace changes.');
      assert.deepEqual(error.details.execution.verification.changedFiles, []);
      return true;
    }
  );

  const successExecutor = createDirectManualRunExecutor({
    dataRoot: join(root, 'success-data'),
    settleMs: 0,
    adapterFactories: { codex: () => fakeAdapter({ exitCode: 0, writeFileName: 'agent-output.txt' }) }
  });
  const success = await successExecutor({
    run: manualRun('run-fast-success'),
    input: { targetBranch: 'main' },
    project: { id: 'project-1', rootPath: repo }
  });
  assert.equal(success.status, 'succeeded');
  assert.equal(success.execution.pipeline, 'direct');
  assert.equal(success.execution.agentId, 'codex');
  assert.equal(success.execution.gateA.state, 'Approved');
  assert.equal(success.execution.workspace.targetBranch, 'main');
  assert.equal(success.execution.workspace.branchName.startsWith('londi/run-'), true);
  assert.equal(success.execution.attempts.execute.exitCode, 0);
  assert.deepEqual(success.execution.verification.changedFiles, [{ status: '??', path: 'agent-output.txt' }]);

  const failureExecutor = createDirectManualRunExecutor({
    dataRoot: join(root, 'failure-data'),
    settleMs: 0,
    adapterFactories: { codex: () => fakeAdapter({ exitCode: 7 }) }
  });
  await assert.rejects(
    () => failureExecutor({
      run: manualRun('run-fast-failure'),
      input: { targetBranch: 'main' },
      project: { id: 'project-1', rootPath: repo }
    }),
    (error) => {
      assert.equal(error instanceof DirectManualRunExecutionError, true);
      assert.equal(error.details.execution.attempts.execute.exitCode, 7);
      return true;
    }
  );

  const runningExecutor = createDirectManualRunExecutor({
    dataRoot: join(root, 'running-data'),
    settleMs: 0,
    adapterFactories: { codex: () => fakeAdapter({ running: true }) }
  });
  const running = await runningExecutor({
    run: manualRun('run-still-running'),
    input: { targetBranch: 'main' },
    project: { id: 'project-1', rootPath: repo }
  });
  assert.equal(running.status, 'running');
  assert.equal(running.execution.attempts.execute.status, 'Running');

  const refreshAttempt = {
    attemptId: 'run-refresh-exited-execute',
    pid: 4321,
    status: 'Running',
    exitCode: null,
    signal: null
  };
  const refreshExecutor = createDirectManualRunExecutor({
    dataRoot: join(root, 'refresh-data'),
    settleMs: 0,
    adapterFactories: { codex: () => fakeAdapter({ attempt: refreshAttempt, writeFileName: 'refresh-output.txt' }) }
  });
  const refreshRun = await refreshExecutor({
    run: manualRun('run-refresh-exited'),
    input: { targetBranch: 'main' },
    project: { id: 'project-1', rootPath: repo }
  });
  assert.equal(refreshRun.status, 'running');
  refreshAttempt.status = 'Exited';
  refreshAttempt.exitCode = 0;
  const refreshResult = await refreshExecutor.refreshRun({ run: { ...manualRun('run-refresh-exited'), status: 'running', execution: refreshRun.execution } });
  assert.equal(refreshResult.status, 'succeeded');
  assert.equal(refreshResult.execution.attempts.execute.exitCode, 0);
  assert.deepEqual(refreshResult.execution.verification.changedFiles, [{ status: '??', path: 'refresh-output.txt' }]);

  // Regression: after a service restart the attempt is no longer supervised, so heartbeat cannot
  // find it. Previously the run stayed `running` forever; it must now reconcile to a terminal
  // recovery-required state without fabricating success.
  const restartExecutor = createDirectManualRunExecutor({
    dataRoot: join(root, 'restart-data'),
    settleMs: 0,
    adapterFactories: { codex: () => unsupervisedAdapter() }
  });
  const restarted = await restartExecutor.refreshRun({
    run: {
      ...manualRun('run-restart-orphan'),
      status: 'running',
      execution: {
        pipeline: 'direct',
        agentId: 'codex',
        workspace: null,
        attempts: { execute: { attemptId: 'run-restart-orphan-execute', pid: 17628, status: 'Running', exitCode: null } }
      }
    }
  });
  assert.equal(restarted.status, 'failed');
  assert.match(restarted.error, /no longer supervised/);
  assert.equal(restarted.execution.recovery.state, 'Recovery Required');
  assert.equal(restarted.execution.recovery.autoResume, false);
  assert.deepEqual(restarted.execution.recovery.actions, ['Resume', 'Replace', 'Stop']);

  // An already-terminal run must not be re-reconciled by a later refresh.
  const terminal = await restartExecutor.refreshRun({
    run: { ...manualRun('run-restart-orphan'), status: 'succeeded', execution: { agentId: 'codex', attempts: { execute: { attemptId: 'run-restart-orphan-execute' } } } }
  });
  assert.equal(terminal.status, 'succeeded');

  // Terminal states release the workspace lock so the next run on the same branch is not blocked.
  const lockStore = createInMemoryWorkspaceLockStore();
  const lockExecutor = createDirectManualRunExecutor({
    dataRoot: join(root, 'lock-data'),
    settleMs: 0,
    lockStore,
    adapterFactories: { codex: () => fakeAdapter({ exitCode: 0, writeFileName: 'locked-output.txt' }) }
  });
  const lockedSuccess = await lockExecutor({ run: manualRun('run-lock-1'), input: { targetBranch: 'main' }, project: { id: 'project-1', rootPath: repo } });
  assert.equal(lockedSuccess.status, 'succeeded');
  assert.equal(lockedSuccess.execution.workspaceRelease.lockReleased, true);
  assert.equal(lockedSuccess.execution.workspaceRelease.retained, true, 'successful work must be retained for manual merge');
  assert.equal(lockStore.list().length, 0);
  const lockedSecond = await lockExecutor({ run: manualRun('run-lock-2'), input: { targetBranch: 'main' }, project: { id: 'project-1', rootPath: repo } });
  assert.equal(lockedSecond.status, 'succeeded');

  // Regression: the verified live no-op. Codex was refused every write by its default read-only
  // sandbox, explained itself on stdout, and exited 0. That must stay a failure, and the reason
  // must survive into the persisted execution metadata instead of being discarded.
  const blockedOutput = 'patch rejected: writing is blocked by read-only sandbox; rejected by user approval settings';
  const blockedExecutor = createDirectManualRunExecutor({
    dataRoot: join(root, 'blocked-data'),
    settleMs: 0,
    adapterFactories: { codex: () => fakeAdapter({ exitCode: 0, stdout: blockedOutput }) }
  });
  await assert.rejects(
    () => blockedExecutor({ run: manualRun('run-blocked'), input: { targetBranch: 'main' }, project: { id: 'project-1', rootPath: repo } }),
    (error) => {
      assert.equal(error instanceof DirectManualRunExecutionError, true);
      assert.match(error.message, /produced no workspace changes/);
      assert.match(error.message, /blocked from writing/);
      assert.equal(error.details.execution.diagnostics.blocked, true);
      assert.match(error.details.execution.diagnostics.stdoutTail, /read-only sandbox/);
      return true;
    }
  );

  // Diagnostics must be bounded and redacted: never a full log, never a credential.
  const secret = `sk-${'a'.repeat(40)}`;
  const noisy = `${'x'.repeat(DIRECT_MANUAL_DIAGNOSTIC_TAIL_BYTES * 3)} Bearer ${'b'.repeat(50)} token=${secret}`;
  const bounded = captureDiagnostics({ stdout: noisy, stderr: '' });
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.stdoutTail.length <= DIRECT_MANUAL_DIAGNOSTIC_TAIL_BYTES, true, 'tail must be bounded');
  assert.equal(bounded.stdoutTail.includes(secret), false, 'secret must be redacted');
  assert.equal(/Bearer\s+b{20,}/.test(bounded.stdoutTail), false, 'bearer token must be redacted');
  assert.equal(bounded.blocked, false);
  assert.equal(captureDiagnostics({ stdout: '', stderr: '' }), null, 'no output means no diagnostics object');
  assert.equal(captureDiagnostics(null), null);
  // Only the two output streams are persisted — never argv or environment.
  const envLeak = captureDiagnostics({ stdout: 'ok', stderr: '', env: { SECRET: 'nope' }, args: ['--token', 'nope'] });
  assert.deepEqual(Object.keys(envLeak).sort(), ['blocked', 'maxBytes', 'stderrTail', 'stdoutTail', 'truncated']);
  assert.equal(JSON.stringify(envLeak).includes('nope'), false);

  // A writable run still produces a verified change, and its diagnostics ride along.
  const writableExecutor = createDirectManualRunExecutor({
    dataRoot: join(root, 'writable-data'),
    settleMs: 0,
    adapterFactories: { codex: () => fakeAdapter({ exitCode: 0, writeFileName: 'written-by-agent.txt', stdout: 'apply patch\npatch: completed' }) }
  });
  const writable = await writableExecutor({ run: manualRun('run-writable'), input: { targetBranch: 'main' }, project: { id: 'project-1', rootPath: repo } });
  assert.equal(writable.status, 'succeeded');
  assert.deepEqual(writable.execution.verification.changedFiles, [{ status: '??', path: 'written-by-agent.txt' }]);
  assert.match(writable.execution.diagnostics.stdoutTail, /patch: completed/);
  assert.equal(writable.execution.diagnostics.blocked, false);

  // A question may succeed with text and no edits; the same no-edit exit under `code-change`
  // must still fail. Intent is explicit, never inferred from the prompt.
  const answerText = 'This repository is a local-first orchestration shell. It coordinates agents over a Local API.';
  const conversationExecutor = createDirectManualRunExecutor({
    dataRoot: join(root, 'conversation-data'),
    settleMs: 0,
    adapterFactories: { codex: () => fakeAdapter({ exitCode: 0, responseText: answerText }) }
  });
  const answered = await conversationExecutor({
    run: manualRun('run-question', 'conversation'),
    input: { targetBranch: 'main' },
    project: { id: 'project-1', rootPath: repo }
  });
  assert.equal(answered.status, 'succeeded', 'a question with no file changes must succeed');
  assert.equal(answered.agentResponse, answerText);
  assert.deepEqual(answered.execution.verification.changedFiles, []);
  assert.equal(answered.execution.intent, 'conversation');
  assert.equal(answered.execution.workspaceRelease.retained, false, 'a pure answer leaves no work to keep');

  await assert.rejects(
    () => createDirectManualRunExecutor({
      dataRoot: join(root, 'code-intent-data'),
      settleMs: 0,
      adapterFactories: { codex: () => fakeAdapter({ exitCode: 0, responseText: answerText }) }
    })({ run: manualRun('run-code-intent', 'code-change'), input: { targetBranch: 'main' }, project: { id: 'project-1', rootPath: repo } }),
    (error) => {
      assert.match(error.message, /produced no workspace changes/);
      assert.equal(error.details.agentResponse, answerText, 'the explanation must survive the failure');
      return true;
    }
  );

  // The response comes from the adapter's response file, not from raw diagnostics.
  const bothExecutor = createDirectManualRunExecutor({
    dataRoot: join(root, 'both-data'),
    settleMs: 0,
    adapterFactories: { codex: () => fakeAdapter({ exitCode: 0, writeFileName: 'created.txt', responseText: 'Created created.txt as requested.', stdout: 'exec noise\napply patch\npatch: completed' }) }
  });
  const both = await bothExecutor({ run: manualRun('run-both', 'code-change'), input: { targetBranch: 'main' }, project: { id: 'project-1', rootPath: repo } });
  assert.equal(both.status, 'succeeded');
  assert.equal(both.agentResponse, 'Created created.txt as requested.');
  assert.deepEqual(both.execution.verification.changedFiles, [{ status: '??', path: 'created.txt' }]);
  assert.equal(both.execution.diagnostics.stdoutTail.includes('exec noise'), true, 'raw transcript stays in diagnostics');
  assert.equal(both.agentResponse.includes('exec noise'), false, 'diagnostics never leak into the response');

  // Regression: `git status` porcelain lines are fixed-width, so a modified tracked file must not
  // lose the first character of its path (` M README.md` -> `EADME.md`).
  const modifyExecutor = createDirectManualRunExecutor({
    dataRoot: join(root, 'modify-data'),
    settleMs: 0,
    adapterFactories: { codex: () => fakeAdapter({ exitCode: 0, modifyFileName: 'README.md' }) }
  });
  const modified = await modifyExecutor({ run: manualRun('run-modify'), input: { targetBranch: 'main' }, project: { id: 'project-1', rootPath: repo } });
  assert.deepEqual(modified.execution.verification.changedFiles, [{ status: 'M', path: 'README.md' }]);
  // Thread continuity: the first message opens a session and the id must come back so the next
  // message can continue it. Without this every turn starts with no memory of the previous one.
  const firstTurnCalls = [];
  const firstTurnExecutor = createDirectManualRunExecutor({
    dataRoot: join(root, 'thread-data'),
    settleMs: 0,
    adapterFactories: {
      codex: () => fakeAdapter({ exitCode: 0, reportsSessions: true, sessionId: '019fae42-e725-7481-9540-06a16fb58612', received: firstTurnCalls, responseText: 'Opened the thread.' })
    }
  });
  const firstTurn = await firstTurnExecutor({
    run: manualRun('run-thread-1', 'conversation'),
    input: { targetBranch: 'main' },
    project: { id: 'project-1', rootPath: repo }
  });
  assert.equal(firstTurn.status, 'succeeded');
  assert.deepEqual(firstTurnCalls, [null], 'the first message of a conversation has no session to resume');
  assert.equal(firstTurn.sessionId, '019fae42-e725-7481-9540-06a16fb58612', 'the opened session id must be reported back');

  const secondTurnCalls = [];
  const secondTurnExecutor = createDirectManualRunExecutor({
    dataRoot: join(root, 'thread-data'),
    settleMs: 0,
    adapterFactories: {
      codex: () => fakeAdapter({ exitCode: 0, reportsSessions: true, sessionId: '019fae42-e725-7481-9540-06a16fb58612', received: secondTurnCalls, responseText: 'Continued the thread.' })
    }
  });
  const secondTurn = await secondTurnExecutor({
    run: manualRun('run-thread-2', 'conversation'),
    input: { targetBranch: 'main', sessionId: '019fae42-e725-7481-9540-06a16fb58612' },
    project: { id: 'project-1', rootPath: repo }
  });
  assert.deepEqual(secondTurnCalls, ['019fae42-e725-7481-9540-06a16fb58612'], 'the follow-up must resume the same session');
  assert.equal(secondTurn.sessionId, '019fae42-e725-7481-9540-06a16fb58612');

  // A malformed id is dropped rather than replayed into a CLI argument.
  const rejectedCalls = [];
  const rejectedExecutor = createDirectManualRunExecutor({
    dataRoot: join(root, 'thread-data'),
    settleMs: 0,
    adapterFactories: { codex: () => fakeAdapter({ exitCode: 0, reportsSessions: true, received: rejectedCalls, responseText: 'Fresh start.' }) }
  });
  const rejected = await rejectedExecutor({
    run: manualRun('run-thread-3', 'conversation'),
    input: { targetBranch: 'main', sessionId: '--dangerously-bypass-approvals-and-sandbox' },
    project: { id: 'project-1', rootPath: repo }
  });
  assert.deepEqual(rejectedCalls, [null], 'an unrecognizable session id must never reach the CLI');
  assert.equal(rejected.sessionId, null);

  // Adapters whose CLI has no session concept must still execute normally.
  const noSessionExecutor = createDirectManualRunExecutor({
    dataRoot: join(root, 'thread-data'),
    settleMs: 0,
    adapterFactories: { codex: () => fakeAdapter({ exitCode: 0, responseText: 'No sessions here.' }) }
  });
  const noSession = await noSessionExecutor({
    run: manualRun('run-thread-4', 'conversation'),
    input: { targetBranch: 'main' },
    project: { id: 'project-1', rootPath: repo }
  });
  assert.equal(noSession.status, 'succeeded');
  assert.equal(noSession.sessionId, null);
} finally {
  rmSync(root, { recursive: true, force: true });
}

function manualRun(id, intent = 'code-change') {
  return { id, agentId: 'codex', intent, prompt: 'Update the project safely.', summary: 'Direct manual execution.' };
}

function unsupervisedAdapter() {
  return {
    async health() { return { outcome: 'success', data: { healthy: true } }; },
    async capabilities() { return { outcome: 'success', data: { capabilities: ['code-editing'] } }; },
    async deliverTask() { return { outcome: 'success', data: { attempt: null } }; },
    // Matches the real adapter behaviour when the process manager has no record of the attempt.
    async heartbeat() { return { outcome: 'unknown', data: { alive: false, reason: 'attempt-not-found' } }; }
  };
}

function fakeAdapter({ exitCode = 0, running = false, attempt: providedAttempt = null, writeFileName = null, modifyFileName = null, stdout = '', stderr = '', responseText = null, sessionId = null, reportsSessions = false, received = [] } = {}) {
  const attempt = providedAttempt ?? {
    attemptId: null,
    pid: 1234,
    status: running ? 'Running' : 'Exited',
    exitCode: running ? null : exitCode,
    signal: null,
    stdout,
    stderr
  };
  return {
    async health() { return { outcome: 'success', data: { healthy: true } }; },
    async capabilities() { return { outcome: 'success', data: { capabilities: ['code-editing'] } }; },
    // Only adapters whose CLI reports a session expose this; the executor must tolerate its absence.
    ...(reportsSessions ? { parseSessionId: (text) => /session id:\s*(\S+)/.exec(String(text ?? ''))?.[1] ?? null } : {}),
    async deliverTask({ attemptId, cwd, responseFile, sessionId: requested = null }) {
      received.push(requested);
      attempt.attemptId = attemptId;
      // Codex prints its run header to stderr when it is not attached to a terminal, which is
      // always the case under the process manager.
      if (sessionId) attempt.stderr = `OpenAI Codex v0.145.0\nsession id: ${sessionId}\n${stderr}`;
      if (writeFileName) writeFileSync(join(cwd, writeFileName), 'agent produced a real change\n');
      if (modifyFileName) writeFileSync(join(cwd, modifyFileName), '# Manual run executor\n\nmodified by the agent\n');
      // Mirrors `codex exec --output-last-message`: the CLI writes its final message to this file.
      if (responseText && responseFile) writeFileSync(responseFile, `${responseText}\n`, 'utf8');
      return { outcome: 'success', data: { attempt: { ...attempt } } };
    },
    async heartbeat() { return { outcome: 'success', data: { alive: running, attempt: { ...attempt } } }; }
  };
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
}

console.log('Direct manual run executor tests OK');
