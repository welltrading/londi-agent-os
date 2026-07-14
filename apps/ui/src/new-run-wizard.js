import { getPipelineTemplate, listPipelineTemplates, createPipelineAssignment } from '@londi-agent-os/contracts';

export const NEW_RUN_WIZARD_STEPS = Object.freeze(['task', 'git-project', 'template', 'acceptance', 'context', 'recommendations', 'preflight', 'permissions', 'pipeline-approval']);
export const NEW_RUN_WIZARD_STATUS = Object.freeze(['Draft', 'ReadyForApproval', 'Blocked']);
export const TRAINED_USER_APPROVAL_TARGET_SECONDS = 180;

export class NewRunWizardError extends Error {
  constructor(message, code = 'ERR_NEW_RUN_WIZARD', details = {}) {
    super(message);
    this.name = 'NewRunWizardError';
    this.code = code;
    this.details = details;
  }
}

export function createNewRunWizardState(initial = {}) {
  const state = {
    task: normalizeTask(initial.task),
    gitProject: normalizeGitProject(initial.gitProject),
    templateId: initial.templateId ?? 'direct',
    assignments: initial.assignments ?? {},
    acceptance: normalizeAcceptance(initial.acceptance),
    context: normalizeContext(initial.context),
    recommendations: normalizeRecommendations(initial.recommendations),
    preflight: normalizePreflight(initial.preflight),
    permissions: normalizePermissions(initial.permissions),
    warningsApproved: initial.warningsApproved === true,
    startedAt: initial.startedAt ?? null,
    updatedAt: initial.updatedAt ?? null
  };
  return deepFreezeWizard({ ...state, completion: evaluateWizardCompletion(state), approvalPayload: createPipelineApprovalPreview(state) });
}

export function updateNewRunWizardState(state, patch = {}) {
  return createNewRunWizardState({
    ...state,
    ...patch,
    task: patch.task ? { ...state.task, ...patch.task } : state.task,
    gitProject: patch.gitProject ? { ...state.gitProject, ...patch.gitProject } : state.gitProject,
    acceptance: patch.acceptance ? { ...state.acceptance, ...patch.acceptance } : state.acceptance,
    context: patch.context ? { ...state.context, ...patch.context } : state.context,
    recommendations: patch.recommendations ? { ...state.recommendations, ...patch.recommendations } : state.recommendations,
    preflight: patch.preflight ? { ...state.preflight, ...patch.preflight } : state.preflight,
    permissions: patch.permissions ? { ...state.permissions, ...patch.permissions } : state.permissions
  });
}

export function evaluateWizardCompletion(state) {
  const template = safeTemplate(state.templateId);
  const checks = NEW_RUN_WIZARD_STEPS.map((step) => evaluateWizardStep(step, state, template));
  const blocked = checks.filter((check) => check.status === 'Blocked');
  const incomplete = checks.filter((check) => check.status !== 'Ready');
  const status = blocked.length ? 'Blocked' : incomplete.length ? 'Draft' : 'ReadyForApproval';
  return deepFreezeWizard({ status, checks, readySteps: checks.filter((check) => check.status === 'Ready').length, totalSteps: checks.length, blockedReasons: blocked.map((item) => item.reason) });
}

export function evaluateWizardStep(step, state, template = safeTemplate(state.templateId)) {
  if (step === 'task') return stepCheck(step, state.task.title && state.task.description, 'Task title and description are required.');
  if (step === 'git-project') return stepCheck(step, state.gitProject.path && state.gitProject.targetBranch && state.gitProject.valid !== false, 'Valid Git project and target branch are required.', state.gitProject.valid === false);
  if (step === 'template') return stepCheck(step, Boolean(template?.id), 'Approved pipeline template is required.', !template?.id);
  if (step === 'acceptance') return stepCheck(step, state.acceptance.criteria.length > 0, 'At least one acceptance criterion is required.');
  if (step === 'context') return stepCheck(step, state.context.approved === true || state.context.selectionOptional === true, 'Context must be approved or explicitly skipped.');
  if (step === 'recommendations') return stepCheck(step, Object.keys(state.recommendations.assignments ?? {}).length >= template.roles.length, 'All template roles need recommended adapter assignments.');
  if (step === 'preflight') return stepCheck(step, state.preflight.status === 'Ready' || (state.preflight.status === 'Ready with Warnings' && state.warningsApproved === true), 'Preflight must be Ready; warnings require explicit approval.', state.preflight.status === 'Blocked');
  if (step === 'permissions') return stepCheck(step, state.permissions.approved === true, 'Required permissions and grants must be approved.');
  if (step === 'pipeline-approval') return stepCheck(step, createPipelineApprovalPreview(state).canRequestApproval, 'Pipeline approval can be requested only after all prior steps are ready.');
  throw new NewRunWizardError('Unknown wizard step.', 'ERR_NEW_RUN_WIZARD_STEP', { step });
}

