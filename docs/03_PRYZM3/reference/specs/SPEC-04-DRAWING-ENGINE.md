# SPEC-04 — Drawing Engine, Plan View, Sections, View Templates

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead |
| Closes | `CRITICAL-REVIEW-2026-04-27.md §B4` |
| Phases | 2B (plan view rebuild), 2C (sheets/schedules), 3B (export pipeline) |
| Required ADRs | ADR-016 (drawing-engine architecture) |

> The drawing engine is what wins or loses D8 (desktop-CAD documentation parity). This spec defines the vector primitive layer, the three back-ends (Canvas2D for screen, SVG for in-browser export, native PDF for high-fidelity print), the view template / view-range / view-filter model, hidden-line classification, and the label-placement strategy.

---

## §1 Architecture overview

```
                                      View Templates  ──┐
                                      View Filters    ──┤
                                      VG Overrides    ──┤   (data — L1 stores)
                                                        │
   L4 kernel ─── projection ──── classified primitives ─┴─→ L5 drawing-primitives ──┬─→ Canvas2D back-end (screen)
   (analytic geometry)         (Cut/Beyond/Hidden/Sym)    (vector model)            ├─→ SVG back-end (in-browser export)
                                                                                    └─→ PDF back-end (high-fidelity print)
```

- **L4 kernel** produces analytic geometry per element (centerline, boundary).
- **Edge-projection module** (in `packages/geometry-kernel/edge-projection/`) classifies primitives into Cut, Beyond, Hidden, Symbolic per a view definition.
- **Drawing-primitive layer** (`packages/drawing-primitives/`) is the **single vector model**: lines, polygons, arcs, hatches, text, symbols. All three back-ends consume it.
- **View definition** carries the camera + clip + scale + view template + filters + per-element overrides.
- **Renderers** are plug-replaceable; same primitives → three outputs.

ADR-016 ratifies this architecture before S29.

---

## §2 The drawing-primitive vector model

### §2.1 Primitive types
```ts
type Primitive =
  | Line   { from: Point2, to: Point2, style: StrokeStyle }
  | Polyline { points: Point2[], style: StrokeStyle, closed: bool }
  | Arc    { center: Point2, radius: number, startAngle, endAngle, style: StrokeStyle }
  | Polygon { outer: Point2[], holes: Point2[][], fill: HatchStyle | SolidFillStyle | null, stroke: StrokeStyle | null }
  | Text   { anchor: Point2, content: string, style: TextStyle, rotation }
  | Symbol { anchor: Point2, kind: SymbolKind, scale: number, rotation, style: SymbolStyle };
```

### §2.2 Stroke style
```ts
type StrokeStyle = {
  layer: ISO13567Layer,            // ISO-13567 layer id, drives default colour/weight
  weightMm: number,                // physical pen weight at 1:1
  color: RGB | 'byLayer',
  dash: 'solid' | 'dashed' | 'dotted' | 'centerline' | 'phantom',
  dashPhase: number,               // mm, preserved across edits and exports
  zOrder: number,                  // stable ordering across renderers
};
```

### §2.3 Hatch style (closes B4 gap "section hatch / poche")
```ts
type HatchStyle =
  | { kind: 'predefined', name: 'concrete' | 'brick' | 'insulation-batt' | 'insulation-rigid' | 'sand' | 'gravel' | 'wood' | 'earth', scale: number, rotation: number }
  | { kind: 'lines', spacing: number, angle: number, weightMm: number, color: RGB }
  | { kind: 'crosshatch', spacing: number, angles: [number, number], weightMm: number, color: RGB }
  | { kind: 'solid', color: RGB };
```

Hatch alignment: hatches MUST be aligned to the **element's local coordinate system**, not the view origin. Two adjacent walls of the same type must produce continuous hatching across their shared edge. Implemented by `hatch-aligner.ts` in `packages/drawing-primitives/`.

### §2.4 Text style
```ts
type TextStyle = {
  family: 'sans' | 'serif' | 'mono' | string,
  sizeMm: number,
  weight: 100..900,
  italic: bool,
  align: 'left' | 'center' | 'right',
  baseline: 'top' | 'middle' | 'bottom',
  underline: bool,
};
```

PDF and SVG back-ends embed real fonts. Canvas2D back-end uses the system-installed equivalent and emits a warning if the font is unavailable.

### §2.5 Symbol kinds
- Door swing arc (single, double, sliding, pocket).
- Window plan glyph.
- North arrow.
- Section mark.
- Elevation mark.
- Detail callout.
- Grid bubble.
- Level marker.
- Revision triangle.

Each is a vector path stored once and instanced.

---

## §3 Back-ends

