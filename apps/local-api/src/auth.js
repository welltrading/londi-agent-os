import { timingSafeEqual } from 'node:crypto';
import { createRequestId } from './logging.js';

export const LOCAL_API_AUTH_SCHEME = 'Bearer';
export const LOCAL_API_TOKEN_BYTES = 32;
export const DEFAULT_ALLOWED_ORIGIN = 'http://127.0.0.1:3211';
export const DEFAULT_REQUEST_LIMIT_BYTES = 1_048_576;

export class LocalApiAuthError extends Error {
  constructor(message, statusCode = 401, details = {}) {
    super(message);
    this.name = 'LocalApiAuthError';
    this.code = 'ERR_LOCAL_API_AUTH';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function createCredentialManagerTokenProvider(token) {
  assertValidLocalApiToken(token);
  return {
    source: 'windows-credential-manager',
    getToken() {
      return token;
    },
    describe() {
      return { source: 'windows-credential-manager', tokenBytes: LOCAL_API_TOKEN_BYTES };
    }
  };
}

export function assertValidLocalApiToken(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43,}$/.test(token)) {
    throw new LocalApiAuthError('Local API token must be a 256-bit URL-safe bearer token.', 500, {
      requiredBytes: LOCAL_API_TOKEN_BYTES
    });
  }
  return true;
}

export function createLocalApiSecurity(options = {}) {
  const allowedOrigin = options.allowedOrigin ?? DEFAULT_ALLOWED_ORIGIN;
  const requestLimitBytes = options.requestLimitBytes ?? DEFAULT_REQUEST_LIMIT_BYTES;
  const tokenProvider = options.tokenProvider;

  if (!tokenProvider?.getToken) {
    throw new LocalApiAuthError('A Credential Manager token provider is required.', 500);
  }
  assertValidLocalApiToken(tokenProvider.getToken());

  function applyCors(request, response) {
    const origin = request.headers.origin;
    if (!origin) return true;
    if (origin !== allowedOrigin) {
      writeJson(response, 403, { error: 'forbidden_origin' });
      return false;
    }
    response.setHeader('access-control-allow-origin', allowedOrigin);
    response.setHeader('vary', 'origin');
    response.setHeader('access-control-allow-headers', 'authorization, content-type, idempotency-key');
    response.setHeader('access-control-allow-methods', 'GET, POST, PATCH, PUT, OPTIONS');
    return true;
  }

  function enforce(request, response) {
    const requestId = request.headers['x-request-id']?.toString() || createRequestId();
    response.setHeader('x-request-id', requestId);
    if (request.url?.includes('access_token=') || request.url?.includes('token=')) {
      writeJson(response, 400, { error: 'token_in_query_forbidden', requestId });
      return false;
    }

    if (!applyCors(request, response)) return false;
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return false;
    }

    const lengthHeader = request.headers['content-length'];
    const contentLength = Number.parseInt(Array.isArray(lengthHeader) ? lengthHeader[0] : lengthHeader ?? '0', 10);
    if (Number.isFinite(contentLength) && contentLength > requestLimitBytes) {
      writeJson(response, 413, { error: 'request_too_large', requestId });
      return false;
    }

    const authorization = request.headers.authorization ?? '';
    if (!authorization.startsWith(`${LOCAL_API_AUTH_SCHEME} `)) {
      writeJson(response, 401, { error: 'missing_bearer_token', requestId });
      return false;
    }

    const presented = authorization.slice(`${LOCAL_API_AUTH_SCHEME} `.length);
    if (!safeEqual(presented, tokenProvider.getToken())) {
      writeJson(response, 401, { error: 'invalid_bearer_token', requestId });
      return false;
    }

    return true;
  }

  return {
    allowedOrigin,
    requestLimitBytes,
    credential: tokenProvider.describe(),
    enforce
  };
}

export function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
