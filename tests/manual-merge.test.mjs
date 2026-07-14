import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  MANUAL_MERGE_GATE_ID,
  ManualMergeError,
  assertNoAutomaticMergeCommand,
  createManualMergeGate,
  verifyManualMerge
} from '../packages/orchestrator/src/index.js';

const root = mkdtempSync(join(tmpdir(), 'londi-manual-merge-'));
try {
  const repo = join(root, 'repo');
  mkdirSync(repo);
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 'test@example.local']);
  git(repo, ['config', 'user.name', 'Londi Test']);
  writeFileSync(join(repo, 'README.md'), '# Base\n');
  git(repo, ['add', 'README.md']);
  git(repo, ['commit', '-m', 'init']);
  git(repo, ['checkout', '-b', 'londi/run-1']);
  writeFileSync(join(repo, 'feature.txt'), 'agent output\n');
  git(repo, ['add', 'feature.txt']);
  git(repo, ['commit', '-m', 'agent output']);
  git(repo, ['checkout', 'main']);

  const acceptedSnapshot = { snapshotHash: 'accepted-hash' };
  const gate = createManualMergeGate({ runId: 'run-1', acceptedSnapshot, repositoryPath: repo, targetBranch: 'main', runBranch: 'londi/run-1' });
  assert.equal(gate.gate, MANUAL_MERGE_GATE_ID);
  assert.equal(gate.automaticMerge, false);
  assert.equal(gate.commandToRun, null);
  assert.equal(gate.status, 'Pending Manual Merge');
  assert.equal(gate.instructions.some((line) => /git merge/i.test(line)), false);
  assert.throws(() => assertNoAutomaticMergeCommand('git merge londi/run-1'), ManualMergeError);

  const preMergeHead = git(repo, ['rev-parse', 'main']).stdout.trim();
  const missing = verifyManualMerge({ gate, targetCommit: preMergeHead });
  assert.equal(missing.status, 'Needs Attention');
  assert.equal(missing.reason, 'containment-failed');

  git(repo, ['merge', '--no-ff', 'londi/run-1', '-m', 'manual merge outside app']);
  const targetCommit = git(repo, ['rev-parse', 'main']).stdout.trim();
  const verified = verifyManualMerge({ gate, targetCommit, testCommand: { command: 'git', args: ['status', '--short'] } });
  assert.equal(verified.status, 'Verified');
  assert.equal(verified.targetCommit, targetCommit);
  assert.equal(verified.nextRunState, 'Completed');
  assert.equal(verified.containmentVerified, true);

  const drift = verifyManualMerge({ gate, targetCommit: '0000000000000000000000000000000000000000' });
  assert.equal(drift.status, 'Needs Attention');
  assert.equal(drift.reason, 'drift');

  const testFailure = verifyManualMerge({ gate, targetCommit, testCommand: { command: 'node', args: ['-e', 'process.exit(7)'] } });
  assert.equal(testFailure.status, 'Needs Attention');
  assert.equal(testFailure.reason, 'test-failure');

  assert.throws(() => createManualMergeGate({ runId: 'run-2', acceptedSnapshot, repositoryPath: repo, targetBranch: 'main', runBranch: 'londi/run-1', instructions: ['git merge londi/run-1'] }), ManualMergeError);
} finally {
  rmSync(root, { recursive: true, force: true });
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result;
}

console.log('Manual merge tests OK');
