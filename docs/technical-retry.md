# E7-T03 Technical Retry and Agent Replacement

Technical retry is limited to one automatic retry after recovery guards pass.

## Baseline behavior

- Previous attempt metadata is retained for audit.
- Raw conversation, chat logs, transcripts and full logs are never transferred to a replacement agent.
- `External Effect Unknown` blocks retry/replay.
- Reconnect can be attempted for heartbeat-due, unresponsive or timeout-decision states.
- Agent replacement requires a qualified different adapter and a safe handoff summary.

This slice preserves auditability without copying private conversation context between agents.
