# E4-T06 Checkpoint Model and Artifact Layout

Each run has a fixed artifact layout containing:

- `manifest.json`
- `checkpoints/`
- `logs/`
- `context/`
- `handoff/`
- `review/`
- `summary/`
- `exports/`

## Rules

- Artifact writes use the atomic artifact writer.
- Artifact records include category, filename, path, size, hash and metadata.
- Checkpoints reject secret-like values.
- Hash mismatch is detected by record verification and expected-hash writes.
- Handoff and review revisions are preserved in the manifest revision map.
