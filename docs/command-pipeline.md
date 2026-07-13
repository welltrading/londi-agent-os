# Command Transaction Pipeline

E1-T03 defines the command execution order used by the orchestrator.

Runtime source of truth:

- `packages/orchestrator/src/command-pipeline.js`
- `tests/smoke.test.mjs`

## Fixed order

1. Validation
2. Guard evaluation
3. SQLite/application transaction for state, event and audit
4. Atomic artifact write, when required
5. SSE/publication after durable state exists

## Failure behavior

- Guard/validation failures abort before transaction, artifact write and publication.
- Transaction failures are wrapped as `CommandPipelineError` before publication.
- Required artifact hash mismatch raises `ArtifactMismatchError`, records mismatch through the callback hook, and does not publish SSE.
- Atomic artifacts are written through a temporary file and rename.

## Recovery rule

A required artifact mismatch is the pipeline signal for moving the owning run toward `Recovery Required` in the command layer that owns the state transition.
