# Run and Step State Machines

E1-T02 defines guarded state transitions for Runs and Steps.

Runtime source of truth:

- `packages/orchestrator/src/state-machine.js`
- `tests/smoke.test.mjs`

## Run states

`Draft`, `Preflight Running`, `Blocked`, `Ready`, `Awaiting Pipeline Approval`, `Preparing Workspace`, `Running`, `Awaiting Approval`, `Unresponsive`, `Recovery Required`, `Awaiting Acceptance`, `Accepted`, `Needs Attention`, `Failed`, `Cancelled`, `Completed`, `Maintenance Hold`.

## Step states

`Pending`, `Ready`, `Running`, `Awaiting Approval`, `Unresponsive`, `Retrying`, `Succeeded`, `Failed`, `Cancelled`, `Skipped`.

## Rules enforced in code

- Illegal state/event pairs throw `StateTransitionError` and return no partial transition.
- Guards must pass before a target state is returned.
- `Accepted` is not final and does not start retention.
- Only `Completed` starts seven-day completed-run retention.
- `Completed` transition requires merge verification metadata: `acceptedAt`, `mergeVerifiedAt`, and `targetCommit`.
- Open runs can be cancelled by `Controlled Stop` only when no state transaction is open.
- Active runs move to `Recovery Required` on `Service shutdown` only after checkpoint and child-process closure.
