# E6-T09 UI/E2E Baseline

This baseline defines automated UI scenario coverage for the core MVP screens.

## Acceptance behavior

- Three run templates are exercised: quick-fix, feature and research.
- Core screens covered: Dashboard, New Run Wizard, Run Detail, Handoff/Review/Acceptance, and Audit/Settings/Maintenance.
- Reconnect scenario covers disconnected → reconnecting → connected and stream reset behavior.
- Stale revision scenario requires reload and disables decisions until refresh.
- Long logs scenario validates the latest 2,000 events with pagination/virtualization metadata.
- Automated accessibility baseline targets WCAG 2.1 AA and verifies status labels/icons so UI state is not color-only.
