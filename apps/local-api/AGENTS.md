# DOX — apps/local-api/

## Purpose

Local API and service shell. This package exposes stable API/service boundaries for the local runtime.

## Ownership

- REST contracts and error/idempotency expectations live in `src/rest-contracts.js`.
- HostConnector boundary lives in `src/host-connector.js`.
- Package exports live in `src/index.js`.

## Local Contracts

- HostConnector is the only local-machine capability boundary for Phase 2.
- Obsidian writes must go through HostConnector.
- `LONDI_AGENT_OS_OBSIDIAN_ROOT` may configure the first HostConnector vault root for the service process; bearer tokens remain outside config.
- Agent status/usage collection must show source/cached/lastUpdated and must not fake API billing for subscription CLI tools.
- Manual refresh is on-demand only; no background polling.
- Writes/commands must stay idempotency-aware in REST contract metadata.
- Manual Run Console records are stored through HostConnector in `data/runs/runs.json` with their selected `agentId`. Creation persists `queued` first; when an execution bridge is configured, HostConnector records the real Direct pipeline result (`running`, `succeeded`, or `failed`). Without a bridge the record remains `queued` and must never become a synthetic success.
- The default Local API bridge supports only Codex and Claude Code in an isolated Git worktree, with internal MVP Gate A approval. It does not write Obsidian or merge branches.
- Project Browser snapshots are read-only HostConnector filesystem views for explicitly registered project roots; paths must stay inside the project root and hidden/ignored entries must not be exposed.

## Work Guidance

- Keep handlers/boundaries small and testable.
- Do not import UI code.
- Prefer contract types/helpers from `@londi-agent-os/contracts`.
- Keep file system effects injectable in tests.

## Verification

- `node tests/rest-contracts.test.mjs`
- `node tests/host-connector.test.mjs`
- `node tests/phase2-dashboard.test.mjs` when `/runs` behavior feeds the dashboard
- `npm run build`

## Child DOX Index

No child DOX files yet.
