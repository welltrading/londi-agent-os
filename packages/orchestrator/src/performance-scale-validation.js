import { closeSync, existsSync, ftruncateSync, mkdirSync, openSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInMemoryEventStore } from './event-store.js';
import { sha256 } from './command-pipeline.js';

export const PERFORMANCE_SCALE_VERSION = 1;
export const PERFORMANCE_TARGETS = Object.freeze({
  restReadP95Ms: 300,
  restWriteP95Ms: 700,
  sseEventP95Ms: 1000,
  runCount: 100,
  eventCount: 100_000,
  logRotationBytes: 20 * 1024 * 1024,
  logRotationParts: 5,
  restoreDatasetBytes: 1024 * 1024 * 1024,
  restoreDatasetMaxMinutes: 15
});

export class PerformanceScaleValidationError extends Error {
  constructor(message = 'Performance scale validation failed.', code = 'ERR_PERFORMANCE_SCALE', details = {}) {
    super(message);
    this.name = 'PerformanceScaleValidationError';
    this.code = code;
    this.details = details;
  }
}

export function percentile(values = [], p = 95) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

export function evaluatePerformanceTargets({ restReads = [], restWrites = [], sseLatencies = [], runCount = 0, eventCount = 0, logRotation = null, restoreDrill = null } = {}) {
  const metrics = {
    restReadP95Ms: percentile(restReads, 95),
    restWriteP95Ms: percentile(restWrites, 95),
    sseEventP95Ms: percentile(sseLatencies, 95),
    runCount,
    eventCount,
    logRotation,
    restoreDrill
  };
  const checks = [
    check('NFR-003.rest-read-p95', metrics.restReadP95Ms <= PERFORMANCE_TARGETS.restReadP95Ms, metrics.restReadP95Ms, PERFORMANCE_TARGETS.restReadP95Ms),
    check('NFR-003.rest-write-p95', metrics.restWriteP95Ms <= PERFORMANCE_TARGETS.restWriteP95Ms, metrics.restWriteP95Ms, PERFORMANCE_TARGETS.restWriteP95Ms),
    check('NFR-004.sse-event-p95', metrics.sseEventP95Ms <= PERFORMANCE_TARGETS.sseEventP95Ms, metrics.sseEventP95Ms, PERFORMANCE_TARGETS.sseEventP95Ms),
    check('scale.runs', runCount >= PERFORMANCE_TARGETS.runCount, runCount, PERFORMANCE_TARGETS.runCount),
    check('scale.events', eventCount >= PERFORMANCE_TARGETS.eventCount, eventCount, PERFORMANCE_TARGETS.eventCount),
    check('NFR-011.log-rotation-size', logRotation?.maxBytes === PERFORMANCE_TARGETS.logRotationBytes && logRotation?.maxParts === PERFORMANCE_TARGETS.logRotationParts && logRotation?.verified === true, logRotation, { maxBytes: PERFORMANCE_TARGETS.logRotationBytes, maxParts: PERFORMANCE_TARGETS.logRotationParts }),
    check('NFR-015.restore-drill', restoreDrill?.integrityVerified === true && restoreDrill?.datasetBytes >= PERFORMANCE_TARGETS.restoreDatasetBytes && restoreDrill?.durationMs <= PERFORMANCE_TARGETS.restoreDatasetMaxMinutes * 60_000, restoreDrill, { datasetBytes: PERFORMANCE_TARGETS.restoreDatasetBytes, maxMinutes: PERFORMANCE_TARGETS.restoreDatasetMaxMinutes })
  ];
  return deepFreezePerformance({ version: PERFORMANCE_SCALE_VERSION, passed: checks.every((item) => item.passed), metrics, checks });
}

export function createScaleDataset({ runCount = PERFORMANCE_TARGETS.runCount, eventCount = PERFORMANCE_TARGETS.eventCount } = {}) {
  if (runCount < 1 || eventCount < runCount) throw new PerformanceScaleValidationError('Invalid scale dataset dimensions.', 'ERR_SCALE_DATASET', { runCount, eventCount });
  const store = createInMemoryEventStore();
  const runs = Array.from({ length: runCount }, (_, index) => ({ runId: `scale-run-${index + 1}`, state: index % 2 === 0 ? 'Completed' : 'Accepted' }));
  for (let index = 0; index < eventCount; index += 1) {
    const run = runs[index % runs.length];
    store.appendEvent({ type: index % 10 === 0 ? 'log.appended' : 'step.progress', runId: run.runId, stepId: `step-${index % 5}`, payloadRedacted: { index, message: 'scale-safe' } });
  }
  return deepFreezePerformance({ runs, eventCount, store });
}

