# E5-T09 Security Acceptance Suite

The security acceptance suite covers the MVP threat cases:

- path/junction escape
- command/log injection
- approval replay
- stale token
- vault prompt injection
- secret-in-diff
- network exfiltration

Each case must be either `Blocked`, `Needs Attention`, or `Passed`, and the final report enforces zero secret leakage.

`Needs Attention` is allowed for cases that require human review, such as suspicious vault prompt injection.
