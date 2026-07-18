import { listPhase2AgentCards, listPhase2Skills, createProjectWorkspace, createMinimalRun, createProjectBrowserSnapshot } from '@londi-agent-os/contracts';

export class Phase2DashboardError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'Phase2DashboardError';
    this.code = 'ERR_PHASE2_DASHBOARD';
    this.details = details;
  }
}

export function createPhase2DashboardModel({ agents = listPhase2AgentCards(), skills = listPhase2Skills(), projects = [], runs = [], obsidian = null, projectBrowser = null, generatedAt = new Date().toISOString(), lastUpdated = null, cached = false, errors = [] } = {}) {
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
    projectBrowser: projectBrowser ? createProjectBrowserSnapshot(projectBrowser) : null,
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

export function createPhase2DashboardViewModel(model = createPhase2DashboardModel()) {
  const dashboard = createPhase2DashboardModel(model);
  return deepFreeze({
    title: 'Londi Agent OS',
    subtitle: dashboard.obsidian?.available ? 'Live dashboard connected to Local API / HostConnector.' : 'Dashboard ready for Local API connection.',
    generatedAt: dashboard.generatedAt,
    lastUpdated: dashboard.lastUpdated,
    cachedLabel: dashboard.cached ? 'cached' : 'fresh',
    obsidianLabel: dashboard.obsidian?.available ? 'Obsidian available' : 'Obsidian unavailable',
    obsidianTone: dashboard.obsidian?.available ? 'green' : 'amber',
    metrics: [
      metric('agents', 'Agents', dashboard.counts.agents, 'blue'),
      metric('projects', 'Active projects', dashboard.counts.activeProjects, 'green'),
      metric('skills', 'Active skills', dashboard.counts.activeSkills, 'purple'),
      metric('runs', 'Succeeded runs', dashboard.counts.succeededRuns, 'green')
    ],
    agents: dashboard.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      status: agent.status,
      statusLabel: agent.statusLabel,
      usageLabel: agent.usage?.label ?? 'Usage unavailable',
      usageSource: agent.usage?.source ?? 'unavailable',
      usageMode: agent.usage?.mode ?? 'unavailable',
      warning: Boolean(agent.usage?.warning),
      cached: Boolean(agent.usage?.cached || dashboard.cached),
      lastUpdated: agent.lastUpdated ?? dashboard.lastUpdated,
      tone: toneForAgentStatus(agent.status)
    })),
    projects: dashboard.projects.map((project) => ({ id: project.id, name: project.name, status: project.status, rootPath: project.rootPath, agents: project.agentIds.length, skills: project.skillIds.length })),
    projectBrowser: dashboard.projectBrowser ? {
      projectId: dashboard.projectBrowser.projectId,
      relativePath: dashboard.projectBrowser.relativePath,
      entries: dashboard.projectBrowser.entries.map((entry) => ({ name: entry.name, path: entry.path, type: entry.type, size: entry.size, selectableAsContext: entry.selectableAsContext })),
      error: dashboard.projectBrowser.error
    } : null,
    skills: dashboard.skills.map((skill) => ({ id: skill.id, displayName: skill.displayName, active: skill.active, agents: skill.agentIds.length })),
    runs: dashboard.runs.map((run) => ({ id: run.id, title: run.title, status: run.status, agentId: run.agentId, skillId: run.skillId, summary: run.summary, artifactPath: run.artifactPath, lastUpdated: run.lastUpdated, createdAt: run.createdAt ?? run.lastUpdated, tone: toneForRunStatus(run.status) })),
    actions: dashboard.actions,
    errors: dashboard.errors
  });
}

export function createPhase2DashboardInteractionModel(viewModel = createPhase2DashboardViewModel(), { loadingAction = null, lastAction = null, error = null } = {}) {
  const loading = loadingAction !== null;
  const actionLabel = {
    load: 'Loading dashboard snapshot',
    refresh: 'Refreshing status / usage',
    'write-run-summary': 'Writing Run Summary to Obsidian',
    'create-manual-run': 'Creating manual run'
  }[loadingAction] ?? (lastAction ? `Last action: ${lastAction}` : 'Ready');
  return deepFreeze({
    ...viewModel,
    runtime: {
      ready: !loading,
      loading,
      loadingAction,
      lastAction,
      actionLabel,
      error: error ? String(error.message ?? error) : null
    },
    controls: [
      control('load', 'Load', loading, loadingAction === 'load', 'Load agent status, skills, projects, and Obsidian status.'),
      control('refresh', 'Refresh', loading, loadingAction === 'refresh', 'Manual refresh for agent/usage and Obsidian cache.'),
      control('write-run-summary', 'Write Run Summary', loading || viewModel.obsidianTone !== 'green', loadingAction === 'write-run-summary', 'Write the selected minimal run summary through Local API.'),
      control('create-manual-run', 'Create Manual Run', loading, loadingAction === 'create-manual-run', 'Create a manual Ask Agent Zero / General task run through Local API.', { placement: 'new-run-form' })
    ]
  });
}

