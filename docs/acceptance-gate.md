# E4-T07 Acceptance Gate

Gate E locks the final acceptance snapshot before the run can move from `Awaiting Acceptance` to `Accepted`.

## Snapshot sections

- diff
- tests
- review
- risks
- artifacts

## Rules

- The snapshot is locked and hash-bound.
- Accept maps to `Accepted`.
- Request Changes maps to `Needs Attention` and requires a saved reason.
- Any change to diff, tests, review, risks or artifacts invalidates the existing acceptance request.
