# Runtime Dashboard UI Slice Spec

Date: 2026-07-16
Status: Approved for build
Owner: Londi / Agent Zero

## Objective

Build the first official Runtime Dashboard screen for Londi Agent OS under `apps/ui`, turning the verified live preview into a real daily operator surface.

The screen should answer:

> What is the current state of my local work system, and what one safe action can I run now?

## Scope

The first slice is a small Runtime Dashboard App wrapper over the already verified Phase 2 dashboard model and DOM binder.

It must provide:

- Official runtime entry under `apps/ui`.
- Mounting through the existing `createPhase2DashboardDomBinder(...)` path.
- Live `Load` and `Refresh` through Local API.
- `Write Run Summary` through Local API / HostConnector into Obsidian.
- Basic Project Workspace, Agent Status, Skill Registry, Runs, and Obsidian status display from the existing runtime contracts.
- A small public API such as:
  - `mount()`
  - `unmount()`
  - `isMounted()`
  - optionally `getStatus()`

## Non-goals

Do not add in this slice:

- React, Next.js, or a new UI framework/build system.
- A second copy of dashboard HTML/UI logic from the preview.
- Polling.
- Network calls during module import or bootstrap before explicit user action.
- Direct UI access to CLI, filesystem, secrets, or Obsidian.
- `Start Codex Task`.
- `Request Claude Review`.
- Hermes knowledge layer behavior.
- Full run history.
- Advanced project switching.
- Multi-client / SaaS UI behavior.
- Client branding, auth, tenant separation, or billing.

## Architecture Boundary

The boundary remains:

```text
Dashboard UI -> Local API -> HostConnector -> local tools / Obsidian
```

Rules:

- UI must not call local CLIs directly.
- UI must not write files or Obsidian directly.
- UI must not read secrets from the host environment.
- Local API token and base URL may be provided by the caller/runtime wrapper.
- Actions happen only after explicit user click or caller invocation.
- Usage warnings remain visual-only; no automatic blocking in this slice.

## Files Likely to Change

Expected:

- `apps/ui/src/runtime-dashboard.js` — new Runtime Dashboard App wrapper.
- `apps/ui/src/index.js` — export the runtime dashboard entry if needed.
- `tests/ui-shell.test.mjs` or a new targeted UI runtime test — verify wrapper contract.
- `tests/phase2-dashboard.test.mjs` — only if binder contract needs additional coverage.
- `specs/2026-07-16-runtime-dashboard-ui-slice.md` — this spec.
- `decisions/log.md` — decision record for approved runtime UI slice.

Avoid unless clearly required:

- `docs/previews/live-dashboard-preview.html` — remains demo/reference.
- Local API internals — the verified live boundary should be reused, not redesigned.
- Package contracts — change only if an existing contract is insufficient.

## Definition of Done

This slice is done only when all are true:

1. Runtime dashboard entry exists under `apps/ui`.
2. It mounts through the existing DOM Binder.
3. It supports live Load/Refresh via Local API.
4. It supports Write Run Summary through HostConnector/Obsidian path.
5. It does not perform polling.
6. It does not perform bootstrap/module-import network calls.
7. It does not bypass Local API / HostConnector boundary.
8. It exposes a small runtime API suitable for an app shell.
9. Tests cover mount behavior and boundary guardrails.
10. Working tree is clean after commit.

## Verification Commands

Minimum checks before completion:

```bash
node tests/smoke.test.mjs
node tests/phase2-dashboard.test.mjs
node tests/ui-shell.test.mjs
git diff --check
npm run build
```

Run if docs/runbook-sensitive files change:

```bash
node tests/runbook.test.mjs
```

Run broader gate if package exports or shared contracts change:

```bash
npm run ci
```

## Build Order

1. Add `apps/ui/src/runtime-dashboard.js` as a thin wrapper over `getUiBootstrapModel(...)` and `createPhase2DashboardDomBinder(...)`.
2. Export the runtime entry from `apps/ui/src/index.js`.
3. Add targeted tests for mount/unmount/status and no network before explicit interaction.
4. Verify existing dashboard tests still pass.
5. Commit only after verification passes.