export function createPhase2DashboardScreenModel(interaction = createPhase2DashboardInteractionModel()) {
  const model = interaction?.runtime && Array.isArray(interaction?.controls) ? interaction : createPhase2DashboardInteractionModel(interaction);
  const buttons = model.controls.map((item) => ({ id: item.id, label: item.label, disabled: item.disabled, loading: item.loading, description: item.description, dispatch: item.id, placement: item.placement ?? 'toolbar' }));
  const controlsById = Object.fromEntries(buttons.map((item) => [item.id, item]));
  return deepFreeze({
    screenId: 'phase2-dashboard',
    title: model.title,
    subtitle: model.subtitle,
    status: {
      ready: model.runtime.ready,
      loading: model.runtime.loading,
      actionLabel: model.runtime.actionLabel,
      error: model.runtime.error,
      cachedLabel: model.cachedLabel,
      lastUpdated: model.lastUpdated,
      obsidianLabel: model.obsidianLabel,
      obsidianTone: model.obsidianTone
    },
    sections: [
      section('metrics', 'Runtime Slice', model.metrics),
      section('agents', 'Agent Management', model.agents),
      section('projects', 'Project Workspace', model.projects),
      section('project-browser', 'Project Browser', model.projectBrowser?.entries ?? []),
      section('new-run', 'New Run', [{ label: 'Ask Agent Zero / General task', action: 'create-manual-run' }]),
      section('runs', 'Runs', model.runs),
      section('obsidian', 'Obsidian', [{ label: model.obsidianLabel, tone: model.obsidianTone }]),
      section('skills', 'Skill Registry', model.skills)
    ],
    buttons,
    controlsById,
    ariaLive: model.runtime.error ?? model.runtime.actionLabel,
    renderPolicy: {
      dispatchOnly: true,
      noPolling: true,
      noBootstrapNetworkCall: true,
      noDirectFilesystemOrCli: true
    }
  });
}

export function createPhase2DashboardScreen({ controller } = {}) {
  if (!controller || typeof controller.snapshot !== 'function' || typeof controller.dispatch !== 'function') throw new Phase2DashboardError('Phase 2 dashboard screen requires a controller.', { missing: 'controller' });

  const render = () => createPhase2DashboardScreenModel(controller.snapshot());
  return Object.freeze({
    render,
    async click(controlId, options = {}) {
      const before = render();
      const control = before.controlsById[controlId];
      if (!control) {
        await controller.dispatch(controlId, options);
        return render();
      }
      if (control.disabled) {
        const current = controller.snapshot();
        return createPhase2DashboardScreenModel({ ...current, runtime: { ...current.runtime, error: `${control.label} is disabled.` } });
      }
      await controller.dispatch(control.dispatch, options);
      return render();
    }
  });
}

