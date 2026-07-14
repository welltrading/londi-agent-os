import { strict as assert } from 'node:assert';
import {
  FR_IDS,
  NFR_IDS,
  Q_IDS,
  MVP_ACCEPTANCE_IDS,
  ReleaseDecisionError,
  assertReleaseGo,
  createDefectRegister,
  createReleaseDecision,
  createTraceabilityMatrix,
  validateTraceabilityMatrix
} from '../packages/orchestrator/src/index.js';

const matrix = createTraceabilityMatrix();
assert.equal(matrix.fr.length, 30);
assert.equal(matrix.nfr.length, 15);
assert.equal(matrix.q.length, 34);
assert.equal(matrix.acceptance.length, 18);
assert.deepEqual(matrix.fr.map((row) => row.id), FR_IDS);
assert.deepEqual(matrix.nfr.map((row) => row.id), NFR_IDS);
assert.deepEqual(matrix.q.map((row) => row.id), Q_IDS);
assert.deepEqual(matrix.acceptance.map((row) => row.id), MVP_ACCEPTANCE_IDS);
for (const row of [...matrix.fr, ...matrix.nfr, ...matrix.q, ...matrix.acceptance]) {
  assert.equal(row.status, 'passed');
  assert.equal(row.tests.length > 0, true);
}
assert.equal(validateTraceabilityMatrix(matrix), true);

const defects = createDefectRegister({ defects: [
  { id: 'D-001', severity: 'Low', status: 'Deferred', approvedBy: 'Londi', note: 'Cosmetic polish after MVP.' },
  { id: 'D-002', severity: 'Medium', status: 'Closed' }
] });
assert.equal(defects.length, 2);
assert.throws(() => createDefectRegister({ defects: [{ id: 'D-C', severity: 'Critical', status: 'Open' }] }), ReleaseDecisionError);
assert.throws(() => createDefectRegister({ defects: [{ id: 'D-L', severity: 'Low', status: 'Deferred' }] }), ReleaseDecisionError);

const decision = createReleaseDecision({ matrix, defects, ciStatus: 'passed', decidedBy: 'Londi' });
assert.equal(decision.decision, 'Go');
assert.equal(decision.traceability.coverage, '100%');
assert.equal(decision.traceability.total, 97);
assert.equal(decision.openCritical, 0);
assert.equal(decision.deferredApproved, true);
assert.equal(assertReleaseGo(decision), true);

const badMatrix = { ...matrix, fr: matrix.fr.slice(1) };
assert.throws(() => validateTraceabilityMatrix(badMatrix), ReleaseDecisionError);
assert.equal(createReleaseDecision({ matrix, defects, ciStatus: 'failed' }).decision, 'No-Go');

console.log('Release decision tests OK');
