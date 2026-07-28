import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const ignored = new Set(['.git', 'node_modules', 'data', 'coverage', 'dist']);
const allowedExtensions = new Set(['.js', '.mjs', '.json', '.md', '.yml', '.yaml', '.html']);
const secretPattern = /(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
const forbiddenText = /TODO|TBD|FIXME/;
const queryTokenPattern = /[?&](access_)?token=\$?\{?[A-Za-z0-9_]+/;
// Served HTML reaches the browser verbatim, so a bearer token assigned there is shipped to every
// viewer. Tokens must be injected into the response at request time instead.
const htmlBearerTokenPattern = /(token|bearer|authorization)\s*[:=]\s*['"][A-Za-z0-9_-]{32,}['"]/i;
const findings = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    if (entry.isFile()) inspectFile(path);
  }
}

function inspectFile(path) {
  const rel = relative(root, path);
  const ext = rel.slice(rel.lastIndexOf('.'));
  if (!allowedExtensions.has(ext) && !rel.endsWith('package-lock.json')) return;
  if (statSync(path).size > 1_000_000) return;
  const text = readFileSync(path, 'utf8');
  if (secretPattern.test(text)) findings.push(`${rel}: possible hard-coded credential`);
  if (forbiddenText.test(text) && !rel.endsWith('check-source-hygiene.mjs')) findings.push(`${rel}: unresolved TODO/TBD/FIXME marker`);
  if (queryTokenPattern.test(text) && !rel.endsWith('auth.js') && !rel.endsWith('smoke.test.mjs')) findings.push(`${rel}: token appears in query string`);
  if (ext === '.html' && htmlBearerTokenPattern.test(text)) findings.push(`${rel}: hard-coded bearer token in HTML`);
}

walk(root);

if (findings.length) {
  console.error('Source hygiene failed:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log('Source hygiene OK: no obvious secrets, TODO markers, or unsafe token query usage.');
