# Decisions Log

Append-only log of significant project decisions.

## 2026-07-14 — MVP skeleton complete / ready for next phase

- **Decision:** Londi Agent OS MVP skeleton is considered complete through E8-T09 and ready for the next phase.
- **Evidence:** full `npm run ci` passed before the completion-summary commit.
- **Completion summary:** `docs/mvp-skeleton-completion-summary.md`.
- **Release decision:** `docs/release-decision.md` / `packages/orchestrator/src/release-decision.js` models `Go` when all gates pass.
- **Latest completion commit:** `e9a56f8 docs: add MVP skeleton completion summary`.
- **Scope constraints preserved:** Git-only projects; Claude Code and Codex only; no Agent Zero/Hermes adapter/mock/placeholder; no automatic merge; `Completed` only after successful manual merge verification.
- **Next phase:** decide whether to move from skeleton/domain contracts into concrete runtime implementation, UI/API hardening, or product packaging.

## 2026-07-14 — Phase 2 build approved / project-based agent workspace

- **Decision:** Start Phase 2 build from the ready-for-build spec.
- **Spec:** `/a0/usr/workdir/specs/2026-07-14-londi-agent-os-phase-2-ready-for-build.md`.
- **Build scope:** live Dashboard -> Local API -> HostConnector -> four-agent status/usage -> Obsidian Run Summary write.
- **Additional product requirement:** Londi must be able to work by project with all agents attached to the project context.
- **Implication:** Phase 2 contracts include a `ProjectWorkspace` model that can bind a project to Agent Zero, Codex, Claude Code, Hermes, and the active skills for that project.
- **Guardrail:** Full Codex/Claude execution and Hermes knowledge runtime remain future scope; Phase 2 exposes project/agent/skill contracts and live status first.


## 2026-07-14 — DOX adopted as project operating contract

- **Decision:** Adopt DOX-style `AGENTS.md` hierarchy for Londi Agent OS.
- **Reason:** Londi wants project-based work with all agents, and each project needs a durable operating profile that agents can read before acting.
- **Implementation:** Root and child `AGENTS.md` files define repo-wide, apps, packages, tests, docs, decisions, scripts, and reports operating contracts.
- **Contract impact:** `ProjectWorkspace` includes DOX profile paths: `doxPath`, `contextRoot`, and `decisionsLogPath`.
- **Ponytail note:** Ponytail is remembered as a future internal minimalism-review principle/skill, not an external dependency in this phase.
- **Guardrail:** DOX documents stable contracts and workflows only; avoid turning it into task diaries or duplicated docs.

## 2026-07-15 — Phase 2 dashboard buttons routed through UI controller

- **Decision:** Dashboard Load, Refresh, and Write Run Summary controls route through a UI-facing `phase2DashboardController` layered over `phase2DashboardRuntime`.
- **Reason:** Keep visual button wiring simple while preserving the boundary that UI never calls CLIs, filesystem, or Obsidian directly.
- **Implementation:** `createPhase2DashboardController()` dispatches known controls, tracks loading/last-action/error state, returns the frozen interaction model, and generates an idempotency key for Run Summary writes when needed.
- **Guardrail:** No polling, no bootstrap network calls, no direct HostConnector access from UI, and unknown/runtime failures render inline as interaction-state errors.

## 2026-07-15 — Phase 2 dashboard screen model added above controller

- **Decision:** Add a UI-facing `phase2DashboardScreen` layer above the controller for render-ready sections, buttons, status labels, and click routing.
- **Reason:** A visual dashboard needs a stable screen model without embedding DOM, framework, Local API, CLI, filesystem, or Obsidian side effects in UI rendering code.
- **Implementation:** `createPhase2DashboardScreenModel()` preserves controller interaction state and exposes dispatch-only button descriptors; `createPhase2DashboardScreen()` provides `render()` and `click(controlId, options)` over `phase2DashboardController.dispatch(...)`.
- **Guardrail:** No polling, no bootstrap network calls, no direct HostConnector/filesystem/CLI/Obsidian access from the screen layer; disabled controls do not dispatch.

