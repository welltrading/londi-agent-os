import { sha256 } from './command-pipeline.js';
import { createApprovalRequest, decideApproval, hashApprovalPayload, SENSITIVE_APPROVAL_TTL_MINUTES } from './approvals.js';

export const HANDOFF_APPROVAL_GATE_ID = 'Gate B';
export const HANDOFF_APPROVAL_KIND = 'handoff';
export const HANDOFF_ARTIFACT_FILENAME = 'handoff.md';
export const HANDOFF_REQUIRED_SECTIONS = Object.freeze([
  'Objective',
  'Approved Scope',
  'Context Summary',
  'Implementation Instructions',
  'Constraints',
  'Acceptance Criteria',
  'Allowed Files',
  'Required Checks'
]);

export class HandoffError extends Error {
  constructor(message = 'Invalid handoff artifact.', details = {}) {
    super(message);
    this.name = 'HandoffError';
    this.code = 'ERR_HANDOFF';
    this.details = details;
  }
}

export function createHandoffRevision({
  runId,
  stepId = 'build',
  revision = 1,
  author = 'system',
  createdAt = new Date().toISOString(),
  objective,
  approvedScope = [],
  contextSummary,
  implementationInstructions = [],
  constraints = [],
  acceptanceCriteria = [],
  allowedFiles = [],
  requiredChecks = [],
  source = 'planner-output'
} = {}) {
  const normalized = normalizeHandoffInput({
    runId,
    stepId,
    revision,
    author,
    createdAt,
    objective,
    approvedScope,
    contextSummary,
    implementationInstructions,
    constraints,
    acceptanceCriteria,
    allowedFiles,
    requiredChecks,
    source
  });
  const content = renderHandoffMarkdown(normalized);
  assertHandoffMarkdown(content);
  const hash = sha256(Buffer.from(content, 'utf8'));
  return deepFreezeHandoff({
    runId: normalized.runId,
    stepId: normalized.stepId,
    revision: normalized.revision,
    author: normalized.author,
    createdAt: normalized.createdAt,
    filename: HANDOFF_ARTIFACT_FILENAME,
    content,
    hash,
    source: normalized.source,
    approved: false
  });
}

export function createHandoffApprovalGate({
  id,
  runId,
  stepId = 'build',
  handoffRevision,
  actor = 'system',
  requestedAt = new Date().toISOString(),
  ttlMinutes = SENSITIVE_APPROVAL_TTL_MINUTES
} = {}) {
  assertHandoffRevision(handoffRevision);
  return createApprovalRequest({
    id: id ?? `handoff-approval-${runId ?? handoffRevision.runId}-r${handoffRevision.revision}`,
    kind: HANDOFF_APPROVAL_KIND,
    scope: { gate: HANDOFF_APPROVAL_GATE_ID, runId: runId ?? handoffRevision.runId, stepId, revision: handoffRevision.revision },
    payload: createHandoffApprovalPayload(handoffRevision),
    revisionHash: handoffRevision.hash,
    actor,
    requestedAt,
    ttlMinutes
  });
}

export function createHandoffApprovalPayload(handoffRevision) {
  assertHandoffRevision(handoffRevision);
  return deepFreezeHandoff({
    gate: HANDOFF_APPROVAL_GATE_ID,
    filename: handoffRevision.filename,
    runId: handoffRevision.runId,
    stepId: handoffRevision.stepId,
    revision: handoffRevision.revision,
    hash: handoffRevision.hash,
    requiredSections: [...HANDOFF_REQUIRED_SECTIONS]
  });
}

export function decideHandoffApprovalGate(request, decision) {
  if (request?.kind !== HANDOFF_APPROVAL_KIND || request?.scope?.gate !== HANDOFF_APPROVAL_GATE_ID) {
    throw new HandoffError('Approval request is not a Gate B handoff approval.', { requestId: request?.id, kind: request?.kind, gate: request?.scope?.gate });
  }
  return decideApproval(request, decision);
}

export function markHandoffRevisionApproved(handoffRevision, decision) {
  assertHandoffRevision(handoffRevision);
  if (decision?.state !== 'Approved' || decision.revisionHash !== handoffRevision.hash) {
    throw new HandoffError('Build may only receive an approved handoff revision.', { decisionState: decision?.state, expectedRevisionHash: handoffRevision.hash, actualRevisionHash: decision?.revisionHash });
  }
  return deepFreezeHandoff({ ...handoffRevision, approved: true, approvedAt: decision.timestamp, approvalId: decision.requestId });
}

