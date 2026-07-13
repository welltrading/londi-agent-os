# Event Store and Append-Only Audit

E1-T06 defines the baseline event stream and Audit model before REST/SSE implementation.

Runtime source of truth:

- `packages/orchestrator/src/event-store.js`
- `tests/smoke.test.mjs`

## Event ordering

- Every event receives a monotonically increasing `eventId`.
- `eventId` determines logical order even if UTC timestamps move backward because of clock changes.
- Replay can request events after a known `eventId`.

## Audit

- Audit entries must reference an existing event.
- Audit entries include actor, action, target, result, run/step scope and redacted metadata.
- Audit is append-only at the application layer.
- Update/delete operations raise `AuditAppendOnlyError`.

## Export readiness

The in-memory store already supports JSON and CSV export shapes so future REST endpoints can expose run-scoped Audit export without changing the domain contract.
