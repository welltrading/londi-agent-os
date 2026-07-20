<div dir="rtl" style="text-align:right">

# Londi Agent OS — מפרט ביצוע Target + Gap-to-current-repo

**תאריך:** 2026-07-20  
**סטטוס:** Ready-for-build spec מול הריפו הקיים  
**קהל יעד:** סוכן בנייה אוטונומי / מפתח, עם בהירות ללונדי כארכיטקט  
**מקור אמת מוצרי:** `/a0/usr/workdir/brainstorms/2026-07-12-londi-agent-os.md`  
**גריל החלטות למפרט:** `/a0/usr/workdir/brainstorms/2026-07-19-londi-agent-os-execution-spec-grill.md`  
**ריפו נסרק:** `/a0/usr/workdir/londi-agent-os`  
**כלל הכרעה:** ה-brainstorm הוא מקור אמת מוצרי. הריפו הוא evidence למצב מימוש בלבד. סתירות מתועדות כ-`Gap / Drift` ולא משנות את החלטות המוצר.

---

## 1. Purpose & MVP Boundary

מטרת ה-MVP היא לבנות Orchestrator מקומי שמאפשר ללונדי להזין משימה פעם אחת, לבחור Pipeline מתוך תבניות קבועות, לקבל המלצת שיוך ל-Claude Code / Codex, לאשר את המסלול, להריץ עבודה מבודדת ב-Git worktree, לעקוב אחר סטטוס ותוצרים, לאשר handoff / acceptance, ולסגור ריצה רק לאחר מיזוג ידני מאומת.

### 1.1 כלול ב-MVP

- משתמש מקומי יחיד על Windows.
- Orchestrator מקומי כ-Node.js Windows Service.
- UI מקומי נפרד, מחובר דרך REST + SSE.
- API מאזין רק על `127.0.0.1` עם token מ-Windows Credential Manager.
- Git בלבד; כל ריצה ב-branch / `git worktree` מבודד.
- Adapters פעילים: `Claude Code` ו-`Codex` בלבד.
- Agent Adapter contract אחיד להרחבה עתידית.
- Pipelines קבועים:
  - `Direct`
  - `Plan & Build`
  - `Plan, Build & Review`
- אישורים חובה:
  - Pipeline approval
  - `handoff.md` approval לפני Build, כאשר יש Plan
  - Final Acceptance
- Lifecycle סופי:
  - `Awaiting Acceptance` → `Accepted` → manual merge verified → `Completed`
- `Accepted` אינו מצב סופי ואינו מפעיל cleanup.
- `Completed` רק אחרי אימות merge ידני.
- SQLite כמקור אמת תפעולי.
- artifacts בתיקיית `data/runs/<run-id>/`.
- Obsidian context נבחר אוטומטית אך מאושר/נערך לפני הזרקה.
- Obsidian writeback רק לאחר אישור: Summary, Decisions, Insights, Follow-ups.
- Secret Broker: alias והרשאה בלבד; הזרקה זמנית כ-env var לתהליך הסוכן; אין שמירת ערכים.
- Heartbeat כל 30 שניות; `Unresponsive` אחרי 2 דקות; `Agent Failed` אחרי 5 דקות; timeout שלב ברירת מחדל 30 דקות.
- עד שני מחזורי Build → Review correction אוטומטיים; Critical עוצר מיד.
- Recovery, checkpoints, audit, backup, retention.
- Acceptance suite של 5 ריצות רצופות.

### 1.2 מחוץ ל-MVP

- Agent Zero ו-Hermes כסוכנים פעילים.
- Placeholder פעיל / mock פעיל ל-Agent Zero או Hermes.
- פרויקטים שאינם Git.
- automatic merge, force merge, auto conflict resolution.
- Pipeline editor חופשי.
- WebSocket.
- LAN / remote access.
- אישור מתוך notification.
- WhatsApp / Telegram approvals.
- Sandbox / VM מלא.
- multi-user / RBAC.
- cloud backup.

---

## 2. Current Repo Snapshot

בוצעה סריקה ממוקדת של הריפו. לא בוצעו שינויי קוד.

### 2.1 מבנה נוכחי

- `apps/local-api` — Local API shell + REST/SSE contracts + HostConnector phase slices.
- `apps/ui` — UI model modules, dashboard/run/approval screens, runtime dashboard slices.
- `packages/contracts` — shared contracts, pipeline templates, compatibility/config.
- `packages/orchestrator` — state machine, workspace, process, approvals, handoff, review, correction cycle, recovery, audit/security/backup modules.
- `packages/adapters` — Claude Code + Codex adapter modules and contract checks.
- `packages/migrations` — SQLite migration package.
- `tests` — broad test set per slice.
- `docs` — extensive per-slice docs.
- `specs` — existing runtime dashboard slice specs only inside repo.

### 2.2 Evidence שקיים בריפו

הריפו מכיל שכבת MVP skeleton רחבה מאוד:

