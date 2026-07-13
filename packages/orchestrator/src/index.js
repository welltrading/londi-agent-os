import { MVP_PIPELINE_TEMPLATES } from '@londi-agent-os/contracts';
export const ORCHESTRATOR_PACKAGE = '@londi-agent-os/orchestrator';
export function listSupportedPipelineTemplates() {
  return [...MVP_PIPELINE_TEMPLATES];
}
if (process.argv.includes('--build-check')) console.log(`${ORCHESTRATOR_PACKAGE} build OK`);
