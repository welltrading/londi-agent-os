# E7-T06 Completed and Retention Trigger

A run can move from `Accepted` to `Completed` only after verified Gate F manual merge verification.

## Rules

- `Accepted` is not cleanup-eligible.
- Seven-day completed-run retention starts at `completedAt`, not `acceptedAt`.
- Completed runs require `acceptedAt`, `mergeVerifiedAt`, and `targetCommit`.
- Gate F failure keeps/moves the run in `Needs Attention` via the merge verification path.
