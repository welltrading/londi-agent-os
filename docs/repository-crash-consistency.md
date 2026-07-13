# Repository Tests and Crash Consistency

E1-T07 adds a repository-focused suite for transaction rollback, lock constraints, corruption/fault style checks and state-machine coverage.

Runtime source of truth:

- `tests/repository-crash-consistency.test.mjs`
- `packages/migrations/src/index.js`
- `packages/orchestrator/src/state-machine.js`

## Covered checks

- SQLite migration reaches the current schema version.
- Transaction rollback prevents partial state/event writes when a crash occurs before Audit.
- Repository constraints reject invalid locks and duplicate active attempts.
- 100 fault-injection transitions keep matching event and Audit records.
- Event ordering stays monotonic by `eventId`.
- State-machine coverage touches at least 90% of Run states.
- Command pipeline failure does not duplicate external publication side effects.

## CI wiring

`npm test` now runs both the smoke suite and the repository crash-consistency suite. `npm run test:integration` runs the crash-consistency suite directly.
