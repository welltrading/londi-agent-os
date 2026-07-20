# E8-T08 Five Consecutive Acceptance Runs

E8-T08 records a signed report for five consecutive acceptance runs over real temporary Git repositories.

## Required coverage

- Exactly five consecutive passing runs.
- At least two runs with Claude Code.
- At least two runs with Codex.
- All MVP templates:
  - Direct
  - Plan & Build
  - Plan, Build & Review
- Restart recovery coverage.
- Secret grant and redacted injection coverage.
- Sensitive approval coverage.
- Manual merge and Gate F verification on every run.
- Audit export on every run.

## Harness behavior

The acceptance harness creates real Git repositories, commits a base branch, creates a run branch, produces accepted output, performs a manual merge outside the application code path, and verifies Gate F using the same manual-merge verifier used by the product domain.

Each run also exercises the active adapter boundary for the assigned MVP adapter (`claude-code` or `codex`) through the shared contract: health, capabilities, start, heartbeat, and cancel. The harness uses the real attempt process manager and spawns a controlled local child process via `process.execPath`, so this proves adapter process supervision without invoking live LLM work.

The harness also verifies that exported audit data does not contain secret material.

## Report contract

Runtime source of truth:

- `packages/orchestrator/src/acceptance-runs.js`
- `tests/acceptance-runs.test.mjs`

A valid report is signed, contains five passing runs, proves adapter/template/feature coverage, and contains no secret value leakage.
