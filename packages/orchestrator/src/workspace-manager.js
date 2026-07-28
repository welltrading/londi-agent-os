import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';

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
  // Keep the whole run id: run ids embed a per-second timestamp, so truncating collapsed
  // every run created on the same day onto one branch name.
  return `londi/run-${slug.replace(/^run-/, '').slice(0, 60)}`;
}

export function detectDefaultBranch({ repositoryPath, candidates = ['main', 'master'] } = {}) {
  if (!repositoryPath || !existsSync(repositoryPath)) return null;
  const head = git(['symbolic-ref', '--short', 'HEAD'], repositoryPath);
  if (head.status === 0 && head.stdout.trim()) return head.stdout.trim();
  for (const candidate of candidates) {
    if (git(['show-ref', '--verify', '--quiet', `refs/heads/${candidate}`], repositoryPath).status === 0) return candidate;
  }
  return null;
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

export function releaseRunWorkspace({ workspace, runId, lockStore, retain = false } = {}) {
  const repositoryPath = workspace?.repositoryPath ?? null;
  const targetBranch = workspace?.targetBranch ?? null;
  const released = { lockReleased: false, worktreeRemoved: false, branchRemoved: false, retained: Boolean(retain), reason: null };
  if (repositoryPath && targetBranch && lockStore?.release) {
    try {
      released.lockReleased = Boolean(lockStore.release({ repositoryPath, targetBranch, runId: runId ?? workspace?.runId }));
    } catch (error) {
      released.reason = error?.message ?? 'Workspace lock release failed.';
    }
  }
  if (retain || !repositoryPath || !workspace?.worktreePath || !workspace?.branchName) return Object.freeze(released);

  const removal = git(['worktree', 'remove', '--force', workspace.worktreePath], repositoryPath);
  if (removal.status !== 0) {
    released.reason = released.reason ?? safeGitError(removal);
    return Object.freeze({ ...released, retained: true });
  }
  released.worktreeRemoved = true;
  const branchRemoval = git(['branch', '-D', workspace.branchName], repositoryPath);
  released.branchRemoved = branchRemoval.status === 0;
  if (!released.branchRemoved) released.reason = released.reason ?? safeGitError(branchRemoval);
  return Object.freeze(released);
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


export class WorkspaceIsolationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'WorkspaceIsolationError';
    this.code = 'ERR_WORKSPACE_ISOLATION';
    this.details = details;
  }
}

export function createServiceAccountIsolationPolicy({ serviceAccount = 'LondiAgentOSService', worktreePath, runArtifactsPath, deniedRoots = [] } = {}) {
  if (!worktreePath || !runArtifactsPath) throw new WorkspaceIsolationError('Worktree and run artifact paths are required for isolation policy.');
  const allowedWriteRoots = [resolve(worktreePath), resolve(runArtifactsPath)];
  const deniedWriteRoots = deniedRoots.map((root) => resolve(root));
  return Object.freeze({
    serviceAccount,
    allowedWriteRoots: Object.freeze(allowedWriteRoots),
    deniedWriteRoots: Object.freeze(deniedWriteRoots),
    rules: Object.freeze([
      'write:allow:run-worktree',
      'write:allow:run-artifacts',
      'write:deny:source-repository',
      'write:deny:vault-root',
      'write:deny:system-folders',
      'write:deny:other-worktrees'
    ])
  });
}

export function assertWorkspaceWriteAllowed({ policy, targetPath } = {}) {
  if (!policy) throw new WorkspaceIsolationError('Isolation policy is required.');
  assertSafeTargetPath(targetPath);
  const resolvedTarget = resolve(targetPath);
  const physicalTarget = resolvePhysicalTarget(resolvedTarget);
  const deniedRoot = policy.deniedWriteRoots.find((root) => pathMatchesRootVariants({ resolvedTarget, physicalTarget, root }));
  if (deniedRoot) throw new WorkspaceIsolationError('Write target is denied by isolation policy.', { targetPath: resolvedTarget, physicalTarget, deniedRoot });
  const allowedRoot = policy.allowedWriteRoots.find((root) => pathMatchesRootVariants({ resolvedTarget, physicalTarget, root, requireBothTargets: true }));
  if (!allowedRoot) throw new WorkspaceIsolationError('Write target is outside run worktree/artifacts.', { targetPath: resolvedTarget, physicalTarget, allowedRoots: policy.allowedWriteRoots });
  return { allowed: true, targetPath: resolvedTarget, physicalTarget, allowedRoot };
}

