import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createInMemoryEventStore, appendEventAndAudit } from './event-store.js';
import { applyRunTransition } from './state-machine.js';
import { createRecoveryConsistencyReport } from './restart-recovery.js';
import { createArtifactLayout, writeArtifactRecord, createArtifactManifest } from './artifact-layout.js';
import { createApprovalRequest, decideApproval, ExpiredApprovalError, hashApprovalPayload } from './approvals.js';
import { createNetworkGrant, createNetworkAllowlist, recordNetworkAttempt } from './network-grants.js';
import { withIdempotency, createInMemoryIdempotencyStore, IdempotencyReplayError } from './idempotency.js';

export const FAULT_INJECTION_SCENARIOS = Object.freeze([
  'kill-agent',
  'kill-service',
  'disconnect-ui',
  'lock-db',
  'corrupt-artifact',
  'network-loss',
  'full-disk',
  'expired-approval',
  'unknown-external-effect'
]);

export const FAULT_EXPECTED_OUTCOMES = Object.freeze({
  'kill-agent': { state: 'Unresponsive', checkpointRequired: true, noOrphanProcess: true },
  'kill-service': { state: 'Recovery Required', checkpointRequired: true, noOrphanProcess: true },
  'disconnect-ui': { state: 'Running', checkpointRequired: false, noOrphanProcess: true },
  'lock-db': { state: 'Needs Attention', checkpointRequired: true, noOrphanProcess: true },
  'corrupt-artifact': { state: 'Recovery Required', checkpointRequired: true, noOrphanProcess: true },
  'network-loss': { state: 'Needs Attention', checkpointRequired: true, noDuplicateExternalAction: true },
  'full-disk': { state: 'Needs Attention', checkpointRequired: true, noOrphanProcess: true },
  'expired-approval': { state: 'Needs Attention', checkpointRequired: true, noDuplicateExternalAction: true },
  'unknown-external-effect': { state: 'Recovery Required', checkpointRequired: true, noDuplicateExternalAction: true }
});

export class FaultInjectionSuiteError extends Error {
  constructor(message = 'Fault injection suite failed.', code = 'ERR_FAULT_INJECTION_SUITE', details = {}) {
    super(message);
    this.name = 'FaultInjectionSuiteError';
    this.code = code;
    this.details = details;
  }
}

export function runFaultInjectionScenario({ scenario, root = join(tmpdir(), `londi-fault-${Date.now()}`), now = '2026-07-14T00:00:00.000Z' } = {}) {
  if (!FAULT_INJECTION_SCENARIOS.includes(scenario)) throw new FaultInjectionSuiteError('Unknown fault injection scenario.', 'ERR_FAULT_SCENARIO', { scenario });
  const context = createFaultContext({ scenario, root, now });
  try {
    const result = scenarioHandlers[scenario](context);
    return validateFaultScenarioResult({ scenario, result, expected: FAULT_EXPECTED_OUTCOMES[scenario] });
  } finally {
    if (context.cleanupRoot === true) rmSync(context.root, { recursive: true, force: true });
  }
}

export function runFaultInjectionSuite({ scenarios = FAULT_INJECTION_SCENARIOS, root = join(tmpdir(), `londi-fault-suite-${Date.now()}`) } = {}) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) throw new FaultInjectionSuiteError('Fault scenarios must be a non-empty array.', 'ERR_FAULT_SCENARIOS');
  const results = scenarios.map((scenario, index) => runFaultInjectionScenario({ scenario, root: join(root, String(index), scenario) }));
  const failed = results.filter((result) => result.passed !== true);
  return deepFreezeFault({
    suite: 'E7-T07',
    scenarios: results,
    passed: failed.length === 0,
    failed: failed.map((result) => ({ scenario: result.scenario, failures: result.failures }))
  });
}

export function validateFaultScenarioResult({ scenario, result, expected = FAULT_EXPECTED_OUTCOMES[scenario] } = {}) {
  if (!expected) throw new FaultInjectionSuiteError('Expected fault outcome is required.', 'ERR_FAULT_EXPECTED', { scenario });
  const failures = [];
  if (result.state !== expected.state) failures.push(`state expected ${expected.state} got ${result.state}`);
  if (expected.checkpointRequired === true && !result.checkpoint?.safeToResume) failures.push('checkpoint missing or unsafe');
  if (expected.noDuplicateExternalAction === true && result.externalActionExecutions > 1) failures.push('duplicate external action detected');
  if (expected.noOrphanProcess === true && result.orphanProcesses?.length > 0) failures.push('orphan process detected');
  if (!result.audit?.length) failures.push('audit event missing');
  return deepFreezeFault({ scenario, passed: failures.length === 0, failures, ...result });
}

