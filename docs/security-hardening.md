# E8-T06 Security Hardening and Final Leakage Scan

Security Hardening collects the final blocking security evidence before release.

## Blocking gates

- Full threat suite passes with zero secret leakage.
- Dependency scan has no open Critical or High vulnerability.
- Local API binds only to `127.0.0.1`.
- Bearer token strength is at least 256 bits and sourced from Windows Credential Manager.
- CORS allows one exact local origin; wildcard origins fail.
- Final secret corpus scan has no findings in allowed source and document repositories.

## Evidence

The hardening report combines threat-suite results, dependency scan results, local bind/auth/CORS posture, and secret-corpus leakage findings into one pass/fail report.
