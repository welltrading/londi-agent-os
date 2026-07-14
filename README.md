# Londi Agent OS MVP

Local-first orchestration system for running approved agent pipelines over Git worktrees.

## Current implementation slice

This repository currently covers **E0-T01 — repository/package structure**, **E0-T02 — compatibility manifest**, **E0-T03 — local configuration/data paths**, **E0-T04 — Windows Service lifecycle skeleton**, **E0-T05 — Local API authentication baseline**, **E0-T06 — logging/requestId/redaction baseline**, **E0-T07 — SQLite bootstrap/migrations baseline** and **E0-T08 — CI/baseline checks** and **E1-T01 — domain model/SQLite entities** and **E1-T02 — Run/Step state machines** and **E1-T03 — command transaction pipeline** and **E1-T04 — idempotency/optimistic concurrency** and **E1-T05 — approval domain** and **E1-T06 — event store/audit append-only** and **E1-T07 — repository tests/crash consistency** and **E2-T01 — Git project validation/locking** and **E2-T02 — branch/worktree lifecycle** and **E2-T03 — service account isolation baseline** and **E2-T04 — process control baseline** and **E2-T05 — Git snapshot/diff baseline** and **E2-T06 — cleanup/retention guards** and **E2-T07 — workspace security suite** and **E3-T01 — Agent Adapter contract** and **E3-T02 — Capability Manifest registry** and **E3-T03 — Recommendation engine** and **E3-T04 — Claude Code Adapter** and **E3-T05 — Codex Adapter** and **E3-T06 — Heartbeat, timeout and attempt supervision**, **E3-T07 — Adapter contract parity** and **E4-T01 — Pipeline template definitions** and **E4-T02 — Pipeline Approval gate** and **E4-T03 — Handoff generation and revisions** and **E4-T04 — Review artifact** and **E4-T05 — Correction cycle engine** and **E4-T06 — Checkpoint model and artifact layout** and **E4-T07 — Acceptance gate** and **E4-T08 — Pipeline integration suite** and **E5-T01 — Obsidian Context Broker search** and **E5-T02 — Context approval and read-only snapshot** and **E5-T03 — Obsidian write-back** and **E5-T04 — Secret Broker and grants** and **E5-T05 — End-to-end redaction and quarantine** and **E5-T06 — Network grants and allowlist** and **E5-T07 — Tool catalog and dependency policy** and **E5-T08 — Full Preflight engine** and **E5-T09 — Security acceptance suite** and **E6-T01 — REST contracts and error model** and **E6-T02 — SSE stream and replay** and **E6-T03 — UI shell, auth and client state** and **E6-T04 — Dashboard and Approvals Inbox** and **E6-T05 — New Run Wizard and Pipeline Approval** and **E6-T06 — Run Detail** and **E6-T07 — Handoff, Review and Acceptance screens** and **E6-T08 — Audit, Settings and Maintenance shells** and **E6-T09 — UI/E2E baseline** and **E7-T01 — Checkpoint scheduling and safe shutdown** and **E7-T02 — Restart recovery**, **E8-T02 — Backup Manager**, **E8-T03 — Restore Workflow**, **E8-T04 — Stable Update and Rollback**, **E8-T05 — Performance and Scale Validation**, **E8-T06 — Security Hardening**, and **E8-T07 — Operations Runbook**.

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
- `reports/adapter-contract-parity.md` — automatic parity report for Claude Code and Codex contract coverage.
- `docs/pipeline-templates.md` — fixed Direct, Plan & Build, and Plan, Build & Review graph definitions.
- `docs/pipeline-approval-gate.md` — Gate A payload, approval and invalidation rules.
- `docs/handoff.md` — handoff.md generation, revisions, hash and Gate B approval rules.
- `docs/review-artifact.md` — review.md severity, evidence, required fix and blocking rules.
- `docs/correction-cycle.md` — Build -> Review correction cycle counter and exception rules.
- `docs/artifact-layout.md` — artifact manifest, checkpoints, logs, context, handoff, review, summary and exports layout.
- `docs/acceptance-gate.md` — Gate E locked acceptance snapshot and invalidation rules.
- `docs/pipeline-integration-suite.md` — UI-free internal scenarios for all three MVP pipeline templates.
- `docs/obsidian-context-broker.md` — approved-root Obsidian context candidate search.
- `docs/obsidian-context-approval.md` — approved read-only Obsidian context snapshot and agent injection.
- `docs/obsidian-writeback.md` — approved Obsidian Summary/Decisions/Insights/Follow-ups write-back.
- `docs/secret-broker.md` — scoped temporary secret grants and redacted injection.
- `docs/redaction-quarantine.md` — redaction surfaces and artifact quarantine on leaked secrets.
- `docs/network-grants.md` — scoped network grants, allowlist enforcement and external-effect replay blocking.
- `docs/tool-catalog.md` — tool metadata, read-only cache and dependency approval policy.
- `docs/preflight-engine.md` — full preflight checks and Ready/Warning/Blocked outcomes.
- `docs/security-acceptance-suite.md` — MVP threat cases and zero-secret-leakage acceptance.
- `docs/rest-contracts.md` — `/api/v1` endpoints, idempotency, concurrency and stable error model.
- `docs/sse-stream.md` — `/api/v1/events`, replay, heartbeat and stream reset behavior.
- `docs/ui-shell.md` — local UI shell, API/SSE clients, reconnect state and accessibility baseline.
- `docs/dashboard.md` — dashboard buckets, approvals inbox, action freshness and expected transitions.
- `docs/new-run-wizard.md` — task, Git project, template, acceptance, context, recommendations, preflight and Gate A preview.
- `docs/run-detail.md` — run state stepper, progress, filtered logs, artifacts, checkpoints and actions.
- `docs/handoff-review-acceptance-ui.md` — handoff revision diff, review severity, stale reload and locked acceptance snapshot UI behavior.
- `docs/audit-settings-maintenance.md` — read-only audit, settings shells, maintenance actions, redaction and disabled-state behavior.
- `docs/ui-e2e-baseline.md` — three UI run templates, reconnect, stale revision, long logs and WCAG baseline checks.
- `docs/checkpoint-scheduler.md` — checkpoint cadence, secret-free checkpoint artifacts and safe shutdown to Recovery Required.
- `docs/restart-recovery.md` — restart consistency report, no auto-resume, and guarded Resume/Replace/Stop actions.
- `docs/runbook.md` — install/start/stop, diagnostics, recovery, backup/restore, update/rollback, cleanup and known limitations.

Source of truth: `/a0/usr/workdir/specs/2026-07-13-londi-agent-os-execution-spec.md`.
