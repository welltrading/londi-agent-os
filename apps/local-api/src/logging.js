import { randomUUID } from 'node:crypto';

export const REDACTION_PLACEHOLDER = '[REDACTED]';
export const LOG_SEVERITIES = Object.freeze(['debug', 'info', 'warn', 'error', 'security']);

const CREDENTIAL_PATTERNS = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /ghp_[A-Za-z0-9]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{20,}/g,
  /Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /(token|password|secret|credential|api[_-]?key)=([^\s&]+)/gi,
  /([A-Za-z0-9_-]{43,})/g
];

export function createRequestId() {
  return `req_${randomUUID()}`;
}

export function sanitizeForLog(value, knownSecrets = []) {
  const secretSet = knownSecrets.filter(Boolean).map(String);
  let json = typeof value === 'string' ? value : JSON.stringify(value ?? null);

  for (const secret of secretSet) {
    json = json.split(secret).join(REDACTION_PLACEHOLDER);
  }

  for (const pattern of CREDENTIAL_PATTERNS) {
    json = json.replace(pattern, (match, key) => {
      if (key && /token|password|secret|credential|api[_-]?key/i.test(key)) return `${key}=${REDACTION_PLACEHOLDER}`;
      if (/^Bearer\s+/i.test(match)) return `Bearer ${REDACTION_PLACEHOLDER}`;
      return REDACTION_PLACEHOLDER;
    });
  }

  return json.replace(/[\r\n\u2028\u2029]+/g, ' ');
}

export function redactPayload(payload, knownSecrets = []) {
  return JSON.parse(sanitizeForLog(payload, knownSecrets));
}

export function createLogger(options = {}) {
  const sink = options.sink ?? [];
  const knownSecrets = options.knownSecrets ?? [];

  function log(severity, event, payload = {}, context = {}) {
    if (!LOG_SEVERITIES.includes(severity)) throw new Error(`Unsupported log severity: ${severity}`);
    const entry = {
      timestamp: new Date().toISOString(),
      severity,
      event: sanitizeForLog(event, knownSecrets),
      requestId: context.requestId ?? createRequestId(),
      payload: redactPayload(payload, knownSecrets)
    };
    sink.push(entry);
    return entry;
  }

  return {
    sink,
    debug: (event, payload, context) => log('debug', event, payload, context),
    info: (event, payload, context) => log('info', event, payload, context),
    warn: (event, payload, context) => log('warn', event, payload, context),
    error: (event, payload, context) => log('error', event, payload, context),
    security: (event, payload, context) => log('security', event, payload, context)
  };
}
