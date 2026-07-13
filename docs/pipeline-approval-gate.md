# E4-T02 Pipeline Approval Gate

Gate A is the pipeline approval gate. It captures the fixed pipeline template and the execution configuration before any agent process is allowed to start.

## Payload sections

- template snapshot
- role assignments
- context summary
- preflight result
- permissions
- network policy
- secret aliases

Secret aliases are allowed. Secret values are rejected.

## Safety rules

- No agent process may be started before Gate A approval.
- Any configuration change changes the payload hash and invalidates the existing approval.
- Gate A uses the generic approval request/decision lifecycle from E1-T05.
