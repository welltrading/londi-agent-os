import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  DirectManualRunExecutionError,
  createDirectManualRunExecutor
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
} finally {
  rmSync(root, { recursive: true, force: true });
}

function manualRun(id) {
  return { id, agentId: 'codex', prompt: 'Update the project safely.', summary: 'Direct manual execution.' };
}

function fakeAdapter({ exitCode = 0, running = false, attempt: providedAttempt = null, writeFileName = null } = {}) {
  const attempt = providedAttempt ?? {
    attemptId: null,
    pid: 1234,
    status: running ? 'Running' : 'Exited',
    exitCode: running ? null : exitCode,
    signal: null
  };
  return {
    async health() { return { outcome: 'success', data: { healthy: true } }; },
    async capabilities() { return { outcome: 'success', data: { capabilities: ['code-editing'] } }; },
    async deliverTask({ attemptId, cwd }) {
      attempt.attemptId = attemptId;
      if (writeFileName) writeFileSync(join(cwd, writeFileName), 'agent produced a real change\n');
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