- state machine docs + code: `packages/orchestrator/src/state-machine.js`
- migrations: `packages/migrations/src/index.js`
- workspace manager: `packages/orchestrator/src/workspace-manager.js`
- process manager / supervision: `packages/orchestrator/src/process-manager.js`
- adapter contract: `packages/adapters/src/*`, `docs/adapter-contract.md`
- Claude Code adapter: `packages/adapters/src/claude-code.js`
- Codex adapter: `packages/adapters/src/codex.js`
- pipeline templates: `packages/contracts/src/pipeline-templates.js`
- approval gates: `packages/orchestrator/src/approvals.js`, `handoff.js`, `acceptance-gate.js`
- review + correction: `review.js`, `correction-cycle.js`
- artifact layout: `artifact-layout.js`
- obsidian context/writeback modules
- secret broker / network grants / preflight / redaction modules
- REST + SSE contract modules
- UI screen-model modules
- restart recovery, checkpoint scheduler, retention, backup, restore, stable update, acceptance runs
- tests covering many of the above modules.

### 2.3 משמעות snapshot

הריפו אינו נראה greenfield. הוא מכיל skeleton/contract-heavy implementation של רוב תחומי ה-MVP, כולל docs/tests. לכן המפרט להלן הוא **Target Spec + Gap-to-current-repo**: הוא מגדיר את המוצר המחייב ומסמן לכל Slice האם המצב הוא חדש, דורש השלמה, refactor או validation.

---

## 3. Target Architecture

```text
Local UI (Next.js / browser)
  ├─ REST commands: create run, approve, retry, replace, stop, accept, verify merge
  └─ SSE stream: status, progress, logs summary, approval requests, audit events

Local API / Orchestrator Service (Node.js Windows Service)
  ├─ Auth: 127.0.0.1 + Bearer token from Windows Credential Manager
  ├─ Command pipeline: validate → guard → transaction → artifacts → event publish
  ├─ SQLite operational source of truth
  ├─ Artifact writer: data/runs/<run-id>/
  ├─ Git Workspace Manager: branch + worktree per run
  ├─ Pipeline Engine: Direct / Plan & Build / Plan, Build & Review
  ├─ Approval Engine: Gate A / Gate B / Gate E / Gate F verification
  ├─ Agent Adapter Registry
  │   ├─ Claude Code Adapter
  │   └─ Codex Adapter
  ├─ Process Supervisor: heartbeat, timeout, checkpoint, cancel, resume
  ├─ Obsidian Context Broker: candidate search → user approval → read-only snapshot
  ├─ Secret Broker: scoped alias grant → env injection → cleanup/redaction
  ├─ Preflight Engine
  ├─ Audit/Event Store
  ├─ Backup/Restore/Maintenance
  └─ Retention Scheduler
```

### 3.1 Architectural invariants

- UI לא מפעיל CLI ולא כותב ל-Obsidian ישירות.
- Orchestrator לא עובד מול Claude/Codex ישירות אלא דרך Adapter contract.
- SQLite קודם; SSE/artifacts אחרי transaction.
- secrets אינם נכנסים ל-prompt, logs, SQLite, artifacts, SSE או Obsidian.
- אין merge אוטומטי בשום מסלול.
- אין cleanup ל-`Accepted`, `Needs Attention`, ריצה פתוחה או ריצה עם `Keep`.

---

## 4. Core Domain Model

### 4.1 Entities מחייבים

- `Project` — Git repository path, target branch, vault scope, revision.
- `Run` — task, pipeline type, state, Git metadata, worktree path, acceptance/merge/retention metadata.
- `Step` — role, ordinal, adapter assignment, state, retry/correction counters.
- `Agent` — adapter type, version, health, availability.
- `CapabilityManifest` — capabilities, constraints, tools, permissions, health.
- `Attempt` — execution attempt, heartbeat, checkpoint, external-effect state.
- `ApprovalRequest` / `Decision` — scope, payload hash, revision, actor, decision, expiry.
- `ContextSource` — approved Obsidian source path/title/reason/hash.
- `Artifact` — type, path, hash, size, run/step/attempt linkage.
- `Checkpoint` — sequence, path, hash, resumability.
- `Event` — monotonic `eventId`, type, severity, redacted payload.
- `AuditEntry` — immutable audit surface linked to event.
- `SecretGrant` — alias/scope/status/expiry only; no value column.
- `PreflightResult` — Ready / Ready with Warnings / Blocked plus redacted evidence.
- `BackupRecord`, `UpdateRecord`, `ObsidianWriteback`.

### 4.2 Persistence rules

- SQLite is operational source of truth.
- Filesystem stores readable/heavy artifacts.
- Every artifact has path + hash in manifest.
- `Completed` requires:
  - `acceptedAt`
  - `mergeVerifiedAt`
  - `targetCommit`
- only adapter types `claude-code` and `codex` are active in MVP.

---

## 5. State Machine & Run Lifecycle

### 5.1 Required Run states

