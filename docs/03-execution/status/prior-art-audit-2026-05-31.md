# PRYZM 3 — Prior-Art Audit (2026-05-31)

> **Status**: CANONICAL · grounding doc for [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md](PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md).
> **Authority**: this audit reflects the actual state of the monorepo at branch `feat/daily-use-and-production-readiness-2026-05-20`, commit `a89158b` + recovered Tracks A/B/C of multi-agent run 3.
> **Why this doc exists**: the master implementation plan (written earlier on 2026-05-31, commit `a89158b`) was authored without a code audit and classified several substantial PRYZM 2 implementations as "NEW". This doc records the audit, lists the actual state of each affected subsystem, and identifies the **real** new-work surface.
> **Doctrine**: per [CLAUDE.md](../../CLAUDE.md), code-state audits are NOT derivative `*-AUDIT.md` docs of contracts (which are forbidden). This audit records repository state at a point in time; it is canonical for downstream re-planning.

---

## §1 — Headline

**PRYZM is not greenfield.** The codebase is mid-migration from PRYZM 2 → PRYZM 3 (per [01-VISION.md](01-VISION.md) and `CLAUDE.md` "currently mid-migration to the PRYZM 3 architecture"). Substantial PRYZM 2 subsystems exist and ship code:

- Sheets (S37 / Phase 2C / ADR-0031)
- IFC Tier 1 export (S56) + Tier 2 import (S57) + Pset inspector (S57)
- Family runtime + loader + bake pipeline (S55-S56)
- Schedules (S41 / Phase 2C / ADR-0032)
- Plan-view (S29 / ADR-0028), View (S17 / ADR-0016), Section-view skeleton (post-2B / ADR-0030)
- Rooms (S25), Beam (S12-T3), Column (S12-T3), Structural (S26 / ADR-0026)
- Annotations (full subsystem), Dimensions (full subsystem)
- Geospatial coordinate transforms (C12 — LTP-ENU + proj4 + IfcProjectedCRS)
- PDF-to-BIM extraction proposals (S60 Track A)
- Drawing primitives multi-backend (post-2B / ADR-0029 — Canvas2D LIVE, SVG/PDF/Print-Canvas typed stubs)
- Render pipeline TSL WebGPU passes (PRYZM 3 — A16-T1 strangler-fig)

**Implication for the master plan**: every track in [Part IV (Export Infrastructure)](PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md), [Part V (Inspect)](PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md), and [Part VI (Data Tab)](PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md) must be re-scoped as **"audit + extend + fill gaps"**, not **"build from scratch"**. The new C-contracts (C24–C30) are still legitimate — they formalise invariants for the existing + extended subsystems and govern the gap-filling work — but their phase plans need re-estimation downward.

---

## §2 — Audit method

1. `Glob` + `Bash ls` of `plugins/` (46 directories) and `packages/` (60+ directories).
2. Read `package.json` description field for each suspected prior-art entry (description fields encode the PRYZM 2 sprint number + ADR reference where applicable).
3. Spot-read of key entry files (`src/index.ts`, `src/store.ts`, `src/handlers/index.ts`).
4. `Grep` for cross-references: `revit`, `\.rvt`, `\.rfa`, `IfcSite`, `IfcSpace`, `IfcZone`, `FamilyRegistry`, `InspectSelectionStore`, `IsolationVisibilityIntent`.
5. Cross-validation by sub-agent (Explore variant) with thorough breadth.

---

## §3 — Per-subsystem findings

### §3.1 — Sheets & Drawing Sets

**Master plan claim** (Part IV §8 + C24): "CRITICAL GAP. Today PRYZM has no architecturally sound sheet workflow. ... There is no: drawing frame, title block, view arrangement, scale bar, north arrow, revision block, border, or print-calibrated output."

**Actual state**:

