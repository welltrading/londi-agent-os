export const CONTRACTS_PACKAGE = '@londi-agent-os/contracts';
export const MVP_PIPELINE_TEMPLATES = ['direct', 'plan-build', 'plan-build-review'];
export {
  COMPATIBILITY_MANIFEST,
  COMPATIBILITY_SCHEMA_VERSION,
  UnsupportedCompatibilityVersionError,
  assertSupportedCompatibilityManifest,
  loadCompatibilityManifest
} from './compatibility.js';
export {
  PIPELINE_TEMPLATE_IDS,
  PIPELINE_TEMPLATE_SCHEMA_VERSION,
  PIPELINE_TEMPLATES,
  PipelineTemplateError,
  createPipelineAssignment,
  getPipelineTemplate,
  listPipelineTemplates,
  validatePipelineTemplate,
  validatePipelineTemplates
} from './pipeline-templates.js';
export {
  DEFAULT_LOCAL_CONFIG,
  LOCAL_CONFIG_SCHEMA_VERSION,
  LocalConfigValidationError,
  loadDefaultLocalConfig,
  validateLocalConfig
} from './configuration.js';
export {
  OBSIDIAN_RUN_SUMMARY_TARGET_FOLDER,
  PHASE2_ACTIVE_SKILL_IDS,
  PHASE2_AGENT_CATALOG,
  PHASE2_AGENT_IDS,
  PHASE2_AGENT_STATUSES,
  PHASE2_PROJECT_STATUSES,
  PHASE2_PROJECT_BROWSER_ENTRY_TYPES,
  PHASE2_RUN_STATUSES,
  PHASE2_RUN_INTENTS,
  DEFAULT_PHASE2_RUN_INTENT,
  AGENT_SESSION_ID_PATTERN,
  PHASE2_DEFAULT_TARGET_BRANCHES,
  PHASE2_SKILL_IDS,
  PHASE2_SKILL_REGISTRY,
  PHASE2_USAGE_MODES,
  PHASE2_USAGE_SOURCES,
  PHASE2_USAGE_UNITS,
  Phase2RuntimeContractError,
  createAgentCard,
  createMinimalRun,
  createManualRunRecord,
  createObsidianRunSummaryFilename,
  createProjectWorkspace,
  createProjectBrowserEntry,
  createProjectBrowserSnapshot,
  createRunSummaryInput,
  listPhase2AgentCards,
  listPhase2Skills,
  normalizeAgentUsage,
  renderRunSummaryMarkdown,
  sanitizeAgentSessionId,
  validatePhase2RuntimeContracts
} from './phase2-runtime.js';

if (globalThis.process?.argv?.includes('--build-check')) console.log(`${CONTRACTS_PACKAGE} build OK`);
