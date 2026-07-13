# E3-T05 Codex Adapter

The adapter package now includes a local Codex CLI implementation of the E3-T01 contract.

## Operations

`createCodexAdapter()` implements the full contract: health, capabilities, start, deliverTask, heartbeat, checkpoint, cancel, resume and collectArtifacts.

## Health/auth/version

Health runs local CLI checks for `codex --version` and `codex auth status`. The adapter reports success only when both checks exit with status `0`.

## Process control

Execution uses the E2-T04 attempt process manager. `start`, `deliverTask`, `heartbeat`, and `cancel` operate through tracked attempt IDs rather than unmanaged foreign processes.

## Redaction

CLI stdout/stderr are sanitized before becoming normalized adapter result data, using the same redaction path as Claude Code.

## Boundary

This is the Codex adapter only. Agent Zero/Hermes adapters remain out of scope.
