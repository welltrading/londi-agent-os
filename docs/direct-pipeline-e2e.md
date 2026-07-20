# Direct Pipeline E2E Harness

This harness proves the MVP Direct pipeline over a real temporary Git repository and Git worktree without browser/UI dependencies.

Runtime source of truth:

- `tests/direct-pipeline-e2e.test.mjs`

## Covered flow

1. Create a real temporary Git project on `main`.
2. Create an isolated run branch and Git worktree through `createRunWorkspace()`.
3. Open and approve Gate A with the Direct pipeline template.
4. Cross the Claude Code adapter boundary through the canonical operations:
   - `health`
   - `capabilities`
   - `start`
   - `deliverTask`
   - `heartbeat`
   - `collectArtifacts`
   - `checkpoint`
5. Commit simulated agent output inside the run worktree only.
6. Create a workspace acceptance snapshot and artifact manifest.
7. Open and approve Gate E, moving the run to `Accepted`.
8. Verify that `Accepted` does not start retention cleanup.
9. Create Gate F manual merge instructions with automatic merge disabled.
10. Perform the manual merge outside the application path in the test harness.
11. Verify Gate F through `verifyManualMerge()`.
12. Move the run to `Completed` through `completeRunAfterGateF()`.
13. Verify retention starts only after `Completed`.

## Important limitation

The test intentionally uses a fake process manager and simulated file write after `deliverTask()` so it can run deterministically in CI without requiring a real Claude Code or Codex CLI installation. It validates the adapter boundary and domain flow, not live LLM behavior.

## Verification

```bash
node tests/direct-pipeline-e2e.test.mjs
```
