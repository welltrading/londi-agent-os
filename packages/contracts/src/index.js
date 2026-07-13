export const CONTRACTS_PACKAGE = '@londi-agent-os/contracts';
export const MVP_PIPELINE_TEMPLATES = ['direct', 'plan-build', 'plan-build-review'];
export {
  COMPATIBILITY_MANIFEST,
  COMPATIBILITY_SCHEMA_VERSION,
  UnsupportedCompatibilityVersionError,
  assertSupportedCompatibilityManifest,
  loadCompatibilityManifest
} from './compatibility.js';

if (process.argv.includes('--build-check')) console.log(`${CONTRACTS_PACKAGE} build OK`);