`Draft`, `Preflight Running`, `Blocked`, `Ready`, `Awaiting Pipeline Approval`, `Preparing Workspace`, `Running`, `Awaiting Approval`, `Unresponsive`, `Recovery Required`, `Awaiting Acceptance`, `Accepted`, `Needs Attention`, `Failed`, `Cancelled`, `Completed`, `Maintenance Hold`.

### 5.2 Required Step states

`Pending`, `Ready`, `Running`, `Awaiting Approval`, `Unresponsive`, `Retrying`, `Succeeded`, `Failed`, `Cancelled`, `Skipped`.

### 5.3 Non-negotiable lifecycle rules

- `Accepted` is not final.
- `Completed` is final and cleanup-eligible.
- `Completed` only after Gate F manual merge verification.
- Active run on shutdown → checkpoint → child process closure → `Recovery Required`.
- UI closed + decision needed → `Awaiting Approval` + checkpoint + non-sensitive Windows notification.
- no notification approval.

---

## 6. Pipeline Requirements

### 6.1 Direct

Flow:

1. Task draft.
2. Context approval.
3. Preflight.
4. Pipeline approval.
5. Workspace creation.
6. Execute step via selected adapter.
7. Validation / artifact collection.
8. `Awaiting Acceptance`.
9. Accept → `Accepted`.
10. Manual merge verification → `Completed`.

`Direct` does not require `handoff.md`.

### 6.2 Plan & Build

Flow:

1. Plan step produces structured handoff draft.
2. User edits/approves `handoff.md`.
3. Build step receives approved handoff + approved context + acceptance checks.
4. Validation.
5. `Awaiting Acceptance` → `Accepted` → manual merge → `Completed`.

### 6.3 Plan, Build & Review

Flow:

1. Plan + Gate B handoff approval.
2. Build.
3. Review produces `review.md`.
4. If High/Critical blocking: correction flow or stop.
5. Up to 2 automatic Build → Review cycles.
6. Critical finding for secrets/permissions/deletion/external action stops immediately for approval.
7. Passing review → `Awaiting Acceptance`.

---

## 7. Security / Permissions / Secret Broker

### 7.1 Permission model

- Read: only approved context snapshot and project/worktree inputs.
- Write: only run worktree + run artifacts.
- Sensitive actions require approval:
  - delete
  - write outside worktree
  - secret usage
  - new network target
  - external effect
  - lockfile change / new dependency
  - global install
  - admin/system action

### 7.2 Secret Broker

- User approves aliases only.
- Credential value read at injection time from Windows Credential Manager.
- Secret injected as temporary env var to agent process only.
- Grant scope: run, step, agent, alias, TTL.
- TTL max: 30 minutes.
- Grant revoked/cleaned at step finish.
- Audit stores alias metadata only.
- Redaction applies to stdout/stderr/logs/artifacts/SSE/API/audit.

### 7.3 Preflight

Checks:

- Git repo + target branch.
- branch/worktree lock conflict.
- adapter availability + version.
- runtime/tool versions.
- disk space.
- ACL/write boundaries.
- context snapshot validity.
- secret alias exists, not value.
- network allowlist.
- dependency policy.
- maintenance hold.

Outcomes:

- `Ready`
- `Ready with Warnings`
- `Blocked`

`Blocked` prevents run start. Warnings require explicit documented `Run Anyway`.

---

## 8. Recovery / Heartbeat / Retention / Backup

### 8.1 Heartbeat and supervision

- heartbeat every 30s.
- `Unresponsive` after 120s without heartbeat.
- `Agent Failed` after 300s without recovery.
- default stage timeout: 30 minutes.
- long-running task with heartbeat is not stuck, but still subject to total timeout.

### 8.2 Recovery

After restart:

- load runs from SQLite.
- verify manifest/artifacts/checkpoints/worktree/process snapshot/external effects.
- active runs become `Recovery Required`.
- no auto-resume.
- user actions: Resume, Replace Agent, Stop.
- external effect `Unknown` blocks replay until verification.

### 8.3 Retention

- `Completed`: workspace/branch kept 7 days from `completedAt`.
- `Failed` / `Cancelled` / `Needs Attention`: retained 30 days.
- run artifacts retained 30 days unless policy says longer.
- audit retained 1 year.
- `Accepted` is not cleanup-eligible.
- `Keep` prevents cleanup.

### 8.4 Backup / Restore

- local daily backups of SQLite/config.
- pre-maintenance backup before update/migration/restore.
- retain 7 daily + 4 weekly.
- backup manifests/handoffs/reviews/summaries only from `data/runs`.
- no secrets, `.env`, source directories, git metadata, dependency dirs.
- restore only in maintenance mode with no active runs.
- post-restore: SQLite integrity, version compatibility, preflight.

---

## 9. UI + API Contracts

### 9.1 REST

Required command families:

- create/update draft run.
- run preflight.
- approve pipeline.
- approve/edit handoff.
- approve sensitive action.
- retry / replace agent / stop.
- accept / reject / request changes.
- verify manual merge.
- export audit.
- backup / restore / maintenance actions.

Rules:

