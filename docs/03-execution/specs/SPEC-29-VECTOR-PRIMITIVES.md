# SPEC-29 — Vector Primitives & PDF Backend

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead |
| Closes | `GAP-REVIEW-2026-04-27.md §10, §21.4 (drawing-engine packages future-tense), §29 #20` |
| Phases | 2B (foundations at S31; Phase 2A holds no gap-closure work per 2026-04-27 directive), 2B (plan-view consumers), 2C (sheets/schedules), 3D (PDF GA) |
| Replaces / extends | SPEC-04 §1–§3 (architecture & primitive list — concrete schemas live here) |

> SPEC-04 declared the vector primitives (`Line`, `Polyline`, `Arc`, `Polygon`, `Text`, `Symbol`) and styles. This SPEC pins the **TypeScript schemas**, the **rendering contract** for SVG / Canvas2D / native-PDF backends, and the **CI gates** that enforce backend-equivalence. Phase 2C sheets & schedules cannot ship without this.

---

## §1 The primitive set

The vector layer has exactly seven primitive kinds. No others.

```ts
type VectorPrimitive =
  | LinePrim
  | PolylinePrim
  | ArcPrim
  | PolygonPrim
  | TextPrim
  | SymbolPrim
  | HatchPrim;
```

### §1.1 Common fields
```ts
interface PrimBase {
  id: PrimId;                              // ULID
  layer: LayerId;                          // ISO-13567 layer reference
  stroke?: StrokeStyleId;
  fill?: FillStyleId;                      // for closed primitives
  hatch?: HatchStyleId;                    // for closed primitives
  visibilityIntentOrigin?: IntentId;       // back-pointer to the rule that produced it
  pickable?: boolean;                      // default true
  metadata?: Record<string, string>;       // optional debug / audit
}
```

### §1.2 Per-kind shapes
```ts
interface LinePrim extends PrimBase    { kind: 'line';     a: Vec2; b: Vec2 }
interface PolylinePrim extends PrimBase{ kind: 'polyline'; points: Vec2[]; closed: boolean }
interface ArcPrim extends PrimBase     { kind: 'arc';      center: Vec2; radius: number; startAngle: number; sweepAngle: number }
interface PolygonPrim extends PrimBase { kind: 'polygon';  outer: Vec2[]; holes?: Vec2[][] }   // CCW outer, CW holes (right-hand)
interface TextPrim extends PrimBase    { kind: 'text';     anchor: Vec2; content: string; style: TextStyleId; rotation?: number; alignment: TextAlignment }
interface SymbolPrim extends PrimBase  { kind: 'symbol';   ref: SymbolRef; insert: Vec2; rotation?: number; scale?: number }
interface HatchPrim extends PrimBase   { kind: 'hatch';    boundary: PolygonPrim; pattern: HatchPatternId; angle: number; spacing: number }
```

A `VectorPrimitiveSet` is `{ primitives: VectorPrimitive[]; bounds: BBox2D }`. This is the unit consumed by every backend.

---

## §2 Coordinate space

- All coordinates are **paper-space millimetres** at 1:1 scale.
- The view-to-paper transform is applied **before** primitives are emitted (per SPEC-30 §3 plan-view scaling).
- Y-axis convention: **+Y up** (CAD convention). Backends flip for screen / PDF as needed.
- Floating-point tolerance: `1e-4 mm` for equality, `1e-6 mm` for boolean ops.

---

## §3 Style schemas

### §3.1 StrokeStyle
```ts
interface StrokeStyle {
  id: StrokeStyleId;
  width_mm: number;
  color: RGBA;
  dashPattern?: number[];        // mm; alternating on/off
  lineCap: 'butt'|'round'|'square';
  lineJoin: 'miter'|'round'|'bevel';
  miterLimit?: number;
  iso13567Layer?: string;        // human-readable; optional
}
```

### §3.2 FillStyle
```ts
interface FillStyle {
  id: FillStyleId;
  color: RGBA;
  evenOdd: boolean;              // fill rule for polygons with holes
}
```

### §3.3 HatchStyle
```ts
interface HatchStyle {
  id: HatchStyleId;
  patternId: HatchPatternId;     // 'solid' | 'concrete' | 'brick' | 'wood' | 'insulation' | 'earth' | 'gravel' | 'glass' | 'steel' | 'custom'
  defaultAngle?: number;
  defaultSpacing?: number;
  customStrokes?: HatchStroke[]; // for 'custom' patternId
}
```

### §3.4 TextStyle
```ts
interface TextStyle {
  id: TextStyleId;
  font: 'IsoCpEur'|'NotoSans'|'NotoSerif'|'sourceCodePro'|'custom';
  customFontUri?: string;
  size_mm: number;               // text height in paper mm
  bold: boolean;
  italic: boolean;
  color: RGBA;
  outlineWhenOverlap?: boolean;  // halo for plan readability
}
```

### §3.5 SymbolDefinition
```ts
interface SymbolDefinition {
  id: SymbolId;
  category: 'door-swing'|'window-symbol'|'electrical'|'plumbing'|'mep'|'annotation'|'north-arrow'|'scale-bar'|'sheet-symbol'|'custom';
  primitives: VectorPrimitive[]; // local space; 1mm = 1 unit
  defaultScale: number;
  anchor: Vec2;
}
```

---

## §4 The four backends

Every `VectorPrimitiveSet` renders identically across four backends.

