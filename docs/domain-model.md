# Domain Model and SQLite Entities

E1-T01 defines the first persistent domain model over SQLite.

Runtime source of truth:

- `packages/migrations/src/index.js`
- `tests/smoke.test.mjs`

## Entities

| Entity | Persistence baseline |
|---|---|
| Project | Git repository path, target branch, vault scope, revision |
| Run | Task, pipeline type, state, Git/worktree metadata, retention and completion metadata |
| Step | Role, ordinal, adapter assignment, state, retry/correction counters |
| Agent | Adapter type, version, health and availability |
| CapabilityManifest | Capabilities, constraints, tools, context limit, permissions and health |
| Attempt | Step/agent execution, heartbeat, checkpoint and external-effect state |
| ApprovalRequest / Decision | Scope, payload/revision hash, expiry, actor and decision metadata |
| ContextSource | Approved context path/title/reason/hash |
| Artifact | Type, path, hash, size and attempt linkage |
| Checkpoint | Attempt sequence, path, hash and resumability |
| Event | Globally increasing `event_id`, type, severity and redacted payload |
| AuditEntry | Append-only event-linked audit metadata at application layer |
| SecretGrant | Alias-only grant metadata; no secret value column |
| PreflightResult | Status, checks and redacted evidence |
| DependencyApproval | Package/tool approval decision and checksum |
| BackupRecord | Backup path, kind, hash and integrity status |
| UpdateRecord | Version update/snapshot/test/result metadata |
| ObsidianWriteback | Draft/destination/approved hash/result metadata |

## Enforced constraints

- `Completed` runs require `accepted_at`, `merge_verified_at` and `target_commit`.
- Only one active attempt can exist per step.
- Agent adapter types are restricted to `claude-code` and `codex`.
- Preflight status is restricted to `Ready`, `Ready with Warnings` or `Blocked`.
- `secret_grants` stores `secret_alias` only and intentionally has no secret value field.
