# E6-T06 Run Detail

Run Detail exposes the per-run state stepper, progress, filtered logs, artifacts, checkpoints and available actions.

## Acceptance behavior

- Event rendering supports the latest 2,000 events with cursor pagination.
- Log filters support type, severity and text matching.
- State and severity are never color-only: each visual token includes text labels and icons.
- Artifacts and checkpoints are normalized for UI display.
- The UI creates REST request envelopes only and does not invoke CLI tools.
