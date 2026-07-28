# DOX — scripts/

## Purpose

Repository automation, checks, package graph validation, hygiene checks, and platform baseline scripts.

## Ownership

Scripts should be deterministic local checks used by package scripts or CI.

## Local Contracts

- Do not require secrets.
- Do not mutate source files unless explicitly documented as a generator/update script.
- Keep output clear for CI failures.
- Runtime Dashboard static serve scripts may host static repository files only; they must not proxy Local API, read secrets, or perform runtime writes. `serve-runtime-dashboard.mjs` may substitute the process token into the dashboard entrypoint response only, served `no-store`; no other response may carry it.
- `serve-runtime.mjs` may orchestrate the Local API service plus static Runtime Dashboard UI as child processes, but must not print bearer tokens, proxy Local API, or perform runtime writes itself. When no token is supplied it mints a 32-byte URL-safe token for that process and passes the same value to both children in their environment; the token is never printed or persisted.
- Source hygiene covers HTML as well as JS/MD/YAML, and fails on a bearer token assigned inside HTML.

## Work Guidance

- Prefer Node scripts consistent with existing repo style.
- Add tests or CI script wiring when behavior becomes a gate.

## Verification

- Run the touched script directly.
- Run the package script that calls it, if any.

## Child DOX Index

No child DOX files yet.