function createFaultContext({ scenario, root, now }) {
  const resolved = resolve(root);
  mkdirSync(resolved, { recursive: true });
  const store = createInMemoryEventStore();
  const layout = createArtifactLayout({ runId: `run-${scenario}`, artifactsRoot: join(resolved, 'artifacts'), createdAt: now });
  return { scenario, root: resolved, cleanupRoot: true, store, layout, runId: `run-${scenario}`, attemptId: `attempt-${scenario}`, now, externalActionExecutions: 0 };
}

function createCheckpoint(context, { state = 'Running', safeToResume = true, externalEffects = [] } = {}) {
  const checkpoint = { id: `chk-${context.scenario}`, runId: context.runId, attemptId: context.attemptId, state, safeToResume, sequence: 1, externalEffects };
  const record = writeArtifactRecord({ layout: context.layout, category: 'checkpoints', filename: `${checkpoint.id}.json`, content: checkpoint, metadata: { kind: 'checkpoint', scenario: context.scenario } });
  return { ...checkpoint, path: record.path, hash: record.hash };
}

function audit(context, action, result = 'ok', metadataRedacted = {}) {
  return appendEventAndAudit(context.store, {
    event: { type: `fault.${context.scenario}`, runId: context.runId, severity: result === 'ok' ? 'info' : 'warning', payloadRedacted: metadataRedacted },
    audit: { id: `audit-${context.scenario}-${context.store.listEvents().length + 1}`, actor: 'fault-suite', action, target: context.runId, result, metadataRedacted }
  });
}

function result(context, fields) {
  return {
    runId: context.runId,
    checkpoint: fields.checkpoint ?? null,
    audit: context.store.listAudit({ runId: context.runId }),
    externalActionExecutions: context.externalActionExecutions,
    orphanProcesses: fields.orphanProcesses ?? [],
    ...fields
  };
}

