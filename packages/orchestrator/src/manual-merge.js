import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

export const MANUAL_MERGE_GATE_ID = 'Gate F';
export const MANUAL_MERGE_STATUSES = Object.freeze(['Pending Manual Merge', 'Needs Attention', 'Verified']);
export const MANUAL_MERGE_FAILURE_REASONS = Object.freeze(['conflict', 'drift', 'test-failure', 'missing-target-commit', 'containment-failed', 'patch-equivalence-failed']);

export class ManualMergeError extends Error {
  constructor(message, code = 'ERR_MANUAL_MERGE', details = {}) {
    super(message);
    this.name = 'ManualMergeError';
    this.code = code;
    this.details = details;
  }
}

export function createManualMergeGate({ runId, acceptedSnapshot, repositoryPath, targetBranch, runBranch, instructions = [], createdAt = new Date().toISOString() } = {}) {
  if (!runId) throw new ManualMergeError('Run id is required for manual merge gate.', 'ERR_MANUAL_MERGE_RUN');
  if (!acceptedSnapshot?.snapshotHash) throw new ManualMergeError('Accepted snapshot is required for Gate F.', 'ERR_MANUAL_MERGE_SNAPSHOT');
  if (!repositoryPath || !targetBranch || !runBranch) throw new ManualMergeError('Repository, target branch and run branch are required.', 'ERR_MANUAL_MERGE_BRANCHES');
  return deepFreezeMerge({
    gate: MANUAL_MERGE_GATE_ID,
    runId,
    status: 'Pending Manual Merge',
    repositoryPath: resolve(repositoryPath),
    targetBranch,
    runBranch,
    acceptedSnapshotHash: acceptedSnapshot.snapshotHash,
    createdAt,
    automaticMerge: false,
    commandToRun: null,
    instructions: normalizeInstructions({ targetBranch, runBranch, instructions })
  });
}

export function verifyManualMerge({ gate, repositoryPath = gate?.repositoryPath, targetBranch = gate?.targetBranch, runBranch = gate?.runBranch, targetCommit, testCommand, runCommand = defaultRunCommand, expectedPatchHash = null } = {}) {
  assertManualMergeGate(gate);
  const repo = resolve(repositoryPath);
  if (!existsSync(repo)) return needsAttention(gate, 'drift', 'repository path is missing');
  if (!targetCommit) return needsAttention(gate, 'missing-target-commit', 'targetCommit is required after manual merge');

  const targetHead = runCommand('git', ['rev-parse', `${targetBranch}^{commit}`], { cwd: repo });
  if (targetHead.status !== 0) return needsAttention(gate, 'drift', 'target branch cannot be read', { stderr: safeOutput(targetHead) });
  const normalizedTarget = targetHead.stdout.trim();
  if (normalizedTarget !== targetCommit) return needsAttention(gate, 'drift', 'targetCommit does not match target branch HEAD', { expected: targetCommit, actual: normalizedTarget });

  const mergeBase = runCommand('git', ['merge-base', targetBranch, runBranch], { cwd: repo });
  if (mergeBase.status !== 0) return needsAttention(gate, 'conflict', 'merge base cannot be read; branch may be unavailable', { stderr: safeOutput(mergeBase) });

  const containment = runCommand('git', ['merge-base', '--is-ancestor', runBranch, targetBranch], { cwd: repo });
  const patchEquivalent = expectedPatchHash ? verifyPatchEquivalence({ repositoryPath: repo, targetBranch, runBranch, expectedPatchHash, runCommand }) : { equivalent: false, reason: 'no expected patch hash supplied' };
  if (containment.status !== 0 && patchEquivalent.equivalent !== true) {
    return needsAttention(gate, patchEquivalent.reason === 'patch-hash-mismatch' ? 'patch-equivalence-failed' : 'containment-failed', 'manual merge is neither branch-contained nor patch-equivalent', { patchEquivalent });
  }

  if (testCommand) {
    const test = runCommand(testCommand.command, testCommand.args ?? [], { cwd: repo, shell: testCommand.shell === true });
    if (test.status !== 0) return needsAttention(gate, 'test-failure', 'post-merge verification tests failed', { stdout: safeOutput(test, 'stdout'), stderr: safeOutput(test) });
  }

  return deepFreezeMerge({
    gate: MANUAL_MERGE_GATE_ID,
    runId: gate.runId,
    status: 'Verified',
    targetCommit,
    verifiedAt: new Date().toISOString(),
    targetBranch,
    runBranch,
    acceptedSnapshotHash: gate.acceptedSnapshotHash,
    containmentVerified: containment.status === 0,
    patchEquivalent: patchEquivalent.equivalent === true,
    nextRunState: 'Completed'
  });
}

