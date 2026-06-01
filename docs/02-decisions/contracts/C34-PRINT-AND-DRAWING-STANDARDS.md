# C34 — Print & Drawing Standards

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: governs the architectural-output standards layer that sits behind sheet authoring — sheet sizes, scales, line types, line weights, text styles, dimension styles, north-arrow + scale-bar symbols, title-block templates, revision-cloud styles — codified against AIA, RIBA, and ISO 5455 conventions. C34 is the **standards registry**; the engine that composes sheets is [C24](C24-SHEET-COMPOSITION-ENGINE.md); the output format that prints them is [C29](C29-PDF-VECTOR-EXPORT.md); the multi-sheet revision aggregator is [C30](C30-DRAWING-SET-MANAGEMENT.md).
> **Depends on**: [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) (schemas + commands + state), [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) (command authoring), [C19](C19-SITE-MODEL-AND-PARCEL.md) (true-north / magnetic declination from site model), [C24](C24-SHEET-COMPOSITION-ENGINE.md) (consumes this contract's standards when rendering sheets).
> **Downstream**: [C24](C24-SHEET-COMPOSITION-ENGINE.md) (Sheet engine reads `StandardsStore` for line/text/dim resolution at render time), [C29](C29-PDF-VECTOR-EXPORT.md) (PDF backend reads calibrated line weights), [C30](C30-DRAWING-SET-MANAGEMENT.md) (SheetSet's title-block + revision-cloud styles are sourced here), `plugins/dimensions/` (DimensionStyleRegistry is the source of truth), `plugins/annotations/` (RevisionCloud + leader-text styles).
> **Key principles**: **P5** (standards schemas are pure — no I/O, no DOM, no THREE), **P6** (mutation flows through commands only), **P8** (every standards mutation emits an OpenTelemetry span).
> **Source audit**: [MISSING-CONTRACTS-AUDIT-2026-06-01.md §3.2 / C34 row](../MISSING-CONTRACTS-AUDIT-2026-06-01.md). PRYZM 2 prior-art: scattered enums + hard-coded constants inside `plugins/sheets/src/title-block.ts`, `plugins/dimensions/`, and `packages/drawing-primitives/`.

---

## §1 — Invariants

The numbered rules code MUST obey. Each rule has an §N.M id; cite as **C34 §1.M** in code reviews.

### §1.1 — Sheet sizes selectable from a single registry

Every Sheet ([C24](C24-SHEET-COMPOSITION-ENGINE.md)) MUST select its paper size from the canonical `SheetSizeRegistry` defined in this contract. The registry MUST include — at a minimum — these three families (all dimensions are nominal trim size, portrait orientation; landscape is portrait swapped):

| Family | Members |
|---|---|
| **ISO 216** (`iso-a`) | `A0` (841 × 1189 mm) · `A1` (594 × 841) · `A2` (420 × 594) · `A3` (297 × 420) · `A4` (210 × 297) |
| **ANSI/ASME Y14.1 — architectural** (`arch`) | `ARCH_A` (9 × 12 in) · `ARCH_B` (12 × 18) · `ARCH_C` (18 × 24) · `ARCH_D` (24 × 36) · `ARCH_E` (36 × 48) · `ARCH_E1` (30 × 42) |
| **ANSI/ASME Y14.1 — engineering** (`ansi`) | `ANSI_A` (8.5 × 11 in) · `ANSI_B` (11 × 17) · `ANSI_C` (17 × 22) · `ANSI_D` (22 × 34) · `ANSI_E` (34 × 44) |

Custom sizes (`custom`) are permitted but MUST carry an explicit `{ widthMm, heightMm }` pair and SHOULD NOT be used in delivery sets governed by an AIA / RIBA / ISO StandardSet (§2.1).

CI gate: `tools/ga-gate/check-sheet-size-registry.ts` (NEW) fails when a Sheet references a size not present in the registry and not declared `custom`.

### §1.2 — Line weights MUST be specifiable in millimetres OR points

Line weights are a **physical** quantity (printed thickness on paper) — not a screen pixel count. Every `LineWeight` value MUST carry a unit tag of either `mm` or `pt`. The converter is fixed at the ISO 5457 convention: **1 pt = 0.3528 mm** (i.e. PostScript point, 72 pt = 1 in).

The canonical ISO 128 / ISO 5457 line-weight series MUST be present in `LineWeightRegistry`:

| Name | mm | pt (approx) | Typical use |
|---|---|---|---|
| `extra-fine` | 0.13 mm | 0.37 pt | Hatch lines, fill patterns |
| `fine` | 0.18 mm | 0.51 pt | Dimensions, leaders, notes |
| `medium` | 0.25 mm | 0.71 pt | Visible edges, default plan-view linework |
| `thick` | 0.35 mm | 0.99 pt | Section cut, primary structure |
| `extra-thick` | 0.50 mm | 1.42 pt | Building outline, profile lines |
| `extra-extra-thick` | 0.70 mm | 1.98 pt | Title-block border, scale-bar frame |

CI gate: `tools/ga-gate/check-line-weight-units.ts` (NEW) fails any `LineWeight` value that lacks a unit tag or whose numeric value is < 0 or > 5 mm.

### §1.3 — Scales MUST be reversible and unit-aware

Every `Scale` value is a printed-to-real ratio MUST be **bidirectionally reversible**: given a paper distance, the engine returns a real-world distance; given a real-world distance, the engine returns the paper distance. The reversal MUST be lossless at the schema level (no rounding inside the ratio).

Two scale families MUST be supported and round-trip with each other:

| Family | Examples | Internal form |
|---|---|---|
| **Metric** | `1:1` · `1:10` · `1:20` · `1:50` · `1:100` · `1:200` · `1:500` · `1:1000` · `1:2000` · `1:5000` | `{ kind: 'metric', ratio: number }` where `ratio` ≥ 1 |
| **Imperial** | `1/8" = 1'-0"` (= 1:96) · `1/4" = 1'-0"` (= 1:48) · `1/2" = 1'-0"` (= 1:24) · `3/4" = 1'-0"` (= 1:16) · `1" = 1'-0"` (= 1:12) · `3" = 1'-0"` (= 1:4) | `{ kind: 'imperial', paperIn: number, realFt: number }` |

A single `Scale.applyToLength(realMetres, paperUnit: 'mm' \| 'in')` function MUST exist in `packages/schemas/src/standards/`. Round-trip equality MUST hold:
```ts
const paper = scale.applyToLength(L, 'mm');
const back  = scale.invert(paper, 'mm');
assert(Math.abs(back - L) < 1e-9);
```

CI gate: `tools/ga-gate/check-scale-reversibility.ts` (NEW) runs property-based tests on every member of the default scale set.

### §1.4 — North arrow MUST point at true north (or magnetic with declination)

Every `NorthArrowSymbol` placed on a sheet MUST resolve its pointing direction from one of:

1. **True north** (default) — angle is taken from `projectContext.trueNorthDeg` (the project's geospatial site model, [C19](C19-SITE-MODEL-AND-PARCEL.md) §2). On projects without a site model, true north defaults to the +Y world axis.
2. **Magnetic north** — angle is `trueNorthDeg + declinationDeg`, where `declinationDeg` is sourced from the site model ([C19](C19-SITE-MODEL-AND-PARCEL.md) §4 / NOAA WMM lookup at the project's lat/lon).

A `NorthArrowSymbol` MUST NOT carry a hard-coded numeric direction independent of project context. Hand-overrides (when the project is unsited) are permitted but MUST set `mode: 'manual'` explicitly and SHALL emit a P8 span warning attribute `northArrowMode: 'manual-override'`.

CI gate: `tools/ga-gate/check-north-arrow-source.ts` (NEW) flags any NorthArrowSymbol whose `directionSource` is unset or `'literal'`.

### §1.5 — Scale bar MUST match the viewport scale

Every `ScaleBarSymbol` is **derived**, not authored. Its tick spacing, total length, and label units MUST be computed from the parent `ViewPort.scale` ([C24 §2.2](C24-SHEET-COMPOSITION-ENGINE.md)) at render time. A ScaleBar SHALL NOT carry an independently-authored `length` or `ticks` value that disagrees with its viewport's scale.

When a viewport's scale changes (via `sheet.setViewportScale`), every ScaleBar on that sheet whose `viewportRef` resolves to that viewport MUST recompute on the next frame.

CI gate: `tools/ga-gate/check-scale-bar-matches-viewport.ts` (NEW) — for every Sheet in the project, asserts that for every ScaleBar widget, `scaleBar.computedFromScale === viewport.scale`.

### §1.6 — Title block MUST carry the current revision

A `TitleBlockTemplate` resolved against a Sheet within a SheetSet ([C30](C30-DRAWING-SET-MANAGEMENT.md)) MUST surface the current revision row in a dedicated field slot (`revisionSlot`). Specifically, the title block MUST always render — at minimum — the following fields, sourced from the contract laid down in [C24 §2.3](C24-SHEET-COMPOSITION-ENGINE.md):

- `projectName`
- `drawingTitle`
- `scale` (the dominant viewport's scale, or the sheet's nominal scale if mixed)
- `date` (sheet last-issued date; falls back to last-modified date in DRAFT state)
- `sheetNumber`
- `revision` (the current Revision row's id + status indicator)

When the SheetSet's current Revision transitions `draft → issued` ([C30 §1.2](C30-DRAWING-SET-MANAGEMENT.md)), every TitleBlock on every Sheet in the set MUST re-render on the next frame and the `revisionSlot` MUST display the new revisionId + issued date.

CI gate: `tools/ga-gate/check-title-block-revision-binding.ts` (NEW).

### §1.7 — Default standard for new projects

New projects MUST instantiate a `StandardSet` on creation, defaulting to:

- Locale `en-GB` → **RIBA** preset (ISO 216 paper, ISO 128 line weights, metric scales).
- Locale `en-US` → **AIA** preset (ARCH paper, AIA line weights, imperial scales).
- Locale `en-AU` / `en-NZ` → RIBA-aligned (Standards Australia AS 1100 mostly tracks ISO).
- All others → **ISO** preset.

The selected preset MUST be recorded on the project as `project.standardSet.presetId` and SHALL be visible (read-only) in the Project Properties panel.

### §1.8 — Mutation through commands only

The `StandardsStore` MUST NOT be mutated except via the commands listed in §4. Direct writes from UI code, plugins, or AI workflows are a CI violation per **P6** ([C03 §3](C03-SCHEMAS-COMMANDS-AND-STATE.md), [C16 §1](C16-COMMAND-AUTHORING-PROTOCOL.md)).

### §1.9 — One standards registry per project

Exactly one `StandardsStore` instance MUST exist per project at runtime. Composition root ([C02 §1](C02-COMPOSITION-ROOT-AND-BOOT.md)) is the only authorised constructor. Parallel registries (e.g. a sheet-local override store) are a CI violation. Per-sheet overrides are expressed as `SheetOverride` deltas inside `SheetDefinition` ([C24 §2.2](C24-SHEET-COMPOSITION-ENGINE.md)), not as a separate store.

### §1.10 — Schema purity

All schemas listed in §2 live in `packages/schemas/src/standards/` (L0). They MUST be pure Zod definitions: no I/O, no DOM access, no THREE imports, no font-file readers. Font loading is a runtime concern in `packages/drawing-primitives/`; the schema only carries the font family name + weight + style.

### §1.11 — Every public function emits a span

Per **P8**, every public exported function in `packages/standards/` (when extracted from `packages/schemas/src/standards/` for non-pure helpers) MUST open at least one OpenTelemetry span. Span naming convention: `pryzm.standards.<verb>` (e.g. `pryzm.standards.applyPreset`, `pryzm.standards.exportStandardSet`, `pryzm.standards.resolveLineWeight`).

### §1.12 — Standards are versioned

Every `StandardSet` MUST carry a `version` integer that increments on every mutation. Sheets store the version-at-render-time to allow render-cache invalidation. Stale Sheets recompute on next frame; the bench targets in §7 assume the cache is warm.

### §1.13 — Switching presets is reversible

Applying a preset (AIA → ISO, ISO → RIBA, etc.) MUST be a single undoable command (`standards.applyPreset`). The previous `StandardSet` snapshot MUST be captured in the command's inverse so undo restores it exactly. This binds the standards switch into the project's standard undo ring buffer ([C03 §4](C03-SCHEMAS-COMMANDS-AND-STATE.md)).

---

## §2 — Schema

All schemas live in `packages/schemas/src/standards/` (L0, pure). Each row references the file that owns it.

### §2.1 — `StandardSet`

```ts
StandardSet = {
  id: StandardSetId,                              // typed branded id
  name: string,                                   // 'AIA 2019', 'RIBA 2024', 'ISO 5455-2024', 'Acme Architects'
  presetId: 'aia' | 'riba' | 'iso' | 'custom',
  version: number,                                // increments per mutation (§1.12)
  locale: string,                                 // BCP-47 tag — drives default scale family choice
  paperFamily: 'iso-a' | 'arch' | 'ansi',         // controls the SheetSizeRegistry slice surfaced in UI
  defaultPaperSize: SheetSizeId,                  // member of paperFamily
  defaultScale: ScaleId,                          // member of the scale family compatible with paperFamily
  lineWeightCalibration: LineWeightCalibrationId,
  lineTypeRegistry: LineTypeRegistryId,
  textStyleRegistry: TextStyleRegistryId,
  dimensionStyleRegistry: DimensionStyleRegistryId,
  northArrowSymbol: NorthArrowSymbolId,
  scaleBarSymbol: ScaleBarSymbolId,
  titleBlockTemplate: TitleBlockTemplateId,
  revisionCloudStyle: RevisionCloudStyleId,
  createdAt: ISODate,
  updatedAt: ISODate,
};
```

### §2.2 — `SheetSizeRegistry`

```ts
SheetSizeRegistry = {
  family: 'iso-a' | 'arch' | 'ansi',
  sizes: SheetSize[],
};
SheetSize = {
  id: SheetSizeId,                                // e.g. 'A1', 'ARCH_D', 'ANSI_E'
  family: 'iso-a' | 'arch' | 'ansi' | 'custom',
  widthMm: number,                                // portrait
  heightMm: number,                               // portrait
  displayName: string,                            // 'A1 (594 × 841 mm)'
  defaultMarginMm: { top: number, right: number, bottom: number, left: number },
};
```

### §2.3 — `Scale`

```ts
type Scale =
  | { id: ScaleId; kind: 'metric'; ratio: number; displayName: string }     // ratio = 50 for '1:50'
  | { id: ScaleId; kind: 'imperial'; paperIn: number; realFt: number; displayName: string };
```

`paperIn / realFt` is the printed-to-real ratio in fraction form (e.g. `1/4 = paperIn / (realFt * 12)`).

The default `ScaleRegistry` MUST contain all members listed in §1.3.

### §2.4 — `LineWeight` + `LineWeightCalibration`

```ts
LineWeight = {
  id: LineWeightId,                               // 'fine', 'medium', etc.
  name: string,
  value: number,
  unit: 'mm' | 'pt',                              // mandatory per §1.2
  iso128Tier: 'extra-fine' | 'fine' | 'medium' | 'thick' | 'extra-thick' | 'extra-extra-thick' | null,
};
LineWeightCalibration = {
  id: LineWeightCalibrationId,
  name: string,                                   // 'ISO 128' | 'AIA Best Practices 2019' | custom firm
  lineWeights: LineWeight[],
  // for plotter calibration; consumed by C29
  plotterCorrection?: { dpi: number, dotGainMm: number },
};
```

### §2.5 — `LineType` + `LineTypeRegistry`

```ts
LineType = {
  id: LineTypeId,
  name: 'continuous' | 'dashed' | 'hidden' | 'centre' | 'phantom' | 'long-dash' | 'short-dash' | 'dash-dot' | 'dash-dot-dot' | string,
  dashPattern: number[],                          // ISO 128 — array of dash + gap lengths in mm
  scaleWithPaper: boolean,                        // true = dash pattern multiplies by paper scale at render
};
LineTypeRegistry = {
  id: LineTypeRegistryId,
  lineTypes: LineType[],
};
```

The default registry MUST include — at minimum — `continuous`, `dashed`, `hidden`, `centre`, `phantom`.

### §2.6 — `TextStyle` + `TextStyleRegistry`

```ts
TextStyle = {
  id: TextStyleId,
  name: string,                                   // 'titleblock-h1', 'note-body', 'dim-label', etc.
  fontFamily: string,                             // 'Arial', 'Helvetica Neue', 'Roboto', etc.
  fontWeight: 100 | 200 | ... | 900,
  fontStyle: 'normal' | 'italic' | 'oblique',
  sizeMm: number,                                 // printed height (cap height target) in mm
  letterSpacing?: number,                         // optical kerning, em units
  lineHeight?: number,                            // multiplier; default 1.2
  capitalisation: 'as-typed' | 'upper' | 'lower' | 'title',
  fillColour?: string,                            // hex RGB
};
TextStyleRegistry = {
  id: TextStyleRegistryId,
  textStyles: TextStyle[],
};
```

The default registry MUST include — at minimum — `titleblock-h1`, `titleblock-body`, `note-body`, `dim-label`, `room-label`, `sheet-number`, `scale-label`, `north-label`.

### §2.7 — `DimensionStyle` + `DimensionStyleRegistry`

```ts
DimensionStyle = {
  id: DimensionStyleId,
  name: string,                                   // 'architectural', 'engineering', 'detail'
  textStyle: TextStyleId,                         // refs §2.6
  lineWeight: LineWeightId,                       // refs §2.4
  lineType: LineTypeId,                           // refs §2.5
  arrowStyle: 'open' | 'closed-filled' | 'oblique' | 'architectural-tick' | 'dot',
  arrowSizeMm: number,
  extensionBeyondMm: number,                      // how far extension lines run past dim line
  extensionOffsetMm: number,                      // gap between geometry and start of extension line
  textPosition: 'above-line' | 'aligned' | 'horizontal' | 'centred',
  textOffsetMm: number,
  unit: 'mm' | 'm' | 'cm' | 'ft-in' | 'ft-decimal' | 'in',
  precision: number,                              // decimal places
  showZeros: 'trailing' | 'leading' | 'both' | 'neither',
};
DimensionStyleRegistry = {
  id: DimensionStyleRegistryId,
  dimensionStyles: DimensionStyle[],
};
```

### §2.8 — `NorthArrowSymbol`

```ts
NorthArrowSymbol = {
  id: NorthArrowSymbolId,
  name: string,                                   // 'aia-classic', 'riba-arrow', 'iso-simple', 'custom-firm'
  style: 'arrow' | 'compass' | 'star' | 'pointer' | 'custom-svg',
  customSvgPath?: string,                         // when style === 'custom-svg'
  sizeMm: number,                                 // diameter / height in printed mm
  directionSource: 'true-north' | 'magnetic' | 'manual',
  manualAngleDeg?: number,                        // only when directionSource === 'manual'
  showLabel: boolean,                             // typically 'N'
  labelTextStyle?: TextStyleId,                   // refs §2.6
};
```

Per §1.4, `directionSource` MUST be set; `'literal'` is not permitted.

### §2.9 — `ScaleBarSymbol`

```ts
ScaleBarSymbol = {
  id: ScaleBarSymbolId,
  name: string,                                   // 'aia-segmented', 'riba-blocks', 'iso-divisions'
  style: 'segmented' | 'plain' | 'graduated-blocks' | 'double-divided',
  unit: 'm' | 'cm' | 'mm' | 'ft' | 'in',
  // length, tick count, and labels are DERIVED from parent viewport scale at render (§1.5)
  preferredDivisions: number,                     // hint: 5 divisions, 10 divisions, etc.
  heightMm: number,                               // printed bar height
  fillPattern: 'alternating-black-white' | 'striped' | 'solid' | 'none',
  labelTextStyle?: TextStyleId,
};
```

### §2.10 — `TitleBlockTemplate`

```ts
TitleBlockTemplate = {
  id: TitleBlockTemplateId,
  name: string,                                   // 'AIA D200', 'RIBA-2024', 'custom-firm-XYZ'
  preset: 'aia' | 'riba' | 'iso' | 'custom',
  fields: TitleBlockField[],                      // ordered slots
  logoSlot?: { x: number, y: number, widthMm: number, heightMm: number },
  borderStyle: { lineWeight: LineWeightId, lineType: LineTypeId, marginMm: number },
};
TitleBlockField = {
  key: 'projectName' | 'drawingTitle' | 'scale' | 'date' | 'sheetNumber' | 'revision' | 'author' | 'checker' | 'approver' | string,
  label: string,                                  // visible heading
  textStyle: TextStyleId,                         // refs §2.6
  position: { xMm: number, yMm: number, widthMm: number, heightMm: number },
  alignment: 'left' | 'centre' | 'right',
  required: boolean,                              // per §1.6 the six required fields are non-removable
};
```

### §2.11 — `RevisionCloudStyle`

```ts
RevisionCloudStyle = {
  id: RevisionCloudStyleId,
  name: string,
  arcRadiusMm: number,                            // size of each cloud bump
  lineWeight: LineWeightId,
  lineType: LineTypeId,
  strokeColour: string,                           // hex
  fillColour?: string,                            // usually unfilled
  attachedRevisionMarker: {                       // the small tag next to the cloud
    shape: 'triangle' | 'circle' | 'hexagon' | 'flag',
    sizeMm: number,
    textStyle: TextStyleId,
  },
};
```

### §2.12 — Type constraints (CI-enforced)

- `Scale.ratio` (metric) MUST be ≥ 1 and finite.
- `Scale.paperIn` / `Scale.realFt` (imperial) MUST be > 0 and finite.
- `LineWeight.value` MUST be > 0 and ≤ 5 (mm units) or ≤ 14.2 (pt units).
- `TextStyle.sizeMm` MUST be > 0 and ≤ 100.
- `NorthArrowSymbol.directionSource` MUST be one of the three enum values; `null`/`undefined` is rejected.
- `TitleBlockField.key` set MUST include all six required keys (§1.6) — schema validator rejects otherwise.
- `StandardSet.version` MUST monotonically increase.

---

## §3 — Stores / API surface

### §3.1 — `StandardsStore`

```
packages/stores/src/StandardsStore.ts            (NEW)
```

A single Zustand store per project, owned by composition root ([C02 §1](C02-COMPOSITION-ROOT-AND-BOOT.md)).

```ts
interface StandardsStore {
  current: StandardSet;                           // the active standard set for this project
  registry: {
    sheetSizes: Record<SheetSizeId, SheetSize>;
    scales: Record<ScaleId, Scale>;
    lineWeights: Record<LineWeightId, LineWeight>;
    lineTypes: Record<LineTypeId, LineType>;
    textStyles: Record<TextStyleId, TextStyle>;
    dimensionStyles: Record<DimensionStyleId, DimensionStyle>;
    northArrows: Record<NorthArrowSymbolId, NorthArrowSymbol>;
    scaleBars: Record<ScaleBarSymbolId, ScaleBarSymbol>;
    titleBlocks: Record<TitleBlockTemplateId, TitleBlockTemplate>;
    revisionCloudStyles: Record<RevisionCloudStyleId, RevisionCloudStyle>;
  };
  presets: Record<'aia' | 'riba' | 'iso', StandardSetSnapshot>;   // built-in
  // selectors (pure derivations, P5-safe)
  resolveLineWeight(id: LineWeightId): LineWeight;
  resolveScale(id: ScaleId): Scale;
  resolveSheetSize(id: SheetSizeId): SheetSize;
  resolveTextStyle(id: TextStyleId): TextStyle;
  // ...
}
```

### §3.2 — Resolution helpers (consumed by C24 + C29)

```
packages/standards/src/resolve.ts                (NEW; pure module — L2)
```

Pure functions used by the Sheet engine ([C24](C24-SHEET-COMPOSITION-ENGINE.md)) and the PDF backend ([C29](C29-PDF-VECTOR-EXPORT.md)) to convert between schema ids and concrete render-time values:

```ts
function resolveLineWeightMm(id: LineWeightId, store: StandardsStore): number;
function resolveScaleRatio(id: ScaleId, store: StandardsStore): number;
function resolveScaleBarTicks(viewport: ViewPort, store: StandardsStore): ScaleBarTickSet;
function resolveNorthArrowDirectionDeg(symbol: NorthArrowSymbol, projectCtx: ProjectContext): number;
```

Per §1.11, each emits a P8 span: `pryzm.standards.resolveLineWeight`, etc.

### §3.3 — Built-in preset snapshots

```
packages/standards/src/presets/
  aia.ts                                         (NEW)
  riba.ts                                        (NEW)
  iso.ts                                         (NEW)
```

Each file exports a fully-populated `StandardSetSnapshot` constant. These are loaded by composition root on first project boot. They MUST NOT be mutated at runtime; they are referenced read-only by `standards.applyPreset`.

---

## §4 — Commands

Per the command-bus pattern ([C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) + [C16](C16-COMMAND-AUTHORING-PROTOCOL.md)). Every command emits a P8 span: `pryzm.standards.<verb>`.

| Command | Effect |
|---|---|
| `standards.set` | Replace the project's current `StandardSet` with the provided one (mutates `StandardsStore.current`; bumps `version`) |
| `standards.applyPreset` | Apply the `aia`/`riba`/`iso` preset snapshot — captures inverse for undo per §1.13 |
| `standards.import` | Parse + load a `StandardSet` JSON document from file; validates with Zod; rejects on schema mismatch |
| `standards.export` | Serialise the current `StandardSet` to JSON for sharing across projects |
| `standards.registerLineWeight` | Add or update a `LineWeight` in the current calibration |
| `standards.registerLineType` | Add or update a `LineType` in the current registry |
| `standards.registerTextStyle` | Add or update a `TextStyle` |
| `standards.registerDimensionStyle` | Add or update a `DimensionStyle` |
| `standards.setTitleBlockTemplate` | Replace the project's title-block template |
| `standards.setNorthArrowSymbol` | Replace the active north-arrow symbol |
| `standards.setScaleBarSymbol` | Replace the active scale-bar symbol |
| `standards.setRevisionCloudStyle` | Replace the active revision-cloud style |

All `register*` commands are upsert semantics: existing id → update; new id → insert.

---

## §5 — UI

The standards picker lives inside the Sheet authoring surface ([C24 §1.1](C24-SHEET-COMPOSITION-ENGINE.md)) — it is NOT a separate top-level panel.

### §5.1 — Standards picker placement

```
apps/editor/src/ui/sheets/
  StandardsPicker.tsx                            (NEW)
  StandardsPreview.tsx                           (NEW)
```

Surfaces:

1. **Project Properties → Drawing Standards** — a panel with a preset dropdown (AIA / RIBA / ISO / Custom) and a "Customise…" affordance that opens the detail editor.
2. **Sheet Inspector → Standards Override** — a per-sheet override pane (rarely used) when one sheet in a set must differ.
3. **New Project wizard** — initial preset choice driven by detected locale per §1.7.

### §5.2 — Detail editor

```
apps/editor/src/ui/sheets/standards-editor/
  LineWeightTable.tsx
  LineTypeTable.tsx
  TextStyleTable.tsx
  DimensionStyleTable.tsx
  NorthArrowEditor.tsx
  ScaleBarEditor.tsx
  TitleBlockTemplateEditor.tsx
  RevisionCloudStyleEditor.tsx
```

Each subpanel dispatches the relevant `standards.register*` command on Save. No direct store writes (P6).

### §5.3 — Live preview

Every edit triggers a live preview thumbnail in the picker showing the current standard applied to a worked example (a small "Demo Sheet" with one viewport, one dimension, one room label, one title block, north arrow + scale bar). Re-renders on store mutation.

---

## §6 — Tests / CI gates

### §6.1 — Existing-pattern gates (extend)

| Gate | Extension |
|---|---|
| `tools/ga-gate/check-schema-purity.ts` | Add `packages/schemas/src/standards/` to the L0-purity sweep |
| `tools/ga-gate/check-direct-store-writes.ts` | Block direct writes to `StandardsStore` from UI code (P6) |
| `tools/ga-gate/check-spans.ts` | Require a span emission in every public function under `packages/standards/` |

### §6.2 — New gates (this contract)

| Gate | What it checks |
|---|---|
| `tools/ga-gate/check-sheet-size-registry.ts` | Every Sheet's paper size is a registered member OR declared `custom` (§1.1) |
| `tools/ga-gate/check-line-weight-units.ts` | Every `LineWeight.unit` is present and value is in range (§1.2) |
| `tools/ga-gate/check-scale-reversibility.ts` | Property tests on every default scale: `invert(applyToLength(L)) ≈ L` (§1.3) |
| `tools/ga-gate/check-north-arrow-source.ts` | Every `NorthArrowSymbol.directionSource` is set; flags hard-coded angles (§1.4) |
| `tools/ga-gate/check-scale-bar-matches-viewport.ts` | Per Sheet, every ScaleBar's computed scale == its parent viewport's scale (§1.5) |
| `tools/ga-gate/check-title-block-revision-binding.ts` | Every issued Sheet's title block reflects its current Revision (§1.6) |
| `tools/ga-gate/check-standards-completeness.ts` | Every output Sheet resolves all five required style-registry refs (line weights, types, text, dims, north arrow) — no dangling ids |
| `tools/ga-gate/check-single-standards-store.ts` | Exactly one `StandardsStore` instance per project (§1.9) |

### §6.3 — Conformance test packs

```
packages/standards/__tests__/
  scale-reversibility.test.ts                    (property-based)
  preset-aia.test.ts
  preset-riba.test.ts
  preset-iso.test.ts
  scale-bar-derivation.test.ts
  north-arrow-true-vs-magnetic.test.ts
  title-block-required-fields.test.ts
```

---

## §7 — NFT targets

Per [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md).

| NFT | Target | Bench |
|---|---|---|
| Standard switch (preset → preset, project of 50 sheets) | < 50 ms p95 | `standards-switch.bench.ts` (NEW) |
| `StandardsStore` initial population from a preset | < 5 ms | `standards-boot.bench.ts` (NEW) |
| `resolveLineWeightMm` (cold) | < 0.05 ms | `standards-resolve.bench.ts` (NEW) |
| `resolveLineWeightMm` (warm, memoised) | < 0.005 ms | same bench |
| Standards-editor panel render (cold) | < 80 ms | `standards-panel-render.bench.ts` (NEW) |
| Preset JSON export | < 10 ms | `standards-export.bench.ts` (NEW) |
| Preset JSON import + validate | < 25 ms | `standards-import.bench.ts` (NEW) |

The 50 ms standard-switch target is the load-bearing one — it gates user perception of "snappy preset choice" in the New Project wizard and Project Properties panel.

---

## §8 — Migration plan

### §8.1 — Existing scattered defaults

| Source | What lives there today | Migration action |
|---|---|---|
| `plugins/sheets/src/title-block.ts` | Hard-coded title-block layout for the PRYZM 2 S37 default | Extract into `packages/standards/src/presets/riba.ts` as the `riba.titleBlockTemplate` value |
| `plugins/dimensions/` | Inline default text-height + arrow-style constants | Replace with reads from `StandardsStore.resolveDimensionStyle('default')` |
| `packages/drawing-primitives/` | Hard-coded line-weight pixel mappings | Replace with reads from `LineWeightCalibration.resolveLineWeightMm` |
| `plugins/sheets/src/widgets/scale-bar.ts` | Independent length calculation | Replace with derivation from parent viewport per §1.5 |
| `plugins/sheets/src/widgets/north-arrow.ts` | Hard-coded `0deg` default | Source from `projectContext.trueNorthDeg` per §1.4 |

### §8.2 — Migration sequence (3 phases)

1. **Phase 1 — Schemas land** (~0.5 wk). Drop the `packages/schemas/src/standards/` schema set in. No runtime change yet.
2. **Phase 2 — Store + presets** (~1 wk). Add `StandardsStore`. Wire composition root to load the locale-default preset on project boot per §1.7. Defaults pulled from the existing scattered constants — net zero visual change.
3. **Phase 3 — Wire consumers + retire scattered defaults** (~2 wk). Replace `plugins/sheets/`, `plugins/dimensions/`, and `packages/drawing-primitives/` constant reads with store reads. Land the CI gates. Add the standards picker UI.

Total ≈ 3.5 wk implementation.

### §8.3 — Existing TitleBlock as the seed

The PRYZM 2 S37 title-block layout in `plugins/sheets/src/title-block.ts` becomes the **seed value** for the RIBA preset's `titleBlockTemplate`. Existing projects loading after migration MUST observe zero visual change in their title blocks (identity migration).

---

## §9 — What is NOT in this contract

- **Sheet composition engine** — the actual layout of viewports + widgets on a sheet, the Canvas2D / SVG / PDF substrate, drawing-primitives plumbing → [C24](C24-SHEET-COMPOSITION-ENGINE.md). C34 is the **standards**; C24 is the **engine**.
- **PDF rendering and font embedding** — the pdf-lib backend, font subsetting, PDF/A-3 compliance, IFC-embed → [C29](C29-PDF-VECTOR-EXPORT.md). C34 supplies the *units* (mm line weights, ISO scale ratios); C29 *prints* them.
- **SheetSet revision logic, transmittals, drawing register** — [C30](C30-DRAWING-SET-MANAGEMENT.md). C34 supplies the `RevisionCloudStyle` and the `revisionSlot` field in TitleBlock; C30 owns the lifecycle.
- **Dimension geometry / tag placement / alignment** — `plugins/dimensions/`. C34 owns the *style* registry; the dimensions plugin places the geometry and consumes the style.
- **Annotation geometry / revision-cloud authoring tool** — `plugins/annotations/`. C34 owns the `RevisionCloudStyle`; the annotations plugin draws the cloud.
- **Magnetic declination lookup / NOAA WMM** — [C19](C19-SITE-MODEL-AND-PARCEL.md) § geospatial / [C21](C21-CLIMATE-INGESTION.md). C34 consumes the declination value from the site model; it does not own the lookup.
- **DXF / DWG layer convention** — [C24 §5](C24-SHEET-COMPOSITION-ENGINE.md) (current placeholder) / future `C32` (DXF/DWG round-trip). C34 owns the *line types*; the CAD-export contract owns the *AIA layer names*.
- **Plotter calibration / dot gain / physical-print infrastructure** — future contract. C34 carries the schema slot (`LineWeightCalibration.plotterCorrection`) but the driver work is out of scope.
- **Font file loading / font assets** — `packages/drawing-primitives/`. C34 carries only the font family name + weight; loading is downstream.
- **Building Code annotation conventions** (e.g. egress symbology) — future contract on regulatory annotation.

---

*End — C34 Print & Drawing Standards, 2026-06-01.*
