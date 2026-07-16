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
