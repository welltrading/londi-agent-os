# E8-T03 Restore Workflow

Restore Workflow restores from a verified backup under maintenance controls.

## Gates

- Restore is blocked when active runs exist.
- Restore requires a pre-restore snapshot.
- Backup integrity must pass before restore.
- Compatibility manifest must be supported.
- Full preflight must not be blocked.

## SLA

The workflow models the acceptance target: restoring up to 1GB must complete within 15 minutes. The execution result reports `withinSla`.

## Health verification

After restore, the workflow verifies restored file hashes, compatibility, and preflight health before marking the restore `Verified`.