## 2026-07-15 — Phase 2 dashboard shell render model added

- **Decision:** Add a DOM-neutral `phase2DashboardShell` model above the Phase 2 screen model.
- **Reason:** The next visual layer needs a stable render tree for header, metrics, toolbar, alerts, and sections without embedding DOM/framework/runtime side effects.
- **Implementation:** `createPhase2DashboardShellModel()` maps screen buttons to declarative `{ type: 'dispatch-control', controlId }` handlers and is exposed from `getUiBootstrapModel()`.
- **Guardrail:** The shell stays pure and dispatch-only: no polling, no bootstrap network calls, and no direct Local API/HostConnector/filesystem/CLI/Obsidian access.

## 2026-07-15 — Phase 2 visual dashboard adapter added

- **Decision:** Add a static visual adapter above the Phase 2 dashboard shell model.
- **Reason:** A host renderer needs mountable dashboard HTML and click binding descriptors without giving the visual layer Local API, HostConnector, CLI, filesystem, secret, or Obsidian write access.
- **Implementation:** `createPhase2DashboardVisualAdapter()` returns escaped static HTML, a target selector, and `{ event: 'click', handler: { type: 'dispatch-control', controlId } }` bindings; `getUiBootstrapModel()` exposes it as `phase2DashboardVisualAdapter`.
- **Guardrail:** Static HTML and bind-controls-only descriptors; no DOM mutation, no event registration in the adapter, no polling, and no bootstrap network calls.

## 2026-07-15 — Phase 2 DOM binder added

- **Decision:** Add a controlled DOM binder above the static Phase 2 visual adapter.
- **Reason:** A host renderer needs a narrow mount/bind/rerender boundary without giving DOM code Local API, HostConnector, CLI, filesystem, secret, or Obsidian write access.
- **Implementation:** `createPhase2DashboardDomBinder()` mounts adapter HTML into a provided target, binds enabled dispatch-control buttons to `screen.click(...)`, re-renders after dispatch, and exposes `mount()`, `refresh()`, `unmount()`, and `isMounted()`.
- **Guardrail:** Controlled DOM mutation only for mount/rerender/unmount; no polling, no bootstrap network calls, no raw DOM event forwarding by default, and no direct Local API/HostConnector/filesystem/CLI/Obsidian access.

## 2026-07-16 — Live Phase 2 dashboard preview verified through Local API

- **Decision:** Add a live Phase 2 dashboard preview that mounts the existing DOM binder in the browser and calls the Local API only after explicit user clicks.
- **Reason:** Londi needs to see a working result beyond the static visual adapter while preserving the Dashboard/UI → Local API → HostConnector boundary.
- **Implementation:** `docs/previews/live-dashboard-preview.html` accepts a bearer token/base URL, mounts `createPhase2DashboardDomBinder()`, and dispatches Load/Refresh/Write Run Summary through the Local API. Browser-safe `--build-check` guards were added for UI/contracts public exports.
- **Evidence:** Manual live verification showed Load updating dashboard state and Write Run Summary creating `Londi Agent OS/Runs/2026-07-16__run-phase2-live-preview__live-dashboard-run-summary.md` through the temporary Obsidian vault flow.
- **Guardrail:** No polling, no bootstrap network calls, no direct UI CLI/filesystem/secret/Obsidian access, and Local API CORS explicitly allows the UI `x-request-id` header.

## 2026-07-16 — Runtime Dashboard UI slice approved for build

- **Decision:** Build the first official Runtime Dashboard screen under `apps/ui` as a thin app wrapper over the verified Phase 2 dashboard model and DOM binder.
- **Spec:** `specs/2026-07-16-runtime-dashboard-ui-slice.md`.
- **Scope:** Internal Operator Dashboard for Londi only; live Load/Refresh through Local API and Write Run Summary through HostConnector/Obsidian remain the first safe action path.
- **Non-goals:** No React/Next/new UI framework, no duplicated preview UI logic, no polling, no bootstrap network calls, no Start Codex Task, no Claude Review, no Hermes knowledge runtime, and no client/SaaS features in this slice.
- **Guardrail:** Preserve `Dashboard UI -> Local API -> HostConnector -> local tools / Obsidian`; UI must not call CLI, filesystem, secrets, or Obsidian directly.

