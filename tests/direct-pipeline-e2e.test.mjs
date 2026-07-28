import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getPipelineTemplate } from '../packages/contracts/src/index.js';
import { createClaudeCodeAdapter } from '../packages/adapters/src/index.js';
import {
  completeRunAfterGateF,
  createAcceptanceGate,
  createAcceptanceSnapshot,
  createArtifactLayout,
  createArtifactManifest,
  createInMemoryWorkspaceLockStore,
  createManualMergeGate,
  createPipelineApprovalGate,
  createRetentionTrigger,
  createRunWorkspace,
  createWorkspaceAcceptanceSnapshot,
  decideAcceptanceGate,
  decidePipelineApprovalGate,
  hashApprovalPayload,
  verifyManualMerge,
  writeArtifactRecord
} from '../packages/orchestrator/src/index.js';

const root = mkdtempSync(join(tmpdir(), 'londi-direct-pipeline-e2e-'));
try {
  const repo = join(root, 'repo');
  mkdirSync(repo);
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 'direct-e2e@example.local']);
  git(repo, ['config', 'user.name', 'Direct E2E Harness']);
  writeFileSync(join(repo, 'README.md'), '# Direct E2E base\n');
  git(repo, ['add', 'README.md']);
  git(repo, ['commit', '-m', 'init']);

  const runId = 'direct-e2e-run';
  const dataRoot = join(root, 'data');
  const workspace = createRunWorkspace({ repositoryPath: repo, targetBranch: 'main', runId, dataRoot, lockStore: createInMemoryWorkspaceLockStore() });
  assert.match(workspace.baseCommit, /^[0-9a-f]{40}$/);
  assert.equal(workspace.branchName, 'londi/run-direct-e2e-run');

  const gateA = createPipelineApprovalGate({
    id: `gate-a-${runId}`,
    runId,
    template: getPipelineTemplate('direct'),
    assignments: { executor: 'claude-code' },
    context: { task: 'Create an agent output file', projectPath: 'repo', obsidianSnapshot: null },
    preflight: { status: 'Ready', warnings: [] },
    permissions: { filesystem: 'workspace-write', commands: ['internal direct e2e assertions'] },
    network: { mode: 'none', allowedHosts: [] },
    secretAliases: [],
    revisionHash: workspace.baseCommit,
    requestedAt: '2026-07-20T00:00:00.000Z'
  });
  const gateADecision = decidePipelineApprovalGate(gateA, {
    actor: 'londi',
    decision: 'approve',
    payloadHash: gateA.payloadHash,
    revisionHash: gateA.revisionHash,
    timestamp: '2026-07-20T00:01:00.000Z'
  });
  assert.equal(gateADecision.state, 'Approved');

  const adapter = createClaudeCodeAdapter({
    version: 'direct-e2e',
    processManager: createFakeProcessManager(),
    runCommand(command, args) {
      if (args.join(' ') === '--version') return { status: 0, stdout: `${command} direct-e2e`, stderr: '' };
      if (args.join(' ') === 'auth status') return { status: 0, stdout: 'authenticated', stderr: '' };
      return { status: 0, stdout: '', stderr: '' };
    }
  });

  assert.equal((await adapter.health()).outcome, 'success');
  assert.equal((await adapter.capabilities()).data.capabilities.includes('code-editing'), true);
  const start = await adapter.start({ attemptId: `${runId}-start`, cwd: workspace.worktreePath });
  assert.equal(start.outcome, 'success');
  assert.equal(start.data.attempt.cwd, workspace.worktreePath);
  const delivery = await adapter.deliverTask({ attemptId: `${runId}-execute`, prompt: 'Create agent-output.txt', cwd: workspace.worktreePath });
  assert.equal(delivery.outcome, 'success');
  assert.equal(delivery.data.attempt.command, 'claude');
  assert.equal((await adapter.heartbeat({ attemptId: `${runId}-execute` })).data.alive, true);

  writeFileSync(join(workspace.worktreePath, 'agent-output.txt'), 'direct pipeline e2e output\n');
  git(workspace.worktreePath, ['add', 'agent-output.txt']);
  git(workspace.worktreePath, ['commit', '-m', 'direct pipeline agent output']);

  const artifactsRoot = join(dataRoot, 'runs', runId, 'artifacts');
  const workspaceSnapshot = createWorkspaceAcceptanceSnapshot({ worktreePath: workspace.worktreePath, baseCommit: workspace.baseCommit, artifactsPath: artifactsRoot, snapshotId: 'direct-e2e' });
  assert.equal(readFileSync(workspaceSnapshot.diffPath, 'utf8').includes('direct pipeline e2e output'), true);

  const layout = createArtifactLayout({ runId, artifactsRoot, createdAt: '2026-07-20T00:05:00.000Z' });
  const summaryRecord = writeArtifactRecord({
    layout,
    category: 'summary',
    filename: 'direct-e2e-summary.md',
    content: '# Direct Pipeline E2E\n\nAgent boundary, Git worktree, artifacts, acceptance, manual merge, and completion verified.\n',
    metadata: { kind: 'summary' }
  });
  const collected = await adapter.collectArtifacts({ artifacts: [{ path: summaryRecord.path, kind: 'summary', sha256: summaryRecord.hash, sizeBytes: summaryRecord.size }] });
  assert.equal(collected.outcome, 'success');
  const checkpoint = await adapter.checkpoint({ checkpointId: `${runId}-checkpoint`, artifacts: collected.artifacts });
  assert.equal(checkpoint.outcome, 'success');

  const manifest = createArtifactManifest({ layout, records: [summaryRecord], revisions: { handoff: [] }, createdAt: '2026-07-20T00:06:00.000Z' });
  const gateESnapshot = createAcceptanceSnapshot({
    runId,
    createdAt: '2026-07-20T00:07:00.000Z',
    diff: { summary: `${workspaceSnapshot.committedDiffEntries.length} committed file(s) changed`, patchHash: 'workspace-diff-recorded', diffPath: workspaceSnapshot.diffPath },
    tests: { status: 'passed', commands: ['direct-pipeline-e2e internal assertions'] },
    review: { decision: 'not-required', pipeline: 'direct' },
    risks: { items: ['manual merge still required before completion'] },
    artifacts: { manifestHash: manifest.manifestHash, records: manifest.records.length }
  });
  const gateE = createAcceptanceGate({ id: `gate-e-${runId}`, runId, snapshot: gateESnapshot, requestedAt: '2026-07-20T00:08:00.000Z' });
  const gateEDecision = decideAcceptanceGate(gateE, {
    actor: 'londi',
    decision: 'accept',
    payloadHash: gateE.payloadHash,
    revisionHash: gateE.revisionHash,
    timestamp: '2026-07-20T00:09:00.000Z'
  });
  assert.equal(gateEDecision.targetRunState, 'Accepted');

  const acceptedRun = { runId, state: 'Accepted', acceptedAt: '2026-07-20T00:09:00.000Z', branchName: workspace.branchName, worktreePath: workspace.worktreePath };
  assert.equal(createRetentionTrigger({ run: acceptedRun }).eligible, false);

  const gateF = createManualMergeGate({ runId, acceptedSnapshot: gateESnapshot, repositoryPath: repo, targetBranch: 'main', runBranch: workspace.branchName });
  assert.equal(gateF.automaticMerge, false);
  git(repo, ['merge', '--no-ff', workspace.branchName, '-m', `manual direct e2e merge ${runId}`]);
  const targetCommit = git(repo, ['rev-parse', 'main']).stdout.trim();
  const gateFResult = verifyManualMerge({ gate: gateF, targetCommit, testCommand: { command: 'git', args: ['status', '--short'] } });
  assert.equal(gateFResult.status, 'Verified');

  const completed = completeRunAfterGateF({ run: acceptedRun, gateFResult, completedAt: '2026-07-20T00:12:00.000Z' });
  assert.equal(completed.state, 'Completed');
  assert.equal(createRetentionTrigger({ run: completed }).retentionStarted, true);
} finally {
  rmSync(root, { recursive: true, force: true });
}

function createFakeProcessManager() {
  const attempts = new Map();
  return {
    startAttempt({ attemptId, command, args = [], cwd, env = {} }) {
      const attempt = { attemptId, pid: attempts.size + 5000, command, args, cwd, env, status: 'Running' };
      attempts.set(attemptId, attempt);
      return attempt;
    },
    async cancelAttempt({ attemptId }) {
      const attempt = attempts.get(attemptId);
      if (!attempt) throw new Error('unknown attempt');
      attempt.status = 'Cancelled';
      return attempt;
    },
    listAttempts() {
      return [...attempts.values()];
    }
  };
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result;
}

console.log('Direct pipeline E2E tests OK');