- `/api/v1` prefix.
- Bearer auth.
- write commands require `Idempotency-Key`.
- concurrency-sensitive commands require `If-Match` / revision.
- stable redacted error model.

### 9.2 SSE

- `/api/v1/events`.
- monotonic `eventId`.
- replay with `Last-Event-ID`.
- heartbeat events.
- redacted payloads only.
- no secret leakage.

### 9.3 UI screens

MVP UI must include:

- Dashboard + approvals inbox.
- New Run Wizard.
- Run Detail.
- Handoff approval/revision diff.
- Review screen.
- Acceptance screen.
- Manual merge verification screen.
- Audit timeline + export.
- Settings/Maintenance shells.

---

## 10. Gap Analysis

### 10.1 High-level repo status

| Area | Current status | Gap / action |
|---|---|---|
| Repo/package structure | Existing-needs-validation | Structure exists; validate against target spec and remove misleading placeholders if any. |
| Core contracts/state machine | Existing-needs-validation | State names and key guards appear aligned; validate all lifecycle transitions end-to-end. |
| SQLite/migrations | Existing-needs-validation | Migration package exists; validate all required entities/constraints and no secret value columns. |
| Artifacts layout | Existing-needs-validation | Artifact docs/module exist; validate concrete file writes in real runs. |
| Git worktree workspace | Existing-needs-validation | Workspace manager exists; validate real Git locks/worktree/cleanup/manual merge behavior. |
| Agent adapter contract | Existing-needs-refactor | Contract uses `start`, `deliverTask`, `collectArtifacts`; brainstorm names are `startRun`, `sendTask`, `getArtifacts`. Decide alias/rename for product language consistency. |
| Claude/Codex adapters | Existing-needs-validation | Modules exist; validate they are real adapters and not only harness/stubs. |
| Agent Zero/Hermes | Drift risk | Root AGENTS mentions four-agent model. MVP must not expose active Agent Zero/Hermes adapters. Treat Phase 2 display-only code as non-MVP execution surface. |
| Pipelines | Existing-needs-validation | Templates exist; validate exact gates and correction flow. |
| Obsidian context/writeback | Existing-needs-validation | Modules exist; validate approved snapshot and approved writeback only. |
| Secret Broker | Existing-needs-validation | Module exists; validate Windows Credential Manager integration and zero leakage. |
| Preflight/security | Existing-needs-validation | Modules exist; validate actual blocking behavior. |
| REST/SSE | Existing-needs-completion | Contracts exist; need verify live routed endpoints support full MVP commands, not only Phase 2 subset. |
| UI | Existing-needs-completion | Many UI model modules exist; need validate implemented user flow and live integration. |
| Recovery/checkpoints | Existing-needs-validation | Modules exist; validate restart scenario with real process/worktree/artifacts. |
| Audit/backup/retention | Existing-needs-validation | Modules exist; validate immutable behavior, retention exclusions, restore workflow. |
| Acceptance runs | Existing-needs-validation | Acceptance harness exists; validate 5 consecutive real Git runs with at least 2 Claude and 2 Codex. |

### 10.2 Drift notes

1. `README.md` claims broad completion of many E0–E8 slices. This is implementation evidence only; the final release decision must come from acceptance suite evidence, not README status.
2. root `AGENTS.md` describes Agent Zero/Hermes in the broader operating model. MVP execution scope remains Claude Code + Codex only.
3. existing Phase 2 spec includes four agent cards and Agent Zero dashboard concepts. This may remain as dashboard/status display, but must not become active MVP execution adapter scope.
4. Adapter operation names differ between brainstorm and current docs/code. Normalize before building further or document mapping explicitly.

---

## 11. Implementation Slices

כל Slice להלן משתמש בתבנית אחידה: Goal, Current repo status, Scope, Out of scope, Expected files/modules, Contracts/data, Acceptance checks, Tests to add/update, Risks/edge cases, Done when.

---

### Slice 0 — Repo/current-state scan

**Status:** existing-needs-validation

**Goal**  
לייצר baseline אמין של מצב הריפו מול ה-Target Spec לפני שינויי קוד.

**Current repo status**  
קיים skeleton רחב עם docs/tests/modules רבים. אין עדיין דוח snapshot רשמי בתוך הריפו לפי המפרט הזה.

**Scope**
- לקרוא README, package scripts, docs מרכזיים, packages/apps/tests/specs.
- לסמן מודולים כ-real / stub / contract-only.
- לסמן drift מול brainstorm.
- לייצר `docs/current-repo-snapshot.md` או לעדכן פרק מקביל אם כבר קיים.

**Out of scope**
- refactor קוד.
- audit מלא של כל שורת קוד.

**Expected files/modules**
- `docs/current-repo-snapshot.md`
- `docs/mvp-skeleton-completion-summary.md`
- `README.md`

**Contracts / data**
- classification: `new`, `existing-needs-completion`, `existing-needs-refactor`, `existing-needs-validation`.

**Acceptance checks**
- הדוח מזהה לכל Slice את קבצי המקור, docs, tests, gaps.
- drift מול Agent Zero/Hermes ו-Phase 2 מסומן.

