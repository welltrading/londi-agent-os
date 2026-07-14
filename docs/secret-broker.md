# E5-T04 Secret Broker and Grants

The Secret Broker injects approved secret aliases into an agent process only through a scoped temporary grant.

## Rules

- Gate A may approve aliases only, never secret values.
- Secret values are read from a credential manager at injection time.
- Grant scope includes run, step, agent and alias.
- Grant TTL is capped at 30 minutes.
- Cleanup revokes the grant at step finish.
- Audit/API/DB/artifacts use alias metadata and redacted placeholders only.

## Non-persistence

The `secret_grants` table stores alias, scope, status and expiry only. It has no value/token/password columns.
