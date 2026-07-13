import { strict as assert } from 'node:assert';
import {
  CORRECTION_CYCLE_LIMIT,
  CorrectionCycleError,
  applyCorrectionCycleDecision,
  assertThirdAttemptRequiresException,
  createCorrectionCycleState,
  createReviewArtifact,
  evaluateReviewForCorrection
} from '../packages/orchestrator/src/index.js';

const baseReview = {
  runId: 'run-1',
  reviewerAgentId: 'reviewer',
  builderAgentId: 'builder',
  createdAt: '2026-01-01T00:00:00.000Z'
};

const passingReview = createReviewArtifact({
  ...baseReview,
  summary: 'No blocking findings.',
  findings: [{ severity: 'Medium', evidence: 'Style issue only.', requiredFix: 'Clean later.' }]
});
const blockingReview = createReviewArtifact({
  ...baseReview,
  summary: 'Blocking review.',
  findings: [{ severity: 'High', evidence: 'Integration test failed.', requiredFix: 'Fix integration failure.' }],
  failedTests: ['npm run ci'],
  requiredFixes: ['Fix integration failure.']
});
const criticalSensitiveReview = createReviewArtifact({
  ...baseReview,
  summary: 'Critical sensitive review.',
  findings: [{ severity: 'Critical', evidence: 'Sensitive action detected.', requiredFix: 'Request approval.', sensitive: true }],
  failedTests: ['security review'],
  requiredFixes: ['Request approval.']
});

let state = createCorrectionCycleState({ runId: 'run-1' });
assert.equal(state.cycleCounter, 0);
assert.equal(Object.isFrozen(state), true);

let decision = evaluateReviewForCorrection(state, passingReview);
assert.equal(decision.action, 'Continue');
assert.equal(decision.nextCycleCounter, 0);

for (let expectedCycle = 1; expectedCycle <= CORRECTION_CYCLE_LIMIT; expectedCycle += 1) {
  decision = evaluateReviewForCorrection(state, blockingReview);
  assert.equal(decision.action, 'Continue');
  assert.equal(decision.nextCycleCounter, expectedCycle);
  state = applyCorrectionCycleDecision(state, decision);
  assert.equal(state.cycleCounter, expectedCycle);
}
assert.equal(state.history.length, 2);

decision = evaluateReviewForCorrection(state, blockingReview);
assert.equal(decision.action, 'Needs Attention');
assert.equal(decision.exceptionRequired, true);
assert.equal(decision.nextCycleCounter, 2);
assert.equal(assertThirdAttemptRequiresException(state, blockingReview), true);

const exceptionDecision = evaluateReviewForCorrection(state, blockingReview, { exceptionApproved: true });
assert.equal(exceptionDecision.action, 'Continue');
assert.equal(exceptionDecision.exceptionUsed, true);
assert.equal(exceptionDecision.nextCycleCounter, 3);

const criticalDecision = evaluateReviewForCorrection(state, criticalSensitiveReview);
assert.equal(criticalDecision.action, 'Critical Approval');
assert.equal(criticalDecision.nextCycleCounter, 2);

assert.throws(() => createCorrectionCycleState({ runId: 'run-err', cycleCounter: -1 }), CorrectionCycleError);
assert.throws(() => applyCorrectionCycleDecision(state, { action: 'Unknown' }), CorrectionCycleError);

console.log('Correction cycle tests OK');
