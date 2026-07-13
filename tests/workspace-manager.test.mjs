import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  WorkspaceLockConflictError,
  classifyWorkspaceValidationError,
  createInMemoryWorkspaceLockStore,
  createRunWorkspace,
  deriveRunBranchName,
  deriveRunWorktreePath,
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

  console.log('Workspace manager tests OK');
} finally {
  rmSync(root, { recursive: true, force: true });
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
}
