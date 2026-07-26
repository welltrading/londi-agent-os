export const PHASE2_AGENT_IDS = Object.freeze(['agent-zero', 'codex', 'claude-code', 'hermes']);
export const PHASE2_AGENT_STATUSES = Object.freeze(['active', 'available', 'planned', 'unavailable']);
export const PHASE2_USAGE_MODES = Object.freeze(['api_billing', 'subscription', 'local_estimate', 'manual', 'unavailable']);
export const PHASE2_USAGE_UNITS = Object.freeze(['credits', 'tokens', 'sessions', 'usd', 'unknown']);
export const PHASE2_USAGE_SOURCES = Object.freeze(['cli', 'logs', 'api', 'manual', 'estimated', 'unavailable']);
export const PHASE2_SKILL_IDS = Object.freeze([
  'orchestration-control',
  'obsidian-run-summary',
  'local-agent-status',
  'usage-status-refresh',
  'code-execution-task',
  'code-review-refactor',
  'knowledge-context'
]);
export const PHASE2_ACTIVE_SKILL_IDS = Object.freeze(['obsidian-run-summary', 'local-agent-status', 'usage-status-refresh']);
export const PHASE2_PROJECT_STATUSES = Object.freeze(['active', 'paused', 'archived']);
export const PHASE2_PROJECT_BROWSER_ENTRY_TYPES = Object.freeze(['directory', 'file']);
export const OBSIDIAN_RUN_SUMMARY_TARGET_FOLDER = 'Londi Agent OS/Runs/';

export class Phase2RuntimeContractError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'Phase2RuntimeContractError';
    this.code = 'ERR_PHASE2_RUNTIME_CONTRACT';
    this.details = details;
  }
}

export const PHASE2_SKILL_REGISTRY = deepFreeze({
  'orchestration-control': skill('orchestration-control', 'Orchestration control', 'Central orchestration capability for Agent Zero.', { active: false, agentIds: ['agent-zero'] }),
  'obsidian-run-summary': skill('obsidian-run-summary', 'Obsidian Run Summary', 'Write a Run Summary note to Obsidian through HostConnector.', { active: true, agentIds: ['agent-zero'] }),
  'local-agent-status': skill('local-agent-status', 'Local agent status', 'Check local agent status on demand.', { active: true, agentIds: PHASE2_AGENT_IDS }),
  'usage-status-refresh': skill('usage-status-refresh', 'Usage status refresh', 'Refresh usage/subscription metadata on demand.', { active: true, agentIds: PHASE2_AGENT_IDS }),
  'code-execution-task': skill('code-execution-task', 'Code execution task', 'Future Codex execution capability.', { active: false, agentIds: ['codex'] }),
  'code-review-refactor': skill('code-review-refactor', 'Code review/refactor', 'Future Claude Code review/refactor capability.', { active: false, agentIds: ['claude-code'] }),
  'knowledge-context': skill('knowledge-context', 'Knowledge context', 'Future Hermes knowledge capability.', { active: false, agentIds: ['hermes'] })
});

export const PHASE2_AGENT_CATALOG = deepFreeze({
  'agent-zero': agent('agent-zero', 'Agent Zero', 'Orchestrator / Host', 'active', 'Active orchestrator', ['orchestration-control', 'obsidian-run-summary', 'local-agent-status', 'usage-status-refresh']),
  codex: agent('codex', 'Codex', 'Local execution agent', 'available', 'Local CLI availability', ['local-agent-status', 'usage-status-refresh', 'code-execution-task']),
  'claude-code': agent('claude-code', 'Claude Code', 'Local execution/review agent', 'available', 'Local CLI availability', ['local-agent-status', 'usage-status-refresh', 'code-review-refactor']),
  hermes: agent('hermes', 'Hermes', 'Planned knowledge layer', 'planned', 'Planned knowledge layer', ['local-agent-status', 'usage-status-refresh', 'knowledge-context'])
});

