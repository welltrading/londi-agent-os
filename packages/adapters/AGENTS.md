# DOX — packages/adapters/

## Purpose

Adapter contract and boundary package for approved local CLI agents.

## Ownership

- Claude Code and Codex adapter contract descriptors live here.
- Boundary verification prevents unauthorized active adapter implementation where forbidden by phase scope.

## Local Contracts

- Active adapters are only Claude Code and Codex in MVP/Phase 2 scope.
- Agent Zero is orchestrator/host, not an active execution adapter.
- Hermes is planned/display-only, not an active adapter.

## Work Guidance

- Do not add active execution behavior unless scope explicitly changes.
- Preserve boundary verification.

## Verification

- `node packages/adapters/verify-no-active-adapters.mjs`
- `node tests/adapter-contract.test.mjs`
- `node tests/adapter-contract-parity.test.mjs`

## Child DOX Index

No child DOX files yet.