### §3.1 Canvas2D back-end (`packages/drawing-canvas2d/`)
- Screen-only. Used by plan view and section/elevation viewports.
- Anti-aliased via device-pixel-ratio scaling.
- Draws primitives in `zOrder`, then `layer`, then insertion order.
- Hairline minimum: 0.25 px after AA.
- Hit-testing: each primitive carries an `elementId`; the back-end maintains a spatial index for cursor picking.
- Cost: < 16 ms for a 5,000-element view at 1920×1080.

### §3.2 SVG back-end (`packages/drawing-svg/`)
- In-browser export.
- One `<g>` per ISO-13567 layer; one `<path>` per primitive.
- Hatches via SVG `<pattern>`.
- Text via real `<text>` (selectable, copy/pasteable in viewers).
- Output is dimensionally exact (mm units, `viewBox` set to drawing extent).

### §3.3 PDF back-end (`packages/drawing-pdf/`)
- Native PDF writer using `pdf-lib`. **No** `print-to-PDF` round-trip via the browser.
- Embedded fonts (subset on export).
- Vector everywhere; no raster fallback for primitives.
- Layers exported as PDF Optional Content Groups (OCG) — viewer-toggleable.
- Hatches as PDF tiling patterns.
- Output passes Adobe Acrobat preflight (PDF/A-2b conformance for archive sheets; PDF 1.7 for print).

### §3.4 DXF export (`packages/drawing-dxf/`)
- For interop with non-PRYZM CAD.
- One LAYER per ISO-13567 layer.
- Polylines as LWPOLYLINE; arcs as ARC; hatches as HATCH with predefined patterns.
- Round-trips: PRYZM → DXF → AutoCAD opens cleanly with same layers and colours.

---

## §4 Hidden-line classification (closes B4 gap "hidden-line quality")

Per element per view, the edge-projection module classifies every edge into one of four roles:

| Role | Source | Default style |
|---|---|---|
| **Cut** | Edges produced by the cut plane intersecting the element. | Heavy (0.5 mm), solid, top zOrder. |
| **Beyond (Visible)** | Edges of geometry past the cut, visible from view direction. | Medium (0.25 mm), solid. |
| **Hidden** | Edges of geometry past the cut, occluded by other geometry. | Light (0.13 mm), dashed. |
| **Symbolic** | 2D plan symbols (door swings, window glyphs, north arrow). | Per symbol style. |

### §4.1 Algorithm
1. For each element in view, project edges to the view plane.
2. Classify each edge as Cut / Beyond / Symbolic by its 3D position vs the cut plane.
3. For Beyond edges, run depth-sort against all other Beyond geometry in the view; classify occluded as Hidden.
4. Apply VG override (per layer / per element / per view template).
5. Coalesce co-linear same-style edges.
6. Emit primitives.

### §4.2 Performance
Must run < 100 ms for a 5,000-element view (Phase 2B bench). Cached per `(viewId, elementId, analyticHash)` in an L3 projection.

### §4.3 What it is not
- Not photoreal hidden-line removal of curved surfaces (no NURBS in v1).
- Not silhouette extraction with crease angle thresholds (post-GA).

---

## §5 View templates (closes B4 gap "no view templates")

### §5.1 Model
A **view template** is a named, reusable bundle of:
- Scale (1:50, 1:100, …).
- Detail level (Coarse / Medium / Fine).
- View range (cut-plane Z, view depth, top-clip, bottom-clip).
- VG (Visibility / Graphics) overrides per layer.
- View filter list (per-element overrides driven by element parameters).
- Annotation visibility flags (dimensions, tags, text notes).
- Phase filter (which construction phase is shown).

Stored as L1 store `viewTemplateStore: Map<TemplateId, ViewTemplate>`.

### §5.2 Inheritance
- A view may **bind** to a template. Edits to the template propagate to all bound views.
- Per-view overrides are stored as a *patch* on top of the template; visible in the property panel as "modified from template" badges.
- A view may detach from its template (snapshot the resolved values).

### §5.3 Distribution
- Templates ship in starter projects.
- Templates can be exported / imported via `.pryzm-templates.json` sidecar files.
- Template marketplace post-GA (D4).

### §5.4 What "matches Revit" means
Revit ships a comprehensive template ecosystem. PRYZM v1 (M36 GA) ships:
- 8 architectural templates (Plan 1:50, Plan 1:100, RCP, Section, Elevation, Site, Demo, As-Built).
- 4 structural templates.
- 4 MEP templates (post-GA actually; M36 GA ships only the architectural).

This is the **honest** D8 commitment. The earlier "Matches Revit" claim is downgraded in `09-AS-IS §C` competitive matrix.

---

## §6 View range & cut plane

```ts
type ViewRange = {
  topClip: { reference: 'level' | 'world', offset: number },
  cutPlane: { reference: 'level' | 'world', offset: number },
  bottomClip: { reference: 'level' | 'world', offset: number },
  viewDepth: { reference: 'level' | 'world', offset: number },   // for "beyond" classification
};
```

