import { listPhase2AgentCards, listPhase2Skills, createProjectWorkspace, createMinimalRun } from '@londi-agent-os/contracts';

export class Phase2DashboardError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'Phase2DashboardError';
    this.code = 'ERR_PHASE2_DASHBOARD';
    this.details = details;
  }
}

export function createPhase2DashboardModel({ agents = listPhase2AgentCards(), skills = listPhase2Skills(), projects = [], runs = [], obsidian = null, generatedAt = new Date().toISOString(), lastUpdated = null, cached = false, errors = [] } = {}) {
  const normalizedProjects = projects.map(createProjectWorkspace);
  const normalizedRuns = runs.map(createMinimalRun);
  return deepFreeze({
    generatedAt,
    lastUpdated: lastUpdated ?? generatedAt,
    cached: Boolean(cached),
    agents,
    skills,
    projects: normalizedProjects,
    runs: normalizedRuns,
    obsidian,
    errors: errors.map((item) => String(item)),
    counts: {
      agents: agents.length,
      activeProjects: normalizedProjects.filter((project) => project.status === 'active').length,
      activeSkills: skills.filter((skill) => skill.active).length,
      succeededRuns: normalizedRuns.filter((run) => run.status === 'succeeded').length
    },
    actions: createPhase2DashboardApiRequests()
  });
}

export function createPhase2DashboardApiRequests({ refresh = false, projectId = '{projectId}' } = {}) {
  return Object.freeze([
    { id: 'load-agents', label: 'Load agent status / usage', method: 'GET', path: `/agents${refresh ? '?refresh=true' : ''}` },
    { id: 'load-skills', label: 'Load Skill Registry', method: 'GET', path: '/skills' },
    { id: 'load-projects', label: 'Load projects', method: 'GET', path: '/projects' },
    { id: 'load-obsidian-status', label: 'Load Obsidian status', method: 'GET', path: `/obsidian/status${refresh ? '?refresh=true' : ''}` },
    { id: 'refresh-status-usage', label: 'Refresh status / usage', method: 'GET', path: '/agents?refresh=true' },
    { id: 'upsert-project', label: 'Save project workspace', method: 'PUT', path: `/projects/${encodeURIComponent(projectId)}`, idempotent: true },
    { id: 'write-obsidian-run-summary', label: 'Write Run Summary to Obsidian', method: 'POST', path: '/runs/obsidian-summary', idempotent: true }
  ]);
}

export async function loadPhase2DashboardFromApi({ apiClient, fetchImpl = globalThis.fetch, requestIdPrefix = 'phase2-dashboard', generatedAt = new Date().toISOString(), refresh = false } = {}) {
  if (!apiClient || typeof apiClient.createRequest !== 'function') throw new Phase2DashboardError('Phase 2 dashboard requires an API client.', { missing: 'apiClient' });
  if (typeof fetchImpl !== 'function') throw new Phase2DashboardError('Phase 2 dashboard requires a fetch implementation.', { missing: 'fetch' });

  const requests = [
    ['agents', apiClient.createRequest('GET', `/agents${refresh ? '?refresh=true' : ''}`, { requestId: `${requestIdPrefix}-agents` })],
    ['skills', apiClient.createRequest('GET', '/skills', { requestId: `${requestIdPrefix}-skills` })],
    ['projects', apiClient.createRequest('GET', '/projects', { requestId: `${requestIdPrefix}-projects` })],
    ['obsidian', apiClient.createRequest('GET', `/obsidian/status${refresh ? '?refresh=true' : ''}`, { requestId: `${requestIdPrefix}-obsidian` })]
  ];
  const entries = await Promise.all(requests.map(async ([key, request]) => [key, await fetchApiResource(fetchImpl, request)]));
  const snapshot = Object.fromEntries(entries);
  return createPhase2DashboardModel({
    generatedAt,
    lastUpdated: generatedAt,
    cached: [snapshot.agents, snapshot.skills, snapshot.projects, snapshot.obsidian].some((item) => item.cached === true),
    agents: snapshot.agents.data,
    skills: snapshot.skills.data,
    projects: snapshot.projects.data,
    obsidian: snapshot.obsidian.data
  });
}

export async function writePhase2ObsidianRunSummary({ apiClient, fetchImpl = globalThis.fetch, input, idempotencyKey, requestId = 'phase2-dashboard-run-summary' } = {}) {
  if (!apiClient || typeof apiClient.createRequest !== 'function') throw new Phase2DashboardError('Phase 2 dashboard requires an API client.', { missing: 'apiClient' });
  if (typeof fetchImpl !== 'function') throw new Phase2DashboardError('Phase 2 dashboard requires a fetch implementation.', { missing: 'fetch' });
  if (!idempotencyKey) throw new Phase2DashboardError('Run Summary write requires an idempotency key.', { missing: 'idempotencyKey' });
  const request = apiClient.createRequest('POST', '/runs/obsidian-summary', { idempotencyKey, requestId, body: input });
  const resource = await fetchApiResource(fetchImpl, request, { expectedStatus: 201 });
  return createMinimalRun(resource.data);
}

export function assertProjectHasAllAgents(project) {
  const normalized = createProjectWorkspace(project);
  for (const agentId of ['agent-zero', 'codex', 'claude-code', 'hermes']) {
    if (!normalized.agentIds.includes(agentId)) throw new Phase2DashboardError('Project must include every Phase 2 agent.', { projectId: normalized.id, missingAgentId: agentId });
  }
  return true;
}

async function fetchApiResource(fetchImpl, request, { expectedStatus = 200 } = {}) {
  const response = await fetchImpl(request.url, { method: request.method, headers: request.headers, body: request.body });
  const payload = await response.json();
  if (response.status !== expectedStatus) throw new Phase2DashboardError('Local API request failed.', { status: response.status, expectedStatus, error: payload.error ?? payload.message ?? null });
  return { data: payload.data, resourceVersion: payload.resourceVersion ?? null, cached: Boolean(payload.data?.cached) };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
