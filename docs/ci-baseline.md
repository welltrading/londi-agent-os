# CI and Baseline Checks

E0-T08 defines the first CI gate for the foundation slice.

Runtime source of truth:

- `package.json` scripts
- `.github/workflows/ci.yml`
- `scripts/check-source-hygiene.mjs`
- `scripts/check-windows-baseline.mjs`

## Gate

| Check | Command |
|---|---|
| Lint/source hygiene | `npm run lint` |
| Type/package graph | `npm run type-check` |
| Unit baseline | `npm run test:unit` |
| Integration baseline | `npm run test:integration` |
| Security baseline | `npm run security:scan` |
| Build | `npm run build` |
| Windows compatibility baseline | `npm run check:windows` |
| Full gate | `npm run ci` |

The GitHub Actions workflow runs the full gate on `windows-latest` with Node.js 22.
