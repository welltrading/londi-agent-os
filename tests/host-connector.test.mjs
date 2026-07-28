import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createInMemoryHostConnector, HOST_CONNECTOR_CACHE_TTL_MS, HostConnectorError, createServiceLifecycle, createCredentialManagerTokenProvider } from '../apps/local-api/src/index.js';

let tick = 0;
const base = Date.parse('2026-07-14T18:00:00.000Z');
const now = () => new Date(base + tick).toISOString();
const temp = mkdtempSync(join(tmpdir(), 'londi-host-connector-'));
try {
  const connector = createInMemoryHostConnector({
    now,
    vaultPath: join(temp, 'vault'),
    exists: existsSync,
    mkdir: mkdirSync,
    writeFile: writeFileSync,
    joinPath: join,
    runsFilePath: join(temp, 'runs', 'runs.json'),
    projectsFilePath: join(temp, 'projects', 'projects.json'),
    readFile: readFileSync,
    readDir: readdirSync,
    stat: statSync,
    resolvePath: resolve,
    relativePath: relative,
    detectDefaultBranch: ({ repositoryPath }) => (repositoryPath ? 'trunk' : null)
  });

  assert.equal(HOST_CONNECTOR_CACHE_TTL_MS.agentAvailability, 30_000);
  const firstAgents = connector.getAgentsStatus();
  assert.equal(firstAgents.length, 4);
  assert.equal(firstAgents.find((agent) => agent.id === 'hermes').status, 'planned');
  const cachedAgents = connector.getAgentsStatus();
  assert.equal(cachedAgents.every((agent) => agent.cached === true), true);
  tick += 11_000;
  const refreshedAgents = connector.getAgentsStatus({ force: true });
  assert.equal(refreshedAgents.every((agent) => agent.cached !== true), true);

  assert.equal(connector.getObsidianStatus().available, false);
  mkdirSync(join(temp, 'vault'), { recursive: true });
  tick += 61_000;
  assert.equal(connector.getObsidianStatus({ force: true }).available, true);

  const projectRoot = join(temp, 'client-ai-os');
  mkdirSync(join(projectRoot, 'src'), { recursive: true });
  writeFileSync(join(projectRoot, 'README.md'), '# Client AI OS\n', 'utf8');
  writeFileSync(join(projectRoot, '.env'), 'SECRET=hidden\n', 'utf8');
  const project = connector.upsertProject({ id: 'Client AI OS', name: 'Client AI OS', rootPath: projectRoot });
  assert.equal(project.id, 'client-ai-os');
  assert.equal(connector.listProjects()[0].agentIds.includes('claude-code'), true);
  const browser = connector.getProjectBrowser({ projectId: project.id });
  assert.equal(browser.projectId, 'client-ai-os');
  assert.equal(browser.relativePath, '.');
  assert.equal(browser.entries.some((entry) => entry.name === 'src' && entry.type === 'directory'), true);
  assert.equal(browser.entries.some((entry) => entry.name === 'README.md' && entry.selectableAsContext === true), true);
  assert.equal(browser.entries.some((entry) => entry.name === '.env'), false);
  assert.throws(() => connector.getProjectBrowser({ projectId: project.id, relativePath: '../' }), HostConnectorError);

  const run = connector.runObsidianSummary({ id: 'run-200', title: 'Project summary', projectId: project.id, summary: 'Project run summary was created.', artifacts: ['artifact.md'] });
  assert.equal(run.status, 'succeeded');
  assert.equal(existsSync(run.artifactPath), true);
  const note = readFileSync(run.artifactPath, 'utf8');
  assert.equal(note.includes('- Project ID: client-ai-os'), true);
  assert.equal(note.includes('Project run summary was created.'), true);

  const manualRun = await connector.createManualRun({ title: 'Manual run', prompt: 'Ask Agent Zero to summarize this.', summary: 'Manual summary.', agentId: 'claude-code' });
  assert.equal(manualRun.type, 'manual');
  assert.equal(manualRun.agentId, 'claude-code');
  assert.equal(manualRun.action, 'ask-claude-code-general-task');
  assert.equal(manualRun.status, 'queued');
  assert.equal(connector.listRuns()[0].id, manualRun.id);
  const persistedRuns = JSON.parse(readFileSync(join(temp, 'runs', 'runs.json'), 'utf8')).runs;
  assert.equal(persistedRuns[0].prompt, 'Ask Agent Zero to summarize this.');
  const hydratedConnector = createInMemoryHostConnector({
    runsFilePath: join(temp, 'runs', 'runs.json'),
    projectsFilePath: join(temp, 'projects', 'projects.json'),
    exists: existsSync,
    readFile: readFileSync,
    readDir: readdirSync,
    stat: statSync,
    resolvePath: resolve,
    relativePath: relative
  });
  assert.equal(hydratedConnector.listRuns()[0].summary, 'Manual summary.');
  // Registered projects must survive a runtime restart, and must keep the detected default branch.
  assert.equal(hydratedConnector.listProjects().length, 1);
  assert.equal(hydratedConnector.listProjects()[0].id, 'client-ai-os');
  assert.equal(hydratedConnector.listProjects()[0].rootPath, projectRoot);
  assert.equal(hydratedConnector.listProjects()[0].targetBranch, 'trunk');

  const successfulConnector = createInMemoryHostConnector({
    now,
    executeManualRun: async ({ run, input, project: selectedProject }) => ({
      status: 'succeeded',
      summary: `${run.summary} Executed.`,
      artifactPath: '/artifacts/result.txt',
      execution: { pipeline: 'direct', agentId: run.agentId, projectId: selectedProject.id, inputAgentId: input.agentId }
    }),
    projects: [project]
  });
  const successfulRun = await successfulConnector.createManualRun({ id: 'run-success', title: 'Success', prompt: 'Execute.', summary: 'Started.', agentId: 'codex', projectId: project.id });
  assert.equal(successfulRun.status, 'succeeded');
  assert.equal(successfulRun.summary, 'Started. Executed.');
  assert.equal(successfulRun.execution.pipeline, 'direct');

  const runningConnector = createInMemoryHostConnector({ executeManualRun: async () => ({ status: 'running', execution: { pipeline: 'direct', attempts: { execute: { status: 'Running' } } } }) });
  const runningRun = await runningConnector.createManualRun({ id: 'run-running', title: 'Running', prompt: 'Execute.', summary: 'Started.', agentId: 'codex' });
  assert.equal(runningRun.status, 'running');

  const refreshableExecutor = async () => ({ status: 'running', execution: { pipeline: 'direct', attempts: { execute: { attemptId: 'attempt-refresh', status: 'Running' } } } });
  refreshableExecutor.refreshRun = async ({ run: storedRun }) => ({
    status: 'succeeded',
    execution: { ...storedRun.execution, attempts: { execute: { attemptId: 'attempt-refresh', status: 'Exited', exitCode: 0 } } }
  });
  const refreshableConnector = createInMemoryHostConnector({ executeManualRun: refreshableExecutor });
  const refreshableRun = await refreshableConnector.createManualRun({ id: 'run-refresh-success', title: 'Refresh success', prompt: 'Execute.', summary: 'Started.', agentId: 'codex' });
  assert.equal(refreshableRun.status, 'running');
  const refreshedRuns = await refreshableConnector.refreshRuns();
  assert.equal(refreshedRuns[0].status, 'succeeded');
  assert.equal(refreshedRuns[0].execution.attempts.execute.exitCode, 0);

  const failedConnector = createInMemoryHostConnector({ executeManualRun: async () => { throw Object.assign(new Error('adapter delivery failed'), { code: 'ERR_DELIVERY', details: { execution: { pipeline: 'direct' } } }); } });
  const failedRun = await failedConnector.createManualRun({ id: 'run-failed', title: 'Failed', prompt: 'Execute.', summary: 'Started.', agentId: 'codex' });
  assert.equal(failedRun.status, 'failed');
  assert.equal(failedRun.error, 'adapter delivery failed');
  assert.equal(failedRun.execution.error.code, 'ERR_DELIVERY');

  const broken = createInMemoryHostConnector({ vaultPath: join(temp, 'vault') });
  assert.throws(() => broken.writeRunSummary({ runId: 'run-1', title: 'x', summary: 'x' }), HostConnectorError);

  // Persistence is opt-in. A connector given write dependencies but no store paths must not fall
  // back to a cwd-relative default, which previously wrote test fixtures into the repository's
  // real data/ directory and surfaced them as selectable projects in the dashboard.
  const writes = [];
  const noPathConnector = createInMemoryHostConnector({
    now,
    mkdir: () => {},
    writeFile: (path) => writes.push(path),
    readFile: () => { throw new Error('no store path should ever be read'); }
  });
  noPathConnector.upsertProject({ id: 'leak-check', name: 'Leak Check', rootPath: join(temp, 'leak-check') });
  await noPathConnector.createManualRun({ id: 'run-leak-check', title: 'Leak', prompt: 'x', summary: 'x' });
  assert.deepEqual(writes, [], 'connector without store paths must not write to disk');

  const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_';
  const apiConnector = createInMemoryHostConnector({
    now,
    vaultPath: join(temp, 'vault'),
    exists: existsSync,
    mkdir: mkdirSync,
    writeFile: writeFileSync,
    joinPath: join,
    runsFilePath: join(temp, 'api-runs', 'runs.json'),
    projectsFilePath: join(temp, 'api-projects', 'projects.json'),
    readFile: readFileSync,
    readDir: readdirSync,
    stat: statSync,
    resolvePath: resolve,
    relativePath: relative
  });
  const service = createServiceLifecycle({
    config: {
      schemaVersion: 1,
      dataRoot: './.tmp-host-api-data',
      paths: { database: './.tmp-host-api-data/db/db.sqlite', runs: './.tmp-host-api-data/runs', worktrees: './.tmp-host-api-data/worktrees', backups: './.tmp-host-api-data/backups', obsidianSnapshots: './.tmp-host-api-data/obsidian-snapshots' },
      obsidian: { roots: [] },
      ports: { localApi: 3213, ui: 3211 },
      retention: { completedRunDays: 7, nonCompletedRunDays: 30, auditDays: 365, cleanupIntervalHours: 24 }
    },
    security: { tokenProvider: createCredentialManagerTokenProvider(token) },
    hostConnector: apiConnector
  });
  await service.start();
  const headers = { authorization: `Bearer ${token}`, origin: 'http://127.0.0.1:3211' };
  const agents = await fetch('http://127.0.0.1:3213/api/v1/agents?refresh=true', { headers });
  assert.equal(agents.status, 200);
  assert.equal((await agents.json()).data.length, 4);
  const liveRoot = join(temp, 'live');
  mkdirSync(join(liveRoot, 'docs'), { recursive: true });
  writeFileSync(join(liveRoot, 'README.md'), '# Live\n', 'utf8');
  const putProject = await fetch('http://127.0.0.1:3213/api/v1/projects/live-project', { method: 'PUT', headers: { ...headers, 'content-type': 'application/json', 'idempotency-key': 'idem-project' }, body: JSON.stringify({ name: 'Live Project', rootPath: liveRoot }) });
  assert.equal(putProject.status, 200);
  assert.equal((await putProject.json()).data.doxPath, 'AGENTS.md');
  const projectBrowserResponse = await fetch('http://127.0.0.1:3213/api/v1/projects/live-project/browser', { headers });
  assert.equal(projectBrowserResponse.status, 200);
  const projectBrowserPayload = await projectBrowserResponse.json();
  assert.equal(projectBrowserPayload.data.entries.some((entry) => entry.name === 'README.md'), true);
  const listRunsEmpty = await fetch('http://127.0.0.1:3213/api/v1/runs', { headers });
  assert.equal(listRunsEmpty.status, 200);
  assert.equal((await listRunsEmpty.json()).data.length, 0);
  const manualRunResponse = await fetch('http://127.0.0.1:3213/api/v1/runs', { method: 'POST', headers: { ...headers, 'content-type': 'application/json', 'idempotency-key': 'idem-manual-run' }, body: JSON.stringify({ title: 'Live manual run', prompt: 'Capture this manually.', summary: 'Captured.', agentId: 'codex' }) });
  assert.equal(manualRunResponse.status, 201);
  const manualRunPayload = await manualRunResponse.json();
  assert.equal(manualRunPayload.data.type, 'manual');
  assert.equal(manualRunPayload.data.agentId, 'codex');
  assert.equal(manualRunPayload.data.action, 'ask-codex-general-task');
  assert.equal(manualRunPayload.data.status, 'queued');
  assert.equal(existsSync(join(temp, 'api-runs', 'runs.json')), true);
  const listRunsFilled = await fetch('http://127.0.0.1:3213/api/v1/runs', { headers });
  assert.equal((await listRunsFilled.json()).data[0].title, 'Live manual run');
  const missingManualIdem = await fetch('http://127.0.0.1:3213/api/v1/runs', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'x', prompt: 'x', summary: 'x' }) });
  assert.equal(missingManualIdem.status, 400);
  const invalidManual = await fetch('http://127.0.0.1:3213/api/v1/runs', { method: 'POST', headers: { ...headers, 'content-type': 'application/json', 'idempotency-key': 'idem-invalid-manual' }, body: JSON.stringify({ title: 'x', summary: 'missing prompt' }) });
  assert.equal(invalidManual.status, 400);
  const runSummary = await fetch('http://127.0.0.1:3213/api/v1/runs/obsidian-summary', { method: 'POST', headers: { ...headers, 'content-type': 'application/json', 'idempotency-key': 'idem-summary' }, body: JSON.stringify({ id: 'run-300', title: 'Live summary', projectId: 'live-project', summary: 'Live API summary.' }) });
  assert.equal(runSummary.status, 201);
  assert.equal(existsSync((await runSummary.json()).data.artifactPath), true);
  const missingIdem = await fetch('http://127.0.0.1:3213/api/v1/runs/obsidian-summary', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'run-301', title: 'x', summary: 'x' }) });
  assert.equal(missingIdem.status, 400);
  assert.equal((await service.stop('test-complete')).status, 'stopped');
  rmSync('./.tmp-host-api-data', { recursive: true, force: true });
  console.log('HostConnector tests OK');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
