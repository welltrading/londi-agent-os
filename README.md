# Londi Agent OS MVP

Local-first orchestration system for running approved agent pipelines over Git worktrees.

## Current implementation slice

This repository currently covers **E0-T01 — repository/package structure**, **E0-T02 — compatibility manifest**, **E0-T03 — local configuration/data paths**, **E0-T04 — Windows Service lifecycle skeleton**, **E0-T05 — Local API authentication baseline**, **E0-T06 — logging/requestId/redaction baseline** and **E0-T07 — SQLite bootstrap/migrations baseline**.

Included packages:

- `apps/ui` — future local UI shell.
- `apps/local-api` — future local API and service entrypoint.
- `packages/contracts` — shared domain/API contracts, including the E0-T02 compatibility manifest.
- `packages/orchestrator` — orchestrator package placeholder.
- `packages/migrations` — migration package placeholder.
- `packages/adapters` — adapter package boundary only; no active adapters are implemented in E0-T01.
- `tests` — smoke checks for the foundation.
- `docs/compatibility.md` — supported OS/runtime/CLI/schema baseline.
- `docs/configuration.md` — local config, data paths, ports and retention baseline.
- `docs/windows-service.md` — local API service lifecycle and Windows service plan.
- `docs/local-api-auth.md` — localhost auth, CORS and request-limit baseline.
- `docs/logging-redaction.md` — structured logging, request IDs and redaction baseline.
- `docs/sqlite-migrations.md` — SQLite bootstrap, migrations, rollback and backup baseline.

Source of truth: `/a0/usr/workdir/specs/2026-07-13-londi-agent-os-execution-spec.md`.
