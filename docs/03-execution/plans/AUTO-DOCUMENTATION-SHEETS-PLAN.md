# Auto-Documentation Sheets — Analysis, Gap-Audit & Implementation Plan

*Authored 2026-06-09. Founder brief: "add the views for each level on a sheet ready to be
exported to PDF; create automatically building elevations, room elevations and cropped plan
views for each room, all placed automatically on a sheet. Plus: automatic CORE DIMENSIONS and a
wall/door/window SET-OUT plan, fully auto-dimensioned. A lot of this has been already done." Goal:
**a full set of documentation sheets for each floor plan and each room, PDF-ready.***

This plan is the canonical scope/gap/roadmap for the **Auto-Documentation Sheets** feature
(working tag **`DOC-AUTO`**). It complies with the existing drawing-production contracts
(C24/C29/C30/C34) + specs (SPEC-04/SPEC-30) and identifies the one new contract the auto layer
needs. Implementation items are tracked in [master-execution-tracker.md](master-execution-tracker.md) §24.

---

## §1 — Headline finding: ~80% of the substrate already exists

PRYZM already has a deep, mostly-wired documentation substrate. The missing piece is the
**orchestration layer** — a deterministic workflow that, given a building model, *auto-creates*
the full set of views (per-level plans, building elevations, per-room interior elevations +
cropped plans, set-out plans), *auto-dimensions* them, and *auto-places* them on numbered,
PDF-ready sheets. The primitives, schemas, renderers, projectors and dimension producers are
present; nothing strings them together end-to-end yet.

---

## §2 — AS-IS substrate (what EXISTS, with citations)

### 2.1 Sheets, viewports, title blocks, drawing sets — **WIRED**
- **L0 schemas**: `packages/schemas/src/sheet/sheet.ts` (`SheetSchema`, `ViewportDto` with
  `clippingBox`, `WidgetSchema`), `packages/schemas/src/sheet/paper-size.ts` (A0–A4, ARCH-D/ANSI-D).
- **L2 primitives**: `packages/drawing-primitives/src/sheet/` — `Sheet.ts`, `Viewport.ts`,
  `TitleBlock.ts`, `PaperSize.ts`, pure `addViewport`/`validateSheet`; **`buildSheetFromRooms.ts`**
  (scale auto-picker 1:50…1:1000, fits page minus margins + title block).
- **L4 plugin**: `plugins/sheets/` — `store.ts` + 11+ handlers (`sheet.create/delete/rename/reorder`,
  `sheet.addViewport/removeViewport/setViewportScale`, `addWidget`, `setTitleBlock`), Canvas2D host,
  `book/book-exporter.ts` (multi-sheet orchestrator, callback renderers).
- **L3 drawing sets**: `packages/stores/src/DrawingSetStore.ts` — per-discipline ordering,
  revisions, status lifecycle, auto-numbering. **NOT yet wired to UI.**
- **UI**: `apps/editor/src/ui/ViewBrowser/panels/SheetsRailPanel.ts`.

### 2.2 PDF export — **WIRED backend, NOT command/UI wired**
- **`packages/pdf-export/src/SheetToPdf.ts`** — `sheetToPdfBytes(sheet, contentByViewportId, opts)`
  → vector PDF bytes (paper/grid/border/title-block/per-viewport polygons+lines+text). Tested.
- **`packages/file-format/src/export/sheets/PdfExportService.ts`** — legacy jsPDF+svg2pdf path
  (registered on `window`, no command handler).
- **SVG**: `drawing-primitives/src/sheet/SheetWithContentToSvg.ts` + `ViewportToSvg.ts`.
- **GAP**: no `sheet.export.pdf` command handler; no editor button; book-exporter not bridged to
  `sheetToPdfBytes`.

### 2.3 ViewDefinition system — **WIRED (plan/elevation/section are first-class)**
- `packages/core-app-model/src/views/ViewDefinitionTypes.ts` — `viewType: plan|elevation|section|
  ceiling-plan|3d`; `spatial.levelId`, `spatial.cropRegion {minX,minZ,maxX,maxZ}`,
  `spatial.projectionDirection` (presets elevationFront/Back/Left/Right), `spatial.sectionPlane`,
  `spatial.sectionVolume`, `spatial.viewRange` (near/far offsets).
