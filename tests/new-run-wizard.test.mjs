import { strict as assert } from 'node:assert';
import {
  NewRunWizardError,
  assertWizardCanRequestApproval,
  createApiClient,
  createMemoryTokenProvider,
  createNewRunApiRequests,
  createNewRunWizardState,
  estimateTrainedUserSeconds,
  getUiBootstrapModel,
  listWizardTemplateOptions,
  updateNewRunWizardState
} from '../apps/ui/src/index.js';

const readyWizard = createNewRunWizardState({
  task: { title: 'Add audit page', description: 'Build the local audit view.' },
  gitProject: { path: '/repo/project', targetBranch: 'main', valid: true },
  templateId: 'plan-build-review',
  acceptance: { criteria: ['Tests pass', 'Manual merge remains manual'] },
  context: { approved: true, snapshotId: 'ctx-1' },
  recommendations: { assignments: { planner: 'claude-code', builder: 'codex', reviewer: 'claude-code' } },
  preflight: { status: 'Ready', checks: [] },
  permissions: { approved: true, scopes: ['workspace-write'], network: ['api.github.com'], secretAliases: ['GITHUB_TOKEN'] },
  warningsApproved: false
});
assert.equal(readyWizard.completion.status, 'ReadyForApproval');
assert.equal(readyWizard.approvalPayload.canRequestApproval, true);
assert.equal(assertWizardCanRequestApproval(readyWizard), true);
assert.equal(estimateTrainedUserSeconds(readyWizard) <= 180, true);

const tokenProvider = createMemoryTokenProvider('local-token');
const apiClient = createApiClient({ tokenProvider });
const requests = createNewRunApiRequests({ apiClient, wizard: readyWizard, requestId: 'req-1' });
assert.equal(requests.createRun.method, 'POST');
assert.equal(requests.createRun.url.endsWith('/runs'), true);
assert.equal(requests.createRun.headers['idempotency-key'], 'req-1:create-run');
assert.equal(requests.requestPipelineApproval.url.endsWith('/approvals/pipeline'), true);

const blocked = updateNewRunWizardState(readyWizard, { preflight: { status: 'Blocked', checks: [{ name: 'git.validation', status: 'Blocked' }] } });
assert.equal(blocked.completion.status, 'Blocked');
assert.equal(blocked.approvalPayload.canRequestApproval, false);
assert.throws(() => assertWizardCanRequestApproval(blocked), NewRunWizardError);
assert.throws(() => createNewRunApiRequests({ apiClient, wizard: blocked }), NewRunWizardError);

const warning = updateNewRunWizardState(readyWizard, { preflight: { status: 'Ready with Warnings', checks: [] }, warningsApproved: false });
assert.equal(warning.completion.status, 'Draft');
assert.equal(warning.approvalPayload.canRequestApproval, false);
const warningApproved = updateNewRunWizardState(warning, { warningsApproved: true });
assert.equal(warningApproved.completion.status, 'ReadyForApproval');

const missingRole = updateNewRunWizardState(readyWizard, { recommendations: { assignments: { planner: 'claude-code' } } });
assert.equal(missingRole.completion.status, 'Draft');
assert.equal(missingRole.approvalPayload.canRequestApproval, false);
assert.equal(Boolean(missingRole.approvalPayload.assignmentError), true);

const secret = createNewRunWizardState({ task: { title: 'Bearer abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_', description: 'ok' } });
assert.equal(JSON.stringify(secret).includes('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_'), false);
assert.equal(listWizardTemplateOptions().some((item) => item.id === 'direct'), true);
assert.equal(getUiBootstrapModel().newRunWizard.completion.status, 'Blocked');

console.log('New run wizard tests OK');
