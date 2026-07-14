import { getPipelineTemplate } from '@londi-agent-os/contracts';
import {
  createPipelineApprovalGate,
  decidePipelineApprovalGate,
  hashApprovalPayload
} from './approvals.js';
import {
  createHandoffApprovalGate,
  createHandoffRevision,
  decideHandoffApprovalGate,
  markHandoffRevisionApproved
} from './handoff.js';
import { createReviewArtifact, createCriticalReviewApprovalGate } from './review.js';
import { createCorrectionCycleState, evaluateReviewForCorrection, applyCorrectionCycleDecision } from './correction-cycle.js';
import { createArtifactLayout, createArtifactManifest } from './artifact-layout.js';
import { createAcceptanceGate, createAcceptanceSnapshot } from './acceptance-gate.js';

export const PIPELINE_INTEGRATION_SCENARIOS = Object.freeze(['direct', 'plan-build', 'plan-build-review']);

export class PipelineIntegrationSuiteError extends Error {
  constructor(message = 'Pipeline integration suite failed.', details = {}) {
    super(message);
    this.name = 'PipelineIntegrationSuiteError';
    this.code = 'ERR_PIPELINE_INTEGRATION_SUITE';
    this.details = details;
  }
}

export function runPipelineIntegrationScenario({ templateId, runId = `run-${templateId}`, artifactsRoot = `/tmp/${runId}/artifacts`, includeCorrection = false, includeCriticalStop = false } = {}) {
  if (!PIPELINE_INTEGRATION_SCENARIOS.includes(templateId)) throw new PipelineIntegrationSuiteError('Unknown integration scenario.', { templateId });
  const template = getPipelineTemplate(templateId);
  const assignments = Object.fromEntries(template.roles.map((role) => [role.id, role.id === 'reviewer' ? 'codex' : 'claude-code']));
  const pipelineGate = approvePipelineGate({ runId, template, assignments });
  const events = [{ gate: 'A', state: pipelineGate.state, templateId }];
  const handoffRevisions = [];

  if (template.policies.requiresHandoff) {
    for (const step of template.steps.filter((candidate) => candidate.handoffRequired)) {
      const approvedHandoff = approveHandoff({ runId, stepId: step.id, author: step.roleId });
      handoffRevisions.push(approvedHandoff);
      events.push({ gate: 'B', stepId: step.id, state: 'Approved', hash: approvedHandoff.hash });
    }
  }

  let review = null;
  let correction = null;
  let criticalStop = null;
  if (templateId === 'plan-build-review') {
    review = createReviewArtifact({
      runId,
      reviewerAgentId: assignments.reviewer,
      builderAgentId: assignments.builder,
      createdAt: '2026-01-01T00:20:00.000Z',
      summary: includeCorrection ? 'Blocking finding requires correction.' : 'Review passed.',
      findings: includeCorrection
        ? [{ severity: 'High', evidence: 'Integration scenario detected a failing check.', requiredFix: 'Apply correction and rerun review.' }]
        : [{ severity: 'Low', evidence: 'No blocking issue.', requiredFix: 'None.' }],
      failedTests: includeCorrection ? ['integration scenario check'] : [],
      requiredFixes: includeCorrection ? ['Apply correction and rerun review.'] : []
    });
    events.push({ step: 'review', decision: review.decision, blocking: review.blocking });

    if (includeCorrection) {
      const initial = createCorrectionCycleState({ runId });
      const decision = evaluateReviewForCorrection(initial, review);
      correction = applyCorrectionCycleDecision(initial, decision);
      events.push({ correctionCycle: correction.cycleCounter, action: decision.action });
    }

    if (includeCriticalStop) {
      const criticalReview = createReviewArtifact({
        runId: `${runId}-critical`,
        reviewerAgentId: assignments.reviewer,
        builderAgentId: assignments.builder,
        createdAt: '2026-01-01T00:30:00.000Z',
        summary: 'Critical sensitive finding stops automatic execution.',
        findings: [{ severity: 'Critical', evidence: 'Sensitive action was requested.', requiredFix: 'Stop and request approval.', sensitive: true }],
        failedTests: ['critical stop'],
        requiredFixes: ['Stop and request approval.']
      });
      const criticalGate = createCriticalReviewApprovalGate({ reviewArtifact: criticalReview, requestedAt: '2026-01-01T00:31:00.000Z' });
      criticalStop = { decision: criticalReview.decision, approvalKind: criticalGate.kind, gate: criticalGate.scope.gate };
      events.push({ criticalStop: true, gate: criticalGate.scope.gate, kind: criticalGate.kind });
    }
  }

  const artifactLayout = createArtifactLayout({ runId, artifactsRoot, createdAt: '2026-01-01T00:40:00.000Z' });
  const artifactManifest = createArtifactManifest({ layout: artifactLayout, records: [], revisions: { handoff: handoffRevisions.map((revision) => ({ revision: revision.revision, hash: revision.hash })) }, createdAt: '2026-01-01T00:41:00.000Z' });
  const acceptanceSnapshot = createAcceptanceSnapshot({
    runId,
    createdAt: '2026-01-01T00:45:00.000Z',
    diff: { summary: `${templateId} integration diff`, patchHash: `${templateId}-diff` },
    tests: { status: 'passed', commands: ['internal integration scenario'] },
    review: review ? { decision: review.decision, hash: review.hash } : { decision: 'not-required' },
    risks: { items: [] },
    artifacts: { manifestHash: artifactManifest.manifestHash, records: artifactManifest.records.length }
  });
  const acceptanceGate = createAcceptanceGate({ runId, snapshot: acceptanceSnapshot, requestedAt: '2026-01-01T00:46:00.000Z' });
  events.push({ gate: 'E', kind: acceptanceGate.kind, snapshotHash: acceptanceSnapshot.snapshotHash });

  return deepFreezeIntegration({
    runId,
    templateId,
    gates: { pipeline: pipelineGate, acceptance: acceptanceGate },
    handoffRevisions,
    review,
    correction,
    criticalStop,
    artifactManifest,
    acceptanceSnapshot,
    events,
    uiRequired: false
  });
}

