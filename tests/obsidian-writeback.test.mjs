import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  OBSIDIAN_WRITEBACK_APPROVAL_GATE_ID,
  OBSIDIAN_WRITEBACK_APPROVAL_KIND,
  OBSIDIAN_WRITEBACK_DRAFT_FILENAME,
  ObsidianWritebackError,
  assertObsidianWritebackContent,
  createArtifactLayout,
  createObsidianWritebackApprovalGate,
  createObsidianWritebackDraft,
  decideObsidianWritebackApprovalGate,
  editObsidianWritebackDraft,
  markObsidianWritebackApproved,
  sha256,
  summarizeObsidianWritebackOutcome,
  verifyArtifactRecord,
  writeObsidianApprovedDraft,
  writeObsidianWritebackDraftArtifact
} from '../packages/orchestrator/src/index.js';

const temp = mkdtempSync(join(tmpdir(), 'londi-writeback-'));
try {
  const vault = join(temp, 'vault');
  mkdirSync(vault, { recursive: true });
  const destinationPath = join(vault, 'Run Summaries.md');
  writeFileSync(destinationPath, '# Existing\n', 'utf8');
  const existingHash = sha256(readFileSync(destinationPath));

  const draft = createObsidianWritebackDraft({
    runId: 'run-1',
    destinationPath,
    summary: 'Completed the accepted implementation slice.',
    decisions: ['Keep manual merge verification.'],
    insights: ['Context snapshots should stay immutable.'],
    followUps: ['Review Secret Broker task next.'],
    createdAt: '2026-01-01T00:00:00.000Z',
    sourceSnapshotHash: 'snapshot-123'
  });
  assert.equal(draft.state, 'Draft');
  assert.equal(draft.content.includes('## Decisions'), true);
  assert.equal(assertObsidianWritebackContent(draft.content), true);

  const edited = editObsidianWritebackDraft(draft, { content: draft.content.replace('Completed', 'Delivered'), editedAt: '2026-01-01T00:02:00.000Z' });
  assert.notEqual(edited.draftHash, draft.draftHash);

  const request = createObsidianWritebackApprovalGate({ id: 'writeback-1', draft: edited, requestedAt: '2026-01-01T00:03:00.000Z' });
  assert.equal(request.kind, OBSIDIAN_WRITEBACK_APPROVAL_KIND);
  assert.equal(request.scope.gate, OBSIDIAN_WRITEBACK_APPROVAL_GATE_ID);
  const decision = decideObsidianWritebackApprovalGate(request, {
    actor: 'londi',
    decision: 'approve',
    payloadHash: request.payloadHash,
    revisionHash: request.revisionHash,
    timestamp: '2026-01-01T00:04:00.000Z'
  });
  const approved = markObsidianWritebackApproved(edited, decision);
  assert.equal(approved.state, 'Approved');

  const layout = createArtifactLayout({ runId: 'run-1', artifactsRoot: join(temp, 'artifacts') });
  const artifactRecord = writeObsidianWritebackDraftArtifact({ layout, draft: approved });
  assert.equal(artifactRecord.category, 'summary');
  assert.equal(artifactRecord.filename, OBSIDIAN_WRITEBACK_DRAFT_FILENAME);
  assert.equal(verifyArtifactRecord(artifactRecord), true);

  const written = writeObsidianApprovedDraft({ draft: approved, expectedExistingHash: existingHash });
  assert.equal(written.result, 'Written');
  assert.equal(written.completionBlocking, false);
  const destinationContent = readFileSync(destinationPath, 'utf8');
  assert.equal(destinationContent.includes('# Existing'), true);
  assert.equal(destinationContent.includes('Delivered the accepted implementation slice.'), true);

  writeFileSync(destinationPath, '# Changed elsewhere\n', 'utf8');
  const conflict = writeObsidianApprovedDraft({ draft: approved, expectedExistingHash: existingHash, conflictDraftDirectory: join(temp, 'conflicts') });
  assert.equal(conflict.result, 'ConflictDraft');
  assert.equal(conflict.completionBlocking, false);
  assert.equal(existsSync(conflict.conflictPath), true);
  assert.equal(readFileSync(destinationPath, 'utf8'), '# Changed elsewhere\n');

  const rejected = summarizeObsidianWritebackOutcome({ result: 'Rejected', reason: 'Not useful now.', destinationPath });
  assert.equal(rejected.completionBlocking, false);
  assert.equal(rejected.result, 'Rejected');

  assert.throws(() => createObsidianWritebackDraft({ runId: 'run-2', destinationPath, summary: '```js\nconsole.log(1)\n```' }), ObsidianWritebackError);
  assert.throws(() => writeObsidianApprovedDraft({ draft: edited, expectedExistingHash: existingHash }), ObsidianWritebackError);

  console.log('Obsidian write-back tests OK');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
