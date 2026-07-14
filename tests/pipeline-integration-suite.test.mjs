import { strict as assert } from 'node:assert';
import {
  PIPELINE_INTEGRATION_SCENARIOS,
  PipelineIntegrationSuiteError,
  runPipelineIntegrationScenario,
  runPipelineIntegrationSuite
} from '../packages/orchestrator/src/index.js';

assert.deepEqual(PIPELINE_INTEGRATION_SCENARIOS, ['direct', 'plan-build', 'plan-build-review']);

const suite = runPipelineIntegrationSuite();
assert.equal(suite.uiRequired, false);
assert.equal(suite.scenarios.length, 3);

const [direct, planBuild, planBuildReview] = suite.scenarios;
assert.equal(direct.templateId, 'direct');
assert.equal(direct.handoffRevisions.length, 0);
assert.equal(direct.gates.pipeline.state, 'Approved');
assert.equal(direct.gates.acceptance.kind, 'acceptance');
assert.equal(direct.uiRequired, false);

assert.equal(planBuild.templateId, 'plan-build');
assert.equal(planBuild.handoffRevisions.length, 1);
assert.equal(planBuild.handoffRevisions[0].approved, true);
assert.equal(planBuild.events.some((event) => event.gate === 'B'), true);
assert.equal(planBuild.gates.acceptance.scope.gate, 'Gate E');

assert.equal(planBuildReview.templateId, 'plan-build-review');
assert.equal(planBuildReview.handoffRevisions.length, 2);
assert.equal(planBuildReview.review.blocking, true);
assert.equal(planBuildReview.correction.cycleCounter, 1);
assert.equal(planBuildReview.criticalStop.gate, 'Critical Review Approval');
assert.equal(planBuildReview.criticalStop.approvalKind, 'review-critical');
assert.equal(planBuildReview.events.some((event) => event.criticalStop === true), true);
assert.equal(planBuildReview.gates.acceptance.scope.gate, 'Gate E');

const passingReviewScenario = runPipelineIntegrationScenario({ templateId: 'plan-build-review' });
assert.equal(passingReviewScenario.review.decision, 'Passed');
assert.equal(passingReviewScenario.correction, null);
assert.equal(passingReviewScenario.criticalStop, null);

assert.throws(() => runPipelineIntegrationScenario({ templateId: 'freeform' }), PipelineIntegrationSuiteError);

console.log('Pipeline integration suite tests OK');
