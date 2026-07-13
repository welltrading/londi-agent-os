import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sha256, writeAtomicArtifact } from './command-pipeline.js';

export const ARTIFACT_LAYOUT_VERSION = 1;
export const ARTIFACT_DIRECTORIES = Object.freeze(['checkpoints', 'logs', 'context', 'handoff', 'review', 'summary', 'exports']);
export const ARTIFACT_SECRET_PATTERNS = Object.freeze([
  /sk-[A-Za-z0-9_-]{12,}/g,
  /Bearer\s+[A-Za-z0-9._~+\/-]{12,}/g,
  /ghp_[A-Za-z0-9]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |OPENSSH )?PRIVATE KEY-----/g
]);

export class ArtifactLayoutError extends Error {
  constructor(message = 'Invalid artifact layout.', details = {}) {
    super(message);
    this.name = 'ArtifactLayoutError';
    this.code = 'ERR_ARTIFACT_LAYOUT';
    this.details = details;
  }
}

export function createArtifactLayout({ runId, artifactsRoot, createdAt = new Date().toISOString() } = {}) {
  if (!runId || typeof runId !== 'string') throw new ArtifactLayoutError('Artifact layout runId is required.');
  if (!artifactsRoot || typeof artifactsRoot !== 'string') throw new ArtifactLayoutError('Artifact layout artifactsRoot is required.');
  const root = resolve(artifactsRoot);
  return deepFreezeArtifact({
    version: ARTIFACT_LAYOUT_VERSION,
    runId,
    root,
    createdAt,
    directories: Object.fromEntries(ARTIFACT_DIRECTORIES.map((name) => [name, join(root, name)]))
  });
}

export function writeArtifactRecord({ layout, category, filename, content, metadata = {}, expectedHash } = {}) {
  assertArtifactLayout(layout);
  if (!ARTIFACT_DIRECTORIES.includes(category)) throw new ArtifactLayoutError('Unknown artifact category.', { category });
  if (!filename || typeof filename !== 'string' || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new ArtifactLayoutError('Artifact filename must be a safe relative filename.', { filename });
  }
  const text = stringifyArtifactContent(content);
  const secretMatches = findSecretLikeValues(text);
  if (category === 'checkpoints' && secretMatches.length > 0) {
    throw new ArtifactLayoutError('Checkpoint artifacts must not contain secrets.', { secretMatches });
  }
  const path = join(layout.directories[category], filename);
  const writeResult = writeAtomicArtifact({ path, content: text, expectedHash });
  if (expectedHash && writeResult.hash !== expectedHash) throw new ArtifactLayoutError('Artifact hash mismatch.', { path, expectedHash, actualHash: writeResult.hash });
  return deepFreezeArtifact({
    category,
    filename,
    path,
    hash: writeResult.hash,
    size: writeResult.size,
    metadata: structuredClone(metadata),
    secretMatches: secretMatches.length,
    writtenAt: new Date().toISOString()
  });
}

export function createArtifactManifest({ layout, records = [], revisions = {}, createdAt = new Date().toISOString() } = {}) {
  assertArtifactLayout(layout);
  if (!Array.isArray(records)) throw new ArtifactLayoutError('Artifact manifest records must be an array.');
  const normalizedRecords = records.map(assertArtifactRecord);
  return deepFreezeArtifact({
    version: ARTIFACT_LAYOUT_VERSION,
    runId: layout.runId,
    root: layout.root,
    createdAt,
    directories: layout.directories,
    records: normalizedRecords,
    revisions: normalizeRevisions(revisions),
    manifestHash: sha256(Buffer.from(JSON.stringify({ runId: layout.runId, records: normalizedRecords, revisions: normalizeRevisions(revisions) }), 'utf8'))
  });
}

export function writeArtifactManifest({ layout, records = [], revisions = {}, filename = 'manifest.json' } = {}) {
  const manifest = createArtifactManifest({ layout, records, revisions });
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  const record = writeArtifactRecord({ layout, category: 'summary', filename, content, metadata: { kind: 'artifact-manifest' } });
  return deepFreezeArtifact({ manifest, record });
}

export function verifyArtifactRecord(record) {
  const normalized = assertArtifactRecord(record);
  const actualHash = sha256(readFileSync(normalized.path));
  if (actualHash !== normalized.hash) throw new ArtifactLayoutError('Artifact hash mismatch.', { path: normalized.path, expectedHash: normalized.hash, actualHash });
  return true;
}

export function assertCheckpointWithoutSecrets(content) {
  const text = stringifyArtifactContent(content);
  const secretMatches = findSecretLikeValues(text);
  if (secretMatches.length > 0) throw new ArtifactLayoutError('Checkpoint artifacts must not contain secrets.', { secretMatches });
  return true;
}

function assertArtifactLayout(layout) {
  if (!layout || typeof layout !== 'object') throw new ArtifactLayoutError('Artifact layout must be an object.');
  if (layout.version !== ARTIFACT_LAYOUT_VERSION || !layout.runId || !layout.root || !layout.directories) throw new ArtifactLayoutError('Artifact layout is incomplete.', { layout });
  for (const category of ARTIFACT_DIRECTORIES) {
    if (!layout.directories[category]) throw new ArtifactLayoutError('Artifact layout missing directory.', { category });
  }
  return true;
}

function assertArtifactRecord(record) {
  if (!record || typeof record !== 'object') throw new ArtifactLayoutError('Artifact record must be an object.');
  if (!record.category || !record.filename || !record.path || !record.hash || !Number.isInteger(record.size)) {
    throw new ArtifactLayoutError('Artifact record requires category, filename, path, hash and size.', { record });
  }
  if (!ARTIFACT_DIRECTORIES.includes(record.category)) throw new ArtifactLayoutError('Artifact record has unknown category.', { category: record.category });
  return deepFreezeArtifact({
    category: record.category,
    filename: record.filename,
    path: record.path,
    hash: record.hash,
    size: record.size,
    metadata: structuredClone(record.metadata ?? {}),
    secretMatches: record.secretMatches ?? 0,
    writtenAt: record.writtenAt ?? null
  });
}

function normalizeRevisions(revisions) {
  if (!revisions || typeof revisions !== 'object' || Array.isArray(revisions)) throw new ArtifactLayoutError('Artifact revisions must be an object.');
  return Object.fromEntries(Object.entries(revisions).map(([key, value]) => {
    if (!Array.isArray(value)) throw new ArtifactLayoutError('Artifact revision entries must be arrays.', { key });
    return [key, value.map((revision) => {
      if (!revision || typeof revision !== 'object' || !revision.hash) throw new ArtifactLayoutError('Artifact revision entry requires hash.', { key, revision });
      return structuredClone(revision);
    })];
  }));
}

function stringifyArtifactContent(content) {
  if (Buffer.isBuffer(content)) return content.toString('utf8');
  if (typeof content === 'string') return content;
  return `${JSON.stringify(content ?? {}, null, 2)}\n`;
}

function findSecretLikeValues(text) {
  const matches = [];
  for (const pattern of ARTIFACT_SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) matches.push({ index: match.index, pattern: pattern.source });
  }
  return matches;
}

function deepFreezeArtifact(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeArtifact(child);
  return Object.freeze(value);
}