export function assertBuildReceivesApprovedHandoff(handoffRevision) {
  assertHandoffRevision(handoffRevision);
  if (handoffRevision.approved !== true || !handoffRevision.approvalId) {
    throw new HandoffError('Build may only start from an approved handoff revision.', { runId: handoffRevision.runId, revision: handoffRevision.revision });
  }
  return true;
}

export function assertHandoffRevision(handoffRevision) {
  if (!handoffRevision || typeof handoffRevision !== 'object') throw new HandoffError('Handoff revision must be an object.');
  if (!handoffRevision.runId || !handoffRevision.stepId || !handoffRevision.revision || !handoffRevision.filename || !handoffRevision.content || !handoffRevision.hash) {
    throw new HandoffError('Handoff revision requires runId, stepId, revision, filename, content and hash.', { runId: handoffRevision.runId, stepId: handoffRevision.stepId, revision: handoffRevision.revision });
  }
  if (handoffRevision.filename !== HANDOFF_ARTIFACT_FILENAME) throw new HandoffError('Handoff artifact must be named handoff.md.', { filename: handoffRevision.filename });
  assertHandoffMarkdown(handoffRevision.content);
  const actualHash = sha256(Buffer.from(handoffRevision.content, 'utf8'));
  if (actualHash !== handoffRevision.hash) throw new HandoffError('Handoff revision hash mismatch.', { expectedHash: handoffRevision.hash, actualHash });
  return true;
}

export function assertHandoffMarkdown(content) {
  if (typeof content !== 'string' || !content.trim()) throw new HandoffError('Handoff content must be non-empty Markdown.');
  const missing = HANDOFF_REQUIRED_SECTIONS.filter((section) => !content.includes(`## ${section}`));
  if (missing.length > 0) throw new HandoffError('Handoff artifact is missing required sections.', { missing });
  if (/raw conversation|chat log|transcript|full log/i.test(content)) throw new HandoffError('Handoff artifact must not include raw conversation or logs.');
  return true;
}

function normalizeHandoffInput(input) {
  const requiredText = ['runId', 'stepId', 'author', 'createdAt', 'objective', 'contextSummary'];
  for (const key of requiredText) {
    if (!input[key] || typeof input[key] !== 'string') throw new HandoffError(`Handoff ${key} is required.`);
  }
  const requiredLists = ['approvedScope', 'implementationInstructions', 'constraints', 'acceptanceCriteria', 'allowedFiles', 'requiredChecks'];
  for (const key of requiredLists) {
    if (!Array.isArray(input[key]) || input[key].length === 0) throw new HandoffError(`Handoff ${key} must include at least one item.`);
    if (input[key].some((item) => typeof item !== 'string' || !item.trim())) throw new HandoffError(`Handoff ${key} items must be non-empty strings.`);
  }
  if (!Number.isInteger(input.revision) || input.revision < 1) throw new HandoffError('Handoff revision must be a positive integer.', { revision: input.revision });
  return {
    ...input,
    approvedScope: [...input.approvedScope],
    implementationInstructions: [...input.implementationInstructions],
    constraints: [...input.constraints],
    acceptanceCriteria: [...input.acceptanceCriteria],
    allowedFiles: [...input.allowedFiles],
    requiredChecks: [...input.requiredChecks]
  };
}

function renderHandoffMarkdown(input) {
  return [
    `# ${HANDOFF_ARTIFACT_FILENAME} — Run ${input.runId}`,
    '',
    `- Revision: ${input.revision}`,
    `- Step: ${input.stepId}`,
    `- Author: ${input.author}`,
    `- Created: ${input.createdAt}`,
    `- Source: ${input.source}`,
    '',
    '## Objective',
    input.objective,
    '',
    '## Approved Scope',
    renderList(input.approvedScope),
    '',
    '## Context Summary',
    input.contextSummary,
    '',
    '## Implementation Instructions',
    renderList(input.implementationInstructions),
    '',
    '## Constraints',
    renderList(input.constraints),
    '',
    '## Acceptance Criteria',
    renderList(input.acceptanceCriteria),
    '',
    '## Allowed Files',
    renderList(input.allowedFiles),
    '',
    '## Required Checks',
    renderList(input.requiredChecks),
    ''
  ].join('\n');
}

function renderList(items) {
  return items.map((item) => `- ${item}`).join('\n');
}

function deepFreezeHandoff(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeHandoff(child);
  return Object.freeze(value);
}
