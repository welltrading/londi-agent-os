# DOX — scripts/

## Purpose

Repository automation, checks, package graph validation, hygiene checks, and platform baseline scripts.

## Ownership

Scripts should be deterministic local checks used by package scripts or CI.

## Local Contracts

- Do not require secrets.
- Do not mutate source files unless explicitly documented as a generator/update script.
- Keep output clear for CI failures.

## Work Guidance

- Prefer Node scripts consistent with existing repo style.
- Add tests or CI script wiring when behavior becomes a gate.

## Verification

- Run the touched script directly.
- Run the package script that calls it, if any.

## Child DOX Index

No child DOX files yet.
