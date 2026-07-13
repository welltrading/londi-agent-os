export const COMPATIBILITY_SCHEMA_VERSION = 1;

export const COMPATIBILITY_MANIFEST = Object.freeze({
  manifestVersion: 1,
  productVersion: '0.0.0-mvp',
  schema: {
    version: 1,
    supportedRange: '1.x'
  },
  runtime: {
    operatingSystems: [
      {
        id: 'windows-11',
        name: 'Windows 11',
        supported: true,
        minRelease: '22H2'
      }
    ],
    node: {
      name: 'Node.js',
      supportedRange: '>=22.0.0 <25.0.0',
      channel: 'LTS'
    },
    git: {
      name: 'Git',
      supportedRange: '>=2.40.0'
    }
  },
  agents: {
    claudeCode: {
      id: 'claude-code',
      displayName: 'Claude Code CLI',
      supportedRange: '>=1.0.0',
      activeInMvp: true,
      adapterIntroducedIn: 'E3'
    },
    codex: {
      id: 'codex',
      displayName: 'Codex CLI',
      supportedRange: '>=0.1.0',
      activeInMvp: true,
      adapterIntroducedIn: 'E3'
    }
  },
  unsupportedAgents: ['agent-zero', 'hermes']
});

export class UnsupportedCompatibilityVersionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'UnsupportedCompatibilityVersionError';
    this.code = 'ERR_UNSUPPORTED_COMPATIBILITY_VERSION';
    this.details = details;
  }
}

export function loadCompatibilityManifest() {
  return COMPATIBILITY_MANIFEST;
}

export function assertSupportedCompatibilityManifest(manifest = COMPATIBILITY_MANIFEST) {
  if (!manifest || typeof manifest !== 'object') {
    throw new UnsupportedCompatibilityVersionError('Compatibility manifest must be an object.');
  }

  if (manifest.manifestVersion !== COMPATIBILITY_SCHEMA_VERSION) {
    throw new UnsupportedCompatibilityVersionError(
      `Unsupported compatibility manifest version: ${manifest.manifestVersion}`,
      { expected: COMPATIBILITY_SCHEMA_VERSION, actual: manifest.manifestVersion }
    );
  }

  if (manifest.schema?.version !== COMPATIBILITY_SCHEMA_VERSION) {
    throw new UnsupportedCompatibilityVersionError(
      `Unsupported schema version: ${manifest.schema?.version}`,
      { expected: COMPATIBILITY_SCHEMA_VERSION, actual: manifest.schema?.version }
    );
  }

  for (const requiredAgent of ['claudeCode', 'codex']) {
    if (!manifest.agents?.[requiredAgent]?.activeInMvp) {
      throw new UnsupportedCompatibilityVersionError(`Missing active MVP agent compatibility entry: ${requiredAgent}`);
    }
  }

  return true;
}
