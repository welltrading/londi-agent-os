export class EventStoreError extends Error {
  constructor(message, code = 'ERR_EVENT_STORE', details = {}) {
    super(message);
    this.name = 'EventStoreError';
    this.code = code;
    this.details = details;
  }
}

export class AuditAppendOnlyError extends EventStoreError {
  constructor(message = 'Audit entries are append-only.', details = {}) {
    super(message, 'ERR_AUDIT_APPEND_ONLY', details);
    this.name = 'AuditAppendOnlyError';
  }
}

export function createInMemoryEventStore() {
  let nextEventId = 1;
  const events = [];
  const auditEntries = [];

  return {
    appendEvent(event) {
      const stored = normalizeEvent(event, nextEventId++);
      events.push(stored);
      return structuredClone(stored);
    },
    appendAudit(entry) {
      const event = events.find((candidate) => candidate.eventId === entry.eventId);
      if (!event) throw new EventStoreError('Audit entry must reference an existing event.', 'ERR_AUDIT_EVENT_NOT_FOUND', { eventId: entry.eventId });
      const stored = normalizeAuditEntry(entry);
      auditEntries.push(stored);
      return structuredClone(stored);
    },
    listEvents({ afterEventId = 0, limit = 100 } = {}) {
      return events.filter((event) => event.eventId > afterEventId).slice(0, limit).map((item) => structuredClone(item));
    },
    listAudit({ runId } = {}) {
      return auditEntries
        .filter((entry) => runId === undefined || entry.runId === runId)
        .map((item) => structuredClone(item));
    },
    exportAudit({ runId, format = 'json' } = {}) {
      const entries = this.listAudit({ runId });
      if (format === 'json') return JSON.stringify(entries, null, 2);
      if (format === 'csv') return toAuditCsv(entries);
      throw new EventStoreError('Unsupported audit export format.', 'ERR_AUDIT_EXPORT_FORMAT', { format });
    },
    deleteAudit() {
      throw new AuditAppendOnlyError();
    },
    updateAudit() {
      throw new AuditAppendOnlyError();
    }
  };
}

export function appendEventAndAudit(store, { event, audit }) {
  const storedEvent = store.appendEvent(event);
  const storedAudit = store.appendAudit({ ...audit, eventId: storedEvent.eventId, runId: audit.runId ?? storedEvent.runId });
  return { event: storedEvent, audit: storedAudit };
}

export function compareEventOrder(left, right) {
  return left.eventId - right.eventId;
}

export function toAuditCsv(entries) {
  const header = ['id', 'eventId', 'actor', 'action', 'target', 'result', 'runId', 'stepId', 'createdAt'];
  const rows = entries.map((entry) => header.map((key) => csvCell(entry[key] ?? '')).join(','));
  return [header.join(','), ...rows].join('\n');
}

function normalizeEvent(event = {}, eventId) {
  if (!event.type) throw new EventStoreError('Event type is required.', 'ERR_EVENT_VALIDATION');
  return Object.freeze({
    eventId,
    type: event.type,
    runId: event.runId ?? null,
    stepId: event.stepId ?? null,
    severity: event.severity ?? 'info',
    payloadRedacted: structuredClone(event.payloadRedacted ?? {}),
    timestamp: event.timestamp ?? new Date().toISOString()
  });
}

function normalizeAuditEntry(entry = {}) {
  for (const field of ['id', 'eventId', 'actor', 'action', 'target', 'result']) {
    if (entry[field] === undefined || entry[field] === null || entry[field] === '') {
      throw new EventStoreError(`Audit ${field} is required.`, 'ERR_AUDIT_VALIDATION', { field });
    }
  }
  return Object.freeze({
    id: entry.id,
    eventId: entry.eventId,
    actor: entry.actor,
    action: entry.action,
    target: entry.target,
    result: entry.result,
    runId: entry.runId ?? null,
    stepId: entry.stepId ?? null,
    metadataRedacted: structuredClone(entry.metadataRedacted ?? {}),
    createdAt: entry.createdAt ?? new Date().toISOString()
  });
}

function csvCell(value) {
  const text = String(value).replaceAll('"', '""');
  return /[",\n]/.test(text) ? `"${text}"` : text;
}
