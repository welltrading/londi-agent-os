import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

export class WorkspaceValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'WorkspaceValidationError';
    this.code = 'ERR_WORKSPACE_VALIDATION';
    this.details = details;
  }
}

export class WorkspaceLockConflictError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'WorkspaceLockConflictError';
    this.code = 'ERR_WORKSPACE_LOCK_CONFLICT';
    this.details = details;
  }
}


export class WorkspaceLifecycleError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'WorkspaceLifecycleError';
    this.code = 'ERR_WORKSPACE_LIFECYCLE';
    this.details = details;
  }
}

export function deriveRunBranchName(runId) {
  const slug = String(runId ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!slug) throw new WorkspaceLifecycleError('Run id is required for branch naming.');
  return `londi/run-${slug.slice(0, 12)}`;
}

export function deriveRunWorktreePath({ dataRoot = './data', runId } = {}) {
  if (!runId) throw new WorkspaceLifecycleError('Run id is required for worktree path.');
  return resolve(join(dataRoot, 'worktrees', String(runId)));
}

export function createRunWorkspace({ repositoryPath, targetBranch, runId, dataRoot = './data', lockStore, allowDirty = true } = {}) {
  const validation = validateGitProject({ repositoryPath, targetBranch, runId, lockStore, allowDirty });
  if (validation.status === 'Blocked') throw new WorkspaceLifecycleError('Cannot create workspace from blocked Git validation.', { validation });

  const branchName = deriveRunBranchName(runId);
  const worktreePath = deriveRunWorktreePath({ dataRoot, runId });
  ensureNoExistingRefOrPath({ repositoryPath: validation.repositoryPath, branchName, worktreePath });

  mkdirSync(dirname(worktreePath), { recursive: true });
  const branch = git(['branch', branchName, validation.baseCommit], validation.repositoryPath);
  if (branch.status !== 0) throw new WorkspaceLifecycleError('Failed to create run branch.', { branchName, reason: safeGitError(branch) });

  const worktree = git(['worktree', 'add', worktreePath, branchName], validation.repositoryPath);
  if (worktree.status !== 0) {
    git(['branch', '-D', branchName], validation.repositoryPath);
    throw new WorkspaceLifecycleError('Failed to create run worktree.', { worktreePath, reason: safeGitError(worktree) });
  }

  const manifest = Object.freeze({
    runId,
    repositoryPath: validation.repositoryPath,
    targetBranch,
    baseCommit: validation.baseCommit,
    branchName,
    worktreePath,
    dirtyEntries: validation.dirtyEntries,
    createdAt: new Date().toISOString()
  });
  writeFileSync(join(worktreePath, 'londi-workspace-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function ensureNoExistingRefOrPath({ repositoryPath, branchName, worktreePath }) {
  const branchExists = git(['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], repositoryPath);
  if (branchExists.status === 0) throw new WorkspaceLifecycleError('Run branch already exists; refusing unverified reuse.', { branchName });
  if (existsSync(worktreePath)) throw new WorkspaceLifecycleError('Run worktree path already exists; refusing unverified reuse.', { worktreePath });
  const worktreeList = git(['worktree', 'list', '--porcelain'], repositoryPath);
  if (worktreeList.status === 0 && worktreeList.stdout.split('\n').some((line) => line === `worktree ${worktreePath}`)) {
    throw new WorkspaceLifecycleError('Run worktree already registered; refusing unverified reuse.', { worktreePath });
  }
}

export function validateGitProject({ repositoryPath, targetBranch, runId, lockStore, allowDirty = true } = {}) {
  const checks = [];
  const resolvedRepositoryPath = repositoryPath ? resolve(repositoryPath) : undefined;
  if (!resolvedRepositoryPath || !existsSync(resolvedRepositoryPath) || !statSync(resolvedRepositoryPath).isDirectory()) {
    return blocked('Repository path does not exist or is not a directory.', checks, { repositoryPath });
  }

  const gitDir = git(['rev-parse', '--git-dir'], resolvedRepositoryPath);
  if (gitDir.status !== 0) return blocked('Repository is not a Git repository.', checks, { repositoryPath: resolvedRepositoryPath, reason: safeGitError(gitDir) });
  checks.push({ name: 'git.repository', status: 'Ready', detail: gitDir.stdout.trim() });

  const branchExists = git(['show-ref', '--verify', '--quiet', `refs/heads/${targetBranch}`], resolvedRepositoryPath);
  if (!targetBranch || branchExists.status !== 0) {
    return blocked('Target branch does not exist.', checks, { repositoryPath: resolvedRepositoryPath, targetBranch });
  }
  checks.push({ name: 'git.targetBranch', status: 'Ready', detail: targetBranch });

  const baseCommitResult = git(['rev-parse', `${targetBranch}^{commit}`], resolvedRepositoryPath);
  if (baseCommitResult.status !== 0) return blocked('Base commit cannot be read.', checks, { targetBranch, reason: safeGitError(baseCommitResult) });
  const baseCommit = baseCommitResult.stdout.trim();
  checks.push({ name: 'git.baseCommit', status: 'Ready', detail: baseCommit });

  const dirtyStatus = git(['status', '--porcelain=v1', '--untracked-files=normal'], resolvedRepositoryPath);
  if (dirtyStatus.status !== 0) return blocked('Dirty state cannot be determined safely.', checks, { reason: safeGitError(dirtyStatus) });
  const dirtyEntries = dirtyStatus.stdout.split('\n').filter(Boolean);
  if (dirtyEntries.length > 0 && allowDirty !== true) {
    return blocked('Repository has dirty changes and policy disallows dirty state.', checks, { dirtyEntries });
  }
  checks.push({ name: 'git.dirtyState', status: dirtyEntries.length > 0 ? 'Warning' : 'Ready', detail: dirtyEntries });

  const lock = lockStore?.acquire?.({ repositoryPath: resolvedRepositoryPath, targetBranch, runId, baseCommit });
  checks.push({ name: 'workspace.lock', status: 'Ready', detail: lock ?? null });

  return {
    status: dirtyEntries.length > 0 ? 'Ready with Warnings' : 'Ready',
    repositoryPath: resolvedRepositoryPath,
    targetBranch,
    baseCommit,
    dirtyEntries,
    checks
  };
}

export function createInMemoryWorkspaceLockStore() {
  const locks = new Map();
  return {
    acquire({ repositoryPath, targetBranch, runId, baseCommit }) {
      const key = lockKey(repositoryPath, targetBranch);
      const existing = locks.get(key);
      if (existing && existing.runId !== runId) {
        throw new WorkspaceLockConflictError('Workspace lock already held for target branch.', { key, existingRunId: existing.runId, runId });
      }
      const lock = Object.freeze({ key, repositoryPath, targetBranch, runId, baseCommit, acquiredAt: new Date().toISOString() });
      locks.set(key, lock);
      return lock;
    },
    release({ repositoryPath, targetBranch, runId }) {
      const key = lockKey(repositoryPath, targetBranch);
      const existing = locks.get(key);
      if (!existing) return false;
      if (existing.runId !== runId) throw new WorkspaceLockConflictError('Cannot release a lock owned by another run.', { key, existingRunId: existing.runId, runId });
      locks.delete(key);
      return true;
    },
    list() {
      return [...locks.values()].map((lock) => structuredClone(lock));
    }
  };
}

export function classifyWorkspaceValidationError(error) {
  if (error instanceof WorkspaceLockConflictError) return { status: 'Blocked', reason: 'lock-conflict', errorCode: error.code, details: error.details };
  if (error instanceof WorkspaceValidationError || error instanceof WorkspaceLifecycleError) return { status: 'Blocked', reason: 'validation', errorCode: error.code, details: error.details };
  throw error;
}

function blocked(message, checks, details = {}) {
  return { status: 'Blocked', reason: message, checks, details };
}

function lockKey(repositoryPath, targetBranch) {
  return `${resolve(repositoryPath)}#${targetBranch}`;
}

function git(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

function safeGitError(result) {
  return (result.stderr || result.stdout || '').trim().slice(0, 500);
}
