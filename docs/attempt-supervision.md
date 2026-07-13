# E3-T06 Attempt Supervision

Attempt supervision tracks agent attempts independently from adapter-specific code.

## Timing policy

| Threshold | Value | Result |
|---|---:|---|
| Heartbeat interval | 30 seconds | `Heartbeat Due` / request heartbeat |
| Unresponsive | 120 seconds without heartbeat | `Unresponsive` |
| Failure | 300 seconds without heartbeat | `Failed` |
| Timeout | 30 minutes total runtime | `Timeout Decision Required` when heartbeat is still recent |

## Timeout precedence

A 30-minute timeout with a fresh heartbeat asks for a user/system decision and is **not** classified as `Unresponsive`. If heartbeats stop after timeout, normal 120-second and 300-second silence rules still apply.

## API

`createAttemptSupervisor()` exposes:

- `registerAttempt`
- `recordHeartbeat`
- `evaluateAttempt`
- `listAttempts`
- `getEvents`

All timer behavior can be driven by a fake `nowMs()` clock for deterministic tests.