## 2026-07-16 — Runtime Dashboard app wrapper implemented with PONYTAIL gate

- **Decision:** Implement the Runtime Dashboard app wrapper as the smallest working slice: one new `apps/ui/src/runtime-dashboard.js` module, one export surface update, and targeted UI shell coverage.
- **Reason:** PONYTAIL applies to this build: prefer a thin wrapper over existing Phase 2 dashboard runtime and DOM binder instead of adding a framework, duplicate UI logic, or new architecture.
- **Implementation:** `createRuntimeDashboardApp()` lazily creates the bootstrap model only on mount, mounts through `createPhase2DashboardDomBinder()`, exposes `mount()`, `refresh()`, `unmount()`, `isMounted()`, and `getStatus()`, and provides a default `Write Run Summary` safe-action input.
- **Guardrail:** No polling, no bootstrap/module-import network calls, no direct UI CLI/filesystem/secret/Obsidian access, and the Local API / HostConnector boundary remains the only live side-effect path.

## 2026-07-16 — Runtime Dashboard preview uses official app wrapper

- **Decision:** Add `docs/previews/runtime-dashboard-preview.html` as the live browser preview for the official Runtime Dashboard app wrapper.
- **Reason:** The next verification step should exercise `createRuntimeDashboardApp()` directly instead of repeating the older demo that manually wired the Phase 2 DOM binder.
- **Implementation:** The preview imports `createRuntimeDashboardApp()`, accepts a Local API bearer token/base URL, and mounts only after explicit user action.
- **Guardrail:** Preview code remains a thin browser harness: no polling, no bootstrap network calls, no direct CLI/filesystem/secret/Obsidian access, and all live side effects still go through Local API / HostConnector.

## 2026-07-16 — Runtime Dashboard static entrypoint added

- **Decision:** Add `apps/ui/runtime-dashboard.html` and `npm run serve:runtime-dashboard` as the first official static UI entrypoint for the Runtime Dashboard.
- **Reason:** Londi needs a daily operator surface that is not only a `docs/previews` artifact, while keeping the PONYTAIL slice small and avoiding a new UI framework/build system.
- **Implementation:** The entrypoint imports `createRuntimeDashboardApp()` and the serve script hosts repository static files from `127.0.0.1:3211`, with `--check` validation available through `npm run check:runtime-dashboard`.
- **Guardrail:** The serve script does not proxy Local API, read secrets, or perform writes; the UI still has no polling/bootstrap network calls and all live side effects go through Local API / HostConnector.

## 2026-07-16 — Runtime command starts Local API and dashboard together

- **Decision:** Add `npm run serve:runtime` as the one-command development runtime for Londi's operator dashboard.
- **Reason:** Daily use should not require manually starting the Local API and UI in two shells, but the slice should stay PONYTAIL-small without a new process manager or UI framework.
- **Implementation:** `scripts/serve-runtime.mjs` validates `LONDI_AGENT_OS_LOCAL_API_TOKEN`, starts `apps/local-api/src/index.js --service` and `scripts/serve-runtime-dashboard.mjs` as child processes, sanitizes child output, and stops both children on shutdown.
- **Guardrail:** The command does not print bearer tokens, proxy Local API, read browser secrets, or perform runtime writes itself; live side effects remain behind Local API / HostConnector.

## 2026-07-16 — Local API service connects Obsidian root from environment

- **Decision:** Configure the Local API service's first HostConnector Obsidian root from `LONDI_AGENT_OS_OBSIDIAN_ROOT`.
- **Reason:** Londi needs the live dashboard to move from `Obsidian unavailable` to real Run Summary writes without storing local machine paths or secrets in committed config.
- **Implementation:** `createLocalApiConfigFromEnv()` starts from the default local config and injects the env-provided Obsidian root before service startup.
- **Guardrail:** The variable carries a vault path only, not a bearer token or secret; UI still writes Obsidian only through Local API / HostConnector.

