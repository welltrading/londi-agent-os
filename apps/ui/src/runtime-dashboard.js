import { createApiClient, createMemoryTokenProvider } from './api-client.js';
import { createPhase2DashboardController, createPhase2DashboardDomBinder, createPhase2DashboardRuntime, createPhase2DashboardScreen } from './phase2-dashboard.js';

export class RuntimeDashboardError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'RuntimeDashboardError';
    this.code = 'ERR_RUNTIME_DASHBOARD';
    this.details = details;
  }
}

export function createRuntimeDashboardApp({
  documentRef = globalThis.document,
  target = '#phase2-dashboard-root',
  token = null,
  baseUrl,
  fetchImpl,
  now,
  createBootstrapModel = createRuntimeDashboardBootstrapModel,
  createDomBinder = createPhase2DashboardDomBinder,
  createDispatchOptions = createRuntimeDispatchOptions
} = {}) {
  if (typeof createBootstrapModel !== 'function') throw new RuntimeDashboardError('Runtime dashboard requires a bootstrap model factory.', { missing: 'createBootstrapModel' });
  if (typeof createDomBinder !== 'function') throw new RuntimeDashboardError('Runtime dashboard requires a DOM binder factory.', { missing: 'createDomBinder' });
  if (typeof createDispatchOptions !== 'function') throw new RuntimeDashboardError('Runtime dashboard requires a dispatch options factory.', { missing: 'createDispatchOptions' });

  let binder = null;
  let bootstrap = null;
  let mounted = false;
  let lastMount = null;

  const ensureBootstrap = () => {
    if (!bootstrap) bootstrap = createBootstrapModel({ token, baseUrl, fetchImpl, now, documentRef, phase2DashboardTarget: target });
    if (!bootstrap?.phase2DashboardScreen) throw new RuntimeDashboardError('Runtime dashboard bootstrap did not provide a Phase 2 dashboard screen.', { missing: 'phase2DashboardScreen' });
    return bootstrap;
  };

  const ensureBinder = () => {
    if (!binder) {
      const model = ensureBootstrap();
      binder = createDomBinder({
        screen: model.phase2DashboardScreen,
        documentRef,
        target,
        createDispatchOptions
      });
    }
    return binder;
  };

  return Object.freeze({
    appId: 'runtime-dashboard-app',
    mount({ target: nextTarget = target } = {}) {
      const activeBinder = ensureBinder();
      lastMount = activeBinder.mount({ target: nextTarget });
      mounted = true;
      return createRuntimeDashboardStatus({ mounted, lastMount });
    },
    refresh() {
      if (!mounted || !binder) throw new RuntimeDashboardError('Runtime dashboard is not mounted.', { missing: 'mount' });
      lastMount = binder.refresh();
      return createRuntimeDashboardStatus({ mounted, lastMount });
    },
    unmount({ clear = true } = {}) {
      const result = binder?.unmount({ clear }) ?? null;
      mounted = false;
      lastMount = result;
      return createRuntimeDashboardStatus({ mounted, lastMount });
    },
    isMounted() {
      return mounted && Boolean(binder?.isMounted());
    },
    getStatus() {
      return createRuntimeDashboardStatus({ mounted: this.isMounted(), lastMount });
    }
  });
}

export function createRuntimeDashboardBootstrapModel({ token = null, baseUrl, fetchImpl, now } = {}) {
  const tokenProvider = createMemoryTokenProvider(token);
  const apiClient = createApiClient({ baseUrl, tokenProvider });
  const phase2DashboardRuntime = createPhase2DashboardRuntime({ apiClient, fetchImpl, now });
  const phase2DashboardController = createPhase2DashboardController({ runtime: phase2DashboardRuntime });
  const phase2DashboardScreen = createPhase2DashboardScreen({ controller: phase2DashboardController });
  return Object.freeze({ tokenProvider, apiClient, phase2DashboardRuntime, phase2DashboardController, phase2DashboardScreen });
}

export function createRuntimeDispatchOptions(controlId) {
  if (controlId !== 'write-run-summary') return {};
  return Object.freeze({
    input: Object.freeze({
      id: 'run-runtime-dashboard-summary',
      title: 'Runtime dashboard run summary',
      projectId: 'londi-agent-os',
      agentId: 'agent-zero',
      skillId: 'obsidian-run-summary',
      status: 'succeeded',
      summary: 'Runtime Dashboard safe action wrote a minimal run summary through Local API / HostConnector.',
      artifactPath: 'apps/ui/src/runtime-dashboard.js',
      acceptance: 'Runtime Dashboard UI slice mounted through the Phase 2 DOM binder and preserved the Local API / HostConnector boundary.'
    })
  });
}

function createRuntimeDashboardStatus({ mounted, lastMount }) {
  return Object.freeze({
    appId: 'runtime-dashboard-app',
    mounted: Boolean(mounted),
    binderId: lastMount?.binderId ?? 'phase2-dashboard-dom-binder',
    target: lastMount?.target ?? null,
    bindingCount: lastMount?.bindingCount ?? 0,
    activeBindingCount: lastMount?.activeBindingCount ?? 0,
    renderPolicy: Object.freeze({
      noPolling: true,
      noBootstrapNetworkCall: true,
      noDirectFilesystemOrCli: true,
      usesLocalApiBoundary: true,
      mountsThroughDomBinder: true,
      ...(lastMount?.renderPolicy ?? {})
    })
  });
}