### §4.1 SVG (DOM, browser)
- `packages/drawing-svg/` produces `<svg>` markup.
- Streaming-friendly; supports interactive layers (CSS classes per layer).
- Used for in-app plan view (Phase 2B).
- Performance budget: 10k primitives < 30 ms paint on M-class hardware.

### §4.2 Canvas2D (browser, immediate-mode)
- `packages/drawing-canvas2d/` paints to a `CanvasRenderingContext2D`.
- Used for cursor-tracked overlays (snap previews, hover, selection).
- Performance budget: 100k primitives < 16 ms (one frame).

### §4.3 PDF (server-side, native)
- `packages/drawing-pdf/` produces a PDF byte stream **without** an SVG → PDF round-trip (no `pdfkit` SVG translator; we emit operators directly).
- Used for sheet exports, schedules, reports.
- Performance budget: 100-page A1 sheet set < 8 s on bake-worker (per SPEC-15 §8).

### §4.4 Print-Canvas (browser, print preview)
- Reuses Canvas2D backend at print DPI; primary use is print-preview UI.

### §4.5 Equivalence gate
For every fixture in `tests/fixtures/drawing/`:
- SVG → rasterise at 300 DPI → image diff vs PDF → image diff vs Canvas2D.
- Image diff ≤ 0.5% pixels.
- CI gate `pnpm test:drawing-equivalence` enforces.

---

## §5 Hidden-line algorithm (per SPEC-04 §4)

The hidden-line classifier runs **upstream** of primitive emission. Its output is a tagged primitive set (Cut / Beyond / Hidden / Symbolic). Each tag maps to a default StrokeStyle and LayerId.

The algorithm is BVH-accelerated:
- Build BVH of 3D edges (from element analytic geometry, not display geometry).
- Project to view plane.
- For each edge, classify against the BVH frustum.
- Output: classified 2D edges → `LinePrim` / `PolylinePrim`.

Performance budget per SPEC-30 §2.

---

## §6 Schedule integration

Schedules are vector primitives at heart: tables are `LinePrim` borders + `TextPrim` cells. The schedule producer:
- Accepts `ScheduleContext` (per SPEC-13 §5.4).
- Resolves formulas via the **Schedule Formula Library** (per ADR-027).
- Emits `VectorPrimitiveSet` per page.
- Pages flow into Sheets per `SheetContext`.

### §6.1 Formula library scope
- Built-in formulas: `count`, `sum`, `avg`, `min`, `max`, `area_total`, `volume_total`, `perimeter_total`, `cost_total` (with unit cost lookup).
- Per-family default columns map declared in `plugins/<family>/schedule.ts` (per SPEC-21 Step 9).
- User-authored formula DSL deferred per ADR-027 + ADR-018 T1.3 (reduces to library-only at Tier-1 cut).

---

## §7 Title block + sheet template system

### §7.1 Title block schema
```ts
interface TitleBlockTemplate {
  id: TitleBlockId;
  paperSize: SheetSize;
  primitives: VectorPrimitive[];     // template body
  fields: TitleBlockField[];         // dynamic fields
}
interface TitleBlockField {
  id: string;
  anchor: Vec2;
  source: 'project.name'|'project.number'|'sheet.number'|'sheet.title'|'date'|'revision'|'scale'|'drawn-by'|'checked-by'|'custom';
  customValue?: string;
  textStyle: TextStyleId;
  alignment: TextAlignment;
}
```

### §7.2 Sheet rendering pipeline
1. Resolve title block → primitive set.
2. For each viewport: project view → vector primitives → place at viewport position.
3. Add revision cloud primitives if changes since last revision.
4. Emit final `VectorPrimitiveSet` for the page.

---

## §8 Anti-patterns this SPEC forbids

- **No backend-specific shortcuts.** A primitive must render identically across SVG / Canvas2D / PDF.
- **No raster fallbacks** for vector content. Rasterising a hatch at low DPI produces unprintable PDFs.
- **No DOM access in the producer.** Producers emit `VectorPrimitiveSet`; the backend chooses how to draw.
- **No font fallbacks at PDF export.** Embed every used font (subsetting allowed) per the print-quality bar.

---

## §9 Phase rollout

| Sprint | Deliverable |
|---|---|
| S31 (Phase 2B start; Phase 2A holds no gap-closure work per 2026-04-27 directive) | `packages/drawing-primitives/` schemas + Zod + tests; SVG backend MVP. |
| S32–S34 (Phase 2B) | Canvas2D backend (overlays); plan-view consumes primitives. |
| S35 (Phase 2B) | hidden-line classifier integrated; SPEC-30 perf budget met. |
| S37–S38 (Phase 2C start) | PDF backend MVP; equivalence gate green for SVG↔Canvas2D↔PDF. |
| S39–S40 | schedule producer; formula library v1; title block templates land. |
| S41–S42 | sheet pipeline end-to-end; multi-page schedules; revision clouds. |
| S55 | print-canvas backend lit (browser print preview). |
| S65 | PDF backend optimisations; large-sheet bench < 8 s. |
| S72 (M36 GA) | all backends GA; ADR-018 T1.5 (no in-browser PDF) decided per slip. |

---

## §10 Cross-references
- ADR-016 drawing engine architecture; ADR-018 cut list (T1.3 formula DSL, T1.5 PDF surface); ADR-027 schedule formula scope.
- SPEC-04 drawing engine (architecture & styles); SPEC-13 envelopes; SPEC-21 element creation Steps 8–9; SPEC-30 plan-view perf.
- Phase docs: PHASE-2A §6.5 drawing foundations; PHASE-2B §3 plan-view; PHASE-2C §2 sheets, §4 schedules.
