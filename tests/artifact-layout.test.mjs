import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ARTIFACT_DIRECTORIES,
  ArtifactLayoutError,
  assertCheckpointWithoutSecrets,
  createArtifactLayout,
  createArtifactManifest,
  sha256,
  verifyArtifactRecord,
  writeArtifactManifest,
  writeArtifactRecord
} from '../packages/orchestrator/src/index.js';

const root = mkdtempSync(join(tmpdir(), 'londi-artifacts-'));
try {
  const layout = createArtifactLayout({ runId: 'run-1', artifactsRoot: join(root, 'artifacts'), createdAt: '2026-01-01T00:00:00.000Z' });
  assert.equal(Object.isFrozen(layout), true);
  assert.deepEqual(Object.keys(layout.directories), ARTIFACT_DIRECTORIES);

  const checkpoint = writeArtifactRecord({
    layout,
    category: 'checkpoints',
    filename: 'checkpoint-1.json',
    content: { state: 'Running', note: 'safe checkpoint' },
    metadata: { kind: 'checkpoint', revision: 1 }
  });
  assert.equal(verifyArtifactRecord(checkpoint), true);
  assert.equal(JSON.parse(readFileSync(checkpoint.path, 'utf8')).state, 'Running');

  const handoff = writeArtifactRecord({
    layout,
    category: 'handoff',
    filename: 'handoff-r1.md',
    content: '# handoff\n',
    metadata: { revision: 1 }
  });
  const review = writeArtifactRecord({
    layout,
    category: 'review',
    filename: 'review-r1.md',
    content: '# review\n',
    metadata: { revision: 1 }
  });
  const manifest = createArtifactManifest({
    layout,
    records: [checkpoint, handoff, review],
    revisions: {
      handoff: [{ revision: 1, hash: handoff.hash }],
      review: [{ revision: 1, hash: review.hash }]
    },
    createdAt: '2026-01-01T00:01:00.000Z'
  });
  assert.equal(manifest.records.length, 3);
  assert.equal(manifest.revisions.handoff[0].hash, handoff.hash);
  assert.ok(manifest.manifestHash);

  const manifestWrite = writeArtifactManifest({ layout, records: [checkpoint, handoff, review], revisions: manifest.revisions });
  assert.equal(manifestWrite.record.category, 'summary');
  assert.equal(verifyArtifactRecord(manifestWrite.record), true);

  assert.equal(assertCheckpointWithoutSecrets({ safe: 'value' }), true);
  assert.throws(() => assertCheckpointWithoutSecrets({ token: `sk-${'abcdefghijklmnopqrstuvwxyz'}` }), ArtifactLayoutError);
  assert.throws(() => writeArtifactRecord({ layout, category: 'checkpoints', filename: 'bad.json', content: { token: `sk-${'abcdefghijklmnopqrstuvwxyz'}` } }), ArtifactLayoutError);
  assert.throws(() => writeArtifactRecord({ layout, category: 'summary', filename: '../bad.json', content: 'bad' }), ArtifactLayoutError);
  assert.throws(() => writeArtifactRecord({ layout, category: 'summary', filename: 'hash.txt', content: 'actual', expectedHash: sha256('expected') }), ArtifactLayoutError);

  writeFileSync(handoff.path, 'tampered', 'utf8');
  assert.throws(() => verifyArtifactRecord(handoff), ArtifactLayoutError);

  console.log('Artifact layout tests OK');
} finally {
  rmSync(root, { recursive: true, force: true });
}
