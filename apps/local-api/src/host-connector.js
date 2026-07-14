import {
  OBSIDIAN_RUN_SUMMARY_TARGET_FOLDER,
  createMinimalRun,
  createObsidianRunSummaryFilename,
  createProjectWorkspace,
  listPhase2AgentCards,
  renderRunSummaryMarkdown
} from '@londi-agent-os/contracts';

export const HOST_CONNECTOR_CACHE_TTL_MS = Object.freeze({
  agentAvailability: 30_000,
  usageSubscription: 300_000,
  obsidianStatus: 60_000,
  manualRefreshGuard: 10_000
});

export class HostConnectorError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'HostConnectorError';
    this.code = 'ERR_HOST_CONNECTOR';
    this.details = details;
  }
}

export function createInMemoryHostConnector({
  now = () => new Date().toISOString(),
  vaultPath = null,
  writeFile = null,
  mkdir = null,
  joinPath = (...parts) => parts.join('/'),
  exists = () => Boolean(vaultPath),
  projects = []
} = {}) {
  const cache = new Map();
  const projectStore = new Map(projects.map((project) => {
    const normalized = createProjectWorkspace(project);
    return [normalized.id, normalized];
  }));

  return Object.freeze({
    getAgentsStatus(options = {}) {
      return readCached('agents', HOST_CONNECTOR_CACHE_TTL_MS.agentAvailability, options, () =>
        listPhase2AgentCards({ now: now() })
      );
    },

    getObsidianStatus(options = {}) {
      return readCached('obsidian', HOST_CONNECTOR_CACHE_TTL_MS.obsidianStatus, options, () => {
        const available = Boolean(vaultPath && exists(vaultPath));
        return Object.freeze({
          available,
          vaultPath: vaultPath ?? null,
          targetFolder: OBSIDIAN_RUN_SUMMARY_TARGET_FOLDER,
          source: available ? 'host-connector' : 'unavailable',
          lastUpdated: now(),
          cached: false,
          message: available ? 'Obsidian vault available.' : 'Obsidian vault path is not configured or unavailable.'
        });
      });
    },

    listProjects() {
      return Object.freeze([...projectStore.values()]);
    },

    upsertProject(project) {
      const normalized = createProjectWorkspace({ ...project, updatedAt: now(), createdAt: project.createdAt ?? now() });
      projectStore.set(normalized.id, normalized);
      return normalized;
    },

    writeRunSummary(input) {
      if (!vaultPath) throw new HostConnectorError('Obsidian vault path is required before writing Run Summary.');
      if (typeof writeFile !== 'function' || typeof mkdir !== 'function') throw new HostConnectorError('HostConnector write dependencies are not configured.');
      const filename = createObsidianRunSummaryFilename({ date: input.timestamp ?? now(), runId: input.runId, title: input.title });
      const targetDirectory = joinPath(vaultPath, OBSIDIAN_RUN_SUMMARY_TARGET_FOLDER);
      const artifactPath = joinPath(targetDirectory, filename);
      mkdir(targetDirectory, { recursive: true });
      writeFile(artifactPath, renderRunSummaryMarkdown({ ...input, timestamp: input.timestamp ?? now() }), 'utf8');
      return Object.freeze({ result: 'Written', artifactPath, filename, targetFolder: OBSIDIAN_RUN_SUMMARY_TARGET_FOLDER, lastUpdated: now() });
    },

    runObsidianSummary({ id, title, projectId = null, summary, artifacts = [], decisionOrAcceptance = 'Pending review' } = {}) {
      const run = createMinimalRun({ id, title, projectId, status: 'running', lastUpdated: now() });
      const written = this.writeRunSummary({ runId: run.id, title: run.title, projectId, summary, artifacts, decisionOrAcceptance, timestamp: now() });
      return createMinimalRun({ ...run, status: 'succeeded', summary, artifactPath: written.artifactPath, lastUpdated: written.lastUpdated });
    }
  });

  function readCached(key, ttlMs, options, producer) {
    const forceAllowed = options.force === true && manualRefreshAllowed(key);
    const current = Date.parse(now());
    const cached = cache.get(key);
    if (!forceAllowed && cached && current - cached.storedAtMs < ttlMs) {
      return markCached(cached.value);
    }
    const value = producer();
    cache.set(key, { value, storedAtMs: current, lastManualRefreshMs: options.force === true ? current : cached?.lastManualRefreshMs ?? 0 });
    return value;
  }

  function manualRefreshAllowed(key) {
    const current = Date.parse(now());
    const cached = cache.get(key);
    if (!cached) return true;
    return current - (cached.lastManualRefreshMs ?? 0) >= HOST_CONNECTOR_CACHE_TTL_MS.manualRefreshGuard;
  }
}

function markCached(value) {
  if (Array.isArray(value)) return Object.freeze(value.map((item) => ({ ...item, usage: { ...item.usage, cached: true }, cached: true })));
  return Object.freeze({ ...value, cached: true });
}
