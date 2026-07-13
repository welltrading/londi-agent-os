# Windows Service Lifecycle

E0-T04 defines the Node.js service lifecycle skeleton for the Local API.

Runtime source of truth:

- `apps/local-api/src/service-lifecycle.js`
- `apps/local-api/src/index.js`

## Service contract

| Capability | E0-T04 behavior |
|---|---|
| Service name | `LondiAgentOSLocalApi` |
| Host | `127.0.0.1` |
| Health endpoint | `/system/health` |
| Startup type | `automatic` |
| Startup target | healthy API within 30 seconds |
| Shutdown | controlled `SIGINT`/`SIGTERM` graceful stop |

## Commands

| Command | Purpose |
|---|---|
| `node apps/local-api/src/index.js --service` | Start the local API service skeleton |
| `node apps/local-api/src/index.js --service-plan` | Print the Windows service install plan |
| `node apps/local-api/src/index.js --build-check` | Build-time import check |

The install plan is declarative at this stage; actual Windows service registration is deferred until packaging/installer work.
