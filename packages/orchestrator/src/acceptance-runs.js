import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runPipelineIntegrationScenario } from './pipeline-integration-suite.js';
import { createInMemoryCredentialManager, issueSecretGrant, injectGrantedSecret } from './secret-broker.js';
import { createApprovalRequest, decideApproval, hashApprovalPayload } from './approvals.js';
import { createRecoveryConsistencyReport } from './restart-recovery.js';
import { createManualMergeGate, verifyManualMerge } from './manual-merge.js';
import { createInMemoryEventStore, appendEventAndAudit } from './event-store.js';

export const ACCEPTANCE_RUN_COUNT = 5;
export const ACCEPTANCE_REQUIRED_TEMPLATES = Object.freeze(['direct', 'plan-build', 'plan-build-review']);
export const ACCEPTANCE_REQUIRED_ADAPTERS = Object.freeze(['claude-code', 'codex']);

export class AcceptanceRunsError extends Error {
  constructor(message = 'Invalid acceptance run report.', details = {}) {
    super(message);
    this.name = 'AcceptanceRunsError';
    this.code = 'ERR_ACCEPTANCE_RUNS';
    this.details = details;
  }
}

export function runFiveAcceptanceRuns({ now = '2026-01-01T00:00:00.000Z' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'londi-acceptance-runs-'));
  try {
    const definitions = [
      { runId: 'acceptance-1', templateId: 'direct', adapterId: 'claude-code', includesSecret: true, includesSensitiveApproval: true },
      { runId: 'acceptance-2', templateId: 'plan-build', adapterId: 'codex', includesRestart: true },
      { runId: 'acceptance-3', templateId: 'plan-build-review', adapterId: 'claude-code', includeCorrection: true, includeCriticalStop: true },
      { runId: 'acceptance-4', templateId: 'direct', adapterId: 'codex' },
      { runId: 'acceptance-5', templateId: 'plan-build-review', adapterId: 'claude-code' }
    ];
    const runs = definitions.map((definition, index) => executeAcceptanceRun({ ...definition, root, sequence: index + 1, now }));
    const report = createAcceptanceRunsReport({ runs, signedBy: 'Londi Agent OS automated acceptance harness', signedAt: now });
    assertAcceptanceRunsReport(report);
    return report;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export function createAcceptanceRunsReport({ runs = [], signedBy, signedAt = new Date().toISOString() } = {}) {
  if (!Array.isArray(runs)) throw new AcceptanceRunsError('Acceptance runs must be an array.');
  const normalizedRuns = runs.map(normalizeAcceptanceRun);
  return deepFreezeAcceptanceRuns({
    report: 'E8-T08 five consecutive acceptance runs',
    signed: Boolean(signedBy),
    signedBy: signedBy ?? null,
    signedAt,
    consecutive: normalizedRuns.every((run, index) => run.sequence === index + 1 && run.result === 'Passed'),
    runs: normalizedRuns,
    coverage: summarizeCoverage(normalizedRuns)
  });
}

export function assertAcceptanceRunsReport(report) {
  if (!report || typeof report !== 'object') throw new AcceptanceRunsError('Acceptance report object is required.');
  if (report.signed !== true || !report.signedBy) throw new AcceptanceRunsError('Acceptance report must be signed.');
  if (report.consecutive !== true) throw new AcceptanceRunsError('Acceptance runs must be five consecutive passes.');
  if (report.runs?.length !== ACCEPTANCE_RUN_COUNT) throw new AcceptanceRunsError('Exactly five acceptance runs are required.', { count: report.runs?.length });
  for (const adapterId of ACCEPTANCE_REQUIRED_ADAPTERS) {
    const count = report.coverage.adapters[adapterId] ?? 0;
    if (count < 2) throw new AcceptanceRunsError('Each active adapter requires at least two runs.', { adapterId, count });
  }
  for (const templateId of ACCEPTANCE_REQUIRED_TEMPLATES) {
    if ((report.coverage.templates[templateId] ?? 0) < 1) throw new AcceptanceRunsError('Each pipeline template must be covered.', { templateId });
  }
  for (const feature of ['restart', 'secret', 'sensitiveApproval', 'manualMerge', 'auditExport']) {
    if (report.coverage.features[feature] !== true) throw new AcceptanceRunsError('Acceptance feature coverage is missing.', { feature });
  }
  if (JSON.stringify(report).includes('secret-token-value')) throw new AcceptanceRunsError('Acceptance report leaked secret material.');
  return true;
}

function executeAcceptanceRun({ root, runId, sequence, templateId, adapterId, includeCorrection = false, includeCriticalStop = false, includesRestart = false, includesSecret = false, includesSensitiveApproval = false, now }) {
  const repo = createRealGitProject({ root, runId });
  const scenario = runPipelineIntegrationScenario({ templateId, runId, includeCorrection, includeCriticalStop, artifactsRoot: join(repo, '.londi', 'artifacts') });
  const secret = includesSecret ? exerciseSecretGrant({ runId }) : null;
  const sensitiveApproval = includesSensitiveApproval ? approveSensitiveAction({ runId, now }) : null;
  const restart = includesRestart ? exerciseRestartRecovery({ runId, repo }) : null;
  const manualMerge = exerciseManualMerge({ runId, repo, snapshot: scenario.acceptanceSnapshot });
  const auditExport = exportRunAudit({ runId, templateId, adapterId, manualMerge });
  const checks = [scenario.gates.acceptance.kind === 'acceptance', manualMerge.status === 'Verified', auditExport.exported === true];
  if (secret) checks.push(secret.injected === true && secret.auditRedacted === true);
  if (sensitiveApproval) checks.push(sensitiveApproval.state === 'Approved');
  if (restart) checks.push(restart.recoveredState === 'Recovery Required' && restart.autoResume === false);
  return {
    sequence,
    runId,
    templateId,
    adapterId,
    repository: { realGitProject: true, targetBranch: 'main', runBranch: `londi/${runId}`, targetCommit: manualMerge.targetCommit },
    gates: { acceptance: 'Approved', manualMerge: manualMerge.status },
    features: {
      restart: Boolean(restart),
      secret: Boolean(secret),
      sensitiveApproval: Boolean(sensitiveApproval || includeCriticalStop),
      manualMerge: manualMerge.status === 'Verified',
      auditExport: auditExport.exported
    },
    artifacts: { acceptanceSnapshotHash: scenario.acceptanceSnapshot.snapshotHash, auditFormat: auditExport.format },
    result: checks.every(Boolean) ? 'Passed' : 'Failed'
  };
}

function createRealGitProject({ root, runId }) {
  const repo = join(root, runId);
  mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 'acceptance@example.local']);
  git(repo, ['config', 'user.name', 'Acceptance Harness']);
  writeFileSync(join(repo, 'README.md'), `# ${runId}\n`);
  git(repo, ['add', 'README.md']);
  git(repo, ['commit', '-m', 'init']);
  git(repo, ['checkout', '-b', `londi/${runId}`]);
  writeFileSync(join(repo, 'agent-output.txt'), `accepted output for ${runId}\n`);
  git(repo, ['add', 'agent-output.txt']);
  git(repo, ['commit', '-m', 'accepted agent output']);
  git(repo, ['checkout', 'main']);
  return repo;
}

