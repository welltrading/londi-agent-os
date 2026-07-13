# SQLite Bootstrap and Migrations Baseline

E0-T07 defines the first SQLite bootstrap and migration runner.

Runtime source of truth:

- `packages/migrations/src/index.js`

## Baseline

| Control | E0-T07 behavior |
|---|---|
| Database creation | Creates parent directory and SQLite DB on first migration run |
| Schema version | `schema_migrations` stores applied versions; current version is `1` |
| Idempotency | Re-running migrations skips already-applied versions |
| Transaction safety | All pending migrations run inside one `BEGIN IMMEDIATE` transaction |
| Rollback | Failed migration rolls back partial schema changes |
| Backup guard | Existing DB is copied to configured backups path before migration |
| Transaction helper | `withTransaction()` commits successful work and rolls back thrown work |

Initial schema contains foundation tables for `schema_migrations`, `runs` and `audit_events`.
