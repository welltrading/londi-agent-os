import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ObsidianContextBrokerError,
  assertCandidateInsideApprovedRoots,
  createObsidianContextBroker,
  searchObsidianContext
} from '../packages/orchestrator/src/index.js';

const temp = mkdtempSync(join(tmpdir(), 'londi-obsidian-'));
try {
  const vault = join(temp, 'vault');
  const approved = join(vault, 'approved');
  const nested = join(approved, '02-Projects');
  const outside = join(temp, 'outside');
  mkdirSync(nested, { recursive: true });
  mkdirSync(outside, { recursive: true });

  writeFileSync(join(nested, 'AI Sales.md'), `---\ntitle: WhatsApp AI Sales Assistant\nclient: Example Clinic\nkeywords: whatsapp, sales, clinic\n---\n# WhatsApp AI Sales Assistant\nLinks to [[Lead Intake]] and #automation. Handles WhatsApp leads and Airtable follow up.\n`, 'utf8');
  writeFileSync(join(nested, 'Ops.md'), `---\ntitle: Operations Note\n---\n# Operations\nGeneral process note.\n`, 'utf8');
  writeFileSync(join(outside, 'Secret.md'), `---\ntitle: Secret WhatsApp Note\n---\nOutside root should not be scanned even with WhatsApp keyword.\n`, 'utf8');
symlinkSync(outside, join(approved, 'linked-outside'), directorySymlinkType());

  const broker = createObsidianContextBroker({ roots: [approved], now: '2026-01-01T00:00:00.000Z' });
  assert.equal(broker.roots.length, 1);
  assert.equal(Object.isFrozen(broker), true);

  const candidates = searchObsidianContext({ broker, query: 'WhatsApp clinic Lead Intake', limit: 5, includeRecentDays: 99999 });
  assert.equal(candidates.length, 1);
  const [candidate] = candidates;
  assert.equal(candidate.relativePath, '02-Projects/AI Sales.md');
  assert.equal(candidate.title, 'WhatsApp AI Sales Assistant');
  assert.equal(candidate.links.includes('Lead Intake'), true);
  assert.equal(candidate.reason.includes('title:whatsapp'), true);
  assert.equal(candidate.reason.includes('metadata:clinic'), true);
  assert.equal(candidate.reason.includes('links:lead'), true);
  assert.equal(candidate.excerpt.includes('WhatsApp'), true);
  assert.equal(candidate.hash.length, 64);
  assert.equal(assertCandidateInsideApprovedRoots(candidate, broker), true);
  assert.equal(candidates.some((item) => item.relativePath.includes('Secret.md')), false);

  const noMatch = searchObsidianContext({ broker, query: 'nonexistent', limit: 5 });
  assert.equal(noMatch.length, 0);

  assert.throws(() => createObsidianContextBroker({ roots: [] }), ObsidianContextBrokerError);
  assert.throws(() => createObsidianContextBroker({ roots: [join(temp, 'missing')] }), ObsidianContextBrokerError);
  assert.throws(() => searchObsidianContext({ broker, query: '', limit: 5 }), ObsidianContextBrokerError);
  assert.throws(() => assertCandidateInsideApprovedRoots({ path: join(outside, 'Secret.md') }, broker), ObsidianContextBrokerError);

  console.log('Obsidian context broker tests OK');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
function directorySymlinkType() {
  return process.platform === 'win32' ? 'junction' : 'dir';
}
