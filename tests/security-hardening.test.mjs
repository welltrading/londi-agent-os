import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  SECURITY_ALLOWED_LOCAL_BIND,
  SECURITY_REQUIRED_TOKEN_BITS,
  createFinalLeakageScanReport,
  evaluateDependencyScan,
  runFinalSecurityHardening,
  runSecurityAcceptanceSuite,
  scanSecretCorpus,
  validateLocalSecurityPosture
} from '../packages/orchestrator/src/index.js';

const tokenBytes = SECURITY_REQUIRED_TOKEN_BITS / 8;
const health = {
  security: {
    bind: SECURITY_ALLOWED_LOCAL_BIND,
    allowedOrigin: 'http://127.0.0.1:3211',
    requestLimitBytes: 1_048_576,
    credentialSource: 'windows-credential-manager',
    tokenBytes
  }
};

const posture = validateLocalSecurityPosture({ health, allowedOrigin: 'http://127.0.0.1:3211' });
assert.equal(posture.passed, true);
assert.equal(posture.checks.length, 5);
assert.equal(validateLocalSecurityPosture({ health: { security: { ...health.security, bind: '0.0.0.0' } }, allowedOrigin: 'http://127.0.0.1:3211' }).passed, false);
assert.equal(validateLocalSecurityPosture({ health: { security: { ...health.security, allowedOrigin: '*' } }, allowedOrigin: 'http://127.0.0.1:3211' }).passed, false);

const root = mkdtempSync(join(tmpdir(), 'londi-hardening-'));
try {
  writeFileSync(join(root, 'safe.md'), '# safe\nNo credentials here.\n');
  const cleanCorpus = scanSecretCorpus({ root, knownSecrets: ['known-super-secret-value'] });
  assert.equal(cleanCorpus.passed, true);
  writeFileSync(join(root, 'leak.txt'), 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz1234567890');
  const dirtyCorpus = scanSecretCorpus({ root, knownSecrets: ['known-super-secret-value'] });
  assert.equal(dirtyCorpus.passed, false);
  assert.equal(dirtyCorpus.findings[0].severity, 'Critical');
  rmSync(join(root, 'leak.txt'), { force: true });

  // Source hygiene must read HTML too: the runtime dashboard entrypoint is served verbatim to the
  // browser, so a bearer token embedded there ships to every viewer.
  const hygieneRoot = mkdtempSync(join(tmpdir(), 'londi-hygiene-html-'));
  try {
    const hygieneScript = resolve('scripts/check-source-hygiene.mjs');
    writeFileSync(join(hygieneRoot, 'clean.html'), '<script>const INJECTED = "%%LONDI_LOCAL_API_TOKEN%%";</script>');
    assert.equal(spawnSync(process.execPath, [hygieneScript], { cwd: hygieneRoot, encoding: 'utf8' }).status, 0);

    writeFileSync(join(hygieneRoot, 'leaky.html'), `<script>const LOCAL_DEV_TOKEN = '${'a'.repeat(43)}';</script>`);
    const leaky = spawnSync(process.execPath, [hygieneScript], { cwd: hygieneRoot, encoding: 'utf8' });
    assert.notEqual(leaky.status, 0, 'hygiene must fail on a hard-coded bearer token in HTML');
    assert.match(leaky.stderr, /hard-coded bearer token in HTML/);
  } finally {
    rmSync(hygieneRoot, { recursive: true, force: true });
  }

  const dependencyScan = evaluateDependencyScan({ packageLock: { lockfileVersion: 3, packages: {} }, npmAudit: { vulnerabilities: {} } });
  assert.equal(dependencyScan.passed, true);
  assert.equal(evaluateDependencyScan({ packageLock: { lockfileVersion: 3 }, npmAudit: { vulnerabilities: { bad: { severity: 'critical' } } } }).passed, false);
  assert.equal(evaluateDependencyScan({ packageLock: null, npmAudit: { vulnerabilities: {} } }).passed, false);

  const threatReport = runSecurityAcceptanceSuite({ knownSecrets: ['known-super-secret-value'], now: '2026-07-14T00:00:00.000Z' });
  const finalReport = createFinalLeakageScanReport({
    threatReport,
    dependencyScan,
    localSecurity: posture,
    secretCorpus: cleanCorpus,
    generatedAt: '2026-07-14T00:01:00.000Z'
  });
  assert.equal(finalReport.passed, true);
  assert.equal(finalReport.blockingOpen.length, 0);
  assert.equal(finalReport.checks.find((check) => check.id === 'dependency-scan').passed, true);

  const full = runFinalSecurityHardening({
    root,
    health,
    allowedOrigin: 'http://127.0.0.1:3211',
    knownSecrets: ['known-super-secret-value'],
    packageLock: { lockfileVersion: 3, packages: {} },
    npmAudit: { vulnerabilities: {} },
    now: '2026-07-14T00:02:00.000Z'
  });
  assert.equal(full.passed, true);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('Security hardening tests OK');
