import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { createApprovalRequest, decideApproval, hashApprovalPayload, SENSITIVE_APPROVAL_TTL_MINUTES } from './approvals.js';
import { sha256, writeAtomicArtifact } from './command-pipeline.js';
import { writeArtifactRecord } from './artifact-layout.js';

export const OBSIDIAN_WRITEBACK_APPROVAL_KIND = 'obsidian-writeback';
export const OBSIDIAN_WRITEBACK_APPROVAL_GATE_ID = 'Obsidian Write-back Approval';
export const OBSIDIAN_WRITEBACK_DRAFT_FILENAME = 'obsidian-writeback-draft.md';
export const OBSIDIAN_WRITEBACK_ALLOWED_SECTIONS = Object.freeze(['Summary', 'Decisions', 'Insights', 'Follow-ups']);
export const OBSIDIAN_WRITEBACK_FORBIDDEN_PATTERNS = Object.freeze([
  /```[\s\S]*?```/g,
  /^\s{4,}\S.*$/gm,
  /\b(raw logs?|stdout|stderr|stack trace|traceback)\b/i
]);

export class ObsidianWritebackError extends Error {
  constructor(message = 'Invalid Obsidian write-back operation.', details = {}) {
    super(message);
    this.name = 'ObsidianWritebackError';
    this.code = 'ERR_OBSIDIAN_WRITEBACK';
    this.details = details;
  }
}

export function createObsidianWritebackDraft({
  runId,
  destinationPath,
  summary,
  decisions = [],
  insights = [],
  followUps = [],
  createdAt = new Date().toISOString(),
  sourceSnapshotHash
} = {}) {
  if (!runId || typeof runId !== 'string') throw new ObsidianWritebackError('Write-back runId is required.');
  if (!destinationPath || typeof destinationPath !== 'string') throw new ObsidianWritebackError('Write-back destinationPath is required.');
  const draft = {
    runId,
    destinationPath: resolve(destinationPath),
    createdAt,
    sourceSnapshotHash: sourceSnapshotHash ?? null,
    content: renderWritebackMarkdown({ runId, createdAt, summary, decisions, insights, followUps })
  };
  assertObsidianWritebackContent(draft.content);
  const draftHash = sha256(Buffer.from(stableJson(draft), 'utf8'));
  return deepFreezeWriteback({ ...draft, draftHash, approvedHash: null, state: 'Draft' });
}

export function editObsidianWritebackDraft(draft, { content, editedAt = new Date().toISOString() } = {}) {
  assertObsidianWritebackDraft(draft, { requireApproved: false });
  if (typeof content !== 'string' || !content.trim()) throw new ObsidianWritebackError('Edited write-back content is required.');
  assertObsidianWritebackContent(content);
  const edited = {
    runId: draft.runId,
    destinationPath: draft.destinationPath,
    createdAt: draft.createdAt,
    editedAt,
    sourceSnapshotHash: draft.sourceSnapshotHash,
    content
  };
  return deepFreezeWriteback({ ...edited, draftHash: sha256(Buffer.from(stableJson(edited), 'utf8')), approvedHash: null, state: 'Draft' });
}

export function createObsidianWritebackApprovalGate({ id, draft, actor = 'system', requestedAt = new Date().toISOString(), ttlMinutes = SENSITIVE_APPROVAL_TTL_MINUTES } = {}) {
  assertObsidianWritebackDraft(draft, { requireApproved: false });
  return createApprovalRequest({
    id: id ?? `obsidian-writeback-${draft.runId}`,
    kind: OBSIDIAN_WRITEBACK_APPROVAL_KIND,
    scope: { gate: OBSIDIAN_WRITEBACK_APPROVAL_GATE_ID, runId: draft.runId, destinationPath: draft.destinationPath, draftHash: draft.draftHash },
    payload: createObsidianWritebackApprovalPayload(draft),
    revisionHash: draft.draftHash,
    actor,
    requestedAt,
    ttlMinutes
  });
}

export function createObsidianWritebackApprovalPayload(draft) {
  assertObsidianWritebackDraft(draft, { requireApproved: false });
  return deepFreezeWriteback({
    gate: OBSIDIAN_WRITEBACK_APPROVAL_GATE_ID,
    runId: draft.runId,
    destinationPath: draft.destinationPath,
    draftHash: draft.draftHash,
    contentHash: sha256(Buffer.from(draft.content, 'utf8')),
    sections: OBSIDIAN_WRITEBACK_ALLOWED_SECTIONS
  });
}

export function decideObsidianWritebackApprovalGate(request, decision) {
  if (request?.kind !== OBSIDIAN_WRITEBACK_APPROVAL_KIND || request?.scope?.gate !== OBSIDIAN_WRITEBACK_APPROVAL_GATE_ID) {
    throw new ObsidianWritebackError('Approval request is not an Obsidian write-back approval.', { requestId: request?.id, kind: request?.kind, gate: request?.scope?.gate });
  }
  return decideApproval(request, decision);
}

export function markObsidianWritebackApproved(draft, approvalDecision) {
  assertObsidianWritebackDraft(draft, { requireApproved: false });
  if (!approvalDecision || approvalDecision.state !== 'Approved' || approvalDecision.revisionHash !== draft.draftHash) {
    throw new ObsidianWritebackError('Approved write-back decision matching the draft is required.', { state: approvalDecision?.state });
  }
  return deepFreezeWriteback({ ...draft, approvedHash: draft.draftHash, approvalId: approvalDecision.requestId, approvedAt: approvalDecision.timestamp, state: 'Approved' });
}

