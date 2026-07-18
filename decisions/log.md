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
