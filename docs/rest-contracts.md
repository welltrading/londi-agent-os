# E6-T01 REST Contracts and Error Model

All REST contracts live under `/api/v1`, require Bearer authentication, and return `requestId` plus a resource version.

## Contract rules

- Write commands require `Idempotency-Key`.
- Concurrency-sensitive commands require `If-Match`.
- Paginated reads normalize cursor/limit metadata.
- Error payloads use stable codes and safe redacted messages.
- Response payloads are redacted before being returned.

## Stable error codes

`validation`, `unauthorized`, `forbidden`, `conflict`, `stale_revision`, `blocked_preflight`, `invalid_transition`, `not_found`, `rate_limited`, `internal`, and `idempotency_required`.

## Phase 2 live endpoints

The following endpoints are routed by the Local API service in the Phase 2 slice:

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/agents` | Optional `refresh=true`; returns status/usage agent cards. |
| GET | `/api/v1/skills` | Static Phase 2 Skill Registry. |
| GET | `/api/v1/projects` | Paginated ProjectWorkspace list. |
| PUT | `/api/v1/projects/{projectId}` | Requires `Idempotency-Key`; upserts project context. |
| GET | `/api/v1/obsidian/status` | Optional `refresh=true`; returns HostConnector vault availability. |
| POST | `/api/v1/runs/obsidian-summary` | Requires `Idempotency-Key`; writes a Run Summary through HostConnector. |
