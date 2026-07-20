# Current Repo Snapshot — Londi Agent OS MVP

Date: 2026-07-20  
Spec: `specs/2026-07-20-londi-agent-os-execution-spec.md`  
Purpose: Slice 0 baseline for building against the Target Spec + Gap-to-current-repo.

## Summary

The repository is not greenfield. It already contains a broad MVP skeleton with packages, docs, tests, UI model modules, Local API contracts, orchestrator modules, migrations, adapters, and operational docs.

However, this snapshot treats existing code as implementation evidence only. The product source of truth remains the brainstorm/spec decision chain:

- `/a0/usr/workdir/brainstorms/2026-07-12-londi-agent-os.md`
- `/a0/usr/workdir/brainstorms/2026-07-19-londi-agent-os-execution-spec-grill.md`
- `specs/2026-07-20-londi-agent-os-execution-spec.md`

README claims broad slice completion, but build planning should verify real E2E behavior per slice rather than accepting README status as release evidence.

## Repo structure evidence

- `apps/local-api` — Local API shell, REST/SSE contract modules, HostConnector/runtime slices.
- `apps/ui` — UI model modules for dashboard, new run wizard, run detail, handoff/review/acceptance, audit/settings/maintenance, runtime dashboard.
- `packages/contracts` — shared constants, compatibility/configuration, pipeline templates.
- `packages/orchestrator` — state machine, workspace, process supervision, approvals, handoff, review, correction, artifacts, recovery, security, audit, backup/restore/retention, acceptance modules.
- `packages/adapters` — Claude Code and Codex adapter modules plus parity verification.
- `packages/migrations` — SQLite migration package.
- `docs` — extensive per-slice documentation.
- `tests` — broad smoke/integration/security/acceptance test set.
- `specs` — older runtime dashboard slice specs plus the new MVP execution spec.

## Verification performed in this snapshot

Commands run:

```bash
node --version
npm --version
npm run test:unit
node tests/workspace-manager.test.mjs
node tests/adapter-contract.test.mjs
node tests/adapter-contract-parity.test.mjs
node tests/pipeline-integration-suite.test.mjs
node tests/secret-broker.test.mjs
node tests/rest-contracts.test.mjs
node tests/sse-stream.test.mjs
npm run check:graph
```

Observed results:

- Node: `v22.22.0`
- npm: `9.2.0`
- `Smoke tests OK`
- `Workspace manager tests OK`
- `Adapter contract tests OK`
- `Adapter contract parity tests OK`
- `Pipeline integration suite tests OK`
- `Secret broker tests OK`
- `REST contract tests OK`
- `SSE stream tests OK`
- `Workspace graph OK: 6 packages, no cycles, no forbidden adapter implementation files.`

Note: `tests/state-machine.test.mjs` does not exist as a standalone file. State-machine coverage appears to be folded into smoke/other tests and should be made explicit if the spec requires direct state transition proof.

## Slice classification

