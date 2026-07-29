# DOX — packages/adapters/

## Purpose

Adapter contract and boundary package for approved local CLI agents.

## Ownership

- Claude Code and Codex adapter contract descriptors live here.
- Boundary verification prevents unauthorized active adapter implementation where forbidden by phase scope.

## Local Contracts

- Active adapters are only Claude Code and Codex in MVP/Phase 2 scope.
- Codex executes with `--sandbox workspace-write`. A continued conversation uses `exec resume`, which has no `--sandbox` flag and therefore must restate the mode via `CODEX_RESUME_SANDBOX_ARGS`; without it the resumed turn reverts to the read-only default. `danger-full-access` and the approval-bypass flags stay unused.
- Adapters whose CLI reports a conversation session expose `parseSessionId`; callers must treat its absence as "no thread support" rather than an error.
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
