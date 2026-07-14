import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApprovalRequest, decideApproval, hashApprovalPayload, invalidateApprovalOnChange, SENSITIVE_APPROVAL_TTL_MINUTES } from './approvals.js';
import { sha256 } from './command-pipeline.js';
import { writeArtifactRecord } from './artifact-layout.js';

export const OBSIDIAN_CONTEXT_APPROVAL_KIND = 'obsidian-context';
export const OBSIDIAN_CONTEXT_APPROVAL_GATE_ID = 'Context Approval';
export const OBSIDIAN_CONTEXT_SNAPSHOT_FILENAME = 'obsidian-context-snapshot.json';

export class ObsidianContextApprovalError extends Error {
  constructor(message = 'Invalid Obsidian context approval.', details = {}) {
    super(message);
    this.name = 'ObsidianContextApprovalError';
    this.code = 'ERR_OBSIDIAN_CONTEXT_APPROVAL';
    this.details = details;
  }
}

export function createContextSelection({ runId, candidates = [], selectedRelativePaths = [], edits = {}, createdAt = new Date().toISOString() } = {}) {
  if (!runId || typeof runId !== 'string') throw new ObsidianContextApprovalError('Context selection runId is required.');
  if (!Array.isArray(candidates)) throw new ObsidianContextApprovalError('Context candidates must be an array.');
  if (!Array.isArray(selectedRelativePaths)) throw new ObsidianContextApprovalError('Selected relative paths must be an array.');
  const selected = selectedRelativePaths.map((relativePath) => {
    const candidate = candidates.find((item) => item.relativePath === relativePath);
    if (!candidate) throw new ObsidianContextApprovalError('Selected context candidate was not found.', { relativePath });
    return normalizeCandidate(candidate, edits[relativePath]);
  });
  const selection = { runId, createdAt, selected };
  return deepFreezeContextApproval({ ...selection, selectionHash: sha256(Buffer.from(stableJson(selection), 'utf8')) });
}

export function createContextApprovalPayload(selection) {
  assertContextSelection(selection);
  return deepFreezeContextApproval({
    gate: OBSIDIAN_CONTEXT_APPROVAL_GATE_ID,
    runId: selection.runId,
    selectionHash: selection.selectionHash,
    selected: selection.selected.map((item) => ({
      relativePath: item.relativePath,
      title: item.title,
      sourceHash: item.sourceHash,
      effectiveHash: item.effectiveHash,
      edited: item.edited
    }))
  });
}

export function createContextApprovalGate({ id, runId, selection, actor = 'system', requestedAt = new Date().toISOString(), ttlMinutes = SENSITIVE_APPROVAL_TTL_MINUTES } = {}) {
  assertContextSelection(selection);
  return createApprovalRequest({
    id: id ?? `context-approval-${runId ?? selection.runId}`,
    kind: OBSIDIAN_CONTEXT_APPROVAL_KIND,
    scope: { gate: OBSIDIAN_CONTEXT_APPROVAL_GATE_ID, runId: runId ?? selection.runId, selectionHash: selection.selectionHash },
    payload: createContextApprovalPayload(selection),
    revisionHash: selection.selectionHash,
    actor,
    requestedAt,
    ttlMinutes
  });
}

export function decideContextApprovalGate(request, decision) {
  if (request?.kind !== OBSIDIAN_CONTEXT_APPROVAL_KIND || request?.scope?.gate !== OBSIDIAN_CONTEXT_APPROVAL_GATE_ID) {
    throw new ObsidianContextApprovalError('Approval request is not a context approval request.', { requestId: request?.id, kind: request?.kind, gate: request?.scope?.gate });
  }
  return decideApproval(request, decision);
}

export function createReadOnlyContextSnapshot({ selection, approvalDecision, createdAt = new Date().toISOString() } = {}) {
  assertContextSelection(selection);
  if (!approvalDecision || approvalDecision.state !== 'Approved' || approvalDecision.revisionHash !== selection.selectionHash) {
    throw new ObsidianContextApprovalError('Approved context decision matching the selection is required.', { state: approvalDecision?.state });
  }
  const snapshotBody = {
    runId: selection.runId,
    createdAt,
    readOnly: true,
    approvalId: approvalDecision.requestId,
    selectionHash: selection.selectionHash,
    items: selection.selected.map((item) => ({
      relativePath: item.relativePath,
      title: item.title,
      excerpt: item.excerpt,
      reason: item.reason,
      sourceHash: item.sourceHash,
      effectiveHash: item.effectiveHash,
      edited: item.edited,
      content: item.effectiveContent
    }))
  };
  return deepFreezeContextApproval({ ...snapshotBody, snapshotHash: sha256(Buffer.from(stableJson(snapshotBody), 'utf8')) });
}

