# DOX — apps/ui/

## Purpose

Local UI shell and dashboard/client-state models.

## Ownership

- `src/dashboard.js` owns MVP dashboard buckets/actions.
- `src/phase2-dashboard.js` owns Phase 2 live dashboard model.
- `src/index.js` owns UI bootstrap exports.

## Local Contracts

- UI models consume contracts and API descriptors; they do not execute system commands.
- UI must not call local CLIs, access secrets, or write Obsidian directly.
- Project-based work should display `ProjectWorkspace` with all four agents when relevant.
- Phase 2 dashboard must expose agents, skills, projects, runs, refresh, and Obsidian Run Summary action model.

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
