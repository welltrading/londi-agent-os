export class IdempotencyReplayError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'IdempotencyReplayError';
    this.code = 'ERR_IDEMPOTENCY_REPLAY_BLOCKED';
    this.details = details;
  }
}

export class StaleRevisionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'StaleRevisionError';
    this.code = 'ERR_STALE_REVISION';
    this.details = details;
  }
}

export class IdempotencyConflictError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'IdempotencyConflictError';
    this.code = 'ERR_IDEMPOTENCY_CONFLICT';
    this.details = details;
  }
}

export function createInMemoryIdempotencyStore() {
  const records = new Map();
  return {
    get: (key) => records.get(key) ?? null,
    set: (key, record) => records.set(key, structuredClone(record)),
    size: () => records.size
  };
}

export function assertFreshRevision({ expectedRevision, actualRevision, aggregateId }) {
  if (!Number.isInteger(expectedRevision) || !Number.isInteger(actualRevision)) {
    throw new StaleRevisionError('Revision values must be integers.', { aggregateId, expectedRevision, actualRevision });
  }
  if (expectedRevision !== actualRevision) {
    throw new StaleRevisionError('Stale resource revision.', { aggregateId, expectedRevision, actualRevision });
  }
  return true;
}

export function withIdempotency({ key, fingerprint, externalEffectState = 'None', store, execute }) {
  if (!key || typeof key !== 'string') throw new IdempotencyConflictError('Idempotency key is required.');
  if (!fingerprint || typeof fingerprint !== 'string') throw new IdempotencyConflictError('Idempotency fingerprint is required.', { key });
  if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') throw new IdempotencyConflictError('Idempotency store is required.', { key });

  const existing = store.get(key);
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      throw new IdempotencyConflictError('Idempotency key reused with a different fingerprint.', { key });
    }
    if (existing.externalEffectState === 'Unknown') {
      throw new IdempotencyReplayError('Replay blocked because external effect state is Unknown.', { key });
    }
    return { replayed: true, result: structuredClone(existing.result) };
  }

  const result = execute();
  store.set(key, { fingerprint, externalEffectState, result });
  return { replayed: false, result };
}

export function createSqliteIdempotencyStore(database) {
  database.exec(`CREATE TABLE IF NOT EXISTS idempotency_records (
    key TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    external_effect_state TEXT NOT NULL DEFAULT 'None',
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  return {
    get: (key) => {
      const row = database.prepare('SELECT key, fingerprint, external_effect_state, result_json FROM idempotency_records WHERE key = ?').get(key);
      if (!row) return null;
      return {
        key: row.key,
        fingerprint: row.fingerprint,
        externalEffectState: row.external_effect_state,
        result: JSON.parse(row.result_json)
      };
    },
    set: (key, record) => {
      database.prepare('INSERT INTO idempotency_records (key, fingerprint, external_effect_state, result_json) VALUES (?, ?, ?, ?)')
        .run(key, record.fingerprint, record.externalEffectState ?? 'None', JSON.stringify(record.result));
    }
  };
}
