# E7-T02 Restart Recovery

Restart recovery produces a consistency report after service restart before the user can Resume, Replace, or Stop.

## Baseline behavior

- Runs recover into `Recovery Required`; there is no automatic resume.
- Controlled service shutdown requires a saved checkpoint and closed child processes before the state transition is allowed.
- Checkpoint, artifact manifest, workspace manifest/path, child process snapshot and external effects are verified.
- Resume is enabled only after all recovery guards are verified and still requires explicit user approval.
- Replace is blocked when an external effect is `Unknown`.
- Stop remains available once a safe checkpoint exists.

The recovery report is user-decision oriented and never silently restarts agent work. A restart can only present Resume / Replace / Stop choices; it does not dispatch adapter work by itself.
