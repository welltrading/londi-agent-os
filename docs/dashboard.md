# E6-T04 Dashboard and Approvals Inbox

The UI dashboard model groups local API snapshots into active runs, waiting approvals, Needs Attention, and completed runs.

## Acceptance behavior

- Dashboard counts can be compared against API counts.
- Pending approvals populate the Approvals Inbox.
- Stale actions are marked `stale` and require reload before execution.
- Every action exposes an expected transition before the user acts.
- Needs Attention actions expose retry, replace-agent, and stop affordances.