- `DefaultViewsManager.ts` — guarantees `vd-sys-3d-1` + `vd-sys-plan-l0` (Ground) on every project.
- `view.createDefinition` (`CreateViewDefinitionCommand`) — the create path the house executor uses.
- **§FLR-VIEWS already SHIPPED** in `apps/editor/src/ui/house-layout/HouseLayoutExecutor.ts`:
  auto-creates one plan ViewDefinition per generated upper storey (`vd-plan-<levelId>`,
  `viewType:'plan'`, `spatial.levelId`), skipping ground + dedup.

### 2.4 Plan projection + crop — **WIRED**
- `packages/core-app-model/src/geometry/NativeElementMeshExporter.ts` — per-level element gather
  (childrenIds + adjacent-below "beyond" band), `_isInsideCropRegion()` XZ-AABB pre-filter against
  `spatial.cropRegion`, Y-clip via `LevelClipPlaneCache` + `resolveViewRangeWorldY`.
- `apps/editor/src/engine/views/EdgeProjectorService.ts` — `resolveClipRange()` (plan = elevation +
  near/far offsets); line projection → OBC.TechnicalDrawing with ISO-13567 layers (A-WALL/A-DOOR/…).

### 2.5 Elevations + sections — **WIRED for building; room interior PARTIAL; auto-placement MISSING**
- **EdgeProjectorService** fully projects `viewType:'elevation'`/`'section'` via `resolveSectionVolumeBox`
  (depth-space clip), HLR (`removeHiddenLines`), cut-vs-beyond edges; `SectionViewService.activateSection`.
- **`plugins/annotations/src/commands/CreateElevationMarkCommand.ts`** — creates an elevation
  ViewDefinition with `projectionDirection`+`sectionVolume`, AND **auto-detects the containing room**
  and auto-sizes the elevation scope to the room's wall extents.
- **`ElevationPlanToolHandler.ts`** — one click drops **4 marks (N/S/E/W)** ("Interior Elevation n").
- `CreateSectionMarkCommand.ts` + `SectionViewRenderer.ts` — section line → view, cut/beyond.
- **GAPS**: (a) no per-wall isolation of a room's individual wall in the interior elevation output;
  (b) no auto-creation of the 4 **building-exterior** elevation marks (N/S/E/W of the footprint);
  (c) no auto-section marks at standard cut lines.

### 2.6 Dimensions + set-out — **WIRED schema + auto-producer; set-out plan + chains MISSING**
- **L0**: `packages/schemas/src/annotation/dimension.ts` — `DimensionString` (6 kinds:
  linear-element, **linear-chain**, **overall**, angular, radius, diameter; 10 anchors incl
  face-outer/face-inner/centerline).
- **L4 producer**: `packages/geometry-kernel/src/dimensions/producer.ts` — `produceDimensions()`
  with **5 deterministic auto modes**: per-element (wall lengths, door/window widths),
  **room-bounding** (X/Y room bbox), elevation (heights), section (height+width), rcp. Pure/Node-safe.
- **Offsets/set-out data**: `geometry-kernel/src/dimensions/evaluator.ts` — door/window `offset`
  (metres along baseLine) + `width` + `sillHeight`, resolved to 3D witness points.
- **Grid/datum**: `plugins/annotations/src/tools/GridBubbleTool.ts`, `SectionGridLineBuilder.ts`,
  `LevelDatumLineBuilder.ts` (ISO A-ANNO-LEVL); `bimManager.getGrids()/getLevels()`.
- **Renderer**: `plugins/annotations/src/subsystem/WallDimensionRenderer.ts`; interactive
  `LinearDimensionAnnotationTool.ts`.
- **GAPS**: no dedicated **wall/door/window SET-OUT plan** that auto-emits offset-from-datum +
  width callouts + running/overall "core" dimension chains across a level (the producer has
  per-element + room-bounding but not a chained set-out string keyed to a grid/datum origin).

