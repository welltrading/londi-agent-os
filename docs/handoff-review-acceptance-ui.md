# E6-T07 Handoff, Review and Acceptance Screens

This UI model covers the screens around Gate B handoff approval, review findings and Gate E acceptance.

## Acceptance behavior

- Handoff revisions expose a line-level revision diff and approval actions.
- Stale resource versions require reload before any approval, accept or request-changes action.
- Critical review findings are visually and textually prominent and block normal progress.
- Acceptance displays the locked snapshot sections: diff, tests, review, risks and artifacts.
- Accept and Request Changes are disabled when the snapshot is stale or unlocked.
- Visual states are not color-only; every status includes a label and icon.
