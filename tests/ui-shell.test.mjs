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
  createRuntimeDashboardApp,
  createRuntimeDashboardBootstrapModel,
  createRuntimeDispatchOptions,
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
assert.equal(bootstrap.runtimeDashboard.appId, 'runtime-dashboard-app');
assert.equal(bootstrap.runtimeDashboard.isMounted(), false);
assert.equal(bootstrap.runtimeDashboard.getStatus().renderPolicy.mountsThroughDomBinder, true);
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

let runtimeBootstrapCalls = 0;
let runtimeBinderMounts = 0;
let runtimeRefreshes = 0;
let runtimeUnmounts = 0;
const runtimeApp = createRuntimeDashboardApp({
  documentRef: { querySelector: () => ({ innerHTML: '' }) },
  target: '#runtime-root',
  token: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_',
  baseUrl: 'http://127.0.0.1:3210/api/v1',
  fetchImpl: () => { throw new Error('runtime dashboard must not fetch before click'); },
  createBootstrapModel: (options) => {
    runtimeBootstrapCalls += 1;
    assert.equal(options.phase2DashboardTarget, '#runtime-root');
    assert.equal(options.token, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_');
    return { phase2DashboardScreen: { render: () => ({}), click: async () => ({}) } };
  },
  createDomBinder: ({ screen, documentRef, target, createDispatchOptions }) => {
    assert.equal(typeof screen.render, 'function');
    assert.equal(typeof documentRef.querySelector, 'function');
    assert.equal(target, '#runtime-root');
    assert.equal(createDispatchOptions('refresh').input, undefined);
    assert.equal(createDispatchOptions('write-run-summary').input.id, 'run-runtime-dashboard-summary');
    return {
      binderId: 'phase2-dashboard-dom-binder',
      mount({ target: nextTarget } = {}) {
        runtimeBinderMounts += 1;
        return { binderId: 'phase2-dashboard-dom-binder', mounted: true, target: nextTarget, bindingCount: 3, activeBindingCount: 2, renderPolicy: { noPolling: true } };
      },
      refresh() {
        runtimeRefreshes += 1;
        return { binderId: 'phase2-dashboard-dom-binder', mounted: true, target: '#runtime-root', bindingCount: 3, activeBindingCount: 2, renderPolicy: { noPolling: true } };
      },
      unmount({ clear } = {}) {
        runtimeUnmounts += 1;
        assert.equal(clear, false);
        return { binderId: 'phase2-dashboard-dom-binder', mounted: false, target: '#runtime-root' };
      },
      isMounted: () => runtimeBinderMounts > runtimeUnmounts
    };
  }
});
assert.equal(runtimeBootstrapCalls, 0);
assert.equal(runtimeApp.appId, 'runtime-dashboard-app');
assert.equal(runtimeApp.isMounted(), false);
assert.equal(runtimeApp.getStatus().renderPolicy.noBootstrapNetworkCall, true);
assert.throws(() => runtimeApp.refresh());
const runtimeMounted = runtimeApp.mount();
assert.equal(runtimeBootstrapCalls, 1);
assert.equal(runtimeMounted.mounted, true);
assert.equal(runtimeMounted.bindingCount, 3);
assert.equal(runtimeMounted.renderPolicy.usesLocalApiBoundary, true);
assert.equal(runtimeApp.isMounted(), true);
const runtimeRefreshed = runtimeApp.refresh();
assert.equal(runtimeRefreshes, 1);
assert.equal(runtimeRefreshed.activeBindingCount, 2);
const runtimeUnmounted = runtimeApp.unmount({ clear: false });
assert.equal(runtimeUnmounted.mounted, false);
assert.equal(runtimeApp.isMounted(), false);
assert.equal(runtimeUnmounts, 1);
assert.equal(createRuntimeDispatchOptions('refresh').input, undefined);
assert.equal(createRuntimeDispatchOptions('write-run-summary').input.skillId, 'obsidian-run-summary');
assert.throws(() => createRuntimeDashboardApp({ createBootstrapModel: null }));

const runtimePreview = readFileSync('docs/previews/runtime-dashboard-preview.html', 'utf8');
assert.match(runtimePreview, /createRuntimeDashboardApp/);
assert.doesNotMatch(runtimePreview, /createPhase2DashboardDomBinder/);
assert.match(runtimePreview, /No polling|אין polling/);

const runtimeEntrypoint = readFileSync('apps/ui/runtime-dashboard.html', 'utf8');
assert.match(runtimeEntrypoint, /createRuntimeDashboardApp/);
assert.match(runtimeEntrypoint, /npm run serve:runtime-dashboard/);
assert.match(runtimeEntrypoint, /Use local dev token/);
assert.match(runtimeEntrypoint, /LOCAL_DEV_HOSTS = new Set\(\['127\.0\.0\.1', 'localhost'\]\)/);
assert.match(runtimeEntrypoint, /localDevTokenButton.hidden = !LOCAL_DEV_HOSTS.has\(window.location.hostname\)/);
assert.match(runtimeEntrypoint, /Token remains hidden/);
assert.doesNotMatch(runtimeEntrypoint, /createPhase2DashboardDomBinder/);

const runtimeServeScript = readFileSync('scripts/serve-runtime.mjs', 'utf8');
assert.match(runtimeServeScript, /apps\/local-api\/src\/index\.js/);
assert.match(runtimeServeScript, /scripts\/serve-runtime-dashboard\.mjs/);
assert.match(runtimeServeScript, /assertValidLocalApiToken/);
assert.match(runtimeServeScript, /sanitizeForLog/);
assert.doesNotMatch(runtimeServeScript, /access_token=/);
assert.doesNotMatch(runtimeServeScript, /token=/);

console.log('UI shell tests OK');

function collectFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? collectFiles(path) : [path];
  });
}
