import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  QUARANTINE_EVENT_TYPE,
  REDACTION_PLACEHOLDER,
  REDACTION_SURFACES,
  RedactionQuarantineError,
  assertNoSecretLeakage,
  detectSecretLeak,
  quarantineLeakedArtifact,
  redactEndToEnd,
  redactSecretText,
  redactSurface,
  runSecretLeakageCorpus
} from '../packages/orchestrator/src/index.js';

const known = ['known', 'secret', 'value', '12345'].join('-');
const providerKey = ['sk', 'test', 'secret'].join('-');
const bearerValue = 'abcdefghijklmnopqrstuvwxyz';
const bearerHeader = ['Bearer', bearerValue].join(' ');
const githubToken = `ghp_${bearerValue}`;
const passwordAssignment = ['password', 'hunter2'].join('=');
const tokenAssignment = `token=${known}`;
const corpus = [
  { name: 'stdout-openai', input: `stdout ${providerKey}`, expectedAbsent: providerKey },
  { name: 'stderr-bearer', input: `stderr ${bearerHeader}`, expectedAbsent: bearerValue },
  { name: 'audit-token', input: { token: known }, knownSecrets: [known], expectedAbsent: known },
  { name: 'diff-github', input: `+${githubToken}`, expectedAbsent: githubToken },
  { name: 'sse-password', input: `data: ${passwordAssignment}`, expectedAbsent: 'hunter2' }
];
const corpusResult = runSecretLeakageCorpus({ corpus, knownSecrets: [known] });
assert.equal(corpusResult.passed, true);
assert.equal(corpusResult.results.length, corpus.length);

const endToEnd = redactEndToEnd({
  stdout: providerKey,
  stderr: bearerHeader,
  sse: [{ data: tokenAssignment }],
  audit: [{ metadata: { api_key: known } }],
  artifacts: [passwordAssignment],
  diff: `+${githubToken}`,
  knownSecrets: [known]
});
assert.deepEqual(Object.keys(endToEnd.surfaces).sort(), [...REDACTION_SURFACES].sort());
assert.equal(endToEnd.clean, false);
assert.equal(JSON.stringify(endToEnd).includes(known), false);
assert.equal(JSON.stringify(endToEnd).includes('hunter2'), false);
assert.equal(redactSecretText(`x ${known}`, { knownSecrets: [known] }).text.includes(REDACTION_PLACEHOLDER), true);
assert.equal(redactSurface({ surface: 'stdout', payload: tokenAssignment, knownSecrets: [known] }).redactedText.includes(known), false);

const leak = detectSecretLeak('safe text');
assert.equal(leak.leaked, false);
assert.equal(assertNoSecretLeakage('safe text'), true);
assert.throws(() => assertNoSecretLeakage(bearerHeader), RedactionQuarantineError);

const temp = mkdtempSync(join(tmpdir(), 'londi-quarantine-'));
try {
  const artifact = join(temp, 'artifact.log');
  writeFileSync(artifact, `log ${known}\n`, 'utf8');
  const quarantine = quarantineLeakedArtifact({ artifactPath: artifact, quarantineRoot: join(temp, 'quarantine'), runId: 'run-1', stepId: 'step-1', knownSecrets: [known], createdAt: '2026-01-01T00:00:00.000Z' });
  assert.equal(quarantine.quarantined, true);
  assert.equal(quarantine.stepAction, 'stop-step');
  assert.equal(quarantine.event.type, QUARANTINE_EVENT_TYPE);
  assert.equal(quarantine.event.payloadRedacted.leakCount > 0, true);
  assert.equal(existsSync(quarantine.quarantinePath), true);
  assert.equal(existsSync(artifact), false);
  assert.equal(existsSync(quarantine.redactedPath), true);
  assert.equal(readFileSync(quarantine.redactedPath, 'utf8').includes(known), false);

  const cleanArtifact = join(temp, 'clean.log');
  writeFileSync(cleanArtifact, 'safe\n', 'utf8');
  assert.equal(quarantineLeakedArtifact({ artifactPath: cleanArtifact, quarantineRoot: join(temp, 'q'), runId: 'run-1', stepId: 'step-2' }).quarantined, false);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log('Redaction quarantine tests OK');