export function createPhase2DashboardShellModel(screen = createPhase2DashboardScreenModel()) {
  const model = screen?.screenId === 'phase2-dashboard' ? screen : createPhase2DashboardScreenModel(screen);
  const metrics = model.sections.find((item) => item.id === 'metrics')?.items ?? [];
  const contentSections = model.sections.filter((item) => item.id !== 'metrics').map((item) => ({
    id: item.id,
    title: item.title,
    itemCount: item.items.length,
    empty: item.items.length === 0,
    items: item.items
  }));
  return deepFreeze({
    shellId: 'phase2-dashboard-shell',
    route: '/',
    title: model.title,
    subtitle: model.subtitle,
    header: {
      title: model.title,
      subtitle: model.subtitle,
      statusLabel: model.status.actionLabel,
      cachedLabel: model.status.cachedLabel,
      lastUpdated: model.status.lastUpdated,
      obsidianLabel: model.status.obsidianLabel,
      obsidianTone: model.status.obsidianTone
    },
    alerts: model.status.error ? [{ id: 'runtime-error', tone: 'red', message: model.status.error }] : [],
    metricCards: metrics.map((item) => ({ id: item.id, label: item.label, value: item.value, tone: item.tone })),
    toolbar: {
      ariaLive: model.ariaLive,
      buttons: model.buttons.filter((button) => button.placement !== 'new-run-form').map((button) => ({
        id: button.id,
        label: button.label,
        disabled: button.disabled,
        loading: button.loading,
        description: button.description,
        onClick: { type: 'dispatch-control', controlId: button.dispatch }
      }))
    },
    sections: contentSections,
    emptyState: contentSections.every((item) => item.empty) ? 'No Phase 2 dashboard data loaded yet.' : null,
    renderPolicy: {
      ...model.renderPolicy,
      domNeutral: true,
      eventHandlersOnlyDispatchControls: true
    }
  });
}

export function createPhase2DashboardVisualAdapter(shell = createPhase2DashboardShellModel(), { target = '#phase2-dashboard-root' } = {}) {
  const model = shell?.shellId === 'phase2-dashboard-shell' ? shell : createPhase2DashboardShellModel(shell);
  const html = [
    `<section class="phase2-dashboard" data-shell-id="${escapeHtml(model.shellId)}" data-route="${escapeHtml(model.route)}">`,
    renderVisualHeader(model.header),
    renderVisualAlerts(model.alerts),
    renderVisualMetrics(model.metricCards),
    renderVisualToolbar(model.toolbar),
    model.emptyState ? `<p class="phase2-dashboard__empty">${escapeHtml(model.emptyState)}</p>` : renderVisualSections(model.sections),
    '</section>'
  ].join('');
  return deepFreeze({
    adapterId: 'phase2-dashboard-visual-adapter',
    target,
    html,
    bindings: [
      ...model.toolbar.buttons.map((button) => ({
        selector: `[data-control-id="${escapeHtml(button.id)}"]`,
        controlId: button.onClick.controlId,
        event: 'click',
        handler: button.onClick,
        disabled: button.disabled
      })),
      { selector: '[data-control-id="create-manual-run"]', controlId: 'create-manual-run', event: 'click', handler: { type: 'dispatch-control', controlId: 'create-manual-run' }, disabled: false }
    ],
    ariaLive: model.toolbar.ariaLive,
    renderPolicy: {
      ...model.renderPolicy,
      staticHtmlOnly: true,
      bindControlsOnly: true,
      noDomMutation: true
    }
  });
}

