import { strict as assert } from 'node:assert';
import {
  createMemoryTokenProvider,
  createApiClient,
  createPhase2DashboardApiRequests,
  createPhase2DashboardModel,
  createPhase2DashboardRuntime,
  createPhase2DashboardController,
  createPhase2DashboardScreenModel,
  createPhase2DashboardScreen,
  createPhase2DashboardShellModel,
  createPhase2DashboardVisualAdapter,
  createPhase2DashboardDomBinder,
  createPhase2DashboardViewModel,
  createPhase2DashboardInteractionModel,
  loadPhase2DashboardFromApi,
  createPhase2ManualRun,
  writePhase2ObsidianRunSummary,
  assertProjectHasAllAgents,
  Phase2DashboardError
} from '../apps/ui/src/index.js';
import { createManualRunRecord, listPhase2AgentCards, listPhase2Skills } from '../packages/contracts/src/index.js';

const dashboard = createPhase2DashboardModel({
  generatedAt: '2026-07-14T18:00:00.000Z',
  projects: [{ id: 'Client Project', name: 'Client Project', rootPath: 'C:/Projects/client' }],
  runs: [{ id: 'run-1', title: 'Run summary', projectId: 'client-project', status: 'succeeded', summary: 'ok' }],
  projectBrowser: { projectId: 'client-project', entries: [{ name: 'src', path: 'src', type: 'directory', selectableAsContext: false }, { name: 'README.md', path: 'README.md', type: 'file', size: 12 }] }
});
assert.equal(dashboard.counts.agents, 4);
assert.equal(dashboard.counts.activeProjects, 1);
assert.equal(dashboard.counts.activeSkills, 3);
assert.equal(dashboard.counts.succeededRuns, 1);
assert.equal(dashboard.projects[0].agentIds.includes('codex'), true);
assert.equal(dashboard.actions.find((action) => action.id === 'write-obsidian-run-summary').path, '/runs/obsidian-summary');
assert.equal(assertProjectHasAllAgents(dashboard.projects[0]), true);
assert.throws(() => assertProjectHasAllAgents({ id: 'x', name: 'X', agentIds: ['agent-zero'] }), Phase2DashboardError);

const viewModel = createPhase2DashboardViewModel(dashboard);
assert.equal(viewModel.title, 'Londi Agent OS');
assert.equal(viewModel.cachedLabel, 'fresh');
assert.equal(viewModel.metrics.find((item) => item.id === 'agents').value, 4);
assert.equal(viewModel.obsidianLabel, 'Obsidian unavailable');
assert.equal(viewModel.agents.find((agent) => agent.id === 'agent-zero').tone, 'green');
assert.equal(viewModel.agents.find((agent) => agent.id === 'hermes').tone, 'amber');
assert.equal(viewModel.projects[0].agents, 4);
assert.equal(viewModel.projectBrowser.entries.some((entry) => entry.name === 'README.md'), true);
assert.equal(viewModel.skills.find((skill) => skill.id === 'obsidian-run-summary').agents, 1);
assert.equal(viewModel.runs[0].tone, 'green');
assert.equal(Object.isFrozen(viewModel.agents[0]), true);
assert.throws(() => { viewModel.agents[0].name = 'mutated'; }, TypeError);

const idleInteraction = createPhase2DashboardInteractionModel(viewModel);
assert.equal(idleInteraction.runtime.ready, true);
assert.equal(idleInteraction.runtime.actionLabel, 'Ready');
assert.equal(idleInteraction.controls.find((control) => control.id === 'load').disabled, false);
assert.equal(idleInteraction.controls.find((control) => control.id === 'write-run-summary').disabled, true);
assert.equal(Object.isFrozen(idleInteraction.controls[0]), true);

const loadingInteraction = createPhase2DashboardInteractionModel(viewModel, { loadingAction: 'refresh' });
assert.equal(loadingInteraction.runtime.loading, true);
assert.equal(loadingInteraction.runtime.actionLabel, 'Refreshing status / usage');
assert.equal(loadingInteraction.controls.every((control) => control.disabled), true);
assert.equal(loadingInteraction.controls.find((control) => control.id === 'refresh').loading, true);

