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

`getUiBootstrapModel()` exposes both `phase2DashboardRuntime` and `phase2DashboardController`. The runtime starts from a local snapshot and performs Local API calls only when explicitly invoked. The controller is the UI-facing button/action bridge and returns a frozen interaction model after every action.

- `phase2DashboardController.dispatch('load')` fetches agents, skills, projects, and Obsidian status through the runtime.
- `phase2DashboardController.dispatch('refresh')` repeats the load with the refresh flag for agent/usage and Obsidian status.
- `phase2DashboardController.dispatch('write-run-summary', { input })` posts the minimal run summary through Local API, generates an idempotency key when needed, and updates the dashboard view model from the returned run.
- Unknown controls and runtime failures render as inline interaction-state errors instead of adding direct side effects to the UI.

`createPhase2DashboardInteractionModel()` wraps the view model with UI-ready runtime state and control descriptors for Load, Refresh, and Write Run Summary. It exposes loading, last action, and error labels so the visual dashboard can wire buttons to `phase2DashboardController` without adding CLI, filesystem, polling, or direct Obsidian behavior to the UI.
