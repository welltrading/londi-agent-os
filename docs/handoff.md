# E4-T03 Handoff Generation and Revisions

Gate B controls the handoff from planning into build execution.

## Artifact

The artifact is always named `handoff.md` and contains the required sections:

- Objective
- Approved Scope
- Context Summary
- Implementation Instructions
- Constraints
- Acceptance Criteria
- Allowed Files
- Required Checks

## Revision rules

- Each handoff revision has a content hash.
- Gate B approval is bound to the exact handoff revision hash.
- Build may start only from a handoff revision marked as approved by Gate B.
- Editing `handoff.md` after approval creates a new revision/hash and invalidates the previous approval for Build.
- The Build step must receive the exact approved handoff revision; stale Gate B decisions cannot approve changed content.
- Raw conversation text, chat logs and transcripts are rejected from the handoff artifact.

## Plan & Build gate proof

`tests/plan-build-handoff-gate.test.mjs` verifies the Plan & Build contract:

- the `plan-build` template requires a handoff for the Build step;
- Build is blocked before Gate B approval;
- Build can start with the exact approved `handoff.md` revision;
- changing the handoff content produces a new hash and blocks Build until re-approved.