const errorInteraction = createPhase2DashboardInteractionModel(viewModel, { error: new Error('network down') });
assert.equal(errorInteraction.runtime.error, 'network down');

const screenModel = createPhase2DashboardScreenModel(idleInteraction);
assert.equal(screenModel.screenId, 'phase2-dashboard');
assert.equal(screenModel.sections.find((section) => section.id === 'agents').items.length, 4);
assert.equal(screenModel.sections.find((section) => section.id === 'project-browser').items.length, 2);
assert.equal(screenModel.buttons.find((button) => button.id === 'load').dispatch, 'load');
assert.equal(screenModel.renderPolicy.dispatchOnly, true);
assert.equal(screenModel.renderPolicy.noPolling, true);
assert.equal(screenModel.ariaLive, 'Ready');
assert.equal(createPhase2DashboardScreenModel(errorInteraction).ariaLive, 'network down');
assert.equal(Object.isFrozen(screenModel.sections[0]), true);
assert.throws(() => { screenModel.buttons[0].label = 'mutated'; }, TypeError);

const shellModel = createPhase2DashboardShellModel(screenModel);
assert.equal(shellModel.shellId, 'phase2-dashboard-shell');
assert.equal(shellModel.route, '/');
assert.equal(shellModel.header.statusLabel, 'Ready');
assert.equal(shellModel.metricCards.find((card) => card.id === 'agents').value, 4);
assert.equal(shellModel.toolbar.buttons.find((button) => button.id === 'refresh').onClick.controlId, 'refresh');
assert.equal(shellModel.sections.find((section) => section.id === 'agents').itemCount, 4);
assert.equal(shellModel.renderPolicy.domNeutral, true);
assert.equal(shellModel.renderPolicy.eventHandlersOnlyDispatchControls, true);
assert.equal(createPhase2DashboardShellModel(createPhase2DashboardScreenModel(errorInteraction)).alerts[0].message, 'network down');
assert.equal(Object.isFrozen(shellModel.toolbar.buttons[0].onClick), true);
assert.throws(() => { shellModel.toolbar.buttons[0].onClick.controlId = 'mutated'; }, TypeError);

const visualAdapter = createPhase2DashboardVisualAdapter(shellModel, { target: '#dashboard' });
assert.equal(visualAdapter.adapterId, 'phase2-dashboard-visual-adapter');
assert.equal(visualAdapter.target, '#dashboard');
assert.equal(visualAdapter.html.includes('data-shell-id="phase2-dashboard-shell"'), true);
assert.equal(visualAdapter.html.includes('data-control-id="refresh"'), true);
assert.equal(visualAdapter.html.includes('phase2-dashboard__chat'), true);
assert.equal(visualAdapter.html.includes('data-field="manual-run-agent"'), true);
assert.equal(visualAdapter.html.includes('<option value="codex"'), true);
assert.equal(visualAdapter.html.includes('data-field="manual-run-prompt"'), true);
assert.equal(visualAdapter.html.includes('data-field="manual-run-title"'), false);
assert.equal(visualAdapter.html.includes('Summary result'), false);
assert.equal(visualAdapter.html.includes('data-control-id="create-manual-run"'), true);
assert.equal(visualAdapter.html.includes('>Send</button>'), true);
assert.equal(visualAdapter.html.includes('Manual Ask Agent Zero chat message:'), false);
assert.equal(visualAdapter.bindings.find((binding) => binding.controlId === 'refresh').handler.type, 'dispatch-control');
assert.equal(visualAdapter.bindings.every((binding) => binding.event === 'click'), true);
assert.equal(visualAdapter.renderPolicy.staticHtmlOnly, true);
assert.equal(visualAdapter.renderPolicy.bindControlsOnly, true);
assert.equal(visualAdapter.renderPolicy.noDomMutation, true);
assert.equal(Object.isFrozen(visualAdapter.bindings[0].handler), true);
assert.throws(() => { visualAdapter.bindings[0].controlId = 'mutated'; }, TypeError);
const escapedViewModel = createPhase2DashboardViewModel({ ...dashboard, projects: [{ id: '<script>', name: '<Client>', rootPath: 'A&B' }] });
const escapedInteraction = createPhase2DashboardInteractionModel(escapedViewModel);
const escapedScreenModel = createPhase2DashboardScreenModel(escapedInteraction);
const escapedShellModel = createPhase2DashboardShellModel(escapedScreenModel);
const escapedVisualAdapter = createPhase2DashboardVisualAdapter(escapedShellModel);
assert.equal(escapedVisualAdapter.html.includes('<Client>'), false);
assert.equal(escapedVisualAdapter.html.includes('&lt;Client&gt;'), true);

