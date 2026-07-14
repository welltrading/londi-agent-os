# Decisions Log

Append-only log of significant project decisions.

## 2026-07-14 — MVP skeleton complete / ready for next phase

- **Decision:** Londi Agent OS MVP skeleton is considered complete through E8-T09 and ready for the next phase.
- **Evidence:** full `npm run ci` passed before the completion-summary commit.
- **Completion summary:** `docs/mvp-skeleton-completion-summary.md`.
- **Release decision:** `docs/release-decision.md` / `packages/orchestrator/src/release-decision.js` models `Go` when all gates pass.
- **Latest completion commit:** `e9a56f8 docs: add MVP skeleton completion summary`.
- **Scope constraints preserved:** Git-only projects; Claude Code and Codex only; no Agent Zero/Hermes adapter/mock/placeholder; no automatic merge; `Completed` only after successful manual merge verification.
- **Next phase:** decide whether to move from skeleton/domain contracts into concrete runtime implementation, UI/API hardening, or product packaging.