export function verifyPatchEquivalence({ repositoryPath, targetBranch, runBranch, expectedPatchHash, runCommand = defaultRunCommand } = {}) {
  if (!expectedPatchHash) throw new ManualMergeError('Expected patch hash is required.', 'ERR_PATCH_HASH_REQUIRED');
  const repo = resolve(repositoryPath);
  const diff = runCommand('git', ['diff', `${targetBranch}...${runBranch}`], { cwd: repo });
  if (diff.status !== 0) return deepFreezeMerge({ equivalent: false, reason: 'patch-diff-unavailable', stderr: safeOutput(diff) });
  const actualPatchHash = simpleHash(diff.stdout);
  return deepFreezeMerge({ equivalent: actualPatchHash === expectedPatchHash, actualPatchHash, expectedPatchHash, reason: actualPatchHash === expectedPatchHash ? 'patch-equivalent' : 'patch-hash-mismatch' });
}

export function assertNoAutomaticMergeCommand(commandLine) {
  if (/\bgit\s+merge\b|\bgit\s+rebase\b|\bgit\s+cherry-pick\b|\bgh\s+pr\s+merge\b/i.test(String(commandLine ?? ''))) {
    throw new ManualMergeError('Automatic merge commands are forbidden.', 'ERR_AUTOMATIC_MERGE_FORBIDDEN');
  }
  return true;
}

function normalizeInstructions({ targetBranch, runBranch, instructions }) {
  const base = [
    `Review accepted output on ${runBranch}.`,
    `Manually merge outside Londi Agent OS into ${targetBranch}.`,
    'Resolve conflicts yourself if they appear.',
    'Run the project verification command manually.',
    'Return the resulting targetCommit for Gate F verification.'
  ];
  return Object.freeze([...base, ...instructions.map(String)].map((line) => {
    assertNoAutomaticMergeCommand(line);
    return line;
  }));
}

function assertManualMergeGate(gate) {
  if (gate?.gate !== MANUAL_MERGE_GATE_ID || gate?.status !== 'Pending Manual Merge') throw new ManualMergeError('Gate F pending manual merge gate is required.', 'ERR_MANUAL_MERGE_GATE', { gate: gate?.gate, status: gate?.status });
  if (gate.automaticMerge !== false || gate.commandToRun !== null) throw new ManualMergeError('Gate F must not contain automatic merge execution.', 'ERR_MANUAL_MERGE_AUTOMATION');
  return true;
}

function needsAttention(gate, reason, message, details = {}) {
  if (!MANUAL_MERGE_FAILURE_REASONS.includes(reason)) throw new ManualMergeError('Unknown merge failure reason.', 'ERR_MANUAL_MERGE_REASON', { reason });
  return deepFreezeMerge({ gate: MANUAL_MERGE_GATE_ID, runId: gate?.runId ?? null, status: 'Needs Attention', reason, message, details, nextRunState: 'Needs Attention', targetCommit: null });
}

function defaultRunCommand(command, args, options) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

function safeOutput(result, field = 'stderr') {
  return String(result?.[field] || result?.stdout || '').slice(0, 1000);
}

function simpleHash(text) {
  let hash = 0x811c9dc5;
  for (const char of String(text)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function deepFreezeMerge(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeMerge(child);
  return Object.freeze(value);
}
