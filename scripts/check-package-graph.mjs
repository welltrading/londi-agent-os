import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const packageDirs = [
  'apps/ui',
  'apps/local-api',
  'packages/contracts',
  'packages/orchestrator',
  'packages/migrations',
  'packages/adapters'
];

const names = new Map();
for (const dir of packageDirs) {
  const manifestPath = join(root, dir, 'package.json');
  if (!existsSync(manifestPath)) throw new Error(`Missing package.json: ${dir}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!manifest.name) throw new Error(`Missing package name: ${dir}`);
  if (names.has(manifest.name)) throw new Error(`Duplicate package name: ${manifest.name}`);
  names.set(manifest.name, dir);
}

const edges = new Map([...names.keys()].map((name) => [name, []]));
for (const [name, dir] of names) {
  const manifest = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
  const deps = { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };
  for (const dep of Object.keys(deps)) {
    if (names.has(dep)) edges.get(name).push(dep);
  }
}

const visiting = new Set();
const visited = new Set();
function visit(name, trail = []) {
  if (visiting.has(name)) throw new Error(`Circular workspace dependency: ${[...trail, name].join(' -> ')}`);
  if (visited.has(name)) return;
  visiting.add(name);
  for (const dep of edges.get(name)) visit(dep, [...trail, name]);
  visiting.delete(name);
  visited.add(name);
}
for (const name of names.keys()) visit(name);

const adapterDir = join(root, 'packages/adapters');
const adapterFiles = readdirSync(adapterDir, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => /agent.?zero|hermes/i.test(name));
if (adapterFiles.length) throw new Error(`Forbidden active adapter file found: ${adapterFiles.join(', ')}`);

console.log(`Workspace graph OK: ${names.size} packages, no cycles, no forbidden adapter implementation files.`);