const obsidianInteraction = createPhase2DashboardInteractionModel(createPhase2DashboardViewModel({ ...dashboard, obsidian: { available: true, targetFolder: 'Londi Agent OS/Runs/' } }));
assert.equal(obsidianInteraction.controls.find((control) => control.id === 'write-run-summary').disabled, false);

let resolveLoad;
const controllerCalls = [];
const loadedControllerView = createPhase2DashboardViewModel({ ...dashboard, obsidian: { available: true, targetFolder: 'Londi Agent OS/Runs/' } });
const controller = createPhase2DashboardController({
  runtime: {
    snapshot: () => viewModel,
    load: (options) => {
      controllerCalls.push(['load', options]);
      return new Promise((resolve) => { resolveLoad = () => resolve(loadedControllerView); });
    },
    refresh: () => {
      controllerCalls.push(['refresh']);
      return Promise.resolve(loadedControllerView);
    },
    writeRunSummary: (options) => {
      controllerCalls.push(['writeRunSummary', options]);
      return Promise.resolve({ run: { id: 'run-2' }, dashboard: loadedControllerView });
    }
  },
  createIdempotencyKey: (input) => `idem-${input.id}`
});
assert.equal(controller.snapshot().runtime.ready, true);
const pendingLoad = controller.dispatch('load');
assert.equal(controller.snapshot().runtime.loadingAction, 'load');
resolveLoad();
const loadedInteraction = await pendingLoad;
assert.equal(loadedInteraction.obsidianLabel, 'Obsidian available');
assert.equal(loadedInteraction.runtime.lastAction, 'load');
assert.deepEqual(controllerCalls[0], ['load', { refresh: false }]);
const refreshedInteraction = await controller.dispatch('refresh');
assert.equal(refreshedInteraction.runtime.lastAction, 'refresh');
const writtenInteraction = await controller.dispatch('write-run-summary', { input: { id: 'run-2', title: 'API summary' } });
assert.equal(writtenInteraction.runtime.lastAction, 'write-run-summary');
assert.equal(controllerCalls.at(-1)[1].idempotencyKey, 'idem-run-2');
controllerCalls.length = 0;
const manualController = createPhase2DashboardController({
  runtime: {
    snapshot: () => viewModel,
    load: () => Promise.resolve(loadedControllerView),
    refresh: () => Promise.resolve(loadedControllerView),
    writeRunSummary: () => Promise.resolve({ dashboard: loadedControllerView }),
    createManualRun: (options) => {
      controllerCalls.push(['createManualRun', options]);
      return Promise.resolve({ run: { id: 'run-4' }, dashboard: loadedControllerView });
    }
  }
});
const manualInteraction = await manualController.dispatch('create-manual-run', { input: { prompt: 'Build the chat composer', agentId: 'codex', projectId: 'londi-agent-os' } });
assert.equal(manualInteraction.runtime.lastAction, 'create-manual-run');
assert.equal(controllerCalls.at(-1)[1].input.title, 'Build the chat composer');
assert.equal(controllerCalls.at(-1)[1].input.agentId, 'codex');
assert.equal(controllerCalls.at(-1)[1].input.projectId, 'londi-agent-os');
assert.equal(controllerCalls.at(-1)[1].input.summary, 'Manual codex chat message: Build the chat composer');
assert.equal(controllerCalls.at(-1)[1].idempotencyKey, 'phase2-dashboard-build-the-chat-composer-manual-run');
const missingMessage = await manualController.dispatch('create-manual-run', { input: { prompt: '   ' } });
assert.equal(missingMessage.runtime.error, 'Message required.');