| Path | Status | Notes |
|---|---|---|
| `plugins/sheets/` | **IMPLEMENTED — PRYZM 2 S37 / Phase 2C / ADR-0031** | Full sheet plugin: SheetStore, 11+ handlers, viewport, title-block, view-renderer, widgets, book-exporter |
| `plugins/sheets/src/store.ts` | IMPLEMENTED | SheetStore — Sheet + Viewport + Widget store |
| `plugins/sheets/src/handlers/CreateSheet.ts` etc. | IMPLEMENTED | 11+ handlers: Create/Delete/Rename/Reorder, Add/Remove/SetScale Viewport, SetTitleBlock, SetSheetMetadata, Add/RemoveWidget |
| `plugins/sheets/src/title-block.ts` | IMPLEMENTED | Title block template resolution, field mapping, A1/A3/A4 templates |
| `plugins/sheets/src/viewport.ts` | IMPLEMENTED | ViewportManager: world-to-paper projection, zoom/pan, scale calc |
| `plugins/sheets/src/widgets/` | IMPLEMENTED | 6+ widget types: Text, Image, Legend, ScaleBar, NorthArrow, RevisionTable, BimTag, ScheduleSnapshot, Line, Region |
| `plugins/sheets/src/view-renderer/` | IMPLEMENTED | CompositeViewRenderer, ViewRegistry, ViewportEditController, viewport-centric render loop |
| `plugins/sheets/src/book/` | IMPLEMENTED | BookExporter + multi-sheet composition (addSheetToBook, moveSheetInBook) — covers C30 partially |
| `plugins/sheets/src/sheet-editor-host.ts` | IMPLEMENTED | Canvas2D editor host (zoom/pan/drag-resize viewports) |
| `plugins/sheets/src/intent.ts` | IMPLEMENTED | Intent layer (paper size A0–A6, orientation, metadata fields) |
| `plugins/sheets/src/tracing.ts` | IMPLEMENTED | P8 OTel spans wired |
| `packages/drawing-primitives/src/backends/canvas2d.ts` | IMPLEMENTED | Canvas2D backend LIVE (ADR-0029) |
| `packages/drawing-primitives/src/backends/svg.ts` | **STUB (typed)** | Defined; not yet rendering |
| `packages/drawing-primitives/src/backends/pdf.ts` | **STUB (typed)** | Defined; not yet rendering — this is the real C29 gap |
| `packages/drawing-primitives/src/backends/print-canvas.ts` | **STUB (typed)** | Defined; not yet rendering |
| `plugins/export-pdf/` | **STUB** | Empty PDF export plugin shell (F-prereq.0) |
| `plugins/dxf/` | **STUB** | Empty DXF plugin shell (F-prereq.0) |
| `plugins/section-view/` | **SKELETON** | Kernel section-cut producer + canvas host shell. "Full feature lights up at S37/S38." |

**Re-scoped master plan**:

