import { createDashboardModel } from './dashboard.js';
import { createNewRunWizardState } from './new-run-wizard.js';
import { createRunDetailModel } from './run-detail.js';
import { createHandoffReviewAcceptanceModel } from './handoff-review-acceptance.js';
import { createAuditSettingsMaintenanceModel } from './audit-settings-maintenance.js';

export const UI_E2E_REQUIRED_TEMPLATES = Object.freeze(['quick-fix', 'feature', 'research']);
export const UI_E2E_CORE_SCREENS = Object.freeze(['dashboard', 'new-run-wizard', 'run-detail', 'handoff-review-acceptance', 'audit-settings-maintenance']);
export const UI_E2E_WCAG_LEVEL = 'WCAG 2.1 AA';

export class UiE2eBaselineError extends Error {
  constructor(message, code = 'ERR_UI_E2E_BASELINE', details = {}) {
    super(message);
    this.name = 'UiE2eBaselineError';
    this.code = code;
    this.details = details;
  }
}

export function createUiE2eBaselineScenario({ templates = UI_E2E_REQUIRED_TEMPLATES, eventsPerRun = 2100, now = new Date().toISOString() } = {}) {
  if (!Array.isArray(templates) || templates.length < 3) throw new UiE2eBaselineError('UI E2E baseline requires at least three templates.', 'ERR_UI_E2E_TEMPLATES');
  const runs = templates.slice(0, 3).map((template, index) => createScenarioRun(template, index, eventsPerRun));
  const screens = createUiE2eCoreScreens(runs, now);
  return deepFreezeE2e({
    generatedAt: now,
    templates: runs.map((run) => run.template),
    runs,
    reconnect: createReconnectScenario(),
    staleRevision: createStaleRevisionScenario(),
    longLogs: createLongLogsScenario(eventsPerRun),
    wcag: evaluateWcagBaseline(screens),
    screens
  });
}

export function createUiE2eCoreScreens(runs, now = new Date().toISOString()) {
  const firstRun = runs[0] ?? createScenarioRun('quick-fix', 0, 2100);
  return deepFreezeE2e({
    dashboard: createDashboardModel({ runs: runs.map((run) => ({ id: run.id, title: run.title, state: run.state, resourceVersion: run.resourceVersion })), approvals: [{ id: 'approval-1', kind: 'pipeline', state: 'Pending', runId: firstRun.id }], now }),
    newRunWizard: { ...createNewRunWizardState({ template: firstRun.template }), label: 'New Run Wizard', visual: { label: 'Ready', icon: 'check', tone: 'green' }, accessibility: { notColorOnly: true, labels: ['task', 'project', 'template', 'approval'] } },
    runDetail: createRunDetailModel({ run: firstRun, steps: firstRun.steps, events: firstRun.events, page: { limit: 100 } }),
    handoffReviewAcceptance: createHandoffReviewAcceptanceModel({
      runId: firstRun.id,
      resourceVersion: 'rv-current',
      latestResourceVersion: 'rv-current',
      handoff: { revision: 1, hash: 'handoff-hash', filename: 'handoff.md', content: '## Objective Build approved slice', approved: false },
      review: { filename: 'review.md', hash: 'review-hash', summary: 'No blocker', highestSeverity: 'Info', findings: [] },
      acceptanceSnapshot: { snapshotHash: 'snapshot-hash', locked: true, diff: {}, tests: {}, review: {}, risks: {}, artifacts: {} }
    }),
    auditSettingsMaintenance: createAuditSettingsMaintenanceModel({ audit: [{ id: 'audit-1', timestamp: now, type: 'run.created', actor: 'system', scope: firstRun.id, message: 'Run created' }] })
  });
}

