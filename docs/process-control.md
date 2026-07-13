# Process control and Job Object baseline

Implemented for **E2-T04 — Job Object and child process control**.

Runtime source of truth:

- `packages/orchestrator/src/process-manager.js`
- `tests/process-manager.test.mjs`

## Guarantees

- Every attempt is tracked as a separate child process.
- Every attempt receives a deterministic Job Object name: `LondiAgentOS-<attempt-id>`.
- Cancel requests kill the attempt process tree and escalate from `SIGTERM` to `SIGKILL` when needed.
- The process manager refuses to control a process that is not the tracked child for the attempt.
- Blocked attempts to control a foreign process are recorded as `process.control.blocked` events.

## Verification

Negative and lifecycle coverage is in `tests/process-manager.test.mjs`:

- A spawned child process is cancelled and no longer appears in `ps`.
- Attempting to control the current test process through another attempt is blocked.
- Attempting to cancel an unknown attempt is blocked.

This is the Node/orchestrator baseline. Native Windows Job Object binding can be hardened later without changing the public orchestrator contract.
