# DOX — packages/orchestrator/

## Purpose

Orchestration engines, workflow rules, state machines, gates, security policies, and operational safety logic.

## Ownership

This package owns domain behavior behind runs, approvals, pipelines, workspaces, Obsidian context/write-back, recovery, backups, and release decisions.

## Local Contracts

- Preserve Git-only project handling.
- Preserve no automatic merge.
- Preserve acceptance/completion gates.
- Keep secret/network/write-back policies explicit and tested.

## Work Guidance

- Keep changes narrow and matched to existing module style.
- Add or update the module-specific test and docs file for durable behavior changes.

## Verification

- Run the matching `tests/*.test.mjs` for touched module.
- `npm run build` for export/package changes.

## Child DOX Index

No child DOX files yet.