export function simulateWorkspaceWrite({ policy, targetPath } = {}) {
  const decision = assertWorkspaceWriteAllowed({ policy, targetPath });
  return Object.freeze({ ...decision, serviceAccount: policy.serviceAccount });
}

function pathMatchesRootVariants({ resolvedTarget, physicalTarget, root, requireBothTargets = false } = {}) {
  const resolvedRoot = resolve(root);
  const physicalRoot = resolvePhysicalTarget(resolvedRoot);
  const targetMatches = isPathInsideAnyRoot(resolvedTarget, [resolvedRoot, physicalRoot]);
  const physicalMatches = isPathInsideAnyRoot(physicalTarget, [resolvedRoot, physicalRoot]);
  return requireBothTargets ? targetMatches && physicalMatches : targetMatches || physicalMatches;
}

function isPathInsideAnyRoot(targetPath, rootPaths) {
  return rootPaths.some((rootPath) => isPathInside(targetPath, rootPath));
}

function isPathInside(targetPath, rootPath) {
  const rel = relative(rootPath, targetPath);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('/') && rel !== '..');
}

function assertSafeTargetPath(targetPath) {
  if (typeof targetPath !== 'string' || targetPath.length === 0) {
    throw new WorkspaceIsolationError('Write target path must be a non-empty string.', { targetPath });
  }
  if (/[\u0000-\u001f\u007f]/u.test(targetPath)) {
    throw new WorkspaceIsolationError('Write target path contains control characters.', { targetPath });
  }
}

function resolvePhysicalTarget(targetPath) {
  let cursor = targetPath;
  const missingSegments = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) return targetPath;
    missingSegments.unshift(cursor.slice(parent.length + 1));
    cursor = parent;
  }
  const physicalBase = realpathSync.native(cursor);
  return resolve(physicalBase, ...missingSegments);
}


export class WorkspaceSnapshotError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'WorkspaceSnapshotError';
    this.code = 'ERR_WORKSPACE_SNAPSHOT';
    this.details = details;
  }
}

export function getWorkspaceStatusSummary({ worktreePath, baseCommit } = {}) {
  if (!worktreePath || !baseCommit) throw new WorkspaceSnapshotError('Worktree path and base commit are required for status summary.');
  const resolvedWorktree = resolve(worktreePath);
  const head = git(['rev-parse', 'HEAD'], resolvedWorktree);
  if (head.status !== 0) throw new WorkspaceSnapshotError('Cannot read worktree HEAD.', { worktreePath: resolvedWorktree, reason: safeGitError(head) });
  const status = git(['status', '--porcelain=v1', '--untracked-files=normal'], resolvedWorktree);
  if (status.status !== 0) throw new WorkspaceSnapshotError('Cannot read worktree status.', { worktreePath: resolvedWorktree, reason: safeGitError(status) });
  const diffName = git(['diff', '--name-status', `${baseCommit}...HEAD`], resolvedWorktree);
  if (diffName.status !== 0) throw new WorkspaceSnapshotError('Cannot read committed diff summary from base.', { baseCommit, reason: safeGitError(diffName) });
  const workingTreeDiff = git(['diff', '--name-status'], resolvedWorktree);
  if (workingTreeDiff.status !== 0) throw new WorkspaceSnapshotError('Cannot read working-tree diff summary.', { reason: safeGitError(workingTreeDiff) });
  return Object.freeze({
    worktreePath: resolvedWorktree,
    baseCommit,
    headCommit: head.stdout.trim(),
    statusEntries: parseLines(status.stdout),
    committedDiffEntries: parseLines(diffName.stdout),
    workingTreeDiffEntries: parseLines(workingTreeDiff.stdout)
  });
}