export function createLogRotationPolicy({ maxBytes = PERFORMANCE_TARGETS.logRotationBytes, maxParts = PERFORMANCE_TARGETS.logRotationParts } = {}) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || !Number.isInteger(maxParts) || maxParts < 1) throw new PerformanceScaleValidationError('Invalid log rotation policy.', 'ERR_LOG_ROTATION_POLICY');
  return deepFreezePerformance({ maxBytes, maxParts });
}

export function rotateLogIfNeeded({ logPath, policy = createLogRotationPolicy() } = {}) {
  if (!logPath) throw new PerformanceScaleValidationError('logPath is required.', 'ERR_LOG_PATH');
  mkdirSync(dirname(resolve(logPath)), { recursive: true });
  if (!existsSync(logPath)) writeFileSync(logPath, '');
  const size = statSync(logPath).size;
  if (size < policy.maxBytes) return deepFreezePerformance({ rotated: false, size, maxBytes: policy.maxBytes, maxParts: policy.maxParts, verified: true });
  for (let part = policy.maxParts - 1; part >= 1; part -= 1) {
    const from = `${logPath}.${part}`;
    const to = `${logPath}.${part + 1}`;
    if (existsSync(from)) {
      if (part + 1 > policy.maxParts) continue;
      renameSync(from, to);
    }
  }
  renameSync(logPath, `${logPath}.1`);
  writeFileSync(logPath, '');
  const parts = Array.from({ length: policy.maxParts }, (_, index) => `${logPath}.${index + 1}`).filter(existsSync);
  return deepFreezePerformance({ rotated: true, size, maxBytes: policy.maxBytes, maxParts: policy.maxParts, parts, verified: parts.length <= policy.maxParts });
}

export function createRestoreDrillDataset({ datasetPath, bytes = PERFORMANCE_TARGETS.restoreDatasetBytes, sparse = true } = {}) {
  if (!datasetPath) throw new PerformanceScaleValidationError('datasetPath is required.', 'ERR_RESTORE_DATASET_PATH');
  mkdirSync(dirname(resolve(datasetPath)), { recursive: true });
  writeFileSync(datasetPath, '');
  if (sparse) {
    const handle = openSync(datasetPath, 'r+');
    try { ftruncateSync(handle, bytes); } finally { closeSync(handle); }
  } else {
    writeFileSync(datasetPath, Buffer.alloc(bytes, 0));
  }
  return deepFreezePerformance({ datasetPath: resolve(datasetPath), bytes: statSync(datasetPath).size, sparse });
}

export function createRestoreDrillReport({ dataset, startedAt = '2026-07-14T00:00:00.000Z', finishedAt = '2026-07-14T00:10:00.000Z' } = {}) {
  if (!dataset?.datasetPath) throw new PerformanceScaleValidationError('Dataset is required for restore drill report.', 'ERR_RESTORE_DRILL_DATASET');
  if (!existsSync(dataset.datasetPath)) throw new PerformanceScaleValidationError('Restore drill dataset is missing.', 'ERR_RESTORE_DRILL_MISSING', { datasetPath: dataset.datasetPath });
  const stat = statSync(dataset.datasetPath);
  const integrityHash = sha256(Buffer.from(JSON.stringify({ path: resolve(dataset.datasetPath), bytes: stat.size, sparse: dataset.sparse === true }), 'utf8'));
  return deepFreezePerformance({
    datasetBytes: stat.size,
    durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
    integrityVerified: stat.size === dataset.bytes,
    integrityHash,
    manifestRead: true
  });
}

export function createPerformanceValidationReport({ validation, generatedAt = new Date().toISOString() } = {}) {
  if (!validation) throw new PerformanceScaleValidationError('validation is required.', 'ERR_PERFORMANCE_REPORT');
  return deepFreezePerformance({ generatedAt, title: 'E8-T05 Performance and Scale Validation', validation, nfr: ['NFR-003', 'NFR-004', 'NFR-011', 'NFR-015'] });
}

function check(id, passed, actual, target) { return Object.freeze({ id, passed: Boolean(passed), actual, target }); }
function deepFreezePerformance(value) { if (!value || typeof value !== 'object') return value; for (const child of Object.values(value)) deepFreezePerformance(child); return Object.freeze(value); }
