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
- Agent status/usage collection must show source/cached/lastUpdated and must not fake API billing for subscription CLI tools.
- Manual refresh is on-demand only; no background polling.
- Writes/commands must stay idempotency-aware in REST contract metadata.

## Work Guidance

- Keep handlers/boundaries small and testable.
- Do not import UI code.
- Prefer contract types/helpers from `@londi-agent-os/contracts`.
- Keep file system effects injectable in tests.

## Verification

- `node tests/rest-contracts.test.mjs`
- `node tests/host-connector.test.mjs`
- `npm run build`

## Child DOX Index

No child DOX files yet.