export function getWorkspaceDiff({ worktreePath, baseCommit, secretPatterns = DEFAULT_SECRET_PATTERNS } = {}) {
  if (!worktreePath || !baseCommit) throw new WorkspaceSnapshotError('Worktree path and base commit are required for diff.');
  const resolvedWorktree = resolve(worktreePath);
  const diff = git(['diff', '--binary', `${baseCommit}...HEAD`], resolvedWorktree);
  if (diff.status !== 0) throw new WorkspaceSnapshotError('Cannot read worktree diff from base commit.', { baseCommit, reason: safeGitError(diff) });
  const working = git(['diff', '--binary'], resolvedWorktree);
  if (working.status !== 0) throw new WorkspaceSnapshotError('Cannot read uncommitted worktree diff.', { reason: safeGitError(working) });
  const fullDiff = [diff.stdout, working.stdout].filter(Boolean).join('\n');
  const redacted = redactSecrets(fullDiff, secretPatterns);
  return Object.freeze({
    worktreePath: resolvedWorktree,
    baseCommit,
    diff: redacted.text,
    redactedSecrets: redacted.count,
    suspiciousFiles: detectSuspiciousDiffFiles(fullDiff)
  });
}

export function createWorkspaceAcceptanceSnapshot({ worktreePath, baseCommit, artifactsPath, snapshotId = new Date().toISOString().replace(/[:.]/g, '-') } = {}) {
  if (!artifactsPath) throw new WorkspaceSnapshotError('Artifacts path is required for acceptance snapshot.');
  const status = getWorkspaceStatusSummary({ worktreePath, baseCommit });
  const diff = getWorkspaceDiff({ worktreePath, baseCommit });
  const resolvedArtifacts = resolve(artifactsPath);
  mkdirSync(resolvedArtifacts, { recursive: true });
  const snapshot = Object.freeze({
    snapshotId,
    baseCommit,
    headCommit: status.headCommit,
    worktreePath: status.worktreePath,
    statusEntries: status.statusEntries,
    committedDiffEntries: status.committedDiffEntries,
    workingTreeDiffEntries: status.workingTreeDiffEntries,
    redactedSecrets: diff.redactedSecrets,
    suspiciousFiles: diff.suspiciousFiles,
    createdAt: new Date().toISOString()
  });
  const summaryPath = join(resolvedArtifacts, `git-snapshot-${snapshotId}.json`);
  const diffPath = join(resolvedArtifacts, `git-diff-${snapshotId}.patch`);
  writeFileSync(summaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  writeFileSync(diffPath, `${diff.diff}\n`, 'utf8');
  return Object.freeze({ ...snapshot, summaryPath, diffPath });
}

const DEFAULT_SECRET_PATTERNS = Object.freeze([
  /ghp_[A-Za-z0-9]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |OPENSSH )?PRIVATE KEY-----/g
]);

function redactSecrets(text, patterns) {
  let count = 0;
  let redacted = text;
  for (const pattern of patterns) {
    redacted = redacted.replace(pattern, () => {
      count += 1;
      return '[REDACTED_SECRET]';
    });
  }
  return { text: redacted, count };
}

function detectSuspiciousDiffFiles(diffText) {
  const files = [];
  for (const line of diffText.split('\n')) {
    if (!line.startsWith('diff --git ')) continue;
    const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (!match) continue;
    const file = match[2];
    if (/\.env($|\.)|secret|credential|private[-_]?key/i.test(file)) files.push(file);
  }
  return Object.freeze([...new Set(files)]);
}

function parseLines(text) {
  return Object.freeze(text.split('\n').filter(Boolean));
}


export class WorkspaceCleanupError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'WorkspaceCleanupError';
    this.code = 'ERR_WORKSPACE_CLEANUP';
    this.details = details;
  }
}