export function createPhase2DashboardDomBinder({ screen, documentRef = globalThis.document, target = '#phase2-dashboard-root', createAdapter = createPhase2DashboardVisualAdapter, createDispatchOptions = () => ({}) } = {}) {
  if (!screen || typeof screen.render !== 'function' || typeof screen.click !== 'function') throw new Phase2DashboardError('Phase 2 dashboard DOM binder requires a screen.', { missing: 'screen' });
  if (typeof createAdapter !== 'function') throw new Phase2DashboardError('Phase 2 dashboard DOM binder requires an adapter factory.', { missing: 'createAdapter' });
  if (typeof createDispatchOptions !== 'function') throw new Phase2DashboardError('Phase 2 dashboard DOM binder requires a dispatch options factory.', { missing: 'createDispatchOptions' });

  let mountedTarget = null;
  let mountedTargetRef = target;
  let mounted = false;
  let teardown = [];

  const unbind = () => {
    for (const item of teardown) item.node.removeEventListener(item.event, item.listener);
    teardown = [];
  };
  const resolveTarget = (targetRef) => {
    if (targetRef && typeof targetRef === 'object') return targetRef;
    if (!documentRef || typeof documentRef.querySelector !== 'function') throw new Phase2DashboardError('Phase 2 dashboard DOM binder requires a document with querySelector before mount.', { missing: 'documentRef' });
    const node = documentRef.querySelector(targetRef);
    if (!node) throw new Phase2DashboardError('Phase 2 dashboard target was not found.', { target: targetRef });
    return node;
  };
  const renderIntoTarget = () => {
    if (!mountedTarget) throw new Phase2DashboardError('Phase 2 dashboard DOM binder is not mounted.', { missing: 'target' });
    unbind();
    const shell = createPhase2DashboardShellModel(screen.render());
    const adapter = createAdapter(shell, { target: mountedTargetRef });
    mountedTarget.innerHTML = adapter.html;
    let activeBindingCount = 0;
    for (const binding of adapter.bindings) {
      if (binding.disabled) continue;
      const node = mountedTarget.querySelector?.(binding.selector) ?? documentRef?.querySelector?.(binding.selector) ?? null;
      if (!node || typeof node.addEventListener !== 'function') continue;
      const listener = async (event) => {
        event?.preventDefault?.();
        await screen.click(binding.controlId, createBinderDispatchOptions(binding.controlId, binding));
        renderIntoTarget();
      };
      node.addEventListener(binding.event, listener);
      teardown.push({ node, event: binding.event, listener });
      activeBindingCount += 1;
    }
    return deepFreeze({
      binderId: 'phase2-dashboard-dom-binder',
      mounted: true,
      target: adapter.target,
      bindingCount: adapter.bindings.length,
      activeBindingCount,
      ariaLive: adapter.ariaLive,
      renderPolicy: {
        ...adapter.renderPolicy,
        noDomMutation: false,
        controlledDomMutation: true,
        mountsStaticHtml: true,
        bindsDispatchControls: true,
        rerenderAfterDispatch: true,
        noPolling: true,
        noBootstrapNetworkCall: true,
        noDirectFilesystemOrCli: true
      }
    });
  };

  const createBinderDispatchOptions = (controlId, binding) => {
    const options = createDispatchOptions(controlId, binding) ?? {};
    if (controlId !== 'create-manual-run') return options;
    return { ...options, input: readManualRunFormInput() };
  };
  const readManualRunFormInput = () => ({
    title: readFormValue('manual-run-title'),
    prompt: readFormValue('manual-run-prompt'),
    summary: readFormValue('manual-run-summary')
  });
  const readFormValue = (field) => mountedTarget?.querySelector?.(`[data-field="${field}"]`)?.value ?? '';

  return Object.freeze({
    binderId: 'phase2-dashboard-dom-binder',
    mount({ target: nextTarget = mountedTargetRef } = {}) {
      mountedTargetRef = nextTarget;
      mountedTarget = resolveTarget(nextTarget);
      mounted = true;
      return renderIntoTarget();
    },
    refresh() {
      return renderIntoTarget();
    },
    unmount({ clear = true } = {}) {
      unbind();
      if (clear && mountedTarget) mountedTarget.innerHTML = '';
      mountedTarget = null;
      mounted = false;
      return deepFreeze({ binderId: 'phase2-dashboard-dom-binder', mounted: false, target: mountedTargetRef });
    },
    isMounted() {
      return mounted;
    }
  });
}

export function createPhase2DashboardController({ runtime, createIdempotencyKey = createDashboardIdempotencyKey } = {}) {
  if (!runtime || typeof runtime.snapshot !== 'function' || typeof runtime.load !== 'function' || typeof runtime.refresh !== 'function' || typeof runtime.writeRunSummary !== 'function') {
    throw new Phase2DashboardError('Phase 2 dashboard controller requires a runtime.', { missing: 'runtime' });
  }
  if (typeof createIdempotencyKey !== 'function') throw new Phase2DashboardError('Phase 2 dashboard controller requires an idempotency key factory.', { missing: 'createIdempotencyKey' });

  let viewModel = runtime.snapshot();
  let state = { loadingAction: null, lastAction: null, error: null };

  const snapshot = () => createPhase2DashboardInteractionModel(viewModel, state);
  const runAction = async (actionId, operation) => {
    state = { loadingAction: actionId, lastAction: state.lastAction, error: null };
    try {
      const result = await operation();
      viewModel = result?.dashboard ?? result;
      state = { loadingAction: null, lastAction: actionId, error: null };
      return snapshot();
    } catch (error) {
      state = { loadingAction: null, lastAction: state.lastAction, error };
      return snapshot();
    }
  };

  return Object.freeze({
    snapshot,
    load() {
      return runAction('load', () => runtime.load({ refresh: false }));
    },
    refresh() {
      return runAction('refresh', () => runtime.refresh());
    },
    writeRunSummary({ input, idempotencyKey } = {}) {
      const key = idempotencyKey ?? createIdempotencyKey(input);
      return runAction('write-run-summary', () => runtime.writeRunSummary({ input, idempotencyKey: key }));
    },
    createManualRun({ input, idempotencyKey } = {}) {
      return runAction('create-manual-run', () => {
        const normalizedInput = validateManualRunInput(input);
        const key = idempotencyKey ?? createDashboardIdempotencyKey(normalizedInput, 'manual-run');
        if (typeof runtime.createManualRun !== 'function') throw new Phase2DashboardError('Manual run creation is unavailable.');
        return runtime.createManualRun({ input: normalizedInput, idempotencyKey: key });
      });
    },
    dispatch(controlId, options = {}) {
      if (controlId === 'load') return this.load();
      if (controlId === 'refresh') return this.refresh();
      if (controlId === 'write-run-summary') return this.writeRunSummary(options);
      if (controlId === 'create-manual-run') return this.createManualRun(options);
      state = { loadingAction: null, lastAction: state.lastAction, error: new Phase2DashboardError('Unknown Phase 2 dashboard control.', { controlId }) };
      return Promise.resolve(snapshot());
    }
  });
}

