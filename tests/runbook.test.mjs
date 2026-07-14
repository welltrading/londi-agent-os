import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const text = readFileSync('docs/runbook.md', 'utf8');
const requiredHeadings = [
  '# E8-T07 Operations Runbook',
  '## Install',
  '## Start',
  '## Stop',
  '## Diagnostics',
  '## Recovery after crash or restart',
  '## Backup',
  '## Restore drill / restore production state',
  '## Stable update',
  '## Rollback',
  '## Cleanup',
  '## Known limitations',
  '## Operator acceptance checklist'
];
for (const heading of requiredHeadings) assert.equal(text.includes(heading), true, `missing ${heading}`);
for (const phrase of [
  '127.0.0.1',
  'npm run ci',
  'npm run security:scan',
  'pre-restore snapshot',
  'Verify backup integrity',
  'Install the target version side by side',
  'No automatic merge',
  'Claude Code and Codex only'
]) assert.equal(text.includes(phrase), true, `missing ${phrase}`);
assert.equal(new RegExp('TO' + 'DO|T' + 'BD|FIX' + 'ME').test(text), false);
console.log('Runbook tests OK');