## 2026-07-16 — Runtime Dashboard localhost dev token shortcut

- **Decision:** Add a localhost-only `Use local dev token` button to the Runtime Dashboard entrypoint so local development can recover from browser paste failures without exposing the token in visible UI.
- **Evidence:** User could not paste the local token reliably into the password field during live dashboard use.
- **Implication:** On `127.0.0.1`/`localhost`, the button fills the password input and default Local API base URL; outside localhost it is hidden and guarded.
- **Guardrail:** The token remains in the password field only, is not logged or displayed, and all runtime calls still flow through Local API / HostConnector after explicit user actions.

## 2026-07-18 — Runtime Dashboard Run Console slice approved for build

- **Decision:** Add the first Run Console slice to the Runtime Dashboard: a `New Run` form above `Runs` that creates manual/synthetic `Ask Agent Zero / General task` run records.
- **Spec:** `specs/2026-07-18-runtime-dashboard-run-console-slice.md`.
- **Source discovery:** `/a0/usr/workdir/brainstorms/2026-07-18-runtime-dashboard-run-console.md`.
- **Scope:** Fields are `Title`, `Prompt / Request`, and `Summary result`; the primary button is `Create Manual Run`; all three fields are required; created records default to `status: "succeeded"`, persist to `data/runs/runs.json`, clear the form after save, and display as simple Runs cards/rows with title, status, date, and summary.
- **Non-goals:** No real Agent Zero execution, Codex/Claude subprocess work, Hermes runtime, Obsidian write-back, full transcripts, run detail view, advanced metadata, SQLite, or new UI framework in this slice.
- **Guardrail:** Preserve `Dashboard UI -> Local API -> HostConnector / local runtime storage`; UI must not write files, call CLI, read secrets, or write Obsidian directly, and must not add polling or bootstrap network calls.

## 2026-07-18 — Run Console should not auto-save every agent answer

- **Decision:** Future real `Ask Agent Zero` runs should not auto-save every answer as a saved Run.
- **Reason:** Not every response is useful; bad answers, noisy attempts, and intermediate iterations should not pollute the Runs history or long-term memory.
- **Product behavior:** A real agent response should first appear as a draft/unsaved result. Londi can then choose `Save Run`, `Discard`, or `Retry / Improve`.
- **Save rule:** Persist only user-approved/useful runs, meaningful decisions, final summaries, or real work artifacts.
- **Guardrail:** No automatic Obsidian write-back and no automatic durable run storage for unapproved draft results.

## 2026-07-18 — Runtime Dashboard Project Browser PONYTAIL slice approved

- **Decision:** Add a read-only Project Browser panel to the existing Runtime Dashboard instead of building a full IDE-style three-column workspace.
- **Reason:** Londi needs to see project folders and select context in the operator dashboard, but the smallest useful slice is a safe filesystem view, not a manual editor or full Claude chat execution surface.
- **Scope:** Local API exposes `GET /api/v1/projects/{projectId}/browser`; HostConnector reads only explicitly registered project roots, filters hidden/ignored entries, constrains paths inside the project root, and returns entries as contract snapshots. The dashboard renders the snapshot as a `Project Browser` section.
- **Non-goals:** No manual file editor, no automatic whole-machine scan, no Claude/Codex execution from selected files, and no direct UI filesystem access in this slice.
- **Guardrail:** Preserve `Dashboard UI -> Local API -> HostConnector`; UI remains read-only and must not call filesystem, CLIs, secrets, Obsidian, or project files directly.

## 2026-07-18 — Runtime Dashboard auto-mount replaces blocking opening screen

- **Decision:** Remove the blocking Runtime Dashboard opening/connect screen from the normal localhost experience and auto-mount the dashboard with the localhost dev token.
- **Reason:** The opening screen was useful as a technical Dev Gate, but it slowed the daily AI OS operator experience; Londi should land directly in the dashboard.
- **Behavior:** On `127.0.0.1`/`localhost`, the entrypoint loads the local dev token and Local API base URL automatically, hides the connection controls, and mounts `createRuntimeDashboardApp()` immediately. On non-localhost hosts, a small manual connection fallback remains.
- **Guardrail:** No polling or bootstrap data fetch was added; live data still loads only through explicit dashboard actions, and all runtime calls remain behind Local API / HostConnector.

