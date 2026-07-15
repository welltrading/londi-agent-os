import { strict as assert } from 'node:assert';
import {
  createMemoryTokenProvider,
  createApiClient,
  createPhase2DashboardApiRequests,
  createPhase2DashboardModel,
  createPhase2DashboardRuntime,
  createPhase2DashboardViewModel,
  createPhase2DashboardInteractionModel,
  loadPhase2DashboardFromApi,
  writePhase2ObsidianRunSummary,
  assertProjectHasAllAgents,
  Phase2DashboardError
} from '../apps/ui/src/index.js';

const dashboard = createPhase2DashboardModel({
  generatedAt: '2026-07-14T18:00:00.000Z',
  projects: [{ id: 'Client Project', name: 'Client Project', rootPath: 'C:/Projects/client' }],
  runs: [{ id: 'run-1', title: 'Run summary', projectId: 'client-project', status: 'succeeded', summary: 'ok' }]
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

const obsidianInteraction = createPhase2DashboardInteractionModel(createPhase2DashboardViewModel({ ...dashboard, obsidian: { available: true, targetFolder: 'Londi Agent OS/Runs/' } }));
assert.equal(obsidianInteraction.controls.find((control) => control.id === 'write-run-summary').disabled, false);

const refreshRequests = createPhase2DashboardApiRequests({ refresh: true, projectId: 'Client AI OS' });
assert.equal(refreshRequests.find((request) => request.id === 'load-agents').path, '/agents?refresh=true');
assert.equal(refreshRequests.find((request) => request.id === 'upsert-project').path, '/projects/Client%20AI%20OS');
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
    '/obsidian/status': { data: { available: true, targetFolder: 'Londi Agent OS/Runs/', cached: true }, resourceVersion: 'obsidian-v1' },
    '/runs/obsidian-summary': { data: { id: 'run-2', title: 'API summary', projectId: 'client-project', status: 'succeeded', summary: 'written', artifactPath: '/vault/run-2.md' }, resourceVersion: 'run-v1' }
  };
  return { status: path === '/runs/obsidian-summary' ? 201 : 200, json: async () => payloads[path] };
};

const liveDashboard = await loadPhase2DashboardFromApi({ apiClient, fetchImpl, generatedAt: '2026-07-14T18:05:00.000Z', refresh: true });
assert.equal(liveDashboard.generatedAt, '2026-07-14T18:05:00.000Z');
assert.equal(liveDashboard.agents.length, 4);
assert.equal(liveDashboard.projects[0].id, 'client-project');
assert.equal(liveDashboard.obsidian.available, true);
assert.equal(calls.some((call) => call.url === 'http://127.0.0.1:3210/api/v1/agents?refresh=true'), true);
assert.equal(calls.every((call) => call.options.headers.authorization === 'Bearer abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_'), true);

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
assert.equal(runtimeWrite.dashboard.metrics.find((item) => item.id === 'runs').value, 1);
assert.equal(calls.at(-1).options.headers['x-request-id'], 'phase2-runtime-test-run-summary');

console.log('Phase 2 dashboard tests OK');