| Slice | Area | Current status | Evidence | Next action |
|---|---|---|---|---|
| 0 | Repo/current-state scan | existing-needs-validation | This document created; targeted tests passed | Keep updated when scope changes |
| 1 | Core contracts + state machine | existing-needs-validation | `packages/orchestrator/src/state-machine.js`, `docs/state-machines.md`; no standalone `state-machine.test.mjs` | Add/confirm explicit lifecycle tests for `Accepted`/`Completed`/retention/recovery |
| 2 | SQLite + run artifacts | existing-needs-validation | `packages/migrations/src/index.js`, `artifact-layout.js`, `repository-crash-consistency.test.mjs`, `artifact-layout.test.mjs` | Verify schema includes all target entities and no secret value columns |
| 3 | Git worktree workspace | existing-needs-validation | `workspace-manager.js`; `workspace-manager.test.mjs` passed | Confirm real Git worktree lifecycle and cleanup guards against target spec |
| 4 | Agent Adapter contract | existing-needs-refactor | `packages/adapters/src/*`; adapter contract/parity tests passed | Normalize operation naming or document mapping from brainstorm names to current implementation names |
| 5 | Direct Pipeline E2E | existing-needs-validation | `pipeline-integration-suite.test.mjs` passed; `direct-pipeline-e2e.test.mjs` added and passed | Harness now proves Direct flow over real temp Git repo/worktree, adapter boundary, artifacts, Gate E acceptance, Gate F manual merge verification, and completion/retention trigger. Still not live LLM execution. |
| 6 | Plan & Build | existing-needs-validation | pipeline templates, approval gates, `handoff.js`, handoff tests exist; `plan-build-handoff-gate.test.mjs` added and passed | Gate B now has explicit proof that Build is blocked until exact approved `handoff.md` revision and handoff edits require re-approval |
| 7 | Review loop | existing-needs-validation | `review.js`, `correction-cycle.js`, review/correction tests exist and targeted checks passed | Existing tests prove two automatic Build → Review correction cycles, third attempt requires exception/Needs Attention, and Critical sensitive findings stop for approval |
| 8 | Preflight + permissions + Secret Broker | existing-needs-validation | `preflight-engine.js`, `secret-broker.js`, redaction/security modules exist; targeted security/preflight checks passed | Existing tests prove preflight Ready/Warning/Blocked behavior, Secret Broker alias-only grants, redaction/quarantine, security acceptance, local hardening, REST/SSE redaction |
| 9 | REST + SSE + basic UI | existing-needs-validation | REST/SSE contracts, Local API service, HostConnector routes, Runtime Dashboard static UI, and UI models exist; live runtime test added and passed | `runtime-live-service.test.mjs` verifies served static UI, live Local API health/routes, HostConnector project/runs/Obsidian write path, auth/CORS/idempotency guardrails, plus targeted REST/SSE/UI checks |
| 10 | Recovery / heartbeat / checkpoints | existing-needs-validation | `process-manager.js`, `checkpoint-scheduler.js`, `restart-recovery.js`, docs/tests exist; targeted recovery checks passed | Verified controlled service shutdown requires checkpoint + closed child processes, moves to `Recovery Required`, never auto-resumes, and Resume remains approval/guard gated |
| 11 | Audit / backup / retention | existing-needs-validation | event store, backup/restore/retention modules/docs/tests exist; audit export redaction added and targeted checks passed | Verified retention starts only at `Completed`, `Accepted` is never cleanup-eligible, retention scheduler/backup/restore paths pass, and Audit JSON/CSV export redacts known secrets/patterns |
| 12 | Acceptance suite of 5 consecutive runs | existing-needs-validation | `acceptance-runs.js`, `acceptance-runs.test.mjs`, docs exist; adapter boundary process supervision added and targeted checks passed | Verified five signed consecutive passing runs cover Claude Code/Codex, all MVP templates, real temp Git repos, manual Gate F merge verification, secret/restart/audit coverage, and controlled adapter process spawn/cancel boundary |

## Gap / Drift log

1. **Agent Zero / Hermes scope drift**
   - Existing runtime/dashboard direction includes four agent cards and Agent Zero/Hermes labels.
   - MVP active adapters are Claude Code + Codex only.
   - Guardrail: Agent Zero/Hermes may remain display/future/planned only; they must not become active execution adapters in MVP.

2. **README completion language vs release evidence**
   - README lists many slices as currently covered.
   - Release gate still requires verified E2E acceptance evidence.
   - Guardrail: treat README as status narrative, not proof of production readiness.

3. **Adapter operation naming mismatch — resolved for MVP skeleton**
   - Product brainstorm names the adapter contract as `startRun`, `sendTask`, `heartbeat`, `checkpoint`, `cancel`, `resume`, `getArtifacts`.
   - Current code keeps implementation names `start`, `deliverTask`, and `collectArtifacts`.
   - Resolution: `docs/adapter-contract.md` documents the public mapping and parity checks prove both active adapters implement the canonical operations.

4. **State-machine test visibility**
   - No standalone `tests/state-machine.test.mjs` file exists.
   - Current evidence is distributed across approval, handoff, acceptance, manual merge, completion/retention, restart recovery, and release-decision tests.
   - Guardrail: add a standalone state-machine test later if public release documentation needs one obvious proof file.

5. **Contract/model vs live runtime uncertainty — reduced for MVP skeleton**
   - Direct pipeline E2E and five-run acceptance harness now exercise real temporary Git repos, worktrees/branches, artifacts, manual Gate F merge verification, and adapter process spawn/cancel boundaries.
   - Guardrail: this still does not prove live Claude/Codex LLM execution; the harnesses use deterministic local process simulation for CI.

## Recommended next build step

Move to **release-readiness review / commit packaging**: inspect the combined diff, decide whether to split into logical commits, and only then consider live Claude/Codex smoke runs outside deterministic CI.

## Minimum follow-up checks

```bash
node tests/claude-code-adapter.test.mjs
node tests/codex-adapter.test.mjs
node tests/pipeline-templates.test.mjs
node tests/pipeline-approval-gate.test.mjs
node tests/handoff.test.mjs
node tests/review-artifact.test.mjs
node tests/correction-cycle.test.mjs
node tests/artifact-layout.test.mjs
node tests/restart-recovery.test.mjs
node tests/completion-retention.test.mjs
node tests/manual-merge.test.mjs
node tests/acceptance-runs.test.mjs
```

Run full `npm run ci` only after the next implementation change or before release decision, because it is broad and should not replace focused slice verification.
