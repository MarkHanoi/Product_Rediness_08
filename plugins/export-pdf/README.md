# @pryzm/plugin-export-pdf

PRYZM 2 — empty PDF export plugin shell (F-prereq.0). PDF export pipelines (sheets → PDF, BCF → PDF) land in F.x; this scaffold reserves the workspace package.

## Status

**F-prereq.0 scaffold.** This package exposes only `PLUGIN_ID` + `PLUGIN_NAME`
constants today. Real handlers, stores, and L7 plugin descriptors land in the
`F.x` sub-phases of `docs/03_PRYZM3/03_PRYZM3/reference/phases/audits/PRYZM2-WIREUP-PLAN-S72/`.

Do not import any non-existent symbol from this package — typecheck will fail
loudly. The scaffold exists so dependent F.x work can land package-wise without
race conditions on workspace publication.
