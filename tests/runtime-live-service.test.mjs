import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createCredentialManagerTokenProvider, createServiceLifecycle } from '../apps/local-api/src/index.js';

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_';
const API_PORT = 3214;
const UI_PORT = 3215;
const temp = mkdtempSync(join(tmpdir(), 'londi-runtime-live-'));
const dataRoot = './.tmp-runtime-live-service-data';
const service = createServiceLifecycle({
  config: {
    schemaVersion: 1,
    dataRoot,
    paths: {
      database: `${dataRoot}/db/db.sqlite`,
      runs: `${dataRoot}/runs`,
      worktrees: `${dataRoot}/worktrees`,
      backups: `${dataRoot}/backups`,
      obsidianSnapshots: `${dataRoot}/obsidian-snapshots`
    },
    obsidian: { roots: [join(temp, 'vault')] },
    ports: { localApi: API_PORT, ui: UI_PORT },
    retention: { completedRunDays: 7, nonCompletedRunDays: 30, auditDays: 365, cleanupIntervalHours: 24 }
  },
  security: { tokenProvider: createCredentialManagerTokenProvider(TOKEN) },
  knownSecrets: [TOKEN]
});

let uiServer;
try {
  mkdirSync(join(temp, 'project', 'docs'), { recursive: true });
  mkdirSync(join(temp, 'vault'), { recursive: true });
  writeFileSync(join(temp, 'project', 'README.md'), '# Runtime live project\n', 'utf8');

  await service.start();
  uiServer = await startRuntimeDashboardServer();

  const uiRoot = await fetch(`http://127.0.0.1:${UI_PORT}/`);
  assert.equal(uiRoot.status, 200);
  assert.equal(uiRoot.headers.get('content-type'), 'text/html; charset=utf-8');
  const uiHtml = await uiRoot.text();
  assert.match(uiHtml, /createRuntimeDashboardApp/);
  // The token reaches the browser only through this loopback response, and it is never cached.
  assert.equal(uiRoot.headers.get('cache-control'), 'no-store');
  assert.equal(uiHtml.includes(TOKEN), true, 'the process token is injected into the entrypoint response');
  assert.equal(uiHtml.includes('%%LONDI_LOCAL_API_TOKEN%%'), false, 'the placeholder is replaced');
  assert.equal(readFileSync('apps/ui/runtime-dashboard.html', 'utf8').includes(TOKEN), false, 'no token is stored on disk');

  const uiJs = await fetch(`http://127.0.0.1:${UI_PORT}/apps/ui/src/index.js?v=runtime-dashboard-entry-1`);
  assert.equal(uiJs.status, 200);
  assert.equal(uiJs.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.match(await uiJs.text(), /createRuntimeDashboardApp/);

  const packageJson = await fetch(`http://127.0.0.1:${UI_PORT}/package.json`);
  assert.equal(packageJson.status, 200);
  assert.equal((await packageJson.text()).includes(TOKEN), false);

  const headers = { authorization: `Bearer ${TOKEN}`, origin: `http://127.0.0.1:${UI_PORT}` };
  const defaultOriginRejected = await fetch(`http://127.0.0.1:${API_PORT}/system/health`, { headers });
  assert.equal(defaultOriginRejected.status, 403, 'Local API keeps its exact allowed UI origin contract');

  const apiHeaders = { authorization: `Bearer ${TOKEN}`, origin: 'http://127.0.0.1:3211' };
  const health = await fetch(`http://127.0.0.1:${API_PORT}/system/health`, { headers: { ...apiHeaders, 'x-request-id': 'runtime-live-health' } });
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('x-request-id'), 'runtime-live-health');
  const healthPayload = await health.json();
  assert.equal(healthPayload.status, 'running');
  assert.equal(JSON.stringify(healthPayload).includes(TOKEN), false);

  const agents = await getJson(`/agents?refresh=true`, apiHeaders);
  assert.equal(agents.data.length, 4);
  const skills = await getJson('/skills', apiHeaders);
  assert.equal(skills.data.some((skill) => skill.id === 'obsidian-run-summary'), true);

  const project = await putJson('/projects/runtime-live-project', { name: 'Runtime Live Project', rootPath: join(temp, 'project') }, apiHeaders, 'idem-live-project');
  assert.equal(project.data.id, 'runtime-live-project');
  const browser = await getJson('/projects/runtime-live-project/browser', apiHeaders);
  assert.equal(browser.data.entries.some((entry) => entry.name === 'README.md'), true);

  const emptyRuns = await getJson('/runs', apiHeaders);
  assert.equal(emptyRuns.data.length, 0);
  const manual = await postJson('/runs', { title: 'Runtime live manual run', prompt: 'Capture from live test.', summary: 'Captured live.', agentId: 'claude-code' }, apiHeaders, 'idem-live-run');
  assert.equal(manual.statusCode, 201);
  assert.equal(manual.data.agentId, 'claude-code');
  assert.equal(manual.data.action, 'ask-claude-code-general-task');
  assert.equal(manual.data.status, 'failed', 'default Direct bridge must not report success without an explicitly selected project');
  assert.equal(manual.data.execution.pipeline, 'direct');
  const runs = await getJson('/runs', apiHeaders);
  assert.equal(runs.data[0].title, 'Runtime live manual run');

  const obsidian = await getJson('/obsidian/status?refresh=true', apiHeaders);
  assert.equal(obsidian.data.available, true);
  const summary = await postJson('/runs/obsidian-summary', { id: 'run-runtime-live', title: 'Runtime live summary', projectId: 'runtime-live-project', summary: 'Live service wrote this summary.' }, apiHeaders, 'idem-live-summary');
  assert.equal(summary.statusCode, 201);
  assert.equal(existsSync(summary.data.artifactPath), true);
  assert.equal(readFileSync(summary.data.artifactPath, 'utf8').includes('Live service wrote this summary.'), true);

  const missingIdem = await fetch(`http://127.0.0.1:${API_PORT}/api/v1/runs`, { method: 'POST', headers: { ...apiHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'x', prompt: 'x', summary: 'x' }) });
  assert.equal(missingIdem.status, 400);
} finally {
  if (uiServer) await stopChild(uiServer);
  await service.stop('runtime-live-service-test');
  rmSync(dataRoot, { recursive: true, force: true });
  rmSync(temp, { recursive: true, force: true });
}

