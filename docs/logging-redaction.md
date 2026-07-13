# Logging, Request ID and Redaction Baseline

E0-T06 defines the initial structured logging and redaction baseline.

Runtime source of truth:

- `apps/local-api/src/logging.js`
- `apps/local-api/src/auth.js`
- `apps/local-api/src/service-lifecycle.js`

## Baseline

| Control | E0-T06 behavior |
|---|---|
| Structured logs | JSON-compatible entries with timestamp, severity, event, requestId and payload |
| Request ID | `req_<uuid>` generated when absent; HTTP responses include `x-request-id` |
| Severity | `debug`, `info`, `warn`, `error`, `security` |
| Redaction | Known exact secrets plus token/password/secret/credential/API-key patterns |
| Log injection | CR/LF and Unicode line separators collapsed to spaces |
| Secret output | Tests assert secret corpus does not appear in log output |

The logger is intentionally dependency-free for the foundation slice.
