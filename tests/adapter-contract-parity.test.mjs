import { strict as assert } from 'node:assert';
import { ADAPTER_OPERATIONS } from '../packages/adapters/src/index.js';
import { buildAdapterContractParityReport } from '../scripts/check-adapter-contract-parity.mjs';

const { report, markdown } = buildAdapterContractParityReport();

assert.equal(report.coveragePercent, 100);
assert.equal(report.parityOk, true);
assert.equal(report.orchestratorBranchOk, true);
assert.equal(report.adapters.length, 2);
assert.deepEqual(report.contractOperations, ADAPTER_OPERATIONS);
for (const adapter of report.adapters) {
  assert.equal(adapter.implementationOperations.length, ADAPTER_OPERATIONS.length);
  assert.equal(adapter.testedOperations.length, ADAPTER_OPERATIONS.length);
  assert.deepEqual(adapter.missingImplementationOperations, []);
  assert.deepEqual(adapter.missingTestOperations, []);
}
for (const row of report.operationRows) {
  assert.equal(row.parity, true);
  assert.equal(row.testedBy['claude-code'], true);
  assert.equal(row.testedBy.codex, true);
}
assert.match(markdown, /E3-T07 Adapter Contract Parity Report/);
assert.match(markdown, /Contract coverage parity: \*\*100%\*\*/);

console.log('Adapter contract parity tests OK');
