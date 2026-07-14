export const ASM_SECTIONS = Object.freeze(['audit', 'projects', 'obsidian-roots', 'adapters', 'retention', 'notifications', 'backups', 'updates']);
export const ASM_ACTION_STATE = Object.freeze({ available: 'available', disabled: 'disabled' });
export const ASM_VISUAL_TOKENS = Object.freeze({
  info: { label: 'Info', icon: 'info', tone: 'blue' },
  warning: { label: 'Warning', icon: 'warning', tone: 'amber' },
  disabled: { label: 'Disabled', icon: 'lock', tone: 'neutral' },
  healthy: { label: 'Healthy', icon: 'check', tone: 'green' }
});

export class AuditSettingsMaintenanceError extends Error {
  constructor(message, code = 'ERR_AUDIT_SETTINGS_MAINTENANCE', details = {}) {
    super(message);
    this.name = 'AuditSettingsMaintenanceError';
    this.code = code;
    this.details = details;
  }
}

export function createAuditSettingsMaintenanceModel({ audit = [], settings = {}, maintenance = {}, capabilities = {}, now = new Date().toISOString() } = {}) {
  const normalizedAudit = createAuditTimeline(audit, settings.auditFilters ?? {});
  const model = {
    generatedAt: now,
    audit: normalizedAudit,
    export: createAuditExportDescriptor(normalizedAudit),
    settings: createSettingsModel(settings),
    maintenance: createMaintenanceModel(maintenance, capabilities),
    accessibility: { auditReadOnly: true, secretsHidden: true, disabledActionsLabeled: true }
  };
  return deepFreezeAsm(model);
}

export function createAuditTimeline(events = [], filters = {}) {
  if (!Array.isArray(events)) throw new AuditSettingsMaintenanceError('Audit events must be an array.', 'ERR_ASM_AUDIT_EVENTS');
  return deepFreezeAsm(events.map(normalizeAuditEvent).filter((event) => matchesAuditFilters(event, filters)).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))));
}

export function createAuditExportDescriptor(events = []) {
  const normalized = events.map(normalizeAuditEvent);
  return deepFreezeAsm({
    readOnly: true,
    format: 'jsonl',
    filename: `audit-export-${new Date().toISOString().slice(0, 10)}.jsonl`,
    count: normalized.length,
    contentPreview: normalized.slice(0, 5).map((event) => JSON.stringify(event)).join('\n'),
    visual: ASM_VISUAL_TOKENS.info
  });
}

export function createSettingsModel(settings = {}) {
  return deepFreezeAsm({
    projects: (settings.projects ?? []).map(normalizeProject),
    obsidianRoots: (settings.obsidianRoots ?? []).map(normalizeObsidianRoot),
    adapters: (settings.adapters ?? []).map(normalizeAdapter),
    retention: normalizeRetention(settings.retention ?? {}),
    notifications: normalizeNotifications(settings.notifications ?? {})
  });
}

export function createMaintenanceModel(maintenance = {}, capabilities = {}) {
  const implemented = new Set(capabilities.implementedActions ?? []);
  const actions = [
    maintenanceAction('backup-now', 'Backup now', 'Creates a local backup archive.', implemented.has('backup-now')),
    maintenanceAction('restore-backup', 'Restore backup', 'Restores from a selected backup after confirmation.', implemented.has('restore-backup')),
    maintenanceAction('check-updates', 'Check updates', 'Checks update metadata without installing.', implemented.has('check-updates')),
    maintenanceAction('install-update', 'Install update', 'Installs an approved update package.', implemented.has('install-update')),
    maintenanceAction('prune-retention', 'Prune retention', 'Deletes only retention-eligible completed run artifacts.', implemented.has('prune-retention'))
  ];
  return deepFreezeAsm({
    backups: (maintenance.backups ?? []).map(normalizeBackup),
    updates: normalizeUpdates(maintenance.updates ?? {}),
    actions,
    warnings: (maintenance.warnings ?? []).map(sanitizeText)
  });
}

export function createAsmApiRequests({ apiClient, requestId = 'ui-asm' } = {}) {
  if (!apiClient || typeof apiClient.createRequest !== 'function') throw new AuditSettingsMaintenanceError('API client is required.', 'ERR_ASM_API_CLIENT');
  return Object.freeze({
    audit: apiClient.createRequest('GET', '/audit/events', { requestId }),
    settings: apiClient.createRequest('GET', '/settings', { requestId }),
    maintenance: apiClient.createRequest('GET', '/maintenance', { requestId }),
    exportAudit: apiClient.createRequest('GET', '/audit/events/export', { requestId }),
    runMaintenanceAction: (action, body = {}) => apiClient.createRequest('POST', `/maintenance/actions/${encodeURIComponent(action)}`, { requestId, body })
  });
}

export function assertAuditReadOnly(model) {
  const text = JSON.stringify(model.audit ?? model);
  if (/"method":"(POST|PUT|PATCH|DELETE)"/.test(text)) throw new AuditSettingsMaintenanceError('Audit UI must be read-only.', 'ERR_ASM_AUDIT_MUTABLE');
  return true;
}

export function assertNoSecretsDisplayed(value) {
  const text = JSON.stringify(value ?? '');
  if (/sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+\/-]+=*|[A-Za-z0-9_-]{43,}/.test(text)) throw new AuditSettingsMaintenanceError('Secrets must not be displayed.', 'ERR_ASM_SECRET_VISIBLE');
  return true;
}

