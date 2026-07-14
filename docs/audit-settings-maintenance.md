# E6-T08 Audit, Settings and Maintenance Shells

This UI model covers read-only Audit plus Settings and Maintenance shell screens.

## Acceptance behavior

- Audit timeline is read-only and supports filters plus JSONL export descriptors.
- Secrets are redacted before display in audit payloads, settings and maintenance data.
- Settings shells cover projects, Obsidian roots, adapters, retention and notifications.
- Maintenance shells cover backups and updates.
- Actions not implemented in the current slice are marked disabled and do not simulate success.
