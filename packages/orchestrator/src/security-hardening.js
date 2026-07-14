import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { assertSecurityAcceptancePassed, runSecurityAcceptanceSuite } from './security-acceptance-suite.js';

export const SECURITY_HARDENING_VERSION = 1;
export const SECURITY_BLOCKING_SEVERITIES = Object.freeze(['Critical', 'High']);
export const SECURITY_ALLOWED_LOCAL_BIND = '127.0.0.1';
export const SECURITY_REQUIRED_TOKEN_BITS = 256;
export const SECURITY_REQUIRED_CORS_MODE = 'exact-origin';

export class SecurityHardeningError extends Error {
  constructor(message = 'Security hardening validation failed.', code = 'ERR_SECURITY_HARDENING', details = {}) {
    super(message);
    this.name = 'SecurityHardeningError';
    this.code = code;
    this.details = details;
  }
}

export function validateLocalSecurityPosture({ health, allowedOrigin } = {}) {
  if (!health?.security) throw new SecurityHardeningError('Health security section is required.', 'ERR_SECURITY_HEALTH');
  const checks = [
    hardeningCheck('local-bind', health.security.bind === SECURITY_ALLOWED_LOCAL_BIND, health.security.bind, SECURITY_ALLOWED_LOCAL_BIND),
    hardeningCheck('token-strength', Number(health.security.tokenBytes) * 8 >= SECURITY_REQUIRED_TOKEN_BITS, Number(health.security.tokenBytes) * 8, SECURITY_REQUIRED_TOKEN_BITS),
    hardeningCheck('cors-exact-origin', typeof health.security.allowedOrigin === 'string' && health.security.allowedOrigin === allowedOrigin && !health.security.allowedOrigin.includes('*'), health.security.allowedOrigin, allowedOrigin),
    hardeningCheck('credential-manager-source', health.security.credentialSource === 'windows-credential-manager', health.security.credentialSource, 'windows-credential-manager'),
    hardeningCheck('request-limit-configured', Number.isInteger(health.security.requestLimitBytes) && health.security.requestLimitBytes > 0, health.security.requestLimitBytes, 'positive integer')
  ];
  return deepFreezeHardening({ passed: checks.every((check) => check.passed), checks });
}

export function scanSecretCorpus({ root, knownSecrets = [], ignored = ['.git', 'node_modules', 'data', 'coverage', 'dist'], maxFileBytes = 1_000_000 } = {}) {
  if (!root) throw new SecurityHardeningError('root is required for secret corpus scan.', 'ERR_SECRET_SCAN_ROOT');
  const findings = [];
  const patterns = [
    { id: 'known-secret', pattern: knownSecrets.filter(Boolean).map(escapeRegExp) },
    { id: 'openai-key', pattern: [/sk-[A-Za-z0-9_-]{20,}/] },
    { id: 'github-token', pattern: [/ghp_[A-Za-z0-9]{20,}/] },
    { id: 'aws-access-key', pattern: [/AKIA[0-9A-Z]{16}/] },
    { id: 'private-key', pattern: [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/] },
    { id: 'bearer-token', pattern: [/Bearer\s+[A-Za-z0-9._~+\/-]{20,}=*/] }
  ];
  walk(root, ignored, (path) => {
    if (statSync(path).size > maxFileBytes) return;
    const text = readFileSync(path, 'utf8');
    for (const item of patterns) {
      for (const pattern of item.pattern) {
        const regex = typeof pattern === 'string' ? new RegExp(pattern, 'g') : pattern;
        if (regex.test(text)) findings.push({ file: relative(root, path), type: item.id, severity: 'Critical' });
      }
    }
  });
  return deepFreezeHardening({ passed: findings.length === 0, findings });
}

export function evaluateDependencyScan({ npmAudit = null, packageLock = null } = {}) {
  const vulnerabilities = normalizeNpmAudit(npmAudit);
  const criticalOpen = vulnerabilities.filter((item) => SECURITY_BLOCKING_SEVERITIES.includes(item.severity));
  const lockfilePresent = Boolean(packageLock?.lockfileVersion || packageLock?.packages);
  return deepFreezeHardening({ passed: lockfilePresent && criticalOpen.length === 0, lockfilePresent, vulnerabilities, criticalOpen });
}

export function createFinalLeakageScanReport({ threatReport, dependencyScan, localSecurity, secretCorpus, generatedAt = new Date().toISOString() } = {}) {
  if (!threatReport || !dependencyScan || !localSecurity || !secretCorpus) throw new SecurityHardeningError('All security hardening evidence is required.', 'ERR_HARDENING_EVIDENCE');
  assertSecurityAcceptancePassed(threatReport);
  const checks = [
    hardeningCheck('threat-suite', threatReport.passed === true && threatReport.zeroSecretLeakage === true, threatReport.summary, 'passed'),
    hardeningCheck('dependency-scan', dependencyScan.passed === true, dependencyScan.criticalOpen, 'no Critical/High'),
    hardeningCheck('local-bind-auth-cors', localSecurity.passed === true, localSecurity.checks, 'passed'),
    hardeningCheck('secret-corpus', secretCorpus.passed === true, secretCorpus.findings, 'no findings')
  ];
  return deepFreezeHardening({ version: SECURITY_HARDENING_VERSION, generatedAt, passed: checks.every((check) => check.passed), blockingOpen: checks.filter((check) => !check.passed), checks });
}

export function runFinalSecurityHardening({ root, health, allowedOrigin, knownSecrets = [], npmAudit = null, packageLock = null, now = new Date().toISOString() } = {}) {
  const threatReport = runSecurityAcceptanceSuite({ knownSecrets, now });
  const dependencyScan = evaluateDependencyScan({ npmAudit, packageLock });
  const localSecurity = validateLocalSecurityPosture({ health, allowedOrigin });
  const secretCorpus = scanSecretCorpus({ root, knownSecrets });
  return createFinalLeakageScanReport({ threatReport, dependencyScan, localSecurity, secretCorpus, generatedAt: now });
}

function normalizeNpmAudit(npmAudit) {
  if (!npmAudit) return [];
  if (Array.isArray(npmAudit.vulnerabilities)) return npmAudit.vulnerabilities.map((item) => ({ name: item.name ?? 'unknown', severity: normalizeSeverity(item.severity) }));
  if (npmAudit.vulnerabilities && typeof npmAudit.vulnerabilities === 'object') return Object.entries(npmAudit.vulnerabilities).map(([name, value]) => ({ name, severity: normalizeSeverity(value.severity) }));
  return [];
}

function normalizeSeverity(value) {
  const text = String(value ?? '').toLowerCase();
  if (text === 'critical') return 'Critical';
  if (text === 'high') return 'High';
  if (text === 'moderate') return 'Medium';
  if (text === 'low') return 'Low';
  return 'Info';
}

function walk(dir, ignored, visit) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignored.includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, ignored, visit);
    if (entry.isFile() && /\.(js|mjs|json|md|yml|yaml|env|txt)$/i.test(entry.name)) visit(path);
  }
}

function hardeningCheck(id, passed, actual, expected) { return Object.freeze({ id, passed: Boolean(passed), actual, expected }); }
function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function deepFreezeHardening(value) { if (!value || typeof value !== 'object') return value; for (const child of Object.values(value)) deepFreezeHardening(child); return Object.freeze(value); }
