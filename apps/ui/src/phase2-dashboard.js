import { listPhase2AgentCards, listPhase2Skills, createProjectWorkspace, createMinimalRun } from '@londi-agent-os/contracts';

export class Phase2DashboardError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'Phase2DashboardError';
    this.code = 'ERR_PHASE2_DASHBOARD';
    this.details = details;
  }
}

export function createPhase2DashboardModel({ agents = listPhase2AgentCards(), skills = listPhase2Skills(), projects = [], runs = [], obsidian = null, generatedAt = new Date().toISOString() } = {}) {
  const normalizedProjects = projects.map(createProjectWorkspace);
  const normalizedRuns = runs.map(createMinimalRun);
  return deepFreeze({
    generatedAt,
    agents,
    skills,
    projects: normalizedProjects,
    runs: normalizedRuns,
    obsidian,
    counts: {
      agents: agents.length,
      activeProjects: normalizedProjects.filter((project) => project.status === 'active').length,
      activeSkills: skills.filter((skill) => skill.active).length,
      succeededRuns: normalizedRuns.filter((run) => run.status === 'succeeded').length
    },
    actions: [
      { id: 'refresh-status-usage', label: 'Refresh status / usage', method: 'GET', path: '/api/v1/agents?refresh=true' },
      { id: 'write-obsidian-run-summary', label: 'Write Run Summary to Obsidian', method: 'POST', path: '/api/v1/runs/obsidian-summary' }
    ]
  });
}

export function assertProjectHasAllAgents(project) {
  const normalized = createProjectWorkspace(project);
  for (const agentId of ['agent-zero', 'codex', 'claude-code', 'hermes']) {
    if (!normalized.agentIds.includes(agentId)) throw new Phase2DashboardError('Project must include every Phase 2 agent.', { projectId: normalized.id, missingAgentId: agentId });
  }
  return true;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