console.log('Runtime live service tests OK');

async function getJson(path, headers) {
  const response = await fetch(`http://127.0.0.1:${API_PORT}/api/v1${path}`, { headers });
  assert.equal(response.status, 200, `${path} should return 200`);
  return response.json();
}

async function putJson(path, body, headers, idempotencyKey) {
  const response = await fetch(`http://127.0.0.1:${API_PORT}/api/v1${path}`, { method: 'PUT', headers: { ...headers, 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify(body) });
  assert.equal(response.status, 200, `${path} should return 200`);
  return { statusCode: response.status, ...(await response.json()) };
}

async function postJson(path, body, headers, idempotencyKey) {
  const response = await fetch(`http://127.0.0.1:${API_PORT}/api/v1${path}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify(body) });
  assert.equal(response.status, 201, `${path} should return 201`);
  return { statusCode: response.status, ...(await response.json()) };
}

async function startRuntimeDashboardServer() {
  const child = spawn('node', ['scripts/serve-runtime-dashboard.mjs'], {
    cwd: resolve('.'),
    env: { ...process.env, LONDI_AGENT_OS_UI_PORT: String(UI_PORT), LONDI_AGENT_OS_LOCAL_API_TOKEN: TOKEN },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const output = [];
  child.stdout.on('data', (chunk) => output.push(chunk.toString('utf8')));
  child.stderr.on('data', (chunk) => output.push(chunk.toString('utf8')));
  child.once('exit', (code, signal) => output.push(`exit:${code}:${signal}`));
  await waitFor(async () => {
    if (output.join('').includes(`http://127.0.0.1:${UI_PORT}`)) return true;
    if (output.join('').includes('exit:')) throw new Error(`UI server exited early: ${output.join('')}`);
    return false;
  });
  return child;
}

async function waitFor(predicate, { timeoutMs = 5000, intervalMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
  }
  throw new Error('Timed out waiting for condition.');
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolvePromise) => {
    child.once('exit', resolvePromise);
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolvePromise();
    }, 1000).unref();
  });
}