// Executing agents must be blocked with a readable error when no project is selected, and the
// chosen agent/project must survive the post-dispatch re-render.
const missingProject = await manualController.dispatch('create-manual-run', { input: { prompt: 'Run this', agentId: 'codex' } });
assert.match(missingProject.runtime.error, /Select a project before sending to codex/);
assert.equal(missingProject.selection.agentId, 'codex');
assert.equal(controllerCalls.at(-1)[0], 'createManualRun');
const agentZeroWithoutProject = await manualController.dispatch('create-manual-run', { input: { prompt: 'Note this', agentId: 'agent-zero' } });
assert.equal(agentZeroWithoutProject.runtime.error, null);
const preserved = await manualController.dispatch('refresh', { selection: { agentId: 'claude-code', projectId: 'londi-agent-os' } });
assert.equal(preserved.selection.agentId, 'claude-code');
assert.equal(preserved.selection.projectId, 'londi-agent-os');
const unknownInteraction = await controller.dispatch('missing-control');
assert.equal(unknownInteraction.runtime.error, 'Unknown Phase 2 dashboard control.');
assert.throws(() => createPhase2DashboardController({ runtime: {} }), Phase2DashboardError);

const screenCalls = [];
const screen = createPhase2DashboardScreen({
  controller: {
    snapshot: () => obsidianInteraction,
    dispatch: (controlId, options) => {
      screenCalls.push([controlId, options]);
      return Promise.resolve(obsidianInteraction);
    }
  }
});
assert.equal(screen.render().buttons.find((button) => button.id === 'write-run-summary').disabled, false);
const disabledScreen = createPhase2DashboardScreen({ controller: { snapshot: () => idleInteraction, dispatch: () => { throw new Error('disabled button should not dispatch'); } } });
const disabledClick = await disabledScreen.click('write-run-summary');
assert.equal(disabledClick.status.error, 'Write Run Summary is disabled.');
await screen.click('refresh', { manual: true });
assert.deepEqual(screenCalls.at(-1), ['refresh', { manual: true }]);
await screen.click('missing-control');
assert.equal(screenCalls.at(-1)[0], 'missing-control');
assert.throws(() => createPhase2DashboardScreen({ controller: {} }), Phase2DashboardError);

const fakeDocument = createFakeDocument();
const rootNode = fakeDocument.querySelector('#phase2-dashboard-root');
let domClicked = false;
const domScreen = {
  render: () => createPhase2DashboardScreenModel(domClicked ? createPhase2DashboardInteractionModel(loadedControllerView, { lastAction: 'refresh' }) : obsidianInteraction),
  click: async (controlId, options = {}) => {
    screenCalls.push(['dom', controlId, options]);
    domClicked = true;
    return domScreen.render();
  }
};
const binder = createPhase2DashboardDomBinder({
  screen: domScreen,
  documentRef: fakeDocument,
  createDispatchOptions: (controlId, binding) => ({ source: 'dom-binder', controlId, bindingEvent: binding.event })
});
assert.equal(binder.binderId, 'phase2-dashboard-dom-binder');
assert.equal(binder.isMounted(), false);
const mounted = binder.mount();
assert.equal(binder.isMounted(), true);
assert.equal(mounted.bindingCount, 4);
assert.equal(mounted.activeBindingCount, 4);
assert.equal(mounted.renderPolicy.controlledDomMutation, true);
assert.equal(mounted.renderPolicy.noPolling, true);
assert.equal(rootNode.innerHTML.includes('data-shell-id="phase2-dashboard-shell"'), true);
assert.equal(rootNode.innerHTML.includes('phase2-dashboard__chat-composer'), true);
await rootNode.querySelector('[data-control-id="refresh"]').click();
assert.deepEqual(screenCalls.at(-1), ['dom', 'refresh', { source: 'dom-binder', controlId: 'refresh', bindingEvent: 'click', selection: { agentId: 'agent-zero', projectId: '', intent: 'conversation' } }]);
assert.equal('event' in screenCalls.at(-1)[2], false);
assert.equal(rootNode.innerHTML.includes('Last action: refresh'), true);
const unmounted = binder.unmount();
assert.equal(unmounted.mounted, false);
assert.equal(binder.isMounted(), false);
assert.equal(rootNode.innerHTML, '');
assert.throws(() => createPhase2DashboardDomBinder({ screen: {} }), Phase2DashboardError);
assert.throws(() => createPhase2DashboardDomBinder({ screen: domScreen, documentRef: fakeDocument }).mount({ target: '#missing' }), Phase2DashboardError);

