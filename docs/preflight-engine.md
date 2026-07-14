# E5-T08 Full Preflight Engine

The full preflight engine evaluates Git, adapters, runtimes, ACL, disk, Obsidian context, secret aliases, network grants, locks, maintenance windows, dependency policy and tool cache mode.

## Outcomes

- `Ready`: all checks pass.
- `Ready with Warnings`: only overrideable warnings exist.
- `Blocked`: at least one non-overrideable block exists.

Only warnings can be overridden. Blocked checks cannot be marked overrideable.

## Disk rule

Required free space is the larger of 5GB and twice the repository size.
