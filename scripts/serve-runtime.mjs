import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { LOCAL_API_TOKEN_BYTES, assertValidLocalApiToken } from '../apps/local-api/src/auth.js';
import { sanitizeForLog } from '../apps/local-api/src/logging.js';

const root = resolve(process.cwd());
// Without a supplied token, mint one for this process only. It is passed to the two children in
// their environment and is never printed or written to disk.
const token = process.env.LONDI_AGENT_OS_LOCAL_API_TOKEN || randomBytes(LOCAL_API_TOKEN_BYTES).toString('base64url');
const apiUrl = 'http://127.0.0.1:3210/api/v1';
const uiUrl = 'http://127.0.0.1:3211/';
const entrypoint = join(root, 'apps/ui/runtime-dashboard.html');
const localApiEntry = join(root, 'apps/local-api/src/index.js');
const uiServerEntry = join(root, 'scripts/serve-runtime-dashboard.mjs');

if (process.argv.includes('--check')) {
  assertRuntimeServePlan();
  console.log('Runtime serve plan OK: Local API + Runtime Dashboard UI');
  process.exit(0);
}

assertRuntimeServePlan();

const children = new Set();
let shuttingDown = false;

startChild('local-api', ['node', ['apps/local-api/src/index.js', '--service'], { env: { ...process.env, LONDI_AGENT_OS_LOCAL_API_TOKEN: token } }]);
startChild('runtime-dashboard-ui', ['node', ['scripts/serve-runtime-dashboard.mjs'], { env: { ...process.env, LONDI_AGENT_OS_LOCAL_API_TOKEN: token } }]);

console.log(`Runtime dashboard UI: ${uiUrl}`);
console.log(`Local API: ${apiUrl}`);
console.log('The dashboard authenticates automatically over loopback. The token is not printed or stored.');

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

function assertRuntimeServePlan() {
  assertValidLocalApiToken(token);
  for (const filePath of [entrypoint, localApiEntry, uiServerEntry]) {
    if (!existsSync(filePath)) throw new Error(`Runtime serve dependency is missing: ${filePath}`);
  }
}

function startChild(label, commandSpec) {
  const [command, args, options] = commandSpec;
  const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], ...options });
  children.add(child);
  child.stdout.on('data', (chunk) => writeChildOutput(label, chunk));
  child.stderr.on('data', (chunk) => writeChildOutput(label, chunk, true));
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown && code !== 0) {
      console.error(`[${label}] exited unexpectedly`, sanitizeForLog({ code, signal }, [token]));
      shutdown(`${label}-exit`);
    }
  });
  return child;
}

function writeChildOutput(label, chunk, isError = false) {
  const text = sanitizeForLog(chunk.toString('utf8'), [token]);
  const stream = isError ? process.stderr : process.stdout;
  for (const line of text.split('\n').filter(Boolean)) stream.write(`[${label}] ${line}\n`);
}

async function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Stopping runtime services (${reason})...`);
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
    process.exit(0);
  }, 2_000).unref();
}
