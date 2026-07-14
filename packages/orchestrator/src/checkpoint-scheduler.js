import { assertRunTransition } from './state-machine.js';
import { ArtifactLayoutError, assertCheckpointWithoutSecrets, writeArtifactRecord } from './artifact-layout.js';

export const CHECKPOINT_REASONS = Object.freeze([
  'unit-complete',
  'before-approval',
  'before-retry',
  'before-shutdown'
]);

export const SAFE_SHUTDOWN_TIMEOUT_MS = 30_000;

export class CheckpointSchedulerError extends Error {
  constructor(message, code = 'ERR_CHECKPOINT_SCHEDULER', details = {}) {
    super(message);
    this.name = 'CheckpointSchedulerError';
    this.code = code;
    this.details = details;
  }
}

export function createCheckpointRecord({ runId, attemptId = null, state = 'Running', reason, sequence, artifacts = [], externalEffects = [], metadata = {}, createdAt = new Date().toISOString() } = {}) {
  if (!runId || typeof runId !== 'string') throw new CheckpointSchedulerError('Checkpoint runId is required.', 'ERR_CHECKPOINT_RUN_ID');
  if (!CHECKPOINT_REASONS.includes(reason)) throw new CheckpointSchedulerError('Unsupported checkpoint reason.', 'ERR_CHECKPOINT_REASON', { reason });
  if (!Number.isInteger(sequence) || sequence < 1) throw new CheckpointSchedulerError('Checkpoint sequence must be a positive integer.', 'ERR_CHECKPOINT_SEQUENCE', { sequence });
  const checkpoint = {
    version: 1,
    id: `chk-${runId}-${String(sequence).padStart(4, '0')}`,
    runId,
    attemptId,
    state,
    reason,
    sequence,
    createdAt,
    artifacts: normalizeArtifactRefs(artifacts),
    externalEffects: normalizeExternalEffects(externalEffects),
    metadata: structuredClone(metadata),
    safeToResume: true
  };
  assertCheckpointWithoutSecrets(checkpoint);
  return deepFreezeCheckpoint(checkpoint);
}

export function writeCheckpointArtifact({ layout, checkpoint, expectedHash } = {}) {
  if (!checkpoint || typeof checkpoint !== 'object') throw new CheckpointSchedulerError('Checkpoint object is required.', 'ERR_CHECKPOINT_REQUIRED');
  try {
    assertCheckpointWithoutSecrets(checkpoint);
    return writeArtifactRecord({
      layout,
      category: 'checkpoints',
      filename: `${checkpoint.id}.json`,
      content: checkpoint,
      expectedHash,
      metadata: { kind: 'checkpoint', checkpointId: checkpoint.id, reason: checkpoint.reason, sequence: checkpoint.sequence }
    });
  } catch (error) {
    if (error instanceof ArtifactLayoutError) throw error;
    throw new CheckpointSchedulerError('Failed to write checkpoint artifact.', 'ERR_CHECKPOINT_WRITE', { cause: error.message });
  }
}

export function createCheckpointScheduler({ layout, runId, state = 'Running', now = () => new Date().toISOString() } = {}) {
  if (!layout) throw new CheckpointSchedulerError('Artifact layout is required.', 'ERR_CHECKPOINT_LAYOUT');
  if (!runId || typeof runId !== 'string') throw new CheckpointSchedulerError('Checkpoint scheduler runId is required.', 'ERR_CHECKPOINT_RUN_ID');
  let sequence = 0;
  const checkpoints = [];

  function checkpoint({ reason, attemptId = null, artifacts = [], externalEffects = [], metadata = {} } = {}) {
    const record = createCheckpointRecord({ runId, attemptId, state, reason, sequence: sequence + 1, artifacts, externalEffects, metadata, createdAt: now() });
    const artifact = writeCheckpointArtifact({ layout, checkpoint: record });
    sequence += 1;
    const result = deepFreezeCheckpoint({ checkpoint: record, artifact });
    checkpoints.push(result);
    return result;
  }

  return Object.freeze({
    checkpoint,
    checkpointUnitComplete: (options = {}) => checkpoint({ ...options, reason: 'unit-complete' }),
    checkpointBeforeApproval: (options = {}) => checkpoint({ ...options, reason: 'before-approval' }),
    checkpointBeforeRetry: (options = {}) => checkpoint({ ...options, reason: 'before-retry' }),
    checkpointBeforeShutdown: (options = {}) => checkpoint({ ...options, reason: 'before-shutdown' }),
    listCheckpoints: () => [...checkpoints]
  });
}

export async function runSafeShutdown({ runState = 'Running', scheduler, processManager, activeAttemptIds = [], timeoutMs = SAFE_SHUTDOWN_TIMEOUT_MS, now = () => Date.now() } = {}) {
  if (!scheduler || typeof scheduler.checkpointBeforeShutdown !== 'function') throw new CheckpointSchedulerError('Scheduler with checkpointBeforeShutdown is required.', 'ERR_SHUTDOWN_SCHEDULER');
  if (!processManager || typeof processManager.cancelAttempt !== 'function') throw new CheckpointSchedulerError('Process manager with cancelAttempt is required.', 'ERR_SHUTDOWN_PROCESS_MANAGER');
  if (!Array.isArray(activeAttemptIds)) throw new CheckpointSchedulerError('activeAttemptIds must be an array.', 'ERR_SHUTDOWN_ATTEMPTS');
  const startedAtMs = Number(now());
  const checkpoint = scheduler.checkpointBeforeShutdown({ metadata: { activeAttemptIds } });
  const cancellations = [];
  for (const attemptId of activeAttemptIds) {
    cancellations.push(await processManager.cancelAttempt({ attemptId }));
    if (Number(now()) - startedAtMs > timeoutMs) throw new CheckpointSchedulerError('Safe shutdown exceeded timeout.', 'ERR_SHUTDOWN_TIMEOUT', { timeoutMs });
  }
  const transition = assertRunTransition(runState, 'Service shutdown', { checkpointSaved: true, childProcessesClosed: true });
  return deepFreezeCheckpoint({
    checkpointSaved: true,
    childProcessesClosed: true,
    nextRunState: transition,
    checkpoint,
    cancellations,
    elapsedMs: Math.max(0, Number(now()) - startedAtMs),
    timeoutMs
  });
}

function normalizeArtifactRefs(artifacts) {
  if (!Array.isArray(artifacts)) throw new CheckpointSchedulerError('Checkpoint artifacts must be an array.', 'ERR_CHECKPOINT_ARTIFACTS');
  return artifacts.map((artifact) => {
    if (!artifact || typeof artifact !== 'object' || !artifact.path || !artifact.hash) throw new CheckpointSchedulerError('Checkpoint artifact refs require path and hash.', 'ERR_CHECKPOINT_ARTIFACT_REF', { artifact });
    return { path: String(artifact.path), hash: String(artifact.hash), kind: artifact.kind ? String(artifact.kind) : null };
  });
}

function normalizeExternalEffects(externalEffects) {
  if (!Array.isArray(externalEffects)) throw new CheckpointSchedulerError('Checkpoint externalEffects must be an array.', 'ERR_CHECKPOINT_EXTERNAL_EFFECTS');
  return externalEffects.map((effect) => {
    if (!effect || typeof effect !== 'object' || !effect.id || !effect.state) throw new CheckpointSchedulerError('External effect refs require id and state.', 'ERR_CHECKPOINT_EXTERNAL_EFFECT', { effect });
    return { id: String(effect.id), state: String(effect.state), verified: effect.verified === true };
  });
}

function deepFreezeCheckpoint(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeCheckpoint(child);
  return Object.freeze(value);
}