**Tests to add/update**
- no runtime test required.
- add documentation consistency check if desired.

**Risks / edge cases**
- README יכול להציג “completed” בלי הוכחת E2E.

**Done when**
- יש snapshot מוסכם שממנו אפשר לעבוד Slice-by-Slice.

---

### Slice 1 — Core contracts + state machine

**Status:** existing-needs-validation

**Goal**  
לנעול domain constants, lifecycle guards ומעברי מצב מחייבים.

**Current repo status**  
`packages/orchestrator/src/state-machine.js` קיים; docs קיימים; tests קיימים.

**Scope**
- לוודא שכל states קיימים.
- לוודא `Accepted` לא final ולא retention start.
- לוודא `Completed` דורש `acceptedAt`, `mergeVerifiedAt`, `targetCommit`.
- לוודא `Recovery Required` לאחר shutdown/restart.

**Out of scope**
- UI flows.
- actual process recovery.

**Expected files/modules**
- `packages/orchestrator/src/state-machine.js`
- `packages/contracts/src/index.js`
- `docs/state-machines.md`
- `tests/smoke.test.mjs`

**Contracts / data**
- Run states and Step states as listed in sections 5.1–5.2.

**Acceptance checks**
- illegal transitions throw.
- accepted→completed requires merge metadata.
- retention starts only on completed.

**Tests to add/update**
- add explicit `Accepted` cleanup-ineligible test if missing.
- add manual merge required guard test if missing.

**Risks / edge cases**
- hidden direct transition from `Awaiting Acceptance` to `Completed`.

**Done when**
- state machine tests prove lifecycle exactly matches target spec.

---

### Slice 2 — SQLite + run artifacts

**Status:** existing-needs-validation

**Goal**  
לממש persistence אמין: SQLite קודם, artifacts hashed אחרי transaction.

**Current repo status**  
Migration package and artifact layout module/docs exist.

**Scope**
- validate all required tables/entities.
- validate constraints, especially adapter enum and no secret value columns.
- validate artifact manifest structure.
- validate transaction order.

**Out of scope**
- full UI display.

**Expected files/modules**
- `packages/migrations/src/index.js`
- `packages/orchestrator/src/artifact-layout.js`
- `docs/domain-model.md`
- `docs/artifact-layout.md`
- `tests/artifact-layout.test.mjs`
- `tests/repository-crash-consistency.test.mjs`

**Contracts / data**
- `data/runs/<run-id>/manifest.json`
- `handoff.md`, `review.md`, checkpoints, logs, summaries.

**Acceptance checks**
- failed artifact write does not publish false state.
- manifest hashes match files.
- SQLite schema prevents secret values.

**Tests to add/update**
- crash between DB commit and artifact publication.
- missing artifact hash detection.

**Risks / edge cases**
- artifact exists but DB state not committed.
- stale manifest after retry.

**Done when**
- DB/artifact consistency can be verified after simulated crash.

---

### Slice 3 — Git worktree workspace

**Status:** existing-needs-validation

**Goal**  
כל שינוי קוד מתבצע רק ב-Git branch/worktree מבודד; אין שינוי ישיר בפרויקט המקור.

**Current repo status**  
Workspace manager module/docs/tests exist.

**Scope**
- validate Git-only preflight.
- validate branch naming and worktree path.
- validate target branch lock.
- validate dirty state policy.
- validate diff/test summary and manual merge verification.
- validate cleanup guards.

**Out of scope**
- automatic merge.
- non-Git projects.

**Expected files/modules**
- `packages/orchestrator/src/workspace-manager.js`
- `packages/orchestrator/src/manual-merge.js`
- `docs/git-project-validation-locking.md`
- `docs/manual-merge.md`
- `tests/workspace-manager.test.mjs`
- `tests/manual-merge.test.mjs`

**Contracts / data**
- branch: `londi/run-<run-id-short>` or documented equivalent.
- worktree: `data/worktrees/<run-id>/` or documented equivalent.

**Acceptance checks**
- non-Git repo blocked.
- no write outside worktree.
- completed requires manual merge verification.
- merge conflict/failure → `Needs Attention`.

**Tests to add/update**
- real Git temp repo tests.
- branch containment / patch equivalence verification.

**Risks / edge cases**
- target branch advances while run active.
- branch already exists.
- stale worktree path.

**Done when**
- real Git tests prove isolation and manual completion semantics.

---

### Slice 4 — Agent Adapter contract

**Status:** existing-needs-refactor

**Goal**  
להגדיר וליישם contract אחיד ל-Claude Code ו-Codex בלבד, עם שמות פעולה ברורים ועקביים.

**Current repo status**  
Adapter docs/code exist with operations `health`, `capabilities`, `start`, `deliverTask`, `heartbeat`, `checkpoint`, `cancel`, `resume`, `collectArtifacts`. Brainstorm language uses `startRun`, `sendTask`, `getArtifacts`.

**Scope**
- decide: rename code operations or document mapping.
- enforce contract parity.
- ensure no active Agent Zero/Hermes adapter.
- normalize outcomes.
- expose capability manifest.

