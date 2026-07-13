# Londi Agent OS MVP

Local-first orchestration system for running approved agent pipelines over Git worktrees.

## Current implementation slice

This repository currently covers **E0-T01 — repository/package structure**, **E0-T02 — compatibility manifest**, **E0-T03 — local configuration/data paths**, **E0-T04 — Windows Service lifecycle skeleton**, **E0-T05 — Local API authentication baseline**, **E0-T06 — logging/requestId/redaction baseline**, **E0-T07 — SQLite bootstrap/migrations baseline** and **E0-T08 — CI/baseline checks** and **E1-T01 — domain model/SQLite entities** and **E1-T02 — Run/Step state machines** and **E1-T03 — command transaction pipeline** and **E1-T04 — idempotency/optimistic concurrency** and **E1-T05 — approval domain** and **E1-T06 — event store/audit append-only** and **E1-T07 — repository tests/crash consistency** and **E2-T01 — Git project validation/locking** and **E2-T02 — branch/worktree lifecycle** and **E2-T03 — service account isolation baseline** and **E2-T04 — process control baseline** and **E2-T05 — Git snapshot/diff baseline** and **E2-T06 — cleanup/retention guards** and **E2-T07 — workspace security suite** and **E3-T01 — Agent Adapter contract** and **E3-T02 — Capability Manifest registry** and **E3-T03 — Recommendation engine** and **E3-T04 — Claude Code Adapter** and **E3-T05 — Codex Adapter** and **E3-T06 — Heartbeat, timeout and attempt supervision**.

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
- `docs/ci-baseline.md` — CI workflow and baseline gate commands.
- `docs/domain-model.md` — SQLite domain entities and enforced constraints.
- `docs/state-machines.md` — guarded Run/Step state transitions.
- `docs/command-pipeline.md` — validation/guard/transaction/artifact/publication command order.
- `docs/idempotency-concurrency.md` — command replay and stale revision protections.
- `docs/approvals.md` — approval requests, decisions, stale checks and expiry rules.
- `docs/event-store-audit.md` — monotonic events and append-only Audit baseline.
- `docs/repository-crash-consistency.md` — transaction rollback, locks, fault injection and state-machine coverage checks.
- `docs/git-project-validation-locking.md` — Git-only project validation, dirty-state handling, target-branch locks, branch/worktree lifecycle, service-account isolation checks, Git snapshot/diff summaries and cleanup/retention guards and workspace escape security checks.
- `docs/process-control.md` — attempt child-process tracking, cancel/kill tree and foreign-process control blocking.
- `docs/adapter-contract.md` — adapter contract operations, normalized outcomes and descriptor/harness rules.
- `docs/capability-registry.md` — approved adapter registry, capabilities, compatibility and availability rules.
- `docs/recommendation-engine.md` — adapter filtering, ranking, override and top-three explanation rules.
- `docs/claude-code-adapter.md` — Claude Code CLI health/auth/version, process control and redaction behavior.
- `docs/codex-adapter.md` — Codex CLI health/auth/version, process control and redaction behavior.
- `docs/attempt-supervision.md` — heartbeat, unresponsive, failure and timeout decision timing policy.

Source of truth: `/a0/usr/workdir/specs/2026-07-13-londi-agent-os-execution-spec.md`.