const refreshRequests = createPhase2DashboardApiRequests({ refresh: true, projectId: 'Client AI OS' });
assert.equal(refreshRequests.find((request) => request.id === 'load-agents').path, '/agents?refresh=true');
assert.equal(refreshRequests.find((request) => request.id === 'upsert-project').path, '/projects/Client%20AI%20OS');
assert.equal(refreshRequests.find((request) => request.id === 'load-project-browser').path, '/projects/Client%20AI%20OS/browser');
assert.equal(refreshRequests.find((request) => request.id === 'write-obsidian-run-summary').idempotent, true);

const tokenProvider = createMemoryTokenProvider('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_');
const apiClient = createApiClient({ baseUrl: 'http://127.0.0.1:3210/api/v1', tokenProvider });
const calls = [];
const fetchImpl = async (url, options) => {
  calls.push({ url, options });
  const path = new URL(url).pathname.replace('/api/v1', '');
  const payloads = {
    '/agents': { data: dashboard.agents, resourceVersion: 'agents-v1' },
    '/skills': { data: dashboard.skills, resourceVersion: 'skills-v1' },
    '/projects': { data: dashboard.projects, resourceVersion: 'projects-v1' },
    '/projects/client-project/browser': { data: dashboard.projectBrowser, resourceVersion: 'project-browser-v1' },
    '/runs': { data: dashboard.runs, resourceVersion: 'runs-v1' },
    '/obsidian/status': { data: { available: true, targetFolder: 'Londi Agent OS/Runs/', cached: true }, resourceVersion: 'obsidian-v1' },
    '/runs/obsidian-summary': { data: { id: 'run-2', title: 'API summary', projectId: 'client-project', status: 'succeeded', summary: 'written', artifactPath: '/vault/run-2.md' }, resourceVersion: 'run-v1' },
    '/runs:POST': { data: { id: 'run-3', title: 'Manual API run', agentId: 'codex', status: 'succeeded', summary: 'manual summary', createdAt: '2026-07-14T18:06:00.000Z' }, resourceVersion: 'run-manual-v1' }
  };
  const key = options.method === 'POST' && path === '/runs' ? '/runs:POST' : path;
  return { status: path === '/runs/obsidian-summary' || key === '/runs:POST' ? 201 : 200, json: async () => payloads[key] };
};

const liveDashboard = await loadPhase2DashboardFromApi({ apiClient, fetchImpl, generatedAt: '2026-07-14T18:05:00.000Z', refresh: true });
assert.equal(liveDashboard.generatedAt, '2026-07-14T18:05:00.000Z');
assert.equal(liveDashboard.agents.length, 4);
assert.equal(liveDashboard.projects[0].id, 'client-project');
assert.equal(liveDashboard.projectBrowser.entries[1].name, 'README.md');
assert.equal(liveDashboard.obsidian.available, true);
assert.equal(calls.some((call) => call.url === 'http://127.0.0.1:3210/api/v1/agents?refresh=true'), true);
assert.equal(calls.every((call) => call.options.headers.authorization === 'Bearer abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_'), true);


const manualRun = await createPhase2ManualRun({
  apiClient,
  fetchImpl,
  idempotencyKey: 'idem-manual',
  input: { title: 'Manual API run', prompt: 'Do something', summary: 'manual summary' }
});
assert.equal(manualRun.status, 'succeeded');
assert.equal(manualRun.agentId, 'codex');
assert.equal(manualRun.createdAt, '2026-07-14T18:06:00.000Z');
assert.equal(calls.at(-1).options.headers['idempotency-key'], 'idem-manual');
await assert.rejects(() => createPhase2ManualRun({ apiClient, fetchImpl, input: { title: 'x' } }), Phase2DashboardError);

