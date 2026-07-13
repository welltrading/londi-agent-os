# Git Project Validation and Locking

E2-T01 introduces the Workspace Manager baseline for Git-only project validation and target-branch locking.

Runtime source of truth:

- `packages/orchestrator/src/workspace-manager.js`
- `tests/workspace-manager.test.mjs`

## Checks

- Repository path exists and is a directory.
- Repository must be Git; non-Git returns `Blocked`.
- Target branch must exist locally.
- Base commit is resolved from `<targetBranch>^{commit}`.
- Dirty state is reported as `Ready with Warnings` by default.
- Dirty state can be policy-blocked with `allowDirty: false`.
- One lock per repository + target branch is allowed; conflicting runs are blocked.

This task does not create a branch or worktree yet. Branch/worktree lifecycle starts in E2-T02.

## E2-T02 branch/worktree lifecycle

The Workspace Manager now creates deterministic run branches and worktrees:

- Branch: `londi/run-<run-id-short>` where the normalized run id is capped at 12 characters.
- Worktree: `<dataRoot>/worktrees/<run-id>/`.
- Manifest: `londi-workspace-manifest.json` is written inside the worktree.
- Manifest stores `runId`, source repository path, `targetBranch`, `baseCommit`, `branchName`, `worktreePath`, dirty entries and creation time.
- Existing branch/worktree paths are never reused without verification; lifecycle creation fails with `WorkspaceLifecycleError`.

E2-T02 does not implement ACL isolation, diff snapshots or cleanup retention; those are handled by later E2 tasks.

## E2-T03 service account isolation baseline

The Workspace Manager now exposes a service-account isolation policy model:

- Default service account name: `LondiAgentOSService`.
- Writes are allowed only under the current run worktree and current run artifacts path.
- Writes are denied for the source repository, vault roots, system folders and other run worktrees.
- Negative tests prove write attempts to those locations are rejected with `WorkspaceIsolationError`.

This baseline models and verifies path-level isolation in the orchestrator. OS-specific Windows ACL application is deferred to the later Windows/service hardening slice.

## E2-T05 Git snapshots, status and diff

The Workspace Manager now exposes Git status/diff and acceptance snapshot helpers:

- `getWorkspaceStatusSummary()` reads `HEAD`, status entries, committed diff entries from `baseCommit...HEAD`, and working-tree diff entries.
- `getWorkspaceDiff()` returns a redacted patch from the run worktree only.
- `createWorkspaceAcceptanceSnapshot()` writes a JSON summary and redacted patch under the run artifacts path before Acceptance.
- Suspicious diff files such as `.env*`, secret-related filenames and credential/private-key names are marked for review.
- Secret-like strings in diffs are replaced with `[REDACTED_SECRET]`.

Negative coverage proves a change in the source repository outside the run worktree is not included in the acceptance diff/snapshot.

## E2-T06 Cleanup and retention guards

The Workspace Manager now exposes idempotent cleanup planning and execution helpers:

- `createWorkspaceCleanupPlan()` evaluates run metadata against retention policy before any deletion.
- `executeWorkspaceCleanupPlan()` removes the run worktree and deletes the run branch only when the plan is eligible.
- `Accepted` and open runs are never cleanup-eligible.
- `Completed` runs become eligible only after seven days and only with merge verification metadata (`mergeVerifiedAt` and `targetCommit`).
- `Failed`, `Cancelled` and `Needs Attention` runs use a 30-day retention window.
- `keep: true` blocks cleanup regardless of age.
- Branch deletion is guarded behind `Completed` + merge verification; non-completed cleanup never deletes branches.
- Cleanup execution is idempotent: already-removed worktrees or branches return `already-absent` instead of failing.

Integration coverage verifies Accepted/open runs are blocked, branch deletion is refused without merge verification, partial cleanup can be retried, and stale completed runs remove both branch and worktree.

## E2-T07 Workspace security suite

The Workspace Manager isolation checks now include security-focused escape coverage:

- Path traversal attempts are resolved before authorization.
- Control-character and malicious filename inputs are rejected before write simulation.
- Symlink escapes are blocked by comparing both lexical path and physical `realpath` target.
- Cross-worktree symlink escapes are denied.
- Writes through links to vault/system/other-worktree roots fail with `WorkspaceIsolationError`.
- Allowed writes must remain inside the run worktree or run artifacts both logically and physically.

Integration coverage verifies traversal, malicious filename, vault symlink, and cross-worktree symlink cases, with zero writes allowed outside the run worktree/artifacts boundary.
