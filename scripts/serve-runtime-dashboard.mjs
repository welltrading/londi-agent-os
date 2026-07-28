import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const host = process.env.LONDI_AGENT_OS_UI_HOST || '127.0.0.1';
const port = Number.parseInt(process.env.LONDI_AGENT_OS_UI_PORT || '3211', 10);
const root = resolve(process.cwd());
const entryPath = '/apps/ui/runtime-dashboard.html';
export const LOCAL_API_TOKEN_PLACEHOLDER = '%%LONDI_LOCAL_API_TOKEN%%';
const localApiToken = process.env.LONDI_AGENT_OS_LOCAL_API_TOKEN || '';

if (process.argv.includes('--check')) {
  assertRuntimeDashboardEntrypoint();
  console.log(`Runtime Dashboard entrypoint OK: http://${host}:${port}${entryPath}`);
  process.exit(0);
}

assertRuntimeDashboardEntrypoint();

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', `http://${host}:${port}`).pathname;
  const requestedPath = pathname === '/' ? entryPath : pathname;
  const filePath = resolve(join(root, normalize(decodeURIComponent(requestedPath))));

  if (!filePath.startsWith(`${root}${sep}`) && filePath !== root) {
    write(response, 403, 'Forbidden');
    return;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    write(response, 404, 'Not found');
    return;
  }

  // The entrypoint is the only response that carries the token, and it is never cached.
  if (filePath === join(root, normalize(entryPath))) {
    const html = readFileSync(filePath, 'utf8').replace(LOCAL_API_TOKEN_PLACEHOLDER, localApiToken);
    response.writeHead(200, { 'content-type': contentType(filePath), 'cache-control': 'no-store', pragma: 'no-cache' });
    response.end(html);
    return;
  }

  response.writeHead(200, { 'content-type': contentType(filePath) });
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Runtime Dashboard: http://${host}:${port}${entryPath}`);
  console.log('Local API expected at http://127.0.0.1:3210/api/v1');
});

function assertRuntimeDashboardEntrypoint() {
  const filePath = join(root, entryPath);
  if (!existsSync(filePath)) throw new Error(`Runtime Dashboard entrypoint is missing: ${entryPath}`);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`Invalid UI port: ${port}`);
}

function write(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(body);
}

function contentType(filePath) {
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml'
  }[extname(filePath)] ?? 'application/octet-stream';
}
