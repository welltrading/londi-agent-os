import { strict as assert } from 'node:assert';
import {
  REVIEW_ARTIFACT_FILENAME,
  REVIEW_APPROVAL_GATE_ID,
  REVIEW_APPROVAL_KIND,
  REVIEW_BLOCKING_SEVERITIES,
  REVIEW_REQUIRED_SECTIONS,
  ReviewArtifactError,
  assertReviewArtifact,
  createCriticalReviewApprovalGate,
  createCriticalReviewApprovalPayload,
  createReviewArtifact,
  decideCriticalReviewApprovalGate,
  getHighestReviewSeverity,
  hashApprovalPayload
} from '../packages/orchestrator/src/index.js';

const lowReview = createReviewArtifact({
  runId: 'run-1',
  reviewerAgentId: 'reviewer',
  builderAgentId: 'builder',
  createdAt: '2026-01-01T00:00:00.000Z',
  summary: 'Implementation is acceptable with one small note.',
  findings: [{ severity: 'Low', evidence: 'Minor naming issue.', requiredFix: 'Rename in the next cleanup.' }],
  failedTests: [],
  requiredFixes: []
});
assert.equal(lowReview.filename, REVIEW_ARTIFACT_FILENAME);
assert.equal(lowReview.highestSeverity, 'Low');
assert.equal(lowReview.blocking, false);
assert.equal(lowReview.decision, 'Passed');
for (const section of REVIEW_REQUIRED_SECTIONS) assert.equal(lowReview.content.includes(`## ${section}`), true);
assert.equal(assertReviewArtifact(lowReview), true);

const highReview = createReviewArtifact({
  runId: 'run-2',
  reviewerAgentId: 'reviewer',
  builderAgentId: 'builder',
  createdAt: '2026-01-01T00:10:00.000Z',
  summary: 'Build is blocked by a failing acceptance check.',
  findings: [{ severity: 'High', evidence: 'npm run ci fails.', requiredFix: 'Fix failing integration test before merge.' }],
  failedTests: ['npm run ci'],
  requiredFixes: ['Fix failing integration test before merge.']
});
assert.equal(REVIEW_BLOCKING_SEVERITIES.includes(highReview.highestSeverity), true);
assert.equal(highReview.blocking, true);
assert.equal(highReview.decision, 'Blocked');
assert.equal(highReview.content.includes('- Required fix: Fix failing integration test before merge.'), true);

const criticalSensitive = createReviewArtifact({
  runId: 'run-3',
  reviewerAgentId: 'same-agent',
  builderAgentId: 'same-agent',
  createdAt: '2026-01-01T00:20:00.000Z',
  summary: 'Critical sensitive finding requires immediate approval.',
  findings: [{ severity: 'Critical', evidence: 'Sensitive command would expose a token alias.', requiredFix: 'Stop execution and request approval.', sensitive: true }],
  failedTests: ['security review'],
  requiredFixes: ['Stop execution and request approval.']
});
assert.equal(criticalSensitive.blocking, true);
assert.equal(criticalSensitive.criticalSensitive, true);
assert.equal(criticalSensitive.selfReviewWarning, true);
assert.equal(criticalSensitive.decision, 'Requires Approval');
assert.equal(criticalSensitive.content.includes('reviewer and builder are the same agent'), true);

const payload = createCriticalReviewApprovalPayload(criticalSensitive);
assert.equal(payload.gate, REVIEW_APPROVAL_GATE_ID);
assert.equal(payload.hash, criticalSensitive.hash);

const request = createCriticalReviewApprovalGate({
  id: 'critical-review-1',
  reviewArtifact: criticalSensitive,
  requestedAt: '2026-01-01T00:21:00.000Z'
});
assert.equal(request.kind, REVIEW_APPROVAL_KIND);
assert.equal(request.scope.gate, REVIEW_APPROVAL_GATE_ID);
assert.equal(request.payloadHash, hashApprovalPayload(payload));

const decision = decideCriticalReviewApprovalGate(request, {
  actor: 'londi',
  decision: 'approve',
  payloadHash: request.payloadHash,
  revisionHash: request.revisionHash,
  timestamp: '2026-01-01T00:25:00.000Z'
});
assert.equal(decision.state, 'Approved');

assert.equal(getHighestReviewSeverity([{ severity: 'Medium' }, { severity: 'Critical' }, { severity: 'Low' }]), 'Critical');
assert.throws(() => createCriticalReviewApprovalGate({ reviewArtifact: highReview }), ReviewArtifactError);
assert.throws(() => createReviewArtifact({
  runId: 'run-4',
  reviewerAgentId: 'reviewer',
  builderAgentId: 'builder',
  summary: 'Invalid because blocking without required fixes.',
  findings: [{ severity: 'High', evidence: 'Failure', requiredFix: 'Fix it' }],
  failedTests: ['test'],
  requiredFixes: []
}), ReviewArtifactError);

console.log('Review artifact tests OK');
