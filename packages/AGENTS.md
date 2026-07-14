# DOX — packages/

## Purpose

Shared packages that define contracts, orchestration, adapter boundaries, and migrations.

## Ownership

- `contracts` owns shared schemas, compatibility, configuration, pipeline templates, and Phase 2 runtime contracts.
- `orchestrator` owns workflow/domain engines and safety gates.
- `adapters` owns adapter contracts/boundaries for approved local CLI agents.
- `migrations` owns SQLite migration boundaries.

## Local Contracts

- Shared contracts must remain framework-neutral and side-effect free.
- Adapter boundary rules must preserve no unauthorized active adapter implementation.
- Orchestrator owns domain execution policies; apps expose them through API/UI layers.

## Work Guidance

- Prefer adding shared types/helpers in `packages/contracts` before duplicating in apps.
- Export new public contract helpers from package `src/index.js`.
- Update docs/tests when a public contract changes.

## Verification

- `npm run type-check`
- `npm run build`
- Contract-specific tests in `tests/*contract*.test.mjs`.

## Child DOX Index

- `packages/contracts/AGENTS.md` — shared contract rules.
- `packages/orchestrator/AGENTS.md` — orchestration/domain engine rules.
- `packages/adapters/AGENTS.md` — adapter boundary rules.
- `packages/migrations/AGENTS.md` — migration boundary rules.
