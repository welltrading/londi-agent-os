import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PERFORMANCE_TARGETS,
  createLogRotationPolicy,
  createPerformanceValidationReport,
  createRestoreDrillDataset,
  createRestoreDrillReport,
  createScaleDataset,
  evaluatePerformanceTargets,
  percentile,
  rotateLogIfNeeded
} from '../packages/orchestrator/src/index.js';

assert.equal(percentile([1, 2, 3, 4, 5], 95), 5);
assert.equal(percentile([300, 100, 200], 50), 200);

const scale = createScaleDataset({ runCount: 100, eventCount: 100_000 });
assert.equal(scale.runs.length, 100);
assert.equal(scale.eventCount, 100_000);
assert.equal(scale.store.listEvents({ afterEventId: 99_999, limit: 10 }).length, 1);

const root = mkdtempSync(join(tmpdir(), 'londi-perf-'));
try {
  const policy = createLogRotationPolicy();
  assert.equal(policy.maxBytes, 20 * 1024 * 1024);
  assert.equal(policy.maxParts, 5);
  const logPath = join(root, 'attempt.log');
  writeFileSync(logPath, Buffer.alloc(policy.maxBytes, 1));
  const rotation = rotateLogIfNeeded({ logPath, policy });
  assert.equal(rotation.rotated, true);
  assert.equal(rotation.verified, true);
  assert.equal(existsSync(`${logPath}.1`), true);
  assert.equal(statSync(logPath).size, 0);

  const dataset = createRestoreDrillDataset({ datasetPath: join(root, 'restore-dataset.bin'), bytes: PERFORMANCE_TARGETS.restoreDatasetBytes, sparse: true });
  assert.equal(dataset.bytes, PERFORMANCE_TARGETS.restoreDatasetBytes);
  const restoreDrill = createRestoreDrillReport({ dataset, startedAt: '2026-07-14T00:00:00.000Z', finishedAt: '2026-07-14T00:10:00.000Z' });
  assert.equal(restoreDrill.integrityVerified, true);
  assert.equal(restoreDrill.durationMs, 600_000);

  const validation = evaluatePerformanceTargets({
    restReads: [100, 120, 150, 250, 299],
    restWrites: [200, 300, 400, 650, 699],
    sseLatencies: [100, 200, 300, 900, 999],
    runCount: scale.runs.length,
    eventCount: scale.eventCount,
    logRotation: rotation,
    restoreDrill
  });
  assert.equal(validation.passed, true);
  assert.equal(validation.checks.find((check) => check.id === 'NFR-003.rest-read-p95').passed, true);
  assert.equal(validation.checks.find((check) => check.id === 'NFR-004.sse-event-p95').passed, true);
  assert.equal(validation.checks.find((check) => check.id === 'NFR-011.log-rotation-size').passed, true);
  assert.equal(validation.checks.find((check) => check.id === 'NFR-015.restore-drill').passed, true);
  const report = createPerformanceValidationReport({ validation, generatedAt: '2026-07-14T00:11:00.000Z' });
  assert.deepEqual(report.nfr, ['NFR-003', 'NFR-004', 'NFR-011', 'NFR-015']);

  const failed = evaluatePerformanceTargets({ restReads: [301], restWrites: [701], sseLatencies: [1001], runCount: 99, eventCount: 99_999, logRotation: { ...rotation, verified: false }, restoreDrill: { ...restoreDrill, durationMs: 901_000 } });
  assert.equal(failed.passed, false);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('Performance scale validation tests OK');