export function writeContextSnapshotArtifact({ layout, snapshot, filename = OBSIDIAN_CONTEXT_SNAPSHOT_FILENAME } = {}) {
  assertReadOnlyContextSnapshot(snapshot);
  return writeArtifactRecord({ layout, category: 'context', filename, content: `${JSON.stringify(snapshot, null, 2)}\n`, metadata: { kind: 'obsidian-context-snapshot', runId: snapshot.runId, snapshotHash: snapshot.snapshotHash } });
}

export function createAgentContextInjection(snapshot) {
  assertReadOnlyContextSnapshot(snapshot);
  return deepFreezeContextApproval({
    readOnly: true,
    snapshotHash: snapshot.snapshotHash,
    instruction: 'Use only this approved read-only Obsidian context snapshot; do not read the vault directly for this run.',
    items: snapshot.items.map((item) => ({ relativePath: item.relativePath, title: item.title, content: item.content, hash: item.effectiveHash }))
  });
}

export function invalidateContextApprovalOnRefresh(request, nextSelection) {
  assertContextSelection(nextSelection);
  return invalidateApprovalOnChange(request, { payloadHash: hashApprovalPayload(createContextApprovalPayload(nextSelection)), revisionHash: nextSelection.selectionHash });
}

export function assertSnapshotUnaffectedBySourceChange(snapshot, changedCandidate) {
  assertReadOnlyContextSnapshot(snapshot);
  if (!changedCandidate?.relativePath) throw new ObsidianContextApprovalError('Changed candidate relativePath is required.');
  const item = snapshot.items.find((candidate) => candidate.relativePath === changedCandidate.relativePath);
  if (!item) return true;
  if (item.sourceHash === changedCandidate.hash) throw new ObsidianContextApprovalError('Changed candidate hash must differ to verify immutability.');
  return item.content !== readCandidateContent(changedCandidate);
}

function normalizeCandidate(candidate, edit) {
  if (!candidate?.relativePath || !candidate?.hash || !candidate?.path) throw new ObsidianContextApprovalError('Candidate requires path, relativePath and hash.', { candidate });
  const sourceContent = readCandidateContent(candidate);
  const effectiveContent = typeof edit === 'string' ? edit : sourceContent;
  return {
    relativePath: candidate.relativePath,
    path: candidate.path,
    title: candidate.title ?? candidate.relativePath,
    excerpt: candidate.excerpt ?? '',
    reason: candidate.reason ?? '',
    sourceHash: candidate.hash,
    effectiveHash: sha256(Buffer.from(effectiveContent, 'utf8')),
    edited: typeof edit === 'string',
    effectiveContent
  };
}

function readCandidateContent(candidate) {
  return readFileSync(candidate.path, 'utf8');
}

function assertContextSelection(selection) {
  if (!selection || typeof selection !== 'object' || !selection.runId || !Array.isArray(selection.selected) || !selection.selectionHash) {
    throw new ObsidianContextApprovalError('Context selection requires runId, selected and selectionHash.');
  }
  const { selectionHash, ...withoutHash } = selection;
  const actualHash = sha256(Buffer.from(stableJson(withoutHash), 'utf8'));
  if (actualHash !== selectionHash) throw new ObsidianContextApprovalError('Context selection hash mismatch.', { expectedHash: selectionHash, actualHash });
  return true;
}

function assertReadOnlyContextSnapshot(snapshot) {
  if (!snapshot || snapshot.readOnly !== true || !snapshot.runId || !Array.isArray(snapshot.items) || !snapshot.snapshotHash) {
    throw new ObsidianContextApprovalError('Read-only context snapshot is incomplete.', { snapshot });
  }
  const { snapshotHash, ...withoutHash } = snapshot;
  const actualHash = sha256(Buffer.from(stableJson(withoutHash), 'utf8'));
  if (actualHash !== snapshotHash) throw new ObsidianContextApprovalError('Context snapshot hash mismatch.', { expectedHash: snapshotHash, actualHash });
  return true;
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function deepFreezeContextApproval(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeContextApproval(child);
  return Object.freeze(value);
}
