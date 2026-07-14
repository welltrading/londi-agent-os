import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  OBSIDIAN_CONTEXT_APPROVAL_GATE_ID,
  OBSIDIAN_CONTEXT_APPROVAL_KIND,
  OBSIDIAN_CONTEXT_SNAPSHOT_FILENAME,
  ObsidianContextApprovalError,
  assertSnapshotUnaffectedBySourceChange,
  createAgentContextInjection,
  createArtifactLayout,
  createContextApprovalGate,
  createContextApprovalPayload,
  createContextSelection,
  createObsidianContextBroker,
  createReadOnlyContextSnapshot,
  decideContextApprovalGate,
  invalidateContextApprovalOnRefresh,
  searchObsidianContext,
  verifyArtifactRecord,
  writeContextSnapshotArtifact
} from '../packages/orchestrator/src/index.js';

const temp = mkdtempSync(join(tmpdir(), 'londi-context-approval-'));
try {
  const vault = join(temp, 'vault');
  mkdirSync(vault, { recursive: true });
  const notePath = join(vault, 'Client.md');
  writeFileSync(notePath, `---\ntitle: Client Context\n---\n# Client Context\nWhatsApp sales context for a clinic.\n`, 'utf8');
  const broker = createObsidianContextBroker({ roots: [vault], now: '2026-01-01T00:00:00.000Z' });
  const [candidate] = searchObsidianContext({ broker, query: 'WhatsApp clinic', includeRecentDays: 99999 });

  const selection = createContextSelection({
    runId: 'run-1',
    candidates: [candidate],
    selectedRelativePaths: ['Client.md'],
    edits: { 'Client.md': '# Edited Client Context\nApproved concise snapshot.\n' },
    createdAt: '2026-01-01T00:01:00.000Z'
  });
  assert.equal(selection.selected.length, 1);
  assert.equal(selection.selected[0].edited, true);
  assert.ok(selection.selectionHash);

  const payload = createContextApprovalPayload(selection);
  assert.equal(payload.gate, OBSIDIAN_CONTEXT_APPROVAL_GATE_ID);
  assert.equal(payload.selected[0].relativePath, 'Client.md');

  const request = createContextApprovalGate({ id: 'context-gate-1', selection, requestedAt: '2026-01-01T00:02:00.000Z' });
  assert.equal(request.kind, OBSIDIAN_CONTEXT_APPROVAL_KIND);
  assert.equal(request.scope.gate, OBSIDIAN_CONTEXT_APPROVAL_GATE_ID);

  const decision = decideContextApprovalGate(request, {
    actor: 'londi',
    decision: 'approve',
    payloadHash: request.payloadHash,
    revisionHash: request.revisionHash,
    timestamp: '2026-01-01T00:03:00.000Z'
  });
  assert.equal(decision.state, 'Approved');

  const snapshot = createReadOnlyContextSnapshot({ selection, approvalDecision: decision, createdAt: '2026-01-01T00:04:00.000Z' });
  assert.equal(snapshot.readOnly, true);
  assert.equal(snapshot.items[0].content.includes('Approved concise snapshot'), true);
  assert.ok(snapshot.snapshotHash);

  const layout = createArtifactLayout({ runId: 'run-1', artifactsRoot: join(temp, 'artifacts') });
  const record = writeContextSnapshotArtifact({ layout, snapshot });
  assert.equal(record.category, 'context');
  assert.equal(record.filename, OBSIDIAN_CONTEXT_SNAPSHOT_FILENAME);
  assert.equal(verifyArtifactRecord(record), true);

  const injection = createAgentContextInjection(snapshot);
  assert.equal(injection.readOnly, true);
  assert.equal(injection.items[0].hash, snapshot.items[0].effectiveHash);
  assert.equal(injection.instruction.includes('read-only'), true);

  const unchanged = invalidateContextApprovalOnRefresh(request, selection);
  assert.equal(unchanged, request);
  const refreshedSelection = createContextSelection({ runId: 'run-1', candidates: [candidate], selectedRelativePaths: [], createdAt: '2026-01-01T00:05:00.000Z' });
  assert.equal(invalidateContextApprovalOnRefresh(request, refreshedSelection).state, 'Invalidated');

  writeFileSync(notePath, `---\ntitle: Client Context\n---\n# Client Context\nChanged source after snapshot.\n`, 'utf8');
  const [changedCandidate] = searchObsidianContext({ broker, query: 'Changed source', includeRecentDays: 99999 });
  assert.equal(assertSnapshotUnaffectedBySourceChange(snapshot, changedCandidate), true);
  assert.equal(snapshot.items[0].content.includes('Approved concise snapshot'), true);

  assert.throws(() => createReadOnlyContextSnapshot({ selection, approvalDecision: { state: 'Rejected' } }), ObsidianContextApprovalError);
  assert.throws(() => createContextSelection({ runId: 'run-2', candidates: [candidate], selectedRelativePaths: ['Missing.md'] }), ObsidianContextApprovalError);

  console.log('Obsidian context approval tests OK');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