**Out of scope**
- new agents.
- remote A2A Agent Zero.

**Expected files/modules**
- `packages/adapters/src/index.js`
- `packages/adapters/src/claude-code.js`
- `packages/adapters/src/codex.js`
- `docs/adapter-contract.md`
- `reports/adapter-contract-parity.md`

**Contracts / data**
- operations equivalent to: `startRun`, `sendTask`, `heartbeat`, `checkpoint`, `cancel`, `resume`, `getArtifacts`.
- outcomes: success/recoverable_failure/terminal_failure/cancelled/unknown.

**Acceptance checks**
- both adapters pass same contract harness.
- no Agent Zero/Hermes active descriptor.
- capability requirements filter impossible assignments.

**Tests to add/update**
- adapter parity test.
- no-active-adapters test for deferred agents.

**Risks / edge cases**
- naming mismatch causes orchestration ambiguity.
- adapter shell exists but does not execute real CLI.

**Done when**
- orchestrator can call both adapters through identical contract and tests prove parity.

---

### Slice 5 — Direct Pipeline end-to-end

**Status:** existing-needs-completion

**Goal**  
לייצר מסלול דק עובד מקצה לקצה: task → approval → worktree → adapter execute → artifacts → acceptance → manual merge verification.

**Current repo status**  
Pipeline templates, approvals, workspace, adapters and acceptance gate modules exist. Need prove integrated live flow.

**Scope**
- Direct template only.
- single selected adapter.
- no handoff gate.
- basic acceptance checks.
- manual merge verification.

**Out of scope**
- Plan/Review.
- Obsidian writeback beyond approved context if not needed for first run.

**Expected files/modules**
- `packages/contracts/src/pipeline-templates.js`
- `packages/orchestrator/src/command-pipeline.js`
- `packages/orchestrator/src/acceptance-gate.js`
- `packages/orchestrator/src/manual-merge.js`
- `tests/pipeline-integration-suite.test.mjs`

**Contracts / data**
- `pipelineType = direct`
- final states as target lifecycle.

**Acceptance checks**
- can run against real Git test repo.
- `Accepted` does not cleanup.
- `Completed` after verified manual merge only.

**Tests to add/update**
- one real Direct pipeline integration test.

**Risks / edge cases**
- test harness simulates too much and misses real process/worktree defects.

**Done when**
- Direct passes E2E with Claude or Codex on real temp Git repo.

---

### Slice 6 — Plan & Build

**Status:** existing-needs-completion

**Goal**  
להוסיף Plan step, `handoff.md` generation, approval gate, ואז Build שמקבל רק handoff/context מאושרים.

**Current repo status**  
`handoff.js`, docs/tests exist. Need validate integrated flow.

**Scope**
- generate handoff draft.
- user edit/revision.
- hash + approval revision.
- Build blocked until approved.
- no raw conversation/log transfer.

**Out of scope**
- Review correction loop.

**Expected files/modules**
- `packages/orchestrator/src/handoff.js`
- `docs/handoff.md`
- `tests/handoff.test.mjs`
- UI Handoff screen module.

**Contracts / data**
- `handoff.md` required sections:
  - goal/success
  - scope/out of scope
  - affected files/systems
  - execution steps
  - constraints/risks
  - acceptance checks
  - open questions resolved or flagged.

**Acceptance checks**
- Build cannot start without approved handoff.
- edit invalidates old approval.
- approved handoff hash stored in manifest.

**Tests to add/update**
- stale handoff revision test.
- plan-build E2E test.

**Risks / edge cases**
- same agent used for Plan and Build must still pass approval gate.

**Done when**
- Plan & Build pipeline runs E2E with Gate B enforced.

---

### Slice 7 — Review loop

**Status:** existing-needs-validation

**Goal**  
לממש Plan, Build & Review כולל `review.md`, blocking findings and עד שני correction cycles.

**Current repo status**  
Review/correction modules/docs/tests exist.

**Scope**
- review artifact format.
- severity rules.
- High/Critical blocking.
- critical sensitive findings stop immediately.
- up to 2 automatic Build→Review cycles.
- after repeated failure → `Needs Attention`.

**Out of scope**
- dynamic risk scoring.

**Expected files/modules**
- `packages/orchestrator/src/review.js`
- `packages/orchestrator/src/correction-cycle.js`
- `docs/review-artifact.md`
- `docs/correction-cycle.md`
- `tests/review-artifact.test.mjs`
- `tests/correction-cycle.test.mjs`

**Contracts / data**
- `review.md` with findings, severity, evidence, required fix, failed tests.

**Acceptance checks**
- 2 cycles maximum without explicit exception.
- Critical secrets/permissions/deletion/external action blocks immediately.
- passing review allows final acceptance.

**Tests to add/update**
- critical immediate stop.
- third cycle requires explicit approval or Needs Attention.

**Risks / edge cases**
- same agent reviews its own work; UI must warn but may allow.

