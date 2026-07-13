import { strict as assert } from 'node:assert';
import {
  HANDOFF_ARTIFACT_FILENAME,
  HANDOFF_APPROVAL_GATE_ID,
  HANDOFF_APPROVAL_KIND,
  HANDOFF_REQUIRED_SECTIONS,
  HandoffError,
  assertBuildReceivesApprovedHandoff,
  createHandoffApprovalGate,
  createHandoffApprovalPayload,
  createHandoffRevision,
  decideHandoffApprovalGate,
  hashApprovalPayload,
  markHandoffRevisionApproved
} from '../packages/orchestrator/src/index.js';

const revision = createHandoffRevision({
  runId: 'run-1',
  stepId: 'build',
  revision: 1,
  author: 'planner',
  createdAt: '2026-01-01T00:00:00.000Z',
  objective: 'Implement the approved local orchestration slice.',
  approvedScope: ['Create the handoff contract only.'],
  contextSummary: 'Pipeline template and Gate A approval are already available.',
  implementationInstructions: ['Generate a structured handoff.md artifact.', 'Track revision hash before approval.'],
  constraints: ['Do not include source dialogues or logs.', 'Do not start build without Gate B approval.'],
  acceptanceCriteria: ['All required sections exist.', 'Build receives only an approved revision.'],
  allowedFiles: ['packages/orchestrator/src/handoff.js', 'tests/handoff.test.mjs'],
  requiredChecks: ['node tests/handoff.test.mjs']
});

assert.equal(revision.filename, HANDOFF_ARTIFACT_FILENAME);
assert.equal(revision.approved, false);
assert.equal(Object.isFrozen(revision), true);
for (const section of HANDOFF_REQUIRED_SECTIONS) assert.equal(revision.content.includes(`## ${section}`), true);
assert.equal(/raw conversation|chat log|transcript|full log/i.test(revision.content), false);

const payload = createHandoffApprovalPayload(revision);
assert.equal(payload.gate, HANDOFF_APPROVAL_GATE_ID);
assert.equal(payload.hash, revision.hash);
assert.deepEqual(payload.requiredSections, HANDOFF_REQUIRED_SECTIONS);

const request = createHandoffApprovalGate({
  id: 'gate-b-1',
  runId: 'run-1',
  handoffRevision: revision,
  requestedAt: '2026-01-01T00:01:00.000Z'
});
assert.equal(request.kind, HANDOFF_APPROVAL_KIND);
assert.equal(request.scope.gate, HANDOFF_APPROVAL_GATE_ID);
assert.equal(request.revisionHash, revision.hash);
assert.equal(request.payloadHash, hashApprovalPayload(payload));

assert.throws(() => assertBuildReceivesApprovedHandoff(revision), HandoffError);
const decision = decideHandoffApprovalGate(request, {
  actor: 'londi',
  decision: 'approve',
  payloadHash: request.payloadHash,
  revisionHash: request.revisionHash,
  timestamp: '2026-01-01T00:05:00.000Z'
});
const approvedRevision = markHandoffRevisionApproved(revision, decision);
assert.equal(approvedRevision.approved, true);
assert.equal(approvedRevision.approvalId, 'gate-b-1');
assert.equal(assertBuildReceivesApprovedHandoff(approvedRevision), true);

assert.throws(() => createHandoffRevision({
  runId: 'run-2',
  stepId: 'build',
  revision: 1,
  author: 'planner',
  createdAt: '2026-01-01T00:00:00.000Z',
  objective: 'Invalid content case.',
  approvedScope: ['Scope'],
  contextSummary: 'Includes raw conversation text.',
  implementationInstructions: ['Use data'],
  constraints: ['No extra files'],
  acceptanceCriteria: ['Pass checks'],
  allowedFiles: ['x'],
  requiredChecks: ['check']
}), HandoffError);

assert.throws(() => markHandoffRevisionApproved(revision, { state: 'Rejected', revisionHash: revision.hash }), HandoffError);

console.log('Handoff tests OK');
