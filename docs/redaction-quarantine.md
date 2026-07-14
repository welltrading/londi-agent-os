# E5-T05 End-to-end Redaction and Quarantine

Redaction covers all MVP leakage surfaces:

- stdout
- stderr
- SSE
- Audit
- artifacts
- diff

## Quarantine rule

If a secret leak is detected after an artifact was written, the step is stopped, the original artifact is moved to quarantine, a redacted sidecar is written, and a security event is created.

## Corpus

The leakage corpus covers provider keys, bearer tokens, token/password assignments, GitHub tokens and known in-memory secret values.
