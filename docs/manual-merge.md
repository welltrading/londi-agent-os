# E7-T05 Manual Merge Guidance and Verification

Gate F is manual-only merge verification.

## Rules

- Londi Agent OS never executes merge, rebase, cherry-pick or PR merge commands.
- The user manually merges outside the app.
- Gate F verifies the returned `targetCommit` against the target branch HEAD.
- Verification accepts branch containment or explicit patch-equivalence.
- Conflict, drift, test failure and verification failure move the run to `Needs Attention`.
- Successful verification stores `targetCommit` and allows transition to `Completed`.
