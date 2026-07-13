# Compatibility Manifest

E0-T02 defines the first compatibility manifest format for the MVP foundation.

The runtime source of truth is exported from `packages/contracts/src/compatibility.js`.

## Current supported baseline

| Area | MVP baseline |
|---|---|
| Operating system | Windows 11, release 22H2 or newer |
| Node.js | LTS, `>=22.0.0 <25.0.0` |
| Git | `>=2.40.0` |
| Active CLI agents | Claude Code CLI and Codex CLI only |
| Schema version | `1` |

Agent Zero and Hermes are explicitly unsupported as active adapters in the MVP.

## Stable unsupported-version behavior

`assertSupportedCompatibilityManifest()` throws `UnsupportedCompatibilityVersionError` with code `ERR_UNSUPPORTED_COMPATIBILITY_VERSION` when the manifest or schema version is unsupported.
