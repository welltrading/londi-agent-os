# E8-T01 Retention Scheduler

Daily retention cleanup is modeled as an auditable scheduler run with dry-run support.

## Policy

- `Completed`: cleanup-eligible after 7 days, only after merge verification metadata exists.
- `Failed`, `Cancelled`, `Needs Attention`: cleanup-eligible after 30 days.
- `Accepted`: never cleanup-eligible; it is waiting for manual merge verification.
- `keep: true`: blocks cleanup regardless of age.
- Audit retention: 365 days, with invalid/missing timestamps retained rather than deleted.

## Safety

- Dry-run is the default.
- Real cleanup requires repository path per eligible run.
- Every scheduler run emits an Audit entry.
- Completed cleanup may remove worktree and verified run branch; non-completed cleanup does not delete branches.
