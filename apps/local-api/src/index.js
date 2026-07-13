import { listSupportedPipelineTemplates } from '@londi-agent-os/orchestrator';
import { createServiceLifecycle, getWindowsServiceInstallPlan } from './service-lifecycle.js';

export const LOCAL_API_PACKAGE = '@londi-agent-os/local-api';

export function getHealthModel() {
  const service = createServiceLifecycle();
  return { packageName: LOCAL_API_PACKAGE, ...service.getHealth(), templates: listSupportedPipelineTemplates() };
}

export { createServiceLifecycle, getWindowsServiceInstallPlan };

if (process.argv.includes('--build-check')) console.log(`${LOCAL_API_PACKAGE} build OK`);

if (process.argv.includes('--service')) {
  const service = createServiceLifecycle();
  const shutdown = async (signal) => {
    await service.stop(signal);
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  service.start().then((health) => {
    console.log(JSON.stringify({ event: 'service.started', health }));
  }).catch((error) => {
    console.error(JSON.stringify({ event: 'service.start_failed', error: error.message }));
    process.exit(1);
  });
}

if (process.argv.includes('--service-plan')) {
  console.log(JSON.stringify(getWindowsServiceInstallPlan(), null, 2));
}
