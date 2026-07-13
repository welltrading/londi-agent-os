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
