# E3-T02 Capability Manifest Registry

The adapter package now exposes a capability registry for the approved MVP adapters only.

## Approved adapters

The registry contains exactly:

- `claude-code`
- `codex`

`assertApprovedRegistry()` rejects missing approved adapters and rejects any extra adapter such as Agent Zero or Hermes.

## Entry fields

Each registry entry contains:

- adapter id and display name
- detected/versioned CLI identity
- executable name
- supported compatibility range
- capabilities
- constraints
- access requirements
- health status
- priority
- descriptor generated from the E3-T01 adapter contract
- availability and availability reason

## Compatibility behavior

`loadCapabilityRegistry()` evaluates detected CLI versions against the compatibility manifest:

- compatible versions become `available`
- incompatible versions become `unavailable`
- unavailable entries remain visible for diagnostics but are not returned by `listAvailableAdapters()`

## Boundary

This is still registry/contract logic only. Active Claude Code and Codex process execution is introduced in E3-T04 and E3-T05. Agent Zero/Hermes adapters remain explicitly out of scope.
