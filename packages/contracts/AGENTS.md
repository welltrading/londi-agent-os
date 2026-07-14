# DOX — packages/contracts/

## Purpose

Shared contracts package for configuration, compatibility, pipeline templates, and Phase 2 runtime/project contracts.

## Ownership

- `src/phase2-runtime.js` owns four-agent, skills, usage, project workspace, minimal run, and Obsidian Run Summary contracts.
- `src/index.js` owns public exports.

## Local Contracts

- Contracts must be pure JavaScript with no filesystem/process/network side effects.
- `ProjectWorkspace` is the project-level binding between a project, all agents, active skills, and DOX profile paths.
- Usage contracts must support subscription/CLI modes and must not assume API billing for Codex/Claude Code.
- Add validation for every public enum-like value.

## Work Guidance

- Keep contract names explicit and stable.
- Add tests before or with public contract changes.
- Keep sanitization conservative and predictable.

## Verification

- `node tests/phase2-runtime-contracts.test.mjs`
- `node tests/smoke.test.mjs` when package exports change.
- `npm run build`

## Child DOX Index

No child DOX files yet.
