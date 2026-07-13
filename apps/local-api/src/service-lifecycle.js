import { createServer } from 'node:http';
import { createLocalApiSecurity, writeJson } from './auth.js';
import { createLogger, createRequestId } from './logging.js';
import { loadDefaultLocalConfig, validateLocalConfig } from '@londi-agent-os/contracts';
import { ensureApprovedDataDirectories } from '@londi-agent-os/orchestrator';

export const SERVICE_NAME = 'LondiAgentOSLocalApi';
export const SERVICE_START_DEADLINE_MS = 30_000;

export function createServiceLifecycle(options = {}) {
  const config = options.config ?? loadDefaultLocalConfig();
  validateLocalConfig(config);
  const security = createLocalApiSecurity(options.security);
  const logger = options.logger ?? createLogger({ knownSecrets: options.knownSecrets ?? [] });

  let server;
  const startedAt = Date.now();
  const state = {
    status: 'stopped',
    serviceName: SERVICE_NAME,
    host: '127.0.0.1',
    port: config.ports.localApi,
    startedAt: null,
    stoppedAt: null,
    shutdownReason: null,
    dataDirectories: []
  };

  async function start() {
    if (state.status === 'running') return getHealth();
    state.status = 'starting';
    state.dataDirectories = ensureApprovedDataDirectories(config);
    logger.info('service.starting', { service: SERVICE_NAME, host: state.host, port: state.port });

    server = createServer((request, response) => {
      if (!security.enforce(request, response)) return;
      if (request.url === '/system/health') {
        const requestId = response.getHeader('x-request-id')?.toString() || createRequestId();
        writeJson(response, 200, { ...getHealth(), requestId });
        return;
      }
      writeJson(response, 404, { error: 'not_found', requestId: response.getHeader('x-request-id') });
    });

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(state.port, state.host, () => {
        server.off('error', reject);
        state.status = 'running';
        state.startedAt = new Date().toISOString();
        logger.info('service.started', { service: SERVICE_NAME, host: state.host, port: state.port });
        resolve();
      });
    });

    return getHealth();
  }

  async function stop(reason = 'controlled-stop') {
    if (!server || state.status === 'stopped') return getHealth();
    state.status = 'stopping';
    state.shutdownReason = reason;
    logger.info('service.stopping', { service: SERVICE_NAME, reason });

    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    server = undefined;
    state.status = 'stopped';
    state.stoppedAt = new Date().toISOString();
    logger.info('service.stopped', { service: SERVICE_NAME, reason });
    return getHealth();
  }

  function getHealth() {
    return {
      service: SERVICE_NAME,
      status: state.status,
      host: state.host,
      port: state.port,
      uptimeMs: Date.now() - startedAt,
      startupDeadlineMs: SERVICE_START_DEADLINE_MS,
      startedAt: state.startedAt,
      stoppedAt: state.stoppedAt,
      shutdownReason: state.shutdownReason,
      dataDirectories: [...state.dataDirectories],
      logging: {
        structured: true,
        requestId: true,
        redaction: true
      },
      security: {
        bind: state.host,
        allowedOrigin: security.allowedOrigin,
        requestLimitBytes: security.requestLimitBytes,
        credentialSource: security.credential.source,
        tokenBytes: security.credential.tokenBytes
      }
    };
  }

  return { start, stop, getHealth };
}

export function getWindowsServiceInstallPlan(config = loadDefaultLocalConfig()) {
  validateLocalConfig(config);
  return {
    serviceName: SERVICE_NAME,
    displayName: 'Londi Agent OS Local API',
    startupType: 'automatic',
    account: 'LocalSystem',
    command: 'node apps/local-api/src/index.js --service',
    healthEndpoint: `http://127.0.0.1:${config.ports.localApi}/system/health`,
    startupDeadlineMs: SERVICE_START_DEADLINE_MS
  };
}
