import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  RECOVERY_ACTIONS,
  RECOVERY_CHECK_STATUSES,
  RestartRecoveryError,
  assertRecoveryActionAvailable,
  createArtifactLayout,
  createRecoveryConsistencyReport,
  verifyExternalEffectsForRecovery,
  writeArtifactRecord,
  writeArtifactManifest
} from '../packages/orchestrator/src/index.js';

const root = mkdtempSync(join(tmpdir(), 'londi-recovery-'));
try {
  const layout = createArtifactLayout({ runId: 'run-recovery', artifactsRoot: join(root, 'artifacts') });
  const checkpointRecord = writeArtifactRecord({ layout, category: 'checkpoints', filename: 'checkpoint.json', content: { safeToResume: true, runId: 'run-recovery' }, metadata: { kind: 'checkpoint' } });
  const summary = writeArtifactRecord({ layout, category: 'summary', filename: 'summary.json', content: { ok: true } });
  const manifest = writeArtifactManifest({ layout, records: [checkpointRecord, summary] }).manifest;
  const worktreePath = join(root, 'worktree');
  const manifestPath = join(worktreePath, 'londi-workspace-manifest.json');
  await import('node:fs').then(({ mkdirSync }) => mkdirSync(worktreePath, { recursive: true }));
  writeFileSync(manifestPath, `${JSON.stringify({ runId: 'run-recovery', baseCommit: 'abc123' })}\n`, 'utf8');

  assert.deepEqual(RECOVERY_ACTIONS, ['Resume', 'Replace', 'Stop']);
  assert.equal(RECOVERY_CHECK_STATUSES.includes('Verified'), true);
  const report = createRecoveryConsistencyReport({
    run: { runId: 'run-recovery', state: 'Running' },
    checkpoint: { id: 'chk-1', safeToResume: true, sequence: 1, path: checkpointRecord.path },
    artifactManifest: manifest,
    workspace: { runId: 'run-recovery', worktreePath, manifestPath, baseCommit: 'abc123' },
    processSnapshot: { activeAttempts: [] },
    externalEffects: [{ id: 'effect-1', state: 'Known', verified: true }]
  });
  assert.equal(report.recoveredState, 'Recovery Required');
  assert.equal(report.autoResume, false);
  assert.equal(report.blocked, false);
  assert.equal(report.actions.Resume.enabled, true);
  assert.equal(assertRecoveryActionAvailable(report, 'Resume'), true);

  const withLiveProcess = createRecoveryConsistencyReport({
    run: { runId: 'run-recovery', state: 'Running' },
    checkpoint: { id: 'chk-1', safeToResume: true, sequence: 1, path: checkpointRecord.path },
    artifactManifest: manifest,
    workspace: { runId: 'run-recovery', worktreePath, manifestPath },
    processSnapshot: { activeAttempts: ['attempt-1'] },
    externalEffects: []
  });
  assert.equal(withLiveProcess.blocked, true);
  assert.equal(withLiveProcess.actions.Resume.enabled, false);
  assert.throws(() => assertRecoveryActionAvailable(withLiveProcess, 'Resume'), RestartRecoveryError);

  const unknownExternal = createRecoveryConsistencyReport({
    run: { runId: 'run-recovery', state: 'Running' },
    checkpoint: { id: 'chk-1', safeToResume: true, sequence: 1, path: checkpointRecord.path },
    artifactManifest: manifest,
    workspace: { runId: 'run-recovery', worktreePath, manifestPath },
    processSnapshot: { activeAttempts: [] },
    externalEffects: [{ id: 'effect-unknown', state: 'Unknown' }]
  });
  assert.equal(unknownExternal.actions.Resume.enabled, false);
  assert.equal(unknownExternal.actions.Replace.enabled, false);
  assert.equal(unknownExternal.actions.Stop.enabled, true);
  assert.equal(verifyExternalEffectsForRecovery([{ id: 'none', state: 'None' }]).status, 'Verified');
  assert.throws(() => assertRecoveryActionAvailable(report, 'Bad'), RestartRecoveryError);

  writeFileSync(summary.path, 'tampered', 'utf8');
  const tampered = createRecoveryConsistencyReport({
    run: { runId: 'run-recovery', state: 'Running' },
    checkpoint: { id: 'chk-1', safeToResume: true, sequence: 1, path: checkpointRecord.path },
    artifactManifest: manifest,
    workspace: { runId: 'run-recovery', worktreePath, manifestPath },
    processSnapshot: { activeAttempts: [] },
    externalEffects: []
  });
  assert.equal(tampered.checks.find((item) => item.name === 'artifact-manifest').status, 'Mismatch');

  console.log('Restart recovery tests OK');
} finally {
  rmSync(root, { recursive: true, force: true });
}