## 2026-07-18 — Runtime Dashboard New Run uses chat composer

- **Decision:** Replace the `New Run` three-field manual form with a chat-like `Ask Agent Zero` composer.
- **Reason:** Londi expects the Run Console to feel like chat, not a manual database-entry form.
- **Scope:** The visible UI now uses one message textarea and `Send`; title and summary are derived from the message while the saved backend object remains a synthetic manual run in `data/runs/runs.json`.
- **Guardrail:** This remains manual/synthetic only; sending does not execute Agent Zero, Codex, Claude Code, Hermes, subprocesses, Obsidian writes, or auto-merge behavior.

## 2026-07-18 — Runtime Dashboard adopts executive console visual direction

- **Decision:** Style the Runtime Dashboard and `New Run` composer as a polished dark executive console instead of a raw technical form.
- **Reason:** Londi needs the operator UI to feel aesthetic, inviting, and professional while still preserving the local-first Runtime Dashboard boundaries.
- **Scope:** CSS-only visual refinement in the runtime entrypoint and preview: stronger typography, atmospheric background, refined cards, metrics, toolbar, and a prominent chat composer.
- **Guardrail:** No Local API, HostConnector, storage, adapter, Obsidian, polling, or execution behavior changes.

## 2026-07-18 — Runtime Dashboard New Run adds per-conversation agent selector

- **Decision:** Add an `Agent` selector to the `New Run` chat composer so each new manual conversation can target Agent Zero, Codex, Claude Code, or Hermes.
- **Reason:** Londi expects the dashboard chat to behave like a normal chat where the responder can be chosen before sending a message.
- **Scope:** Manual Run Console records now carry `agentId`, derive `action` as `ask-{agentId}-general-task`, and render the available Phase 2 agents in the composer. This remains a synthetic/manual run record only.
- **Guardrail:** Selecting an agent does not execute Agent Zero, Codex, Claude Code, Hermes, subprocesses, Obsidian writes, merges, polling, or direct UI filesystem/CLI behavior.

## 2026-07-20 — Londi Agent OS MVP execution spec locked as Target + Gap-to-current-repo

- **Decision:** Use `specs/2026-07-20-londi-agent-os-execution-spec.md` as the ready-for-build Target Spec + Gap-to-current-repo for the Londi Agent OS MVP.
- **Evidence:** Source product decisions come from `/a0/usr/workdir/brainstorms/2026-07-12-londi-agent-os.md`; spec-shaping decisions were captured in `/a0/usr/workdir/brainstorms/2026-07-19-londi-agent-os-execution-spec-grill.md`; the existing repo was scanned before writing the spec.
- **Implication:** Build work should proceed slice-by-slice from the spec, treating the brainstorm as product source of truth and the current repo as implementation evidence only.
- **Guardrail:** MVP scope remains Git-only, Claude Code + Codex active adapters only, no active Agent Zero/Hermes adapters, no automatic merge, `Accepted` is not final, and `Completed` requires verified manual merge.


## 2026-07-20 — Adapter target contract names mapped to canonical implementation operations

- **Decision:** Keep the current canonical adapter operation list in code and parity tests, and document the target-spec name mapping in `docs/adapter-contract.md` instead of renaming implementation methods now.
- **Evidence:** `node tests/adapter-contract.test.mjs`, `node tests/adapter-contract-parity.test.mjs`, and `node scripts/check-adapter-contract-parity.mjs` passed with 100% parity for Claude Code and Codex.
- **Implication:** Product/user-facing language may use `startRun`, `sendTask`, and `getArtifacts`, while the implementation continues to use `start`, `deliverTask`, and `collectArtifacts` internally.
- **Guardrail:** If adapter operation names are exposed directly through a public API later, update the mapping, docs, adapter contract, and parity tests in the same slice.

## 2026-07-20 — Plan & Build Gate B requires exact approved handoff revision