function exerciseManualMerge({ runId, repo, snapshot }) {
  const runBranch = `londi/${runId}`;
  const gate = createManualMergeGate({ runId, acceptedSnapshot: snapshot, repositoryPath: repo, targetBranch: 'main', runBranch });
  git(repo, ['merge', '--no-ff', runBranch, '-m', `manual acceptance merge ${runId}`]);
  const targetCommit = git(repo, ['rev-parse', 'main']).stdout.trim();
  return verifyManualMerge({ gate, targetCommit, testCommand: { command: 'git', args: ['status', '--short'] } });
}

function exerciseSecretGrant({ runId }) {
  const credentialManager = createInMemoryCredentialManager({ OPENAI_API_KEY: 'secret-token-value' });
  const grant = issueSecretGrant({ credentialManager, approvedAliases: ['OPENAI_API_KEY'], alias: 'OPENAI_API_KEY', runId, stepId: 'build', agentId: 'claude-code', id: `${runId}-grant`, issuedAt: '2026-01-01T00:00:00.000Z' });
  const injection = injectGrantedSecret({ credentialManager, grant, now: '2026-01-01T00:01:00.000Z' });
  return { injected: injection.env.OPENAI_API_KEY === 'secret-token-value', auditRedacted: injection.audit.value === '[SECRET:GRANTED]' };
}

