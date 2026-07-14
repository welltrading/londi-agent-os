# E8-T09 Traceability and Release Decision

E8-T09 closes the MVP with full traceability and an explicit release decision.

## Decision

**Go** — all automated gates pass, all traceability rows are mapped to passing checks, there are no open Critical defects, and non-critical deferred items require explicit approval.

## Traceability scope

Runtime source of truth:

- `packages/orchestrator/src/release-decision.js`
- `tests/release-decision.test.mjs`

Coverage requirements:

| Scope | Count | Status |
|---|---:|---|
| FR-001–FR-030 | 30 | 100% mapped to passing checks |
| NFR-001–NFR-015 | 15 | 100% mapped to passing checks |
| Q1–Q34 | 34 | 100% mapped to passing checks |
| MVP Acceptance A1–A18 | 18 | 100% mapped to passing checks |

Total traceability rows: **97**.

## Defect policy

- Critical defects cannot remain Open or Deferred.
- Deferred non-critical defects require `approvedBy`.
- Closed defects can remain in the register for evidence.
- If CI fails, release decision is automatically `No-Go`.

## Evidence commands

- `npm run ci`
- `node tests/release-decision.test.mjs`
- `node tests/acceptance-runs.test.mjs`
- `node tests/security-hardening.test.mjs`
- `node tests/performance-scale-validation.test.mjs`

## Current release rationale

The implementation has coverage across domain, Git/worktree, adapters, pipeline gates, Obsidian context, Secret Broker, REST/SSE contracts, UI shells, recovery, retention, backup/restore, stable update, security hardening, runbook, five acceptance runs, and release traceability.

No Critical defect is permitted for Go. Non-critical deferred defects, if any, must be documented and approved in the release decision object.
