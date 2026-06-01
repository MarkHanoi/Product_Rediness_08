# ADR-039 — Export Worker Architecture (Sheets + Schedules)

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-28 (retroactive for S40 + S42) |
| Closes | `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §3.1 row "ADR-026 Export worker architecture" (the spec referenced an as-yet-unallocated number — ADR-026 was meanwhile spent on `ui-binding-vanilla-ts`; this ADR carries the export-worker decision under the next free number) |
| Required by | Sprint S40 (sheet-book PDF export) and S42 (schedule CSV / XLSX / PDF export) |
| Owner | Architecture lead |
| Implementation | `plugins/sheets/src/book/`; `plugins/schedules/src/export/`; `apps/bake-worker/` (shared queue infrastructure) |
| Spec dependency | `08-VISION.md` (offline-first); `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §0 + §S40 + §S42 |

---

## Context

PRYZM 2 must produce three classes of document deliverable from the editor:

1. **Sheet-book PDF** — N sheets, each composed of viewports (3D / plan / section), title block, and widgets, rasterised to a single PDF. Spec budget: 5 sheets in < 30 s (S40); 100-page A1 set in < 8 s on the bake-worker (Gap-Closure §S42 line 1107).
2. **Schedule CSV** — RFC-4180 round-trip safe. Budget: < 100 ms per 500-row schedule (S42 line 1026).
3. **Schedule XLSX + PDF** — formatted Excel workbook + tabular PDF. Budgets: XLSX < 500 ms, PDF < 10 s per schedule (S42 line 1026).

The phase-2C spec (§0, §S40 D1, line 39, §5 line 1082) calls for an `apps/export-worker/` BullMQ worker following the same pattern as the bake worker (ADR-005). At commit time of this ADR, the implementation has converged on a slightly different layout — see *Decision* below — but the spirit (server-side capable, headless, dependency-isolated to a few well-bounded packages) is preserved.

---

## Decision

We adopt a **three-layer export pipeline** with the following separation of concerns:

### Layer 1 — Pure render functions (in plugin packages)

| Function | Module | Sync / Async | Output |
|---|---|---|---|
| `scheduleToCSV` | `plugins/schedules/src/export/csv.ts` | sync | `string` |
| `csvToScheduleRows` | `plugins/schedules/src/import/csv.ts` | sync | `CsvImportResult` |
| `scheduleToXLSX` | `plugins/schedules/src/export/xlsx.ts` | async | `Uint8Array` |
| `scheduleToPDF` | `plugins/schedules/src/export/pdf.ts` | async | `Uint8Array` |
| `BookExporter.export` | `plugins/sheets/src/book/book-exporter.ts` | async | `Uint8Array` |

These are **pure** with respect to time and side effects (modulo their library calls). They run identically:
- in the **browser** (Vite-bundled) — used by the editor's "Export" toolbar action;
- in **Node** — used by automated test, CI bench (`apps/bench/src/benches/export-schedule.bench.ts`), and any future server-side worker.

**No DOM access**, **no `node-canvas`**, **no `worker_threads`** in this layer. The schedule PDF exporter uses `pdf-lib`'s vector primitives (Helvetica standard font, vector strokes, text drawing) and emits well under 50 KB even for 500-row schedules — a deliberate choice over the `node-canvas` raster-at-300-DPI path used in S40 for sheets, because schedules are pure-text tables and rasterising would waste an order of magnitude of bytes and CPU.

### Layer 2 — Orchestration (in plugin packages)

`plugins/sheets/src/book/book-exporter.ts` is a library-agnostic orchestrator that takes a renderer callback (`renderSheet(ctx, sheet) → void`) and an assembler callback (`assemblePdf(pages) → bytes`). The browser passes the same `CanvasHost.render` it uses for the live preview; the (future) server worker will pass a `node-canvas`-bound version. Both call paths share the same iteration over the sheet list, per-page progress callback, and bookmark generation.

