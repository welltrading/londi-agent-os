import { createServer } from 'node:http';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { createLocalApiSecurity, writeJson } from './auth.js';
import { createLogger, createRequestId } from './logging.js';
import { API_BASE_PATH, IDEMPOTENCY_KEY_HEADER, createResourceResponse } from './rest-contracts.js';
import {
  listPhase2Skills,
  loadDefaultLocalConfig,
  validateLocalConfig
} from '@londi-agent-os/contracts';
import { createDirectManualRunExecutor, detectDefaultBranch, ensureApprovedDataDirectories } from '@londi-agent-os/orchestrator';
import { createInMemoryHostConnector } from './host-connector.js';

export const SERVICE_NAME = 'LondiAgentOSLocalApi';
export const SERVICE_START_DEADLINE_MS = 30_000;

export function createServiceLifecycle(options = {}) {
  const config = options.config ?? loadDefaultLocalConfig();
  validateLocalConfig(config);
  const security = createLocalApiSecurity(options.security);
  const logger = options.logger ?? createLogger({ knownSecrets: options.knownSecrets ?? [] });
  const hostConnector = options.hostConnector ?? createInMemoryHostConnector({
    vaultPath: config.obsidian?.roots?.[0] ?? null,
    mkdir: mkdirSync,
    writeFile: writeFileSync,
    readFile: readFileSync,
    exists: existsSync,
    joinPath: join,
    resolvePath: resolve,
    relativePath: relative,
    readDir: readdirSync,
    stat: statSync,
    runsFilePath: config.paths.runs ? join(config.paths.runs, 'runs.json') : 'data/runs/runs.json',
    projectsFilePath: join(config.paths.projects ?? join(config.dataRoot, 'projects'), 'projects.json'),
    detectDefaultBranch,
    executeManualRun: options.executeManualRun ?? createDirectManualRunExecutor({ dataRoot: config.dataRoot })
  });

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

    server = createServer(async (request, response) => {
      if (!security.enforce(request, response)) return;
      await routeRequest(request, response);
    });

    await new Promise((resolvePromise, reject) => {
      server.once('error', reject);
      server.listen(state.port, state.host, () => {
        server.off('error', reject);
        state.status = 'running';
        state.startedAt = new Date().toISOString();
        logger.info('service.started', { service: SERVICE_NAME, host: state.host, port: state.port });
        resolvePromise();
      });
    });

    return getHealth();
  }

  async function stop(reason = 'controlled-stop') {
    if (!server || state.status === 'stopped') return getHealth();
    state.status = 'stopping';
    state.shutdownReason = reason;
    logger.info('service.stopping', { service: SERVICE_NAME, reason });

    await new Promise((resolvePromise, reject) => {
      server.close((error) => (error ? reject(error) : resolvePromise()));
    });

    server = undefined;
    state.status = 'stopped';
    state.stoppedAt = new Date().toISOString();
    logger.info('service.stopped', { service: SERVICE_NAME, reason });
    return getHealth();
  }

  async function routeRequest(request, response) {
    const requestId = response.getHeader('x-request-id')?.toString() || createRequestId();
    const parsedUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    const pathname = parsedUrl.pathname;
    try {
      if (pathname === '/system/health' || pathname === `${API_BASE_PATH}/system/health`) {
        writeJson(response, 200, { ...getHealth(), requestId });
        return;
      }
      if (request.method === 'GET' && pathname === `${API_BASE_PATH}/agents`) {
        const data = hostConnector.getAgentsStatus({ force: parsedUrl.searchParams.get('refresh') === 'true' });
        writeResource(response, { requestId, data, resourceVersion: phase2ResourceVersion('agents', data) });
        return;
      }
      if (request.method === 'GET' && pathname === `${API_BASE_PATH}/skills`) {
        const data = listPhase2Skills();
        writeResource(response, { requestId, data, resourceVersion: 'phase2-skills-v1' });
        return;
      }
      if (request.method === 'GET' && pathname === `${API_BASE_PATH}/runs`) {
        if (typeof hostConnector.refreshRuns === 'function') await hostConnector.refreshRuns();
        const data = hostConnector.listRuns();
        writeResource(response, { requestId, data, resourceVersion: phase2ResourceVersion('runs', data), page: { limit: 50, total: data.length } });
        return;
      }
      if (request.method === 'POST' && pathname === `${API_BASE_PATH}/runs`) {
        requireIdempotency(request);
        const body = await readJsonBody(request);
        const data = await hostConnector.createManualRun(body);
        writeResource(response, { requestId, data, resourceVersion: phase2ResourceVersion('run', data), statusCode: 201 });
        return;
      }
      if (request.method === 'GET' && pathname === `${API_BASE_PATH}/projects`) {
        const data = hostConnector.listProjects();
        writeResource(response, { requestId, data, resourceVersion: phase2ResourceVersion('projects', data), page: { limit: 50, total: data.length } });
        return;
      }
      const projectBrowserMatch = pathname.match(new RegExp(`^${API_BASE_PATH}/projects/([^/]+)/browser$`));
      if (request.method === 'GET' && projectBrowserMatch) {
        const data = hostConnector.getProjectBrowser({ projectId: decodeURIComponent(projectBrowserMatch[1]), relativePath: parsedUrl.searchParams.get('path') ?? '.' });
        writeResource(response, { requestId, data, resourceVersion: phase2ResourceVersion('project-browser', data), page: { limit: 100, total: data.entries.length } });
        return;
      }
      const projectMatch = pathname.match(new RegExp(`^${API_BASE_PATH}/projects/([^/]+)$`));
      if (request.method === 'PUT' && projectMatch) {
        requireIdempotency(request);
        const body = await readJsonBody(request);
        const data = hostConnector.upsertProject({ ...body, id: decodeURIComponent(projectMatch[1]) });
        writeResource(response, { requestId, data, resourceVersion: phase2ResourceVersion('project', data) });
        return;
      }
      if (request.method === 'GET' && pathname === `${API_BASE_PATH}/obsidian/status`) {
        const data = hostConnector.getObsidianStatus({ force: parsedUrl.searchParams.get('refresh') === 'true' });
        writeResource(response, { requestId, data, resourceVersion: phase2ResourceVersion('obsidian', data) });
        return;
      }
      if (request.method === 'POST' && pathname === `${API_BASE_PATH}/runs/obsidian-summary`) {
        requireIdempotency(request);
        const body = await readJsonBody(request);
        const data = hostConnector.runObsidianSummary(body);
        writeResource(response, { requestId, data, resourceVersion: phase2ResourceVersion('run', data), statusCode: 201 });
        return;
      }
      writeJson(response, 404, { error: 'not_found', requestId });
    } catch (error) {
      const statusCode = error.statusCode ?? (error.code === 'ERR_IDEMPOTENCY_REQUIRED' ? 400 : error.name?.includes('Contract') ? 400 : 500);
      logger.error('request.failed', { path: pathname, error: error.message }, { requestId });
      writeJson(response, statusCode, { error: error.code ?? 'internal', message: error.message, requestId });
    }
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

function writeResource(response, { requestId, data, resourceVersion, page = null, statusCode = 200 }) {
  const resource = createResourceResponse({ requestId, data, resourceVersion, page, statusCode });
  for (const [key, value] of Object.entries(resource.headers)) response.setHeader(key, value);
  writeJson(response, resource.statusCode, resource.body);
}

function requireIdempotency(request) {
  if (!readHeader(request, IDEMPOTENCY_KEY_HEADER)) {
    const error = new Error('Idempotency key is required for write commands.');
    error.code = 'ERR_IDEMPOTENCY_REQUIRED';
    error.statusCode = 400;
    throw error;
  }
}

function readHeader(request, name) {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(request.headers)) {
    if (key.toLowerCase() === lower) return Array.isArray(value) ? value[0] : value;
  }
  return null;
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

function phase2ResourceVersion(prefix, data) {
  const size = Array.isArray(data) ? data.length : 1;
  const stamp = Array.isArray(data) ? data.map((item) => item.lastUpdated ?? item.updatedAt ?? item.id).join('|') : data?.lastUpdated ?? data?.updatedAt ?? data?.id ?? 'v1';
  return `${prefix}-${size}-${Buffer.from(String(stamp)).toString('base64url').slice(0, 16)}`;
}