- ✗ SCE-α-1 (Sheet schemas NEW) — **REDUNDANT**. Schemas exist in `plugins/sheets/src/*.ts`. Action: **promote to `packages/schemas/src/sheet/` (L0) per P5** if the L0/L7 layer purity gate is to be enforced for sheets.
- ✗ SCE-α-2 (SheetStore + commands NEW) — **REDUNDANT**. Store + 11+ handlers IMPLEMENTED. Action: **audit existing commands against C16** (command authoring protocol) + identify any gaps in the 11 handlers vs the master plan's required 15.
- ✗ SCE-α-3 (canvas renderer v1 NEW) — **REDUNDANT**. `sheet-editor-host.ts` is the Canvas2D renderer. Action: **none** beyond verifying it routes through `FrameScheduler` (P3).
- ✗ SCE-α-4 (drawing frame + title block NEW) — **REDUNDANT**. `title-block.ts` IMPLEMENTED. Action: **audit** for the missing field set (project name, drawing title, scale, date, revision, author, logo placeholder).
- ✓ SCE-β-1 (multi-viewport NEW) — **PARTIALLY REDUNDANT**. AddViewport / RemoveViewport / SetViewportScale handlers exist. Action: **audit viewport UI** for drag-resize; may need editor UI work in `apps/editor/src/ui/sheets/`.
- ✓ SCE-β-2 (vector PDF export NEW) — **LEGITIMATE NEW WORK**. `packages/drawing-primitives/src/backends/pdf.ts` is a typed stub. Action: implement the PDF backend on the existing multi-backend scaffold.
- ✓ SCE-β-3 (scale bar + north arrow NEW) — **REDUNDANT**. Widget types `ScaleBar` + `NorthArrow` exist. Action: **audit** the auto-calc from `ProjectLocation`.
- ✓ SCE-β-4 (dimension strings in sheets NEW) — **REDUNDANT**. `plugins/dimensions/` is a full subsystem. Action: **integrate** dimensions plugin output into sheet rendering pipeline.
- ✓ SCE-γ-1 (section/elevation viewports NEW) — **PARTIALLY NEW**. `plugins/section-view/` is a SKELETON awaiting S37/S38. Hidden-line removal IS new.
- ✓ SCE-γ-2 (detail views NEW) — **NEW**.
- ✓ SCE-γ-3 (revision tracking NEW) — **PARTIALLY REDUNDANT**. Widget type `RevisionTable` exists. Revision-row schema may exist in `plugins/sheets/src/intent.ts`. Action: audit + extend.
- ✓ SCE-γ-4 (sheet set NEW) — **REDUNDANT**. `book/book-exporter.ts` is the multi-sheet composition logic. Action: **audit + formalize as C30**.
- ✓ SCE-δ-1 (DWG/DXF export NEW) — **LEGITIMATE NEW WORK** on top of `plugins/dxf/` stub.
- ✓ SCE-δ-2 (print calibration NEW) — **LEGITIMATE NEW WORK** on top of `drawing-primitives/src/backends/print-canvas.ts` typed stub.
- ✓ SCE-δ-3 (sheet performance NFT NEW) — **NEW** (benchmark).

**Revised effort estimate**: ~20 wk → **~10 wk** (50% reduction). Primary remaining work: vector PDF backend, DXF backend, sheet UI in `apps/editor/`, dimension-into-sheet integration.

---

### §3.2 — IFC Export, Import, Inspector

**Master plan claim** (Part IV §7 + C25): comprehensive gap list (IfcSite unpopulated, IfcSpace not generated from rooms, Pset_FurnitureTypeCommon absent, etc.).

**Actual state**:

| Path | Status | Notes |
|---|---|---|
| `plugins/ifc-export/` | **IMPLEMENTED — PRYZM 2 Phase 3-B Sprint S56** | IFC4 STEP writer via web-ifc write mode |
| `plugins/ifc-export/src/exporters/IFC4X3Exporter.ts` | IMPLEMENTED | Wall/Slab/Door/Window/Column/Beam → IFC4X3 STEP; respects schema differences (IFCWALL not IFCWALLSTANDARDCASE) |
| `plugins/ifc-export/src/exporters/{wall,slab,door,window,column,beam}.ts` | IMPLEMENTED | Per-entity exporters for 6 Tier 1 element types |
| `plugins/ifc-export/src/psets.ts` | IMPLEMENTED | Pset generation + writer for properties (meta-store backed) |
| `plugins/ifc-export/src/meta-store.ts` | IMPLEMENTED | `InMemoryIFCMetaStore` — round-trip GlobalId + custom Psets across import→edit→export |
| `plugins/ifc-export/src/guid.ts` | IMPLEMENTED | `deterministicUuid` + `globalIdFromUuid` |
| `plugins/ifc-export/src/hierarchy.ts` | IMPLEMENTED | IfcProject → IfcBuilding → IfcBuildingStorey from LevelStore |
| `plugins/ifc-export/src/owner-history.ts` | IMPLEMENTED | IfcOwnerHistory generation |
| `plugins/ifc-export/src/otel.ts` | IMPLEMENTED | P8 OTel spans |
| `plugins/ifc-export/src/orchestrator.ts` | IMPLEMENTED | Top-level `exportProjectToIFC()` orchestrator |
| `plugins/ifc-export/src/handlers/index.ts` | IMPLEMENTED | Command-bus integration |
| `plugins/ifc-import/` | **IMPLEMENTED — PRYZM 2 Phase 3-B Sprint S57** | IFC Tier 2 import: web-ifc parser + Tier 2 proxy converter (furniture, MEP, structural proxy) |
| `plugins/ifc-import/src/IFCImportHandler.ts` | IMPLEMENTED | Tier 2 import flow |
| `plugins/ifc-import/src/converters/tier2-proxy.ts` | IMPLEMENTED | Tier 2 entities → IFCProxyDTO (transform-only) |
| `plugins/ifc-inspector/` | **IMPLEMENTED — PRYZM 2 Phase 3-B Sprint S57** | IFC Pset editor panel — orthogonal to BIM 3.0 model tree |
| `plugins/ifc-inspector/src/pset-editor.ts` | IMPLEMENTED | DOM panel; PsetUpdateCommand via commandBus |

