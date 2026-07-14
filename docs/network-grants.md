# E5-T06 Network Grants and Allowlist

Network access is denied by default and must be represented as a scoped grant.

## Grant scope

Each grant records:

- hostname
- purpose
- run
- step
- agent
- duration and expiry

Hostnames are normalized and must not include protocol, credentials, port or path.

## External effects

External effect states are `None`, `Known` and `Unknown`.

- Unattempted calls are `None`.
- Approved, completed and verified calls are `Known`.
- Blocked, unapproved or unverified calls are `Unknown`.

Replay is blocked whenever External Effect is `Unknown`.
