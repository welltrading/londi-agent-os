import { listSupportedPipelineTemplates } from '@londi-agent-os/orchestrator';
import { createServiceLifecycle, getWindowsServiceInstallPlan } from './service-lifecycle.js';
import { createCredentialManagerTokenProvider } from './auth.js';
import { createLogger, createRequestId, sanitizeForLog } from './logging.js';

export const LOCAL_API_PACKAGE = '@londi-agent-os/local-api';

export function getHealthModel() {
  const service = createServiceLifecycle({ security: { tokenProvider: createCredentialManagerTokenProvider('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_') } });
  return { packageName: LOCAL_API_PACKAGE, ...service.getHealth(), templates: listSupportedPipelineTemplates() };
}

export {
  SSE_EVENTS_PATH,
  STREAM_RESET_EVENT_TYPE,
  SSE_HEARTBEAT_EVENT_TYPE,
  DEFAULT_SSE_BATCH_SIZE,
  MAX_SSE_BATCH_SIZE,
  SseStreamError,
  createSseStreamContract,
  parseSseRequest,
  replayEvents,
  normalizeSseEvent,
  createHeartbeatEvent,
  createStreamResetEvent,
  formatSseEvent,
  createSseHeaders,
  assertNoSecretPayload
} from './sse-stream.js';

export {
  API_VERSION,
  API_BASE_PATH,
  RESOURCE_VERSION_HEADER,
  IDEMPOTENCY_KEY_HEADER,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  ERROR_CODES,
  REST_ENDPOINTS,
  RestContractError,
  listRestEndpoints,
  findRestEndpoint,
  assertRestRequestContract,
  createResourceResponse,
  normalizePagination,
  createRestError,
  mapDomainErrorToRestError,
  validateRestContracts
} from './rest-contracts.js';

export { createServiceLifecycle, getWindowsServiceInstallPlan, createCredentialManagerTokenProvider, createLogger, createRequestId, sanitizeForLog };
export { HOST_CONNECTOR_CACHE_TTL_MS, HostConnectorError, createInMemoryHostConnector } from './host-connector.js';
export { createInMemoryEventStore } from '@londi-agent-os/orchestrator';

if (process.argv.includes('--build-check')) console.log(`${LOCAL_API_PACKAGE} build OK`);

if (process.argv.includes('--service')) {
  const configuredToken = process.env.LONDI_AGENT_OS_LOCAL_API_TOKEN;
  const service = createServiceLifecycle({
    security: { tokenProvider: createCredentialManagerTokenProvider(configuredToken ?? '') }
  });
  const shutdown = async (signal) => {
    await service.stop(signal);
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  service.start().then((health) => {
    console.log(sanitizeForLog({ event: 'service.started', health }, [configuredToken]));
  }).catch((error) => {
    console.error(sanitizeForLog({ event: 'service.start_failed', error: error.message }, [configuredToken]));
    process.exit(1);
  });
}

if (process.argv.includes('--service-plan')) {
  console.log(JSON.stringify(getWindowsServiceInstallPlan(), null, 2));
}