export function writeObsidianApprovedDraft({ draft, expectedExistingHash, conflictDraftDirectory } = {}) {
  assertObsidianWritebackDraft(draft, { requireApproved: true });
  const destinationExists = existsSync(draft.destinationPath);
  const actualExistingHash = destinationExists ? sha256(readFileSync(draft.destinationPath)) : null;
  if (expectedExistingHash !== undefined && actualExistingHash !== expectedExistingHash) {
    return createConflictDraft({ draft, actualExistingHash, expectedExistingHash, conflictDraftDirectory });
  }
  const previousContent = destinationExists ? readFileSync(draft.destinationPath, 'utf8') : '';
  const mergedContent = `${previousContent}${previousContent.endsWith('\n') || previousContent.length === 0 ? '' : '\n'}\n${draft.content}`.trimStart() + '\n';
  const result = writeAtomicArtifact({ path: draft.destinationPath, content: mergedContent });
  return deepFreezeWriteback({ result: 'Written', destinationPath: draft.destinationPath, hash: result.hash, size: result.size, previousHash: actualExistingHash, approvedHash: draft.approvedHash, completionBlocking: false });
}

export function createConflictDraft({ draft, actualExistingHash = null, expectedExistingHash = null, conflictDraftDirectory } = {}) {
  assertObsidianWritebackDraft(draft, { requireApproved: true });
  const dir = resolve(conflictDraftDirectory ?? dirname(draft.destinationPath));
  mkdirSync(dir, { recursive: true });
  const conflictPath = resolve(dir, `${basename(draft.destinationPath)}.conflict-${draft.runId}.md`);
  const content = [`# Obsidian Write-back Conflict`, '', `- Run: ${draft.runId}`, `- Destination: ${draft.destinationPath}`, `- Expected existing hash: ${expectedExistingHash ?? 'none'}`, `- Actual existing hash: ${actualExistingHash ?? 'none'}`, '', draft.content].join('\n');
  const result = writeAtomicArtifact({ path: conflictPath, content: `${content}\n` });
  return deepFreezeWriteback({ result: 'ConflictDraft', conflictPath, hash: result.hash, size: result.size, destinationPath: draft.destinationPath, expectedExistingHash, actualExistingHash, completionBlocking: false });
}

export function writeObsidianWritebackDraftArtifact({ layout, draft, filename = OBSIDIAN_WRITEBACK_DRAFT_FILENAME } = {}) {
  assertObsidianWritebackDraft(draft, { requireApproved: false });
  return writeArtifactRecord({ layout, category: 'summary', filename, content: draft.content, metadata: { kind: 'obsidian-writeback-draft', runId: draft.runId, draftHash: draft.draftHash } });
}

export function summarizeObsidianWritebackOutcome(outcome) {
  if (!outcome || typeof outcome !== 'object') throw new ObsidianWritebackError('Write-back outcome is required.');
  return deepFreezeWriteback({
    result: outcome.result ?? 'Skipped',
    completionBlocking: false,
    reason: outcome.reason ?? (outcome.result === 'Rejected' ? 'User rejected write-back.' : ''),
    destinationPath: outcome.destinationPath ?? null,
    conflictPath: outcome.conflictPath ?? null
  });
}

export function assertObsidianWritebackContent(content) {
  if (typeof content !== 'string' || !content.trim()) throw new ObsidianWritebackError('Write-back content must be non-empty Markdown.');
  const missing = OBSIDIAN_WRITEBACK_ALLOWED_SECTIONS.filter((section) => !content.includes(`## ${section}`));
  if (missing.length > 0) throw new ObsidianWritebackError('Write-back draft is missing required sections.', { missing });
  const forbidden = [];
  for (const pattern of OBSIDIAN_WRITEBACK_FORBIDDEN_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) forbidden.push(pattern.source);
  }
  if (forbidden.length > 0) throw new ObsidianWritebackError('Write-back draft must not contain raw logs or code blocks.', { forbidden });
  return true;
}

function assertObsidianWritebackDraft(draft, { requireApproved } = {}) {
  if (!draft || typeof draft !== 'object' || !draft.runId || !draft.destinationPath || !draft.content || !draft.draftHash) {
    throw new ObsidianWritebackError('Write-back draft requires runId, destinationPath, content and draftHash.');
  }
  assertObsidianWritebackContent(draft.content);
  const comparable = { ...draft };
  delete comparable.draftHash;
  delete comparable.approvedHash;
  delete comparable.state;
  delete comparable.approvalId;
  delete comparable.approvedAt;
  const actualHash = sha256(Buffer.from(stableJson(comparable), 'utf8'));
  if (actualHash !== draft.draftHash) throw new ObsidianWritebackError('Write-back draft hash mismatch.', { expectedHash: draft.draftHash, actualHash });
  if (requireApproved && draft.state !== 'Approved') throw new ObsidianWritebackError('Write-back draft must be approved before writing.', { state: draft.state });
  return true;
}

function renderWritebackMarkdown({ runId, createdAt, summary, decisions, insights, followUps }) {
  return [
    `# Run ${runId} Summary`,
    '',
    `- Created: ${createdAt}`,
    '',
    '## Summary',
    normalizeParagraph(summary, 'Summary'),
    '',
    '## Decisions',
    renderList(decisions),
    '',
    '## Insights',
    renderList(insights),
    '',
    '## Follow-ups',
    renderList(followUps),
    ''
  ].join('\n');
}

function normalizeParagraph(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new ObsidianWritebackError(`${label} is required.`);
  return value.trim();
}

function renderList(items) {
  if (!Array.isArray(items)) throw new ObsidianWritebackError('Write-back list sections must be arrays.');
  if (items.length === 0) return '- None';
  return items.map((item) => `- ${normalizeParagraph(item, 'List item')}`).join('\n');
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function deepFreezeWriteback(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeWriteback(child);
  return Object.freeze(value);
}
