# E7-T07 Fault Injection Suite

The suite covers the mandatory recovery and failure scenarios:

- kill agent/service
- disconnect UI
- lock DB
- corrupt artifact
- network loss
- full disk
- expired approval
- Unknown external effect

Each scenario validates state, audit/checkpoint evidence, duplicate external-action prevention, and orphan-process expectations.
