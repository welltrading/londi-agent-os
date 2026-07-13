# Local API Authentication Baseline

E0-T05 defines the initial Local API security baseline.

Runtime source of truth:

- `apps/local-api/src/auth.js`
- `apps/local-api/src/service-lifecycle.js`

## Baseline

| Control | E0-T05 behavior |
|---|---|
| Bind address | `127.0.0.1` only |
| Auth | `Authorization: Bearer <token>` required |
| Token strength | 256-bit minimum, URL-safe form |
| Credential source | Windows Credential Manager provider boundary |
| CORS | Exact allowed origin only, no wildcard |
| Request limit | 1 MiB default content-length limit |
| Query token | `token=` and `access_token=` are rejected |

The token value is never returned in health output, install plans, docs, or tests. Only source and byte length metadata are exposed.
