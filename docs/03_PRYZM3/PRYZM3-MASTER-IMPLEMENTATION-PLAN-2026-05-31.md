# PRYZM 3 — MASTER IMPLEMENTATION PLAN (2026-05-31)

> **Status**: STRATEGIC · CANONICAL · synthesises every PRYZM 3 delivery thread.
> **Authority chain**: [00-PRODUCT-VISION-AND-BUSINESS-STRATEGY-V1.md](00-PRODUCT-VISION-AND-BUSINESS-STRATEGY-V1.md) → [01-VISION.md](01-VISION.md) → [02-ARCHITECTURE.md](02-ARCHITECTURE.md) → C-contracts (C01–C30) → ADRs → SPECs → code.
> **Supersedes**: nothing — it is a **synthesis** doc that **does not replace** canonical docs. It cites them, identifies gaps, proposes new contracts, and sequences delivery.
> **Purpose**: end-to-end consolidation of (a) vision-additions, (b) architecture-audit, (c) new C-contract drafts (C24–C30), (d) export-infrastructure delivery (IFC + Sheet/PDF + Revit round-trip), (e) BIM 3.0 Inspect Model + Data redesign, (f) UI/UX redesign, (g) connection-map across previously-siloed strategic threads.
> **Anti-silo doctrine**: every feature in this plan must connect to one of the existing strategic threads or explicitly explain why it does not.

---

## Table of contents