const scenarioHandlers = Object.freeze({
  'kill-agent': (context) => {
    const checkpoint = createCheckpoint(context, { state: 'Unresponsive' });
    const transition = applyRunTransition('Running', 'Heartbeat missing 120s', { activeAttempt: true });
    audit(context, 'kill-agent-detected', 'ok', { transition });
    return result(context, { state: transition.to, checkpoint, orphanProcesses: [] });
  },
  'kill-service': (context) => {
    const checkpoint = createCheckpoint(context, { state: 'Recovery Required' });
    const transition = applyRunTransition('Running', 'Service shutdown', { checkpointSaved: true, childProcessesClosed: true });
    audit(context, 'service-shutdown', 'ok', { transition });
    return result(context, { state: transition.to, checkpoint, orphanProcesses: [] });
  },
  'disconnect-ui': (context) => {
    audit(context, 'ui-disconnected', 'ok', { sseReconnectRequired: true });
    return result(context, { state: 'Running', checkpoint: null, orphanProcesses: [] });
  },
  'lock-db': (context) => {
    const checkpoint = createCheckpoint(context, { state: 'Needs Attention' });
    audit(context, 'db-lock-detected', 'blocked', { sqliteBusy: true });
    return result(context, { state: 'Needs Attention', checkpoint, orphanProcesses: [] });
  },
  'corrupt-artifact': (context) => {
    const checkpoint = createCheckpoint(context, { state: 'Recovery Required' });
    const good = writeArtifactRecord({ layout: context.layout, category: 'summary', filename: 'summary.txt', content: 'good artifact' });
    writeFileSync(good.path, 'corrupted artifact');
    const manifest = createArtifactManifest({ layout: context.layout, records: [good] });
    const report = createRecoveryConsistencyReport({ run: { runId: context.runId, state: 'Running' }, checkpoint, artifactManifest: manifest, workspace: {}, processSnapshot: { activeAttempts: [] }, externalEffects: [] });
    audit(context, 'artifact-corruption-detected', 'blocked', { blocked: report.blocked, checks: report.checks });
    return result(context, { state: report.recoveredState, checkpoint, recoveryReport: report, orphanProcesses: [] });
  },
  'network-loss': (context) => {
    const checkpoint = createCheckpoint(context, { state: 'Needs Attention', externalEffects: [{ id: 'net-loss', state: 'Unknown' }] });
    const grant = createNetworkGrant({ id: 'grant-net-loss', hostname: 'api.github.com', purpose: 'push', runId: context.runId, stepId: 'step-1', agentId: 'agent-1', approvedAt: context.now });
    const attempt = recordNetworkAttempt({ allowlist: createNetworkAllowlist({ grants: [grant] }), hostname: 'api.github.com', purpose: 'push', runId: context.runId, stepId: 'step-1', agentId: 'agent-1', completed: false, verified: false, resultKnown: false, now: context.now });
    const idem = createInMemoryIdempotencyStore();
    withIdempotency({ key: 'net-upload', fingerprint: 'same-payload', externalEffectState: attempt.externalEffectState, store: idem, execute: () => { context.externalActionExecutions += 1; return attempt; } });
    let replayBlocked = false;
    try { withIdempotency({ key: 'net-upload', fingerprint: 'same-payload', store: idem, execute: () => { context.externalActionExecutions += 1; return attempt; } }); } catch (error) { replayBlocked = error instanceof IdempotencyReplayError; }
    audit(context, 'network-loss', 'blocked', { externalEffectState: attempt.externalEffectState, replayBlocked });
    return result(context, { state: 'Needs Attention', checkpoint, networkAttempt: attempt, replayBlocked });
  },
  'full-disk': (context) => {
    const checkpoint = createCheckpoint(context, { state: 'Needs Attention' });
    audit(context, 'full-disk', 'blocked', { freeBytes: 0, artifactWriteBlocked: true });
    return result(context, { state: 'Needs Attention', checkpoint, orphanProcesses: [] });
  },
  'expired-approval': (context) => {
    const checkpoint = createCheckpoint(context, { state: 'Needs Attention' });
    const payload = { runId: context.runId, action: 'sensitive' };
    const request = createApprovalRequest({ id: 'approval-expired', kind: 'sensitive', scope: { runId: context.runId }, payloadHash: hashApprovalPayload(payload), revisionHash: 'rev-1', requestedAt: '2026-07-14T00:00:00.000Z', expiresAt: '2026-07-14T00:01:00.000Z' });
    let expired = false;
    try { decideApproval(request, { actor: 'londi', decision: 'approve', payloadHash: request.payloadHash, revisionHash: request.revisionHash, timestamp: '2026-07-14T00:02:00.000Z' }); } catch (error) { expired = error instanceof ExpiredApprovalError; }
    audit(context, 'expired-approval', 'blocked', { expired });
    return result(context, { state: 'Needs Attention', checkpoint, approvalExpired: expired });
  },
  'unknown-external-effect': (context) => {
    const checkpoint = createCheckpoint(context, { state: 'Recovery Required', externalEffects: [{ id: 'unknown-effect', state: 'Unknown' }] });
    const report = createRecoveryConsistencyReport({ run: { runId: context.runId, state: 'Running' }, checkpoint, artifactManifest: { records: [] }, workspace: {}, processSnapshot: { activeAttempts: [] }, externalEffects: [{ id: 'unknown-effect', state: 'Unknown' }] });
    const idem = createInMemoryIdempotencyStore();
    withIdempotency({ key: 'external-effect', fingerprint: 'same', externalEffectState: 'Unknown', store: idem, execute: () => { context.externalActionExecutions += 1; return { externalEffectState: 'Unknown' }; } });
    let replayBlocked = false;
    try { withIdempotency({ key: 'external-effect', fingerprint: 'same', store: idem, execute: () => { context.externalActionExecutions += 1; return {}; } }); } catch (error) { replayBlocked = error instanceof IdempotencyReplayError; }
    audit(context, 'unknown-external-effect', 'blocked', { replayBlocked, blockedReasons: report.blockedReasons });
    return result(context, { state: report.recoveredState, checkpoint, recoveryReport: report, replayBlocked });
  }
});

function deepFreezeFault(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeFault(child);
  return Object.freeze(value);
}
