export const PIPELINE_TEMPLATE_IDS = Object.freeze(['direct', 'plan-build', 'plan-build-review']);
export const PIPELINE_TEMPLATE_SCHEMA_VERSION = 1;

export class PipelineTemplateError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PipelineTemplateError';
    this.code = 'ERR_PIPELINE_TEMPLATE';
    this.details = details;
  }
}

export const PIPELINE_TEMPLATES = deepFreeze({
  direct: createPipelineTemplate({
    id: 'direct',
    displayName: 'Direct',
    description: 'Single agent executes the task directly without handoff.',
    roles: [
      role('executor', { requiredCapabilities: ['code-editing'], mayShareAgentWith: [] })
    ],
    steps: [
      step('execute', 'executor', { dependsOn: [], handoffRequired: false, terminal: true })
    ],
    edges: [],
    gates: ['pipeline-approval'],
    policies: { freeEditor: false, allowSameAgentMultipleRoles: true, requiresHandoff: false }
  }),
  'plan-build': createPipelineTemplate({
    id: 'plan-build',
    displayName: 'Plan & Build',
    description: 'Planner prepares implementation intent, builder executes it.',
    roles: [
      role('planner', { requiredCapabilities: ['planning'], mayShareAgentWith: ['builder'] }),
      role('builder', { requiredCapabilities: ['code-editing'], mayShareAgentWith: ['planner'] })
    ],
    steps: [
      step('plan', 'planner', { dependsOn: [], handoffRequired: false }),
      step('build', 'builder', { dependsOn: ['plan'], handoffRequired: true, terminal: true })
    ],
    edges: [edge('plan', 'build', 'plan-handoff')],
    gates: ['pipeline-approval', 'handoff-approval'],
    policies: { freeEditor: false, allowSameAgentMultipleRoles: true, requiresHandoff: true }
  }),
  'plan-build-review': createPipelineTemplate({
    id: 'plan-build-review',
    displayName: 'Plan, Build & Review',
    description: 'Planner creates plan, builder implements, reviewer validates output.',
    roles: [
      role('planner', { requiredCapabilities: ['planning'], mayShareAgentWith: ['builder', 'reviewer'] }),
      role('builder', { requiredCapabilities: ['code-editing'], mayShareAgentWith: ['planner', 'reviewer'] }),
      role('reviewer', { requiredCapabilities: ['repository-analysis', 'test-running'], mayShareAgentWith: ['planner', 'builder'] })
    ],
    steps: [
      step('plan', 'planner', { dependsOn: [], handoffRequired: false }),
      step('build', 'builder', { dependsOn: ['plan'], handoffRequired: true }),
      step('review', 'reviewer', { dependsOn: ['build'], handoffRequired: true, terminal: true })
    ],
    edges: [edge('plan', 'build', 'plan-handoff'), edge('build', 'review', 'review-handoff')],
    gates: ['pipeline-approval', 'handoff-approval', 'review-approval'],
    policies: { freeEditor: false, allowSameAgentMultipleRoles: true, requiresHandoff: true }
  })
});

export function listPipelineTemplates() {
  return PIPELINE_TEMPLATE_IDS.map((templateId) => getPipelineTemplate(templateId));
}

export function getPipelineTemplate(templateId) {
  const template = PIPELINE_TEMPLATES[templateId];
  if (!template) throw new PipelineTemplateError('Unknown pipeline template.', { templateId, availableTemplateIds: PIPELINE_TEMPLATE_IDS });
  return template;
}

export function validatePipelineTemplate(template) {
  if (!template || typeof template !== 'object') throw new PipelineTemplateError('Pipeline template must be an object.');
  if (!PIPELINE_TEMPLATE_IDS.includes(template.id)) throw new PipelineTemplateError('Pipeline template id is not approved for MVP.', { templateId: template.id });
  if (template.schemaVersion !== PIPELINE_TEMPLATE_SCHEMA_VERSION) throw new PipelineTemplateError('Unsupported pipeline template schema version.', { templateId: template.id, schemaVersion: template.schemaVersion });
  if (template.policies?.freeEditor !== false) throw new PipelineTemplateError('Pipeline templates must not allow free editor mode.', { templateId: template.id });
  if (template.policies?.allowSameAgentMultipleRoles !== true) throw new PipelineTemplateError('Pipeline templates must allow the same agent to fill multiple roles.', { templateId: template.id });
  if (template.id === 'direct' && template.policies?.requiresHandoff !== false) throw new PipelineTemplateError('Direct pipeline must not require handoff.', { templateId: template.id });

  const roleIds = new Set((template.roles ?? []).map((item) => item.id));
  const stepIds = new Set((template.steps ?? []).map((item) => item.id));
  if (roleIds.size !== template.roles.length) throw new PipelineTemplateError('Pipeline template role ids must be unique.', { templateId: template.id });
  if (stepIds.size !== template.steps.length) throw new PipelineTemplateError('Pipeline template step ids must be unique.', { templateId: template.id });
  for (const step of template.steps) {
    if (!roleIds.has(step.roleId)) throw new PipelineTemplateError('Pipeline step references an unknown role.', { templateId: template.id, step });
    for (const dependency of step.dependsOn) {
      if (!stepIds.has(dependency)) throw new PipelineTemplateError('Pipeline step references an unknown dependency.', { templateId: template.id, step, dependency });
    }
  }
  for (const item of template.edges) {
    if (!stepIds.has(item.from) || !stepIds.has(item.to)) throw new PipelineTemplateError('Pipeline edge references an unknown step.', { templateId: template.id, edge: item });
  }
  return true;
}

export function validatePipelineTemplates(templates = PIPELINE_TEMPLATES) {
  const ids = Object.keys(templates);
  const missing = PIPELINE_TEMPLATE_IDS.filter((id) => !ids.includes(id));
  const unexpected = ids.filter((id) => !PIPELINE_TEMPLATE_IDS.includes(id));
  if (missing.length || unexpected.length) throw new PipelineTemplateError('Pipeline templates must exactly match approved MVP template ids.', { missing, unexpected });
  for (const template of Object.values(templates)) validatePipelineTemplate(template);
  return true;
}

export function createPipelineAssignment({ templateId, assignments = {} } = {}) {
  const template = getPipelineTemplate(templateId);
  const roleIds = template.roles.map((roleItem) => roleItem.id);
  const missingRoles = roleIds.filter((roleId) => !assignments[roleId]);
  const unknownRoles = Object.keys(assignments).filter((roleId) => !roleIds.includes(roleId));
  if (missingRoles.length || unknownRoles.length) throw new PipelineTemplateError('Pipeline assignment must cover exactly the template roles.', { templateId, missingRoles, unknownRoles });
  return deepFreeze({ templateId, assignments: { ...assignments } });
}

function createPipelineTemplate({ id, displayName, description, roles, steps, edges, gates, policies }) {
  return {
    schemaVersion: PIPELINE_TEMPLATE_SCHEMA_VERSION,
    id,
    displayName,
    description,
    roles,
    steps,
    edges,
    gates,
    policies
  };
}

function role(id, { requiredCapabilities = [], mayShareAgentWith = [] } = {}) {
  return { id, requiredCapabilities, mayShareAgentWith };
}

function step(id, roleId, { dependsOn = [], handoffRequired = false, terminal = false } = {}) {
  return { id, roleId, dependsOn, handoffRequired, terminal };
}

function edge(from, to, kind) {
  return { from, to, kind };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
