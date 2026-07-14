import { existsSync, mkdirSync, renameSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { sha256 } from './command-pipeline.js';

export const REDACTION_PLACEHOLDER = '[REDACTED_SECRET]';
export const QUARANTINE_EVENT_TYPE = 'security.secret_leak.quarantined';
export const REDACTION_SURFACES = Object.freeze(['stdout', 'stderr', 'sse', 'audit', 'artifact', 'diff']);
export const SECRET_LEAKAGE_PATTERNS = Object.freeze([
  /sk-[A-Za-z0-9_-]{8,}/g,
  /Bearer\s+[A-Za-z0-9._~+\/-]{12,}/gi,
  /(token|password|secret|credential|api[_-]?key)=([^\s&]+)/gi,
  /ghp_[A-Za-z0-9]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |OPENSSH )?PRIVATE KEY-----/g
]);

export class RedactionQuarantineError extends Error {
  constructor(message = 'Invalid redaction/quarantine operation.', details = {}) {
    super(message);
    this.name = 'RedactionQuarantineError';
    this.code = 'ERR_REDACTION_QUARANTINE';
    this.details = details;
  }
}

export function redactSecretText(value, { knownSecrets = [], placeholder = REDACTION_PLACEHOLDER } = {}) {
  let text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  let count = 0;
  for (const secret of knownSecrets.filter(Boolean).map(String)) {
    const before = text;
    text = text.split(secret).join(placeholder);
    if (before !== text) count += before.split(secret).length - 1;
  }
  for (const pattern of SECRET_LEAKAGE_PATTERNS) {
    pattern.lastIndex = 0;
    text = text.replace(pattern, (match, key) => {
      count += 1;
      if (key && /token|password|secret|credential|api[_-]?key/i.test(key)) return `${key}=${placeholder}`;
      if (/^Bearer\s+/i.test(match)) return `Bearer ${placeholder}`;
      return placeholder;
    });
  }
  return Object.freeze({ text, count, clean: count === 0 });
}

export function redactSurface({ surface, payload, knownSecrets = [] } = {}) {
  assertSurface(surface);
  const redacted = redactSecretText(payload, { knownSecrets });
  return deepFreezeRedaction({ surface, payload: parseIfJsonLike(redacted.text, payload), redactedText: redacted.text, redactedCount: redacted.count, clean: redacted.clean });
}

export function redactEndToEnd({ stdout = '', stderr = '', sse = [], audit = [], artifacts = [], diff = '', knownSecrets = [] } = {}) {
  const surfaces = {
    stdout: redactSurface({ surface: 'stdout', payload: stdout, knownSecrets }),
    stderr: redactSurface({ surface: 'stderr', payload: stderr, knownSecrets }),
    sse: redactSurface({ surface: 'sse', payload: sse, knownSecrets }),
    audit: redactSurface({ surface: 'audit', payload: audit, knownSecrets }),
    artifact: redactSurface({ surface: 'artifact', payload: artifacts, knownSecrets }),
    diff: redactSurface({ surface: 'diff', payload: diff, knownSecrets })
  };
  const totalRedactions = Object.values(surfaces).reduce((sum, item) => sum + item.redactedCount, 0);
  return deepFreezeRedaction({ surfaces, totalRedactions, clean: totalRedactions === 0 });
}

export function detectSecretLeak(value, { knownSecrets = [] } = {}) {
  const redacted = redactSecretText(value, { knownSecrets });
  return deepFreezeRedaction({ leaked: redacted.count > 0, count: redacted.count, redactedText: redacted.text, hash: sha256(Buffer.from(String(typeof value === 'string' ? value : JSON.stringify(value ?? null)), 'utf8')) });
}

export function quarantineLeakedArtifact({ artifactPath, quarantineRoot, runId, stepId, knownSecrets = [], createdAt = new Date().toISOString() } = {}) {
  if (!artifactPath || !quarantineRoot || !runId || !stepId) throw new RedactionQuarantineError('artifactPath, quarantineRoot, runId and stepId are required.');
  const resolvedArtifact = resolve(artifactPath);
  if (!existsSync(resolvedArtifact)) throw new RedactionQuarantineError('Cannot quarantine missing artifact.', { artifactPath: resolvedArtifact });
  const originalContent = readFileSync(resolvedArtifact, 'utf8');
  const leak = detectSecretLeak(originalContent, { knownSecrets });
  if (!leak.leaked) return deepFreezeRedaction({ quarantined: false, artifactPath: resolvedArtifact, reason: 'no-secret-leak' });
  const root = resolve(quarantineRoot);
  mkdirSync(root, { recursive: true });
  const quarantinePath = join(root, `${runId}-${stepId}-${basename(resolvedArtifact)}.quarantine`);
  renameSync(resolvedArtifact, quarantinePath);
  const redactedPath = `${resolvedArtifact}.redacted`;
  writeFileSync(redactedPath, `${leak.redactedText}\n`, 'utf8');
  const event = createSecurityEvent({ runId, stepId, artifactPath: resolvedArtifact, quarantinePath, redactedPath, leakCount: leak.count, createdAt });
  return deepFreezeRedaction({ quarantined: true, artifactPath: resolvedArtifact, quarantinePath, redactedPath, event, stepAction: 'stop-step' });
}

export function createSecurityEvent({ runId, stepId, artifactPath, quarantinePath, redactedPath, leakCount, createdAt = new Date().toISOString() } = {}) {
  if (!runId || !stepId || !artifactPath || !quarantinePath || !redactedPath || !Number.isInteger(leakCount)) {
    throw new RedactionQuarantineError('Security event requires run, step, paths and leakCount.');
  }
  return deepFreezeRedaction({
    type: QUARANTINE_EVENT_TYPE,
    severity: 'security',
    runId,
    stepId,
    payloadRedacted: { artifactPath, quarantinePath, redactedPath, leakCount, action: 'step-stopped-artifact-quarantined' },
    createdAt
  });
}

export function assertNoSecretLeakage(value, options = {}) {
  const leak = detectSecretLeak(value, options);
  if (leak.leaked) throw new RedactionQuarantineError('Secret leakage detected.', { count: leak.count, redactedText: leak.redactedText });
  return true;
}

export function runSecretLeakageCorpus({ corpus = [], knownSecrets = [] } = {}) {
  if (!Array.isArray(corpus)) throw new RedactionQuarantineError('Leakage corpus must be an array.');
  const results = corpus.map((sample, index) => {
    const redacted = redactSecretText(sample.input, { knownSecrets: [...knownSecrets, ...(sample.knownSecrets ?? [])] });
    const passed = redacted.count >= (sample.minRedactions ?? 1) && !containsAnySecret(redacted.text, [sample.expectedAbsent, ...(sample.knownSecrets ?? [])]);
    return { index, name: sample.name ?? `sample-${index}`, passed, redactedCount: redacted.count, redactedText: redacted.text };
  });
  return deepFreezeRedaction({ passed: results.every((result) => result.passed), results });
}

function containsAnySecret(text, values) {
  return values.filter(Boolean).some((value) => text.includes(String(value)));
}

function assertSurface(surface) {
  if (!REDACTION_SURFACES.includes(surface)) throw new RedactionQuarantineError('Unknown redaction surface.', { surface });
  return true;
}

function parseIfJsonLike(text, original) {
  if (typeof original === 'string') return text;
  try { return JSON.parse(text); } catch { return text; }
}

function deepFreezeRedaction(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeRedaction(child);
  return Object.freeze(value);
}