### 2.7 Governance (must comply)
- **C24** Sheet Composition Engine · **C29** PDF Vector Export (PDF/A-3, vector-only, span/export) ·
  **C30** Drawing Set Management (sets, revisions, transmittals, auto-numbering) · **C34** Print &
  Drawing Standards (sizes, line-weights ISO-128, scales, dimension/text styles, north arrow, scale
  bar). All **DRAFT**. · **SPEC-04** Drawing Engine (vector primitives + 3 back-ends, Cut/Beyond/
  Hidden/Sym) · **SPEC-30** Plan-View Performance budgets · **ADR-016** drawing-engine · **ADR-039**
  export-worker. · Command authoring **C16**; rendering/frame-bus **C04**.

---

## §3 — Gap analysis (the missing 20% = orchestration + 3 specific outputs)

| # | Capability | State | Gap |
|---|---|---|---|
| G1 | Per-level plan **ViewDefinitions** | ✅ §FLR-VIEWS ships them | none (reuse) |
| G2 | **Sheet** auto-built from a view | ◐ `buildSheetFromRooms` (room-centric) | no view→sheet auto factory; no per-level plan sheet |
| G3 | **PDF export** trigger | ◐ `sheetToPdfBytes` exists | no `sheet.export.pdf` command + UI; book bridge |
| G4 | **Building elevations** (4 N/S/E/W) | ◐ projector + mark cmd exist | no auto-placement of the 4 exterior marks from footprint |
| G5 | **Room interior elevations** | ◐ 4 marks/click + room auto-scope | no auto-per-room loop; no per-wall isolation output |
| G6 | **Per-room cropped plan** | ◐ cropRegion filter exists | no auto crop-region seeded from each room polygon → view → sheet |
| G7 | **Core dimensions / set-out plan** | ◐ producer (per-element/room-bounding) | no chained set-out string from grid/datum origin; no set-out plan assembly |
| G8 | **Auto sheet placement + numbering + set** | ◐ DrawingSetStore + book-exporter | no workflow placing all views on numbered sheets in a set |

---

## §4 — TO-BE: the `DOC-AUTO` pipeline

A single deterministic, P6-compliant workflow (pure core in a new `packages/ai-host/src/workflows/
docSheets/` or a `packages/doc-sheets/` L4 helper; editor-side executor dispatches commands) that
runs on demand ("Generate Documentation Set") and, for the active project/building:

```
DOC-AUTO
  Phase 0  collect: levels, rooms (RoomDetectionEngine), shell footprint, grids/datums
  Phase 1  PLANS    → per level: ensure plan ViewDefinition (reuse §FLR-VIEWS) → sheet (scale-fit)
  Phase 2  SETOUT   → per level: a SET-OUT plan view + auto core dimensions (grid/datum-keyed
                       chains over walls + door/window offsets) → sheet
  Phase 3  ELEVS    → building: auto-place 4 exterior elevation marks (N/S/E/W of footprint) →
                       4 elevation views → sheet(s)
  Phase 4  ROOMS    → per room: (a) cropped plan view (cropRegion = room bbox) + room dims;
                       (b) up to 4 interior elevation views (reuse CreateElevationMark room path)
                       → one "room documentation" sheet per room
  Phase 5  ASSEMBLE → number sheets (A-1xx plans, A-2xx elevations, A-3xx set-out, A-4xx rooms),
                       add to a DrawingSet, stamp title blocks → PDF-ready
  Phase 6  EXPORT   → sheet.export.pdf (new) → vector PDF/A-3 per C29 (single sheet + book)
```

**Determinism**: pure ordering by levelId/elevation then room id; no RNG; byte-identical re-runs
(ADR-0061 doctrine). **P6**: every mutation via the command bus (`view.createDefinition`,
`sheet.create`, `sheet.addViewport`, dimension/annotation creates, `drawingset.*`). **P8**: a span
at the workflow boundary + per C29 a span per PDF export.

---

## §5 — Sub-features (tracked items, each ships byte-identical-safe)