**Done when**
- three-template pipeline integration suite covers review success and failure.

---

### Slice 8 — Preflight + permissions + Secret Broker

**Status:** existing-needs-validation

**Goal**  
למנוע ריצה מסוכנת/לא מוכנה ולספק secret handling ללא דליפה.

**Current repo status**  
Preflight, secret-broker, redaction, network grants, tool catalog modules exist.

**Scope**
- full preflight checks.
- sensitive action approvals.
- scoped secret grants.
- env injection only.
- redaction/quarantine.
- network/dependency policy.

**Out of scope**
- full VM sandbox.

**Expected files/modules**
- `packages/orchestrator/src/preflight-engine.js`
- `packages/orchestrator/src/secret-broker.js`
- `packages/orchestrator/src/redaction-quarantine.js`
- `packages/orchestrator/src/network-grants.js`
- `packages/orchestrator/src/tool-catalog.js`
- `tests/security-acceptance-suite.test.mjs`

**Contracts / data**
- `secret_grants` contains alias/scope/status/expiry only.
- preflight saved to manifest.

**Acceptance checks**
- secret value absent from DB/logs/artifacts/SSE/audit.
- missing critical tool/repo/secret blocks.
- warning requires explicit approval.

**Tests to add/update**
- e2e secret injection with fake credential value and leak scan.
- unapproved network target blocked.

**Risks / edge cases**
- child process dumps env.
- generated artifact contains secret and must quarantine.

**Done when**
- security acceptance suite proves zero secret leakage and blocking sensitive actions.

---

### Slice 9 — REST + SSE + basic UI

**Status:** existing-needs-completion

**Goal**  
לחבר UI אמיתי ל-Orchestrator commands/events, לא רק model tests.

**Current repo status**  
REST/SSE contract modules and many UI model modules exist. Phase 2 endpoints may not cover full MVP execution commands.

**Scope**
- full `/api/v1` commands needed for MVP.
- SSE replay and heartbeat.
- UI screens for dashboard, new run, run detail, approvals, handoff, review, acceptance, merge verification, audit.
- auth/token flow.

**Out of scope**
- WebSocket.
- remote access.

**Expected files/modules**
- `apps/local-api/src/index.js`
- `apps/local-api/src/rest-contracts.js`
- `apps/local-api/src/sse-stream.js`
- `apps/ui/src/*`
- `tests/rest-contracts.test.mjs`
- `tests/sse-stream.test.mjs`
- `tests/ui-e2e-baseline.test.mjs`

**Contracts / data**
- command endpoints require idempotency/concurrency headers as applicable.
- SSE has replay by `Last-Event-ID`.

**Acceptance checks**
- UI cannot approve stale revision.
- reconnect fills missed events.
- log views are filtered/redacted.
- notification opens UI but cannot approve.

**Tests to add/update**
- live local API route tests for every MVP command.
- UI e2e baseline for all three templates.

**Risks / edge cases**
- contract-only tests pass while no real route exists.
- duplicated SSE event handling in UI.

**Done when**
- user can complete all approval actions through UI over real API.

---

### Slice 10 — Recovery / heartbeat / checkpoints

**Status:** existing-needs-validation

**Goal**  
ריצות שורדות UI close/service restart בלי אובדן החלטות ובלי replay מסוכן.

**Current repo status**  
checkpoint scheduler, process manager, restart recovery modules exist.

**Scope**
- checkpoint cadence.
- safe shutdown.
- heartbeat monitoring.
- unresponsive/failure transitions.
- restart consistency report.
- Resume / Replace / Stop guards.

**Out of scope**
- automatic resume after crash.

**Expected files/modules**
- `packages/orchestrator/src/process-manager.js`
- `packages/orchestrator/src/checkpoint-scheduler.js`
- `packages/orchestrator/src/restart-recovery.js`
- `docs/restart-recovery.md`
- `tests/restart-recovery.test.mjs`

**Contracts / data**
- checkpoint artifacts secret-free.
- external effects status includes `Unknown`.

**Acceptance checks**
- active run restarts into `Recovery Required`.
- no auto-resume.
- unknown external effect blocks replay.
- replace agent gets only approved handoff/context/checkpoint/artifacts.

**Tests to add/update**
- kill service mid-run scenario.
- stale child process snapshot scenario.

**Risks / edge cases**
- retry repeats external effect.
- process alive but detached from supervisor.

**Done when**
- fault injection proves safe recovery decisions.

---

### Slice 11 — Audit / backup / retention

**Status:** existing-needs-validation

**Goal**  
לייצר operational safety layer: audit immutable דרך UI, backup/restore, cleanup guarded.

**Current repo status**  
Audit/event store, backup, restore, retention modules/docs/tests exist.

**Scope**
- append-only audit records.
- export per run JSON/CSV.
- local backup daily/weekly/pre-maintenance.
- restore only in maintenance mode.
- retention scheduler with `Keep` and state guards.

**Out of scope**
- cloud backup.
- editing audit from UI.

