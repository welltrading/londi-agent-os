# Idempotency and Optimistic Concurrency

E1-T04 defines the baseline for safe command replay and stale revision protection.

Runtime source of truth:

- `packages/orchestrator/src/idempotency.js`
- `tests/smoke.test.mjs`

## Idempotency

- Every mutating command must provide an idempotency key and fingerprint.
- Replaying the same key with the same fingerprint returns the original result.
- Replaying does not execute the side effect again.
- Reusing a key with a different fingerprint raises `IdempotencyConflictError`.
- Commands whose external effect state is `Unknown` block replay with `IdempotencyReplayError`.

## Optimistic concurrency

- Aggregates expose integer resource revisions.
- Mutating commands must send the revision they observed.
- `assertFreshRevision` accepts only an exact match.
- A stale revision raises `StaleRevisionError`, equivalent to a conflict/stale revision API response.

## SQLite support

`createSqliteIdempotencyStore` provides the persistence shape for command results: key, fingerprint, external effect state and safe JSON result.
