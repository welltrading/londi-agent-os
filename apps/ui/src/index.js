import { MVP_PIPELINE_TEMPLATES, listPhase2AgentCards, listPhase2Skills } from '@londi-agent-os/contracts';
import { createApiClient, createMemoryTokenProvider, assertUiDoesNotInvokeCli } from './api-client.js';
import { createClientState } from './client-state.js';
import { createSseClient } from './sse-client.js';
import { createAccessibilityModel, validateAccessibilityModel } from './accessibility.js';
import { createDashboardModel } from './dashboard.js';
import { createPhase2DashboardModel, createPhase2DashboardRuntime, createPhase2DashboardController, createPhase2DashboardScreen, createPhase2DashboardShellModel, createPhase2DashboardVisualAdapter, createPhase2DashboardDomBinder } from './phase2-dashboard.js';
import { createRuntimeDashboardApp } from './runtime-dashboard.js';
import { createNewRunWizardState } from './new-run-wizard.js';
import { RUN_DETAIL_SECTIONS } from './run-detail.js';
import { HRA_SECTIONS } from './handoff-review-acceptance.js';
import { ASM_SECTIONS } from './audit-settings-maintenance.js';
import { UI_E2E_CORE_SCREENS } from './ui-e2e-baseline.js';

export const UI_PACKAGE = '@londi-agent-os/ui';
export const UI_SHELL_ROUTES = Object.freeze(['/', '/runs', '/approvals', '/settings']);

export function getUiBootstrapModel(options = {}) {
  const state = createClientState();
  const tokenProvider = createMemoryTokenProvider(options.token ?? null);
  const apiClient = createApiClient({ baseUrl: options.baseUrl, tokenProvider });
  const sseClient = createSseClient({ apiClient, state });
  const accessibility = createAccessibilityModel();
  validateAccessibilityModel(accessibility);
  const phase2DashboardRuntime = createPhase2DashboardRuntime({ apiClient, fetchImpl: options.fetchImpl, now: options.now });
  const phase2DashboardController = createPhase2DashboardController({ runtime: phase2DashboardRuntime });
  const phase2DashboardScreen = createPhase2DashboardScreen({ controller: phase2DashboardController });
  const phase2DashboardShell = createPhase2DashboardShellModel(phase2DashboardScreen.render());
  const phase2DashboardVisualAdapter = createPhase2DashboardVisualAdapter(phase2DashboardShell);
  const phase2DashboardDomBinder = createPhase2DashboardDomBinder({ screen: phase2DashboardScreen, documentRef: options.documentRef, target: options.phase2DashboardTarget });
  return Object.freeze({ packageName: UI_PACKAGE, pipelineTemplates: MVP_PIPELINE_TEMPLATES, routes: UI_SHELL_ROUTES, state, tokenProvider, apiClient, sseClient, accessibility, dashboard: createDashboardModel(), phase2Dashboard: createPhase2DashboardModel({ agents: listPhase2AgentCards(), skills: listPhase2Skills() }), phase2DashboardRuntime, phase2DashboardController, phase2DashboardScreen, phase2DashboardShell, phase2DashboardVisualAdapter, phase2DashboardDomBinder, runtimeDashboard: createRuntimeDashboardApp({ documentRef: options.documentRef, target: options.phase2DashboardTarget, token: options.token ?? null, baseUrl: options.baseUrl, fetchImpl: options.fetchImpl, now: options.now }), newRunWizard: createNewRunWizardState(), runDetailSections: RUN_DETAIL_SECTIONS, handoffReviewAcceptanceSections: HRA_SECTIONS, auditSettingsMaintenanceSections: ASM_SECTIONS, uiE2eCoreScreens: UI_E2E_CORE_SCREENS });
}

