import {
  OBSIDIAN_RUN_SUMMARY_TARGET_FOLDER,
  createManualRunRecord,
  createMinimalRun,
  createProjectBrowserSnapshot,
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
  resolvePath = (...parts) => joinPath(...parts),
  relativePath = (from, to) => String(to).startsWith(String(from)) ? String(to).slice(String(from).length).replace(/^[\\/]+/, '') || '.' : String(to),
  exists = () => Boolean(vaultPath),
  stat = null,
  readDir = null,
  projects = [],
  runs = [],
  // Persistence is opt-in. A relative default resolves against the caller's cwd, which silently
  // wrote test fixtures into the repository's real data directory.
  runsFilePath = null,
  projectsFilePath = null,
  readFile = null,
  detectDefaultBranch = null,
  executeManualRun = null,
  refreshManualRun = executeManualRun?.refreshRun ?? null
} = {}) {
  const cache = new Map();
  const projectStore = new Map(projects.map((project) => {
    const normalized = createProjectWorkspace(project);
    return [normalized.id, normalized];
  }));
  const runStore = new Map(runs.map((run) => {
    const normalized = normalizeStoredRun(run);
    return [normalized.id, normalized];
  }));
  hydrateRunsFromDisk();
  hydrateProjectsFromDisk();

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

    getProjectBrowser({ projectId, relativePath: requestedPath = '.', maxEntries = 100 } = {}) {
      if (!projectId) throw new HostConnectorError('Project browser requires projectId.');
      const project = projectStore.get(String(projectId).toLowerCase()) ?? projectStore.get(projectId);
      if (!project) throw new HostConnectorError('Project was not found for browsing.', { projectId });
      if (!project.rootPath) throw new HostConnectorError('Project root path is required for browsing.', { projectId: project.id });
      if (typeof readDir !== 'function' || typeof stat !== 'function') throw new HostConnectorError('HostConnector project browser dependencies are not configured.');
      const safeRelativePath = normalizeBrowserRelativePath(requestedPath);
      const root = resolvePath(project.rootPath);
      const target = safeRelativePath === '.' ? root : resolvePath(root, safeRelativePath);
      if (!isPathInside(root, target)) throw new HostConnectorError('Project browser path must stay inside the project root.', { projectId: project.id, relativePath: requestedPath });
      if (typeof exists === 'function' && !exists(target)) throw new HostConnectorError('Project browser path does not exist.', { projectId: project.id, relativePath: safeRelativePath });
      const entries = readDir(target, { withFileTypes: true })
        .filter((entry) => !isHiddenOrIgnoredProjectEntry(entry.name))
        .sort((a, b) => Number(b.isDirectory?.() ?? false) - Number(a.isDirectory?.() ?? false) || a.name.localeCompare(b.name))
        .slice(0, maxEntries)
        .map((entry) => {
          const absolute = resolvePath(target, entry.name);
          const info = stat(absolute);
          const type = entry.isDirectory?.() ? 'directory' : 'file';
          return {
            name: entry.name,
            path: normalizeBrowserRelativePath(relativePath(root, absolute)),
            type,
            size: type === 'file' ? info.size : null,
            selectableAsContext: type === 'file'
          };
        });
      return createProjectBrowserSnapshot({ projectId: project.id, rootPath: project.rootPath, relativePath: safeRelativePath, entries, loadedAt: now() });
    },

    upsertProject(project) {
      const existing = project?.id ? projectStore.get(String(project.id).toLowerCase()) ?? null : null;
      const normalized = createProjectWorkspace({
        ...project,
        targetBranch: project.targetBranch ?? resolveProjectTargetBranch(project.rootPath) ?? existing?.targetBranch ?? null,
        updatedAt: now(),
        createdAt: project.createdAt ?? existing?.createdAt ?? now()
      });
      projectStore.set(normalized.id, normalized);
      persistProjectsToDisk();
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
    },

    listRuns() {
      return Object.freeze([...runStore.values()].sort((a, b) => String(b.createdAt ?? b.lastUpdated ?? '').localeCompare(String(a.createdAt ?? a.lastUpdated ?? ''))));
    },

    async refreshRuns() {
      if (typeof refreshManualRun !== 'function') return this.listRuns();
      for (const storedRun of [...runStore.values()]) {
        if (storedRun?.type !== 'manual' || storedRun.status !== 'running') continue;
        try {
          const result = await refreshManualRun({ run: storedRun });
          if (!result?.status || result.status === storedRun.status) {
            if (result?.execution) persistManualRun({ ...storedRun, execution: result.execution, lastUpdated: now() });
            continue;
          }
          persistManualRun({
            ...storedRun,
            status: result.status,
            summary: result.summary ?? storedRun.summary,
            artifactPath: result.artifactPath ?? storedRun.artifactPath,
            execution: result.execution ?? storedRun.execution,
            agentResponse: result.agentResponse ?? storedRun.agentResponse,
            sessionId: result.sessionId ?? storedRun.sessionId,
            error: result.error ?? null,
            lastUpdated: now()
          });
        } catch (error) {
          persistManualRun({
            ...storedRun,
            status: 'failed',
            error: error?.message ?? 'Manual run status refresh failed.',
            execution: {
              ...(storedRun.execution ?? {}),
              ...(error?.details?.execution ?? {}),
              error: { code: error?.code ?? 'ERR_MANUAL_RUN_REFRESH', message: error?.message ?? 'Manual run status refresh failed.' }
            },
            lastUpdated: now()
          });
        }
      }
      return this.listRuns();
    },

    async createManualRun(input = {}) {
      const createdAt = now();
      const id = input.id ?? createManualRunId(input.title, createdAt);
      let run = persistManualRun({ ...input, id, createdAt, lastUpdated: createdAt, status: 'queued' });
      if (typeof executeManualRun !== 'function') return run;

      const sessionId = resolveThreadSessionId(run);
      run = persistManualRun({ ...run, status: 'running', sessionId, lastUpdated: now() });
      const project = input.projectId ? projectStore.get(String(input.projectId).toLowerCase()) ?? projectStore.get(input.projectId) ?? null : null;
      try {
        const result = await executeManualRun({ run, input: { ...input, sessionId }, project });
        return persistManualRun({
          ...run,
          status: result?.status ?? 'succeeded',
          summary: result?.summary ?? run.summary,
          artifactPath: result?.artifactPath ?? run.artifactPath,
          execution: result?.execution ?? run.execution,
          agentResponse: result?.agentResponse ?? run.agentResponse,
          sessionId: result?.sessionId ?? run.sessionId,
          error: result?.error ?? null,
          lastUpdated: now()
        });
      } catch (error) {
        return persistManualRun({
          ...run,
          status: 'failed',
          error: error?.message ?? 'Manual run execution failed.',
          // A failed run must still carry whatever the agent managed to say.
          agentResponse: error?.details?.agentResponse ?? run.agentResponse,
          // A failed turn still belongs to the thread, so the next message can continue it.
          sessionId: error?.details?.sessionId ?? run.sessionId,
          execution: {
            ...(error?.details?.execution ?? run.execution ?? {}),
            error: { code: error?.code ?? 'ERR_MANUAL_RUN_EXECUTION', message: error?.message ?? 'Manual run execution failed.' }
          },
          lastUpdated: now()
        });
      }
    }
  });

  function hydrateRunsFromDisk() {
    readStoreFile(runsFilePath, 'runs', 'Manual runs', (item) => {
      const normalized = normalizeStoredRun(item);
      runStore.set(normalized.id, normalized);
    });
  }

  function hydrateProjectsFromDisk() {
    readStoreFile(projectsFilePath, 'projects', 'Projects', (item) => {
      const normalized = createProjectWorkspace(item);
      projectStore.set(normalized.id, normalized);
    });
  }

  function readStoreFile(filePath, key, label, absorb) {
    if (!filePath || typeof readFile !== 'function') return;
    try {
      if (typeof exists === 'function' && !exists(filePath)) return;
      const parsed = JSON.parse(readFile(filePath, 'utf8'));
      const items = Array.isArray(parsed) ? parsed : parsed[key];
      if (!Array.isArray(items)) return;
      for (const item of items) absorb(item);
    } catch (error) {
      throw new HostConnectorError(`${label} storage could not be read.`, { path: filePath, message: error.message });
    }
  }

  function writeStoreFile(filePath, payload) {
    if (!filePath || typeof writeFile !== 'function' || typeof mkdir !== 'function') return;
    const directory = String(filePath).split(/[\\/]/).slice(0, -1).join('/') || '.';
    mkdir(directory, { recursive: true });
    writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  function persistRunsToDisk() {
    writeStoreFile(runsFilePath, { runs: [...runStore.values()] });
  }

  function persistProjectsToDisk() {
    writeStoreFile(projectsFilePath, { projects: [...projectStore.values()] });
  }

  function resolveProjectTargetBranch(rootPath) {
    if (!rootPath || typeof detectDefaultBranch !== 'function') return null;
    try {
      return detectDefaultBranch({ repositoryPath: rootPath });
    } catch {
      return null;
    }
  }

  function persistManualRun(input) {
    const run = createManualRunRecord(input);
    runStore.set(run.id, run);
    persistRunsToDisk();
    return run;
  }

  // A conversation is one project talking to one agent, so the newest run in that pair that
  // recorded a session id is the thread a new message continues.
  function resolveThreadSessionId(run) {
    if (!run?.projectId || !run?.agentId) return null;
    let latest = null;
    for (const stored of runStore.values()) {
      if (stored?.type !== 'manual' || !stored.sessionId || stored.id === run.id) continue;
      if (stored.projectId !== run.projectId || stored.agentId !== run.agentId) continue;
      if (!latest || String(stored.createdAt ?? '') > String(latest.createdAt ?? '')) latest = stored;
    }
    return latest?.sessionId ?? null;
  }

  function normalizeStoredRun(run) {
    return run?.type === 'manual' ? createManualRunRecord(run) : createMinimalRun(run);
  }

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

function createManualRunId(title, createdAt) {
  const stamp = String(createdAt).replace(/[^0-9]/g, '').slice(0, 14);
  const slug = String(title ?? 'manual-run').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'manual-run';
  return `run-${stamp}-${slug}`;
}


function normalizeBrowserRelativePath(value = '.') {
  const normalized = String(value || '.').replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+$/g, '') || '.';
  if (normalized.split('/').includes('..')) throw new HostConnectorError('Project browser path must stay inside the project root.', { relativePath: value });
  return normalized;
}

function isPathInside(root, target) {
  const rootText = String(root).replaceAll('\\', '/').replace(/\/+$/g, '');
  const targetText = String(target).replaceAll('\\', '/');
  return targetText === rootText || targetText.startsWith(rootText + '/');
}

function isHiddenOrIgnoredProjectEntry(name) {
  return name.startsWith('.') || ['node_modules', '__pycache__', 'dist', 'build', '.next'].includes(name);
}