- **DS1 — Per-level plan sheets.** Reuse §FLR-VIEWS plan views; new `viewToSheet` factory
  (`packages/drawing-primitives`, pure) picks scale + builds a `Sheet`+`ViewportContent` from a
  view's projected TechnicalDrawing; one sheet per level. (G1+G2)
- **DS2 — `sheet.export.pdf` command + UI.** Wire `sheetToPdfBytes` behind a command handler +
  a "Export PDF" button; bridge `book-exporter` → `sheetToPdfBytes` for multi-sheet. C29-compliant
  (vector-only, span). (G3)
- **DS3 — Building elevations (auto 4×).** New `autoPlaceBuildingElevations(footprint)` → 4
  exterior elevation marks (N/S/E/W) at footprint edges → 4 elevation views → sheet. Reuses
  `CreateElevationMarkCommand` projector path. (G4)
- **DS4 — Per-room interior elevations + cropped plans.** Loop over detected rooms: seed
  `cropRegion` = room bbox for a cropped plan view; invoke the existing 4-mark room elevation path
  per room; assemble a "room sheet". Add per-wall isolation (filter the elevation's TechnicalDrawing
  to the room's wall on that side). (G5+G6)
- **DS5 — Core dimensions / set-out plan.** New auto-dimension mode `set-out` in
  `geometry-kernel/dimensions/producer.ts`: from a chosen datum/grid origin, emit (a) a running
  chain of wall faces along each axis, (b) door/window offset+width callouts (data already in the
  evaluator), (c) overall dims. Assemble a SET-OUT plan view + sheet. Honours C34 DimensionStyle. (G7)
- **DS6 — Auto sheet set + numbering.** New `docSheets` workflow drives DS1–DS5, numbers sheets,
  adds them to a `DrawingSet` (wire `DrawingSetStore` minimally), stamps title blocks. (G8)

---

## §6 — Governance: comply + ONE new contract

- **Comply with**: C24 (sheet renderer P2/P3/P6, single renderer), C29 (vector-only PDF, span),
  C30 (drawing-set lifecycle), C34 (sizes/line-weights/scales/styles/north-arrow/scale-bar),
  SPEC-04 (vector primitives), SPEC-30 (perf budget), C16 (command naming), C04 (frame-bus).
- **NEW CONTRACT NEEDED** — *C24.1 (or SPEC) "Auto-Documentation Sheets Protocol"*: nothing today
  governs **auto-generation** (vs interactive authoring) of sheets/elevations/dimensions, the
  **per-room/per-level coverage rule**, the **auto-numbering scheme**, or **auto label/dimension
  placement** (force-directed placement is deferred per SPEC-04 §8.2 → v1 uses rule-based). This
  plan is the pre-contract analysis; ratify C24.1 before DS5/DS6 land.

---

## §7 — Phased implementation (sequence; each PR byte-identical-safe behind the workflow)

1. **DS2** (PDF command + UI) — unblocks "see a sheet as PDF" immediately; lowest risk.
2. **DS1** (per-level plan sheets) — reuses §FLR-VIEWS; first auto-sheet output.
3. **DS3** (building elevations) — auto-place 4 marks; reuses projector.
4. **DS5** (set-out + core dimensions) — new producer mode + set-out plan; needs C24.1 draft.
5. **DS4** (per-room elevations + cropped plans) — the per-room loop; heaviest.
6. **DS6** (auto sheet set + numbering + book PDF) — ties it together; wire DrawingSetStore UI.

Each phase: pure core + unit tests (Node-safe, deterministic) → editor executor dispatching
commands → a §DIAG line + an OTel span. No change to existing interactive tools (additive).

---

## §8 — Risks / notes

- **Perf** (SPEC-30): per-room projection × N rooms can be heavy; cache via `ViewTechnicalDrawingCache`,
  generate lazily/batched, and `log()` any cap.
- **Beyond-linework** (the storey-below bleed, see [[house-level-assignment-investigation]]) must be
  handled for clean per-level plan sheets — decide faint/exclude for documentation output.
- **Drawing-set UI** is currently absent; DS6 needs a minimal "Documentation" panel.
- **Determinism**: stamp timestamps/revisions AFTER generation (ADR-0061); no Date.now in the pure core.
