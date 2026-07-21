import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { sha256 } from './command-pipeline.js';

export const OBSIDIAN_CONTEXT_BROKER_VERSION = 1;
export const OBSIDIAN_ALLOWED_EXTENSIONS = Object.freeze(['.md', '.markdown']);

export class ObsidianContextBrokerError extends Error {
  constructor(message = 'Invalid Obsidian context broker operation.', details = {}) {
    super(message);
    this.name = 'ObsidianContextBrokerError';
    this.code = 'ERR_OBSIDIAN_CONTEXT_BROKER';
    this.details = details;
  }
}

export function createObsidianContextBroker({ roots = [], now = new Date().toISOString() } = {}) {
  if (!Array.isArray(roots) || roots.length === 0) throw new ObsidianContextBrokerError('At least one approved Obsidian root is required.');
  const approvedRoots = roots.map(normalizeApprovedRoot);
  const unique = new Map(approvedRoots.map((root) => [root.realPath, root]));
  return deepFreezeContext({ version: OBSIDIAN_CONTEXT_BROKER_VERSION, roots: [...unique.values()], now });
}

export function searchObsidianContext({ broker, query, limit = 10, includeRecentDays = 30 } = {}) {
  assertBroker(broker);
  if (!query || typeof query !== 'string') throw new ObsidianContextBrokerError('Search query is required.');
  if (!Number.isInteger(limit) || limit <= 0) throw new ObsidianContextBrokerError('Search limit must be a positive integer.', { limit });
  const queryTerms = tokenize(query);
  const candidates = [];
  for (const root of broker.roots) {
    for (const file of listMarkdownFilesInsideRoot(root)) {
      const candidate = buildCandidate({ root, file, queryTerms, includeRecentDays, now: broker.now });
      if (candidate.score > 0) candidates.push(candidate);
    }
  }
  return deepFreezeContext(candidates.sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath)).slice(0, limit));
}

export function assertCandidateInsideApprovedRoots(candidate, broker) {
  assertBroker(broker);
  if (!candidate?.path) throw new ObsidianContextBrokerError('Candidate path is required.');
  const candidateRealPath = realpathSync(resolve(candidate.path));
  const inside = broker.roots.some((root) => isInsideRoot(candidateRealPath, root.realPath));
  if (!inside) throw new ObsidianContextBrokerError('Candidate is outside approved Obsidian roots.', { path: candidate.path });
  return true;
}

function normalizeApprovedRoot(rootPath) {
  if (!rootPath || typeof rootPath !== 'string') throw new ObsidianContextBrokerError('Approved root must be a non-empty path string.');
  const absolutePath = resolve(rootPath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isDirectory()) throw new ObsidianContextBrokerError('Approved root must exist and be a directory.', { rootPath });
  return { path: absolutePath, realPath: realpathSync(absolutePath), name: basename(absolutePath) };
}

function assertBroker(broker) {
  if (!broker || broker.version !== OBSIDIAN_CONTEXT_BROKER_VERSION || !Array.isArray(broker.roots)) throw new ObsidianContextBrokerError('Invalid Obsidian context broker.');
  return true;
}

function listMarkdownFilesInsideRoot(root) {
  const files = [];
  walk(root.realPath, root.realPath, files);
  return files;
}

function walk(rootRealPath, currentRealPath, files) {
  for (const entry of readdirSync(currentRealPath, { withFileTypes: true })) {
    const next = join(currentRealPath, entry.name);
    const nextRealPath = realpathSync(next);
    if (!isInsideRoot(nextRealPath, rootRealPath)) continue;
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === '.obsidian' || entry.name === 'node_modules') continue;
      walk(rootRealPath, nextRealPath, files);
    } else if (entry.isFile() && OBSIDIAN_ALLOWED_EXTENSIONS.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
      files.push(nextRealPath);
    }
  }
}

function buildCandidate({ root, file, queryTerms, includeRecentDays, now }) {
  const content = readFileSync(file, 'utf8');
  const metadata = parseFrontmatter(content);
  const links = [...content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((match) => match[1]);
  const title = String(metadata.title ?? basename(file).replace(/\.markdown?$/i, ''));
  const haystacks = {
    title,
    metadata: Object.values(metadata).join(' '),
    links: links.join(' '),
    keywords: extractKeywords(content).join(' '),
    body: stripFrontmatter(content)
  };
  const reasons = [];
  let score = 0;
  for (const term of queryTerms) {
    if (haystacks.title.toLowerCase().includes(term)) { score += 10; reasons.push(`title:${term}`); }
    if (haystacks.metadata.toLowerCase().includes(term)) { score += 6; reasons.push(`metadata:${term}`); }
    if (haystacks.links.toLowerCase().includes(term)) { score += 5; reasons.push(`links:${term}`); }
    if (haystacks.keywords.toLowerCase().includes(term)) { score += 4; reasons.push(`keywords:${term}`); }
    if (haystacks.body.toLowerCase().includes(term)) { score += 2; reasons.push(`content:${term}`); }
  }
  const stat = statSync(file);
  const matchedQuery = score > 0;
  const recent = isRecent(stat.mtime, now, includeRecentDays);
  if (matchedQuery && recent) { score += 1; reasons.push('recency'); }
  return deepFreezeContext({
    path: file,
    relativePath: relative(root.realPath, file).replaceAll('\\', '/'),
    rootName: root.name,
    title,
    excerpt: createExcerpt(content, queryTerms),
    reason: [...new Set(reasons)].join(', '),
    hash: sha256(Buffer.from(content, 'utf8')),
    metadata,
    links,
    updatedAt: stat.mtime.toISOString(),
    score
  });
}

function parseFrontmatter(content) {
  if (!content.startsWith('---\n')) return {};
  const end = content.indexOf('\n---', 4);
  if (end === -1) return {};
  const block = content.slice(4, end).trim();
  const metadata = {};
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([^:#]+):\s*(.*)$/);
    if (match) metadata[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return metadata;
}

function stripFrontmatter(content) {
  if (!content.startsWith('---\n')) return content;
  const end = content.indexOf('\n---', 4);
  return end === -1 ? content : content.slice(end + 4);
}

function extractKeywords(content) {
  const tags = [...content.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)].map((match) => match[1]);
  const headings = [...content.matchAll(/^#{1,3}\s+(.+)$/gm)].map((match) => match[1]);
  return [...tags, ...headings];
}

function createExcerpt(content, queryTerms) {
  const body = stripFrontmatter(content).replace(/\s+/g, ' ').trim();
  const lower = body.toLowerCase();
  const index = queryTerms.map((term) => lower.indexOf(term)).filter((idx) => idx >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, index - 80);
  return body.slice(start, start + 220).trim();
}

function tokenize(query) {
  return [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length >= 2))];
}

function isRecent(candidate) {
  const maxAgeMs = candidate.maxAgeDays * 24 * 60 * 60 * 1000;
  return Date.now() - candidate.modifiedAt.getTime() <= maxAgeMs;
}

function isInsideRoot(candidateRealPath, rootRealPath) {
  const rel = relative(rootRealPath, candidateRealPath);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('/') && !rel.startsWith('\\') && rel !== '..');
}