- Default Plan: cut at Level + 1.2 m, top at Level + 2.4 m, bottom at Level − 0.3 m.
- Default RCP: cut at Level + 2.4 m looking down, mirrored.
- Cut-plane stability across edits: when a level changes elevation, view ranges re-compute deterministically; existing views do not "drift."

---

## §7 View filters

A view filter selects elements by parameter and applies overrides:

```ts
type ViewFilter = {
  id: FilterId,
  selector: { type?: ElementType, parameters?: ParameterMatch[] },
  override: {
    visible: bool,
    cutStyle?: StrokeStyle,
    beyondStyle?: StrokeStyle,
    hiddenStyle?: StrokeStyle,
    fillStyle?: HatchStyle,
    halftone: bool,
    transparency: 0..100,
  },
};
```

Examples:
- "Show only fire-rated walls in red" — selector: `Wall WHERE fireRating IN ('60min','90min','120min')`; override: `cutStyle.color = red`.
- "Hide demolished elements" — selector: `phase = 'demolition'`; override: `visible: false`.

Filters compose: order matters (top filter wins). UX: drag-to-reorder; per-view filter list.

---

## §8 Label placement (closes B4 gap "force-directed labels deferred to Phase 3")

### §8.1 v1 (Phase 2C) — rule-based
- Dimensions placed at the user-specified offset; no auto-routing.
- Tags placed at element centroid + offset; no collision avoidance.
- Trade-off: simple, predictable, sometimes overlapping.

### §8.2 v2 (Phase 3B) — force-directed
- Each label has a target anchor (e.g. element centroid) and a placed position.
- Force model: spring back to anchor; repulsion from other labels; repulsion from element silhouettes; stay within sheet margins.
- Run incremental relaxation on every view change; cache.
- Optional manual override (dragged label is "pinned").

### §8.3 v3 (post-GA)
- ML-assisted placement learned from user-corrected layouts.

---

## §9 Sheets & viewports (Phase 2C)

### §9.1 Sheet model
- A **sheet** is a printable composition: title block + viewports + revisions + sheet-level annotations.
- A **viewport** is a placed instance of a view onto a sheet, with its own scale, crop, and VG overrides.
- Per-viewport overrides stack on top of view-template-resolved values.

### §9.2 Title blocks
- Library of title-block templates (A0, A1, A2, A3, A4, ANSI A–E, ARCH-A–E).
- Title blocks parameterised by project metadata; auto-fill from `manifest.json`.
- Custom title blocks via SVG drop-in.

### §9.3 Sheet revisioning (closes B4 gap "sheet revisioning required by C2")
- Each sheet carries a revisions list `{ id, date, author, description, status }`.
- Revision triangles auto-placed near revised viewports (Phase 3B with force-directed); manual placement v1.
- Revision history is part of the event log; auditable.

---

## §10 OpenTelemetry instrumentation
- `drawing.edge-projection.run` — input `(viewId, elementCount)`; output `(primitiveCount, durationMs)`.
- `drawing.classify.hidden` — input `(viewId, elementCount)`; output `(durationMs)`.
- `drawing.canvas2d.frame` — input `(viewId, primitiveCount)`; output `(durationMs)`.
- `drawing.export.svg` — input `(viewId)`; output `(bytes, durationMs)`.
- `drawing.export.pdf` — input `(sheetId)`; output `(bytes, durationMs)`.
- `drawing.export.dxf` — input `(viewId)`; output `(bytes, durationMs)`.

---

## §11 Bench gates (Phase 2B / 2C)

| Bench | Target |
|---|---|
| Plan view 5,000 elements first paint | < 100 ms |
| Plan view 5,000 elements steady frame | < 16 ms |
| Section view 1,000 elements | < 80 ms |
| PDF export (1 sheet, 4 viewports, 2,000 elements) | < 5 s |
| SVG export (same) | < 2 s |
| DXF export (5,000 elements) | < 4 s |

---

## §12 What v1 (M36 GA) does NOT include
- 3D visualisation styles (NPR, watercolour, sketch). Post-GA.
- Real-time shadow casting in plan/section. Post-GA.
- Curved-surface hidden-line removal (NURBS). Post-GA.
- Generated isometric / axonometric views with auto-routing.

---

## §13 Cross-references
- Layer placement: `08-VISION §4` (L5 renderer + L4 kernel).
- Conflict mapping: `CONFLICT-ANALYSIS.md §3.10`, §3.11.
- Phase deliverables: `phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md`, `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md`.
- ADR: `adrs/ADR-016-drawing-engine-architecture.md`.
- Visibility-Intent rule matrix: legacy `00_Contracts/12-VISIBILITY-INTENT-SYSTEM-CONTRACT.md` is the *what*; placement of those rules into the new layer model is owned by ADR-015.
