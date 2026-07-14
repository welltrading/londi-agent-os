import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  PREFLIGHT_MIN_FREE_BYTES,
  PreflightEngineError,
  assertPreflightCanStart,
  createInMemoryCredentialManager,
  createInMemoryWorkspaceLockStore,
  createNetworkAllowlist,
  createNetworkGrant,
  createPreflightCheck,
  runFullPreflight,
  summarizePreflightStatus,
  createServiceAccountIsolationPolicy
} from '../packages/orchestrator/src/index.js';

const temp = mkdtempSync(join(tmpdir(), 'londi-preflight-'));
try {
  spawnSync('git', ['init'], { cwd: temp, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: temp, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: temp, encoding: 'utf8' });
  spawnSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: temp, encoding: 'utf8' });

  const runId = 'run-preflight-1';
  const lockStore = createInMemoryWorkspaceLockStore();
  const policy = createServiceAccountIsolationPolicy({ worktreePath: join(temp, 'worktree'), runArtifactsPath: join(temp, 'artifacts'), deniedRoots: [temp] });
  const grant = createNetworkGrant({ id: 'net-1', hostname: 'api.github.com', purpose: 'create-pr', runId, stepId: 'step-1', agentId: 'agent-1', approvedAt: '2026-01-01T00:00:00.000Z' });
  const ready = runFullPreflight({
    repositoryPath: temp,
    targetBranch: 'master',
    runId,
    lockStore,
    adapters: [{ adapterId: 'claude-code', healthy: true }],
    runtime: { nodeOk: true, gitOk: true, osOk: true },
    aclPolicy: policy,
    disk: { freeBytes: PREFLIGHT_MIN_FREE_BYTES, repositoryBytes: 1000 },
    contextSnapshot: { snapshotId: 'ctx-1', readOnly: true },
    secretAliases: ['OPENAI_API_KEY'],
    credentialManager: createInMemoryCredentialManager({ OPENAI_API_KEY: 'value' }),
    networkRequests: [{ hostname: 'api.github.com', purpose: 'create-pr', stepId: 'step-1', agentId: 'agent-1', now: '2026-01-01T00:10:00.000Z' }],
    networkAllowlist: createNetworkAllowlist({ grants: [grant] }),
    maintenance: { active: false },
    dependencyPolicy: { decision: 'allowed', reason: 'existing-lockfile-unchanged' },
    cache: { cachePath: './data/tool-cache' }
  });
  assert.equal(ready.status, 'Ready');
  assert.equal(assertPreflightCanStart(ready), true);
  assert.equal(ready.checks.some((check) => check.name === 'disk.capacity'), true);

  const warning = runFullPreflight({
    repositoryPath: temp,
    targetBranch: 'master',
    runId: 'run-preflight-2',
    adapters: [{ adapterId: 'codex', healthy: true }],
    runtime: { nodeOk: true, gitOk: true, osOk: true },
    aclPolicy: policy,
    disk: { freeBytes: PREFLIGHT_MIN_FREE_BYTES, repositoryBytes: 1000 },
    contextSnapshot: null,
    maintenance: { scheduled: true },
    dependencyPolicy: { decision: 'requires_approval', reason: 'new-package-or-lockfile-changed', added: ['new-tool'] }
  });
  assert.equal(warning.status, 'Ready with Warnings');
  assert.equal(warning.overrideAllowed, true);
  assert.throws(() => assertPreflightCanStart(warning), PreflightEngineError);
  assert.equal(assertPreflightCanStart(warning, { overrideWarnings: true }), true);

  const blocked = runFullPreflight({
    repositoryPath: temp,
    targetBranch: 'master',
    runId: 'run-preflight-3',
    adapters: [{ adapterId: 'codex', healthy: false }],
    runtime: { nodeOk: true, gitOk: true, osOk: true },
    aclPolicy: policy,
    disk: { freeBytes: PREFLIGHT_MIN_FREE_BYTES - 1, repositoryBytes: 1000 },
    contextSnapshot: { snapshotId: 'ctx-1', readOnly: true },
    networkRequests: [{ hostname: 'exfil.example.com', purpose: 'upload', stepId: 'step-1', agentId: 'agent-1' }],
    networkAllowlist: createNetworkAllowlist({ grants: [] }),
    dependencyPolicy: { decision: 'blocked', reason: 'untrusted-source', untrusted: [{ name: 'evil' }] },
    cache: { cachePath: './data/tool-cache', writeAttempted: true }
  });
  assert.equal(blocked.status, 'Blocked');
  assert.throws(() => assertPreflightCanStart(blocked), PreflightEngineError);
  assert.equal(blocked.checks.some((check) => check.status === 'Blocked'), true);

  assert.equal(summarizePreflightStatus([createPreflightCheck({ name: 'x', status: 'Ready' })]), 'Ready');
  assert.equal(summarizePreflightStatus([createPreflightCheck({ name: 'x', status: 'Warning', overrideable: true })]), 'Ready with Warnings');
  assert.throws(() => createPreflightCheck({ name: 'bad', status: 'Blocked', overrideable: true }), PreflightEngineError);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log('Preflight engine tests OK');
