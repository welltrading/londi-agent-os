import { strict as assert } from 'node:assert';
import {
  ADAPTER_CONTRACT_VERSION,
  ADAPTER_OPERATIONS,
  ADAPTER_OUTCOMES,
  AdapterContractError,
  assertAdapterContractImplementation,
  createAdapterDescriptor,
  createNullAdapterContractHarness,
  normalizeAdapterResult
} from '../packages/adapters/src/index.js';

assert.equal(ADAPTER_CONTRACT_VERSION, '0.1.0');
assert.deepEqual(ADAPTER_OPERATIONS, [
  'health',
  'capabilities',
  'start',
  'deliverTask',
  'heartbeat',
  'checkpoint',
  'cancel',
  'resume',
  'collectArtifacts'
]);
assert.deepEqual(ADAPTER_OUTCOMES, [
  'success',
  'recoverable_failure',
  'terminal_failure',
  'cancelled',
  'unknown'
]);

const descriptor = createAdapterDescriptor({
  adapterId: 'claude-code',
  displayName: 'Claude Code',
  version: '1.2.3',
  executable: 'claude'
});
assert.equal(descriptor.contractVersion, ADAPTER_CONTRACT_VERSION);
assert.equal(descriptor.adapterId, 'claude-code');
assert.deepEqual(descriptor.operations, ADAPTER_OPERATIONS);
assert.throws(
  () => createAdapterDescriptor({ adapterId: 'bad', displayName: 'Bad', version: '0.0.1', operations: ['health'] }),
  AdapterContractError
);

const success = normalizeAdapterResult({ operation: 'health', status: 'ok', data: { healthy: true } });
assert.equal(success.outcome, 'success');
assert.equal(success.ok, true);
assert.equal(success.recoverable, false);
assert.equal(success.terminal, false);

const recoverable = normalizeAdapterResult({ operation: 'deliverTask', status: 'failed', recoverable: true, error: 'rate limited' });
assert.equal(recoverable.outcome, 'recoverable_failure');
assert.equal(recoverable.ok, false);
assert.equal(recoverable.recoverable, true);
assert.equal(recoverable.terminal, false);
assert.equal(recoverable.error.message, 'rate limited');

const terminal = normalizeAdapterResult({ operation: 'start', status: 'failed', exitCode: 2, error: { message: 'auth failed', code: 'AUTH' } });
assert.equal(terminal.outcome, 'terminal_failure');
assert.equal(terminal.ok, false);
assert.equal(terminal.terminal, true);
assert.equal(terminal.error.code, 'AUTH');

const cancelled = normalizeAdapterResult({ operation: 'cancel', status: 'cancelled', signal: 'SIGTERM' });
assert.equal(cancelled.outcome, 'cancelled');
assert.equal(cancelled.terminal, true);
assert.equal(cancelled.signal, 'SIGTERM');

const unknown = normalizeAdapterResult({ operation: 'checkpoint', status: 'strange' });
assert.equal(unknown.outcome, 'unknown');
assert.equal(unknown.ok, false);
assert.equal(unknown.terminal, false);
assert.throws(() => normalizeAdapterResult({ operation: 'unsupported', outcome: 'success' }), AdapterContractError);

const harness = createNullAdapterContractHarness({ adapterId: 'harness-1' });
assertAdapterContractImplementation(harness);
for (const operation of ADAPTER_OPERATIONS) {
  const result = await harness[operation]({});
  assert.equal(result.operation, operation);
  assert.equal(ADAPTER_OUTCOMES.includes(result.outcome), true);
}
assert.throws(() => assertAdapterContractImplementation({ health() {} }), AdapterContractError);

console.log('Adapter contract tests OK');