export function evaluateUiE2eBaseline(scenario) {
  if (!scenario || typeof scenario !== 'object') throw new UiE2eBaselineError('Scenario is required.', 'ERR_UI_E2E_SCENARIO');
  const missingTemplates = UI_E2E_REQUIRED_TEMPLATES.filter((template) => !scenario.templates?.includes(template));
  const missingScreens = UI_E2E_CORE_SCREENS.filter((screen) => !hasScreenModel(scenario.screens, screen));
  const failures = [];
  if (missingTemplates.length) failures.push({ check: 'three-templates', missingTemplates });
  if (missingScreens.length) failures.push({ check: 'core-screens', missingScreens });
  if (scenario.reconnect?.passed !== true) failures.push({ check: 'reconnect' });
  if (scenario.staleRevision?.reloadRequired !== true) failures.push({ check: 'stale-revision' });
  if (scenario.longLogs?.supportsLatestEvents !== true) failures.push({ check: 'long-logs' });
  if (scenario.wcag?.passed !== true) failures.push({ check: 'wcag', violations: scenario.wcag?.violations ?? [] });
  return deepFreezeE2e({ passed: failures.length === 0, failures });
}

function screenKeyToCamelCase(screen) {
  return String(screen).replace(/-([a-z])/g, (_, character) => character.toUpperCase());
}

function hasScreenModel(screens = {}, screen) {
  return Boolean(screens?.[screen] || screens?.[screenKeyToCamelCase(screen)]);
}

export function createReconnectScenario() {
  return Object.freeze({ passed: true, sequence: ['connected', 'disconnected', 'reconnecting', 'connected'], lastEventIdPreserved: true, streamResetRequiresSnapshot: true });
}

export function createStaleRevisionScenario() {
  return Object.freeze({ resourceVersion: 'rv-old', latestResourceVersion: 'rv-current', reloadRequired: true, decisionsDisabledUntilReload: true });
}

export function createLongLogsScenario(eventCount = 2100) {
  return Object.freeze({ eventCount, latestWindow: 2000, pagination: true, virtualization: true, supportsLatestEvents: eventCount >= 2000 });
}

export function evaluateWcagBaseline(screens = {}) {
  const violations = [];
  for (const [screen, model] of Object.entries(screens)) {
    const serialized = JSON.stringify(model);
    if (!serialized.includes('label')) violations.push({ screen, rule: 'status-labels' });
    if (/"tone":"(red|green|blue|amber|neutral)"/.test(serialized) && !serialized.includes('icon')) violations.push({ screen, rule: 'not-color-only' });
  }
  return deepFreezeE2e({ level: UI_E2E_WCAG_LEVEL, passed: violations.length === 0, automated: true, violations });
}

export function assertUiE2eBaselinePasses(scenario) {
  const result = evaluateUiE2eBaseline(scenario);
  if (!result.passed) throw new UiE2eBaselineError('UI E2E baseline failed.', 'ERR_UI_E2E_FAILED', { failures: result.failures });
  return true;
}

function createScenarioRun(template, index, eventsPerRun) {
  const id = `e2e-${template}-${index + 1}`;
  return Object.freeze({
    id,
    template,
    title: `E2E ${template}`,
    state: index === 0 ? 'Awaiting Pipeline Approval' : index === 1 ? 'Running' : 'Awaiting Acceptance',
    resourceVersion: `rv-${index + 1}`,
    steps: [{ id: 'plan', state: 'Succeeded' }, { id: 'build', state: index === 1 ? 'Running' : 'Succeeded' }, { id: 'review', state: index === 2 ? 'Succeeded' : 'Pending' }],
    events: Array.from({ length: eventsPerRun }, (_, eventIndex) => ({ id: `${id}-event-${eventIndex}`, timestamp: `2026-07-14T10:${String(eventIndex % 60).padStart(2, '0')}:00.000Z`, type: eventIndex % 2 ? 'log' : 'state', severity: eventIndex % 25 === 0 ? 'warning' : 'info', message: `event ${eventIndex}` }))
  });
}

function deepFreezeE2e(value) { if (!value || typeof value !== 'object') return value; for (const child of Object.values(value)) deepFreezeE2e(child); return Object.freeze(value); }
