import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  WorkspaceLockConflictError,
  WorkspaceIsolationError,
  assertWorkspaceWriteAllowed,
  classifyWorkspaceValidationError,
  createInMemoryWorkspaceLockStore,
  createRunWorkspace,
  createWorkspaceAcceptanceSnapshot,
  createWorkspaceCleanupPlan,
  executeWorkspaceCleanupPlan,
  getWorkspaceDiff,
  getWorkspaceStatusSummary,
  createServiceAccountIsolationPolicy,
  deriveRunBranchName,
  deriveRunWorktreePath,
  simulateWorkspaceWrite,
  validateGitProject
} from '../packages/orchestrator/src/index.js';

const root = mkdtempSync(join(tmpdir(), 'londi-workspace-manager-'));
try {
  const nonGit = join(root, 'non-git');
  mkdirSync(nonGit);
  assert.equal(validateGitProject({ repositoryPath: nonGit, targetBranch: 'main', runId: 'run-1' }).status, 'Blocked');

  const repo = join(root, 'repo');
  mkdirSync(repo);
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 'test@example.local']);
  git(repo, ['config', 'user.name', 'Londi Test']);
  writeFileSync(join(repo, 'README.md'), '# Test\n');
  git(repo, ['add', 'README.md']);
  git(repo, ['commit', '-m', 'init']);

  const lockStore = createInMemoryWorkspaceLockStore();
  const ready = validateGitProject({ repositoryPath: repo, targetBranch: 'main', runId: 'run-1', lockStore });
  assert.equal(ready.status, 'Ready');
  assert.match(ready.baseCommit, /^[0-9a-f]{40}$/);
  assert.equal(lockStore.list().length, 1);

  assert.throws(
    () => validateGitProject({ repositoryPath: repo, targetBranch: 'main', runId: 'run-2', lockStore }),
    WorkspaceLockConflictError
  );
  assert.equal(classifyWorkspaceValidationError(new WorkspaceLockConflictError('x', { runId: 'run-2' })).status, 'Blocked');

  writeFileSync(join(repo, 'dirty.txt'), 'dirty\n');
  lockStore.release({ repositoryPath: repo, targetBranch: 'main', runId: 'run-1' });
  const warning = validateGitProject({ repositoryPath: repo, targetBranch: 'main', runId: 'run-3', lockStore });
  assert.equal(warning.status, 'Ready with Warnings');
  assert.equal(warning.dirtyEntries.length, 1);
  lockStore.release({ repositoryPath: repo, targetBranch: 'main', runId: 'run-3' });
  const blockedDirty = validateGitProject({ repositoryPath: repo, targetBranch: 'main', runId: 'run-4', lockStore, allowDirty: false });
  assert.equal(blockedDirty.status, 'Blocked');

  assert.equal(validateGitProject({ repositoryPath: repo, targetBranch: 'missing', runId: 'run-5' }).status, 'Blocked');

  git(repo, ['add', 'dirty.txt']);
  git(repo, ['commit', '-m', 'dirty committed']);
  const lifecycleLockStore = createInMemoryWorkspaceLockStore();
  const manifest = createRunWorkspace({ repositoryPath: repo, targetBranch: 'main', runId: 'abcdef1234567890', dataRoot: join(root, 'data'), lockStore: lifecycleLockStore });
  assert.equal(manifest.branchName, 'londi/run-abcdef123456');
  assert.equal(manifest.worktreePath, deriveRunWorktreePath({ dataRoot: join(root, 'data'), runId: 'abcdef1234567890' }));
  assert.equal(deriveRunBranchName('ABCDEF_1234567890'), 'londi/run-abcdef-12345');
  assert.equal(existsSync(manifest.worktreePath), true);
  assert.equal(JSON.parse(readFileSync(join(manifest.worktreePath, 'londi-workspace-manifest.json'), 'utf8')).baseCommit, manifest.baseCommit);
  assert.equal(JSON.parse(readFileSync(join(manifest.worktreePath, 'londi-workspace-manifest.json'), 'utf8')).targetBranch, 'main');
  assert.throws(
    () => createRunWorkspace({ repositoryPath: repo, targetBranch: 'main', runId: 'abcdef1234567890', dataRoot: join(root, 'data') }),
    /already exists|already registered/
  );

  const vaultRoot = join(root, 'vault');
  const systemRoot = join(root, 'system');
  const otherWorktree = join(root, 'data', 'worktrees', 'other-run');
  mkdirSync(vaultRoot);
  mkdirSync(systemRoot);
  mkdirSync(otherWorktree, { recursive: true });
  const isolationPolicy = createServiceAccountIsolationPolicy({
    worktreePath: manifest.worktreePath,
    runArtifactsPath: join(root, 'data', 'runs', manifest.runId),
    deniedRoots: [repo, vaultRoot, systemRoot, otherWorktree]
  });
  assert.equal(isolationPolicy.serviceAccount, 'LondiAgentOSService');
  assert.equal(assertWorkspaceWriteAllowed({ policy: isolationPolicy, targetPath: join(manifest.worktreePath, 'src', 'agent-output.txt') }).allowed, true);
  assert.equal(simulateWorkspaceWrite({ policy: isolationPolicy, targetPath: join(root, 'data', 'runs', manifest.runId, 'summary.md') }).serviceAccount, 'LondiAgentOSService');
  for (const deniedPath of [
    join(repo, 'source-change.txt'),
    join(vaultRoot, 'private.md'),
    join(systemRoot, 'config.ini'),
    join(otherWorktree, 'cross-run.txt'),
    join(root, '..', root.split('/').pop(), 'outside.txt')
  ]) {
    assert.throws(
      () => assertWorkspaceWriteAllowed({ policy: isolationPolicy, targetPath: deniedPath }),
      WorkspaceIsolationError
    );
  }
  assert.throws(
    () => assertWorkspaceWriteAllowed({ policy: isolationPolicy, targetPath: `${manifest.worktreePath}/bad\nname.txt` }),
    WorkspaceIsolationError
  );
  symlinkSync(vaultRoot, join(manifest.worktreePath, 'vault-link'), 'dir');
  assert.throws(
    () => assertWorkspaceWriteAllowed({ policy: isolationPolicy, targetPath: join(manifest.worktreePath, 'vault-link', 'escape.md') }),
    WorkspaceIsolationError
  );
  symlinkSync(otherWorktree, join(manifest.worktreePath, 'other-worktree-link'), 'dir');
  assert.throws(
    () => simulateWorkspaceWrite({ policy: isolationPolicy, targetPath: join(manifest.worktreePath, 'other-worktree-link', 'escape.txt') }),
    WorkspaceIsolationError
  );

  writeFileSync(join(manifest.worktreePath, 'feature.txt'), 'safe change\n');
  const fakeSecret = 'ghp_' + '1234567890123456789012345';
  writeFileSync(join(manifest.worktreePath, '.env.local'), `TOKEN=${fakeSecret}\n`);
  git(manifest.worktreePath, ['add', 'feature.txt', '.env.local']);
  git(manifest.worktreePath, ['commit', '-m', 'agent changes']);
  writeFileSync(join(repo, 'outside-source-change.txt'), 'outside\n');
  const statusSummary = getWorkspaceStatusSummary({ worktreePath: manifest.worktreePath, baseCommit: manifest.baseCommit });
  assert.equal(statusSummary.baseCommit, manifest.baseCommit);
  assert.equal(statusSummary.committedDiffEntries.some((entry) => entry.includes('feature.txt')), true);
  assert.equal(statusSummary.committedDiffEntries.some((entry) => entry.includes('outside-source-change.txt')), false);
  const diff = getWorkspaceDiff({ worktreePath: manifest.worktreePath, baseCommit: manifest.baseCommit });
  assert.equal(diff.diff.includes('safe change'), true);
  assert.equal(diff.diff.includes(fakeSecret), false);
  assert.equal(diff.diff.includes('[REDACTED_SECRET]'), true);
  assert.equal(diff.suspiciousFiles.includes('.env.local'), true);
  const snapshot = createWorkspaceAcceptanceSnapshot({ worktreePath: manifest.worktreePath, baseCommit: manifest.baseCommit, artifactsPath: join(root, 'data', 'runs', manifest.runId, 'artifacts'), snapshotId: 'acceptance-1' });
  assert.equal(existsSync(snapshot.summaryPath), true);
  assert.equal(existsSync(snapshot.diffPath), true);
  assert.equal(JSON.parse(readFileSync(snapshot.summaryPath, 'utf8')).baseCommit, manifest.baseCommit);
  assert.equal(readFileSync(snapshot.diffPath, 'utf8').includes('[REDACTED_SECRET]'), true);
  assert.equal(readFileSync(snapshot.diffPath, 'utf8').includes('outside-source-change.txt'), false);

  const oldEnough = '2026-07-01T00:00:00.000Z';
  const now = '2026-07-13T00:00:00.000Z';
  assert.equal(createWorkspaceCleanupPlan({ run: { ...manifest, state: 'Accepted', acceptedAt: oldEnough }, now }).eligible, false);
  assert.equal(createWorkspaceCleanupPlan({ run: { ...manifest, state: 'Running', updatedAt: oldEnough }, now }).reasons.includes('run-open'), true);
  assert.equal(createWorkspaceCleanupPlan({ run: { ...manifest, state: 'Completed', completedAt: oldEnough, mergeVerifiedAt: oldEnough }, now }).reasons.includes('merge-not-verified'), true);
  assert.equal(createWorkspaceCleanupPlan({ run: { ...manifest, state: 'Completed', completedAt: oldEnough, mergeVerifiedAt: oldEnough, targetCommit: statusSummary.headCommit, keep: true }, now }).reasons.includes('keep-enabled'), true);
  assert.equal(createWorkspaceCleanupPlan({ run: { ...manifest, state: 'Failed', terminalAt: oldEnough }, now }).reasons.includes('retention-window-active'), true);

  const cleanupPlan = createWorkspaceCleanupPlan({
    run: { ...manifest, state: 'Completed', completedAt: oldEnough, mergeVerifiedAt: oldEnough, targetCommit: statusSummary.headCommit },
    now
  });
  assert.equal(cleanupPlan.eligible, true);
  assert.equal(cleanupPlan.actions.removeWorktree, true);
  assert.equal(cleanupPlan.actions.deleteBranch, true);
  const cleanup = executeWorkspaceCleanupPlan({ repositoryPath: repo, plan: cleanupPlan });
  assert.equal(cleanup.results.some((result) => result.action === 'remove-worktree' && result.status === 'done'), true);
  assert.equal(cleanup.results.some((result) => result.action === 'delete-branch' && result.status === 'done'), true);
  assert.equal(existsSync(manifest.worktreePath), false);
  const cleanupAgain = executeWorkspaceCleanupPlan({ repositoryPath: repo, plan: cleanupPlan });
  assert.equal(cleanupAgain.results.every((result) => result.status === 'already-absent'), true);

  console.log('Workspace manager tests OK');
} finally {
  rmSync(root, { recursive: true, force: true });
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
}
