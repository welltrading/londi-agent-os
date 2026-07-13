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
- Raw conversation text, chat logs and transcripts are rejected from the handoff artifact.
