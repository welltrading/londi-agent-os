# E6-T04 Dashboard and Approvals Inbox

The UI dashboard model groups local API snapshots into active runs, waiting approvals, Needs Attention, and completed runs.

## Acceptance behavior

- Dashboard counts can be compared against API counts.
- Pending approvals populate the Approvals Inbox.
- Stale actions are marked `stale` and require reload before execution.
- Every action exposes an expected transition before the user acts.
- Needs Attention actions expose retry, replace-agent, and stop affordances.


## Phase 2 live dashboard slice

Phase 2 adds a live dashboard model alongside the MVP dashboard buckets. The model displays four agent cards, active project workspaces, active skills, Obsidian status, and the minimal Run Summary action.

Project-based work is represented by `ProjectWorkspace`: every project can bind Agent Zero, Codex, Claude Code, Hermes, and the active Phase 2 skills.

The UI must call Local API/HostConnector contracts only; it must not call local CLIs or write Obsidian files directly.

`getUiBootstrapModel()` exposes `phase2DashboardRuntime`, `phase2DashboardController`, and `phase2DashboardScreen`. The runtime starts from a local snapshot and performs Local API calls only when explicitly invoked. The controller is the UI-facing button/action bridge and returns a frozen interaction model after every action.

- `phase2DashboardController.dispatch('load')` fetches agents, skills, projects, and Obsidian status through the runtime.
- `phase2DashboardController.dispatch('refresh')` repeats the load with the refresh flag for agent/usage and Obsidian status.
- `phase2DashboardController.dispatch('write-run-summary', { input })` posts the minimal run summary through Local API, generates an idempotency key when needed, and updates the dashboard view model from the returned run.
- Unknown controls and runtime failures render as inline interaction-state errors instead of adding direct side effects to the UI.

`createPhase2DashboardInteractionModel()` wraps the view model with UI-ready runtime state and control descriptors for Load, Refresh, and Write Run Summary. `createPhase2DashboardScreenModel()` turns that interaction model into render-ready sections, buttons, status labels, and accessibility live text. `phase2DashboardScreen.render()` returns the current screen model; `phase2DashboardScreen.click(controlId, options)` routes enabled buttons through `phase2DashboardController.dispatch(...)` only.

`createPhase2DashboardShellModel()` is the DOM-neutral shell render tree for the Phase 2 dashboard. It maps the screen model into a header, runtime alerts, metric cards, toolbar buttons, and content sections. Toolbar buttons expose declarative `{ type: 'dispatch-control', controlId }` handlers only, so the visual/DOM layer can bind clicks without gaining Local API, CLI, filesystem, or Obsidian write access.

`createPhase2DashboardVisualAdapter()` is the first visual adapter over that shell model. It returns static HTML, a target selector, and click binding descriptors for the existing dispatch-only controls. The adapter does not mutate the DOM, register events itself, poll, call Local API, access HostConnector, spawn CLIs, read secrets, or write files/Obsidian. `getUiBootstrapModel()` exposes it as `phase2DashboardVisualAdapter`.

`createPhase2DashboardDomBinder()` is the controlled mount/bind layer for a host renderer. It accepts a provided `screen`, `documentRef`, and target selector/node, mounts the visual adapter's static HTML into that target, binds enabled dispatch-control buttons to `screen.click(controlId, options)`, and re-renders after dispatch. Dispatch options are produced only by an explicit `createDispatchOptions(controlId, binding)` hook; raw DOM events are not forwarded by default. The binder may perform controlled DOM mutation for mount/rerender/unmount, but it still does not poll, make bootstrap network calls, call Local API/HostConnector directly, access secrets, spawn CLIs, read/write files, or write Obsidian.

The screen, shell, visual adapter, and DOM binder preserve the runtime guardrails: dispatch-only button handling, no polling, no bootstrap network call, and no direct CLI/filesystem/Obsidian behavior in UI code.

`createRuntimeDashboardApp()` is the official Runtime Dashboard app wrapper. It lazily creates the Phase 2 dashboard runtime on `mount()`, mounts through `createPhase2DashboardDomBinder()`, and exposes `mount()`, `refresh()`, `unmount()`, `isMounted()`, and `getStatus()`. `apps/ui/runtime-dashboard.html` is the static browser entrypoint for this wrapper and can be served with `npm run serve:runtime-dashboard`; `docs/previews/runtime-dashboard-preview.html` remains the live preview. Both accept a bearer token/base URL, mount `createRuntimeDashboardApp()` after an explicit click, and keep Local API calls behind dashboard Load/Refresh/Write Run Summary controls. The runtime entrypoint also exposes a localhost-only `Use local dev token` button for local development; it fills the password field and default base URL without displaying the token and is hidden off `127.0.0.1`/`localhost`.

`npm run serve:runtime` starts the Local API service and static Runtime Dashboard UI together without adding a process-manager dependency. It requires `LONDI_AGENT_OS_LOCAL_API_TOKEN` in the shell, validates the token before startup, prints only the UI/API URLs, sanitizes child output, and leaves browser authentication as an explicit user action: paste a bearer token or use the localhost-only dev shortcut. It does not proxy Local API or weaken the UI → Local API → HostConnector boundary.
