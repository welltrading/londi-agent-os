# E3-T01 Adapter Contract

The adapter package now defines the normalized contract that all approved local CLI adapters must implement.

## Contract version

- `ADAPTER_CONTRACT_VERSION`: `0.1.0`

## Required operations

Every adapter must expose these operations:

- `health`
- `capabilities`
- `start`
- `deliverTask`
- `heartbeat`
- `checkpoint`
- `cancel`
- `resume`
- `collectArtifacts`

`assertAdapterContractImplementation()` rejects any implementation that does not expose every required operation as a function.

## Normalized outcomes

All operation results are normalized to exactly one of:

- `success`
- `recoverable_failure`
- `terminal_failure`
- `cancelled`
- `unknown`

`normalizeAdapterResult()` also derives stable booleans:

- `ok`
- `recoverable`
- `terminal`

This keeps Claude Code and Codex implementations comparable even when their raw CLI exit codes or messages differ.

## Descriptor

`createAdapterDescriptor()` records adapter identity, display name, version, executable and supported operations. Missing identity or missing contract operations throws `AdapterContractError`.

## Harness

`createNullAdapterContractHarness()` is a non-active contract harness used only for contract tests. It is not an Agent Zero/Hermes adapter and does not execute external agent processes.

## Boundary

E3-T01 defines the contract only. Active Claude Code and Codex implementations are introduced in later E3 tasks. Agent Zero/Hermes adapters remain out of scope.