const writtenRun = await writePhase2ObsidianRunSummary({
  apiClient,
  fetchImpl,
  idempotencyKey: 'idem-summary',
  input: { id: 'run-2', title: 'API summary', projectId: 'client-project', summary: 'written' }
});
assert.equal(writtenRun.status, 'succeeded');
assert.equal(calls.at(-1).options.headers['idempotency-key'], 'idem-summary');
await assert.rejects(() => writePhase2ObsidianRunSummary({ apiClient, fetchImpl, input: { id: 'run-3' } }), Phase2DashboardError);

const runtimeClock = ['2026-07-14T18:10:00.000Z', '2026-07-14T18:11:00.000Z', '2026-07-14T18:12:00.000Z', '2026-07-14T18:13:00.000Z'];
const runtime = createPhase2DashboardRuntime({
  apiClient,
  fetchImpl,
  requestIdPrefix: 'phase2-runtime-test',
  now: () => runtimeClock.shift() ?? '2026-07-14T18:14:00.000Z'
});
assert.equal(runtime.snapshot().cachedLabel, 'fresh');
const runtimeLoaded = await runtime.load();
assert.equal(runtimeLoaded.obsidianLabel, 'Obsidian available');
assert.equal(runtimeLoaded.agents.length, 4);
const runtimeRefreshed = await runtime.refresh();
assert.equal(runtimeRefreshed.cachedLabel, 'cached');
assert.equal(calls.some((call) => call.url === 'http://127.0.0.1:3210/api/v1/obsidian/status?refresh=true'), true);
const runtimeWrite = await runtime.writeRunSummary({
  idempotencyKey: 'idem-runtime-summary',
  input: { id: 'run-2', title: 'API summary', projectId: 'client-project', summary: 'written' }
});
assert.equal(runtimeWrite.run.id, 'run-2');
assert.equal(runtimeWrite.dashboard.runs.find((run) => run.id === 'run-2').tone, 'green');
assert.equal(runtimeWrite.dashboard.metrics.find((item) => item.id === 'runs').value, 2);
assert.equal(calls.at(-1).options.headers['x-request-id'], 'phase2-runtime-test-run-summary');

// Regression: a manual run persisted as `queued` (service stopped between the record write and
// execution) must stay renderable. Before this, `createMinimalRun` rejected `queued` and every
// Load/Refresh threw `Invalid run status`, permanently bricking the dashboard.
const queuedRun = createManualRunRecord({
  id: 'run-20260728073013-queued',
  title: 'Queued manual run',
  prompt: 'Do the thing',
  summary: 'Manual codex chat message: Do the thing',
  status: 'queued',
  agentId: 'codex',
  projectId: 'londi-agent-os',
  createdAt: '2026-07-28T07:30:13.000Z'
});
assert.equal(queuedRun.status, 'queued');
const queuedModel = createPhase2DashboardModel({ runs: [queuedRun] });
assert.equal(queuedModel.runs[0].status, 'queued');
assert.equal(createPhase2DashboardViewModel(queuedModel).runs[0].tone, 'neutral');
assert.equal(createPhase2DashboardScreenModel(createPhase2DashboardInteractionModel(createPhase2DashboardViewModel(queuedModel))).sections.find((item) => item.id === 'runs').items.length, 1);

const queuedJson = (data) => ({ status: 200, json: async () => ({ data }) });
const queuedFetch = async (url) => {
  if (url.endsWith('/runs')) return queuedJson([queuedRun]);
  if (url.includes('/agents')) return queuedJson(listPhase2AgentCards());
  if (url.endsWith('/skills')) return queuedJson(listPhase2Skills());
  if (url.endsWith('/projects')) return queuedJson([]);
  return queuedJson({ available: false });
};
const queuedRuntime = createPhase2DashboardRuntime({ apiClient, fetchImpl: queuedFetch, now: () => '2026-07-28T07:40:00.000Z' });
assert.equal((await queuedRuntime.load()).runs[0].status, 'queued');
assert.equal((await queuedRuntime.refresh()).runs[0].status, 'queued');

