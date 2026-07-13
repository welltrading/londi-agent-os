const DEFAULT_DATA_ROOT = './data';

export const LOCAL_CONFIG_SCHEMA_VERSION = 1;
export const DEFAULT_LOCAL_CONFIG = Object.freeze({
  schemaVersion: LOCAL_CONFIG_SCHEMA_VERSION,
  dataRoot: DEFAULT_DATA_ROOT,
  paths: Object.freeze({
    database: './data/db/londi-agent-os.sqlite',
    runs: './data/runs',
    worktrees: './data/worktrees',
    backups: './data/backups',
    obsidianSnapshots: './data/obsidian-snapshots'
  }),
  obsidian: Object.freeze({
    roots: Object.freeze([])
  }),
  ports: Object.freeze({
    localApi: 3210,
    ui: 3211
  }),
  retention: Object.freeze({
    completedRunDays: 7,
    nonCompletedRunDays: 30,
    auditDays: 365,
    cleanupIntervalHours: 24
  })
});

const SECRET_KEY_PATTERN = /secret|token|password|credential|api[_-]?key/i;

export class LocalConfigValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'LocalConfigValidationError';
    this.code = 'ERR_INVALID_LOCAL_CONFIG';
    this.details = details;
  }
}

export function loadDefaultLocalConfig() {
  return structuredClone(DEFAULT_LOCAL_CONFIG);
}

export function validateLocalConfig(config = DEFAULT_LOCAL_CONFIG) {
  if (!config || typeof config !== 'object') {
    throw new LocalConfigValidationError('Local config must be an object.');
  }

  if (config.schemaVersion !== LOCAL_CONFIG_SCHEMA_VERSION) {
    throw new LocalConfigValidationError('Unsupported local config schema version.', {
      expected: LOCAL_CONFIG_SCHEMA_VERSION,
      actual: config.schemaVersion
    });
  }

  assertNoSecretKeys(config);
  assertRelativeLocalPath(config.dataRoot, 'dataRoot');

  for (const [key, path] of Object.entries(config.paths ?? {})) {
    assertRelativeLocalPath(path, `paths.${key}`);
    assertPathUnderDataRoot(path, config.dataRoot, `paths.${key}`);
  }

  for (const [key, port] of Object.entries(config.ports ?? {})) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      throw new LocalConfigValidationError(`Invalid local port: ${key}`, { key, port });
    }
  }

  const retention = config.retention ?? {};
  for (const key of ['completedRunDays', 'nonCompletedRunDays', 'auditDays', 'cleanupIntervalHours']) {
    const value = retention[key];
    if (!Number.isInteger(value) || value <= 0) {
      throw new LocalConfigValidationError(`Invalid retention value: ${key}`, { key, value });
    }
  }

  if (!Array.isArray(config.obsidian?.roots)) {
    throw new LocalConfigValidationError('Obsidian roots must be an array.');
  }

  for (const root of config.obsidian.roots) {
    if (typeof root !== 'string' || !root.trim()) {
      throw new LocalConfigValidationError('Obsidian root must be a non-empty path string.');
    }
  }

  return true;
}

function assertNoSecretKeys(value, trail = []) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const path = [...trail, key].join('.');
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new LocalConfigValidationError('Secrets are not allowed in local config.', { key: path });
    }
    assertNoSecretKeys(child, [...trail, key]);
  }
}

function assertRelativeLocalPath(path, key) {
  if (typeof path !== 'string' || !path.trim()) {
    throw new LocalConfigValidationError(`Invalid path: ${key}`, { key, path });
  }
  if (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.includes('..')) {
    throw new LocalConfigValidationError(`Path must be relative and stay inside the approved data root: ${key}`, { key, path });
  }
}

function assertPathUnderDataRoot(path, dataRoot, key) {
  const normalizedRoot = trimSlashes(dataRoot);
  const normalizedPath = trimSlashes(path);
  if (normalizedPath !== normalizedRoot && !normalizedPath.startsWith(`${normalizedRoot}/`)) {
    throw new LocalConfigValidationError(`Path is outside the approved data root: ${key}`, { key, path, dataRoot });
  }
}

function trimSlashes(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/g, '');
}
