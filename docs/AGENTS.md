# DOX — docs/

## Purpose

Durable documentation, runbooks, architecture notes, contract summaries, and preview artifacts.

## Ownership

- Docs describe stable behavior and verification evidence.
- `docs/previews/` contains non-binding static previews unless explicitly wired to runtime.

## Local Contracts

- Keep docs current with contract/workflow changes.
- Do not describe unimplemented runtime behavior as live.
- Mark previews as static when not connected to Local API.

## Work Guidance

- Prefer concise operational docs over long historical notes.
- Update docs closest to the changed behavior.
- Add new docs only when they are durable references, not task diaries.

## Verification

- `node tests/runbook.test.mjs` for runbook-sensitive docs.
- Targeted tests associated with documented behavior.

## Child DOX Index

No child DOX files yet.
