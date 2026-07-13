# E4-T04 Review Artifact

The review artifact is always named `review.md`.

## Required sections

- Summary
- Findings
- Failed Tests
- Required Fixes
- Decision

Each finding carries severity, evidence, required fix and an optional sensitive flag.

## Blocking rules

- `High` and `Critical` severities block continuation.
- Blocking findings require at least one required fix.
- A `Critical` finding marked sensitive creates an immediate approval gate.
- If the reviewer and builder are the same agent, the artifact includes a self-review warning.
