# DOX — tests/

## Purpose

Executable verification for contracts, domain behavior, API descriptors, UI models, security gates, and release criteria.

## Ownership

- Tests mirror source modules by behavior area.
- New public behavior should have a targeted test.

## Local Contracts

- Tests should use Node built-ins and repository modules unless a dependency is already present.
- Avoid network or host-machine assumptions.
- Use temp directories for filesystem side effects and clean them up.

## Work Guidance

- Add narrow tests for the changed contract/model first.
- Keep tests deterministic with fixed timestamps where relevant.
- If package scripts include a new test, ensure `npm run ci` picks it up.

## Verification

- Targeted `node tests/<name>.test.mjs` during development.
- `npm run ci` before declaring broad completion.

## Child DOX Index

No child DOX files yet.
