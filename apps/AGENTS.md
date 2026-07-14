# DOX — apps/

## Purpose

Application-facing packages for Londi Agent OS.

## Ownership

- `apps/local-api` owns REST/SSE/service boundaries and HostConnector exposure.
- `apps/ui` owns dashboard/client-state/UI models.
- Apps depend on shared contracts; they should not redefine domain contracts locally.

## Local Contracts

- UI must call Local API contracts only.
- UI must not spawn processes, call CLI tools, read secrets, or write Obsidian files.
- Local API may expose HostConnector boundaries but should keep implementation side effects behind that interface.
- Phase 2 live slice is Dashboard -> Local API -> HostConnector -> agent status/usage + Obsidian Run Summary.

## Work Guidance

- Keep app code thin and contract-driven.
- Put reusable domain models in `packages/contracts`.
- Add/adjust REST contract tests when endpoint metadata changes.
- Add UI model tests when dashboard/bootstrap behavior changes.

## Verification

- Local API changes: `node tests/rest-contracts.test.mjs`, `node tests/host-connector.test.mjs` when HostConnector is involved.
- UI changes: `node tests/ui-shell.test.mjs`, `node tests/dashboard.test.mjs`, `node tests/phase2-dashboard.test.mjs` when Phase 2 dashboard is involved.
- Shared app/package changes: `npm run build`.

## Child DOX Index

- `apps/local-api/AGENTS.md` — Local API and HostConnector rules.
- `apps/ui/AGENTS.md` — UI shell and dashboard model rules.
