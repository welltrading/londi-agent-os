# E8-T04 Stable Update and Rollback

Stable Update models safe weekly updates with side-by-side install, smoke tests, atomic switch and rollback.

## Gates

- Weekly stable-channel update check.
- No update while runs are active.
- Compatibility manifest must be supported.
- Pre-update backup snapshot is required and integrity-verified.
- Smoke tests must pass before atomic switch.

## Rollback

Rollback requires a verified pre-update snapshot. The failed side-by-side release is removed and the current marker is returned to the previous version.

## Version retention

The verifier requires at least two healthy versions: the current version and the newly installed stable version.
