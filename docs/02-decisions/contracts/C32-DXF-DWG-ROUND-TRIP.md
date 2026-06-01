# C32 — DXF / DWG Round-Trip

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: governs the bidirectional interchange of AutoCAD `.dxf` (ASCII + binary) and `.dwg` (binary) drawings with AutoCAD, DraftSight, BricsCAD, QCAD, and ZWCAD. Codifies invariants for the `DxfDocument` schema, layer/line-type/text-style/dim-style mapping tables, block + xref resolution, paperspace + viewport translation, plot-style (CTB/STB) fidelity, and the DWG license-tier (Open Design Alliance Teigha vs LibreDWG) split. Replaces the `plugins/dxf/` F-prereq.0 stub with a production-grade plugin.
> **Depends on**: [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md), [C04](C04-RENDERING-AND-SCHEDULING.md), [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md), [C24](C24-SHEET-COMPOSITION-ENGINE.md), [C25](C25-IFC-EXPORT-PRODUCTION.md), [C29](C29-PDF-VECTOR-EXPORT.md).
> **Downstream**: [C30](C30-DRAWING-SET-MANAGEMENT.md) (drawing-set DXF batch export), [C34 — Print & Drawing Standards](../MISSING-CONTRACTS-AUDIT-2026-06-01.md#32--medium-priority-interchange--commerce) (layer-name standards and line-weight conventions ride on this contract).
> **Key principles**: **P2** (DXF/DWG reader/writer MUST NOT import THREE), **P5** (DXF + layer-map schemas pure), **P6** (every import/export goes through a command), **P8** (every DXF/DWG operation opens an OpenTelemetry span).
> **Master plan**: [MISSING-CONTRACTS-AUDIT-2026-06-01.md §3.2 C32](../MISSING-CONTRACTS-AUDIT-2026-06-01.md) (interchange gap-fill). Effort estimate: ~2 sprint-weeks (DXF) + ~3 sprint-weeks (DWG via ODA Teigha or LibreDWG).
> **Prior-art**: PRYZM 2 reference is the F-prereq.0 plugin shell (`plugins/dxf/`) plus the cross-reference in [C24 §5](C24-SHEET-COMPOSITION-ENGINE.md) (which named DXF as "not in scope for the sheet engine" — this contract is where DXF lives).

---

## §1 — Invariants

### §1.1 — Tolerance budget — geometry ≤ 1 mm round-trip; line weight ≤ 0.5 pt

Every DXF/DWG round-trip (export → import → re-export → diff) MUST preserve geometry within a **1 mm** absolute tolerance and line weights within a **0.5 pt** tolerance. This applies to every primitive emitted by the DXF/DWG writer: `LINE`, `LWPOLYLINE`, `POLYLINE`, `ARC`, `CIRCLE`, `ELLIPSE`, `SPLINE`, `HATCH`, `TEXT`, `MTEXT`, `DIMENSION`, `LEADER`, `MLEADER`, `INSERT`, and `VIEWPORT`.

Tolerance budget is **per-coordinate-axis**, NOT cumulative across a polyline. A 100 m polyline with 1000 vertices SHALL NOT accumulate to a 1 m drift; each vertex MUST be within 1 mm of its source.

CI gate: `tools/ga-gate/check-dxf-tolerance.ts` — runs the canonical fixture set through round-trip and asserts geometry diff ≤ 1 mm and line-weight diff ≤ 0.5 pt. The canonical fixture set is 10 reference drawings, in `tools/ga-gate/fixtures/dxf/`:

1. `aia-test-sheet.dxf` — AIA reference layer demo (every named AIA layer present).
2. `curved-stair-plan.dxf` — exercises arc + spline geometry tolerance.
3. `parametric-hatch.dxf` — every standard ANSI / ISO hatch pattern.
4. `multi-paperspace.dxf` — 4 paperspace tabs, mixed scales (1:50, 1:100, 1:200, 1:500).
5. `xref-attach-deep.dxf` — 3-level nested xref attach.
6. `xref-overlay-flat.dxf` — single-level xref overlay (no recursion).
7. `dim-style-zoo.dxf` — every standard DIMVAR permutation (linear / aligned / angular / radius / diameter / ordinate).
8. `mleader-multistyle.dxf` — modern MLeader entities with three style flavours.
9. `unicode-mixed-text.dxf` — UTF-8 (Latin + CJK + Arabic + emoji) MText.
10. `legacy-r12-binary.dxf` — binary DXF R12 (encoding fidelity regression).

Each fixture is round-tripped (parse → re-serialise → diff), then additionally exercised on the per-backend integration jobs in §6.3 (AutoCAD 2024 + DraftSight + QCAD + LibreDWG).

### §1.2 — Layer-name mapping table MUST be reversible

The PRYZM internal layer model (semantic; e.g. `wall.exterior`, `wall.interior.partition`, `door.swing`, `dim.linear`, `text.note`) maps to the **AIA / NCS layer standard** (e.g. `A-WALL`, `A-WALL-INTR`, `A-DOOR-SWNG`, `A-ANNO-DIMS`, `A-ANNO-NOTE`) via a declarative `LayerMapTable`. This mapping MUST be **bijective** — every PRYZM layer has exactly one AIA target, and every imported AIA layer resolves back to exactly one PRYZM semantic layer (or `unknown.<original-name>` as a quarantine bucket).

The default mapping table lives in `packages/schemas/src/dxf/layer-map-aia.ts`. Customer-supplied overrides MUST validate against the bijection constraint at load time.

Worked example — the default AIA map (excerpt):

| PRYZM semantic | AIA layer | Color (ACI) | Line type | Line weight |
|---|---|---|---|---|
| `wall.exterior` | `A-WALL` | 7 (white/black) | `Continuous` | `0.50` |
| `wall.interior` | `A-WALL-INTR` | 6 (magenta) | `Continuous` | `0.35` |
| `wall.interior.partition` | `A-WALL-PRHT` | 4 (cyan) | `Continuous` | `0.25` |
| `door.swing` | `A-DOOR-SWNG` | 3 (green) | `Continuous` | `0.18` |
| `door.plan` | `A-DOOR` | 3 (green) | `Continuous` | `0.25` |
| `window.plan` | `A-GLAZ` | 5 (blue) | `Continuous` | `0.25` |
| `dim.linear` | `A-ANNO-DIMS` | 2 (yellow) | `Continuous` | `0.13` |
| `text.note` | `A-ANNO-NOTE` | 7 | `Continuous` | `0.18` |
| `symbol.northArrow` | `A-ANNO-SYMB` | 7 | `Continuous` | `0.25` |
| `grid.column` | `S-GRID` | 1 (red) | `Center` | `0.18` |

The full 60-row table is shipped in `packages/schemas/src/dxf/layer-map-aia.ts`. The NCS (National CAD Standard, US) and the BS-1192 (UK) variants are sister tables at `layer-map-ncs.ts` and `layer-map-bs1192.ts`. Bijection is enforced for each.

CI gate: `tools/ga-gate/check-layer-mapping-reversibility.ts` — asserts that for every layer L in the default table, `aiaToPryzm(pryzmToAia(L)) === L` and vice versa.

### §1.3 — Line weights are calibrated to print thickness, NOT to screen pixels

DXF line weight is an enum (in 0.01 mm steps: `0`, `0.05`, `0.09`, `0.13`, `0.15`, `0.18`, `0.20`, `0.25`, `0.30`, `0.35`, `0.40`, `0.50`, `0.53`, `0.60`, `0.70`, `0.80`, `0.90`, `1.00`, `1.06`, `1.20`, `1.40`, `1.58`, `2.00`, `2.11`). Every PRYZM line-weight value MUST snap to the nearest DXF enum on export. On re-import, the enum value is the source of truth — no inference from on-screen pixels.

This invariant is consistent with [C29 §1.3](C29-PDF-VECTOR-EXPORT.md) (PDF line-weight calibration) — the same calibration table is used for both backends.

### §1.4 — Viewport scale preservation across paperspace tabs

Every paperspace `VIEWPORT` entity in the source DXF/DWG MUST round-trip with its scale (`view_target`, `view_direction`, `view_height`, `view_center`, `zoom`) preserved to within **1 part in 10⁶**. On export, the PRYZM `Sheet` ([C24](C24-SHEET-COMPOSITION-ENGINE.md)) viewport translates to a paperspace VIEWPORT with the same scale arithmetic.

PRYZM `Sheet` scale `1:50` translates to DXF VIEWPORT custom scale `0.02` (or `1=50` in imperial). The mapping is in `packages/schemas/src/dxf/scale-map.ts`.

Worked example — converting a PRYZM viewport at 1:100 metric:

```
PRYZM Sheet:        scale = { paperUnits: 1, modelUnits: 100 }, paperSize = A1
PRYZM Viewport:     centerPaper = (420, 297) mm, sizePaper = (300, 200) mm
                    viewCenter (modelspace, mm) = (15000, 12000)

DXF emit:
  $PAPERUNITS = 4 (mm)
  VIEWPORT entity in *Paper_Space layout:
    center (paper, mm) = (420, 297)
    width = 300, height = 200
    customScale = 0.01           ← (paperUnits / modelUnits) = 1/100
    viewCenter (modelspace) = (15000, 12000)
    viewHeight = 20000           ← (sizePaper.y / customScale) = 200/0.01

Re-import round-trip:
  PRYZM Viewport (reconstructed) :
    scale = { paperUnits: 1, modelUnits: 100 }   ← matches source
    centerPaper = (420, 297)                     ← matches
    viewCenter = (15000, 12000)                  ← matches
```

The arithmetic MUST be exact — no floating-point drift across round-trip. Tests in `__tests__/exporter/viewport-scale.test.ts` exercise the 16 canonical scales (`1:1`, `1:5`, `1:10`, `1:20`, `1:25`, `1:50`, `1:75`, `1:100`, `1:200`, `1:500`, `1:1000`, plus imperial `1/4"=1'`, `1/8"=1'`, `3/16"=1'`, `1/16"=1'`, `1/2"=1'`).

### §1.5 — Plot-style fidelity (CTB and STB both supported)

AutoCAD plot styles come in two flavours:

- **CTB** (Color-dependent Table) — each AutoCAD Color Index (ACI, 1–255) maps to a pen number, line weight, screening %, dithering, end-cap style, and grayscale flag.
- **STB** (Named Style Table) — named styles (e.g. `Heavy`, `Medium`, `Fine`, `Hidden`) decoupled from colour.

Both MUST be readable and writable. The PRYZM plot-style internal model is a discriminated union `PlotStyleTable = CtbTable | StbTable`. On import, the original style is preserved verbatim; on export, the writer emits whichever style the source PRYZM Sheet declared.

PRYZM SHOULD default new sheets to **STB** (named-style, modern AutoCAD practice). CTB is preserved on round-trip for legacy compatibility.

Worked example — translating a legacy CTB to PRYZM's internal plot-style model:

```
Source CTB (excerpt):
  entry[0]: { colorIndex: 1 (red),    pen: 1, lineWeight: 0.50, screening: 100%, dither: off }
  entry[1]: { colorIndex: 2 (yellow), pen: 2, lineWeight: 0.35, screening: 100%, dither: off }
  entry[2]: { colorIndex: 3 (green),  pen: 3, lineWeight: 0.25, screening: 100%, dither: off }
  entry[6]: { colorIndex: 7 (white),  pen: 7, lineWeight: 0.13, screening: 50%,  dither: on }

PRYZM PlotStyleStore.import(CtbTable) → preserves entries verbatim.

On re-export of an entity at layer="A-WALL" with color=7:
  1. Resolve color → ACI 7
  2. Lookup CtbTable.entries[6] → lineWeight = 0.13, screening = 50%
  3. Emit DXF entity with color=7; CTB sidecar (.ctb) preserved at sheet
```

For engineering vs architectural conventions:

- **Architectural (AIA / RIBA)** — PRYZM defaults to STB with named styles `Fine` (0.13), `Medium` (0.25), `Thick` (0.50), `XThick` (0.70). Line weights drive print thickness directly.
- **Engineering (ISO 128 / ANSI Y14.2)** — PRYZM defaults to CTB with the ANSI / ISO standard pen tables (full-bright 0.13, half-bright 0.18, full 0.25, double 0.50). The ANSI tables are pre-shipped under `packages/schemas/src/dxf/plot-styles/ansi-y14-2.ctb.ts`.

The choice is a project-level setting (`projectSettings.plotStyleConvention: 'aia' | 'riba' | 'ansi' | 'iso' | 'custom'`).

### §1.6 — Every DXF/DWG operation opens an OpenTelemetry span

Per P8, every public exported function in the DXF/DWG pipeline opens a span:

| Function | Span name | Attributes |
|---|---|---|
| `DxfImporter.importFromBytes` | `pryzm.dxf.import` | `{ byteSize, encoding, entityCount, layerCount, blockCount, durationMs }` |
| `DxfExporter.exportToBytes` | `pryzm.dxf.export` | `{ entityCount, layerCount, viewportCount, byteSize, durationMs }` |
| `DwgImporter.importFromBytes` | `pryzm.dwg.import` | `{ byteSize, dwgVersion, backend: 'oda' \| 'libredwg', entityCount, durationMs }` |
| `DwgExporter.exportToBytes` | `pryzm.dwg.export` | `{ entityCount, dwgVersion, backend, durationMs }` |
| `LayerMapTable.set` | `pryzm.dxf.layerMap.set` | `{ tableSize, overrideCount }` |
| `PlotStyleTable.import` | `pryzm.dxf.plotStyle.import` | `{ style: 'ctb' \| 'stb', entryCount }` |

CI gate: `tools/ga-gate/check-dxf-otel.ts` — every exported function in `plugins/dxf/src/` MUST open a span (the gate extends the existing P8 span-coverage check to this plugin).

### §1.7 — DWG access is license-aware

DWG is a proprietary binary format. PRYZM supports two backends:

| Backend | License | Coverage | Tier |
|---|---|---|---|
| **ODA Teigha** (Open Design Alliance) | Commercial (paid SDK) | DWG R12 → DWG 2024 (latest) | Enterprise / Studio tier |
| **LibreDWG** (GNU) | LGPL-3.0 (free) | DWG R13 → DWG 2018; partial coverage of 2024 | Solo / Free tier |

The active backend is selected by:

1. Environment variable `PRYZM_DWG_BACKEND=oda|libredwg|none` (server-side).
2. Customer tier (`packages/billing-claims` plan tier — Studio+ defaults to `oda` if license is provisioned).
3. Fallback: `libredwg` if `oda` is configured but unavailable at runtime (with a P8 warning span).
4. If neither is available, DWG commands are unregistered from the command bus and the import dialog hides the `.dwg` option (DXF remains available).

The license-tier mapping is defined in `packages/schemas/src/dxf/dwg-license.ts`. CI gate `tools/ga-gate/check-dwg-license.ts` ensures no code path invokes the ODA Teigha SDK without first checking the entitlement claim.

PRYZM SHALL NOT bundle the ODA Teigha SDK in the open-source repository. Studio+ deployments link against a pre-provisioned native binary at startup.

### §1.8 — Roundtrip determinism

Two consecutive round-trips (export → import → export → diff the two exports) MUST be **byte-identical** modulo a small allowed-delta set:

- DXF `$TDUPDATE` (last-update timestamp) — always changes; ignored by the diff.
- DXF `$HANDSEED` — always changes; ignored.
- The `*ACAD_RELEASE` header — pinned per emitter; ignored.

Everything else (entity order, handle assignment within a single export, layer order, block definition order) MUST be deterministic for the same input. Achieved via stable sort keys (handles assigned by `(layer, entityType, sourceOrder)` triple).

CI gate: `tools/ga-gate/check-dxf-tolerance.ts` (same gate as §1.1) additionally asserts byte-identity modulo the allowed-delta set.

### §1.9 — Text encoding — UTF-8 in DXF 2018+, fallback to per-page CIF in legacy versions

DXF 2018 (AutoCAD R32) and later support **UTF-8** natively via the `$DWGCODEPAGE` header set to `UTF-8`. PRYZM exports default to DXF R2018 (`$ACADVER = AC1032`) with UTF-8.

For legacy targets (R2007 → R2013), PRYZM emits Unicode escape sequences in the `\U+XXXX` format. For R2004 and earlier, PRYZM emits ANSI codepage with a `$DWGCODEPAGE` of `ANSI_1252` (or per-locale) and falls back to `\U+XXXX` for non-codepage characters.

On import, every text/mtext entity is normalised to UTF-8 in the PRYZM store. The original encoding is preserved on the entity's `dxfMeta.sourceEncoding` for accurate re-export.

### §1.10 — Block + xref resolution

DXF/DWG blocks (`INSERT` referencing a `BLOCK` definition) and external references (xrefs) MUST resolve at import time:

- **Embedded blocks** — inserted in-place as PRYZM `BlockInstance` elements that reference a `BlockDefinition` in the project.
- **Xref attach** (resolved file) — the referenced DXF/DWG is recursively imported into a sub-project link. PRYZM `XrefLink` stores the original path + the imported sub-project id.
- **Xref overlay** (one-level reference, no nested xrefs) — same as attach but with `nestedResolution: false`.
- **Unresolvable xrefs** — preserved as `XrefLink` with `status: 'unresolved'`. The user is shown a manage-xrefs dialog (§5.3) to remap paths.

Round-trip MUST preserve the xref distinction (attach vs overlay) on re-export.

### §1.11 — Drawing units canonical-millimetre, with $INSUNITS preserved

DXF stores drawing units in the `$INSUNITS` header (0=unspecified, 1=inches, 2=feet, 4=mm, 5=cm, 6=m, …). PRYZM's internal unit is **millimetres** (consistent with [C25](C25-IFC-EXPORT-PRODUCTION.md) and the renderer).

On import, every coordinate is converted to mm. The original `$INSUNITS` value is preserved on `DxfDocument.sourceInsUnits` for accurate re-export.

On export, the writer emits `$INSUNITS = 4` (mm) unless the source declared a different unit (in which case it converts back). User override via export dialog.

### §1.12 — DXF/DWG paths NEVER mutate the PRYZM store directly

Per [P6](../../01-strategy/engineering-vision.md), the DXF/DWG importer/exporter MUST NOT call `store.setState()` directly. All mutations route through the command bus via `dxf.import` / `dwg.import` (which internally call `commandBus.dispatch(CreateElement)` per parsed entity, batched per [C17 Batch creation](C17-BATCH-CREATE-CATALOGUE.md)).

CI gate: `tools/ga-gate/check-commandmanager.ts` (existing — extended) — flags any direct store mutation in `plugins/dxf/src/`.

### §1.13 — DXF/DWG paths are P2-clean — no THREE import

Per [P2](../../01-strategy/engineering-vision.md), `plugins/dxf/src/` MUST NOT `import * as THREE`. All geometry conversion uses `packages/geometry-kernel/` primitives (Vector2 / Vector3 / Box2 / Polyline). The 3D scene is materialised by the standard element-creation pipeline ([C11](C11-ELEMENT-CREATION-PIPELINE.md)), not by the DXF plugin.

CI gate: existing `tools/ga-gate/check-three-import-boundary.ts` extends to `plugins/dxf/`.

---

## §2 — Schema (in `packages/schemas/src/dxf/`)

All schemas are pure Zod — no I/O, no THREE, no DOM (per §1.13 + P5).

### §2.1 — Core schemas

| Schema | Owns | Notes |
|---|---|---|
| `DxfDocument` | `{ version: DxfVersion, encoding: 'utf-8' \| 'ansi-1252' \| 'ascii', insUnits: number, header: Record<string, DxfHeaderValue>, layers: DxfLayer[], lineTypes: DxfLineType[], textStyles: DxfTextStyle[], dimStyles: DxfDimStyle[], blocks: DxfBlock[], entities: DxfEntity[], paperspaceLayouts: DxfPaperspaceLayout[], plotStyleTable: PlotStyleTable, xrefs: XrefLink[] }` | Root document model. |
| `DxfVersion` | enum `'R12' \| 'R14' \| 'R2000' \| 'R2004' \| 'R2007' \| 'R2010' \| 'R2013' \| 'R2018' \| 'R2024'` | Format version. |
| `DxfLayer` | `{ name: string, color: AciColor \| TrueColor, lineType: string, lineWeight: LineWeightEnum, plotStyle: string, frozen: boolean, locked: boolean, off: boolean, plot: boolean }` | One row per layer. |
| `AciColor` | `number` (1–255) — AutoCAD Color Index | Used by CTB. |
| `TrueColor` | `{ r: number, g: number, b: number }` (0–255) | Used by 24-bit colour layers. |
| `LineWeightEnum` | one of the 24 DXF enum values per §1.3 | Snapped on assignment. |
| `DxfLineType` | `{ name: string, description: string, pattern: number[] }` | E.g. `Center` = `[12.7, -2.54, 0.0, -2.54]` (mm). |
| `DxfTextStyle` | `{ name: string, font: string, height: number, widthFactor: number, oblique: number, bigFont?: string }` | E.g. `Standard` = arial.ttf. |
| `DxfDimStyle` | `{ name: string, arrowSize, textHeight, extLineOffset, dimLineGap, textPlacement, units, suffix, prefix, precision, …~70 vars }` | Full AutoCAD DIMVAR set. |
| `DxfBlock` | `{ name: string, basePoint: Vec3, layer: string, entities: DxfEntity[], xref?: XrefLink }` | Block definition (template). |
| `BlockInstance` | `{ blockName: string, insertPoint: Vec3, scale: Vec3, rotation: number, attribs: BlockAttrib[] }` | INSERT entity. |
| `BlockAttrib` | `{ tag: string, value: string, prompt: string }` | Per-instance attribute (e.g. door label, room tag). |
| `XrefLink` | `{ name: string, path: string, type: 'attach' \| 'overlay', status: 'resolved' \| 'unresolved', subProjectId?: string }` | External reference. |
| `DxfEntity` | discriminated union per §2.2 | All drawing entities. |
| `DxfPaperspaceLayout` | `{ name: string, tabOrder: number, viewports: DxfViewport[], entities: DxfEntity[] }` | One layout = one paperspace tab. |
| `DxfViewport` | `{ centerPaper: Vec2, sizePaper: Vec2, viewTarget: Vec3, viewDirection: Vec3, viewHeight: number, viewCenter: Vec2, scale: ViewportScale, locked: boolean, frozenLayers: string[] }` | A paperspace window into modelspace. |
| `ViewportScale` | `{ paperUnits: number, modelUnits: number }` (e.g. `{ paperUnits: 1, modelUnits: 50 }` = 1:50) | Preserved per §1.4. |
| `PlotStyleTable` | discriminated union `CtbTable \| StbTable` | See §2.3. |

### §2.2 — `DxfEntity` discriminated union

Every primitive type. The `type` discriminator is the DXF entity name (lowercased).

| `type` | Extra fields |
|---|---|
| `'line'` | `start: Vec3, end: Vec3` |
| `'lwpolyline'` | `vertices: Array<{ point: Vec2, bulge: number }>, closed: boolean, elevation: number, constantWidth?: number` |
| `'polyline'` | `vertices: Vec3[], closed: boolean` (3D polyline) |
| `'arc'` | `center: Vec3, radius: number, startAngle: number, endAngle: number, normal: Vec3` |
| `'circle'` | `center: Vec3, radius: number, normal: Vec3` |
| `'ellipse'` | `center: Vec3, majorAxis: Vec3, axisRatio: number, startParam: number, endParam: number` |
| `'spline'` | `degree: number, knots: number[], controlPoints: Vec3[], weights?: number[], fitPoints?: Vec3[], closed: boolean` |
| `'hatch'` | `patternName: string, patternScale: number, patternAngle: number, solid: boolean, boundaryPaths: HatchBoundary[]` |
| `'text'` | `insertion: Vec3, height: number, value: string, rotation: number, styleName: string, alignment: TextAlignment` |
| `'mtext'` | `insertion: Vec3, height: number, value: string, width: number, rotation: number, styleName: string, attachment: number, formattingCodes: string` |
| `'dimension'` | `dimType: 'linear' \| 'aligned' \| 'angular' \| 'radius' \| 'diameter' \| 'ordinate', defPoints: Vec3[], textMidPoint: Vec3, dimStyleName: string, measurement: number, textOverride?: string` |
| `'leader'` | `vertices: Vec3[], hasArrow: boolean, annotationHandle?: string` |
| `'mleader'` | `contextData: MLeaderContext, styleName: string` |
| `'insert'` | `BlockInstance` (see §2.1) |
| `'viewport'` | `DxfViewport` (see §2.1) — only valid in paperspace |
| `'point'` | `point: Vec3` |
| `'solid'` | `vertices: Vec3[]` (3 or 4 points) |
| `'3dface'` | `vertices: [Vec3, Vec3, Vec3, Vec3]` |
| `'image'` | `path: string, insertion: Vec3, uVector: Vec3, vVector: Vec3, sizePixels: Vec2` |

All entity types carry common fields: `{ handle: string, layer: string, color?: AciColor \| TrueColor, lineType?: string, lineWeight?: LineWeightEnum, ownerHandle?: string, dxfMeta: DxfMeta }`.

`DxfMeta` = `{ sourceVersion: DxfVersion, sourceEncoding: string, sourceHandle: string }` — preserved for fidelity round-trip per §1.9.

### §2.3 — Plot-style schemas

| Schema | Owns |
|---|---|
| `CtbTable` | `{ kind: 'ctb', name: string, entries: CtbEntry[] }` |
| `CtbEntry` | `{ colorIndex: AciColor, penNumber: number, lineWeight: LineWeightEnum, screening: number, dither: boolean, grayscale: boolean, lineEndStyle: number, lineJoinStyle: number, fillStyle: number }` (255 entries per CTB) |
| `StbTable` | `{ kind: 'stb', name: string, entries: StbEntry[] }` |
| `StbEntry` | `{ name: string, lineWeight: LineWeightEnum, screening: number, dither: boolean, grayscale: boolean, lineEndStyle: number, lineJoinStyle: number, fillStyle: number }` (named) |

### §2.4 — Layer-map schema

| Schema | Owns |
|---|---|
| `LayerMapTable` | `{ name: string, entries: LayerMapEntry[] }` |
| `LayerMapEntry` | `{ pryzmLayer: PryzmSemanticLayer, aiaLayer: string, color: AciColor \| TrueColor, lineType: string, lineWeight: LineWeightEnum, plotStyle: string }` |
| `PryzmSemanticLayer` | string enum: `'wall.exterior'`, `'wall.interior'`, `'wall.interior.partition'`, `'door.swing'`, `'door.plan'`, `'window.plan'`, `'slab'`, `'roof'`, `'stair'`, `'column'`, `'beam'`, `'furniture'`, `'fixture.plumbing'`, `'fixture.electrical'`, `'fixture.light'`, `'dim.linear'`, `'dim.angular'`, `'text.note'`, `'text.title'`, `'symbol.northArrow'`, `'symbol.scaleBar'`, `'grid.column'`, `'grid.level'`, `'sheet.border'`, `'sheet.titleBlock'`, `'sheet.viewport'`, …~60 enum values total |

Default `LayerMapTable` (AIA / NCS standard) ships in `packages/schemas/src/dxf/layer-map-aia.ts`. Customer overrides validate via `LayerMapTable.parse(…)` at load.

---

## §3 — Stores / API surface

The DXF/DWG round-trip exposes three runtime surfaces.

### §3.1 — `DxfImporter` (in `plugins/dxf/src/importer/`)

```typescript
/** Parses DXF bytes (ASCII or binary) into a typed DxfDocument. */
export class DxfImporter {
  importFromBytes(bytes: Uint8Array): Promise<DxfDocument>;
  importFromBytesStreaming(stream: ReadableStream<Uint8Array>): AsyncIterable<DxfEntity>;
}
```

`DxfImporter` parses both ASCII (group-code text) and binary DXF (`DXF` sentinel header). The streaming variant yields entities incrementally for large files (NFT §7) — entities are routed to the command bus via [C17 §2 batch creation](C17-BATCH-CREATE-CATALOGUE.md) at a configurable batch size (default 500).

### §3.2 — `DxfExporter` (in `plugins/dxf/src/exporter/`)

```typescript
/** Serialises a PRYZM project (or sheet set) to a DxfDocument and emits bytes. */
export class DxfExporter {
  exportToBytes(doc: DxfDocument, opts: { format: 'ascii' \| 'binary', version: DxfVersion }): Promise<Uint8Array>;
  exportProject(projectId: string, opts: DxfExportOptions): Promise<DxfDocument>;
  exportSheet(sheet: Sheet, opts: DxfExportOptions): Promise<DxfDocument>;
}
```

`DxfExportOptions` = `{ format, version, encoding, includeXrefs, includePaperspace, layerMap?: LayerMapTable, plotStyle?: PlotStyleTable, insUnits?: number }`.

### §3.3 — `DwgImporter` + `DwgExporter` (in `plugins/dxf/src/dwg/`)

```typescript
/** DWG read/write via the active backend (ODA Teigha or LibreDWG). */
export class DwgImporter {
  importFromBytes(bytes: Uint8Array): Promise<DxfDocument>;
  readonly backend: 'oda' \| 'libredwg' \| 'none';
}

export class DwgExporter {
  exportToBytes(doc: DxfDocument, opts: { dwgVersion: DwgVersion }): Promise<Uint8Array>;
  readonly backend: 'oda' \| 'libredwg' \| 'none';
}
```

Both classes accept the same `DxfDocument` model — DWG is a binary serialisation of the same abstract document. The backend is selected at composition time (per §1.7) via `composeRuntime({ dwgBackend })` in [C02 Composition](C02-COMPOSITION-AND-RUNTIME.md).

### §3.4 — `LayerMapStore` (in `plugins/dxf/src/stores/`)

```typescript
/** Holds the active LayerMapTable for the project. Persisted in .pryzm. */
export interface LayerMapStore {
  getActive(): LayerMapTable;
  setActive(table: LayerMapTable): void;
  subscribe(listener: (table: LayerMapTable) => void): () => void;
}
```

The store is L3 (per the 8-layer model). It is a Zustand store consumed by the import dialog (§5.2), the export dialog (§5.1), and both importer/exporter at run time.

### §3.5 — `PlotStyleStore` (in `plugins/dxf/src/stores/`)

```typescript
/** Holds CTB and STB plot-style tables imported from upstream drawings. */
export interface PlotStyleStore {
  getCtb(name: string): CtbTable | undefined;
  getStb(name: string): StbTable | undefined;
  import(table: PlotStyleTable): void;
  list(): PlotStyleTable[];
}
```

---

## §4 — Commands

Per [C16 Command authoring](C16-COMMAND-AUTHORING-PROTOCOL.md), every operation is a typed command.

| Command | Effect | Undo |
|---|---|---|
| `dxf.import` | Parse a `.dxf` blob; create PRYZM elements per [C11](C11-ELEMENT-CREATION-PIPELINE.md). Batched per [C17](C17-BATCH-CREATE-CATALOGUE.md). | One-undo (deletes all created elements + xref links). |
| `dxf.export` | Serialise the current project (or named sheet) to `.dxf` bytes. Pure read of the store. | No-op (read). |
| `dwg.import` | As `dxf.import`, via the active DWG backend. | One-undo. |
| `dwg.export` | As `dxf.export`, via the active DWG backend. | No-op (read). |
| `dxf.layerMap.set` | Replace the active `LayerMapTable`. | Snapshot the previous table; undo restores. |
| `dxf.plotStyle.import` | Add a CTB or STB to `PlotStyleStore`. | Removes the imported table. |
| `dxf.xref.resolve` | Re-resolve an `unresolved` xref against a new path. | Restores the prior `unresolved` state. |
| `dxf.xref.detach` | Detach an xref (delete `XrefLink` and orphan its sub-project link). | Restores the link. |

All commands open OTel spans per §1.6 and route through `commandBus.dispatch()` (no direct store writes per §1.12).

---

## §5 — UI

The DXF/DWG plugin contributes three editor surfaces.

### §5.1 — Export dialog

Entry point: `File → Export → DXF…` / `File → Export → DWG…`. The dialog exposes:

- Format selection (ASCII vs binary DXF; DWG version R12 → R2024).
- Version target (DXF R2000 → R2024; DWG matched to version).
- Encoding (UTF-8 / ANSI-1252 / ASCII).
- Scope: entire project · single sheet · selected sheets · selected elements.
- Layer-map override (drop-down from `LayerMapStore`).
- Plot-style override (drop-down from `PlotStyleStore`).
- Include xrefs (resolved inline as blocks, or kept as `XATTACH`).
- Include paperspace tabs (one `*Paper_Space` layout per PRYZM sheet).
- Output filename + path.

On confirm, dispatches `dxf.export` or `dwg.export`. A toast confirms success with a "Reveal in folder" action. P8 span attached.

### §5.2 — Import dialog

Entry point: `File → Import → DXF / DWG…` and drag-drop of `.dxf` / `.dwg` onto the editor.

- File picker (multi-file supported — each becomes a separate `XrefLink` if "Import as xref" is selected).
- Preview thumbnail (rendered from header + first ~50 entities).
- Layer-map selection (apply the project's active map, or pick a different one).
- Import mode: **Merge into current project** · **Open as new project** · **Attach as xref**.
- Units override (use source `$INSUNITS`, or force a unit).
- Unresolvable xref handling: skip / keep as unresolved / browse for path.

On confirm, dispatches `dxf.import` or `dwg.import`. Progress bar shows entity count / total. P8 span attached.

### §5.3 — Layer mapping panel

Entry point: `Settings → DXF Layer Mapping…` or in-line from the Import / Export dialogs.

A two-column grid:

| PRYZM semantic layer | AIA layer name | Color | Line type | Line weight | Plot style |
|---|---|---|---|---|---|

- Filter by category (wall / door / window / dim / text / …).
- Edit any cell inline; bijection constraint validated on save (per §1.2).
- Import a customer-supplied JSON map; export the current map to JSON.
- Reset-to-AIA-default button.

Saves dispatch `dxf.layerMap.set`. The grid is the only UI affordance that mutates `LayerMapStore`.

### §5.4 — Xref manager panel

Entry point: `View → Xref Manager` or right-click an xref in the project tree.

Lists every `XrefLink` with: name, path, status (resolved / unresolved / circular), type (attach / overlay), and last-resolved timestamp. Per-row actions: reload, detach, change path. Dispatches `dxf.xref.resolve` or `dxf.xref.detach`.

---

## §6 — Tests / CI gates

### §6.1 — Unit test coverage (per package)

| Suite | What it covers |
|---|---|
| `plugins/dxf/__tests__/importer/*.test.ts` | Group-code parser, binary DXF parser, every entity type round-trips through the schema. |
| `plugins/dxf/__tests__/exporter/*.test.ts` | Every entity type emits valid group-code; AutoCAD round-trip fixture validates against `dxf-parser` reference lib. |
| `plugins/dxf/__tests__/layer-map/*.test.ts` | Default AIA map bijective; bijection constraint rejects malformed customer overrides. |
| `plugins/dxf/__tests__/plot-style/*.test.ts` | CTB + STB parser; round-trip CTB / STB tables. |
| `plugins/dxf/__tests__/dwg/*.test.ts` | Backend abstraction unit-tested with a fake; ODA + LibreDWG are integration-tested in their own jobs. |

### §6.2 — Tolerance + reversibility CI gates

| Gate | What it checks | Implementation |
|---|---|---|
| `check-dxf-tolerance` | Geometry ≤ 1 mm; line weight ≤ 0.5 pt; deterministic re-export | NEW `tools/ga-gate/check-dxf-tolerance.ts` — runs 10 canonical fixtures through round-trip. |
| `check-dwg-license` | No code path invokes Teigha SDK without an entitlement claim | NEW `tools/ga-gate/check-dwg-license.ts`. |
| `check-layer-mapping-reversibility` | `aiaToPryzm(pryzmToAia(L)) === L` and vice versa | NEW `tools/ga-gate/check-layer-mapping-reversibility.ts`. |
| `check-dxf-otel` | Every exported function in `plugins/dxf/src/` opens a span | extends the existing P8 span-coverage check. |
| `check-three-import-boundary` | `plugins/dxf/` MUST NOT `import * as THREE` | extends existing P2 gate. |
| `check-commandmanager` | `plugins/dxf/` MUST NOT call `store.setState()` directly | extends existing P6 gate. |

### §6.3 — Integration suite (per backend)

| Suite | What it covers | Runs in |
|---|---|---|
| `plugins/dxf/__tests__/integration/autocad-roundtrip.spec.ts` | Round-trip 5 reference drawings through AutoCAD 2024 (headless) and assert tolerance | Nightly only (license-gated). |
| `plugins/dxf/__tests__/integration/draftsight-roundtrip.spec.ts` | Same, via DraftSight | Nightly. |
| `plugins/dxf/__tests__/integration/libredwg-roundtrip.spec.ts` | Same, via LibreDWG | Per-PR. |
| `plugins/dxf/__tests__/integration/qcad-roundtrip.spec.ts` | Same, via QCAD | Nightly. |

---

## §7 — NFT targets

Per [C10 Performance & Observability](C10-PERFORMANCE-AND-OBSERVABILITY.md), DXF/DWG operations have hard NFT budgets.

| NFT | Target | Bench |
|---|---|---|
| 10 MB DXF import (~50k entities) | < 3 s | `dxf-import-10mb.bench.ts` (new) |
| 10 MB DXF export | < 2 s | `dxf-export-10mb.bench.ts` (new) |
| 50 MB DXF streaming import | < 15 s (peak memory < 500 MB) | `dxf-import-50mb-stream.bench.ts` (new) |
| Round-trip geometry diff (10 MB drawing) | < 1 mm per vertex | enforced by `check-dxf-tolerance` |
| Round-trip byte diff (modulo §1.8 allow-list) | 0 bytes | enforced by `check-dxf-tolerance` |
| DWG import (ODA Teigha, 10 MB) | < 4 s | `dwg-oda-import.bench.ts` (new) |
| DWG import (LibreDWG, 10 MB) | < 8 s | `dwg-libredwg-import.bench.ts` (new) |
| Layer-map dialog open (200 entries) | < 100 ms | `layer-map-panel.bench.ts` (new) |
| Plot-style import (CTB, 255 entries) | < 50 ms | `plot-style-import.bench.ts` (new) |

NFT regressions hard-fail the build per [C10 §6](C10-PERFORMANCE-AND-OBSERVABILITY.md).

---

## §8 — Migration plan

Today's `plugins/dxf/` is the **F-prereq.0 scaffold** — it exposes only `PLUGIN_ID` and `PLUGIN_NAME` and contributes nothing.

The migration is a green-field implementation of this contract on top of the existing scaffold (no legacy code to delete). Phasing:

| Phase | Deliverable | Effort |
|---|---|---|
| **D-DXF-α** | DXF read/write — ASCII + binary; every entity in §2.2 except `mleader`, `spline`, `image`. Layer map + plot-style stores. Import + Export dialogs. Tolerance + reversibility CI gates. | ~2 wk |
| **D-DXF-β** | Spline + MLeader + Hatch pattern library + Image entity. Paperspace + viewports per §1.4. XATTACH + XOVERLAY xref resolution per §1.10. Xref manager panel. | ~2 wk |
| **D-DWG-α** | DWG read/write via LibreDWG backend (LGPL fallback). Backend selection logic per §1.7. CI gates `check-dwg-license`. | ~2 wk |
| **D-DWG-β** | ODA Teigha backend integration (license-gated; Studio+ tier). Per-PR integration tests against AutoCAD 2024 + DraftSight. | ~3 wk (license + integration) |
| **D-DXF-γ** | DXF/DWG round-trip with [C24](C24-SHEET-COMPOSITION-ENGINE.md) sheets — paperspace tabs == PRYZM sheets. Layer-map sync with [C25](C25-IFC-EXPORT-PRODUCTION.md) IFC export so IFC `IfcAnnotation` round-trips with DXF dim/text. | ~1 wk |

Total: ~10 sprint-weeks.

Code in `plugins/dxf/` stays where it is; only the F-prereq.0 stub gets replaced. The `PLUGIN_ID = 'dxf'` and the descriptor slot are preserved (so PRYZM 2 wireup paths that reserved the slot continue to compile).

---

## §9 — What is NOT in this contract

- **IFC interchange** — [C25](C25-IFC-EXPORT-PRODUCTION.md). DXF and IFC are independent interchange surfaces; they share the layer-name standards and unit conventions but not the writer.
- **PDF export** — [C29](C29-PDF-VECTOR-EXPORT.md). PDF is print-deliverable; DXF/DWG is editable interchange. Different writers, different fidelity bars.
- **Sheet composition** — [C24](C24-SHEET-COMPOSITION-ENGINE.md). C32 consumes PRYZM `Sheet` objects to produce DXF paperspace tabs and vice versa — it does NOT define sheets.
- **Revit round-trip** — [C26](C26-REVIT-ROUND-TRIP.md). Revit `.rvt` uses IFC as the bridge, not DXF.
- **Rhino interchange** — `C33 — Rhino Interchange` (proposed; see [MISSING-CONTRACTS-AUDIT-2026-06-01.md §3.2](../MISSING-CONTRACTS-AUDIT-2026-06-01.md)).
- **Drawing standards** (sheet sizes, line-weight policy, north-arrow conventions, drawing stamps per AIA / RIBA) — `C34 — Print & Drawing Standards` (proposed). C32 obeys whatever standard C34 dictates; it does not define the standards.
- **Print drivers / plotter calibration** — out of scope. C32 emits DXF / DWG; the user's CAD program drives the plotter.
- **Raster (BMP / PNG / TIFF) interchange** — out of scope. DXF embeds raster via `IMAGE` entity per §2.2; PRYZM stores them as opaque `ImageWidget` per [C24](C24-SHEET-COMPOSITION-ENGINE.md).
- **BCF (BIM Collaboration Format) round-trip** — `C36 — Clash Detection & Coordination` (proposed).
- **PDF/A-3 embedded DXF** — out of scope. PDF/A-3 supports embedding arbitrary files (see [C29 §3](C29-PDF-VECTOR-EXPORT.md) for IFC embed); PRYZM MAY embed a DXF sidecar in a PDF/A-3 via the [C29](C29-PDF-VECTOR-EXPORT.md) `attachFile` API. That is a C29 feature; the DXF emitted is the C32 writer's output.

---

*End — C32 DXF/DWG Round-Trip, 2026-06-01.*
