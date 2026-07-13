# Approval Domain

E1-T05 defines approval requests and decisions for pipeline, handoff, dependency and sensitive-action gates.

Runtime source of truth:

- `packages/orchestrator/src/approvals.js`
- `tests/smoke.test.mjs`

## Approval request

An approval request contains:

- `kind` — approval category.
- `scope` — run, step, action or resource scope.
- `payloadHash` — stable hash of the payload shown to the user.
- `revisionHash` — resource revision shown to the user.
- `expiresAt` — default sensitive-action expiry is 60 minutes.
- `state` — `Pending`, `Approved`, `Rejected`, `Expired` or `Invalidated`.

## Approval decision

A decision contains the request id, actor, approve/reject decision, reason, timestamp, payload hash and revision hash.

## Safety rules

- A decision is accepted only for the same payload hash and revision hash shown to the user.
- Payload or revision changes make the request stale and require re-approval.
- A sensitive approval expires after 60 minutes by default.
- Expired, invalidated or already-decided requests cannot be used as active grants.
- Decisions are designed to be written through the command pipeline so Audit/event records remain atomic.
