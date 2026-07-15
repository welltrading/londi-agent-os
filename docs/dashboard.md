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

`getUiBootstrapModel()` exposes a `phase2DashboardRuntime` controller. It starts from a local snapshot and performs Local API calls only when the UI explicitly invokes `load()`, `refresh()`, or `writeRunSummary()`.

- `load()` fetches agents, skills, projects, and Obsidian status.
- `refresh()` repeats the load with the refresh flag for agent/usage and Obsidian status.
- `writeRunSummary()` posts the minimal run summary to Local API and updates the dashboard view model from the returned run.

`createPhase2DashboardInteractionModel()` wraps the view model with UI-ready runtime state and control descriptors for Load, Refresh, and Write Run Summary. It exposes loading, last action, and error labels so the visual dashboard can wire buttons to `phase2DashboardRuntime` without adding CLI, filesystem, polling, or direct Obsidian behavior to the UI.
