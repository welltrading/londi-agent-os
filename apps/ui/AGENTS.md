# DOX — apps/ui/

## Purpose

Local UI shell and dashboard/client-state models.

## Ownership

- `src/dashboard.js` owns MVP dashboard buckets/actions.
- `src/phase2-dashboard.js` owns Phase 2 live dashboard model.
- `src/runtime-dashboard.js` owns the official Runtime Dashboard app wrapper over the Phase 2 DOM binder.
- `runtime-dashboard.html` owns the static browser entrypoint for that Runtime Dashboard wrapper.
- `src/index.js` owns UI bootstrap exports.

## Local Contracts

- UI models consume contracts and API descriptors; they do not execute system commands.
- UI must not call local CLIs, access secrets, or write Obsidian directly.
- Project-based work should display `ProjectWorkspace` with all four agents when relevant.
- Phase 2 dashboard must expose agents, skills, projects, a read-only Project Browser snapshot, runs, refresh, Obsidian Run Summary action model, and the manual New Run chat composer with per-conversation agent and project selectors for the Run Console slice.
- The composer sends `projectId` with every manual run and never offers a branch input; the target branch comes from the project's stored default branch. Sending to an executing agent (`codex`, `claude-code`) without a selected project must be blocked with a readable error, never sent silently. The chosen agent and project must survive the re-render after Send/Refresh.
- `runtime-dashboard.html` must never contain a bearer token. It carries the `%%LONDI_LOCAL_API_TOKEN%%` placeholder that the local dashboard server replaces per response.
- Phase 2 DOM binding may mount static dashboard HTML into a provided target and bind dispatch-only controls/form values, but it must not call Local API, HostConnector, CLIs, secrets, filesystem, or Obsidian directly.
- Runtime Dashboard app code should stay a thin wrapper around bootstrap + DOM binder; apply the PONYTAIL minimalism gate before adding files, abstractions, or dependencies.

## Work Guidance

- Keep UI model logic pure and easy to test.
- Sanitize displayed text where existing patterns require it.
- Add tests for new visible model behavior.

## Verification

- `node tests/ui-shell.test.mjs`
- `node tests/dashboard.test.mjs`
- `node tests/phase2-dashboard.test.mjs`
- `npm run build`

## Child DOX Index

No child DOX files yet.
