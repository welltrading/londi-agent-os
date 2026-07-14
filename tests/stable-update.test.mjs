import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COMPATIBILITY_MANIFEST } from '@londi-agent-os/contracts';
import {
  StableUpdateError,
  assertUpdateBlockedWithActiveRuns,
  atomicSwitchUpdate,
  createPreUpdateSnapshot,
  createStableUpdatePlan,
  createWeeklyUpdateCheck,
  installSideBySide,
  rollbackStableUpdate,
  runUpdateSmokeTests,
  verifyStableVersions
} from '../packages/orchestrator/src/index.js';

const root = mkdtempSync(join(tmpdir(), 'londi-update-'));
try {
  const installRoot = join(root, 'install');
  const sourceRoot = join(root, 'source');
  const backupRoot = join(root, 'backups');
  mkdirSync(join(sourceRoot, 'config'), { recursive: true });
  mkdirSync(join(installRoot, 'releases', '0.0.0-mvp'), { recursive: true });
  writeFileSync(join(sourceRoot, 'londi.sqlite'), 'db');
  writeFileSync(join(sourceRoot, 'config', 'local.json'), '{"safe":true}\n');
  writeFileSync(join(installRoot, 'current'), '{"version":"0.0.0-mvp"}\n');

  const check = createWeeklyUpdateCheck({ currentVersion: '0.0.0-mvp', latestVersion: '0.0.1', checkedAt: '2026-07-14T00:00:00.000Z' });
  assert.equal(check.cadence, 'weekly');
  assert.equal(check.updateAvailable, true);

  const blocked = createStableUpdatePlan({ updateCheck: check, installRoot, activeRuns: [{ runId: 'run-active' }], compatibilityManifest: COMPATIBILITY_MANIFEST });
  assert.equal(blocked.state, 'Blocked');
  assert.equal(assertUpdateBlockedWithActiveRuns(blocked), true);

  const noUpdate = createStableUpdatePlan({ updateCheck: createWeeklyUpdateCheck({ currentVersion: '0.0.1', latestVersion: '0.0.1' }), installRoot, compatibilityManifest: COMPATIBILITY_MANIFEST });
  assert.equal(noUpdate.blockedReasons.includes('no-update-available'), true);

  const plan = createStableUpdatePlan({ updateCheck: check, installRoot, activeRuns: [], compatibilityManifest: COMPATIBILITY_MANIFEST, healthyVersions: ['0.0.0-mvp'] });
  assert.equal(plan.state, 'Planned');
  const snapshot = createPreUpdateSnapshot({ plan, sourceRoot, backupRoot, databasePath: join(sourceRoot, 'londi.sqlite'), configPath: join(sourceRoot, 'config', 'local.json'), now: '2026-07-14T00:01:00.000Z' });
  assert.equal(snapshot.integrity.verified, true);

  const installation = installSideBySide({
    plan,
    releaseFiles: [
      { relativePath: 'package.json', content: '{"version":"0.0.1"}\n' },
      { relativePath: 'README.md', content: '# release 0.0.1\n' }
    ],
    now: '2026-07-14T00:02:00.000Z'
  });
  assert.equal(installation.state, 'Installed Side By Side');
  assert.equal(existsSync(join(installRoot, 'releases', '0.0.1', 'package.json')), true);

  const failedSmoke = runUpdateSmokeTests({ installation, smokeTests: [{ id: 'fail', passed: false }] });
  assert.equal(failedSmoke.passed, false);
  assert.throws(() => atomicSwitchUpdate({ plan, installation, smokeResult: failedSmoke }), StableUpdateError);
  const smoke = runUpdateSmokeTests({ installation, smokeTests: [{ id: 'manifest', run: () => true }] });
  assert.equal(smoke.passed, true);
  const switched = atomicSwitchUpdate({ plan, installation, smokeResult: smoke, now: '2026-07-14T00:03:00.000Z' });
  assert.equal(switched.state, 'Switched');

  mkdirSync(join(installRoot, 'releases', '0.0.0-mvp'), { recursive: true });
  const versions = verifyStableVersions({ installRoot, expectedVersions: ['0.0.0-mvp', '0.0.1'] });
  assert.equal(versions.healthy, true);
  assert.equal(versions.healthyCount, 2);

  const rollback = rollbackStableUpdate({ plan, snapshot, now: '2026-07-14T00:04:00.000Z' });
  assert.equal(rollback.state, 'Rolled Back');
  assert.equal(existsSync(plan.sideBySidePath), false);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('Stable update tests OK');
