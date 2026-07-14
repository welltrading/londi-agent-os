# E8-T02 Backup Manager

Backup Manager creates daily, weekly and pre-maintenance backups with hashes and integrity verification.

## Included

- SQLite database file.
- Local config file.
- Run artifact manifests.
- Handoffs.
- Reviews.
- Summaries.

## Excluded

- Secrets and `.env*` files.
- Source code directories such as `apps/`, `packages/`, `tests/`.
- Git metadata and dependency directories.

## Retention

- 7 daily backups.
- 4 weekly backups.
- Pre-maintenance backups use the same short retention window as daily backups.

Every copied file has a SHA-256 hash; backup integrity re-reads all copied files and reports missing or changed content.