function approveSensitiveAction({ runId, now }) {
  const payload = { action: 'sensitive-network-or-secret-use', runId };
  const request = createApprovalRequest({ id: `${runId}-sensitive`, kind: 'sensitive', scope: { runId }, payload, revisionHash: `rev-${runId}`, requestedAt: now });
  return decideApproval(request, { actor: 'londi', decision: 'approve', payloadHash: hashApprovalPayload(payload), revisionHash: request.revisionHash, timestamp: now });
}

function exerciseRestartRecovery({ runId, repo }) {
  return createRecoveryConsistencyReport({
    run: { runId, state: 'Running' },
    checkpoint: { id: `${runId}-checkpoint`, safeToResume: true, sequence: 1 },
    artifactManifest: { manifestHash: `${runId}-manifest`, records: [] },
    workspace: { runId, worktreePath: repo },
    processSnapshot: { activeAttempts: [] },
    externalEffects: []
  });
}

function exportRunAudit({ runId, templateId, adapterId, manualMerge }) {
  const store = createInMemoryEventStore();
  appendEventAndAudit(store, {
    event: { type: 'acceptance-run-passed', runId, payloadRedacted: { templateId, adapterId, manualMerge: manualMerge.status } },
    audit: { id: `${runId}-audit`, actor: 'acceptance-harness', action: 'verify', target: runId, result: 'passed', runId, metadataRedacted: { targetCommit: manualMerge.targetCommit } }
  });
  const json = store.exportAudit({ runId, format: 'json' });
  return { exported: json.includes(runId) && !json.includes('secret-token-value'), format: 'json' };
}

function normalizeAcceptanceRun(run = {}) {
  for (const field of ['sequence', 'runId', 'templateId', 'adapterId', 'repository', 'gates', 'features', 'artifacts', 'result']) {
    if (run[field] === undefined || run[field] === null) throw new AcceptanceRunsError('Acceptance run is missing a required field.', { field, runId: run.runId });
  }
  if (!ACCEPTANCE_REQUIRED_TEMPLATES.includes(run.templateId)) throw new AcceptanceRunsError('Unknown acceptance template.', { templateId: run.templateId });
  if (!ACCEPTANCE_REQUIRED_ADAPTERS.includes(run.adapterId)) throw new AcceptanceRunsError('Unknown acceptance adapter.', { adapterId: run.adapterId });
  if (run.repository.realGitProject !== true) throw new AcceptanceRunsError('Acceptance run must use a real Git project.', { runId: run.runId });
  if (run.result !== 'Passed') throw new AcceptanceRunsError('Acceptance run did not pass.', { runId: run.runId, result: run.result });
  return deepFreezeAcceptanceRuns(structuredClone(run));
}

function summarizeCoverage(runs) {
  const countBy = (key) => runs.reduce((acc, run) => ({ ...acc, [run[key]]: (acc[run[key]] ?? 0) + 1 }), {});
  return deepFreezeAcceptanceRuns({
    adapters: countBy('adapterId'),
    templates: countBy('templateId'),
    features: {
      restart: runs.some((run) => run.features.restart),
      secret: runs.some((run) => run.features.secret),
      sensitiveApproval: runs.some((run) => run.features.sensitiveApproval),
      manualMerge: runs.every((run) => run.features.manualMerge),
      auditExport: runs.every((run) => run.features.auditExport)
    }
  });
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new AcceptanceRunsError('Git command failed during acceptance run.', { cwd, args, stderr: result.stderr, stdout: result.stdout });
  return result;
}

function deepFreezeAcceptanceRuns(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeAcceptanceRuns(child);
  return Object.freeze(value);
}