export function createPhase2DashboardRuntime({ apiClient, fetchImpl = globalThis.fetch, now = () => new Date().toISOString(), requestIdPrefix = 'phase2-dashboard' } = {}) {
  if (!apiClient || typeof apiClient.createRequest !== 'function') throw new Phase2DashboardError('Phase 2 dashboard runtime requires an API client.', { missing: 'apiClient' });
  if (typeof fetchImpl !== 'function') throw new Phase2DashboardError('Phase 2 dashboard runtime requires a fetch implementation.', { missing: 'fetch' });
  if (typeof now !== 'function') throw new Phase2DashboardError('Phase 2 dashboard runtime requires a clock function.', { missing: 'now' });

  let dashboard = createPhase2DashboardModel({ generatedAt: now() });

  return Object.freeze({
    snapshot() {
      return createPhase2DashboardViewModel(dashboard);
    },
    async load({ refresh = false } = {}) {
      dashboard = await loadPhase2DashboardFromApi({ apiClient, fetchImpl, requestIdPrefix, generatedAt: now(), refresh });
      return createPhase2DashboardViewModel(dashboard);
    },
    async refresh() {
      return this.load({ refresh: true });
    },
    async writeRunSummary({ input, idempotencyKey, requestId = `${requestIdPrefix}-run-summary` } = {}) {
      const run = await writePhase2ObsidianRunSummary({ apiClient, fetchImpl, input, idempotencyKey, requestId });
      dashboard = createPhase2DashboardModel({ ...dashboard, runs: upsertRun(dashboard.runs, run), lastUpdated: run.lastUpdated ?? now() });
      return deepFreeze({ run, dashboard: createPhase2DashboardViewModel(dashboard) });
    },
    async createManualRun({ input, idempotencyKey, requestId = `${requestIdPrefix}-manual-run` } = {}) {
      const run = await createPhase2ManualRun({ apiClient, fetchImpl, input, idempotencyKey, requestId });
      dashboard = createPhase2DashboardModel({ ...dashboard, runs: upsertRun(dashboard.runs, run), lastUpdated: run.lastUpdated ?? run.createdAt ?? now() });
      return deepFreeze({ run, dashboard: createPhase2DashboardViewModel(dashboard) });
    }
  });
}

export function createPhase2DashboardApiRequests({ refresh = false, projectId = '{projectId}' } = {}) {
  return Object.freeze([
    { id: 'load-agents', label: 'Load agent status / usage', method: 'GET', path: `/agents${refresh ? '?refresh=true' : ''}` },
    { id: 'load-skills', label: 'Load Skill Registry', method: 'GET', path: '/skills' },
    { id: 'load-projects', label: 'Load projects', method: 'GET', path: '/projects' },
    { id: 'load-project-browser', label: 'Load project browser', method: 'GET', path: `/projects/${encodeURIComponent(projectId)}/browser` },
    { id: 'load-obsidian-status', label: 'Load Obsidian status', method: 'GET', path: `/obsidian/status${refresh ? '?refresh=true' : ''}` },
    { id: 'refresh-status-usage', label: 'Refresh status / usage', method: 'GET', path: '/agents?refresh=true' },
    { id: 'upsert-project', label: 'Save project workspace', method: 'PUT', path: `/projects/${encodeURIComponent(projectId)}`, idempotent: true },
    { id: 'write-obsidian-run-summary', label: 'Write Run Summary to Obsidian', method: 'POST', path: '/runs/obsidian-summary', idempotent: true },
    { id: 'list-runs', label: 'List runs', method: 'GET', path: '/runs' },
    { id: 'create-manual-run', label: 'Create Manual Run', method: 'POST', path: '/runs', idempotent: true }
  ]);
}

