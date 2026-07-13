# Londi Agent OS MVP

Local-first orchestration system for running approved agent pipelines over Git worktrees.

## Current implementation slice

This repository currently covers **E0-T01 — repository/package structure** and **E0-T02 — compatibility manifest**.

Included packages:

- `apps/ui` — future local UI shell.
- `apps/local-api` — future local API and service entrypoint.
- `packages/contracts` — shared domain/API contracts, including the E0-T02 compatibility manifest.
- `packages/orchestrator` — orchestrator package placeholder.
- `packages/migrations` — migration package placeholder.
- `packages/adapters` — adapter package boundary only; no active adapters are implemented in E0-T01.
- `tests` — smoke checks for the foundation.
- `docs/compatibility.md` — supported OS/runtime/CLI/schema baseline.

Source of truth: `/a0/usr/workdir/specs/2026-07-13-londi-agent-os-execution-spec.md`.