export { createApiClient, createMemoryTokenProvider, assertUiDoesNotInvokeCli } from './api-client.js';
export { CONNECTION_STATES, DEFAULT_RECONNECT_POLICY, UiClientStateError, createClientState, setAuthToken, clearAuthToken, transitionConnection, recordUiEvent, computeReconnectDelay, normalizeFocusState } from './client-state.js';
export { UiSseClientError, createSseClient } from './sse-client.js';
export { ACCESSIBILITY_BASELINE, createAccessibilityModel, validateAccessibilityModel } from './accessibility.js';
export { RuntimeDashboardError, createRuntimeDashboardApp, createRuntimeDashboardBootstrapModel, createRuntimeDispatchOptions } from './runtime-dashboard.js';
export { Phase2DashboardError, createPhase2DashboardApiRequests, createPhase2DashboardModel, createPhase2DashboardRuntime, createPhase2DashboardController, createPhase2DashboardScreenModel, createPhase2DashboardScreen, createPhase2DashboardShellModel, createPhase2DashboardVisualAdapter, createPhase2DashboardDomBinder, createPhase2DashboardViewModel, createPhase2DashboardInteractionModel, loadPhase2DashboardFromApi, writePhase2ObsidianRunSummary, assertProjectHasAllAgents } from './phase2-dashboard.js';
export { DASHBOARD_RUN_BUCKETS, ACTION_STATE, DashboardModelError, createDashboardModel, bucketRuns, listRunActions, evaluateActionFreshness, describeExpectedTransition, assertDashboardCountsMatchApi } from './dashboard.js';
export { NEW_RUN_WIZARD_STEPS, NEW_RUN_WIZARD_STATUS, TRAINED_USER_APPROVAL_TARGET_SECONDS, NewRunWizardError, createNewRunWizardState, updateNewRunWizardState, evaluateWizardCompletion, evaluateWizardStep, createPipelineApprovalPreview, assertWizardCanRequestApproval, createNewRunApiRequests, estimateTrainedUserSeconds, listWizardTemplateOptions } from './new-run-wizard.js';
export { RUN_DETAIL_EVENT_LIMIT, RUN_DETAIL_PAGE_SIZE, RUN_DETAIL_SECTIONS, RUN_DETAIL_VISUAL_TOKENS, RunDetailError, createRunDetailModel, paginateRunEvents, createStateStepper, createRunProgress, createFilteredLogs, createArtifactList, createCheckpointList, createRunDetailApiRequests, assertRunDetailAccessibility } from './run-detail.js';
export { HRA_SECTIONS, HRA_ACTIONS, HRA_VISUAL_TOKENS, HandoffReviewAcceptanceError, createHandoffReviewAcceptanceModel, evaluateRevisionFreshness, createHandoffRevisionDiff, createReviewScreenModel, createAcceptanceScreenModel, assertHraActionAllowed, createHraApiRequests, assertHraAccessibility } from './handoff-review-acceptance.js';
export { ASM_SECTIONS, ASM_ACTION_STATE, ASM_VISUAL_TOKENS, AuditSettingsMaintenanceError, createAuditSettingsMaintenanceModel, createAuditTimeline, createAuditExportDescriptor, createSettingsModel, createMaintenanceModel, createAsmApiRequests, assertAuditReadOnly, assertNoSecretsDisplayed, assertDisabledActionsDoNotSimulateSuccess } from './audit-settings-maintenance.js';
export { NOTIFICATION_REMINDER_MINUTES, NOTIFICATION_ESCALATION_MINUTES, NOTIFICATION_ACTIONS, NOTIFICATION_FORBIDDEN_ACTIONS, WindowsNotificationError, createWindowsNotification, scheduleNotificationFollowups, handleNotificationAction, assertNotificationIsNonSensitive } from './windows-notifications.js';
export { UI_E2E_REQUIRED_TEMPLATES, UI_E2E_CORE_SCREENS, UI_E2E_WCAG_LEVEL, UiE2eBaselineError, createUiE2eBaselineScenario, createUiE2eCoreScreens, evaluateUiE2eBaseline, createReconnectScenario, createStaleRevisionScenario, createLongLogsScenario, evaluateWcagBaseline, assertUiE2eBaselinePasses } from './ui-e2e-baseline.js';

if (globalThis.process?.argv?.includes('--build-check')) console.log(`${UI_PACKAGE} build OK`);
