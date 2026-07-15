import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertUiDoesNotInvokeCli,
  clearAuthToken,
  computeReconnectDelay,
  createAccessibilityModel,
  createApiClient,
  createClientState,
  createMemoryTokenProvider,
  createSseClient,
  getUiBootstrapModel,
  setAuthToken,
  transitionConnection,
  validateAccessibilityModel
} from '../apps/ui/src/index.js';

const bootstrap = getUiBootstrapModel({ token: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_' });
assert.equal(bootstrap.packageName, '@londi-agent-os/ui');
assert.deepEqual(bootstrap.routes, ['/', '/runs', '/approvals', '/settings']);
assert.equal(bootstrap.accessibility.colorOnlyStatus, false);
assert.equal(typeof bootstrap.phase2DashboardRuntime.load, 'function');
assert.equal(typeof bootstrap.phase2DashboardController.dispatch, 'function');
assert.equal(typeof bootstrap.phase2DashboardScreen.click, 'function');
assert.equal(bootstrap.phase2DashboardScreen.render().renderPolicy.dispatchOnly, true);
assert.equal(bootstrap.phase2DashboardShell.shellId, 'phase2-dashboard-shell');
assert.equal(bootstrap.phase2DashboardShell.toolbar.buttons.every((button) => button.onClick.type === 'dispatch-control'), true);
assert.equal(bootstrap.phase2DashboardShell.renderPolicy.domNeutral, true);
assert.equal(bootstrap.phase2DashboardVisualAdapter.adapterId, 'phase2-dashboard-visual-adapter');
assert.equal(bootstrap.phase2DashboardVisualAdapter.bindings.every((binding) => binding.handler.type === 'dispatch-control'), true);
assert.equal(bootstrap.phase2DashboardVisualAdapter.renderPolicy.staticHtmlOnly, true);
assert.equal(bootstrap.phase2DashboardDomBinder.binderId, 'phase2-dashboard-dom-binder');
assert.equal(bootstrap.phase2DashboardDomBinder.isMounted(), false);
assert.equal(bootstrap.phase2DashboardRuntime.snapshot().title, 'Londi Agent OS');
assert.equal(bootstrap.phase2DashboardRuntime.snapshot().agents.length, 4);
assert.equal(validateAccessibilityModel(createAccessibilityModel()), true);

const state = createClientState();
assert.equal(state.navigation.blockedByDisconnect, false);
setAuthToken(state, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_');
assert.equal(state.auth.hasToken, true);
assert.equal(JSON.stringify(state).includes('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_'), false);
clearAuthToken(state);
assert.equal(state.auth.hasToken, false);
transitionConnection(state, 'disconnected', { error: 'network down' });
assert.equal(state.navigation.blockedByDisconnect, false);
assert.equal(computeReconnectDelay(0), 500);
assert.equal(computeReconnectDelay(10), 10000);

const tokenProvider = createMemoryTokenProvider('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_');
const apiClient = createApiClient({ baseUrl: 'http://127.0.0.1:3210/api/v1', tokenProvider });
const request = apiClient.createRequest('post', '/runs', { idempotencyKey: 'idem-1', body: { title: 'demo' } });
assert.equal(request.method, 'POST');
assert.equal(request.headers.authorization, 'Bearer abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_');
assert.equal(request.headers['idempotency-key'], 'idem-1');
assert.equal(apiClient.createSseUrl({ runId: 'run-1' }), 'http://127.0.0.1:3210/api/v1/events?runId=run-1');

const sseState = createClientState();
const sse = createSseClient({ apiClient, state: sseState });
assert.equal(sse.connect({ runId: 'run-1' }).lastEventId, null);
assert.equal(sseState.connection.status, 'connected');
assert.equal(sse.handleEvent({ eventId: 7, type: 'run.state.changed', payload: { state: 'running' } }), 'event.accepted');
assert.equal(sseState.connection.lastEventId, 7);
assert.equal(sse.handleEvent({ type: 'stream.reset.required', payload: { action: 'load.snapshot.rest' } }), 'snapshot.required');
assert.equal(sseState.connection.status, 'reconnecting');
sse.disconnect('test');
assert.equal(sseState.connection.status, 'disconnected');
assert.equal(sseState.navigation.blockedByDisconnect, false);

const uiSrc = collectFiles('apps/ui/src').map((file) => readFileSync(file, 'utf8')).join('\n');
assert.equal(assertUiDoesNotInvokeCli(uiSrc), true);
assert.throws(() => assertUiDoesNotInvokeCli('import { spawn } from "node:child_process"; spawn("cmd.exe")'));
assert.equal(/process\.env\.[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|KEY)/i.test(uiSrc), false);

console.log('UI shell tests OK');

function collectFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? collectFiles(path) : [path];
  });
}