// The composer must offer project selection and keep the current agent/project selected.
const selectionAdapter = createPhase2DashboardVisualAdapter(createPhase2DashboardShellModel(createPhase2DashboardScreenModel(
  createPhase2DashboardInteractionModel(
    createPhase2DashboardViewModel(createPhase2DashboardModel({ projects: [{ id: 'londi-agent-os', name: 'Londi Agent OS', rootPath: 'C:/repo', targetBranch: 'master' }] })),
    { selection: { agentId: 'claude-code', projectId: 'londi-agent-os' } }
  )
)));
assert.match(selectionAdapter.html, /data-field="manual-run-project"/);
assert.match(selectionAdapter.html, /<option value="claude-code" selected>/);
assert.match(selectionAdapter.html, /<option value="londi-agent-os" selected>/);
assert.equal(selectionAdapter.html.includes('manual-run-branch'), false);

// --- two-way conversation ------------------------------------------------------------------
// Every submitted message must produce a visible assistant response, whatever the outcome.
const turnRuns = [
  createManualRunRecord({
    id: 'run-answer', title: 'Question', prompt: 'What does this repo do?', summary: 'Manual codex chat message: What does this repo do?',
    status: 'succeeded', agentId: 'codex', intent: 'conversation', createdAt: '2026-07-28T20:00:00.000Z',
    agentResponse: 'It is a local-first orchestration shell.',
    execution: { verification: { changedFiles: [] }, diagnostics: { stdoutTail: 'raw transcript noise', stderrTail: '', truncated: false, blocked: false } }
  }),
  createManualRunRecord({
    id: 'run-edit', title: 'Edit', prompt: 'Create hello.txt', summary: 'Manual codex chat message: Create hello.txt',
    status: 'succeeded', agentId: 'codex', intent: 'code-change', createdAt: '2026-07-28T20:01:00.000Z',
    agentResponse: 'Created hello.txt with one line.',
    execution: { verification: { changedFiles: [{ status: '??', path: 'hello.txt' }] }, workspace: { branchName: 'londi/run-edit', worktreePath: 'C:/wt/run-edit' } }
  }),
  createManualRunRecord({
    id: 'run-blocked-turn', title: 'Blocked', prompt: 'Edit README', summary: 'Manual codex chat message: Edit README',
    status: 'failed', agentId: 'codex', intent: 'code-change', createdAt: '2026-07-28T20:02:00.000Z',
    error: 'Agent exited successfully but produced no workspace changes. The agent reported it was blocked from writing; check execution.diagnostics.',
    execution: { verification: { changedFiles: [] }, diagnostics: { stdoutTail: 'patch rejected: read-only sandbox', stderrTail: '', truncated: true, blocked: true } }
  }),
  // A legacy record: written before agentResponse/intent existed.
  createManualRunRecord({
    id: 'run-legacy-turn', title: 'Legacy', prompt: 'old prompt', summary: 'Manual codex chat message: old prompt',
    status: 'succeeded', agentId: 'codex', createdAt: '2026-07-28T19:59:00.000Z'
  })
];
const turnView = createPhase2DashboardViewModel(createPhase2DashboardModel({ runs: turnRuns }));
const turnById = Object.fromEntries(turnView.runs.map((run) => [run.id, run]));

// Ordered oldest-first by creation time, so the conversation reads top to bottom.
assert.deepEqual(turnView.runs.map((run) => run.id), ['run-legacy-turn', 'run-answer', 'run-edit', 'run-blocked-turn']);

// A text-only answer succeeds and is visible.
assert.equal(turnById['run-answer'].userMessage, 'What does this repo do?');
assert.equal(turnById['run-answer'].assistantMessage, 'It is a local-first orchestration shell.');
assert.equal(turnById['run-answer'].hasAgentResponse, true);
assert.deepEqual(turnById['run-answer'].result.changedFiles, []);

// A code change shows the response and the changed files.
assert.equal(turnById['run-edit'].assistantMessage, 'Created hello.txt with one line.');
assert.deepEqual(turnById['run-edit'].result.changedFiles, [{ status: '??', path: 'hello.txt' }]);
assert.equal(turnById['run-edit'].result.branchName, 'londi/run-edit');
assert.equal(turnById['run-edit'].result.merged, false);

// A blocked run still explains itself instead of showing only a badge.
assert.match(turnById['run-blocked-turn'].assistantMessage, /blocked from writing/);
assert.equal(turnById['run-blocked-turn'].diagnostics.blocked, true);

