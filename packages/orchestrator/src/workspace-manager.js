import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

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
  if (error instanceof WorkspaceValidationError) return { status: 'Blocked', reason: 'validation', errorCode: error.code, details: error.details };
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