### Layer 3 — Optional server worker (deferred)

A standalone `apps/export-worker/` package was scoped in the original phase plan as a BullMQ worker mirroring `apps/bake-worker/`. It has **NOT** been spun up as a separate app, because:

1. The two real exit gates (5-sheet PDF in < 30 s; 500-row schedule in < 10 s) are met **in-browser** and **in CI Node** by the Layer-1 functions alone.
2. Adding a queue + Redis + worker process at this milestone would be premature: it doubles the operational surface for a feature whose first ten beta customers will export from the editor on their workstations.
3. When the server worker becomes necessary (estimated post-M24 BETA, when the first multi-tenant cloud project asks for "export everything overnight"), the same Layer-1 functions can be hosted inside a thin BullMQ wrapper next to `apps/bake-worker/` — the existing `apps/bake-worker/src/queue/` and `apps/bake-worker/src/jobs/` patterns transfer 1:1.

This deferred-but-shaped path is recorded as a **non-blocker** for Phase 2C exit and explicitly tracked as a Phase 2D / Phase 3 work-item in the audit (`PHASE-2C-AUDIT-2026-04-28.md` §"Deferred").

---

## Library Choice (depends on use case)

| Need | Library | Why |
|---|---|---|
| Sheet-book PDF (raster) | `pdf-lib` + `node-canvas` (server) / `OffscreenCanvas` (browser) | Sheets contain rasterised viewports → PDF is image-page assembly, not vector reconstruction |
| Schedule PDF (vector) | `pdf-lib` standalone | Schedules are tabular text → vector primitives are 10-100× smaller and 10× faster than rasterising |
| Schedule XLSX | `exceljs` | Pure-JS, no native bindings, works in Node + browser (Vite-bundled). Tested against Excel 2016 compat (R2C-04) |
| Schedule CSV | none (pure TS, RFC-4180 hand-roll) | Avoids 50 KB dep for a 60-line tokenizer + serialiser; also avoids supply-chain risk on a security-sensitive surface (formula injection) |

`pdf-lib@^1.17.1` and `exceljs@^4.4.0` are both pure-JS, MIT-licensed, and have no native compilation. Bundle-size impact (Vite production):
- `pdf-lib`: ~210 KB gzipped (loaded only when user clicks Export-PDF)
- `exceljs`: ~520 KB gzipped (loaded only when user clicks Export-XLSX)

Both are dynamic-import-loaded in the editor build — see `apps/editor/src/exports/lazy-load.ts` (S43 follow-up).

---

## Consequences

**Positive**:
- Same code path browser + CI Node, eliminating "export looks different on the server" class of bugs by construction.
- No queue / worker operational burden until product demand justifies it.
- Zero native bindings — editor and CI both run on stock Node 20+ with no extra system packages.
- Schedule PDFs are a fraction of the size of rasterised equivalents (50 KB vs ~3 MB for a 500-row schedule), trivially storable in CDE.

**Negative**:
- The phase-2C spec called for `apps/export-worker/` and we've deviated. We document this divergence as an **accepted, time-boxed deferment** in the 2C audit (`PHASE-2C-AUDIT-2026-04-28.md`).
- For sheet-book PDFs > ~20 sheets, the in-browser pipeline blocks the main thread visibly. Mitigation: chunk by `requestIdleCallback` (already implemented in `book-exporter.ts`); long-term solve is the deferred export-worker.

---

## Rollout

| When | Action |
|---|---|
| S42 (now) | Layer 1 + Layer 2 in plugin packages; bench gate green; no server worker |
| Post-BETA (S48+) | Re-evaluate: do beta cohort exports stress the in-browser pipeline? |
| Phase 3 if-needed | Spin up `apps/export-worker/` as a BullMQ worker reusing Layer 1 functions verbatim; promote to a 2D/3A scope ADR amendment |

---

*Last updated: 2026-04-28. Owner: Architecture lead.*
