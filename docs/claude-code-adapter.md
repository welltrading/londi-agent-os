# E3-T04 Claude Code Adapter

The adapter package now includes a local Claude Code CLI implementation of the E3-T01 contract.

## Operations

`createClaudeCodeAdapter()` implements the full contract:

- `health`
- `capabilities`
- `start`
- `deliverTask`
- `heartbeat`
- `checkpoint`
- `cancel`
- `resume`
- `collectArtifacts`

## Health/auth/version

Health runs local CLI checks for:

- `claude --version`
- `claude auth status`

The adapter reports success only when both checks exit with status `0`.

## Process control

Execution uses the E2-T04 attempt process manager. `start`, `deliverTask`, `heartbeat`, and `cancel` operate through tracked attempt IDs rather than unmanaged foreign processes.

## Redaction

CLI stdout/stderr are sanitized before becoming normalized adapter result data. The redaction layer covers bearer tokens, token/password/secret/API-key assignments, long opaque credentials, and multiline log injection.

## Boundary

This is the Claude Code adapter only. Codex is added separately in E3-T05. Agent Zero/Hermes adapters remain out of scope.
