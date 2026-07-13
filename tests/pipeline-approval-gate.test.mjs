import { strict as assert } from 'node:assert';
import { getPipelineTemplate } from '../packages/contracts/src/index.js';
import {
  PIPELINE_APPROVAL_GATE_ID,
  PIPELINE_APPROVAL_GATE_KIND,
  PipelineApprovalGateError,
  createPipelineApprovalGate,
  createPipelineApprovalPayload,
  decidePipelineApprovalGate,
  hashApprovalPayload,
  invalidatePipelineApprovalOnConfigChange
} from '../packages/orchestrator/src/index.js';

const baseConfig = {
  template: getPipelineTemplate('plan-build'),
  assignments: { planner: 'claude-code', builder: 'codex' },
  context: { task: 'Implement feature', projectPath: 'repo', obsidianSnapshot: 'snap-1' },
  preflight: { status: 'Ready', warnings: [] },
  permissions: { filesystem: 'workspace-write', commands: ['npm test'] },
  network: { mode: 'restricted', allowedHosts: ['api.github.com'] },
  secretAliases: ['OPENAI_API_KEY']
};

const payload = createPipelineApprovalPayload(baseConfig);
assert.equal(payload.gate, PIPELINE_APPROVAL_GATE_ID);
assert.equal(payload.template.id, 'plan-build');
assert.equal(payload.agentProcessStarted, false);
assert.equal(Object.isFrozen(payload), true);

const request = createPipelineApprovalGate({
  id: 'gate-a-1',
  runId: 'run-1',
  ...baseConfig,
  revisionHash: 'revision-1',
  requestedAt: '2026-01-01T00:00:00.000Z'
});
assert.equal(request.kind, PIPELINE_APPROVAL_GATE_KIND);
assert.equal(request.scope.gate, PIPELINE_APPROVAL_GATE_ID);
assert.equal(request.scope.templateId, 'plan-build');
assert.equal(request.payloadHash, hashApprovalPayload(payload));

const decision = decidePipelineApprovalGate(request, {
  actor: 'londi',
  decision: 'approve',
  payloadHash: request.payloadHash,
  revisionHash: request.revisionHash,
  timestamp: '2026-01-01T00:05:00.000Z'
});
assert.equal(decision.state, 'Approved');
assert.equal(decision.requestId, 'gate-a-1');

assert.throws(() => createPipelineApprovalGate({ ...baseConfig, revisionHash: 'revision-1', agentProcessStarted: true }), PipelineApprovalGateError);
assert.throws(() => createPipelineApprovalPayload({ ...baseConfig, secretAliases: [''] }), PipelineApprovalGateError);
assert.throws(() => createPipelineApprovalPayload({ ...baseConfig, context: { leaked: `sk-${'abcdefghijklmnopqrstuvwxyz123456'}` } }), PipelineApprovalGateError);

const unchanged = invalidatePipelineApprovalOnConfigChange(request, baseConfig);
assert.equal(unchanged, request);
const changed = invalidatePipelineApprovalOnConfigChange(request, { ...baseConfig, network: { mode: 'none', allowedHosts: [] } });
assert.equal(changed.state, 'Invalidated');

console.log('Pipeline approval gate tests OK');
