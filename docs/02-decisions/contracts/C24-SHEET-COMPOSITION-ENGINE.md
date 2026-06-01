# C24 — Sheet Composition Engine

> **Stamp**: 2026-05-31 · **Status**: DRAFT
> **Scope**: governs the existing `plugins/sheets/` (PRYZM 2 S37 / Phase 2C / ADR-0031) plus the gap-fill work to migrate it under the PRYZM 3 8-layer model. Codifies invariants for `SheetStore`, sheet handlers, viewports, title blocks, widgets, book/sheet-set, and the rendering pipeline that produces vector output.
> **Depends on**: [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md), [C04](C04-RENDERING-AND-SCHEDULING.md), [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md), [C06](C06-UI-SHELL-AND-TOOLS.md), [C16](C16-COMMAND-AUTHORING-PROTOCOL.md).
> **Downstream**: [C29](C29-PDF-VECTOR-EXPORT.md) (PDF vector backend), [C30](C30-DRAWING-SET-MANAGEMENT.md) (sheet set / revision), [C26 §5](C26-REVIT-ROUND-TRIP.md) (Revit sheet translation).
> **Key principles**: **P2** (sheet renderer must NOT import THREE), **P3** (subscribes to FrameScheduler — no direct rAF), **P5** (sheet schemas pure), **P6** (commands are the only mutation path), **P8** (every sheet operation emits an OpenTelemetry span).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md §8](../03-execution/plans/master-implementation-plan.md), as corrected by [Part 0](../03-execution/plans/master-implementation-plan.md#part-0--prior-art-audit-amendment-2026-05-31).
> **Prior-art**: [PRYZM3-PRIOR-ART-AUDIT-2026-05-31.md §3.1](../03-execution/status/prior-art-audit-2026-05-31.md). The PRYZM 2 reference ADR is ADR-0031.

---

## §1 — Invariants

### §1.1 — Sheet is a first-class entity

A **Sheet** is a typed first-class entity, stored in `SheetStore` and round-tripped via the `.pryzm` file format ([C05](C05-PERSISTENCE-AND-FILE-FORMAT.md)). It has:

- A paper size (`A0`–`A6` / `LETTER` / `TABLOID` / `ARCH_D` / custom).
- An orientation (`PORTRAIT` / `LANDSCAPE`).
- A scale (printed-to-real ratio; `1:50` / `1:100` / etc.).
- A drawing frame (border + title block + scale bar + north arrow).
- One or more **ViewPorts**, each rendering a named **View** at a specified scale.
- A title-block metadata block (project name, drawing title, date, author, revision).
- An ordered set of **widgets** (legend, scale bar, north arrow, revision table, BIM tag, schedule snapshot, image, line, region).

This shape is **already implemented** in `plugins/sheets/` per PRYZM 2 S37. This contract codifies the invariants going forward; it does not require re-implementation.

### §1.2 — The sheet renderer is P2-compliant

The sheet canvas renderer MUST be **canvas-2D, SVG, or `packages/drawing-primitives/` multi-backend** — NOT THREE. It MUST NOT `import * as THREE` and MUST NOT create THREE.js objects directly. The 3D viewport's contents (when a sheet contains a 3D view) are obtained as a vector / wireframe extract via the `packages/scene-committer/` 2D projection cache.

**Current state**: `plugins/sheets/src/sheet-editor-host.ts` is the existing Canvas2D editor host. Audit it for THREE leakage; the audit-time spot-check shows none. Going forward, the CI gate `tools/ga-gate/check-three-imports.ts` MUST be extended to cover `plugins/sheets/`.

### §1.3 — Sheet rendering subscribes to the frame bus

The sheet canvas runs an interactive preview loop. It MUST subscribe to `FrameScheduler.onFrame` at the `render` priority tier — it MUST NOT call `requestAnimationFrame` directly. This preserves P3.

**Current state**: `plugins/sheets/src/sheet-editor-host.ts` uses Canvas2D draw cycles. Audit for rAF compliance; if it calls `requestAnimationFrame` directly, migrate to FrameScheduler.

### §1.4 — Mutation flows through commands

All sheet state changes MUST be authored as commands per [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) and dispatched through `commandBus`. UI code MUST NOT mutate `SheetStore` directly. **Current state**: `plugins/sheets/src/handlers/*.ts` (11+ handlers) already follow this pattern. Audit confirms — no new contract violation.

### §1.5 — Round-trip with .pryzm and IFC

A Sheet placed into a `.pryzm` file MUST round-trip losslessly via the file format ([C05](C05-PERSISTENCE-AND-FILE-FORMAT.md)). A Sheet exported to IFC4 MUST land as an `IfcAnnotation` collection inside an `IfcGroup` of type `Sheet` (see [C25 §7](C25-IFC-EXPORT-PRODUCTION.md)).

### §1.6 — One sheet renderer

Only one sheet renderer SHALL exist. Multiple parallel renderers (e.g. a separate PDF render path that bypasses the canvas) is a CI violation. The drawing-primitives multi-backend (`packages/drawing-primitives/src/backends/`) is the SINGLE rendering substrate that fans out to Canvas2D / SVG / PDF / Print-Canvas.

---

## §2 — Schema (existing + extensions)

### §2.1 — Sheet schemas already exist in `plugins/sheets/src/`

The schemas (Sheet, Viewport, TitleBlock, Widgets) are currently defined inside `plugins/sheets/src/` (Zod schemas + TypeScript types). They are NOT in `packages/schemas/`.

**Required migration (per P5)**: move the Sheet schemas into `packages/schemas/src/sheet/` (L0). The plugin then re-exports them. This satisfies P5 (schemas pure) and the L0-purity CI gate.

### §2.2 — Schemas (target structure in `packages/schemas/src/sheet/`)

| Schema | Owns |
|---|---|
| `SheetDefinition` | id, name, paperSize, orientation, scale, viewports, drawingFrame, titleBlock, revisionHistory, widgets, createdAt, updatedAt |
| `ViewPort` | id, sheetId, viewId, positionOnSheet, sizeOnSheet, scale, rotation, clipRegion, labelText, labelPosition |
| `DrawingFrame` | borderMargins, borderWeight, borderStyle, framedRegion |
| `TitleBlock` | position, dimensions, fields (label/value/font/alignment), logoSlot |
| `RevisionRow` | revisionId, date, description, author, status (`draft`/`issued`/`superseded`), scope |
| `ScaleBar` | position, length, divisions, labels, style |
| `NorthArrow` | position, size, trueNorthRotation, style |
| `Widget` (discriminated union) | one of: `Text`, `Image`, `Legend`, `ScaleBar`, `NorthArrow`, `RevisionTable`, `BimTag`, `ScheduleSnapshot`, `Line`, `Region` |

### §2.3 — Type constraints (CI-enforced)

- `ViewPort.scale` MUST be a positive finite number.
- `ViewPort.positionOnSheet` + `ViewPort.sizeOnSheet` MUST fit within `DrawingFrame.framedRegion` — validators reject otherwise.
- `RevisionRow.status` transitions: `draft → issued → superseded` (one-way).
- `TitleBlock.fields` MUST include at minimum: `projectName`, `drawingTitle`, `scale`, `date`, `sheetNumber`.

---

## §3 — Commands

The existing PRYZM 2 handlers are already named per the pattern below. This contract codifies the names for future authors:

| Command | Status | Effect |
|---|---|---|
| `sheet.create` | EXISTS (CreateSheet handler) | Insert a new `SheetDefinition` into `SheetStore` |
| `sheet.delete` | EXISTS | Remove a sheet (cascades to viewports + widgets) |
| `sheet.rename` | EXISTS | Update sheet name / number |
| `sheet.reorder` | EXISTS | Reorder sheets in the project |
| `sheet.addViewport` | EXISTS | Insert a new `ViewPort` |
| `sheet.removeViewport` | EXISTS | Remove a viewport |
| `sheet.setViewportScale` | EXISTS | Update viewport scale (paper:real) |
| `sheet.setTitleBlock` | EXISTS | Patch title-block field values |
| `sheet.setSheetMetadata` | EXISTS | Update sheet metadata block |
| `sheet.addWidget` | EXISTS | Add a widget |
| `sheet.removeWidget` | EXISTS | Remove a widget |
| `sheet.export.pdf` | **NEW (C29)** | Export sheet to PDF via vector backend |
| `sheet.export.dwg` | **NEW** | Export sheet to DXF |
| `sheet.duplicate` | **NEW** | Clone a sheet (new id, copy viewports + widgets) |

All commands open an OTel span per P8. Span name: `pryzm.sheet.<verb>`.

---

## §4 — What this contract governs (existing implementation + gap-fill)

### §4.1 — Existing implementation (governed, not rebuilt)

| Component | Path | PRYZM 2 ref |
|---|---|---|
| `SheetStore` | `plugins/sheets/src/store.ts` | S37 |
| 11+ handlers | `plugins/sheets/src/handlers/` | S37 |
| Canvas2D editor host | `plugins/sheets/src/sheet-editor-host.ts` | S37 |
| Viewport manager | `plugins/sheets/src/viewport.ts` | S37 |
| Title block | `plugins/sheets/src/title-block.ts` | S37 |
| View renderer | `plugins/sheets/src/view-renderer/` | S37 |
| Widgets (6 types) | `plugins/sheets/src/widgets/` | S37 |
| Book exporter | `plugins/sheets/src/book/book-exporter.ts` | S37 |
| Tracing (P8 spans) | `plugins/sheets/src/tracing.ts` | S37 |
| Drawing primitives Canvas2D | `packages/drawing-primitives/src/backends/canvas2d.ts` | ADR-0029 |

### §4.2 — Gap-fill scope (the actual NEW work)

| Gap | Action | Estimate | Depends on |
|---|---|---|---|
| Schemas in L0 | Move sheet schemas from `plugins/sheets/src/` to `packages/schemas/src/sheet/` and re-export | 0.5 wk | P5 audit |
| Vector PDF backend | Fill `packages/drawing-primitives/src/backends/pdf.ts` typed stub | 2 wk | C29 |
| DXF backend | Fill `packages/drawing-primitives/src/backends/dxf.ts` (or new module) | 2 wk | — |
| Sheet UI in editor | New `apps/editor/src/ui/sheets/` panel | 2 wk | UX-β-3 |
| Dimensions in sheets | Integrate `plugins/dimensions/` output into sheet rendering | 1 wk | — |
| Annotations in sheets | Integrate `plugins/annotations/` output into sheet rendering | 1 wk | — |
| Section/elevation viewports | Light up `plugins/section-view/` skeleton at S37/S38 | 2 wk | section kernel |
| Detail views | Magnified extract from parent view | 1 wk | — |
| FrameScheduler audit | Verify `sheet-editor-host.ts` subscribes to FrameScheduler (no direct rAF) | 0.5 wk | P3 |
| THREE-import audit | Verify no THREE leakage in `plugins/sheets/` | 0.2 wk | P2 |

**Total gap-fill effort: ~12 wk**. Master plan §0.3 quotes ~10 wk after factoring in audit overlap.

---

## §5 — DWG / DXF export

DWG (binary AutoCAD) is OUT of scope for this contract. **DXF (text-based ASCII)** is the canonical CAD interchange. Mapping table:

| SVG / drawing-primitive | DXF entity |
|---|---|
| `line` | `LINE` |
| `polyline` | `LWPOLYLINE` |
| `path` (arcs) | `SPLINE` / `ARC` per segment |
| `text` | `TEXT` / `MTEXT` |
| `rect` | `LWPOLYLINE` (closed) |
| `circle` | `CIRCLE` |
| `hatch` | `HATCH` |

DXF layers per element category: `A-WALL`, `A-DOOR`, `A-WIND`, `A-FLOOR`, `A-FURN`, `A-DIMS`, `A-TEXT`, `A-GRID`, `A-SECT`, `DEFPOINTS`.

Compatibility target: AutoCAD 2018+, AutoCAD LT, BricsCAD, DraftSight. XREF-compatible.

---

## §6 — NFT targets

| NFT | Target | Bench |
|---|---|---|
| Sheet re-render after edit | < 200 ms p95 | `sheet-render.bench.ts` (new) |
| Sheet open (cold) | < 500 ms p95 | `sheet-open.bench.ts` (new) |
| Single-sheet PDF export (A1, 10k vector elements) | < 3 s | delegated to [C29](C29-PDF-VECTOR-EXPORT.md) |
| Single-sheet DXF export | < 1.5 s | `dxf-export.bench.ts` (new) |
| Sheet list panel render at 100 sheets | < 100 ms | `sheet-list.bench.ts` (new) |

---

## §7 — CI gates

| Gate | What it checks | Implementation |
|---|---|---|
| Sheet renderer P2 | No THREE imports in `plugins/sheets/` or `packages/sheet-renderer/` | extend `tools/ga-gate/check-three-imports.ts` |
| Sheet schemas purity | No I/O / DOM / THREE in `packages/schemas/src/sheet/` | extend `tools/ga-gate/check-schema-purity.ts` |
| Vector-only export | No raster fallback in sheet PDF / DXF pipeline | `tools/ga-gate/check-vector-pdf.ts` (NEW — owned by [C29](C29-PDF-VECTOR-EXPORT.md)) |
| Commands-only mutation | UI dispatches via `commandBus` | extend `tools/ga-gate/check-direct-store-writes.ts` |
| Contract presence | Every new exported file in sheet path cross-links to C24 | extend contract-coverage check |
| One sheet renderer | No parallel render implementations | new check `check-single-sheet-renderer.ts` |

---

## §8 — What is NOT in this contract

- **PDF vector emission details** — [C29](C29-PDF-VECTOR-EXPORT.md). C24 owns the canvas; C29 owns the PDF writer.
- **Drawing set / multi-sheet revision tracking / transmittal** — [C30](C30-DRAWING-SET-MANAGEMENT.md). C24 owns a single sheet; C30 aggregates.
- **Revit sheet round-trip** — [C26 §5](C26-REVIT-ROUND-TRIP.md).
- **3D viewport content** — [C04 §3](C04-RENDERING-AND-SCHEDULING.md). C24 consumes its 2D projection cache.
- **Section / elevation cut-plane mechanics** — `packages/geometry-kernel/` + `plugins/section-view/`. C24 consumes their output.
- **Print driver / plotter calibration** — future C-contract on physical-print infrastructure.
- **The plan-view 2D rendering pipeline (interactive editing viewport)** — [C06 §4](C06-UI-SHELL-AND-TOOLS.md). C24 reads its output.

---

*End — C24 Sheet Composition Engine, 2026-05-31.*
