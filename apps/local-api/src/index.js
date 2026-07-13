import { listSupportedPipelineTemplates } from '@londi-agent-os/orchestrator';
export const LOCAL_API_PACKAGE = '@londi-agent-os/local-api';
export function getHealthModel() {
  return { service: LOCAL_API_PACKAGE, status: 'starting', templates: listSupportedPipelineTemplates() };
}
if (process.argv.includes('--build-check')) console.log(`${LOCAL_API_PACKAGE} build OK`);