- [Part I — Vision Additions](#part-i--vision-additions)
- [Part II — Architecture Audit (2026-05-31)](#part-ii--architecture-audit-2026-05-31)
- [Part III — New Contracts (C24–C30)](#part-iii--new-contracts-c24c30)
- [Part IV — Export Infrastructure](#part-iv--export-infrastructure)
  - [§7 IFC Export (production-grade)](#7--ifc-export-production-grade)
  - [§8 Sheet Composition Engine + Vector PDF](#8--sheet-composition-engine--vector-pdf)
  - [§9 Revit Round-Trip](#9--revit-round-trip)
- [Part V — BIM 3.0 Inspect Model](#part-v--bim-30-inspect-model)
- [Part VI — DATA Tab: Live Data Layer](#part-vi--data-tab-live-data-layer)
- [Part VII — UI/UX Redesign](#part-vii--uiux-redesign)
- [Part VIII — Connection Map (Anti-Silo)](#part-viii--connection-map-anti-silo)
- [Part IX — Master Phase Timeline](#part-ix--master-phase-timeline)
- [Part X — Risk Register & Open Questions](#part-x--risk-register--open-questions)
- [Part XI — Source documents and provenance](#part-xi--source-documents-and-provenance)

---

# Part I — Vision Additions

## §1 — Three new differentiators

This master plan adds **three new differentiators** to the Product Vision ([00-PRODUCT-VISION-AND-BUSINESS-STRATEGY-V1.md](00-PRODUCT-VISION-AND-BUSINESS-STRATEGY-V1.md) §3 and [01-VISION.md](01-VISION.md)). All three are load-bearing — i.e. failing to deliver any one of them invalidates the product's competitive promise:

| ID | Differentiator | Why it matters | Existing today? |
|---|---|---|---|
| **D11** | **Architecturally sound Sheet & PDF export** — publication-grade vector PDF + DWG with proper drawing frames, title blocks, multi-viewport layouts, scale bars, dimension annotation, revision tracking, sheet sets. | Without this, PRYZM cannot deliver construction documents. Every architect requires this as their *final* deliverable. Today's `plugins/export-pdf/` produces a raster canvas screenshot — not a drawing. | NO — fundamental gap |
| **D12** | **Native Revit round-trip** — bidirectional `.rvt`/`.rfa` ↔ `.pryzm` (via IFC4 as canonical bridge, with optional Revit-API adapter for full-fidelity transfer of phasing/worksets/design options). | The consultant ecosystem runs on Revit. Without round-trip, PRYZM is a dead-end format — architects cannot collaborate with their structural/MEP consultants without losing data. | PARTIAL — IFC export exists but with critical gaps; no Revit-targeted MVD; no validation suite. |
| **D13** | **BIM 3.0 Inspect & Data Model** — hierarchical model tree (Site → Building → Level → Apartment → Room → Element) with selection-driven isolation, next-generation graphical data dashboards, and a live Data tab for review/automation/quality-checks. | The current Author/Inspect/Data panel is a flat property list with zero model awareness. This is the single most visible UI gap. | NO — must be redesigned ground-up |

> Each new differentiator maps to a new contract: D11 → `C24` + `C29` + `C30`; D12 → `C26`; D13 → `C27` + `C28`. See [Part III](#part-iii--new-contracts-c24c30).

## §2 — How the new differentiators connect to existing vision threads

The new D11/D12/D13 differentiators **do not stand alone** — they connect to every existing strategic doc. The table below maps each new differentiator to the upstream/downstream docs it depends on (anti-silo rule):

| New differentiator | Depends on / connects to (existing docs) |
|---|---|
| **D11 Sheet + PDF** | [01-VISION.md](01-VISION.md) §differentiator D6 (one-file deliverable); [02-ARCHITECTURE.md](02-ARCHITECTURE.md) §4 (frame-bus); [C04](../00_Contracts/C04-RENDERING-AND-SCHEDULING.md) §3.5 LOD; [C05](../00_Contracts/C05-PERSISTENCE-AND-FILE-FORMAT.md) §5 (export pipeline). Drawing geometry kernel must respect P2 (single THREE owner) and P3 (single rAF) — the Sheet renderer cannot create a parallel viewport pipeline. |
| **D12 Revit round-trip** | [01-VISION.md](01-VISION.md) §differentiator D5 (full IFC4 round-trip); [C05](../00_Contracts/C05-PERSISTENCE-AND-FILE-FORMAT.md); [C15](../00_Contracts/C15-HOSTED-ELEMENT-CONTRACT.md) (hosted elements semantic == Revit's hosted-elements semantic); [APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md](APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md) (FamilyRegistry maps directly to RFA semantic). |
| **D13 Inspect/Data** | [APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md](APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md) (D-α deliverables — parameter stores + propagator); [APARTMENT-COGNITION-STACK-AND-IMPLEMENTATION-PLAN-2026-05-29.md](APARTMENT-COGNITION-STACK-AND-IMPLEMENTATION-PLAN-2026-05-29.md) (objective vectors → radar charts on Apartment node); [APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md](APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md) (G-class + A-class validators → Data tab quality gates); [C09](../00_Contracts/C09-AI-AND-VISIBILITY-INTENT.md) §visibility-intent (selection isolation routes through visibility intent, not a parallel hack). |

---

# Part II — Architecture Audit (2026-05-31)

## §3 — Eight-principle audit

The PRYZM 3 architecture (`02-ARCHITECTURE.md`) is defined by 8 principles enforced by CI. The table below summarises current state and what THIS plan adds:

| Principle | What it enforces | CI gate | Current state | This plan adds |
|---|---|---|---|---|
| **P1** — Single composition root | One `composeRuntime()` | Soft → Hard at Phase D | 4/9 convergence booleans TRUE | Export pipeline + Sheet engine wired through `composeRuntime()`. Inspect panel's `InspectSelectionStore` registered in composeRuntime. |
| **P2** — Single THREE owner | Only `renderer-three/` imports THREE | Hard-fail ESLint | CLOSED | Sheet canvas renderer (`packages/sheet-renderer/`) must respect P2 — uses 2D canvas or SVG, NOT THREE. |
| **P3** — Single rAF | Only `scheduler.ts` calls `rAF` | Hard-fail ratchet=1 | CLOSED | Sheet preview loop subscribes to `FrameScheduler.onFrame` at `render` priority, not its own rAF. Inspect isolation animator subscribes at `render` priority. |
| **P4** — No `(window as any)` | Zero escape hatches outside allowlist | Soft → Hard Phase E | Non-shim = 0 achieved | All new export / inspect / sheet code must be zero-cast. |
| **P5** — Schemas pure | `packages/schemas/` zero I/O | Hard-fail purity check | CLOSED | New schemas: `Sheet`, `ViewPort`, `DrawingFrame`, `TitleBlock`, `RevisionRow`, `IfcExportConfig`, `RevitMappingTable`, `InspectSelection` — all added to `packages/schemas/`. |
| **P6** — Commands only mutation | UI must dispatch via `commandBus` | Hard-fail lint | CLOSED | New commands: `sheet.create`, `sheet.addViewport`, `sheet.updateTitleBlock`, `sheet.export.pdf`, `sheet.export.dwg`, `ifc.export`, `revit.export`, `inspect.selectNode`, `inspect.isolate`, `inspect.exitIsolation`, `data.bulkUpdate`, `data.runQualityCheck`, `data.export`. All authored per [C16](../00_Contracts/C16-COMMAND-AUTHORING-PROTOCOL.md). |
| **P7** — Visibility intent | `packages/visibility/` first-class | Contract test | CLOSED | Inspect isolation mode is a **new visibility intent**, not a parallel UI flag. The `IsolationVisibilityIntent` is dispatched into `packages/visibility/` and applied by `scene-committer`. |
| **P8** — Sync conflicts explicit + spans | Every new exported function has ≥1 OTel span | Per-PR span check | CLOSED | Every new export/inspect/sheet exported function carries a span (`pryzm.sheet.composeViewport`, `pryzm.ifc.exportPset`, `pryzm.inspect.isolateNode`, `pryzm.data.runQualityRule`, etc.). |

### §3.1 — Layer assignment for new subsystems

The new subsystems map onto the 8-layer engineering model as follows:

| New subsystem | Package | Engineering layer | Justification |
|---|---|---|---|
| Sheet schemas (Zod) | `packages/schemas/src/sheet/` | L0 | Pure Zod; no I/O |
| Sheet store | `packages/stores/src/SheetStore.ts` | L3 | Domain-store layer (same as `DrawingStore`) |
| Sheet renderer | `packages/sheet-renderer/` (NEW) | L4 | Renderer-layer sibling of `packages/renderer/` |
| Sheet UI | `apps/editor/src/ui/sheets/` | L5 + L7 transitional | App-specific UI |
| IFC export config | `packages/schemas/src/ifc/` | L0 | Pure Zod |
| IFC export engine | `packages/file-format/src/ifc/` (existing — extend) | L3 | File-format owner |
| Revit mapping table | `packages/schemas/src/revit/` | L0 | Pure Zod mapping data |
| Revit adapter (optional companion) | external plugin (Python add-in) | not in monorepo | Lives outside; communicates via IFC4 file format |
| Inspect selection store | `packages/stores/src/InspectSelectionStore.ts` | L3 | Domain store |
| Inspect isolation intent | `packages/visibility/src/intents/` | L3 | Visibility-intent layer |
| Inspect graphical dashboard | `apps/editor/src/ui/inspect/` | L5 / L7 | App UI |
| Data layer engine | `packages/data-engine/` (NEW) | L3 | Domain-store layer for quality rules + automation |
| Data UI | `apps/editor/src/ui/data/` | L5 / L7 | App UI |

## §4 — Gaps identified across vision/architecture/contracts

### 4.1 — Vision gaps (closed by this plan)

| Gap in `00-Product-Vision-V1.md` or `01-VISION.md` | Closed by |
|---|---|
| No mention of Sheet/PDF as a *deliverable* (only mentioned PDF in passing as a "one-file delivery") | This plan §1 D11 + Part IV §8 + new vision-additions section to be patched into `01-VISION.md`. |
| Revit round-trip mentioned but not specified as a deliverable | This plan §1 D12 + Part IV §9 + new contract `C26`. |
| Author/Inspect/Data panel: vision says "data management" but does not specify the UI surface | This plan §1 D13 + Part V + Part VI + new contracts `C27`, `C28`. |
| Drawing set management (sheet set, revision, transmittal) — not in vision | This plan Part IV §8.3 SCE-γ-3 + new contract `C30`. |
| Quality-data automation (the "Data" tab does check/automate/update/review) — not in vision | This plan Part VI + new contract `C28`. |

### 4.2 — Architecture gaps

| Gap in `02-ARCHITECTURE.md` | Closed by |
|---|---|
| No `packages/sheet-renderer/` in 8-layer ladder | This plan §3.1 row 3; architecture update §A.1 (Part VII addendum). |
| No `packages/data-engine/` in 8-layer ladder | This plan §3.1 row 11; architecture update §A.2. |
| Inspect's selection-driven isolation not in any architecture layer | This plan §3.1 rows 8–9; routes through existing `packages/visibility/` (P7). |
| Export pipeline (IFC + PDF + DWG + Revit) not consolidated — currently three separate plugins | This plan Part IV §6 (unified export pipeline architecture). |

### 4.3 — Contract gaps

| Missing C-contract | Scope | Priority |
|---|---|---|
| **C24** Sheet Composition Engine | Sheet creation, view placement, drawing frame, title block, scale, annotation | P0 — blocks all sheet/PDF work |
| **C25** IFC Export (production-grade) | IFC4X3 full element coverage, Pset authoring, spatial structure | P0 — blocks IFC round-trip + Revit interop |
| **C26** Revit Round-Trip | RVT/RFA import via IFC bridge, PRYZM→RVT export, family translation table | P1 — depends on C25 |
| **C27** BIM 3.0 Inspect Model | Model tree hierarchy, selection-driven isolation, graphical data views | P1 — blocks Inspect redesign |
| **C28** Data Panel & Automation | Live data layer, quality rules engine, export to Excel/CSV/JSON | P1 — blocks Data tab |
| **C29** PDF Vector Export (print-ready) | True vector PDF from sheet canvas, print calibration, PDF/A compliance | P1 — depends on C24 |
| **C30** Drawing Set Management | Sheet set, revision tracking, transmittal generation | P2 — depends on C24 |

### 4.4 — UI/UX gaps

| UI/UX gap | Resolution |
|---|---|
| Current Author/Inspect/Data panel = flat property list | Redesign per Part V (Inspect = master tree + isolation + dashboards) + Part VI (Data = grid + automation). |
| No master tree navigation in any view | New Inspect tab includes a lazy-loaded master tree (Site → Building → Level → Apartment → Room → Element). |
| No selection-driven isolation in the viewport | New `IsolationVisibilityIntent` (P7). 200 ms fade-transition via `FrameScheduler` (P3). |
| No graphical data representation (everything is text tables) | Per-node-type graphical dashboards (Part V §11.3). |
| No sheet editor UI | New `apps/editor/src/ui/sheets/` (Part IV §8). |
| Site UI is dark globe; not design-audience appropriate (per vision §5 Step 3) | Cream/warm-white map UI (covered by Phase 1 in Product Vision). |

---

# Part III — New Contracts (C24–C30)

Each new contract is drafted as a stub in `docs/00_Contracts/`. The stubs declare scope, key invariants, dependencies, and CI gates. Full text is filled in during the relevant α-phase of each delivery track.

| Contract | File | Scope | Owns | Depends on | Status |
|---|---|---|---|---|---|
| **C24** | `C24-SHEET-COMPOSITION-ENGINE.md` | Sheet, ViewPort, DrawingFrame, TitleBlock, RevisionRow, ScaleBar, sheet rendering pipeline | `packages/sheet-renderer/`, `packages/schemas/src/sheet/`, `packages/stores/src/SheetStore.ts` | C03 (commands), C04 (rAF + canvas), C05 (export pipeline) | DRAFT |
| **C25** | `C25-IFC-EXPORT-PRODUCTION.md` | IFC4X3 full element coverage, IfcSite/IfcBuilding/IfcSpace, Pset authoring, classification, COBie | `packages/file-format/src/ifc/`, `packages/schemas/src/ifc/`, `plugins/ifc-export/` | C05, C12 (geospatial), C15 (hosted elements) | DRAFT |
| **C26** | `C26-REVIT-ROUND-TRIP.md` | RVT/RFA bridge via IFC4 MVD, family parameter mapping, level/view/sheet translation, optional Python adapter | external companion plugin + `packages/schemas/src/revit/` | C25 (IFC must be production-grade), C24 (sheets), C27 (data) | DRAFT |
| **C27** | `C27-BIM3-INSPECT-MODEL.md` | Model tree, InspectSelectionStore, IsolationVisibilityIntent, SpatialRelationshipResolver, graphical-data adapters | `packages/stores/src/InspectSelectionStore.ts`, `packages/visibility/src/intents/IsolationIntent.ts`, `apps/editor/src/ui/inspect/` | C03, C09 (visibility intent — P7), C16 (commands) | DRAFT |
| **C28** | `C28-DATA-PANEL-AND-AUTOMATION.md` | Live data grid, quality rules engine, bulk-edit commands, data export (Excel/CSV/JSON/IFC-Pset) | `packages/data-engine/` (NEW), `apps/editor/src/ui/data/` | C03, C25 (IFC Psets), C27 (selection drives data filter) | DRAFT |
| **C29** | `C29-PDF-VECTOR-EXPORT.md` | True vector PDF from sheet canvas, font embedding, line-weight calibration, PDF/A-3 compliance, IFC-embedding | `packages/sheet-renderer/pdf/` | C24, C04 | DRAFT |
| **C30** | `C30-DRAWING-SET-MANAGEMENT.md` | SheetSet, drawing register, revision tracking, transmittal, multi-sheet PDF package | `packages/stores/src/SheetSetStore.ts` | C24, C29 | DRAFT |

---

# Part IV — Export Infrastructure

## §5 — Why one section

Export is currently the largest gap between PRYZM and production BIM workflows. The three export targets (IFC, PDF/Sheets, Revit) share a common pipeline: command-bus dispatch → schema-validated config → file-format writer → typed result + telemetry span. Treating them as one section prevents three parallel implementations of the same plumbing.

## §6 — Unified Export Pipeline (cross-cutting)

```
                ┌─────────────────────────────────────────────────┐
                │              User intent surface                │
                │  (AI command, button click, automation trigger) │
                └────────────────────┬────────────────────────────┘
                                     ▼
                ┌─────────────────────────────────────────────────┐
                │             commandBus.dispatch                 │  (P6)
                │     ifc.export │ sheet.export.pdf │ revit.export│
                └────────────────────┬────────────────────────────┘
                                     ▼
                ┌─────────────────────────────────────────────────┐
                │       ExportConfigSchema (Zod-validated)        │  (P5)
                │  IfcExportConfig │ SheetExportConfig │ RvtCfg   │
                └────────────────────┬────────────────────────────┘
                                     ▼
                ┌─────────────────────────────────────────────────┐
                │   ExportOrchestrator (packages/file-format/)    │
                │   - resolves writer (IFC4X3, PDF/A-3, DXF, RVT) │
                │   - opens OTel span                              │ (P8)
                │   - streams to a Blob (browser) or file (node)  │
                └────────────────────┬────────────────────────────┘
                                     ▼
                ┌─────────────────────────────────────────────────┐
                │   Writer + Validator (per format)               │
                │   IFC: schema-validates against IFC4X3 EXPRESS   │
                │   PDF: vector check + font embedding             │
                │   DXF: layer-map validate                        │
                │   RVT: produced by Python add-in (out of repo)   │
                └────────────────────┬────────────────────────────┘
                                     ▼
                ┌─────────────────────────────────────────────────┐
                │   Result + telemetry surfaced to UI             │
                │   ExportResult { uri, bytes, warnings, span }   │
                └─────────────────────────────────────────────────┘
```

Key invariants:

- All exports route through `commandBus` (P6) — no plugin may bypass.
- All export configs are Zod-validated at the boundary — invalid configs throw early.
- Every export writer opens an OpenTelemetry span (P8) so we can profile export performance per format.
- Writers stream to a `Blob` (browser) or `Writable` (node); no full-document in-memory copies for large models.
- Validators run on the *produced* bytes, not the source model — so a malformed write fails closed.

---

## §7 — IFC Export (production-grade)

### 7.1 — Current state audit

The existing `plugins/ifc-export/` produces syntactically valid IFC files but with critical gaps that prevent round-trip with Revit/Archicad:

| Gap | Severity | Owner contract | Phase |
|---|---|---|---|
| `IfcSite`: `refLatitude` / `refLongitude` / `refElevation` unpopulated | CRITICAL | C12 + C25 | IFC-α |
| `IfcSpace` not generated from Room elements | CRITICAL | C25 | IFC-α |
| `IfcBuildingStorey`: missing `NetFloorArea` / `GrossFloorArea` attributes | HIGH | C25 | IFC-α |
| Furniture: missing `IfcFurniture` + `Pset_FurnitureTypeCommon` | HIGH | C25 | IFC-β |
| Window: `IfcWindow.PartitioningType` not derived from `SystemType` | HIGH | C25 | IFC-β |
| Door: `IfcDoor.OperationType` not derived semantically | HIGH | C25 | IFC-β |
| Apartment: no `IfcZone` grouping rooms per apartment | HIGH | C25 | IFC-β |
| `Pset_WallCommon`: `FireRating`, `AcousticRating` absent | MEDIUM | C25 | IFC-γ |
| `Pset_SlabCommon`: `LoadBearing` hardcoded | MEDIUM | C25 | IFC-γ |
| `IfcMapConversion`: only populated when Site model present | MEDIUM | C12 + C25 | IFC-γ |
| `IfcAnnotation`: room labels / dimensions / north arrow / notes not exported | MEDIUM | C25 | IFC-γ |
| Classification (Uniclass / OmniClass) not assigned | LOW | C25 | IFC-δ |
| COBie (Facility Management handover) not implemented | LOW | C25 | IFC-δ |

### 7.2 — IFC Export Phase Plan

| Phase | Deliverable | Contract | Estimate | Status |
|---|---|---|---|---|
| **IFC-α-1** | `IfcSite` full attribute population (lat/lon/elevation/address) from `SiteModel` when present; default-promoted otherwise | C12, C25 | 1 wk | PLANNED |
| **IFC-α-2** | `IfcSpace` generation from every Room: `NetFloorArea`, `GrossFloorArea`, `Height` | C25 | 1.5 wk | PLANNED |
| **IFC-α-3** | `IfcZone` per apartment grouping rooms; custom `Pset_ApartmentData` (unit number, score breakdown) | C25 | 1 wk | PLANNED |
| **IFC-α-4** | `IfcBuildingStorey`: `NetFloorArea`, `GrossFloorArea`, `ElevationOfSSLRelative` from level store | C25 | 0.5 wk | PLANNED |
| **IFC-α-5** | CI gate: `ifc-validator` runs on every export build; schema errors fail CI | C25 | 0.5 wk | PLANNED |
| **IFC-β-1** | Furniture: `IfcFurniture` + `Pset_FurnitureTypeCommon` for all 50+ furniture types (length/width/height/style) | C25 | 2 wk | PLANNED |
| **IFC-β-2** | Window: `IfcWindow` + full `PartitioningType` (SINGLE_PANEL / DOUBLE_PANEL / TRIPLE_PANEL) derived from system type; `Pset_WindowCommon` | C25 | 1 wk | PLANNED |
| **IFC-β-3** | Door: `IfcDoor` + `OperationType` (SINGLE_SWING_LEFT/RIGHT, DOUBLE_SWING, SLIDING) derived from door type; `Pset_DoorCommon` | C25 | 1 wk | PLANNED |
| **IFC-β-4** | Plumbing fixtures: `IfcSanitaryTerminal` + PredefinedType (BATH/SINK/SHOWER/TOILET/WASHHANDBASIN) | C25 | 1 wk | PLANNED |
| **IFC-β-5** | Kitchen appliances: `IfcElectricAppliance` + `Pset_ElectricApplianceTypeCommon` | C25 | 0.5 wk | PLANNED |
| **IFC-γ-1** | Wall Psets: `Pset_WallCommon` (LoadBearing, FireRating, AcousticRating, SurfaceSpreadOfFlame, ThermalTransmittance) | C25 | 1 wk | PLANNED |
| **IFC-γ-2** | Slab/Floor Psets: `Pset_SlabCommon`, `Pset_FlooringCommon` (material class + finish) | C25 | 0.5 wk | PLANNED |
| **IFC-γ-3** | `IfcAnnotation`: room labels, dimension strings, north arrow, drawing notes as annotation elements | C25 | 1.5 wk | PLANNED |
| **IFC-γ-4** | `IfcMapConversion`: fully populated from `SiteModel`; documented fallback to project origin | C12, C25 | 0.5 wk | PLANNED |
| **IFC-δ-1** | Uniclass 2015 classification: Ss (Systems) + Pr (Products) codes on all element types | C25 | 1 wk | PLANNED |
| **IFC-δ-2** | COBie export: Type/Component/Space/Zone/System sheets | C25 | 2 wk | PLANNED |
| **IFC-δ-3** | Performance NFT: < 20 s for 10k elements; streaming writer for large models | C25, C10 | 1 wk | PLANNED |

**Total IFC effort**: ~16 weeks across 4 sub-phases (α/β/γ/δ). Critical-path: α-1 → α-2 → β-1 (3.5 wk minimum sequential).

---

## §8 — Sheet Composition Engine + Vector PDF

### 8.1 — Current state audit

> **CRITICAL GAP**: Today PRYZM has no architecturally sound sheet workflow. The existing `plugins/export-pdf/` plugin generates a *raster screenshot* of the canvas, not a vector drawing sheet. There is no: drawing frame, title block, view arrangement, scale bar, north arrow, revision block, border, or print-calibrated output. **This is not a polish issue — it is a fundamental capability gap that prevents construction document delivery.**

### 8.2 — Sheet Engine architecture

The Sheet Composition Engine (SCE) is a new first-class L4 subsystem. A **Sheet** is a canvas with a defined paper size, scale, drawing frame, and a set of **ViewPorts** — each viewport renders a named **View** (plan, section, elevation, 3D, detail) at a specified scale.

| Layer | Component | Responsibility | Package |
|---|---|---|---|
| L0 | Sheet schemas | `SheetDefinition`, `ViewPort`, `DrawingFrame`, `TitleBlock`, `RevisionRow`, `ScaleBar`, `NorthArrow` | `packages/schemas/src/sheet/` |
| L2 | Sheet geometry kernel | Vector path generation from BIM elements at print scale, hidden-line removal, dimension string layout | `packages/geometry-kernel/` (extension) |
| L3 | Sheet store | Active sheet set, sheet metadata, viewport assignments, revision history | `packages/stores/src/SheetStore.ts` |
| L4 | Sheet canvas renderer | Renders a Sheet to an off-screen SVG canvas; routes rAF through `FrameScheduler` (P3) | `packages/sheet-renderer/` (NEW) |
| L4 | PDF Exporter | SVG → true vector PDF via `pdf-lib`; print calibration; PDF/A-3 compliance for IFC embedding | `packages/sheet-renderer/pdf/` |
| L5 | Sheet view state | Active sheet, zoom, pan, active viewport, annotation mode | `packages/view-state/` (extension) |
| L5 | DWG/DXF exporter | Sheet canvas → DXF (AutoCAD compatible) via `dxf-writer`; entity mapping | `packages/file-format/` (extension) |
| L7 | Sheet editor UI | Sheet management panel, viewport drag/resize, title block editor, issue/revision workflow | `apps/editor/src/ui/sheets/` |

### 8.3 — Sheet Engine phase plan

| Phase | Deliverable | Estimate | Blocks | Status |
|---|---|---|---|---|
| **SCE-α-1** | Sheet schemas: `SheetDefinition` + `ViewPort` + `DrawingFrame` + `TitleBlock` Zod schemas. Draft `C24` contract. | 1 wk | All downstream | PLANNED |
| **SCE-α-2** | `SheetStore` + `sheet.*` commands routed through `commandBus` (P6) | 1 wk | Sheet UI | PLANNED |
| **SCE-α-3** | Sheet canvas renderer v1: rasterised preview of a plan view at specified scale on A1/A3/A4 paper. No vector output yet. Validates layout engine. | 2 wk | PDF export | PLANNED |
| **SCE-α-4** | Drawing frame + title block: parametric A1 frame with project name, drawing title, scale, date, revision, author, company logo placeholder. Reads from `ProjectStore`. | 1 wk | Print-ready output | PLANNED |
| **SCE-β-1** | Multi-viewport sheet: multiple viewports per sheet (plan + elevation + detail). Viewport drag-resize UI. View assignment picker. | 2 wk | Construction doc sets | PLANNED |
| **SCE-β-2** | Vector PDF export: Sheet canvas → true vector PDF via `pdf-lib`. All text/lines/hatches as vector paths. No raster fallback for line work. Contract `C29`. | 2 wk | Delivery output | PLANNED |
| **SCE-β-3** | Scale bar + north arrow: auto-calculated from viewport scale + true north from `ProjectLocation`. Placed in viewport. | 0.5 wk | Drawing compliance | PLANNED |
| **SCE-β-4** | Dimension strings in sheets: linear / angular / area dimensions from model data — not manual annotation. | 1.5 wk | Measured drawings | PLANNED |
| **SCE-γ-1** | Section/elevation viewports: cut-plane section views rendered at print scale with hidden-line removal. | 2 wk | Full drawing set | PLANNED |
| **SCE-γ-2** | Detail views: magnified extract from parent view at larger scale (1:5/1:10/1:20). | 1 wk | Construction details | PLANNED |
| **SCE-γ-3** | Revision tracking: revision table in title block, revision clouds on sheets, issue register with transmittal export. Contract `C30`. | 2 wk | Documentation delivery | PLANNED |
| **SCE-γ-4** | Sheet set: multi-sheet project with automatic sheet numbering, cover sheet, drawing register, PDF/A package export. | 1.5 wk | Project delivery | PLANNED |
| **SCE-δ-1** | DWG/DXF export: sheet → DXF file. Layers by element category. XREF-compatible. AutoCAD 2018 format. | 2 wk | CAD delivery | PLANNED |
| **SCE-δ-2** | Print calibration: physical dimension accuracy, bleed/trim marks, plotter profiles (HP DesignJet, Epson T-series). | 1 wk | Physical print | PLANNED |
| **SCE-δ-3** | Sheet performance NFT: sheet re-render after edit < 200 ms (NFT 6 extended to sheets). | 0.5 wk | UX quality | PLANNED |

**Total SCE effort**: ~20 weeks across 4 sub-phases. Critical-path: α-1 → α-2 → α-3 → α-4 → β-2 (9 wk minimum sequential).

---

## §9 — Revit Round-Trip

### 9.1 — Strategy

The Revit round-trip uses **IFC4 as the canonical interchange format** rather than direct `.rvt` parsing.

- **PRYZM → Revit**: export IFC4 → import in Revit via Revit's own IFC importer (ISO 16739 compliant).
- **Revit → PRYZM**: export IFC from Revit → import via PRYZM's existing IFC importer (after `C25` IFC-α phase closes the structural gaps).
- The "native" experience is achieved through **high-fidelity IFC** — meaning the round-trip is as lossless as the IFC4 schema permits.
- For cases where lossless transfer is not possible via IFC alone (Revit-specific phasing, worksets, design options), a **Revit API adapter plugin** (Python add-in) is provided as an optional companion. It lives **outside the monorepo** because it depends on Revit's COM API (Windows-only, Autodesk licensing).

### 9.2 — Revit phase plan

| Phase | Deliverable | Estimate | Notes | Status |
|---|---|---|---|---|
| **RVT-α-1** | Revit-to-PRYZM: audit and close IFC import gaps. Verify all Revit IFC export categories map correctly to PRYZM element types. Document the mapping table. | 1 wk | Requires IFC-α complete | PLANNED |
| **RVT-α-2** | Level + view translation: Revit `Levels` → PRYZM `Levels`. Revit `FloorPlan` views → PRYZM plan views. Revit `3D View` → PRYZM 3D view. All named. | 1 wk | Fundamental for workflow | PLANNED |
| **RVT-α-3** | Family parameter translation: Revit Type/Instance Parameters → PRYZM Data Graph (BIM 2.0). Round-trip via `IfcPropertySet`. | 1.5 wk | Key for engineering data | PLANNED |
| **RVT-α-4** | Sheet + drawing translation: Revit `Sheet` → PRYZM `Sheet` (SCE-α complete). Viewport positions preserved. Title block data mapped. | 1.5 wk | Requires SCE-α complete | PLANNED |
| **RVT-β-1** | PRYZM-to-Revit: export PRYZM project as IFC4. Import in Revit using standard IFC importer. Validate geometry/levels/elements/parameters/rooms. | 2 wk | Core deliverable | PLANNED |
| **RVT-β-2** | Revit API adapter (optional companion plugin): Python-based Revit add-in that converts RVT → PRYZM-optimised IFC4. Handles Revit-specific extensions (phasing, worksets, design options). | 4 wk | Requires Revit 2024+ API | PLANNED |
| **RVT-β-3** | Round-trip validation suite: 10 reference Revit projects from simple (single apartment) to complex (multi-storey residential). Automated diff report. | 1.5 wk | Quality gate | PLANNED |
| **RVT-γ-1** | Revit family library: map common Revit system families (Basic Wall, Floor, Roof, Stairs, Curtain Wall) to PRYZM element types with geometry fidelity. | 2 wk | Fidelity improvement | PLANNED |
| **RVT-γ-2** | Phase data: Revit phases → PRYZM construction-phase parameter. New Construction / Existing / Demolished. Phase filter preservation. | 1 wk | Renovation projects | PLANNED |
| **RVT-γ-3** | Revit export certification: submission to buildingSMART for IFC4 Reference View MVD certification. | 2 wk | Market positioning | PLANNED |

**Total RVT effort**: ~17 weeks. Critical-path: RVT-α-1 (depends on IFC-α complete) → RVT-α-2 → RVT-α-3 → RVT-β-1 → RVT-β-3 (7 wk minimum sequential).

---

# Part V — BIM 3.0 Inspect Model

## §10 — Author / Inspect / Data panel redesign

> The current Author/Inspect/Data panel is the single largest UI/UX gap in PRYZM. The Inspect tab is a flat property list with no model awareness. The Data tab does not exist in any meaningful form. This section defines the complete redesign as a BIM 3.0 inspection surface.

### 10.1 — Current state problems

- Inspect panel: flat property list, no hierarchy, no context, no spatial awareness
- No selection-driven model isolation — selecting a room does not isolate it in the viewport
- Data tab: absent or minimal — no live model data, no automation, no quality checks
- No graphical data representation — data is text-only tables
- No master model tree — no way to navigate Site → Building → Level → Apartment → Room → Element
- Author tab: not connected to the BIM 2.0/3.0 data substrate established in [APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md](APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md)

### 10.2 — Target: BIM 3.0 Inspect Model architecture

The redesigned panel has **three tabs** — AUTHOR, INSPECT, DATA — each with a distinct purpose and a first-class architecture. The INSPECT tab is the most transformative: it is a spatial intelligence layer that connects model hierarchy, viewport isolation, and graphical data representation into a single coherent surface.

| Tab | Primary surface | What it does | Key features |
|---|---|---|---|
| **AUTHOR** | Element creation + parametric editing | Create and edit elements, set parameters, apply families, configure activity systems. Connects to BIM 2.0 Data Management Panel (D-α deliverables). | Parametric sliders, constraint indicators, family picker, room program editor, adjacency editor |
| **INSPECT** | Hierarchical model tree + isolation | Navigate the full model hierarchy. Select any node to isolate it in the viewport and see its data. Next-gen graphical dashboards. | Model tree, isolation mode, graphical data cards, room cards, building analytics |
| **DATA** | Live data layer + automation | Review all model data, run quality checks, update parameters in bulk, export data sets, schedule automation. | Data grid, filter/sort/group, bulk edit, quality rules engine, export to Excel/CSV/JSON/IFC Psets |

---

## §11 — INSPECT tab: detailed architecture

### 11.1 — Model tree hierarchy

The model tree follows the BIM 3.0 spatial hierarchy from the apartment generation work and the site/building schema. It is a lazy-loading tree that reflects the actual project structure in real time.

| Level | Node type | Icon | On select: isolation behaviour | On select: data panel |
|---|---|---|---|---|
| 0 | Project / Site | Globe | All models visible (no isolation) | Project metadata, location, area summary, IFC export status |
| 1 | Building | Building | Other buildings semi-transparent (30%) | Building GFA, floors, total rooms, element count, BCF issues |
| 2 | Level / Floor | Storey | Elements on other levels hidden; level plan highlighted | Floor area breakdown, room count per type, level elevation |
| 3 | Apartment / Unit | Home | Apartment isolated in colour; surrounding apartments semi-transparent (20%) | Apartment area, room breakdown, score card (cognition-stack objective vector) |
| 4 | Room / Space | Room-type icon | Room isolated full colour; everything else semi-transparent (15%) or hidden | Room area, dimensions, furniture inventory, daylight score, adjacency map |
| 5 | Element Type | Category icon | All elements of that type highlighted; others dimmed | Type stats: count, average area, min/max dimensions, compliance status |
| 6 | Element Instance | Element icon | Single element highlighted; everything else 10% opacity | Full element properties: geometry, parameters, Psets, IFC entity, history |

### 11.2 — Isolation mode engine

Isolation mode is driven by the existing `packages/visibility/` layer (P7). When a node is selected in the model tree, a visibility intent is dispatched that sets all non-selected elements to semi-transparent or hidden based on their spatial relationship to the selected node.

| Component | Package | Implementation | Status |
|---|---|---|---|
| `InspectSelectionStore` | `packages/stores/src/InspectSelectionStore.ts` (NEW) | Holds the currently inspected node `{ type, id, level }`. Subscribes to model-tree selection events. | PLANNED |
| `IsolationVisibilityIntent` | `packages/visibility/src/intents/IsolationIntent.ts` (NEW) | Generates per-element visibility overrides: `FULL` / `DIMMED(opacity)` / `HIDDEN` based on spatial relationship to selected node | PLANNED |
| `InspectToViewportBridge` | `apps/editor/src/engine/InspectBridge.ts` (NEW) | Listens to `InspectSelectionStore` → dispatches `IsolationVisibilityIntent` → triggers `scene-committer` refresh | PLANNED |
| `SpatialRelationshipResolver` | `packages/spatial-index/` (extension) | For a given selection, computes SELECTED / PARENT / SIBLING / CHILD / UNRELATED — drives the opacity tier | PLANNED |
| `IsolationAnimator` | `packages/renderer-three/` (extension) | Smooth fade transition (200ms) on isolation change. Uses `FrameScheduler` (P3). THREE material opacity. | PLANNED |

### 11.3 — Graphical data representation

> This is the "next-gen graphic with graphical data representation" requirement. When a user selects any node in the model tree, the data panel transforms from a text property list into a **rich visual dashboard appropriate to the node type**.

| Node selected | Primary graphic | Secondary graphics | Data cards |
|---|---|---|---|
| **Building** | Stacked floor-area bar chart (each storey) | Room type donut chart, element count by category | GFA, GIA, efficiency ratio, floor count, unit mix |
| **Level / Floor** | Colour-coded floor plan mini-map with room types | Area-breakdown sunburst, furniture density heatmap | Net area, gross area, circulation %, room count |
| **Apartment** | Apartment plan with room labels + area annotations | Score radar chart (daylight/privacy/circulation/furniture/topology) — from cognition-stack objective vector; adjacency diagram | Total area, room count, orientation, score breakdown |
| **Room** | Isolated 3D room view + 2D plan with furniture overlay | Daylight depth field (gradient), sightline graph (from L5-ε-1), area-vs-target gauge | Area, dimensions, aspect ratio, furniture inventory, windows count, adjacency list |
| **Element Type** | Count-over-levels bar chart | Distribution histogram (size/area), compliance pass/fail pie | Type count, average dimensions, unique variants, IFC compliance status |
| **Element Instance** | 3D element isolated with measurements | Material breakdown, parameter list with override indicators | All Psets, IFC entity type, geometry metrics, history/changelog |

### 11.4 — Inspect implementation plan

| Phase | Deliverable | Estimate | Contract | Status |
|---|---|---|---|---|
| **INS-α-1** | Model tree component: lazy-loading tree with Site/Building/Level/Apartment/Room/ElementType/Instance nodes. Reads from `ElementStore` + `RoomStore` + `ApartmentParametersStore` (D-α-1). Real-time update on model change. | 2 wk | C27 | PLANNED |
| **INS-α-2** | `InspectSelectionStore` + node selection dispatch. Bidirectional sync: select in tree → highlight in viewport; select in viewport → expand tree to node. | 1 wk | C27 | PLANNED |
| **INS-α-3** | `IsolationVisibilityIntent` + `InspectToViewportBridge`. Isolation mode v1: room-level. Selected room full opacity; everything else 20% opacity. | 1.5 wk | C27, P7 | PLANNED |
| **INS-α-4** | Isolation mode v2: full hierarchy. All six levels (project → instance) with appropriate opacity tiers. | 1 wk | C27 | PLANNED |
| **INS-α-5** | `IsolationAnimator`: 200ms smooth fade transition on selection change. Frame-budget tested (NFT 4 must hold). | 0.5 wk | C27, C04 | PLANNED |
| **INS-β-1** | Inspect data panel v1: **apartment node**. Apartment plan mini-map + score radar chart + area breakdown. Reads from `ApartmentParametersStore` + cognition-stack objective vector. | 2 wk | C27 | PLANNED |
| **INS-β-2** | Inspect data panel v2: **room node**. Isolated room view + daylight gradient + area gauge + furniture inventory list. | 2 wk | C27 | PLANNED |
| **INS-β-3** | Inspect data panel v3: **element instance**. 3D isolated view + full Pset tree + IFC entity display + parameter override indicators. | 1.5 wk | C27 | PLANNED |
| **INS-β-4** | Inspect data panel v4: **level / floor**. Floor plan mini-map with room colour-coding + area breakdown sunburst. | 1 wk | C27 | PLANNED |
| **INS-β-5** | Inspect data panel v5: **building**. Stacked floor-area bar + room type donut + element count by category. | 1 wk | C27 | PLANNED |
| **INS-γ-1** | `SpatialRelationshipResolver`: compute SELECTED/PARENT/SIBLING/CHILD/UNRELATED for any element relative to selected node. Performance: < 10 ms for 10k elements. | 1.5 wk | C27 | PLANNED |
| **INS-γ-2** | Adjacency diagram in room inspect panel: visual graph of room adjacencies with edge-type colours (SOCIAL_FLOW / INTIMATE_ACCESS / BUFFER from L3-γ semantic topology). | 1 wk | C27 | PLANNED |
| **INS-γ-3** | Sightline visualisation: overlay `SightlineGraph` (from L5-ε-1) on room inspect view. | 1 wk | C27 | PLANNED |
| **INS-γ-4** | Inspect mode keyboard shortcuts: `i` to enter, `Esc` to exit, arrow keys to navigate tree, `Enter` to drill, `Backspace` to ascend. | 0.5 wk | C27, C06 | PLANNED |

**Total Inspect effort**: ~17.5 weeks. Critical-path: α-1 → α-2 → α-3 → β-1 (6.5 wk minimum sequential).

---

# Part VI — DATA tab: Live Data Layer

## §12 — Purpose

The DATA tab provides **all the data in the project** in a single browsable surface for **check / automate / update / review**:

- **Check** — quality rules engine flags violations against constraint database (the 248+ rules) + new dimensional G-classes + topology A-classes.
- **Automate** — schedule automation: room schedules, door schedules, window schedules, finish schedules, electrical schedules, furniture schedules.
- **Update** — bulk parameter editing across many elements at once (e.g. "set FireRating=120min on all party walls").
- **Review** — export the entire data set to Excel / CSV / JSON / IFC Psets / SQL.

## §13 — DATA architecture

| Component | Package | Responsibility | Status |
|---|---|---|---|
| `DataStore` | `packages/stores/src/DataStore.ts` (NEW) | Active data view, filter/sort/group state, selection set | PLANNED |
| `DataEngine` | `packages/data-engine/` (NEW L3 package) | Quality rules engine, schedule generator, bulk-edit executor | PLANNED |
| Quality rules | `packages/data-engine/src/rules/` | Codified rules from constraint DB + cognition-stack G/A classes. Each rule = `(scope, predicate, severity, message)`. | PLANNED |
| Schedule templates | `packages/data-engine/src/schedules/` | Room schedule, Door schedule, Window schedule, Furniture schedule. Templates configurable. | PLANNED |
| Bulk-edit commands | `packages/command-bus/` (extension) | `data.bulkUpdate(filter, paramName, newValue)` — routed through commandBus (P6) | PLANNED |
| Data UI | `apps/editor/src/ui/data/` | Grid component (virtualised), filter chips, group-by selector, bulk-edit modal, export button | PLANNED |

## §14 — DATA phase plan

| Phase | Deliverable | Estimate | Contract | Status |
|---|---|---|---|---|
| **DAT-α-1** | `DataStore` + grid component (virtualised, 50k rows). Initial view: all elements in project. Columns: id, type, level, area, parameters. | 2 wk | C28 | PLANNED |
| **DAT-α-2** | Filter chips: by element type, level, apartment, room, parameter value. Multi-select. | 1 wk | C28 | PLANNED |
| **DAT-α-3** | Group-by: building / level / apartment / room / type / custom field. Hierarchical grid expansion. | 1 wk | C28 | PLANNED |
| **DAT-α-4** | Selection sync: select in grid → highlight in viewport (re-uses Inspect isolation engine). | 0.5 wk | C28, C27 | PLANNED |
| **DAT-β-1** | Quality rules engine v1: codify 50 highest-value rules from constraint DB. Run-on-demand + run-on-edit. Show violations grouped by severity. | 2.5 wk | C28 | PLANNED |
| **DAT-β-2** | Quality rules engine v2: add dimensional G-classes + topology A-classes from [APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md](APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md). | 1.5 wk | C28 | PLANNED |
| **DAT-β-3** | Bulk-edit: select N rows → "Edit parameter" → choose param → enter new value → preview → confirm. Routed through `data.bulkUpdate` command (single undo). | 1.5 wk | C28, C03 | PLANNED |
| **DAT-β-4** | Schedule generator v1: room schedule. Configurable columns. Live-update on model change. | 1 wk | C28 | PLANNED |
| **DAT-β-5** | Schedule generator v2: door + window + furniture schedules. Each with configurable column set. | 1.5 wk | C28 | PLANNED |
| **DAT-γ-1** | Excel / CSV export: data grid → `.xlsx` / `.csv`. Preserves grouping + filters. | 1 wk | C28 | PLANNED |
| **DAT-γ-2** | JSON export: full data set or filtered subset → JSON. Stable schema, versioned. | 0.5 wk | C28 | PLANNED |
| **DAT-γ-3** | IFC Pset export: data grid → `IfcPropertySet` injection into the IFC export pipeline. Custom Psets per row. | 1 wk | C28, C25 | PLANNED |
| **DAT-γ-4** | Data automation: scheduled checks via cron-like UI. Email summary if violations detected. | 2 wk | C28 | PLANNED |
| **DAT-γ-5** | SQL export to project DB: full element table → relational table for external BI tools (Tableau / PowerBI). | 1.5 wk | C28 | PLANNED |

**Total DATA effort**: ~18.5 weeks. Critical-path: α-1 → α-2 → β-1 → γ-3 (5.5 wk minimum sequential).

---

# Part VII — UI/UX Redesign

## §15 — Overall UI structure

The PRYZM editor UI is reorganised around **four primary surfaces** (each accessible via persistent navigation):

| Surface | Purpose | Replaces |
|---|---|---|
| **DESIGN** | Authoring viewport (3D + 2D plan, single-view + split-view). Manual + AI authoring co-exist. | Current main viewport (unchanged) |
| **INSPECT** | BIM 3.0 inspection surface (master tree + isolation + graphical dashboards). | Current Inspect panel (redesigned) |
| **DATA** | Live data layer (grid + automation + bulk-edit + export). | New |
| **SHEETS** | Sheet composition + drawing set + PDF/DWG export. | Current `plugins/export-pdf/` (replaced) |

A fifth meta-surface — **PROJECT** — owns the RAC chatbot, site definition, environments, sharing, billing.

## §16 — UI/UX phase plan

| Phase | Deliverable | Estimate | Status |
|---|---|---|---|
| **UX-α-1** | Persistent left-rail navigation: DESIGN / INSPECT / DATA / SHEETS / PROJECT. Active-surface highlight. Keyboard shortcut: `Cmd+1..5`. | 1 wk | PLANNED |
| **UX-α-2** | Tab strip per surface (e.g. inside INSPECT: Tree / Detail / History). Persistent state across surface switches. | 1 wk | PLANNED |
| **UX-α-3** | Site UI redesign: cream/warm-white map style (replace dark Cesium globe default) per Product Vision §5 Step 3. | 1.5 wk | PLANNED |
| **UX-α-4** | RAC chatbot UI: floating panel, full-screen mode, conversation history, brief-summary card. Per Product Vision §5 Step 2. | 2 wk | PLANNED |
| **UX-β-1** | INSPECT panel UI shell: master tree (left) + dashboard (right) + breadcrumb (top). | 1 wk | PLANNED |
| **UX-β-2** | DATA panel UI shell: filter chips (top) + virtualised grid (center) + detail rail (right). | 1 wk | PLANNED |
| **UX-β-3** | SHEETS panel UI shell: sheet list (left) + sheet canvas (center) + viewport list (right). | 1.5 wk | PLANNED |
| **UX-β-4** | Universal command palette: `Cmd+K` → fuzzy-search across commands, elements, rooms, sheets, parameters. | 2 wk | PLANNED |
| **UX-γ-1** | Inspector cards visual design pass (Apartment / Room / Element / etc.). Match Product Vision aesthetic. | 2 wk | PLANNED |
| **UX-γ-2** | Sheet editor visual design pass: title block editor, viewport drag handles, scale bar configurator. | 1.5 wk | PLANNED |
| **UX-γ-3** | Notification + status system: long-running export progress, AI generation progress, quality-check completion. | 1 wk | PLANNED |
| **UX-γ-4** | Accessibility audit: WCAG AA across all new surfaces; keyboard-only navigation tested end-to-end. | 1.5 wk | PLANNED |

**Total UI/UX effort**: ~17 weeks. Critical-path: UX-α-1 → UX-α-2 → UX-β-* (4 wk minimum sequential).

---

# Part VIII — Connection Map (Anti-Silo)

> **Doctrine**: every feature in this plan **must** connect to one or more existing strategic threads, OR explicitly justify its standalone status. No silos.

The diagram below shows the dependency / data-flow connections between every track in this plan and the existing strategic threads from prior docs.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    PRODUCT VISION V1 (00-Product-Vision)                   │
│         9 platform layers · RAC · Site-first · 248-rule database           │
└─────────────────────────────┬──────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        ▼                                           ▼
┌──────────────────────┐                  ┌─────────────────────────┐
│ 01-VISION (engineer) │                  │ 02-ARCHITECTURE (8-layer)│
│ 8 principles · 9 conv │                  │ L0..L7.5 · P1..P8 gates  │
└──────────┬───────────┘                  └────────────┬────────────┘
           └──────────────────────┬─────────────────────┘
                                  ▼
               ┌──────────────────────────────────┐
               │      C01–C30  (Contracts)         │
               │   C24/C25/C26/C27/C28/C29/C30 NEW │
               └────────┬──────────────────────────┘
                        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                            APARTMENT STACK                                 │
│  ┌──────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐  │
│  │ BIM 2.0/3.0 DATA MGMT│ │ COGNITION STACK     │ │ DIMENSIONAL+TOPOLOGY│  │
│  │   (D-α propagator)   │ │  (L1..L5 + objectVec)│ │  (G-class + A-class)│  │
│  └──────────┬───────────┘ └──────────┬──────────┘ └──────────┬──────────┘  │
│             │                        │                       │              │
│  ┌──────────┴────────────┐ ┌─────────┴──────────┐  ┌─────────┴──────────┐  │
│  │ FAMILY PLATFORM (P0)  │ │  GEOSPATIAL (PG0)  │  │ APARTMENT MASTER   │  │
│  │  FamilyRegistry · IFC │ │  Site/Climate/PII  │  │   F-tier · L-tier  │  │
│  └────────┬──────────────┘ └────────┬───────────┘  └─────────┬──────────┘  │
└───────────┼─────────────────────────┼────────────────────────┼─────────────┘
            │                         │                         │
            └──────────┬──────────────┴────────────────┬────────┘
                       ▼                               ▼
            ┌──────────────────────┐        ┌──────────────────────┐
            │   EXPORT INFRA       │        │   INSPECT + DATA     │
            │   IFC + Sheet + RVT  │        │   Tree + Isolation   │
            │                      │        │   + Dashboards + Grid│
            └──────────┬───────────┘        └──────────┬───────────┘
                       └───────────┬──────────────────┘
                                   ▼
                       ┌──────────────────────┐
                       │   USER DELIVERY      │
                       │   .pryzm · .ifc      │
                       │   .pdf · .dwg · .rvt │
                       └──────────────────────┘
```

## §17 — Connection table (per-feature anti-silo justification)

| Feature in this plan | Connects to (upstream) | Powers (downstream) | Silo risk |
|---|---|---|---|
| **IFC export (C25)** | C12 Geospatial (IfcSite); C15 Hosted (IfcWindow in IfcWall); APT-Family-Platform (IfcType library) | Revit round-trip; COBie; FM handover | LOW — heavily upstream-connected |
| **Sheet engine (C24)** | C04 rendering (uses FrameScheduler); APT-Cognition (sightline graph → section views); APT-Driving-Principles (room labels) | PDF export; DWG export; drawing-set management; Revit sheet round-trip | LOW |
| **Revit round-trip (C26)** | C25 IFC; C24 Sheets; APT-Family-Platform (RFA semantic) | Consultant hand-off; market positioning | MEDIUM — Python adapter lives outside monorepo, must stay in sync via mapping table |
| **Inspect Model (C27)** | APT-BIM-2.0/3.0 (parameter stores); APT-Cognition (objective vectors → radar); APT-Dimensional (G-classes → quality cards); C09 P7 visibility intent | Data tab selection sync; Sheet view picker | LOW — heavily upstream-connected |
| **Data tab (C28)** | APT-Dimensional+Topological (G/A classes → rules); APT-BIM-2.0/3.0 (parameter stores → grid); C25 IFC (Pset round-trip) | Quality reports; export to BI tools; bulk-edit | LOW |
| **PDF vector export (C29)** | C24 Sheet engine | Construction document delivery | LOW |
| **Drawing set (C30)** | C24 Sheet engine; C29 PDF | Revision register; transmittal package | LOW |
| **UI/UX redesign (UX-α/β/γ)** | All of the above | User-facing surface for every new capability | LOW — cuts across every feature |

## §18 — Anti-silo enforcement gates

To prevent regressions where new features land without integrating, the following CI gates are added:

| Gate | What it checks | Enforced by |
|---|---|---|
| **No new export path** | Any new file under `plugins/*-export/` or `packages/file-format/` must route through `ExportOrchestrator` and emit an OTel span | `tools/ga-gate/check-export-pipeline.ts` (NEW) |
| **No direct viewport-isolation** | Any new code that sets `mesh.material.opacity` directly fails CI. Must route through `IsolationVisibilityIntent`. | `tools/ga-gate/check-visibility-intent.ts` (NEW) |
| **No new model-tree** | Only one model-tree component permitted. Duplicate trees fail CI. | `tools/ga-gate/check-model-tree-count.ts` (NEW) |
| **No raster screenshot pretending to be a sheet** | `pdf-lib` produces vectors; any new "screenshot → PDF" code fails CI | `tools/ga-gate/check-vector-pdf.ts` (NEW) |
| **Contract presence** | Every new exported file must reference a C-contract in its top-of-file comment | extends existing contract-coverage check |

---

# Part IX — Master Phase Timeline

## §19 — Quarter-by-quarter overlay

The phase IDs below are sequenced to respect the dependency chain identified in [Part VIII](#part-viii--connection-map-anti-silo). Estimates are aggregated from each track's plan.

| Quarter | IFC | Sheet | Revit | Inspect | Data | UI/UX | Tests-target |
|---|---|---|---|---|---|---|---|
| **Q3 2026** (Jul–Sep) | α-1, α-2, α-3, α-4, α-5 | α-1, α-2 | — | α-1, α-2 | α-1 | UX-α-1, UX-α-2, UX-α-3 | ~1100 ai-host + 350 stores |
| **Q4 2026** (Oct–Dec) | β-1, β-2, β-3, β-4, β-5 | α-3, α-4, β-1 | α-1, α-2 | α-3, α-4, α-5, β-1 | α-2, α-3, α-4 | UX-α-4, UX-β-1, UX-β-2 | ~1300 + 450 |
| **Q1 2027** (Jan–Mar) | γ-1, γ-2, γ-3, γ-4 | β-2, β-3, β-4 | α-3, α-4, β-1 | β-2, β-3, β-4, β-5 | β-1, β-2, β-3 | UX-β-3, UX-β-4 | ~1500 + 550 |
| **Q2 2027** (Apr–Jun) | δ-1, δ-2, δ-3 | γ-1, γ-2, γ-3 | β-2, β-3, γ-1 | γ-1, γ-2, γ-3, γ-4 | β-4, β-5, γ-1, γ-2 | UX-γ-1, UX-γ-2 | ~1700 + 650 |
| **Q3 2027** (Jul–Sep) | — (closeout) | γ-4, δ-1, δ-2, δ-3 | γ-2, γ-3 | — | γ-3, γ-4, γ-5 | UX-γ-3, UX-γ-4 | ~1900 + 750 |

## §20 — Critical path summary

The plan's overall critical path is:

```
IFC-α-1  → IFC-α-2  → IFC-α-5  (5 wk)
    ↓
RVT-α-1  → RVT-α-2  → RVT-α-3 → RVT-β-1 (5.5 wk)
    ↓
SCE-α-1  → SCE-α-2  → SCE-α-3  → SCE-α-4 → SCE-β-2 (8.5 wk)
    ↓
INS-α-1  → INS-α-2  → INS-α-3  → INS-β-1 (6.5 wk)
    ↓
DAT-α-1  → DAT-α-2  → DAT-β-1  → DAT-γ-3 (5.5 wk)
    ↓
UX-β-2   → UX-β-3   → UX-γ-2   (5 wk)
```

Sequential critical path: **~36 weeks** (~9 months). With parallel tracks, the full plan compresses to **~12 months** (Q3 2026 → Q3 2027) assuming current multi-agent throughput is maintained.

## §21 — Dependency graph (textual)

```
IFC-α  ─┬──>  RVT-α  ─┬──>  RVT-β  ─┬──>  RVT-γ
        │             │             
        └──>  C25 PUBLISHED        
                                    
SCE-α ─┬──>  SCE-β  ─┬──>  SCE-γ  ─┬──>  SCE-δ
       │             │             │
       │             │             ├──>  C29 PUBLISHED
       │             │             └──>  C30 PUBLISHED
       │             │
       └──>  C24 PUBLISHED

INS-α ─┬──>  INS-β  ─┬──>  INS-γ
       │             │
       └──>  C27 PUBLISHED

DAT-α ─┬──>  DAT-β  ─┬──>  DAT-γ
       │             │
       └──>  C28 PUBLISHED

DAT-β requires INS-α (selection sync via Inspect store)
DAT-γ requires IFC-β (Pset infrastructure)
SCE-γ requires INS-β (Section/elevation view selection)
RVT-α-4 requires SCE-α (sheet schema)
```

---

# Part X — Risk Register & Open Questions

## §22 — Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **IFC4X3 schema validator throughput** — running `ifc-validator` on every CI build may slow CI 2–4x | MEDIUM | Run validator on `IFC-α-5` gate-protected branch only; non-IFC PRs skip. |
| **Revit Python adapter ecosystem fragility** — Revit API changes between versions; adapter must support 2024 / 2025 / 2026 | HIGH | Maintain version-pinned adapter releases; defer adapter to RVT-β-2 (4 wk dedicated). |
| **Sheet renderer P2 leakage** — temptation to use THREE for sheet preview is high; would violate single-THREE-owner rule | MEDIUM | Sheet renderer is canvas-2D or SVG only; CI gate `check-three-imports` already prevents. |
| **Inspect isolation animator frame stutter** — fading 10k+ elements at once may blow frame budget | MEDIUM | Stagger fade by spatial cluster (close elements first); cap concurrent animations; benchmark on `frame-budget.bench.ts`. |
| **Data grid virtualisation at 100k+ rows** — DOM-heavy grids choke on selection sync | MEDIUM | Use proven virtualisation library (`@tanstack/virtual`); test at 100k rows in early α. |
| **DWG export entity-mapping incompleteness** — AutoCAD's entity model is large and quirky | MEDIUM | Scope DWG to subset of entities used by sheets (lines, polylines, text, hatches). Defer 3D solids. |
| **Master-tree performance at 50k+ elements** — lazy-loading must work | LOW | Tree virtualises children (only render expanded branches); benchmark in INS-γ-1. |
| **Quality rules engine combinatorial explosion** — running 200+ rules on every edit is expensive | MEDIUM | Run rules in three tiers: on-edit (10 fast rules), on-save (50 rules), on-demand (all rules). |

## §23 — Open questions

The following questions are deferred to the relevant α-phase:

1. **Sheet engine: 2D canvas vs SVG?** SVG simplifies vector PDF (1:1 mapping). Canvas-2D simplifies raster preview. Likely answer: SVG for the master layer, canvas-2D for the live preview overlay. To decide in SCE-α-3.
2. **Inspect tree: server-rendered or client-rendered?** Server-rendered scales to 1M+ elements but adds latency. Client-rendered is simpler. Likely answer: client-rendered with virtualisation up to 200k elements; server fallback above. To decide in INS-α-1.
3. **Data grid columns: schema-driven or user-configurable?** Schema-driven is consistent. User-configurable is flexible. Likely answer: both — schema defines defaults, user overrides persist per project. To decide in DAT-α-1.
4. **Revit adapter: pure Python or Revit-API + IronPython?** Pure Python is portable but limited; IronPython has full Revit COM access but Windows-only. Likely answer: IronPython (Windows-only is the user reality for Revit). To decide in RVT-β-2.
5. **PDF/A-3 vs PDF/A-2 for archival?** PDF/A-3 allows embedded files (perfect for embedding the source IFC). PDF/A-2 is more widely supported. Likely answer: PDF/A-3 (the IFC-embed is the differentiator). To decide in SCE-β-2.

## §24 — Decision log

| Date | Decision | Rationale | Reference |
|---|---|---|---|
| 2026-05-31 | This master plan supersedes any previous siloed PDF/IFC/Inspect plans. | Anti-silo doctrine; one source of truth. | This doc §0. |
| 2026-05-31 | New contracts C24–C30 are authored as stubs, filled in during their respective α-phases. | Avoid contract-bloat before scope is grounded. | This doc Part III. |
| 2026-05-31 | Revit round-trip uses IFC4 as the canonical bridge; Python adapter is optional. | Avoids dependency on Revit COM API for the core round-trip. | This doc §9.1. |
| 2026-05-31 | Sheet engine is canvas-2D / SVG only; NOT THREE-based. | Preserves P2 (single THREE owner). | This doc §3.1 row 3. |
| 2026-05-31 | Inspect isolation routes through `packages/visibility/` (P7), not a parallel UI flag. | Preserves P7 (visibility intent is a domain concept). | This doc §11.2. |

---

# Part XI — Source documents and provenance

This master plan is built on top of the following canonical documents. Conflicts resolved in the order listed (first wins):

| Order | Doc | Role |
|---|---|---|
| 1 | [00-PRODUCT-VISION-AND-BUSINESS-STRATEGY-V1.md](00-PRODUCT-VISION-AND-BUSINESS-STRATEGY-V1.md) | Product + business vision (this is the new foundation doc) |
| 2 | [01-VISION.md](01-VISION.md) | Engineering vision (8 principles, 9 convergence booleans) |
| 3 | [02-ARCHITECTURE.md](02-ARCHITECTURE.md) | 8-layer model + governance |
| 4 | [docs/00_Contracts/C01..C30](../00_Contracts/) | C-contracts (C01–C23 existing; C24–C30 NEW — drafted with this plan) |
| 5 | [APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md](APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md) | Parameter stores + propagator (D-α series) — load-bearing for Inspect + Data |
| 6 | [APARTMENT-COGNITION-STACK-AND-IMPLEMENTATION-PLAN-2026-05-29.md](APARTMENT-COGNITION-STACK-AND-IMPLEMENTATION-PLAN-2026-05-29.md) | 7-layer cognition stack; objective vectors feed Inspect radar charts |
| 7 | [APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md](APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md) | G-class + A-class validators — feed Data tab quality rules |
| 8 | [APARTMENT-DRIVING-PRINCIPLES-AND-ROOM-ELEMENT-MATRIX-2026-05-29.md](APARTMENT-DRIVING-PRINCIPLES-AND-ROOM-ELEMENT-MATRIX-2026-05-29.md) | Room driving principles — feed Inspect room cards |
| 9 | [APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md](APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md) | FamilyRegistry — feeds IFC export type system + Revit family translation |
| 10 | [PRYZM-GEOSPATIAL-FOUNDATION-AND-SITE-INTELLIGENCE-REVIEW.md](PRYZM-GEOSPATIAL-FOUNDATION-AND-SITE-INTELLIGENCE-REVIEW.md) | Site-consumer scope (apartment) |
| 11 | [PRYZM03-GEOSPATIAL-FOUNDATION-REVIEW.md](PRYZM03-GEOSPATIAL-FOUNDATION-REVIEW.md) | Platform-level geospatial — feeds IFC `IfcSite` + `IfcMapConversion` |
| 12 | [APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN-2026-05-29.md](APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN-2026-05-29.md) | Apartment furniture-implementation status — superset live tracker (this master plan defers to it for F/L/D-tier execution detail) |
| 13 | [APARTMENT-STATUS-DASHBOARD-2026-05-30.md](APARTMENT-STATUS-DASHBOARD-2026-05-30.md) | Single-page status |

### §25 — Authoring credit

Authored 2026-05-31 in response to the user direction:

> "we are focussing on PRYZM_VISION_DOCUMENT.ms - with the help of contextural other documents - add deliverables - export to ifc - pdf (view/sheet - needs to be architecturally sound - which is not today) round trip to revit natively in and out /// make sure that the scope is end-to-end - including contracts review - audit - documentation - master architecture review - audit documentation - same with vision - ui/ux review audit - documentation and implementation plan - everything needs to come together to the same master implementation plan - everything needs to connect - no lost silos areas - no lost silos features - everything has a purpose and everything is connected - the author / inspect / data section needs to be completely redesigned - inspect will be to inspect the data on the model - user could select from the master tree - floor plans - building - apartments - rooms - elements type - and get graphic next-gen graphs with graphical data representation - eg. if user select a room - the room isolate with the rest of the model semi transparent - or nothing apart from the room shows - same for the rest - it is a BIM 3.0 inspect model - the data tab is provides all the data in project to check - automate - update - review"

— and "include this" with the PRYZM Product Vision V1 document pasted in full (now canonical at [00-PRODUCT-VISION-AND-BUSINESS-STRATEGY-V1.md](00-PRODUCT-VISION-AND-BUSINESS-STRATEGY-V1.md)).