**Expected files/modules**
- `packages/orchestrator/src/event-store.js`
- `packages/orchestrator/src/backup-manager.js`
- `packages/orchestrator/src/restore-workflow.js`
- `packages/orchestrator/src/retention-scheduler.js`
- `packages/orchestrator/src/completion-retention.js`
- `docs/event-store-audit.md`
- `docs/backup-manager.md`
- `docs/restore-workflow.md`

**Contracts / data**
- audit retained 1 year.
- 7 daily + 4 weekly backups.
- completed cleanup starts only at `completedAt`.

**Acceptance checks**
- `Accepted` never cleaned.
- `Needs Attention` retained 30 days.
- backup excludes secrets/source/git/dependencies.
- restore validates DB and version.

**Tests to add/update**
- retention with Accepted/Keep.
- restore blocked with active run.

**Risks / edge cases**
- cleanup deletes branch before merge verification.
- backup accidentally includes `.env`.

**Done when**
- maintenance workflow can be executed and verified in tests.

---

### Slice 12 — Acceptance test suite of 5 consecutive runs

**Status:** existing-needs-validation

**Goal**  
להוכיח שה-MVP מוכן, לא רק שהמודולים קיימים.

**Current repo status**  
`acceptance-runs` module/test/doc exist.

**Scope**
- run 5 consecutive real Git test runs.
- at least 2 Claude Code.
- at least 2 Codex.
- all 3 pipeline templates.
- approvals/security/recovery/audit/backup/manual merge validated.
- signed release decision.

**Out of scope**
- simulated-only acceptance.

**Expected files/modules**
- `packages/orchestrator/src/acceptance-runs.js`
- `packages/orchestrator/src/release-decision.js`
- `docs/acceptance-runs.md`
- `docs/release-decision.md`
- `tests/acceptance-runs.test.mjs`
- `tests/release-decision.test.mjs`

**Contracts / data**
- acceptance report with run IDs, adapter/template coverage, evidence paths, audit export hashes, merge verification.

**Acceptance checks**
- exactly 5 consecutive passing runs.
- no critical open defects.
- no secret leakage.
- manual merge verified on every run.
- backup/restore tested.

**Tests to add/update**
- real-process mode or explicitly separate mock harness from release gate.

**Risks / edge cases**
- harness produces fake confidence if adapters are mocked.
- intermittent failure resets consecutive count.

**Done when**
- release decision can say Go based on evidence, not assumptions.

---

## 12. Acceptance Criteria & Test Plan

### 12.1 MVP release gate

ה-MVP נחשב מוכן רק כאשר:

1. 5 ריצות רצופות עוברות על Git test project אמיתי.
2. לפחות 2 ריצות עם Claude Code.
3. לפחות 2 ריצות עם Codex.
4. כל שלוש התבניות כוסו.
5. Pipeline approval, handoff approval ו-final Acceptance חוסמים המשך כנדרש.
6. כל שינוי קוד נעשה ב-worktree בלבד.
7. אין merge אוטומטי.
8. `Accepted` לא מנוקה ולא מסומן final.
9. `Completed` רק לאחר Gate F manual merge verification.
10. UI close/service restart מובילים ל-recovery בטוח ללא אובדן החלטות.
11. Secret Broker מוכח ללא דליפה ב-DB/logs/artifacts/SSE/audit/Obsidian.
12. פעולה רגישה ללא approval נחסמת ונרשמת.
13. audit export תקין ונקי מסודות.
14. backup + restore נבדקו בפועל.
15. אין critical defects פתוחים; non-critical deferred defects מתועדים.

### 12.2 Recommended build order

1. Repo/current-state scan.
2. Core contracts + state machine.
3. SQLite + run artifacts.
4. Git worktree workspace.
5. Agent Adapter contract.
6. Direct Pipeline end-to-end.
7. Plan & Build.
8. Review loop.
9. Preflight + permissions + Secret Broker.
10. REST + SSE + basic UI.
11. Recovery / heartbeat / checkpoints.
12. Audit / backup / retention.
13. Acceptance suite of 5 consecutive runs.

### 12.3 Minimum verification commands

```bash
npm run lint
npm run type-check
npm run test:unit
npm run test:integration
npm run security:scan
npm run build
npm run check:windows
npm run ci
```

בנוסף ל-`npm run ci`, יש להריץ acceptance suite במצב שמוכיח real Git worktrees, real manual merge verification, real adapter process boundary, and zero secret leakage.

---

## 13. Immediate next actions

1. ליצור או לעדכן `docs/current-repo-snapshot.md` לפי Slice 0.
2. להכריע Adapter operation naming: rename to brainstorm names או document mapping רשמי.
3. להפריד במפורש בין Phase 2 four-agent dashboard display לבין MVP active adapters.
4. לבדוק האם REST routes קיימים בפועל לכל פקודות ה-MVP או רק contract/model layer.
5. להריץ subset בדיקות ממוקד: state-machine, workspace, adapter parity, pipeline integration, secret-broker, rest/sse.
6. לבנות Direct E2E אמיתי לפני הרחבת UI/Review.

</div>
