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

if (process.argv.includes('--build-check')) console.log(`${CONTRACTS_PACKAGE} build OK`);
