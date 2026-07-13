import { createApprovalRequest, decideApproval, SENSITIVE_APPROVAL_TTL_MINUTES } from './approvals.js';
import { sha256 } from './command-pipeline.js';

export const REVIEW_ARTIFACT_FILENAME = 'review.md';
export const REVIEW_APPROVAL_GATE_ID = 'Critical Review Approval';
export const REVIEW_APPROVAL_KIND = 'review-critical';
export const REVIEW_SEVERITIES = Object.freeze(['Info', 'Low', 'Medium', 'High', 'Critical']);
export const REVIEW_BLOCKING_SEVERITIES = Object.freeze(['High', 'Critical']);
export const REVIEW_REQUIRED_SECTIONS = Object.freeze([
  'Summary',
  'Findings',
  'Failed Tests',
  'Required Fixes',
  'Decision'
]);

export class ReviewArtifactError extends Error {
  constructor(message = 'Invalid review artifact.', details = {}) {
    super(message);
    this.name = 'ReviewArtifactError';
    this.code = 'ERR_REVIEW_ARTIFACT';
    this.details = details;
  }
}

export function createReviewArtifact({
  runId,
  stepId = 'review',
  reviewerAgentId,
  builderAgentId,
  createdAt = new Date().toISOString(),
  summary,
  findings = [],
  failedTests = [],
  requiredFixes = []
} = {}) {
  const normalized = normalizeReviewInput({ runId, stepId, reviewerAgentId, builderAgentId, createdAt, summary, findings, failedTests, requiredFixes });
  const highestSeverity = getHighestReviewSeverity(normalized.findings);
  const blocking = REVIEW_BLOCKING_SEVERITIES.includes(highestSeverity);
  const criticalSensitive = hasCriticalSensitiveFinding(normalized.findings);
  const selfReviewWarning = normalized.reviewerAgentId === normalized.builderAgentId;
  const decision = criticalSensitive ? 'Requires Approval' : blocking ? 'Blocked' : 'Passed';
  const content = renderReviewMarkdown({ ...normalized, highestSeverity, blocking, criticalSensitive, selfReviewWarning, decision });
  assertReviewMarkdown(content);
  const hash = sha256(Buffer.from(content, 'utf8'));
  return deepFreezeReview({
    runId: normalized.runId,
    stepId: normalized.stepId,
    filename: REVIEW_ARTIFACT_FILENAME,
    reviewerAgentId: normalized.reviewerAgentId,
    builderAgentId: normalized.builderAgentId,
    createdAt: normalized.createdAt,
    summary: normalized.summary,
    findings: normalized.findings,
    failedTests: normalized.failedTests,
    requiredFixes: normalized.requiredFixes,
    highestSeverity,
    blocking,
    criticalSensitive,
    selfReviewWarning,
    decision,
    content,
    hash
  });
}

export function createCriticalReviewApprovalGate({
  id,
  runId,
  reviewArtifact,
  actor = 'system',
  requestedAt = new Date().toISOString(),
  ttlMinutes = SENSITIVE_APPROVAL_TTL_MINUTES
} = {}) {
  assertReviewArtifact(reviewArtifact);
  if (reviewArtifact.criticalSensitive !== true) {
    throw new ReviewArtifactError('Only Critical sensitive reviews require immediate approval.', { highestSeverity: reviewArtifact.highestSeverity, criticalSensitive: reviewArtifact.criticalSensitive });
  }
  return createApprovalRequest({
    id: id ?? `critical-review-approval-${runId ?? reviewArtifact.runId}`,
    kind: REVIEW_APPROVAL_KIND,
    scope: { gate: REVIEW_APPROVAL_GATE_ID, runId: runId ?? reviewArtifact.runId, reviewHash: reviewArtifact.hash },
    payload: createCriticalReviewApprovalPayload(reviewArtifact),
    revisionHash: reviewArtifact.hash,
    actor,
    requestedAt,
    ttlMinutes
  });
}

export function createCriticalReviewApprovalPayload(reviewArtifact) {
  assertReviewArtifact(reviewArtifact);
  return deepFreezeReview({
    gate: REVIEW_APPROVAL_GATE_ID,
    filename: reviewArtifact.filename,
    runId: reviewArtifact.runId,
    hash: reviewArtifact.hash,
    highestSeverity: reviewArtifact.highestSeverity,
    criticalSensitive: reviewArtifact.criticalSensitive,
    requiredFixes: reviewArtifact.requiredFixes
  });
}

export function decideCriticalReviewApprovalGate(request, decision) {
  if (request?.kind !== REVIEW_APPROVAL_KIND || request?.scope?.gate !== REVIEW_APPROVAL_GATE_ID) {
    throw new ReviewArtifactError('Approval request is not a Critical review approval.', { requestId: request?.id, kind: request?.kind, gate: request?.scope?.gate });
  }
  return decideApproval(request, decision);
}

export function assertReviewArtifact(reviewArtifact) {
  if (!reviewArtifact || typeof reviewArtifact !== 'object') throw new ReviewArtifactError('Review artifact must be an object.');
  if (!reviewArtifact.runId || !reviewArtifact.stepId || !reviewArtifact.filename || !reviewArtifact.content || !reviewArtifact.hash) {
    throw new ReviewArtifactError('Review artifact requires runId, stepId, filename, content and hash.', { runId: reviewArtifact.runId, stepId: reviewArtifact.stepId });
  }
  if (reviewArtifact.filename !== REVIEW_ARTIFACT_FILENAME) throw new ReviewArtifactError('Review artifact must be named review.md.', { filename: reviewArtifact.filename });
  assertReviewMarkdown(reviewArtifact.content);
  const actualHash = sha256(Buffer.from(reviewArtifact.content, 'utf8'));
  if (actualHash !== reviewArtifact.hash) throw new ReviewArtifactError('Review artifact hash mismatch.', { expectedHash: reviewArtifact.hash, actualHash });
  if (REVIEW_BLOCKING_SEVERITIES.includes(reviewArtifact.highestSeverity) && reviewArtifact.blocking !== true) {
    throw new ReviewArtifactError('High and Critical review findings must block.', { highestSeverity: reviewArtifact.highestSeverity, blocking: reviewArtifact.blocking });
  }
  return true;
}

