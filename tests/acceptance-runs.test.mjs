import { strict as assert } from 'node:assert';
import {
  ACCEPTANCE_RUN_COUNT,
  AcceptanceRunsError,
  assertAcceptanceRunsReport,
  createAcceptanceRunsReport,
  runFiveAcceptanceRuns
} from '../packages/orchestrator/src/index.js';

const report = await runFiveAcceptanceRuns();
assert.equal(report.runs.length, ACCEPTANCE_RUN_COUNT);
assert.equal(report.signed, true);
assert.equal(report.consecutive, true);
assert.equal(report.coverage.adapters['claude-code'] >= 2, true);
assert.equal(report.coverage.adapters.codex >= 2, true);
assert.equal(report.coverage.templates.direct >= 1, true);
assert.equal(report.coverage.templates['plan-build'] >= 1, true);
assert.equal(report.coverage.templates['plan-build-review'] >= 1, true);
assert.equal(report.coverage.features.restart, true);
assert.equal(report.coverage.features.secret, true);
assert.equal(report.coverage.features.sensitiveApproval, true);
assert.equal(report.coverage.features.manualMerge, true);
assert.equal(report.coverage.features.auditExport, true);
assert.equal(JSON.stringify(report).includes('secret-token-value'), false);
for (const run of report.runs) {
  assert.equal(run.repository.realGitProject, true);
  assert.equal(run.gates.manualMerge, 'Verified');
  assert.equal(run.adapterBoundary.processSpawned, true);
  assert.equal(run.adapterBoundary.processCancelled, true);
  assert.equal(run.adapterBoundary.health, 'success');
  assert.equal(run.adapterBoundary.start, 'success');
  assert.equal(run.adapterBoundary.cancel, 'cancelled');
  assert.equal(run.result, 'Passed');
}
assert.equal(assertAcceptanceRunsReport(report), true);
assert.throws(() => assertAcceptanceRunsReport(createAcceptanceRunsReport({ signedBy: 'x', runs: report.runs.slice(0, 4) })), AcceptanceRunsError);
assert.throws(() => assertAcceptanceRunsReport({ ...report, signed: false }), AcceptanceRunsError);

console.log('Acceptance runs tests OK');
