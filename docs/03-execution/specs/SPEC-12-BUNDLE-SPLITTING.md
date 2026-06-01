# SPEC-12 — Bundle Splitting & First-Paint Budget

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead |
| Closes | `CRITICAL-REVIEW-2026-04-27.md §B12` |
| Phases | 1A (bundle gate baseline), 1D (M12 alpha measurement), 3B (OBC removal unblocks web-ifc lazy), 3D (M36 GA gate) |
| Replaces / extends | `00_Contracts/18-BUNDLE-CHUNK-SPLITTING-CONTRACT.md` |

> First paint < 800 ms (small project) requires aggressive code splitting, lazy-loading of heavy chunks, and elimination of pre-paid weight that the user might never use. This spec defines the categories, the unblock path for `web-ifc` (Step 3 of Contract 18), the Cesium first-paint regression measurement, and the bundle-size CI gate.

---

## §1 Categories

| Category | When loaded | Examples | Budget |
|---|---|---|---|
| **Pre-load** | Always, in initial bundle | bootstrap, schemas, core stores, frame scheduler | ≤ 1.0 MiB gzip |
| **On-paint** | Right after first paint, before interaction | renderer, kernel core, wall + door + window committers | ≤ 0.5 MiB gzip |
| **On-demand** | When the user opens a feature | sheet editor, schedule subsystem, additional element types | per-chunk ≤ 200 KiB gzip |
| **Lazy** | Background, no UX block | drawing-engine PDF backend, DXF backend, additional view kinds | per-chunk ≤ 500 KiB gzip |
| **Never (in editor)** | Excluded from editor build | OBC, web-ifc, Cesium, server-side libs | excluded |

**Total initial gate (M36 GA):** Pre-load + On-paint ≤ 1.8 MiB gzip.

---

## §2 The web-ifc unblock (closes B12 gap "Step 3 blocked by OBC")

### §2.1 Why it's blocked
OBC's `@thatopen/components` package statically imports `web-ifc` (3.4 MiB). As long as OBC is in the editor bundle, web-ifc is in the initial bundle.

### §2.2 The unblock
- Phase 1C/2A renderer extraction removes most OBC use.
- Phase 3B (S55) removes OBC from the editor bundle entirely; OBC moves to `plugins/ifc-import/`.
- Once removed, web-ifc is dynamic-imported only when:
  - The user clicks "Import IFC".
  - The user opens a project that references `imports/source.ifc.zst`.
- Bundle config: `vite.config.ts` marks `@thatopen/components` and `web-ifc` as **external** in the editor build.

### §2.3 Deferred chunk size
`web-ifc.wasm` (3.4 MiB) + `web-ifc-glue.js` (250 KiB) chunked under `chunks/web-ifc.[hash].js` and `chunks/web-ifc.[hash].wasm`. Loaded once and cached.

---

## §3 Cesium first-paint regression (closes B12 gap "no first-paint measurement for Cesium")

### §3.1 Cesium scope
Cesium provides geographic basemaps for projects with site coordinates (SPEC-06 §6.1). It is heavy: ~5 MiB gzip + WebGL-2 worker.

### §3.2 Lazy by default
- Editor never preloads Cesium.
- Cesium loads only when:
  - The user opens a project with `site.geo` populated AND zooms out beyond the building bounding box.
  - The user explicitly enables "Geographic context" in the view toolbar.

### §3.3 First-paint measurement
- Bench `apps/bench/cesium-first-paint.ts`: load a small Cesium-enabled project, measure time from page open to first contentful paint.
- Target: < 800 ms (Cesium not yet loaded).
- Bench `apps/bench/cesium-on-zoom.ts`: simulate user zoom-out triggering Cesium load.
- Target: < 2.5 s for first basemap tile visible.

### §3.4 Cesium-not-needed projects
- Project without `site.geo`: Cesium chunk never requested. Verified by bundle analyzer running on the editor's runtime network log during smoke E2E.

---

## §4 Per-element-family lazy load

### §4.1 Pattern
- Each element family is its own plugin chunk.
- Wall + Floor + Door + Window are in the on-paint bundle (most projects use them).
- Roof, Stair, Railing, Ceiling, Furniture, Curtain Wall, Column, Beam are on-demand:
  - Loaded when first instance is encountered in event log replay.
  - Loaded when user clicks the family's tool palette button.

