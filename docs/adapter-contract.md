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

## Target-spec operation mapping

The product brainstorm names the external target contract as:

- `startRun`
- `sendTask`
- `heartbeat`
- `checkpoint`
- `cancel`
- `resume`
- `getArtifacts`

The current implementation keeps two extra preflight/discovery operations and uses shorter internal names for three execution operations:

| Target spec name | Current implementation | Status | Notes |
|---|---|---|---|
| `startRun` | `start` | accepted mapping | Starts an adapter attempt/process and returns attempt metadata. |
| `sendTask` | `deliverTask` | accepted mapping | Delivers the prompt/task to the adapter process. |
| `heartbeat` | `heartbeat` | exact | Liveness check for attempt supervision. |
| `checkpoint` | `checkpoint` | exact | Records checkpoint metadata/artifacts. |
| `cancel` | `cancel` | exact | Cancels the attempt/process tree through the process manager. |
| `resume` | `resume` | exact | Resumes from attempt/checkpoint metadata when supported. |
| `getArtifacts` | `collectArtifacts` | accepted mapping | Returns normalized artifact descriptors. |
| — | `health` | implementation extension | Required for preflight/auth/version checks. |
| — | `capabilities` | implementation extension | Required for recommendation and compatibility checks. |

Guardrail: Orchestrator and UI flows may use user-facing target language, but adapter implementation/parity tests must continue to verify the canonical `ADAPTER_OPERATIONS` list. If public API names are later exposed directly as adapter operations, update this mapping, adapter parity tests, and docs in the same slice.

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
