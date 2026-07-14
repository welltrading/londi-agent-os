import { strict as assert } from 'node:assert';
import {
  ASM_ACTION_STATE,
  AuditSettingsMaintenanceError,
  assertAuditReadOnly,
  assertDisabledActionsDoNotSimulateSuccess,
  assertNoSecretsDisplayed,
  createApiClient,
  createAsmApiRequests,
  createAuditSettingsMaintenanceModel,
  createAuditTimeline,
  createMemoryTokenProvider,
  getUiBootstrapModel
} from '../apps/ui/src/index.js';

const model = createAuditSettingsMaintenanceModel({
  audit: [
    { id: 'a1', timestamp: '2026-07-14T08:00:00.000Z', type: 'approval.decided', actor: 'londi', scope: 'run-1', message: 'Approved', payload: { token: 'Bearer abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_' } },
    { id: 'a2', timestamp: '2026-07-14T09:00:00.000Z', type: 'run.created', actor: 'system', scope: 'run-2', message: 'Created' }
  ],
  settings: {
    projects: [{ id: 'p1', name: 'Repo', path: '/repo', gitValid: true }],
    obsidianRoots: [{ id: 'o1', path: '/vault', readOnly: true }],
    adapters: [{ id: 'claude-code', available: true, capabilities: ['code'] }],
    retention: { days: 45, completedOnly: true },
    notifications: { enabled: false, channels: ['desktop'] }
  },
  maintenance: { backups: [{ id: 'b1', path: '/backup.zip', verified: true }], updates: { currentVersion: '0.0.0', latestVersion: '0.0.1', updateAvailable: true } },
  capabilities: { implementedActions: ['backup-now', 'check-updates'] }
});
assert.equal(model.audit[0].id, 'a2');
assert.equal(model.audit[1].payload.token, '[REDACTED]');
assert.equal(model.export.readOnly, true);
assert.equal(model.settings.projects[0].visual.label, 'Healthy');
assert.equal(model.settings.notifications.visual.label, 'Disabled');
assert.equal(model.maintenance.actions.find((item) => item.id === 'backup-now').state, ASM_ACTION_STATE.available);
assert.equal(model.maintenance.actions.find((item) => item.id === 'install-update').state, ASM_ACTION_STATE.disabled);
assert.equal(assertAuditReadOnly(model), true);
assert.equal(assertNoSecretsDisplayed(model), true);
assert.equal(assertDisabledActionsDoNotSimulateSuccess(model), true);

const filtered = createAuditTimeline(model.audit, { type: 'run.created' });
assert.equal(filtered.length, 1);
assert.equal(filtered[0].type, 'run.created');
assert.throws(() => createAuditTimeline([{ id: 'bad' }]), AuditSettingsMaintenanceError);

const apiClient = createApiClient({ tokenProvider: createMemoryTokenProvider('local-token') });
const requests = createAsmApiRequests({ apiClient, requestId: 'req-asm' });
assert.equal(requests.audit.url.endsWith('/audit/events'), true);
assert.equal(requests.settings.url.endsWith('/settings'), true);
assert.equal(requests.exportAudit.url.endsWith('/audit/events/export'), true);
assert.equal(requests.runMaintenanceAction('backup-now').method, 'POST');
assert.equal(getUiBootstrapModel().auditSettingsMaintenanceSections.includes('backups'), true);

console.log('Audit settings maintenance tests OK');