export function createPipelineApprovalPreview(state) {
  const template = safeTemplate(state.templateId);
  let assignment = null;
  let assignmentError = null;
  try { assignment = createPipelineAssignment({ templateId: template.id, assignments: state.recommendations.assignments }); }
  catch (error) { assignmentError = error.message; }
  const priorSteps = NEW_RUN_WIZARD_STEPS.filter((step) => step !== 'pipeline-approval').map((step) => evaluateWizardStep(step, state, template));
  const blocked = priorSteps.filter((step) => step.status === 'Blocked');
  const pending = priorSteps.filter((step) => step.status !== 'Ready');
  return deepFreezeWizard({
    gate: 'Gate A',
    template,
    assignment,
    assignmentError,
    canRequestApproval: blocked.length === 0 && pending.length === 0 && Boolean(assignment),
    blockedReasons: [...blocked, ...pending].map((step) => step.reason),
    summary: {
      task: state.task.title,
      repositoryPath: state.gitProject.path,
      targetBranch: state.gitProject.targetBranch,
      acceptanceCriteria: state.acceptance.criteria.length,
      contextApproved: state.context.approved === true,
      preflightStatus: state.preflight.status,
      permissionScopes: state.permissions.scopes
    }
  });
}

export function assertWizardCanRequestApproval(state) {
  const preview = createPipelineApprovalPreview(state);
  if (!preview.canRequestApproval) throw new NewRunWizardError('Blocked wizard cannot request pipeline approval.', 'ERR_NEW_RUN_WIZARD_BLOCKED', { reasons: preview.blockedReasons });
  return true;
}

export function createNewRunApiRequests({ apiClient, wizard, requestId = 'ui-new-run-wizard' } = {}) {
  if (!apiClient || typeof apiClient.createRequest !== 'function') throw new NewRunWizardError('API client is required.', 'ERR_NEW_RUN_WIZARD_API_CLIENT');
  assertWizardCanRequestApproval(wizard);
  return Object.freeze({
    createRun: apiClient.createRequest('POST', '/runs', { requestId, idempotencyKey: `${requestId}:create-run`, body: { task: wizard.task, gitProject: wizard.gitProject, templateId: wizard.templateId, acceptance: wizard.acceptance } }),
    requestPipelineApproval: apiClient.createRequest('POST', '/approvals/pipeline', { requestId, idempotencyKey: `${requestId}:pipeline-approval`, body: wizard.approvalPayload })
  });
}

export function estimateTrainedUserSeconds(state) {
  const completion = state.completion ?? evaluateWizardCompletion(state);
  const remaining = completion.totalSteps - completion.readySteps;
  return Math.min(TRAINED_USER_APPROVAL_TARGET_SECONDS, 30 + remaining * 20);
}

export function listWizardTemplateOptions() {
  return Object.freeze(listPipelineTemplates().map((template) => Object.freeze({ id: template.id, label: template.displayName, description: template.description, roles: template.roles.map((role) => role.id) })));
}

function stepCheck(step, ok, reason, blocked = false) {
  return Object.freeze({ step, status: ok ? 'Ready' : blocked ? 'Blocked' : 'Draft', reason: ok ? null : reason });
}

function safeTemplate(templateId) {
  try { return getPipelineTemplate(templateId ?? 'direct'); }
  catch { return null; }
}

function normalizeTask(task = {}) { return Object.freeze({ title: sanitizeText(task.title ?? ''), description: sanitizeText(task.description ?? '') }); }
function normalizeGitProject(gitProject = {}) { return Object.freeze({ path: sanitizeText(gitProject.path ?? ''), targetBranch: sanitizeText(gitProject.targetBranch ?? 'main'), valid: gitProject.valid }); }
function normalizeAcceptance(acceptance = {}) { return Object.freeze({ criteria: (acceptance.criteria ?? []).map(sanitizeText) }); }
function normalizeContext(context = {}) { return Object.freeze({ approved: context.approved === true, selectionOptional: context.selectionOptional === true, snapshotId: context.snapshotId ?? null }); }
function normalizeRecommendations(recommendations = {}) { return Object.freeze({ assignments: Object.freeze({ ...(recommendations.assignments ?? {}) }), recommended: Object.freeze([...(recommendations.recommended ?? [])]) }); }
function normalizePreflight(preflight = {}) { return Object.freeze({ status: preflight.status ?? 'Blocked', checks: Object.freeze([...(preflight.checks ?? [])]) }); }
function normalizePermissions(permissions = {}) { return Object.freeze({ approved: permissions.approved === true, scopes: Object.freeze([...(permissions.scopes ?? [])]), network: Object.freeze([...(permissions.network ?? [])]), secretAliases: Object.freeze([...(permissions.secretAliases ?? [])]) }); }

function sanitizeText(value) { return String(value ?? '').replace(/sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+\/-]+=*|[A-Za-z0-9_-]{43,}/g, '[REDACTED]').replace(/[\r\n\u2028\u2029]+/g, ' ').trim(); }
function deepFreezeWizard(value) { if (!value || typeof value !== 'object') return value; for (const child of Object.values(value)) deepFreezeWizard(child); return Object.freeze(value); }
