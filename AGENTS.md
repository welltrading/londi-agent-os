# DOX — Londi Agent OS

## Purpose

Londi Agent OS is a local-first orchestration system for managing project-based work across Agent Zero, Codex, Claude Code, Hermes, Local API, Dashboard UI, HostConnector, Git workspaces, and Obsidian write-back.

This file is the root DOX contract. Agents must read it before editing this repository, then read the nearest child `AGENTS.md` for every touched path.

## Core Contract

- `AGENTS.md` files are binding work contracts for their subtrees.
- Re-read the applicable DOX chain in the current session before editing.
- Keep work products understandable from the nearest `AGENTS.md` plus every parent above it.
- Prefer the smallest working slice. Apply the remembered Ponytail principle: avoid unnecessary files, abstractions, dependencies, and scope creep.
- Significant technical/product decisions must be recorded in `decisions/log.md`.
- UI must not call local CLIs or write Obsidian directly; use Local API / HostConnector contracts.
- Preserve MVP guardrails: Git-only projects, no automatic merge, no Agent Zero/Hermes active adapter, and `Completed` only after verified manual merge.

## Project Operating Model

- Work is organized by `ProjectWorkspace`.
- Every project can bind all four agents: Agent Zero, Codex, Claude Code, Hermes.
- Skills are capabilities, not agents.
- Runs are executions of a skill by an agent under orchestration.
- Every project should expose a DOX profile via `AGENTS.md` and local project docs.

## Read Before Editing

1. Read this root `AGENTS.md`.
2. Identify every path you expect to touch.
3. Read the nearest child `AGENTS.md` along each path.
4. If a child index points to a deeper `AGENTS.md`, continue until the nearest scope is read.
5. If docs conflict, the closer doc controls local details, but no child may weaken this root contract.

## Update After Editing

Run a DOX pass before closeout. Update the closest owning `AGENTS.md` when a change affects:

- purpose, scope, ownership, responsibilities, or workflow
- contracts, APIs, data models, side effects, generated artifacts, or verification
- child DOX index contents
- durable user/project preferences or operating rules

Small implementation-only fixes may leave DOX unchanged, but explicitly consider whether the docs are still current.

## Verification

Use the narrowest relevant checks first, then broaden when shared contracts or package exports changed.

- Full gate: `npm run ci`
- Build: `npm run build`
- Source hygiene: `npm run lint`
- Package graph/type boundary: `npm run type-check`
- REST contracts: `node tests/rest-contracts.test.mjs`
- Phase 2 contracts: `node tests/phase2-runtime-contracts.test.mjs`
- HostConnector: `node tests/host-connector.test.mjs`
- Phase 2 dashboard: `node tests/phase2-dashboard.test.mjs`

## Child DOX Index

- `apps/AGENTS.md` — application surfaces: Local API and UI.
- `packages/AGENTS.md` — shared packages: contracts, orchestrator, adapters, migrations.
- `tests/AGENTS.md` — test suite rules and verification placement.
- `docs/AGENTS.md` — durable documentation and previews.
- `decisions/AGENTS.md` — append-only project decision log.
- `scripts/AGENTS.md` — repository automation and guard scripts.
- `reports/AGENTS.md` — generated/manual reports.
