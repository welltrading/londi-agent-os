# E7-T01 Checkpoint Scheduling and Safe Shutdown

Checkpoint scheduling is required at the end of a work unit, before approval, before retry and before service shutdown.

## Baseline behavior

- Checkpoints are written as artifact records under the `checkpoints` category.
- Checkpoints are rejected if secret-like values are present.
- Safe shutdown writes a checkpoint first, then cancels tracked child attempts.
- A successful service shutdown moves active runs to `Recovery Required` using the existing state-machine guard.
- The default safe shutdown budget is 30 seconds.

No checkpoint stores raw secrets or uncontrolled process handles.
