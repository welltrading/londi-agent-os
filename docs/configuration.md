# Local Configuration

E0-T03 defines the validated local configuration baseline.

Runtime source of truth:

- `packages/contracts/src/configuration.js` — schema, defaults and validation.
- `packages/orchestrator/src/configuration.js` — creation of approved local data directories only.

## Default local paths

| Setting | Default |
|---|---|
| Data root | `./data` |
| SQLite DB | `./data/db/londi-agent-os.sqlite` |
| Runs | `./data/runs` |
| Projects | `./data/projects` |
| Worktrees | `./data/worktrees` |
| Backups | `./data/backups` |
| Obsidian snapshots | `./data/obsidian-snapshots` |

## Ports and retention

| Setting | Default |
|---|---:|
| Local API port | `3210` |
| UI port | `3211` |
| Completed run retention | 7 days |
| Non-completed run retention | 30 days |
| Audit retention | 365 days |
| Cleanup interval | 24 hours |

## Guards

- Paths must be relative and stay inside the configured data root.
- Only approved data directories are created by `ensureApprovedDataDirectories()`.
- Invalid values throw `LocalConfigValidationError` with code `ERR_INVALID_LOCAL_CONFIG`.
- Secret-like keys such as token, password, credential, secret and API key are rejected from config.
