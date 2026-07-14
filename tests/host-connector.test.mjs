import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
    joinPath: join
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

  const project = connector.upsertProject({ id: 'Client AI OS', name: 'Client AI OS', rootPath: 'C:/Projects/client-ai-os' });
  assert.equal(project.id, 'client-ai-os');
  assert.equal(connector.listProjects()[0].agentIds.includes('claude-code'), true);

  const run = connector.runObsidianSummary({ id: 'run-200', title: 'Project summary', projectId: project.id, summary: 'Project run summary was created.', artifacts: ['artifact.md'] });
  assert.equal(run.status, 'succeeded');
  assert.equal(existsSync(run.artifactPath), true);
  const note = readFileSync(run.artifactPath, 'utf8');
  assert.equal(note.includes('- Project ID: client-ai-os'), true);
  assert.equal(note.includes('Project run summary was created.'), true);

  const broken = createInMemoryHostConnector({ vaultPath: join(temp, 'vault') });
  assert.throws(() => broken.writeRunSummary({ runId: 'run-1', title: 'x', summary: 'x' }), HostConnectorError);

  const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_';
  const apiConnector = createInMemoryHostConnector({
    now,
    vaultPath: join(temp, 'vault'),
    exists: existsSync,
    mkdir: mkdirSync,
    writeFile: writeFileSync,
    joinPath: join
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
  const putProject = await fetch('http://127.0.0.1:3213/api/v1/projects/live-project', { method: 'PUT', headers: { ...headers, 'content-type': 'application/json', 'idempotency-key': 'idem-project' }, body: JSON.stringify({ name: 'Live Project', rootPath: 'C:/Projects/live' }) });
  assert.equal(putProject.status, 200);
  assert.equal((await putProject.json()).data.doxPath, 'AGENTS.md');
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
