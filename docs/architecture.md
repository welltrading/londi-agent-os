# Architecture Skeleton

E0-T01 establishes the package boundaries required by the execution spec:

| Boundary | Path | Responsibility |
|---|---|---|
| UI | `apps/ui` | Local user interface shell |
| Local API / Orchestrator service | `apps/local-api` | Local API entrypoint and service lifecycle shell |
| Shared contracts | `packages/contracts` | Shared data and API contracts |
| Orchestrator | `packages/orchestrator` | Run lifecycle and pipeline orchestration |
| Adapters boundary | `packages/adapters` | Package boundary only at this stage |
| Migrations | `packages/migrations` | SQLite migration ownership |
| Tests | `tests` | Foundation smoke tests |

No active adapter implementation exists in this task.
