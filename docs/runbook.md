# E8-T07 Operations Runbook

This runbook is the operator-facing procedure for installing, running, diagnosing, recovering, backing up, restoring, updating, rolling back and cleaning up Londi Agent OS MVP.

## Audience

Operator with access to the local Windows workstation and the project repository. No developer-only context is required.

## Safety rules

- Keep the Local API bound to `127.0.0.1` only.
- Never paste bearer tokens into URLs or logs.
- Do not start restore, update or cleanup while runs are active.
- Do not mark a run `Completed` before successful manual merge verification.
- Do not auto-merge generated changes.
- If a step fails, keep artifacts and audit exports before retrying.

## Install

1. Verify prerequisites:
   - Windows 11 22H2 or newer.
   - Node.js version from the compatibility manifest.
   - Git version from the compatibility manifest.
   - Claude Code and Codex CLIs installed and authenticated if those adapters are used.
2. Clone the repository to a local folder outside Obsidian.
3. Run `npm install`.
4. Run `npm run ci`.
5. Confirm all checks pass before using the system.

## Start

1. Create or load the Local API token from Windows Credential Manager.
2. Start the service with `node apps/local-api/src/index.js --service` or install it using the Windows service plan in `docs/windows-service.md`.
3. Open the UI on the exact configured local origin.
4. Confirm `/system/health` is healthy and reports:
   - bind: `127.0.0.1`
   - credential source: `windows-credential-manager`
   - redaction enabled
   - structured logging enabled

## Stop

1. Stop new run creation.
2. Wait for active runs to reach a terminal/manual state, or safely cancel them.
3. Stop the Local API service.
4. Confirm health no longer reports `running`.

## Diagnostics

Run these checks in order:

1. `npm run ci` — full local gate.
2. `npm run security:scan` — source hygiene, adapter boundary and hardening.
3. `npm run check:windows` — Windows baseline manifest.
4. Inspect Audit export for the failing run.
5. Inspect run artifacts:
   - `handoff.md`
   - `review.md`
   - `summary.md`
   - checkpoint manifests
   - redacted logs
6. If SSE disconnects, reload REST snapshot and resume from the latest retained event ID.

## Recovery after crash or restart

1. Start the Local API.
2. Let restart recovery produce the consistency report.
3. Do not auto-resume runs.
4. For each interrupted run choose one action:
   - Resume from verified checkpoint.
   - Replace agent/attempt.
   - Stop the run.
5. Verify artifact manifests before resuming.
6. Export Audit after recovery if the crash affected a client-facing run.

## Backup

1. Ensure no maintenance operation is already running.
2. Create daily or pre-maintenance backup.
3. Confirm backup includes only:
   - SQLite database
   - local config
   - artifact manifests
   - handoffs
   - reviews
   - summaries
4. Confirm backup excludes:
   - secrets
   - `.env*`
   - source code directories
   - `.git`
   - dependency folders
5. Verify integrity before trusting the backup.

## Restore drill / restore production state

1. Block new runs.
2. Confirm there are no active runs.
3. Create a pre-restore snapshot.
4. Select the backup.
5. Verify backup integrity.
6. Verify compatibility manifest.
7. Run full preflight.
8. Execute restore.
9. Verify restored file hashes and health.
10. Confirm restore status is `Verified`.
11. For a drill, confirm 1GB restore evidence completes within 15 minutes.

## Stable update

1. Weekly, check the stable channel.
2. If active runs exist, postpone the update.
3. Create a pre-update snapshot.
4. Install the target version side by side.
5. Run smoke tests.
6. Switch atomically only after smoke tests pass.
7. Verify at least two healthy versions exist.

## Rollback

1. Use rollback only when update smoke tests fail, post-switch verification fails, or an operator decides the new version is unsafe.
2. Confirm a verified pre-update snapshot exists.
3. Restore the previous current marker.
4. Remove the failed side-by-side release.
5. Run smoke tests again on the previous version.
6. Export Audit for the maintenance event.

## Cleanup

1. Never delete Accepted runs that are not cleanup-eligible.
2. Keep completed run retention according to config.
3. Rotate logs at 20MB and keep up to five parts per attempt.
4. Keep audit retention according to config.
5. Run cleanup only after backups/restore/update are idle.

## Known limitations

- MVP is local-first and Windows-first.
- Active adapters are Claude Code and Codex only.
- Agent Zero/Hermes adapters are intentionally not included.
- No automatic merge.
- Completion requires successful manual merge verification.
- Obsidian context is read-only until approved; write-back is limited to approved summaries/decisions/insights/follow-ups.
- External network access requires explicit grants.

## Operator acceptance checklist

- Install completed from clean clone.
- Start/stop verified.
- Diagnostics run without developer help.
- Recovery procedure completed from a simulated interrupted run.
- Backup and restore drill completed from this document only.
- Stable update and rollback procedure understood and rehearsed.
- Cleanup rules understood.
