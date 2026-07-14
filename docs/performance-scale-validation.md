# E8-T05 Performance and Scale Validation

Performance Scale Validation documents the acceptance evidence for NFR-003, NFR-004, NFR-011 and NFR-015.

## Targets

- REST read p95: <= 300ms.
- REST write p95 for local commands: <= 700ms.
- SSE event delivery p95: <= 1s.
- Scale dataset: 100 runs and 100,000 events.
- Log rotation: one file rotates at 20MB, up to five parts per attempt.
- Restore drill: 1GB dataset, integrity verified, completed within 15 minutes.

## Evidence model

The validation module calculates p95 metrics, creates a 100-run / 100,000-event dataset, verifies log rotation policy, and records restore-drill evidence against a 1GB sparse dataset.