export function assertReviewMarkdown(content) {
  if (typeof content !== 'string' || !content.trim()) throw new ReviewArtifactError('Review content must be non-empty Markdown.');
  const missing = REVIEW_REQUIRED_SECTIONS.filter((section) => !content.includes(`## ${section}`));
  if (missing.length > 0) throw new ReviewArtifactError('Review artifact is missing required sections.', { missing });
  return true;
}

export function getHighestReviewSeverity(findings = []) {
  if (!Array.isArray(findings) || findings.length === 0) return 'Info';
  let highestIndex = 0;
  for (const finding of findings) {
    const index = REVIEW_SEVERITIES.indexOf(finding.severity);
    if (index < 0) throw new ReviewArtifactError('Unknown review severity.', { severity: finding.severity });
    if (index > highestIndex) highestIndex = index;
  }
  return REVIEW_SEVERITIES[highestIndex];
}

function hasCriticalSensitiveFinding(findings) {
  return findings.some((finding) => finding.severity === 'Critical' && finding.sensitive === true);
}

function normalizeReviewInput(input) {
  for (const key of ['runId', 'stepId', 'reviewerAgentId', 'builderAgentId', 'createdAt', 'summary']) {
    if (!input[key] || typeof input[key] !== 'string') throw new ReviewArtifactError(`Review ${key} is required.`);
  }
  if (!Array.isArray(input.findings)) throw new ReviewArtifactError('Review findings must be an array.');
  if (!Array.isArray(input.failedTests)) throw new ReviewArtifactError('Review failedTests must be an array.');
  if (!Array.isArray(input.requiredFixes)) throw new ReviewArtifactError('Review requiredFixes must be an array.');
  const findings = input.findings.map(normalizeFinding);
  const failedTests = input.failedTests.map(normalizeTextItem('failedTests'));
  const requiredFixes = input.requiredFixes.map(normalizeTextItem('requiredFixes'));
  const hasBlocking = findings.some((finding) => REVIEW_BLOCKING_SEVERITIES.includes(finding.severity));
  if (hasBlocking && requiredFixes.length === 0) throw new ReviewArtifactError('Blocking review findings require at least one required fix.');
  return { ...input, findings, failedTests, requiredFixes };
}

function normalizeFinding(finding, index) {
  if (!finding || typeof finding !== 'object') throw new ReviewArtifactError('Review finding must be an object.', { index });
  const severity = finding.severity;
  if (!REVIEW_SEVERITIES.includes(severity)) throw new ReviewArtifactError('Unknown review severity.', { severity, index });
  if (!finding.evidence || typeof finding.evidence !== 'string') throw new ReviewArtifactError('Review finding evidence is required.', { index });
  if (!finding.requiredFix || typeof finding.requiredFix !== 'string') throw new ReviewArtifactError('Review finding requiredFix is required.', { index });
  return {
    severity,
    evidence: finding.evidence,
    requiredFix: finding.requiredFix,
    sensitive: finding.sensitive === true
  };
}

function normalizeTextItem(label) {
  return (item, index) => {
    if (typeof item !== 'string' || !item.trim()) throw new ReviewArtifactError(`Review ${label} item must be a non-empty string.`, { index });
    return item;
  };
}

function renderReviewMarkdown(review) {
  return [
    `# ${REVIEW_ARTIFACT_FILENAME} — Run ${review.runId}`,
    '',
    `- Step: ${review.stepId}`,
    `- Reviewer: ${review.reviewerAgentId}`,
    `- Builder: ${review.builderAgentId}`,
    `- Created: ${review.createdAt}`,
    `- Highest severity: ${review.highestSeverity}`,
    `- Blocking: ${review.blocking ? 'yes' : 'no'}`,
    `- Critical sensitive approval: ${review.criticalSensitive ? 'required' : 'not required'}`,
    review.selfReviewWarning ? '- Warning: reviewer and builder are the same agent.' : '- Warning: none',
    '',
    '## Summary',
    review.summary,
    '',
    '## Findings',
    renderFindings(review.findings),
    '',
    '## Failed Tests',
    renderList(review.failedTests, 'None'),
    '',
    '## Required Fixes',
    renderList(review.requiredFixes, 'None'),
    '',
    '## Decision',
    review.decision,
    ''
  ].join('\n');
}

function renderFindings(findings) {
  if (findings.length === 0) return '- None';
  return findings.map((finding, index) => [
    `### Finding ${index + 1}: ${finding.severity}`,
    `- Evidence: ${finding.evidence}`,
    `- Required fix: ${finding.requiredFix}`,
    `- Sensitive: ${finding.sensitive ? 'yes' : 'no'}`
  ].join('\n')).join('\n\n');
}

function renderList(items, emptyText) {
  if (items.length === 0) return `- ${emptyText}`;
  return items.map((item) => `- ${item}`).join('\n');
}

function deepFreezeReview(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeReview(child);
  return Object.freeze(value);
}
