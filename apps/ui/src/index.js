import { MVP_PIPELINE_TEMPLATES } from '@londi-agent-os/contracts';
import { createApiClient, createMemoryTokenProvider, assertUiDoesNotInvokeCli } from './api-client.js';
import { createClientState } from './client-state.js';
import { createSseClient } from './sse-client.js';
import { createAccessibilityModel, validateAccessibilityModel } from './accessibility.js';
import { createDashboardModel } from './dashboard.js';
import { createNewRunWizardState } from './new-run-wizard.js';
import { RUN_DETAIL_SECTIONS } from './run-detail.js';
import { HRA_SECTIONS } from './handoff-review-acceptance.js';

export const UI_PACKAGE = '@londi-agent-os/ui';
export const UI_SHELL_ROUTES = Object.freeze(['/', '/runs', '/approvals', '/settings']);

export function getUiBootstrapModel(options = {}) {
  const state = createClientState();
  const tokenProvider = createMemoryTokenProvider(options.token ?? null);
  const apiClient = createApiClient({ baseUrl: options.baseUrl, tokenProvider });
  const sseClient = createSseClient({ apiClient, state });
  const accessibility = createAccessibilityModel();
  validateAccessibilityModel(accessibility);
  return Object.freeze({ packageName: UI_PACKAGE, pipelineTemplates: MVP_PIPELINE_TEMPLATES, routes: UI_SHELL_ROUTES, state, tokenProvider, apiClient, sseClient, accessibility, dashboard: createDashboardModel(), newRunWizard: createNewRunWizardState(), runDetailSections: RUN_DETAIL_SECTIONS, handoffReviewAcceptanceSections: HRA_SECTIONS });
}

export { createApiClient, createMemoryTokenProvider, assertUiDoesNotInvokeCli } from './api-client.js';
export { CONNECTION_STATES, DEFAULT_RECONNECT_POLICY, UiClientStateError, createClientState, setAuthToken, clearAuthToken, transitionConnection, recordUiEvent, computeReconnectDelay, normalizeFocusState } from './client-state.js';
export { UiSseClientError, createSseClient } from './sse-client.js';
export { ACCESSIBILITY_BASELINE, createAccessibilityModel, validateAccessibilityModel } from './accessibility.js';
export { DASHBOARD_RUN_BUCKETS, ACTION_STATE, DashboardModelError, createDashboardModel, bucketRuns, listRunActions, evaluateActionFreshness, describeExpectedTransition, assertDashboardCountsMatchApi } from './dashboard.js';
export { NEW_RUN_WIZARD_STEPS, NEW_RUN_WIZARD_STATUS, TRAINED_USER_APPROVAL_TARGET_SECONDS, NewRunWizardError, createNewRunWizardState, updateNewRunWizardState, evaluateWizardCompletion, evaluateWizardStep, createPipelineApprovalPreview, assertWizardCanRequestApproval, createNewRunApiRequests, estimateTrainedUserSeconds, listWizardTemplateOptions } from './new-run-wizard.js';
export { RUN_DETAIL_EVENT_LIMIT, RUN_DETAIL_PAGE_SIZE, RUN_DETAIL_SECTIONS, RUN_DETAIL_VISUAL_TOKENS, RunDetailError, createRunDetailModel, paginateRunEvents, createStateStepper, createRunProgress, createFilteredLogs, createArtifactList, createCheckpointList, createRunDetailApiRequests, assertRunDetailAccessibility } from './run-detail.js';
export { HRA_SECTIONS, HRA_ACTIONS, HRA_VISUAL_TOKENS, HandoffReviewAcceptanceError, createHandoffReviewAcceptanceModel, evaluateRevisionFreshness, createHandoffRevisionDiff, createReviewScreenModel, createAcceptanceScreenModel, assertHraActionAllowed, createHraApiRequests, assertHraAccessibility } from './handoff-review-acceptance.js';

if (process.argv.includes('--build-check')) console.log(`${UI_PACKAGE} build OK`);