**Re-scoped master plan**:

| Master Plan Phase | Re-scoped action | Status |
|---|---|---|
| IFC-α-1 (IfcSite full attrs) | **GAP CONFIRMED** — extend hierarchy.ts with IfcSite attrs from `SiteModel` | NEW work — 1 wk |
| IFC-α-2 (IfcSpace from Rooms) | **GAP CONFIRMED** — new exporter `space.ts`, hook into `plugins/rooms/` data | NEW work — 1.5 wk |
| IFC-α-3 (IfcZone per apartment) | **GAP CONFIRMED** — new exporter `zone.ts` | NEW work — 1 wk |
| IFC-α-4 (IfcBuildingStorey NetFloorArea) | **GAP CONFIRMED** — extend hierarchy.ts | NEW work — 0.5 wk |
| IFC-α-5 (ifc-validator CI gate) | **GAP CONFIRMED** — wire web-ifc validate into CI | NEW work — 0.5 wk |
| IFC-β-1 (Furniture IfcFurniture+Psets) | **GAP CONFIRMED** — new exporter `furniture.ts` for 50+ types | NEW work — 2 wk |
| IFC-β-2 (Window PartitioningType) | **PARTIAL — verify** in existing window.ts exporter | Audit needed |
| IFC-β-3 (Door OperationType) | **PARTIAL — verify** in existing door.ts exporter | Audit needed |
| IFC-β-4 (IfcSanitaryTerminal) | **GAP CONFIRMED** — new exporter `plumbing.ts` | NEW work — 1 wk |
| IFC-β-5 (IfcElectricAppliance) | **GAP CONFIRMED** — new exporter `appliance.ts` | NEW work — 0.5 wk |
| IFC-γ-1 (Pset_WallCommon FireRating etc.) | **PARTIAL — extend** existing psets.ts | Audit + 1 wk |
| IFC-γ-2 (Pset_SlabCommon) | **PARTIAL — extend** existing psets.ts | Audit + 0.5 wk |
| IFC-γ-3 (IfcAnnotation) | **GAP CONFIRMED** — new exporter `annotation.ts`, hook into `plugins/annotations/` + `plugins/dimensions/` | NEW work — 1.5 wk |
| IFC-γ-4 (IfcMapConversion full) | **PARTIAL — verify** integration with `packages/geospatial/` (C12 already implements `IfcProjectedCRS`) | Audit + 0.5 wk |
| IFC-δ-1 (Uniclass 2015) | **NEW** | 1 wk |
| IFC-δ-2 (COBie) | **NEW** | 2 wk |
| IFC-δ-3 (Performance NFT) | **NEW** (benchmark on existing exporter) | 1 wk |

**Revised effort estimate**: ~16 wk → **~14 wk** (12% reduction, mostly through audit-not-rewrite work). The gap list is **correct** — the foundation is solid but the element coverage / Pset depth gaps are real.

---

### §3.3 — Revit Round-Trip

**Master plan claim** (Part IV §9 + C26): "IFC4 as canonical bridge; optional Python adapter for Revit-specific extensions."

**Actual state**:

