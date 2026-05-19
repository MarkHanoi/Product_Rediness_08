# @pryzm/plugin-visibility-intent

**F-prereq.0 scaffold.**  Owns the Visual-rail contributions
(Visibility-Graphics, edge style, transparency, isolate, hide, reveal)
and the per-element OverridePanel + Intent flows.

The plan deliberately uses two different names for these surfaces:
* The rail (the UI shell) is named **Visual**.
* The plugin (the engine-side contribution host) is named
  **visibility-intent** so a third-party Visual-rail contribution can
  later coexist with the canonical visibility plugin without a rename.

## Specification anchors

* `PRYZM2-WIREUP-PLAN-S72/16-subphases-F1-toolbars.md` §16.6.1 F.1.59 – F.1.65
* `PRYZM2-WIREUP-PLAN-S72/18-subphases-F6-F12.md` §F.8.01 – F.8.13
* `PHASES-A-F-RECONCILIATION-2026-04-29/PHASES-A-F-MISSING-ITEMS-2026-04-29.md`
  §II.B.33 (cast-annotation destinations)

## Status

This package exposes only `PLUGIN_ID` + `PLUGIN_NAME` constants today.
Real handlers, stores, and L7 plugin descriptors land in the F.x
sub-phases.  Do not import any non-existent symbol from this package —
typecheck will fail loudly.  The scaffold exists so dependent F.x work
can land package-wise without race conditions on workspace publication.

## Cross-reference (other F-prereq.0 scaffolds)

`floor`, `export-pdf`, `dxf`, `render`, `geospatial`, `levels`,
`navigate`, **`visibility-intent`** — eight packages total, scaffolded
in the same PR.
