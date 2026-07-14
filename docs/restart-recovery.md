# E7-T02 Restart Recovery

Restart recovery produces a consistency report after service restart before the user can Resume, Replace, or Stop.

## Baseline behavior

- Runs recover into `Recovery Required`; there is no automatic resume.
- Checkpoint, artifact manifest, workspace manifest/path, child process snapshot and external effects are verified.
- Resume is enabled only after all recovery guards are verified.
- Replace is blocked when an external effect is `Unknown`.
- Stop remains available once a safe checkpoint exists.

The recovery report is user-decision oriented and never silently restarts agent work.