export function assertDisabledActionsDoNotSimulateSuccess(model) {
  for (const action of model.maintenance?.actions ?? []) {
    if (action.state === ASM_ACTION_STATE.disabled && /success|completed|done/i.test(`${action.result ?? ''}${action.expectedResult ?? ''}`)) {
      throw new AuditSettingsMaintenanceError('Disabled maintenance actions must not simulate success.', 'ERR_ASM_DISABLED_SUCCESS', { action: action.id });
    }
  }
  return true;
}

function normalizeAuditEvent(event = {}) {
  if (!event.id || !event.timestamp || !event.type) throw new AuditSettingsMaintenanceError('Audit event requires id, timestamp and type.', 'ERR_ASM_AUDIT_EVENT', { event });
  return Object.freeze({
    id: sanitizeText(event.id),
    timestamp: event.timestamp,
    actor: sanitizeText(event.actor ?? 'system'),
    type: sanitizeText(event.type),
    scope: sanitizeText(event.scope ?? event.runId ?? ''),
    message: sanitizeText(event.message ?? event.type),
    payload: redactObject(event.payload ?? {}),
    readOnly: true,
    visual: event.severity === 'warning' ? ASM_VISUAL_TOKENS.warning : ASM_VISUAL_TOKENS.info
  });
}

function normalizeProject(project = {}) { return Object.freeze({ id: sanitizeText(project.id ?? project.path), name: sanitizeText(project.name ?? project.id ?? project.path), path: sanitizeText(project.path ?? ''), gitValid: project.gitValid === true, locked: project.locked === true, visual: project.gitValid === true ? ASM_VISUAL_TOKENS.healthy : ASM_VISUAL_TOKENS.warning }); }
function normalizeObsidianRoot(root = {}) { return Object.freeze({ id: sanitizeText(root.id ?? root.path), path: sanitizeText(root.path ?? ''), readOnly: root.readOnly !== false, writeBackEnabled: root.writeBackEnabled === true, visual: ASM_VISUAL_TOKENS.info }); }
function normalizeAdapter(adapter = {}) { return Object.freeze({ id: sanitizeText(adapter.id), displayName: sanitizeText(adapter.displayName ?? adapter.id), available: adapter.available === true, capabilities: (adapter.capabilities ?? []).map(sanitizeText), visual: adapter.available === true ? ASM_VISUAL_TOKENS.healthy : ASM_VISUAL_TOKENS.warning }); }
function normalizeRetention(retention = {}) { return Object.freeze({ days: Number(retention.days ?? 30), completedOnly: retention.completedOnly !== false, dryRunRequired: retention.dryRunRequired !== false, visual: ASM_VISUAL_TOKENS.info }); }
function normalizeNotifications(notifications = {}) { return Object.freeze({ enabled: notifications.enabled === true, channels: (notifications.channels ?? []).map(sanitizeText), quietHours: sanitizeText(notifications.quietHours ?? ''), visual: notifications.enabled === true ? ASM_VISUAL_TOKENS.healthy : ASM_VISUAL_TOKENS.disabled }); }
function normalizeBackup(backup = {}) { return Object.freeze({ id: sanitizeText(backup.id), createdAt: backup.createdAt ?? null, path: sanitizeText(backup.path ?? ''), size: backup.size ?? null, verified: backup.verified === true, visual: backup.verified === true ? ASM_VISUAL_TOKENS.healthy : ASM_VISUAL_TOKENS.warning }); }
function normalizeUpdates(updates = {}) { return Object.freeze({ currentVersion: sanitizeText(updates.currentVersion ?? '0.0.0'), latestVersion: sanitizeText(updates.latestVersion ?? updates.currentVersion ?? '0.0.0'), updateAvailable: updates.updateAvailable === true, notes: sanitizeText(updates.notes ?? ''), visual: updates.updateAvailable === true ? ASM_VISUAL_TOKENS.warning : ASM_VISUAL_TOKENS.healthy }); }
function maintenanceAction(id, label, description, isImplemented) { return Object.freeze({ id, action: id, label, description, state: isImplemented ? ASM_ACTION_STATE.available : ASM_ACTION_STATE.disabled, reason: isImplemented ? null : 'Not implemented in this slice; UI must not simulate success.', visual: isImplemented ? ASM_VISUAL_TOKENS.info : ASM_VISUAL_TOKENS.disabled }); }
function matchesAuditFilters(event, filters = {}) { return (!filters.type || event.type === filters.type) && (!filters.actor || event.actor === filters.actor) && (!filters.scope || event.scope === filters.scope) && (!filters.text || `${event.message} ${JSON.stringify(event.payload)}`.toLowerCase().includes(String(filters.text).toLowerCase())); }
function sanitizeText(value) { return String(value ?? '').replace(/sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+\/-]+=*|[A-Za-z0-9_-]{43,}/g, '[REDACTED]').replace(/[\r\n\u2028\u2029]+/g, ' ').trim(); }
function redactObject(value) { return JSON.parse(sanitizeText(JSON.stringify(value ?? {})) || '{}'); }
function deepFreezeAsm(value) { if (!value || typeof value !== 'object') return value; for (const child of Object.values(value)) deepFreezeAsm(child); return Object.freeze(value); }