// Legacy records load and still render an assistant bubble.
assert.equal(turnById['run-legacy-turn'].intent, 'conversation');
assert.equal(turnById['run-legacy-turn'].hasAgentResponse, false);
assert.equal(turnById['run-legacy-turn'].assistantMessage, 'Completed without a message.');

// A pending run shows a status indicator rather than a fabricated answer.
const pendingTurn = createPhase2DashboardViewModel(createPhase2DashboardModel({
  runs: [createManualRunRecord({ id: 'run-pending', title: 'Pending', prompt: 'hi', summary: 'Manual codex chat message: hi', status: 'running', agentId: 'codex' })]
})).runs[0];
assert.equal(pendingTurn.pending, true);
assert.equal(pendingTurn.assistantMessage, 'Working on it…');

// Rendering: both bubbles present, agent named, diagnostics behind Details, never in the bubble.
const turnHtml = createPhase2DashboardVisualAdapter(createPhase2DashboardShellModel(createPhase2DashboardScreenModel(
  createPhase2DashboardInteractionModel(turnView)
))).html;
assert.match(turnHtml, /data-role="user"/);
assert.match(turnHtml, /data-role="assistant"/);
assert.match(turnHtml, /It is a local-first orchestration shell\./);
assert.match(turnHtml, /<strong>Codex<\/strong>/);
assert.match(turnHtml, /<details class="phase2-dashboard__details"><summary>Details<\/summary>/);
assert.match(turnHtml, /data-field="manual-run-intent"/);
const assistantBubble = turnHtml.slice(turnHtml.indexOf('run-answer'), turnHtml.indexOf('run-edit'));
assert.equal(assistantBubble.includes('<details'), true, 'diagnostics live behind Details');
assert.equal(assistantBubble.indexOf('raw transcript noise') > assistantBubble.indexOf('<details'), true, 'raw output never precedes Details');

// Agent-supplied content is escaped, so markup renders as text and cannot inject DOM.
const injected = createPhase2DashboardVisualAdapter(createPhase2DashboardShellModel(createPhase2DashboardScreenModel(
  createPhase2DashboardInteractionModel(createPhase2DashboardViewModel(createPhase2DashboardModel({
    runs: [createManualRunRecord({
      id: 'run-xss', title: 'XSS', prompt: '<img src=x onerror=alert(1)>', summary: 'Manual codex chat message: x',
      status: 'succeeded', agentId: 'codex', agentResponse: '<script>alert("pwned")</script>',
      execution: { verification: { changedFiles: [] }, diagnostics: { stdoutTail: '</pre><script>alert(2)</script>', stderrTail: '', truncated: false, blocked: false } }
    })]
  })))
))).html;
assert.equal(injected.includes('<script>alert'), false, 'agent response must not render as a script tag');
assert.equal(injected.includes('<img src=x'), false, 'user message must not render as markup');
assert.match(injected, /&lt;script&gt;alert\(&quot;pwned&quot;\)&lt;\/script&gt;/);

console.log('Phase 2 dashboard tests OK');

function createFakeDocument() {
  const nodes = new Map();
  const root = createFakeNode('#phase2-dashboard-root');
  nodes.set('#phase2-dashboard-root', root);
  return {
    querySelector(selector) {
      return nodes.get(selector) ?? null;
    }
  };
}

function createFakeNode(selector) {
  const listeners = new Map();
  return {
    selector,
    innerHTML: '',
    querySelector(nextSelector) {
      return this.innerHTML.includes(nextSelector.replace('[', '').replace(']', '').replace('=', '="').replace('"', '')) || this.innerHTML.includes(nextSelector.slice(1, -1)) ? createFakeChildNode(nextSelector, listeners) : null;
    }
  };
}

function createFakeChildNode(selector, listeners) {
  return {
    selector,
    addEventListener(event, listener) {
      listeners.set(`${selector}:${event}`, listener);
    },
    removeEventListener(event, listener) {
      if (listeners.get(`${selector}:${event}`) === listener) listeners.delete(`${selector}:${event}`);
    },
    click() {
      return listeners.get(`${selector}:click`)?.({ preventDefault() {} });
    }
  };
}
