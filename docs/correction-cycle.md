# E4-T05 Correction Cycle Engine

The correction cycle engine controls automatic Build -> Review loops after a blocking review.

## Rules

- Up to two automatic correction cycles are allowed.
- The cycle counter is stored in the correction cycle state.
- A second failed correction cycle moves the run to `Needs Attention`.
- A third correction attempt requires explicit exception approval.
- Critical sensitive review findings do not continue automatically; they route to approval.
