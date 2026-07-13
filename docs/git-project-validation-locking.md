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