- **Decision:** Treat the Build step in Plan & Build as blocked unless it receives the exact `handoff.md` revision approved by Gate B.
- **Evidence:** `tests/plan-build-handoff-gate.test.mjs` verifies the `plan-build` template requires handoff, unapproved handoffs block Build, changed handoff content produces a new hash, stale Gate B decisions cannot approve changed content, and re-approval unblocks Build.
- **Implication:** Handoff edits after approval invalidate the previous approval for Build execution.
- **Guardrail:** Builder context must come from the approved handoff revision, not a free-form plan/chat transcript or stale decision.

## 2026-07-20 — Review loop limited to two automatic correction cycles

- **Decision:** Keep the Review loop policy at two automatic Build → Review correction cycles; a further failed attempt requires exception approval / Needs Attention, and Critical sensitive findings stop immediately for approval.
- **Evidence:** `node tests/review-artifact.test.mjs`, `node tests/correction-cycle.test.mjs`, and `node tests/pipeline-integration-suite.test.mjs` verify review blocking, Critical sensitive approval, cycle counter limit, third-attempt exception requirement, and integrated Plan/Build/Review scenario coverage.
- **Implication:** The orchestrator can retry normal High/Critical blocking review feedback automatically within the two-cycle cap, but cannot silently continue after exhaustion or Critical sensitive findings.
- **Guardrail:** Critical sensitive findings and exhausted correction cycles must route to explicit human approval/attention before any further build correction.

## 2026-07-20 — Preflight and Secret Broker security gates validated

- **Decision:** Treat Slice 8 Preflight + permissions + Secret Broker as validated at the contract/test level for MVP skeleton evidence.
- **Evidence:** `node tests/preflight-engine.test.mjs`, `node tests/secret-broker.test.mjs`, `node tests/redaction-quarantine.test.mjs`, `node tests/security-acceptance-suite.test.mjs`, `node tests/security-hardening.test.mjs`, `node tests/rest-contracts.test.mjs`, and `node tests/sse-stream.test.mjs` passed.
- **Implication:** Preflight can classify Ready / Ready with Warnings / Blocked, only warnings are overrideable, secret usage is alias/grant scoped, and known secret material is redacted from API/SSE/audit/artifact-style surfaces in the tested contracts.
- **Guardrail:** This is contract-level validation; live served API/runtime verification remains separate under Slice 9 and final acceptance.

## 2026-07-20 — Runtime Local API and Dashboard live service validated

- **Decision:** Treat Slice 9 REST + SSE + basic UI as validated for the MVP skeleton at live local-service level.
- **Evidence:** Added `tests/runtime-live-service.test.mjs`; targeted checks passed: `node tests/runtime-live-service.test.mjs`, `node tests/rest-contracts.test.mjs`, `node tests/sse-stream.test.mjs`, `node tests/host-connector.test.mjs`, `node tests/ui-shell.test.mjs`, `node tests/phase2-dashboard.test.mjs`, and `npm run type-check`.
- **Implication:** The repo now has proof beyond contract modules: a served Runtime Dashboard static UI, live Local API health and Phase 2 endpoints, HostConnector project browser/manual runs/Obsidian summary path, bearer auth/CORS/idempotency behavior, and UI boundary tests.
- **Guardrail:** The live test uses deterministic local temp data and dev token behavior; it validates the Local API/UI/HostConnector boundary, not real Windows service installation or real browser interaction.

## 2026-07-20 — Recovery requires explicit user decision after restart

- **Decision:** Treat Slice 10 Recovery / heartbeat / checkpoints as validated for the MVP skeleton.
- **Evidence:** Updated `tests/restart-recovery.test.mjs` and `docs/restart-recovery.md`; targeted checks passed: `node tests/restart-recovery.test.mjs`, `node tests/checkpoint-scheduler.test.mjs`, `node tests/process-manager.test.mjs`, `node tests/technical-retry.test.mjs`, and `npm run type-check`.
- **Implication:** Service shutdown/restart moves active work to `Recovery Required` only after checkpoint + child-process closure guards pass. Recovery presents Resume / Replace / Stop choices and never silently dispatches adapter work.
- **Guardrail:** Resume can transition back to Running only after explicit approval and verified checkpoint/external-effect guards; this is deterministic local recovery validation, not a real OS service restart drill.

