import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ArtifactLayoutError,
  CHECKPOINT_REASONS,
  CheckpointSchedulerError,
  SAFE_SHUTDOWN_TIMEOUT_MS,
  createArtifactLayout,
  createAttemptProcessManager,
  createCheckpointRecord,
  createCheckpointScheduler,
  runSafeShutdown,
  verifyArtifactRecord
} from '../packages/orchestrator/src/index.js';

const root = mkdtempSync(join(tmpdir(), 'londi-checkpoints-'));
try {
  const layout = createArtifactLayout({ runId: 'run-shutdown', artifactsRoot: join(root, 'artifacts'), createdAt: '2026-01-01T00:00:00.000Z' });
  assert.deepEqual(CHECKPOINT_REASONS, ['unit-complete', 'before-approval', 'before-retry', 'before-shutdown']);
  assert.equal(SAFE_SHUTDOWN_TIMEOUT_MS, 30000);

  const scheduler = createCheckpointScheduler({ layout, runId: 'run-shutdown', now: () => '2026-01-01T00:00:01.000Z' });
  const unit = scheduler.checkpointUnitComplete({ metadata: { stepId: 'build' }, artifacts: [{ path: '/tmp/diff.patch', hash: 'hash-1', kind: 'diff' }] });
  assert.equal(unit.checkpoint.reason, 'unit-complete');
  assert.equal(unit.checkpoint.safeToResume, true);
  assert.equal(verifyArtifactRecord(unit.artifact), true);

  const approval = scheduler.checkpointBeforeApproval({ metadata: { gateId: 'Gate B' } });
  const retry = scheduler.checkpointBeforeRetry({ externalEffects: [{ id: 'net-1', state: 'Verified', verified: true }] });
  assert.equal(approval.checkpoint.sequence, 2);
  assert.equal(retry.checkpoint.reason, 'before-retry');
  assert.equal(scheduler.listCheckpoints().length, 3);

  assert.throws(() => createCheckpointRecord({ runId: 'run', reason: 'bad', sequence: 1 }), CheckpointSchedulerError);
  assert.throws(() => createCheckpointRecord({ runId: 'run', reason: 'unit-complete', sequence: 1, metadata: { token: `sk-${'abcdefghijklmnopqrstuvwxyz'}` } }), ArtifactLayoutError);

  const manager = createAttemptProcessManager({ killTimeoutMs: 100 });
  const attempt = manager.startAttempt({ attemptId: 'attempt-shutdown', command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'] });
  assert.equal(attempt.status, 'Running');
  const shutdown = await runSafeShutdown({
    runState: 'Running',
    scheduler,
    processManager: manager,
    activeAttemptIds: ['attempt-shutdown'],
    now: (() => { let t = 0; return () => (t += 10); })()
  });
  assert.equal(shutdown.checkpointSaved, true);
  assert.equal(shutdown.childProcessesClosed, true);
  assert.equal(shutdown.nextRunState, 'Recovery Required');
  assert.equal(shutdown.cancellations[0].status, 'Cancelled');
  assert.equal(shutdown.checkpoint.checkpoint.reason, 'before-shutdown');

  console.log('Checkpoint scheduler tests OK');
} finally {
  rmSync(root, { recursive: true, force: true });
}
