# DOX — packages/migrations/

## Purpose

SQLite migration package boundary.

## Ownership

Owns migration entrypoints and migration package exports.

## Local Contracts

- Migration changes must be reversible or explicitly documented.
- Do not add runtime data/state to source-controlled files.

## Work Guidance

- Keep migrations deterministic.
- Update migration docs/tests for schema behavior changes.

## Verification

- `node tests/smoke.test.mjs` for current migration bootstrap coverage.
- `npm run build`.

## Child DOX Index

No child DOX files yet.