export function runPipelineIntegrationSuite() {
  const direct = runPipelineIntegrationScenario({ templateId: 'direct' });
  const planBuild = runPipelineIntegrationScenario({ templateId: 'plan-build' });
  const planBuildReview = runPipelineIntegrationScenario({ templateId: 'plan-build-review', includeCorrection: true, includeCriticalStop: true });
  return deepFreezeIntegration({ scenarios: [direct, planBuild, planBuildReview], uiRequired: false });
}

function approvePipelineGate({ runId, template, assignments }) {
  const request = createPipelineApprovalGate({
    id: `gate-a-${runId}`,
    runId,
    template,
    assignments,
    context: { task: `Internal ${template.id} scenario`, projectPath: 'repo', obsidianSnapshot: 'snapshot' },
    preflight: { status: 'Ready', warnings: [] },
    permissions: { filesystem: 'workspace-write', commands: ['internal integration scenario'] },
    network: { mode: 'restricted', allowedHosts: [] },
    secretAliases: [],
    revisionHash: `revision-${runId}`,
    requestedAt: '2026-01-01T00:00:00.000Z'
  });
  return decidePipelineApprovalGate(request, { actor: 'system', decision: 'approve', payloadHash: request.payloadHash, revisionHash: request.revisionHash, timestamp: '2026-01-01T00:01:00.000Z' });
}

function approveHandoff({ runId, stepId, author }) {
  const revision = createHandoffRevision({
    runId,
    stepId,
    revision: 1,
    author,
    createdAt: '2026-01-01T00:10:00.000Z',
    objective: `Execute ${stepId} in the approved scenario.`,
    approvedScope: ['Use only the approved scenario inputs.'],
    contextSummary: 'Gate A was approved and no UI is required.',
    implementationInstructions: ['Continue the internal pipeline scenario.'],
    constraints: ['Do not use free editor mode.'],
    acceptanceCriteria: ['Scenario reaches Gate E.'],
    allowedFiles: ['packages/orchestrator/src/pipeline-integration-suite.js'],
    requiredChecks: ['node tests/pipeline-integration-suite.test.mjs']
  });
  const request = createHandoffApprovalGate({ id: `gate-b-${runId}-${stepId}`, runId, handoffRevision: revision, requestedAt: '2026-01-01T00:11:00.000Z' });
  const decision = decideHandoffApprovalGate(request, { actor: 'system', decision: 'approve', payloadHash: request.payloadHash, revisionHash: request.revisionHash, timestamp: '2026-01-01T00:12:00.000Z' });
  return markHandoffRevisionApproved(revision, decision);
}

function deepFreezeIntegration(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeIntegration(child);
  return Object.freeze(value);
}