## 2026-07-20 — Audit export redaction and retention safety validated

- **Decision:** Treat Slice 11 Audit / backup / retention as validated for the MVP skeleton.
- **Evidence:** Updated `packages/orchestrator/src/event-store.js`, `tests/smoke.test.mjs`, and `docs/event-store-audit.md`; targeted checks passed: `node tests/smoke.test.mjs`, `node tests/retention-scheduler.test.mjs`, `node tests/backup-manager.test.mjs`, `node tests/restore-workflow.test.mjs`, `node tests/redaction-quarantine.test.mjs`, `node tests/audit-settings-maintenance.test.mjs`, and `npm run type-check`.
- **Implication:** Retention starts only after `Completed`; `Accepted` is not cleanup-eligible; backup/restore contracts exclude secrets/code and verify integrity; Audit JSON/CSV export is serialized after Audit-surface redaction.
- **Guardrail:** Validation uses deterministic local stores/files and known-secret inputs; it does not yet prove a production scheduler service or external backup destination.

## 2026-07-20 — Five-run acceptance suite validates MVP skeleton

- **Decision:** Treat Slice 12 Acceptance suite as validated for the MVP skeleton.
- **Evidence:** Updated `packages/orchestrator/src/acceptance-runs.js`, `tests/acceptance-runs.test.mjs`, `packages/orchestrator/package.json`, `docs/acceptance-runs.md`, and `docs/current-repo-snapshot.md`; targeted checks passed: `node tests/acceptance-runs.test.mjs` and `npm run type-check`.
- **Implication:** The acceptance report now proves five signed consecutive passing runs across both active adapters (`claude-code`, `codex`) and all MVP templates, using real temporary Git repositories, manual Gate F merge verification, secret/restart/audit coverage, and a controlled adapter process spawn/cancel boundary.
- **Guardrail:** This is deterministic local harness validation using `process.execPath`; it proves adapter process supervision and contract flow, not live Claude/Codex LLM execution.

## 2026-07-21 — MVP skeleton pushed to GitHub

- **Decision:** Treat `welltrading/londi-agent-os` on GitHub as the canonical remote for the MVP skeleton validation baseline.
- **Evidence:** Windows-side push succeeded for `master` and tag `mvp-skeleton-validation-2026-07-20`; remote verification returned `refs/heads/master` at `0424f3d0dcc7d6e6efea76d60ed7dff427d8b6b5` and `refs/tags/mvp-skeleton-validation-2026-07-20` at `609d4c4f60a9564e189c3e42588ee51109436813`.
- **Implication:** The deterministic MVP skeleton validation state is now available from GitHub, not only from the local bundle/archive artifacts.
- **Guardrail:** Live Claude/Codex LLM execution remains unproven; next validation should be a live adapter smoke run outside the deterministic CI harness.

## 2026-07-22 — Manual Run status must reflect Direct pipeline execution

- **Decision:** Persist every new manual run as `queued` first. When a HostConnector execution bridge exists, transition it through `running` and persist the real Direct pipeline result; a record write alone can never produce `succeeded`.
- **Evidence:** The Local API now awaits HostConnector execution, and targeted tests cover no-executor `queued`, executor `running`/`succeeded`/`failed`, Direct fast success/failure, and current Codex login-status fallback.
- **Implication:** The default bridge executes only Codex or Claude Code against a registered Git project in an isolated run branch/worktree, with Gate A approved internally for this MVP and execution metadata stored on the run.
- **Guardrail:** No Agent Zero/Hermes active adapter, no Obsidian write-back, no automatic merge, and no secret values in execution metadata.

## 2026-07-28 — Manual runs are project-scoped and projects are persisted