### §4.2 Pre-warming
- On project open, scan the manifest's element-type histogram.
- Issue `import()` for each present family in parallel before paint completes.
- p95 cost: < 200 ms.

---

## §5 Plugin lazy load

### §5.1 First-party plugins
- AI plugins (3 first-party) chunked separately; loaded on first invocation.
- Sheet Editor: chunked; loaded when user clicks "Sheets" tab.
- Schedules: chunked; loaded when user clicks "Schedules" tab.

### §5.2 Third-party plugins
- All third-party plugins are lazy.
- Manifest `extension_points` declares activation events; the plugin host listens and lazy-loads on demand.

---

## §6 Asset budget

| Asset kind | Budget | Notes |
|---|---|---|
| Initial JS (gzip) | 1.8 MiB | M36 GA gate |
| Initial CSS (gzip) | 100 KiB | Tailwind purge enforced |
| Initial fonts | 200 KiB | one font family pre-loaded; others on-demand |
| Initial images | 50 KiB | logo + critical icons only; rest lazy |
| Initial SVG sprite | 30 KiB | first-paint icons |
| Single on-demand chunk | 200 KiB | hard cap |
| Single lazy chunk | 500 KiB | soft cap; hard cap 1 MiB |

---

## §7 Bundle CI gate

### §7.1 Per-PR check
- Vite build → Rollup output sizes per chunk.
- Compare to baseline `bundle-baseline.json`.
- Fail if:
  - Initial gzip > 1.8 MiB (hard).
  - Any chunk > its category cap (hard).
  - Initial gzip grew > 50 KiB vs baseline without label `bundle-justify` and reviewer ack.

### §7.2 Nightly
- Full report: chunk-by-chunk graph; tree-map of largest deps.
- Trend dashboard.

### §7.3 Tooling
- `rollup-plugin-visualizer` for per-PR HTML report.
- `bundle-analyzer` for nightly trend.

---

## §8 First-paint instrumentation

### §8.1 Web Vitals
- LCP, FID, CLS, FCP, TTFB collected via `web-vitals` lib; sent to OTel as metrics.

### §8.2 PRYZM-specific
- `pryzm.editor.tt-first-element-rendered_ms`: time from boot to first BIM element on screen.
- `pryzm.editor.tt-first-interactive_ms`: time from boot to first user input handled.

### §8.3 Per-tier targets (M36 GA)
| Project size | TTFP | TTFI |
|---|---|---|
| Empty | < 400 ms | < 600 ms |
| Small (50 elements) | < 800 ms | < 1.5 s |
| Medium (500 elements) | < 1.5 s | < 3 s |
| Large (5,000 elements) | < 3 s | < 6 s |
| Torture (50,000 elements) | < 8 s | < 15 s |

---

## §9 Tier-streamed loading

### §9.1 LOD 0 first
- The bake worker writes LOD 0 chunks first (SPEC-02 §6.4).
- Loader requests LOD 0 in parallel for all elements visible in the initial camera frustum.
- LOD 1/2 stream in after first paint.

### §9.2 Frustum-based loading
- Outside the initial frustum, even LOD 0 is deferred.
- As the user pans/zooms, on-demand chunks are issued.

---

## §10 Phase rollout

| Sprint | Deliverable |
|---|---|
| S01 | Bundle CI gate baseline established (warning level). |
| S04 | Bundle gate flips to error. |
| S22 (M12 alpha) | Initial gzip ≤ 2.5 MiB; alpha-acceptable. |
| S29 (Phase 2B) | Plan-view chunk discipline established. |
| S37 (Phase 2C) | Sheet editor chunked; loaded on-demand. |
| S55 (Phase 3B) | OBC removed from editor; web-ifc lazy chunked. |
| S64 (Phase 3C) | Plugin lazy-load patterns finalised; marketplace plugins all lazy. |
| S72 (M36 GA) | Initial gzip ≤ 1.8 MiB; all SPEC-12 §8 targets met. |

---

## §11 Cross-references
- Conflict mapping: `CONFLICT-ANALYSIS.md §3.9` (OBC role).
- Persistence chunk model: SPEC-02 §6.4 (LOD-tiered bake).
- Plugin chunking: SPEC-09 §6.
- Phases: across the board; key milestone is S55 OBC removal.
- Differentiator: D9 (web-native first-paint) — `08-VISION §5`.
