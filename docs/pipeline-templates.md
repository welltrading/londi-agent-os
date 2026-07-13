# E4-T01 Pipeline Template Definitions

The MVP has exactly three fixed pipeline templates. There is no free editor mode.

## Templates

| Template | Steps | Handoff |
|---|---|---|
| `direct` | `execute` | none |
| `plan-build` | `plan` → `build` | plan handoff |
| `plan-build-review` | `plan` → `build` → `review` | plan and review handoffs |

## Policies

- `freeEditor` is always `false`.
- `allowSameAgentMultipleRoles` is always `true`.
- `direct` has `requiresHandoff: false` and no handoff steps.
- All templates include the `pipeline-approval` gate.

## Assignment

`createPipelineAssignment()` requires exactly the roles defined by the template. The same adapter/agent may be assigned to multiple roles.
