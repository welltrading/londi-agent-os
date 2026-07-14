# E6-T01 REST Contracts and Error Model

All REST contracts live under `/api/v1`, require Bearer authentication, and return `requestId` plus a resource version.

## Contract rules

- Write commands require `Idempotency-Key`.
- Concurrency-sensitive commands require `If-Match`.
- Paginated reads normalize cursor/limit metadata.
- Error payloads use stable codes and safe redacted messages.
- Response payloads are redacted before being returned.

## Stable error codes

`validation`, `unauthorized`, `forbidden`, `conflict`, `stale_revision`, `blocked_preflight`, `invalid_transition`, `not_found`, `rate_limited`, `internal`, and `idempotency_required`.