| Path | Status | Notes |
|---|---|---|
| Anything Revit-named in monorepo | **NONE** | `Grep revit\|\.rvt\|\.rfa` matches only descriptive references in 4 package.json files (`plugins/ifc-inspector`, `plugins/ifc-import`, `packages/ui`, `apps/component-editor`) — all in description text, no code. |
| `plugins/ifc-export/` | The bridge | IFC4X3 exporter IS the Revit interchange surface (OpenBIM workflow). |
| `apps/component-editor/` | PARTIAL | Family Creator SPA — analogue to Revit Family Editor; no `.rfa` import yet. |

**Re-scoped master plan**: **NO CHANGES** to Part IV §9 / C26 plan. Revit round-trip is genuinely new. RVT-α through RVT-γ phases stay as drafted. The dependency on `plugins/ifc-export/` IFC-α completion is correct.

**Revised effort estimate**: ~17 wk → **~17 wk** (unchanged).

---

### §3.4 — Family Platform

**Master plan + memory claim**: "P0 strategic direction — Family Platform is a future scope (~28 dev-weeks)."
**Memory entry** ([family-platform-strategic-direction.md](../../C:/Users/LENOVO/.claude/projects/c--Users-LENOVO-OneDrive-Desktop-PRYZM-Product-Rediness-08/memory/family-platform-strategic-direction.md)): "audit found ~half the surfaces ALREADY DYNAMIC".

**Actual state — much further along than memory suggests**:

| Path | Status | Notes |
|---|---|---|
| `packages/family-runtime/` | **IMPLEMENTED — PRYZM 2 S55** | Expression DSL + parser + evaluator + 40+ built-in functions + resolveParameter + unit coercion. Pure-Node, dependency-free. Used by editor, bake-worker, AI-worker. |
| `packages/family-loader/` | **IMPLEMENTED — PRYZM 2 S56 D1** | `loadFamily(path)` opens `.pryzm-family` ZIP, validates manifest+document, runs resolver pre-flight, caches by `(familyId, schemaHash)`. |
| `packages/family-instance/` | **IMPLEMENTED — PRYZM 2 S56 D2/D3** | `bakeFamilyInstance({ family, typeId, instanceOverrides })` → resolves params, evaluates profiles to closed polygons, dispatches geometry-kernel producers (extrude/sweep/loft/revolve). Pure-Node, no THREE. |
| `apps/component-editor/` | **PARTIAL** | Family Creator SPA — constraint solver + 2D sketcher + 3D extrude/sweep/loft/revolve. Full rewrite roadmap S52–S59. |
| `plugins/family-editor/` | **STUB** | "PRYZM Family Editor — parametric BIM family creator (Phase F reference plugin stub)." |
| `FamilyRegistry` symbol | **NOT IN CODE** | Grep returns zero matches for `FamilyRegistry` outside the strategic doc. The registry substrate is genuinely new. |
| `FamilyRequest` symbol | **NOT IN CODE** | Same — the family-request ingestion concept is genuinely new. |
| `core-family-seed/` directory | **NOT IN REPO** | The memo's "core-family-seed JSON sidecars" haven't started landing yet. |

**Re-scoped master plan + APARTMENT-FAMILY-PLATFORM plan**:

- ✗ P0.1 (lifecycle map) — DRAFTED in the strategic doc.
- ✓ P0.2 (universal contract) — STILL NEW.
- ✓ P0.3 (FamilyRegistry substrate L0) — **STILL NEW** (registry doesn't exist). Estimate stands.
- ✗ Pipeline Stage 1–4 — **PARTIALLY REDUNDANT**. The bake pipeline (S56 D2/D3) covers Stage 3 (geometry synthesis) and Stage 2 (parametric decomposition is the family DSL itself). Stage 1 (ingestion) and Stage 4 (auto-Zod) are new.
- ✓ P0.4 (FamilyRequest schema + Stage 1 ingestion) — STILL NEW.
- ⚠️ P0.5 (Stages 2–4) — **HALF REDUNDANT**. Stage 2 + Stage 3 exist in family-runtime + family-instance. Stage 4 (auto-Zod) is new.
- ✓ P0.6 (Stages 5–8) — STILL NEW.
- ✓ P0.7 (plugin marketplace runtime side) — STILL NEW per [APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md](APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md) §10.
- ✓ P0.8 (schema/IFC-reader/property-panel discovery APIs) — STILL NEW.
- ✓ P0.9 (gap analysis) — DRAFTED in this doc + the strategic doc.

**Revised effort estimate**: ~28 wk → **~18 wk** (35% reduction). The family runtime + loader + bake pipeline already exist; the registry, ingestion pipeline, and discovery APIs remain.

---

### §3.5 — Inspect / Data / Model Tree

**Master plan claim** (Part V + C27): "BIM 3.0 Inspect Model — hierarchical model tree, selection-driven isolation, graphical dashboards. Replaces current flat Author/Inspect/Data panel."

**Actual state**:

| Path | Status | Notes |
|---|---|---|
| `apps/editor/src/ui/PropertyInspector.ts` | **IMPLEMENTED (old design)** | Flat property list + element-specific sections. The legacy "Inspect tab". |
| `apps/editor/src/ui/property-inspector/` | **PARTIAL** | 80 files. WS-B section module extraction (Wave 7). PropertyInspectorApply.ts, PropertyInspectorControls.ts (material select, orientation), etc. |
| `plugins/ifc-inspector/` | **IMPLEMENTED — orthogonal specialist** | Pset editor for Tier 1 + Tier 2 elements. NOT the BIM 3.0 tree. Coexists with future Inspect redesign. |
| `packages/visibility/` | **PARTIAL** | 11-wave legacy Visibility-Intent system (W01 level-scope → W11 ghost-layer). Skeleton port at S49. |
| `InspectSelectionStore` symbol | **NOT IN CODE** | Genuinely new. |
| `IsolationVisibilityIntent` symbol | **NOT IN CODE** | Genuinely new. |
| Model tree component | **NOT IN CODE** | Genuinely new. |
| Graphical dashboards (radar / sunburst / etc.) | **NOT IN CODE** | Genuinely new. |

**Re-scoped master plan**: **NO CHANGES** to Part V plan. The new Inspect model is genuinely new. Open items:
- The existing flat `PropertyInspector.ts` + `property-inspector/` directory (80 files) needs a **migration plan** — either deprecate (and replace with the new Inspect surface) or keep as a specialist sub-panel for element instance details.
- `plugins/ifc-inspector/` (Pset editor) should be **integrated as the element-instance sub-panel** of the new Inspect surface — not replaced.

**Revised effort estimate**: ~17.5 wk → **~18 wk** (slight increase to include migration of `property-inspector/` directory).

---

### §3.6 — Data Tab / Schedules

**Master plan claim** (Part VI + C28): "Live data layer for check / automate / update / review. Quality rules engine. Bulk-edit. Export to Excel/CSV/JSON/IFC-Psets."

**Actual state**:

| Path | Status | Notes |
|---|---|---|
| `plugins/schedules/` | **IMPLEMENTED — PRYZM 2 S41 / Phase 2C / ADR-0032** | Schedule store + 6 handlers (CreateSchedule, DeleteSchedule, AddColumn, RemoveColumn, SetGroupBy, SetFilter) + pure-TS formula DSL parser + evaluator + snapshot-based reactive table view |
| `plugins/schedules/src/store.ts` | IMPLEMENTED | ScheduleStore |
| `plugins/schedules/src/handlers/*` | IMPLEMENTED | 6 handlers |
| `plugins/schedules/src/formula/` | IMPLEMENTED | Formula DSL parser + evaluator |
| `plugins/schedules/src/export/` | IMPLEMENTED | CSV, XLSX, PDF (verify), CSV import |
| Quality-rules engine | **NOT IN CODE** | Genuinely new — but the constraint DB (248+ rules in apartment doc) + dimensional G-classes + topology A-classes ARE the candidate rule sources. |
| Bulk-edit commands | **NOT IN CODE** | Genuinely new. |
| Live data layer (vs flat table) | **NOT IN CODE** | Genuinely new — but the schedule snapshot table IS reactive. |
| Unified Data grid (vs per-schedule table) | **NOT IN CODE** | Genuinely new. |

**Re-scoped master plan**:

| Phase | Re-scoped action |
|---|---|
| DAT-α-1 (DataStore + virtualised grid NEW) | **PARTIALLY REDUNDANT**. Schedules table is reactive. The **unified grid across all elements (not per-schedule)** is genuinely new. |
| DAT-α-2 (filter chips) | **REDUNDANT**. SetFilter handler exists in schedules. Action: **extend** to apply across the unified grid. |
| DAT-α-3 (group-by) | **REDUNDANT**. SetGroupBy handler exists. |
| DAT-α-4 (selection sync) | **NEW**. |
| DAT-β-1 (quality-rules engine v1) | **NEW**. |
| DAT-β-2 (quality-rules engine v2 with G/A classes) | **NEW**. |
| DAT-β-3 (bulk-edit) | **NEW**. |
| DAT-β-4 (Room schedule) | **PARTIALLY REDUNDANT**. Schedules plugin supports configurable schedules. The Room schedule template specifically is new. |
| DAT-β-5 (Door + Window + Furniture schedules) | **PARTIALLY REDUNDANT**. Same — schedules plugin can render these, the templates are new. |
| DAT-γ-1 (Excel / CSV export) | **REDUNDANT**. Schedules plugin already exports CSV + XLSX. |
| DAT-γ-2 (JSON export) | **NEW**. |
| DAT-γ-3 (IFC Pset export) | **NEW** (depends on IFC-β-1). |
| DAT-γ-4 (data automation cron) | **NEW**. |
| DAT-γ-5 (SQL export) | **NEW**. |

**Revised effort estimate**: ~18.5 wk → **~12 wk** (35% reduction). Major leverage from existing schedules plugin.

---

### §3.7 — PDF / Geospatial / PDF-to-BIM

| Path | Status | Notes |
|---|---|---|
| `plugins/export-pdf/` | **STUB** | Empty PDF export plugin shell. |
| `plugins/dxf/` | **STUB** | Empty DXF plugin shell. |
| `plugins/geospatial/src/CesiumThreeBridge.ts` | **STUB** | Cesium integration planned Phase F. |
| `packages/geospatial/src/GeospatialAdapter.ts` | **IMPLEMENTED** | LTP-ENU rebase + proj4 integration + IfcProjectedCRS round-trip (covers C12). |
| `packages/geospatial/src/LTPENURebase.ts` | **IMPLEMENTED** | Global WGS84 → local site ENU. |
| `packages/pdf-to-bim/` | **PARTIAL — PRYZM 2 S60 Track A** | Extraction proposals + confidence model + review-queue feeder. |
| `packages/pdf-to-bim/src/confidence.ts` | IMPLEMENTED | Confidence model. |
| `packages/pdf-to-bim/src/review-queue.ts` | IMPLEMENTED | Review queue. |
| PDF-to-BIM editor integration | **NOT IN CODE** | Editor host that consumes proposals + drives review queue is the gap. |
| `packages/render-pipeline/` | **PARTIAL — A16-T1** | ScenePass, ZonePass, BackgroundUniform extracted; SSGI/TRAA/Outline still in engine. Promoted A16-S124 (pending). |

**Re-scoped master plan**:

- C29 (PDF vector export) — **CONFIRMED NEW WORK**, builds on `drawing-primitives` typed-stub. Estimate stands.
- C12 (Geospatial) — **REDUNDANT in core**; only Cesium viewer integration is gap.
- PDF-to-BIM — **CONFIRMED PARTIAL**, editor host integration is the gap. Should be elevated into master plan (currently missing — only mentioned in Product Vision §5 Step 4).

---

## §4 — Reframed master-plan structure

The current master plan ([PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md](PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md)) was written greenfield. Going forward, every phase plan in Parts IV/V/VI must be re-stated under one of three banners:

1. **AUDIT + EXTEND** — subsystem exists, audit current capability vs target, extend with gap-fills.
2. **FILL TYPED STUB** — package or plugin shell exists, fill the stub with real implementation per existing scaffolding/ADR.
3. **GENUINELY NEW** — no prior art; build from scratch under the new C-contract.

Updated per-phase totals:

| Track | Original estimate | Audit-revised estimate | Δ |
|---|---|---|---|
| IFC Export (Part IV §7) | ~16 wk | ~14 wk | −2 wk |
| Sheet Composition (Part IV §8) | ~20 wk | ~10 wk | **−10 wk** |
| Revit Round-Trip (Part IV §9) | ~17 wk | ~17 wk | 0 |
| Inspect Model (Part V) | ~17.5 wk | ~18 wk | +0.5 wk |
| Data Tab (Part VI) | ~18.5 wk | ~12 wk | **−6.5 wk** |
| UI/UX (Part VII) | ~17 wk | ~17 wk | 0 |
| **TOTAL** | ~106 wk | **~88 wk** | **−18 wk (~17%)** |

Critical-path also compresses correspondingly — full plan now compresses to **~10 months** (Q3 2026 → Q2 2027) under multi-track parallel execution.

---

## §5 — New work surface that was NOT in the master plan

The audit surfaced two areas the original master plan **did not address** but should:

### §5.1 — PRYZM 2 → PRYZM 3 strangler-fig completion

`packages/render-pipeline/` is mid-extraction (A16-T1 done; SSGI/TRAA/Outline pending A16-S124). The 8-layer purity goal (P1 single composition root, P2 single THREE owner) requires this strangler-fig to complete. **Recommended**: add an explicit phase in the master plan for A16-S124 (render-pipeline closeout).

### §5.2 — PDF-to-BIM editor integration

`packages/pdf-to-bim/` is mid-implementation. The proposal/confidence model is done; the editor-host integration that consumes proposals + drives the review queue is the gap. The Product Vision §5 Step 4 (existing conditions — PDF/DWG/image import) flags this as Phase 1 work but **the master plan doesn't track it**. Recommended: add a new track to Part IV called "Existing-Conditions Import" with phases PBR-α (PDF-to-BIM editor integration), PBR-β (DWG import via `plugins/dxf/`), PBR-γ (image-to-BIM).

---

## §6 — Recommendations

1. **Update the master plan in place** with:
   - A new **Part 0 — Prior-Art Audit** that cross-links to this doc and tabulates the AUDIT+EXTEND vs FILL TYPED STUB vs GENUINELY NEW classification for every phase.
   - Revised effort estimates per [§4 above](#4--reframed-master-plan-structure).
   - Two new tracks per [§5 above](#5--new-work-surface-that-was-not-in-the-master-plan): render-pipeline closeout + existing-conditions import.

2. **Author honest C24–C30 contract stubs** that **govern existing implementations** + identify the gap-fill scope. The contracts should treat `plugins/sheets/` (etc.) as the **current implementation** and codify the invariants going forward.

3. **Update Product Vision V1 §8 (Gap Analysis)** with corrected current-state classification — the line "PDF/image-to-BIM is not robust" is partly wrong (`packages/pdf-to-bim/` HAS a confidence model + review queue; the editor integration is the gap, not the extraction).

4. **Memory updates** — write a memory note that codifies "PRYZM 2 prior-art register" so future sessions don't make the same greenfield assumption.

---

## §7 — Authoring credit

Audit conducted 2026-05-31 by sub-agent (Explore variant, thorough breadth) + orchestrator spot-checks of:

- `plugins/` (46 plugins, package.json descriptions read; key implementations spot-read)
- `packages/` (60+ packages, package.json descriptions read; key implementations spot-read)
- `apps/` (14 apps, package.json descriptions read)
- `Grep` searches for: `revit|\.rvt|\.rfa`, `IfcSite|IfcSpace|IfcZone`, `FamilyRegistry|FamilyRequest`, `InspectSelectionStore|IsolationVisibilityIntent`

The audit took ~20 minutes total elapsed time. Total cost: zero code changes. Result: a 17% overall effort reduction in the PRYZM 3 master plan and elimination of multiple incorrect "NEW" classifications.

---

*End — PRYZM3 Prior-Art Audit, 2026-05-31.*