export async function loadPhase2DashboardFromApi({ apiClient, fetchImpl = globalThis.fetch, requestIdPrefix = 'phase2-dashboard', generatedAt = new Date().toISOString(), refresh = false } = {}) {
  if (!apiClient || typeof apiClient.createRequest !== 'function') throw new Phase2DashboardError('Phase 2 dashboard requires an API client.', { missing: 'apiClient' });
  if (typeof fetchImpl !== 'function') throw new Phase2DashboardError('Phase 2 dashboard requires a fetch implementation.', { missing: 'fetch' });

  const requests = [
    ['agents', apiClient.createRequest('GET', `/agents${refresh ? '?refresh=true' : ''}`, { requestId: `${requestIdPrefix}-agents` })],
    ['skills', apiClient.createRequest('GET', '/skills', { requestId: `${requestIdPrefix}-skills` })],
    ['projects', apiClient.createRequest('GET', '/projects', { requestId: `${requestIdPrefix}-projects` })],
    ['runs', apiClient.createRequest('GET', '/runs', { requestId: `${requestIdPrefix}-runs` })],
    ['obsidian', apiClient.createRequest('GET', `/obsidian/status${refresh ? '?refresh=true' : ''}`, { requestId: `${requestIdPrefix}-obsidian` })]
  ];
  const entries = await Promise.all(requests.map(async ([key, request]) => [key, await fetchApiResource(fetchImpl, request)]));
  const snapshot = Object.fromEntries(entries);
  const firstProjectId = snapshot.projects.data?.[0]?.id ?? null;
  const projectBrowser = firstProjectId ? await fetchApiResource(fetchImpl, apiClient.createRequest('GET', `/projects/${encodeURIComponent(firstProjectId)}/browser`, { requestId: `${requestIdPrefix}-project-browser` })).catch((error) => ({ data: createProjectBrowserSnapshot({ projectId: firstProjectId, error: error.message }) })) : { data: null };
  return createPhase2DashboardModel({
    generatedAt,
    lastUpdated: generatedAt,
    cached: [snapshot.agents, snapshot.skills, snapshot.projects, snapshot.runs, snapshot.obsidian].some((item) => item.cached === true),
    agents: snapshot.agents.data,
    skills: snapshot.skills.data,
    projects: snapshot.projects.data,
    runs: snapshot.runs.data,
    obsidian: snapshot.obsidian.data,
    projectBrowser: projectBrowser.data
  });
}

