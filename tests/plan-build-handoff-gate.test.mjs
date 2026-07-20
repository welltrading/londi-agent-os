import { strict as assert } from 'node:assert';
import { getPipelineTemplate } from '@londi-agent-os/contracts';
import {
  HandoffError,
  assertBuildReceivesApprovedHandoff,
  createHandoffApprovalGate,
  createHandoffRevision,
  decideHandoffApprovalGate,
  createHandoffApprovalPayload,
  hashApprovalPayload,
  markHandoffRevisionApproved
} from '../packages/orchestrator/src/index.js';

function makeRevision({ revision = 1, objective = 'Implement the approved Plan & Build slice.', createdAt = '2026-01-01T00:00:00.000Z' } = {}) {
  return createHandoffRevision({
    runId: 'run-plan-build-1',
    stepId: 'build',
    revision,
    author: 'planner',
    createdAt,
    objective,
    approvedScope: ['Build only from the approved handoff artifact.'],
    contextSummary: 'Gate A approved the Plan & Build template and workspace policy.',
    implementationInstructions: ['Use the handoff as the complete builder context.', 'Do not use any stale handoff approval.'],
    constraints: ['Build must remain blocked until Gate B approves the exact handoff.md revision.'],
    acceptanceCriteria: ['Unapproved handoff revisions cannot start Build.', 'Changed handoff content invalidates prior approval.'],
    allowedFiles: ['packages/orchestrator/src/handoff.js', 'tests/plan-build-handoff-gate.test.mjs'],
    requiredChecks: ['node tests/plan-build-handoff-gate.test.mjs']
  });
}

function approveRevision(revision, id = `gate-b-${revision.runId}-r${revision.revision}`) {
  const request = createHandoffApprovalGate({
    id,
    runId: revision.runId,
    stepId: revision.stepId,
    handoffRevision: revision,
    requestedAt: '2026-01-01T00:01:00.000Z'
  });
  assert.equal(request.revisionHash, revision.hash);
  const decision = decideHandoffApprovalGate(request, {
    actor: 'londi',
    decision: 'approve',
    payloadHash: request.payloadHash,
    revisionHash: request.revisionHash,
    timestamp: '2026-01-01T00:05:00.000Z'
  });
  return { request, decision, approved: markHandoffRevisionApproved(revision, decision) };
}

const template = getPipelineTemplate('plan-build');
const buildStep = template.steps.find((step) => step.id === 'build');
assert.equal(template.policies.requiresHandoff, true);
assert.equal(buildStep.handoffRequired, true);
assert.equal(template.gates.includes('handoff-approval'), true);

const revision1 = makeRevision();
assert.throws(() => assertBuildReceivesApprovedHandoff(revision1), HandoffError, 'Build must be blocked before Gate B approval.');

const approval1 = approveRevision(revision1, 'gate-b-run-plan-build-1-r1');
assert.equal(approval1.request.payloadHash, hashApprovalPayload(createHandoffApprovalPayload(revision1)));
assert.equal(assertBuildReceivesApprovedHandoff(approval1.approved), true, 'Build can start with the exact approved handoff revision.');

const revision2 = makeRevision({
  revision: 2,
  objective: 'Implement the approved Plan & Build slice after a handoff edit.',
  createdAt: '2026-01-01T00:10:00.000Z'
});
assert.notEqual(revision2.hash, revision1.hash, 'A handoff edit must produce a new revision hash.');
assert.throws(() => markHandoffRevisionApproved(revision2, approval1.decision), HandoffError, 'A prior Gate B decision must not approve a changed handoff revision.');
assert.throws(() => assertBuildReceivesApprovedHandoff(revision2), HandoffError, 'Edited handoff revisions must be blocked until re-approved.');

const approval2 = approveRevision(revision2, 'gate-b-run-plan-build-1-r2');
assert.equal(assertBuildReceivesApprovedHandoff(approval2.approved), true, 'Build can start only after the edited handoff revision is re-approved.');

console.log('Plan & Build handoff gate tests OK');