export function listPhase2Skills() {
  return PHASE2_SKILL_IDS.map((skillId) => ({ ...PHASE2_SKILL_REGISTRY[skillId], agentIds: [...PHASE2_SKILL_REGISTRY[skillId].agentIds] }));
}

export function listPhase2AgentCards({ now = new Date().toISOString(), usageByAgent = {}, statusByAgent = {} } = {}) {
  return PHASE2_AGENT_IDS.map((agentId) => createAgentCard({
    ...PHASE2_AGENT_CATALOG[agentId],
    status: statusByAgent[agentId]?.status ?? PHASE2_AGENT_CATALOG[agentId].status,
    statusLabel: statusByAgent[agentId]?.statusLabel ?? PHASE2_AGENT_CATALOG[agentId].statusLabel,
    usage: usageByAgent[agentId],
    lastUpdated: now
  }));
}

export function createAgentCard({ id, name, role, status, statusLabel, usage, skills = [], lastUpdated } = {}) {
  assertOneOf(id, PHASE2_AGENT_IDS, 'agent id');
  assertOneOf(status, PHASE2_AGENT_STATUSES, 'agent status');
  const normalizedSkills = skills.map((item) => typeof item === 'string' ? summarizeSkill(item) : normalizeSkillSummary(item));
  return deepFreeze({
    id,
    name: sanitizeText(name ?? id),
    role: sanitizeText(role ?? ''),
    status,
    statusLabel: sanitizeText(statusLabel ?? status),
    usage: normalizeAgentUsage(usage ?? defaultUsageForAgent(id)),
    skills: normalizedSkills,
    lastUpdated: lastUpdated ?? null
  });
}

export function normalizeAgentUsage(usage = {}) {
  assertOneOf(usage.mode, PHASE2_USAGE_MODES, 'usage mode');
  assertOneOf(usage.unit, PHASE2_USAGE_UNITS, 'usage unit');
  assertOneOf(usage.source, PHASE2_USAGE_SOURCES, 'usage source');
  return deepFreeze({
    mode: usage.mode,
    label: sanitizeText(usage.label ?? usage.mode),
    used: numberOrUndefined(usage.used),
    limit: numberOrUndefined(usage.limit),
    unit: usage.unit,
    source: usage.source,
    warning: Boolean(usage.warning),
    lastUpdated: usage.lastUpdated ?? null,
    cached: Boolean(usage.cached)
  });
}

export function createProjectWorkspace({ id, name, rootPath, status = 'active', agentIds = PHASE2_AGENT_IDS, skillIds = PHASE2_ACTIVE_SKILL_IDS, doxPath = 'AGENTS.md', contextRoot = 'context/', decisionsLogPath = 'decisions/log.md', createdAt, updatedAt } = {}) {
  if (!id || typeof id !== 'string') throw new Phase2RuntimeContractError('Project workspace requires id.');
  if (!name || typeof name !== 'string') throw new Phase2RuntimeContractError('Project workspace requires name.');
  assertOneOf(status, PHASE2_PROJECT_STATUSES, 'project status');
  const uniqueAgentIds = unique(agentIds);
  const uniqueSkillIds = unique(skillIds);
  uniqueAgentIds.forEach((agentId) => assertOneOf(agentId, PHASE2_AGENT_IDS, 'project agent id'));
  uniqueSkillIds.forEach((skillId) => assertOneOf(skillId, PHASE2_SKILL_IDS, 'project skill id'));
  return deepFreeze({
    id: sanitizeSlug(id),
    name: sanitizeText(name),
    rootPath: rootPath ? sanitizeText(rootPath) : null,
    status,
    agentIds: uniqueAgentIds,
    skillIds: uniqueSkillIds,
    doxPath: sanitizeRelativeProjectPath(doxPath, 'doxPath'),
    contextRoot: sanitizeRelativeProjectPath(contextRoot, 'contextRoot'),
    decisionsLogPath: sanitizeRelativeProjectPath(decisionsLogPath, 'decisionsLogPath'),
    createdAt: createdAt ?? null,
    updatedAt: updatedAt ?? createdAt ?? null
  });
}