export async function createPhase2ManualRun({ apiClient, fetchImpl = globalThis.fetch, input, idempotencyKey, requestId = 'phase2-dashboard-manual-run' } = {}) {
  if (!apiClient || typeof apiClient.createRequest !== 'function') throw new Phase2DashboardError('Phase 2 dashboard requires an API client.', { missing: 'apiClient' });
  if (typeof fetchImpl !== 'function') throw new Phase2DashboardError('Phase 2 dashboard requires a fetch implementation.', { missing: 'fetch' });
  if (!idempotencyKey) throw new Phase2DashboardError('Manual run creation requires an idempotency key.', { missing: 'idempotencyKey' });
  const request = apiClient.createRequest('POST', '/runs', { idempotencyKey, requestId, body: input });
  const resource = await fetchApiResource(fetchImpl, request, { expectedStatus: 201 });
  return createMinimalRun(resource.data);
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

function renderVisualHeader(header) {
  return `<header class="phase2-dashboard__header"><div><h1>${escapeHtml(header.title)}</h1><p>${escapeHtml(header.subtitle)}</p></div><dl><dt>Status</dt><dd>${escapeHtml(header.statusLabel)}</dd><dt>Cache</dt><dd>${escapeHtml(header.cachedLabel)}</dd><dt>Updated</dt><dd>${escapeHtml(header.lastUpdated)}</dd><dt>Obsidian</dt><dd data-tone="${escapeHtml(header.obsidianTone)}">${escapeHtml(header.obsidianLabel)}</dd></dl></header>`;
}

function renderVisualAlerts(alerts) {
  return alerts.map((alert) => `<p class="phase2-dashboard__alert" data-tone="${escapeHtml(alert.tone)}">${escapeHtml(alert.message)}</p>`).join('');
}

function renderVisualMetrics(metricCards) {
  return `<section class="phase2-dashboard__metrics" aria-label="Phase 2 metrics">${metricCards.map((card) => `<article data-metric-id="${escapeHtml(card.id)}" data-tone="${escapeHtml(card.tone)}"><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong></article>`).join('')}</section>`;
}

function renderVisualToolbar(toolbar) {
  return `<nav class="phase2-dashboard__toolbar" aria-live="polite" data-aria-live="${escapeHtml(toolbar.ariaLive)}">${toolbar.buttons.map((button) => `<button type="button" data-control-id="${escapeHtml(button.id)}" ${button.disabled ? 'disabled ' : ''}aria-busy="${button.loading ? 'true' : 'false'}" title="${escapeHtml(button.description)}">${escapeHtml(button.label)}</button>`).join('')}</nav>`;
}

function renderVisualSections(sections) {
  return sections.map((sectionItem) => {
    const body = sectionItem.id === 'new-run' ? renderManualRunForm() : (sectionItem.empty ? '<p>No items.</p>' : `<div>${sectionItem.items.map(renderVisualItem).join('')}</div>`);
    return `<section class="phase2-dashboard__section" data-section-id="${escapeHtml(sectionItem.id)}"><h2>${escapeHtml(sectionItem.title)}</h2>${body}</section>`;
  }).join('');
}

function renderManualRunForm() {
  return [
    '<form data-form-id="manual-run">',
    '<p>Ask Agent Zero / General task</p>',
    '<label>Title <input type="text" data-field="manual-run-title" name="title" required></label>',
    '<label>Prompt / Request <textarea data-field="manual-run-prompt" name="prompt" required></textarea></label>',
    '<label>Summary result <textarea data-field="manual-run-summary" name="summary" required></textarea></label>',
    '<button type="button" data-control-id="create-manual-run">Create Manual Run</button>',
    '</form>'
  ].join('');
}

function renderVisualItem(item) {
  const attrs = Object.entries(item).filter(([, value]) => value !== null && value !== undefined && typeof value !== 'object').map(([key, value]) => ` data-${kebabCase(key)}="${escapeHtml(value)}"`).join('');
  const label = item.name ?? item.title ?? item.displayName ?? item.label ?? item.id ?? 'Item';
  const detail = item.role ?? item.statusLabel ?? item.status ?? item.summary ?? item.rootPath ?? item.tone ?? '';
  return `<article class="phase2-dashboard__item"${attrs}><strong>${escapeHtml(label)}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ''}</article>`;
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function kebabCase(value) {
  return String(value).replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`).replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
}

function section(id, title, items) {
  return { id, title, items };
}

function metric(id, label, value, tone) {
  return { id, label, value, tone };
}

function createDashboardIdempotencyKey(input = {}, suffix = 'obsidian-summary') {
  const runId = input?.id ?? input?.runId ?? input?.title ?? 'run';
  return `phase2-dashboard-${String(runId).replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()}-${suffix}`;
}

function control(id, label, disabled, loading, description, options = {}) {
  return { id, label, disabled: Boolean(disabled), loading: Boolean(loading), description, placement: options.placement ?? 'toolbar' };
}

function validateManualRunInput(input = {}) {
  const title = String(input.title ?? '').trim();
  const prompt = String(input.prompt ?? '').trim();
  const summary = String(input.summary ?? '').trim();
  const missing = [!title && 'Title', !prompt && 'Prompt / Request', !summary && 'Summary result'].filter(Boolean);
  if (missing.length) throw new Phase2DashboardError(`${missing.join(', ')} required.`);
  return { title, prompt, summary };
}

function toneForAgentStatus(status) {
  return { active: 'green', available: 'blue', planned: 'amber', unavailable: 'red' }[status] ?? 'neutral';
}

function toneForRunStatus(status) {
  return { idle: 'neutral', running: 'blue', succeeded: 'green', failed: 'red' }[status] ?? 'neutral';
}

function upsertRun(runs, run) {
  const normalizedRun = createMinimalRun(run);
  const nextRuns = runs.filter((item) => item.id !== normalizedRun.id);
  nextRuns.push(normalizedRun);
  return nextRuns;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