- **Decision:** Registered projects persist to `data/projects/projects.json` and hydrate on service start, storing `id`, `name`, `rootPath`, and an automatically detected default branch (`main`/`master` aware). The dashboard composer selects a project per manual run and never exposes a branch input; the run's target branch comes from the stored project.
- **Evidence:** `node tests/host-connector.test.mjs` covers restart hydration and detected branch; `node tests/phase2-dashboard.test.mjs` covers the project selector, the blocked-send error, and selection survival across re-render; `data/runs/runs.json` recorded six consecutive dashboard runs failing with `Direct manual run requires a registered project root.` before this change.
- **Implication:** Sending to an executing agent without a selected project is blocked in the UI with a readable error instead of producing a failed run record.
- **Guardrail:** Project registration stays explicit; no automatic machine scan, no branch entry by hand, and no automatic merge.

## 2026-07-28 — Local dashboard authentication is process-scoped and injected

- **Decision:** Remove the hardcoded dev bearer token from `apps/ui/runtime-dashboard.html`. `npm run serve:runtime` mints a 32-byte URL-safe token when none is supplied, passes it to the Local API and dashboard servers in their environment, and the dashboard server substitutes it into the entrypoint response only, served `no-store`.
- **Evidence:** `node tests/runtime-live-service.test.mjs` asserts the injected token, the `no-store` header, and that no token exists in the file on disk; `node tests/ui-shell.test.mjs` asserts the entrypoint carries only the placeholder; `node tests/security-hardening.test.mjs` proves source hygiene now fails on a bearer token embedded in HTML.
- **Implication:** The repository no longer ships a working credential, and the operator needs no console, localStorage, or manual token copying on loopback.
- **Guardrail:** The token is never printed or persisted; only the loopback entrypoint response carries it, and non-localhost hosts keep the manual connection form.

## 2026-07-28 — Unsupervised run attempts reconcile to Recovery Required

- **Decision:** When a refresh finds a manual run whose attempt is no longer supervised — normally after a service restart — reconcile it to a terminal failure carrying `execution.recovery.state = 'Recovery Required'`, `autoResume: false`, and the `Resume`/`Replace`/`Stop` actions. Terminal states always release the workspace lock; the worktree and run branch are retained whenever the run may hold agent work and removed only when it produced nothing.
- **Evidence:** `node tests/direct-manual-run-executor.test.mjs` covers restart reconciliation, no re-reconciliation of already-terminal runs, lock release enabling a second run on the same branch, and porcelain path parsing; `node tests/workspace-manager.test.mjs` covers same-day branch uniqueness and retained/cleaned release.
- **Implication:** A run left `running` across a restart, as `run-20260722155729-host-codex-manual-smoke` was for six days, now resolves to an explicit recovery decision.
- **Guardrail:** Success is never fabricated for an attempt that cannot be observed, and no merge happens automatically.

## 2026-07-28 — Dashboard is a two-way conversation interface

- **Decision:** The Runtime Dashboard is a persistent two-way conversation interface, not merely a task launcher.
- **Requirement:** Every user message must receive a visible assistant response from the selected agent, including text-only answers, code-change summaries, clarification requests, blocked runs, and failures.
- **Persistence:** User and assistant messages must remain visible after Refresh, Load, and runtime restart.
- **Diagnostics:** Raw stdout/stderr must remain separate from the normal conversation and appear only in a bounded, redacted Details view.
- **Success semantics:** Text-only conversation can succeed without file changes; an explicit code-change task must not succeed unless the requested workspace change is verified.
- **Guardrail:** Agent-generated content must be escaped before rendering, and secrets must never be persisted or displayed.
- **Evidence:** Manual runs carry `agentResponse` and `intent` end to end; `node tests/phase2-dashboard.test.mjs`, `node tests/direct-manual-run-executor.test.mjs`, and `node tests/host-connector.test.mjs` cover text-only success, verified code change, no-change failure under `code-change`, blocked-run explanation, legacy records without `agentResponse`, escaping, and restart survival. Live dashboard runs confirmed both paths: a question answered with no file changes, and `hello.txt` created only inside the isolated run worktree with no merge.
- **Follow-up:** Persistent multi-turn agent context/thread continuity is a separate required slice. It is not supported today — each send is an independent agent invocation in a fresh worktree with no prior history.
