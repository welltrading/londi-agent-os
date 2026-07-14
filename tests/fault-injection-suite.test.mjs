import { strict as assert } from 'node:assert';
import {
  FAULT_INJECTION_SCENARIOS,
  runFaultInjectionScenario,
  runFaultInjectionSuite,
  validateFaultScenarioResult
} from '../packages/orchestrator/src/index.js';

assert.deepEqual(FAULT_INJECTION_SCENARIOS, [
  'kill-agent',
  'kill-service',
  'disconnect-ui',
  'lock-db',
  'corrupt-artifact',
  'network-loss',
  'full-disk',
  'expired-approval',
  'unknown-external-effect'
]);

for (const scenario of FAULT_INJECTION_SCENARIOS) {
  const result = runFaultInjectionScenario({ scenario });
  assert.equal(result.passed, true, `${scenario}: ${result.failures.join(', ')}`);
  assert.equal(result.audit.length >= 1, true, `${scenario} audit missing`);
  assert.equal(result.externalActionExecutions <= 1, true, `${scenario} duplicated external action`);
  assert.equal((result.orphanProcesses ?? []).length, 0, `${scenario} orphan process`);
}

const suite = runFaultInjectionSuite();
assert.equal(suite.passed, true);
assert.equal(suite.scenarios.length, FAULT_INJECTION_SCENARIOS.length);

const failed = validateFaultScenarioResult({
  scenario: 'kill-agent',
  expected: { state: 'Unresponsive', checkpointRequired: true, noOrphanProcess: true },
  result: { state: 'Running', checkpoint: null, audit: [], orphanProcesses: [{ pid: 123 }], externalActionExecutions: 0 }
});
assert.equal(failed.passed, false);
assert.equal(failed.failures.includes('state expected Unresponsive got Running'), true);
assert.equal(failed.failures.includes('checkpoint missing or unsafe'), true);
assert.equal(failed.failures.includes('orphan process detected'), true);
assert.equal(failed.failures.includes('audit event missing'), true);

console.log('Fault injection suite tests OK');