export function createWorkspaceCleanupPlan({ run, now = new Date().toISOString() } = {}) {
  if (!run) throw new WorkspaceCleanupError('Run metadata is required for cleanup planning.');
  const reasons = [];
  if (run.keep === true) reasons.push('keep-enabled');
  if (run.state === 'Accepted') reasons.push('accepted-awaiting-merge-verification');
  if (OPEN_RUN_STATES_FOR_CLEANUP.has(run.state)) reasons.push('run-open');
  const finalRetentionDays = retentionDaysForRun(run);
  if (finalRetentionDays === null) reasons.push('state-not-cleanable');
  const retentionStart = retentionStartForRun(run);
  if (finalRetentionDays !== null && !retentionStart) reasons.push('missing-retention-start');
  const ageDays = retentionStart ? (Date.parse(now) - Date.parse(retentionStart)) / 86_400_000 : 0;
  if (finalRetentionDays !== null && retentionStart && ageDays < finalRetentionDays) reasons.push('retention-window-active');
  const mergeVerified = Boolean(run.mergeVerifiedAt && run.targetCommit);
  if (run.state === 'Completed' && !mergeVerified) reasons.push('merge-not-verified');

  const eligible = reasons.length === 0;
  const actions = eligible ? {
    removeWorktree: Boolean(run.worktreePath),
    deleteBranch: run.state === 'Completed' && mergeVerified && Boolean(run.branchName)
  } : { removeWorktree: false, deleteBranch: false };
  return Object.freeze({
    runId: run.runId,
    state: run.state,
    eligible,
    reasons: Object.freeze(reasons),
    retentionDays: finalRetentionDays,
    retentionStart,
    ageDays,
    branchName: run.branchName,
    worktreePath: run.worktreePath,
    actions: Object.freeze(actions)
  });
}

export function executeWorkspaceCleanupPlan({ repositoryPath, plan } = {}) {
  if (!plan) throw new WorkspaceCleanupError('Cleanup plan is required.');
  if (!plan.eligible) throw new WorkspaceCleanupError('Cleanup plan is not eligible for execution.', { reasons: plan.reasons });
  const resolvedRepository = repositoryPath ? resolve(repositoryPath) : undefined;
  const results = [];
  if (plan.actions.removeWorktree && plan.worktreePath) {
    if (existsSync(plan.worktreePath)) {
      const remove = git(['worktree', 'remove', '--force', plan.worktreePath], resolvedRepository);
      if (remove.status !== 0) throw new WorkspaceCleanupError('Failed to remove run worktree.', { worktreePath: plan.worktreePath, reason: safeGitError(remove), results });
      results.push({ action: 'remove-worktree', status: 'done', path: plan.worktreePath });
    } else {
      results.push({ action: 'remove-worktree', status: 'already-absent', path: plan.worktreePath });
    }
  }
  if (plan.actions.deleteBranch && plan.branchName) {
    const exists = git(['show-ref', '--verify', '--quiet', `refs/heads/${plan.branchName}`], resolvedRepository);
    if (exists.status === 0) {
      const del = git(['branch', '-D', plan.branchName], resolvedRepository);
      if (del.status !== 0) throw new WorkspaceCleanupError('Failed to delete run branch.', { branchName: plan.branchName, reason: safeGitError(del), results });
      results.push({ action: 'delete-branch', status: 'done', branchName: plan.branchName });
    } else {
      results.push({ action: 'delete-branch', status: 'already-absent', branchName: plan.branchName });
    }
  }
  return Object.freeze({ runId: plan.runId, results: Object.freeze(results) });
}

function retentionDaysForRun(run) {
  if (run.state === 'Completed') return 7;
  if (['Failed', 'Cancelled', 'Needs Attention'].includes(run.state)) return 30;
  return null;
}

function retentionStartForRun(run) {
  if (run.state === 'Completed') return run.completedAt ?? run.mergeVerifiedAt;
  if (['Failed', 'Cancelled', 'Needs Attention'].includes(run.state)) return run.terminalAt ?? run.updatedAt ?? run.completedAt;
  return null;
}

const OPEN_RUN_STATES_FOR_CLEANUP = Object.freeze(new Set([
  'Draft',
  'Preflight Running',
  'Blocked',
  'Ready',
  'Awaiting Pipeline Approval',
  'Preparing Workspace',
  'Running',
  'Awaiting Approval',
  'Unresponsive',
  'Recovery Required',
  'Awaiting Acceptance',
  'Maintenance Hold'
]));

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
  if (error instanceof WorkspaceValidationError || error instanceof WorkspaceLifecycleError || error instanceof WorkspaceIsolationError || error instanceof WorkspaceSnapshotError || error instanceof WorkspaceCleanupError) return { status: 'Blocked', reason: 'validation', errorCode: error.code, details: error.details };
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