export function createProjectBrowserEntry({ name, path, type, size = null, selectableAsContext = true } = {}) {
  if (!name || !path) throw new Phase2RuntimeContractError('Project browser entry requires name and path.');
  assertOneOf(type, PHASE2_PROJECT_BROWSER_ENTRY_TYPES, 'project browser entry type');
  return deepFreeze({
    name: sanitizeText(name),
    path: sanitizeRelativeProjectPath(path, 'projectBrowserPath'),
    type,
    size: size === null || size === undefined ? null : numberOrUndefined(size),
    selectableAsContext: Boolean(selectableAsContext)
  });
}

export function createProjectBrowserSnapshot({ projectId = null, rootPath = null, relativePath = '.', entries = [], loadedAt = null, error = null } = {}) {
  return deepFreeze({
    projectId: projectId ? sanitizeSlug(projectId) : null,
    rootPath: rootPath ? sanitizeText(rootPath) : null,
    relativePath: sanitizeRelativeProjectPath(relativePath || '.', 'projectBrowserRelativePath'),
    entries: entries.map(createProjectBrowserEntry),
    loadedAt,
    error: error ? sanitizeText(error) : null
  });
}

export function createMinimalRun({ id, title, projectId = null, agentId = 'agent-zero', skillId = 'obsidian-run-summary', status = 'idle', summary = '', artifactPath = null, lastUpdated = null, createdAt = null, error = null } = {}) {
  if (!id || !title) throw new Phase2RuntimeContractError('Minimal run requires id and title.');
  assertOneOf(agentId, PHASE2_AGENT_IDS, 'run agent id');
  assertOneOf(skillId, PHASE2_SKILL_IDS, 'run skill id');
  assertOneOf(status, ['idle', 'running', 'succeeded', 'failed'], 'run status');
  return deepFreeze({ id: sanitizeSlug(id), title: sanitizeText(title), projectId: projectId ? sanitizeSlug(projectId) : null, agentId, skillId, status, summary: sanitizeText(summary), artifactPath: artifactPath ? sanitizeText(artifactPath) : null, lastUpdated, createdAt, error: error ? sanitizeText(error) : null });
}


export function createManualRunRecord({ id, title, prompt, summary, status = 'queued', createdAt = new Date().toISOString(), lastUpdated = createdAt, projectId = null, agentId = 'agent-zero', artifactPath = null, error = null, execution = null } = {}) {
  if (!id || !title || !prompt || !summary) throw new Phase2RuntimeContractError('Manual run requires id, title, prompt and summary.');
  assertOneOf(status, ['queued', 'running', 'succeeded', 'failed'], 'manual run status');
  assertOneOf(agentId, PHASE2_AGENT_IDS, 'manual run agent id');
  return deepFreeze({
    ...createMinimalRun({ id, title, projectId, agentId, skillId: 'orchestration-control', status: status === 'queued' ? 'idle' : status, summary, artifactPath, createdAt, lastUpdated, error }),
    status,
    type: 'manual',
    action: `ask-${agentId}-general-task`,
    prompt: sanitizeText(prompt),
    execution: execution && typeof execution === 'object' ? structuredClone(execution) : null
  });
}

