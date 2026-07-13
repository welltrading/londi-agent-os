import { strict as assert } from 'node:assert';
import {
  MVP_PIPELINE_TEMPLATES,
  PIPELINE_TEMPLATE_IDS,
  PIPELINE_TEMPLATES,
  PipelineTemplateError,
  createPipelineAssignment,
  getPipelineTemplate,
  listPipelineTemplates,
  validatePipelineTemplate,
  validatePipelineTemplates
} from '../packages/contracts/src/index.js';

assert.deepEqual(PIPELINE_TEMPLATE_IDS, ['direct', 'plan-build', 'plan-build-review']);
assert.deepEqual(MVP_PIPELINE_TEMPLATES, PIPELINE_TEMPLATE_IDS);
assert.equal(validatePipelineTemplates(), true);
assert.equal(listPipelineTemplates().length, 3);

for (const template of Object.values(PIPELINE_TEMPLATES)) {
  assert.equal(validatePipelineTemplate(template), true);
  assert.equal(template.policies.freeEditor, false);
  assert.equal(template.policies.allowSameAgentMultipleRoles, true);
  assert.equal(template.gates.includes('pipeline-approval'), true);
}

const direct = getPipelineTemplate('direct');
assert.equal(direct.steps.length, 1);
assert.equal(direct.edges.length, 0);
assert.equal(direct.policies.requiresHandoff, false);
assert.equal(direct.steps.some((step) => step.handoffRequired), false);

const planBuild = getPipelineTemplate('plan-build');
assert.deepEqual(planBuild.steps.map((step) => step.id), ['plan', 'build']);
assert.equal(planBuild.edges[0].kind, 'plan-handoff');
assert.equal(planBuild.roles.find((role) => role.id === 'planner').mayShareAgentWith.includes('builder'), true);

const planBuildReview = getPipelineTemplate('plan-build-review');
assert.deepEqual(planBuildReview.steps.map((step) => step.id), ['plan', 'build', 'review']);
assert.deepEqual(planBuildReview.edges.map((edge) => edge.kind), ['plan-handoff', 'review-handoff']);
assert.equal(planBuildReview.roles.find((role) => role.id === 'reviewer').mayShareAgentWith.includes('builder'), true);

const sameAgentAssignment = createPipelineAssignment({
  templateId: 'plan-build-review',
  assignments: { planner: 'claude-code', builder: 'claude-code', reviewer: 'claude-code' }
});
assert.equal(sameAgentAssignment.assignments.planner, 'claude-code');
assert.equal(sameAgentAssignment.assignments.reviewer, 'claude-code');

assert.throws(() => getPipelineTemplate('freeform'), PipelineTemplateError);
assert.throws(() => createPipelineAssignment({ templateId: 'plan-build', assignments: { planner: 'claude-code' } }), PipelineTemplateError);
assert.throws(() => validatePipelineTemplate({ ...direct, policies: { ...direct.policies, freeEditor: true } }), PipelineTemplateError);
assert.throws(() => validatePipelineTemplate({ ...direct, policies: { ...direct.policies, requiresHandoff: true } }), PipelineTemplateError);

console.log('Pipeline template tests OK');
