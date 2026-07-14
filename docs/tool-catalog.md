# E5-T07 Tool Catalog and Dependency Policy

The tool catalog records approved local tools with:

- version
- source
- checksum
- signature/integrity
- compatibility metadata

## Policy

- Existing unchanged lockfile dependencies are allowed.
- New packages or changed lockfile entries require approval.
- Untrusted sources are blocked.
- Shared tool cache is read-only; installs happen only in the local workspace.
