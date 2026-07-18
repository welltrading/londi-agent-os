# Runtime Dashboard Run Console Slice Spec

Date: 2026-07-18
Status: Approved for build
Owner: Londi / Agent Zero
Source discovery: `/a0/usr/workdir/brainstorms/2026-07-18-runtime-dashboard-run-console.md`

## Objective

Turn the Runtime Dashboard from a status panel into a practical first Run Console by allowing Londi to create a minimal manual/synthetic run from the dashboard, persist it through the Local API, and see it appear in the Runs list.

The screen should prove this product flow:

```text
New Run chat composer -> Local API -> data/runs/runs.json -> refreshed Runs list
```

## Scope

Add the smallest useful Run Console slice to the existing Runtime Dashboard.

It must provide:

- A new `New Run` section above the existing `Runs` section.
- A chat-like composer for `Ask Agent Zero / General task`.
- Composer elements:
  - `Ask Agent Zero` header
  - recent manual messages area
  - one required `Message` textarea
- A primary button labeled `Send`.
- Minimal required-message validation.
- Local persistence first through the Local API.
- Storage in a single JSON file at `data/runs/runs.json`.
- Newly created runs displayed in the existing `Runs` list.
- Success/error feedback after submit.

## Run Record Contract

A created manual run record should include at minimum:

```json
{
  "id": "run-...",
  "type": "manual",
  "action": "ask-agent-zero-general-task",
  "title": "...",
  "prompt": "...",
  "summary": "...",
  "status": "succeeded",
  "createdAt": "ISO-8601 timestamp"
}
```

Rules:

- `status` defaults to `succeeded` because a manual/synthetic run already includes a summary and is complete at save time.
- `id` must be stable and unique enough for local run history.
- `createdAt` must be generated server-side or Local API side, not trusted from the UI if avoidable.
- The first slice does not need tags, priority, project switching, transcript storage, nested messages, or detail pages.

## UI Behavior

### Placement

The chat composer lives in a new `New Run` section above the existing `Runs` section.

### Submit

Clicking `Send` should:

1. Validate `Message` is non-empty and derive `title` and `summary` from it.
2. If validation fails, show a short inline error and do not save.
3. If validation passes, call the Local API to create the manual run.
4. Persist the run to `data/runs/runs.json` through the Local API / server side.
5. Refresh the Runs list.
6. Clear all form fields.
7. Show a short success message.

### Runs List Display

Newly created runs should appear as a simple card/row with:

- `Title`
- status `succeeded`
- creation date
- short `Summary`

No click-through detail view is required in this slice.

## Architecture Boundary

The boundary remains:

```text
Dashboard UI -> Local API -> HostConnector / local runtime storage
```

Rules:

- UI must not write `data/runs/runs.json` directly.
- UI must not call local CLIs directly.
- UI must not write Obsidian directly.
- UI must not read secrets from the host environment.
- Actions happen only after explicit user click.
- No polling.
- No network calls during module import or bootstrap before explicit mount/user action.

## Non-goals

Do not add in this slice:

- Real Agent Zero execution.
- Codex or Claude Code subprocess execution.
- Hermes knowledge layer behavior.
- Obsidian write-back for manual run creation.
- Full transcript/message history.
- Run detail page or click-through view.
- Advanced metadata fields such as tags, priority, client, cost, or token usage.
- Obsidian-first runtime storage.
- SQLite migrations.
- React, Next.js, or a new UI framework/build system.
- Polling or background refresh.

## Files Likely to Change

Expected:

- `apps/local-api/src/...` — Local API endpoint/handler for creating/listing manual runs if no existing contract is sufficient.
- `apps/ui/src/...` — Runtime Dashboard screen/controller/binder integration for the `New Run` chat composer.
- `apps/ui/runtime-dashboard.html` — only if the static entrypoint needs minor harness support.
- `tests/rest-contracts.test.mjs` — Local API run creation/listing contract coverage.
- `tests/ui-shell.test.mjs` or a new targeted UI test — form validation, submit behavior, list refresh, no direct storage access.
- `docs/dashboard.md` — document the new manual Run Console capability.
- `decisions/log.md` — decision record for approved Run Console slice.

Avoid unless clearly required:

- New framework/build system.
- New database layer.
- Obsidian write-back internals.
- Codex/Claude/Hermes adapters.

## Definition of Done

This slice is done only when all are true:

1. `New Run` section appears above `Runs` in the Runtime Dashboard.
2. The section looks like chat: `Ask Agent Zero`, recent messages, one message textarea, and `Send`.
3. `Send` validates the message as required and derives title/summary behind the scenes.
4. Valid submit creates a manual run through the Local API.
5. The run is persisted in `data/runs/runs.json`.
6. The new run appears in `Runs` as a simple card/row with title, status, creation date, and summary.
7. New manual runs default to `status: "succeeded"`.
8. Successful submit clears the form and shows a short success message.
9. Validation errors do not save and show a short error message.
10. No UI direct filesystem/CLI/Obsidian access is introduced.
11. No polling or bootstrap/module-import network calls are introduced.
12. Tests cover the Local API contract and UI behavior.
13. Working tree is clean after commit.

## Verification Commands

Minimum checks before completion:

```bash
node tests/rest-contracts.test.mjs
node tests/ui-shell.test.mjs
git diff --check
npm run build
npm run lint
```

Run broader checks if shared contracts, package exports, or runtime boundaries change:

```bash
npm run ci
```