export function createObsidianRunSummaryFilename({ date = new Date().toISOString(), runId, title } = {}) {
  if (!runId || !title) throw new Phase2RuntimeContractError('Run summary filename requires runId and title.');
  const day = String(date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Phase2RuntimeContractError('Run summary filename requires ISO-like date.', { date });
  return `${day}__run-${sanitizeSlug(runId).replace(/^run-/, '')}__${sanitizeSlug(title)}.md`;
}

export function createRunSummaryInput({ runId, title, projectId = null, agent = 'Agent Zero', status = 'succeeded', skillId = 'obsidian-run-summary', summary, artifacts = [], decisionOrAcceptance = 'Pending review', timestamp = new Date().toISOString() } = {}) {
  if (!runId || !title || !summary) throw new Phase2RuntimeContractError('Run summary input requires runId, title and summary.');
  assertOneOf(skillId, PHASE2_SKILL_IDS, 'summary skill id');
  return deepFreeze({ runId: sanitizeSlug(runId), title: sanitizeText(title), projectId: projectId ? sanitizeSlug(projectId) : null, agent: sanitizeText(agent), status: sanitizeText(status), skillId, summary: sanitizeText(summary), artifacts: artifacts.map(sanitizeText), decisionOrAcceptance: sanitizeText(decisionOrAcceptance), timestamp });
}

export function renderRunSummaryMarkdown(input) {
  const summary = createRunSummaryInput(input);
  const artifacts = summary.artifacts.length ? summary.artifacts.map((item) => `- ${item}`).join('\n') : '- None';
  const projectLine = summary.projectId ? `- Project ID: ${summary.projectId}\n` : '';
  return `# Run Summary — ${summary.title}\n\n- Date: ${summary.timestamp}\n- Run ID: ${summary.runId}\n${projectLine}- Agent: ${summary.agent}\n- Status: ${summary.status}\n- Skill: ${summary.skillId}\n\n## Summary\n\n${summary.summary}\n\n## Artifacts\n\n${artifacts}\n\n## Decision / Acceptance\n\n${summary.decisionOrAcceptance}\n\n## Source\n\nCreated by Londi Agent OS via HostConnector.\n`;
}

export function validatePhase2RuntimeContracts() {
  if (Object.keys(PHASE2_AGENT_CATALOG).length !== PHASE2_AGENT_IDS.length) throw new Phase2RuntimeContractError('Agent catalog must include every Phase 2 agent.');
  if (Object.keys(PHASE2_SKILL_REGISTRY).length !== PHASE2_SKILL_IDS.length) throw new Phase2RuntimeContractError('Skill registry must include every Phase 2 skill.');
  listPhase2AgentCards();
  listPhase2Skills();
  return true;
}

function skill(id, displayName, description, { active, agentIds }) {
  return { id, displayName, description, active, agentIds };
}

function agent(id, name, role, status, statusLabel, skills) {
  return { id, name, role, status, statusLabel, skills };
}

function summarizeSkill(skillId) {
  const item = PHASE2_SKILL_REGISTRY[skillId];
  if (!item) throw new Phase2RuntimeContractError('Unknown skill id.', { skillId });
  return normalizeSkillSummary(item);
}

function normalizeSkillSummary(item = {}) {
  assertOneOf(item.id, PHASE2_SKILL_IDS, 'skill id');
  return Object.freeze({ id: item.id, displayName: sanitizeText(item.displayName ?? item.id), active: Boolean(item.active) });
}

function defaultUsageForAgent(agentId) {
  if (agentId === 'agent-zero') return { mode: 'local_estimate', label: 'Local orchestrator', unit: 'unknown', source: 'estimated' };
  if (agentId === 'hermes') return { mode: 'unavailable', label: 'Planned — no usage yet', unit: 'unknown', source: 'unavailable' };
  return { mode: 'subscription', label: 'Subscription / CLI status', unit: 'unknown', source: 'cli' };
}

function assertOneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw new Phase2RuntimeContractError(`Invalid ${label}.`, { value, allowed });
}

function numberOrUndefined(value) {
  if (value === undefined || value === null) return undefined;
  if (!Number.isFinite(value)) throw new Phase2RuntimeContractError('Usage numeric fields must be finite.', { value });
  return value;
}

function sanitizeText(value) {
  return String(value ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').trim();
}

function sanitizeSlug(value) {
  const slug = String(value ?? '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  if (!slug) throw new Phase2RuntimeContractError('Slug cannot be empty.', { value });
  return slug;
}

function sanitizeRelativeProjectPath(value, label) {
  const path = sanitizeText(value);
  if (!path || path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.split(/[\\/]+/).includes('..')) {
    throw new Phase2RuntimeContractError('Project DOX paths must be relative and stay inside the project workspace.', { label, value });
  }
  return path.replaceAll('\\', '/');
}

function unique(values = []) {
  return [...new Set(values)];
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
