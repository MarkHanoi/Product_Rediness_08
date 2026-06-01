# C33 — Rhino Interchange

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: bi-directional translation between PRYZM `.pryzm` and McNeel Rhino `.3dm`, including Grasshopper definition import as PRYZM parametric families per P0. Owns the reader (extending today's read-only `plugins/rhino-import/`), the writer, the Grasshopper bridge, and the layer / unit / view mapping. NURBS curves, surfaces, and breps are preserved as NURBS in the canonical store — never silently tessellated.
> **Depends on**: [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) (schemas/commands/state), [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md) (the `.pryzm` archive must carry NURBS payloads round-trip), [C07](C07-PLUGIN-SDK-AND-MARKETPLACE.md) (the importer is a plugin under the L7 boundary), [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) (NFT budgets + spans), [C12](C12-GEOSPATIAL.md) (units + LTP-ENU rebasing when a 3dm file carries a `EarthAnchorPoint`).
> **Sibling interchange contracts**: [C25](C25-IFC-EXPORT-PRODUCTION.md) (IFC), [C26](C26-REVIT-ROUND-TRIP.md) (Revit via IFC4), [C32](C32-DXF-DWG-ROUND-TRIP.md) (DXF/DWG). Rhino is a sibling format — these contracts do NOT compose; each owns its own reader/writer and schema.
> **Downstream**: design-import workflows (concept geometry from Rhino → PRYZM authoring), parametric workflows (Grasshopper definitions → P0 families), inter-firm consultant handoff.
> **Key principles**: **P5** (Rhino mapping schemas pure — Zod-only in `packages/schemas/src/rhino/`), **P6** (every import / export mutation goes through the command bus), **P7** (Rhino layer visibility is intent, not UI state), **P8** (every reader / writer / bridge entry-point emits ≥ 1 OpenTelemetry span).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md §10](../../03-execution/plans/master-implementation-plan.md) (interchange tier).
> **Prior-art**: [PRYZM3-PRIOR-ART-AUDIT-2026-05-31.md §3.2](../../03-execution/status/prior-art-audit-2026-05-31.md). PRYZM 2 reference: S57 (`plugins/rhino-import/` — read-only; curves / meshes / layers / points only; brep / SubD / Extrusion dropped unless render mesh present). **Verdict: AUDIT + EXTEND** — the read path exists at v0.1 fidelity; this contract codifies it and adds the writer, the Grasshopper bridge, NURBS round-trip, and the view / annotation / unit-coercion invariants the v0.1 reader skips.

---

## §1 — Invariants

### §1.1 — NURBS are preserved as NURBS, never silently tessellated

`Rhino3dmReader` MUST preserve `ON_NurbsCurve`, `ON_NurbsSurface`, and `ON_Brep` as a canonical NURBS payload in the PRYZM store. Tessellation MAY occur at render / picking / export time but the canonical record MUST retain the control-point / knot-vector / trim-curve data. The current v0.1 reader (`plugins/rhino-import/src/reader.ts`) drops Brep / SubD / Extrusion unless a render mesh is present — this is a **known gap** closed by §8 Migration P1.

A reader that loses NURBS fidelity SHALL annotate the produced element with `geometryFidelity: 'mesh-fallback'` and emit a `pryzm.rhino.import.nurbs_fallback` counter on the span. Silent fallback is a CI failure (see §6 `check-rhino-tolerance`).

### §1.2 — Layer name and full path are preserved

Every Rhino layer name AND its `fullPath` (the `Parent::Child::Leaf` resolution Rhino uses for nested layers) MUST round-trip byte-identical. PRYZM stores both in `RhinoLayer` and applies them as element tags during import and reads them back during export. Layer hierarchy is preserved as an ordered tree, not flattened.

### §1.3 — Units are coerced to metric millimetres internally; the source unit is preserved as a property

On import, all geometry is scaled into PRYZM's canonical internal unit (millimetres, per [C12 §2](C12-GEOSPATIAL.md)). The original Rhino `modelUnitSystem` (millimetres / centimetres / metres / inches / feet) is stamped on the produced `Rhino3dmDocument.sourceUnit` and on every element's `_provenance.sourceUnit` for export round-trip. On export, the writer uses the project's preferred Rhino unit (settable per export, default = source unit if known else millimetres) and scales geometry on the way out.

Tolerance scaling MUST be unit-aware: a Rhino file authored in feet with `absoluteTolerance = 0.001 ft` MUST be coerced to `0.001 ft × 304.8 mm/ft = 0.3048 mm` on import, NOT `0.001 mm`.

### §1.4 — Curve direction is preserved

For every `ON_Curve` (line / polyline / arc / NURBS), the parametric direction (start → end) MUST be preserved. Closed curves preserve their seam point. Reversal during import is forbidden; reversal during export is forbidden. Curve direction matters for downstream Grasshopper definitions (`Flip Curve` operations rely on it) and for hatch / boundary orientation.

### §1.5 — Grasshopper definitions import as P0 parametric families

When a `.3dm` carries an embedded Grasshopper definition (`.gh` / `.ghx`) OR when a sibling `.gh` file is loaded alongside, the `GhDefinitionBridge` MUST translate the definition into a **PRYZM parametric family** per the P0 Family Platform (see [family-platform-strategic-direction memory](../../../C:/Users/LENOVO/.claude/projects/c--Users-LENOVO-OneDrive-Desktop-PRYZM-Product-Rediness-08/memory/family-platform-strategic-direction.md) and [PRYZM03-APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md](../../03-execution/plans/apartment-family-platform-and-user-defined-elements-2026-05-30.md) — note: the canonical P0 contract is not yet ratified). The bridge MUST register the family via the standard `FamilyRegistry.register()` call — the bridge has no privileged write path.

The bridge is **purely declarative**: it reads a frozen `GhDefinition` JSON graph (nodes + wires + parameter exposures) and emits a family descriptor. It MUST NOT execute Grasshopper components at import time — execution happens lazily when the family is instanced.

### §1.6 — Annotations import as PRYZM annotations (not geometry)

`ON_TextEntity`, `ON_Leader`, `ON_DimAngular`, `ON_DimLinear`, `ON_DimRadial`, `ON_Hatch` MUST be mapped to PRYZM's annotation/dimension/hatch element types — not to curves or meshes. Annotation styles (font / arrow head / dim-style) MUST be preserved. This is a contract-level gap in v0.1 (the reader emits curves for everything non-point/curve/mesh).

### §1.7 — Views are preserved (named + numbered + standard)

Named views (`ON_ViewportInfo` saved in `views`), standard views (Top / Front / Right / Perspective), and layout views are all preserved as PRYZM `RhinoView` records. PRYZM's own view system does NOT consume them by default, but they are available for re-export and for the inspector. View round-trip is REQUIRED on a complete bidirectional flow.

### §1.8 — Every reader / writer / bridge entry-point emits an OpenTelemetry span

Per P8, every public exported function in `@pryzm/plugin-rhino-import` and the new `@pryzm/plugin-rhino-export` and `@pryzm/plugin-rhino-grasshopper-bridge` MUST open a span. Span names:

- `pryzm.rhino.import` (top-level read) — already exists per `plugins/rhino-import/src/reader.ts` line 182.
- `pryzm.rhino.export` (top-level write).
- `pryzm.rhino.bridge.run` (Grasshopper definition translation).
- `pryzm.rhino.layer.map` (per-layer mapping, child of import/export).
- `pryzm.rhino.unit.convert` (unit coercion, child of import/export).

Spans MUST carry `{ byte_count, layers, points, curves, meshes, breps, nurbsSurfaces, annotations, droppedNoMesh, nurbsFallback }` attributes.

### §1.9 — No `window.*` reads, no THREE imports in the plugin

The Rhino reader/writer/bridge MUST stay schema-pure: zero `THREE` imports (P2), zero `(window as any)` reads (P4), zero `requestAnimationFrame` (P3). All geometry conversion is plain TypeScript working on `Float32Array` / `Uint32Array` buffers. Tessellation for rendering happens later in `packages/renderer-three/`, NOT in the plugin.

### §1.10 — Round-trip is provenance-preserving

A `.3dm` → PRYZM → `.3dm` round-trip MUST satisfy: layers preserved (count, names, full paths, colors, visibility), units preserved, curves preserved (count, control points, direction, closed/open flag), NURBS surfaces preserved (control points, knots, weights, trims — within `absoluteTolerance`), annotations preserved, views preserved. A `check-rhino-roundtrip` CI gate runs a 12-file reference suite (see §6).

### §1.11 — Reader is non-throwing on partial corruption

Per the v0.1 reader's behaviour (`droppedNoMesh++` counter) the reader MUST NOT throw on unrecognised object types or partially-corrupt geometry. Instead it MUST increment a typed counter in `Rhino3dmDocument.counts` and continue. Throwing is reserved for total file corruption (`rhino3dm.File3dm.fromByteArray` returns `null`).

---

## §2 — Schema (in `packages/schemas/src/rhino/`)

All Rhino mapping schemas are pure Zod (P5) with zero I/O, zero THREE, zero DOM. They live in `packages/schemas/src/rhino/` and are consumed by `@pryzm/plugin-rhino-import`, `@pryzm/plugin-rhino-export`, and `@pryzm/plugin-rhino-grasshopper-bridge`.

### §2.1 — `Rhino3dmDocument`

The normalised top-level result of a 3DM read.

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | `number` | Rhino file schema version (3 / 4 / 5 / 6 / 7 / 8). |
| `application` | `string` | "Rhinoceros 8.5", "Rhinoceros 7.36", etc. |
| `sourceUnit` | `'millimeters' \| 'centimeters' \| 'meters' \| 'inches' \| 'feet' \| 'unknown'` | Original `modelUnitSystem`. Internal representation is always millimetres per §1.3. |
| `absoluteTolerance` | `number` | In millimetres (after §1.3 coercion). |
| `angleTolerance` | `number` | Radians. |
| `layers` | `RhinoLayer[]` | See §2.2. |
| `views` | `RhinoView[]` | See §2.3. |
| `objects` | `RhinoObject[]` | Union of `RhinoPoint \| RhinoCurve \| RhinoMesh \| RhinoBrep \| RhinoNurbsSurface \| RhinoAnnotation \| RhinoHatch`. |
| `definitions` | `GhDefinition[]` | Embedded Grasshopper definitions, if any. See §2.4. |
| `counts` | object | `{ layers, points, curves, meshes, breps, nurbsSurfaces, annotations, hatches, definitions, droppedNoMesh, nurbsFallback }`. |
| `earthAnchorPoint` | `{ lat: number; lon: number; elevation: number } \| null` | If present, used to seed the project's LTP-ENU origin per [C12](C12-GEOSPATIAL.md). |

### §2.2 — `RhinoLayer`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Rhino layer GUID. |
| `name` | `string` | Leaf name. |
| `fullPath` | `string` | `Parent::Child::Leaf` per §1.2. |
| `parentLayerId` | `string \| null` | Null at root. |
| `visible` | `boolean` | Per §1.2, also mapped to PRYZM visibility intent per [C09 §3](C09-AI-AND-VISIBILITY-INTENT.md) on import. |
| `locked` | `boolean` | Rhino lock state — preserved but not enforced by PRYZM. |
| `color` | `{ r: number; g: number; b: number; a?: number }` | 0-255 ints. |
| `lineweightMm` | `number \| 'default'` | Print line weight. |
| `linetype` | `string` | Rhino linetype name; matched against PRYZM linetype table on import where possible. |

### §2.3 — `RhinoView`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Stable id (Rhino does not GUID views — synthesised from name). |
| `name` | `string` | "Top", "Perspective", or named-view label. |
| `kind` | `'standard' \| 'named' \| 'layout'` | Layout views correspond to drawing sheets per [C24](C24-SHEET-COMPOSITION-ENGINE.md). |
| `projection` | `'perspective' \| 'parallel'` | |
| `camera` | `{ position: Vec3; target: Vec3; up: Vec3; lens?: number }` | Lens in millimetres for perspective; absent for parallel. |
| `clip` | `{ near: number; far: number }` | |
| `displayMode` | `string` | Rhino display mode name (Wireframe / Shaded / Rendered / Technical / Ghosted / X-Ray / Artistic / Pen). Preserved for round-trip; PRYZM does NOT honour these on render. |

### §2.4 — `GhDefinition`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Synthesised hash of the `.gh` / `.ghx` payload — content-addressable. |
| `name` | `string` | Filename or embedded label. |
| `format` | `'gh' \| 'ghx'` | Binary or XML. |
| `nodes` | `GhNode[]` | `{ id, componentGuid, label, position: { x, y }, params: Record<string, GhParamValue> }`. |
| `wires` | `GhWire[]` | `{ from: { nodeId, outputName }, to: { nodeId, inputName } }`. |
| `inputs` | `GhExposedInput[]` | User-facing inputs that become P0 family parameters. `{ name, kind: 'number' \| 'integer' \| 'point' \| 'curve' \| 'boolean' \| 'string', defaultValue }`. |
| `outputs` | `GhExposedOutput[]` | Geometry outputs that the family resolves to: `{ name, kind: 'curve' \| 'surface' \| 'brep' \| 'mesh' \| 'point' }`. |
| `provenance` | `{ rhinoVersion: string; ghVersion: string; importedAt: string }` | Stamped at import time. |

`GhDefinition` is **purely declarative metadata**. It does NOT carry executable code. Per §1.5, execution is delegated to the Grasshopper runtime which is **out of monorepo scope** — see §4.3.

### §2.5 — `RhinoObject` discriminated union

```ts
export type RhinoObject =
  | RhinoPoint           // { kind: 'point', position: Vec3 }
  | RhinoCurve           // polyline or NURBS — sees §2.6 for NURBS detail
  | RhinoMesh            // tessellated mesh (vertices + faces)
  | RhinoBrep            // boundary representation — NURBS faces + trims
  | RhinoNurbsSurface    // single trimmed NURBS surface
  | RhinoAnnotation      // text / dim / leader (see §1.6)
  | RhinoHatch;          // hatch fill bound to a closed curve
```

Every object has `{ id, layerId, attributes: { name?, userText?: Record<string,string> } }`. `userText` is the Rhino key-value user dictionary — preserved for round-trip even when PRYZM does not consume the data.

### §2.6 — `RhinoCurve` NURBS payload

| Field | Type | Notes |
|---|---|---|
| `kind` | `'curve'` | |
| `subkind` | `'line' \| 'polyline' \| 'arc' \| 'circle' \| 'ellipse' \| 'nurbs'` | Preserved exactly — `Arc` is not silently elevated to `NurbsCurve`. |
| `degree` | `number` | NURBS degree if `subkind === 'nurbs'`. |
| `controlPoints` | `Float64Array` | `[x0,y0,z0,w0, x1,y1,z1,w1, …]` for NURBS (rational, with weights), else `[x,y,z,…]`. Length divisible by 4 (NURBS) or 3 (polyline). |
| `knots` | `Float64Array \| null` | Knot vector for NURBS. Length = `controlPointCount + degree - 1` for non-periodic, `controlPointCount + 2*degree - 1` for periodic. |
| `closed` | `boolean` | Closed flag (preserves seam location). |
| `periodic` | `boolean` | A periodic NURBS curve has C^k continuity across the seam; closed-but-not-periodic curves do NOT. Preserved exactly. |
| `direction` | `'forward' \| 'reversed'` | Per §1.4. Default `'forward'` for new geometry. |
| `domainStart` | `number` | Parametric domain start. |
| `domainEnd` | `number` | Parametric domain end. |

### §2.7 — `RhinoNurbsSurface` payload

| Field | Type | Notes |
|---|---|---|
| `kind` | `'nurbs-surface'` | |
| `degreeU` | `number` | NURBS degree in U direction (typically 1-9). |
| `degreeV` | `number` | NURBS degree in V direction (typically 1-9). |
| `controlPointsU` | `number` | Control point count in U. |
| `controlPointsV` | `number` | Control point count in V. |
| `controlPoints` | `Float64Array` | Row-major rational `[x,y,z,w]` quads, length = `4 * controlPointsU * controlPointsV`. |
| `knotsU` | `Float64Array` | Knot vector in U. |
| `knotsV` | `Float64Array` | Knot vector in V. |
| `closedU` | `boolean` | |
| `closedV` | `boolean` | |
| `domainU` | `[number, number]` | Parametric domain in U. |
| `domainV` | `[number, number]` | Parametric domain in V. |
| `trims` | `RhinoTrimLoop[]` | Trim curves in the parametric (UV) domain. Outer loop CCW; inner (hole) loops CW. |

A `RhinoTrimLoop` is `{ kind: 'outer' | 'inner'; curves: { uvCurve: Float64Array; direction: 'forward' | 'reversed' }[] }`. Trims are required to bound the surface — a flat un-trimmed sheet still has a single rectangular outer trim.

### §2.8 — `RhinoBrep` payload

| Field | Type | Notes |
|---|---|---|
| `kind` | `'brep'` | |
| `faces` | `RhinoBrepFace[]` | |
| `edges` | `RhinoBrepEdge[]` | |
| `vertices` | `Float64Array` | Brep vertex coordinates, `[x,y,z,…]`. |
| `solid` | `boolean` | True iff the brep encloses a closed volume. |
| `manifold` | `boolean` | True iff every edge has exactly two adjacent faces. |

`RhinoBrepFace` = `{ surfaceIndex: number; trims: RhinoTrimLoop[]; orientation: 'normal' | 'reversed' }`. `surfaceIndex` refers to a sibling `surfaces` array of `RhinoNurbsSurface` records (deduplicated — coplanar faces share a surface). `RhinoBrepEdge` = `{ vertexA: number; vertexB: number; curveIndex: number; tolerance: number }`. Edge tolerance MUST be ≤ `Rhino3dmDocument.absoluteTolerance` × 100 — anything larger is flagged as a corrupt edge and emits a warning span.

### §2.9 — `RhinoAnnotation` payload

| Field | Type | Notes |
|---|---|---|
| `kind` | `'annotation'` | |
| `subkind` | `'text' \| 'leader' \| 'dim-linear' \| 'dim-aligned' \| 'dim-angular' \| 'dim-radial' \| 'dim-diametric' \| 'dim-ordinate'` | |
| `text` | `string` | Display string (post-format-substitution for dims). |
| `style` | `RhinoAnnotationStyle` | Font / arrowhead / unit format / text height — see below. |
| `plane` | `{ origin: Vec3; xAxis: Vec3; yAxis: Vec3 }` | The annotation's host plane. |
| `points` | `Vec3[]` | Reference points (dim ends, leader landing, text insertion). |

`RhinoAnnotationStyle` = `{ font: string; textHeightMm: number; arrowKind: string; lengthFactor: number; alternate: boolean; suppressZeros: 'leading' | 'trailing' | 'both' | 'none'; precision: number }`. Styles are preserved by reference (one style record per unique style id, dedup at import / export).

### §2.10 — `RhinoHatch` payload

| Field | Type | Notes |
|---|---|---|
| `kind` | `'hatch'` | |
| `patternName` | `string` | Rhino hatch pattern name ("Solid" / "Hatch1" / custom). |
| `patternScale` | `number` | |
| `patternRotationRad` | `number` | |
| `boundary` | `Float64Array[]` | One closed curve per boundary loop (outer + holes). Each entry is a polyline approximation in millimetres. |
| `basePoint` | `Vec3` | Pattern origin. |

---

## §3 — Stores / API surface

### §3.1 — `Rhino3dmReader`

`@pryzm/plugin-rhino-import` (extended).

```ts
/** Read a `.3dm` byte buffer and return a normalised Rhino3dmDocument. */
export async function readRhino3dm(
  bytes: Uint8Array,
  opts?: { rhinoModule?: RhinoModuleLike; preserveNurbs?: boolean },
): Promise<Rhino3dmDocument>;
```

- `preserveNurbs` defaults to `true`. Setting `false` enables a legacy "v0.1 mesh-fallback" mode kept only for backwards compatibility tests; production paths MUST NOT set `false`.
- Throws only on total file corruption per §1.11.
- WASM module is cached process-wide (already implemented at `reader.ts:36`).

### §3.2 — `Rhino3dmWriter`

NEW package `@pryzm/plugin-rhino-export`.

```ts
/** Serialise a Rhino3dmDocument back to a .3dm byte buffer. */
export async function writeRhino3dm(
  doc: Rhino3dmDocument,
  opts?: { targetUnit?: Rhino3dmDocument['sourceUnit']; rhinoModule?: RhinoModuleLike },
): Promise<Uint8Array>;

/** Convert PRYZM elements into a Rhino3dmDocument suitable for write. */
export function buildRhinoDocumentFromProject(
  project: ProjectSnapshot,
  opts?: { includedLevels?: string[]; layerStrategy?: 'by-type' | 'by-level' | 'preserve' },
): Rhino3dmDocument;
```

`layerStrategy: 'preserve'` — when the project was imported from a 3DM, preserve the original layer tree. `'by-type'` — emit one layer per element type. `'by-level'` — emit one layer per PRYZM level.

### §3.3 — `GhDefinitionBridge`

NEW package `@pryzm/plugin-rhino-grasshopper-bridge`.

```ts
/** Translate a Grasshopper definition into a PRYZM parametric family descriptor. */
export async function importGhDefinition(
  bytes: Uint8Array,
  opts?: { format?: 'gh' | 'ghx' | 'auto' },
): Promise<GhDefinition>;

/** Promote a GhDefinition into a registered P0 family. */
export function ghDefinitionToFamily(
  def: GhDefinition,
): FamilyDescriptor;
```

`ghDefinitionToFamily` is pure: same `GhDefinition` → same `FamilyDescriptor`. Registration is the caller's job (P6 — go through `FamilyRegistry.register()`, not a direct store write).

### §3.4 — `RhinoLayerMap`

```ts
/** Resolve a Rhino layer (by full path) to a PRYZM tag set + visibility intent. */
export function mapRhinoLayerToPryzm(
  layer: RhinoLayer,
  project: ProjectSnapshot,
): { tags: string[]; levelId?: string; visibilityIntent: VisibilityIntent };
```

Heuristics:
- Layer names matching `Level [0-9]+` map to a PRYZM level.
- Layer names matching `wall|door|window|slab|column|beam|stair|roof|furniture` (case-insensitive) seed the element type tag.
- Otherwise the layer is preserved as a free-form tag.

---

## §4 — Commands

All Rhino interchange goes through the command bus per P6. Three commands:

### §4.1 — `rhino.import`

| Field | Type | Notes |
|---|---|---|
| `type` | `'rhino.import'` | |
| `payload.bytes` | `Uint8Array` | The 3DM file. |
| `payload.targetLevelId` | `string \| undefined` | If undefined, layers drive level assignment per §3.4. |
| `payload.options` | `{ preserveNurbs?: boolean; mergeStrategy?: 'append' \| 'replace-layer-tree' }` | |
| `returns` | `{ documentId: string; elementIds: string[]; counts: Rhino3dmDocument['counts'] }` | |

Handler MUST: (a) call `readRhino3dm(bytes)`, (b) translate `RhinoObject[]` into PRYZM element batch via `runBatch` (one undo step per import), (c) register layers via `mapRhinoLayerToPryzm`, (d) attach `_provenance: { source: 'rhino.import', documentId, sourceUnit }` to every created element.

### §4.2 — `rhino.export`

| Field | Type | Notes |
|---|---|---|
| `type` | `'rhino.export'` | |
| `payload.scope` | `'project' \| 'selection' \| 'level' \| 'layer'` | |
| `payload.scopeId` | `string \| undefined` | level id / layer id when applicable. |
| `payload.targetUnit` | `Rhino3dmDocument['sourceUnit'] \| undefined` | Default = source unit if known. |
| `payload.layerStrategy` | `'by-type' \| 'by-level' \| 'preserve'` | Per §3.2. |
| `returns` | `{ bytes: Uint8Array; counts: Rhino3dmDocument['counts'] }` | |

Handler MUST: (a) build a `Rhino3dmDocument` via `buildRhinoDocumentFromProject`, (b) call `writeRhino3dm`, (c) prompt the user via UI to save the file.

### §4.3 — `rhino.ghBridge.run`

| Field | Type | Notes |
|---|---|---|
| `type` | `'rhino.ghBridge.run'` | |
| `payload.definitionId` | `string` | A `GhDefinition.id` from §2.4. |
| `payload.inputs` | `Record<string, GhParamValue>` | Values for the exposed inputs. |
| `payload.runtime` | `'rhino-compute' \| 'local-rhino' \| 'family-template-only'` | See below. |
| `returns` | `{ outputs: Record<string, RhinoObject \| RhinoObject[]> }` | |

`payload.runtime` modes:

- `'family-template-only'` (DEFAULT, IN MONOREPO): the bridge does NOT execute the Grasshopper graph. Instead it materialises the family's template geometry (typically a baked snapshot saved at import time as a fallback). This mode is **always available** and has zero external dependencies.
- `'rhino-compute'`: the bridge forwards inputs to a configured external Rhino.Compute endpoint (out-of-monorepo, customer-hosted or McNeel-hosted). Open Q — see §9.
- `'local-rhino'`: the bridge invokes a locally-running Rhino instance via Rhino's CLI / RPC. Out-of-monorepo. Open Q — see §9.

The default `'family-template-only'` mode guarantees the bridge is **closed-source-safe**: PRYZM does NOT ship, embed, or link any Grasshopper runtime. The `GhDefinitionBridge` is purely a translator + dispatcher.

---

## §5 — UI

### §5.1 — Rhino Import wizard

Lives in `apps/editor/src/ui/import/RhinoImportWizard.ts`. Three steps:

1. **File select** — drag-drop or browse for a `.3dm` file (plus optional sibling `.gh` / `.ghx`).
2. **Preview** — shows a tabular preview of `Rhino3dmDocument`: layer tree, object counts, unit / tolerance, Grasshopper definition list. User can toggle layers in / out of the import.
3. **Map** — for each toggled-in layer the user picks a target level (default per §3.4 heuristics). User picks `mergeStrategy` (default `'append'`). User picks `preserveNurbs` (default `true`).

On confirm, dispatches `rhino.import` (§4.1).

### §5.2 — Rhino Export menu

`File → Export → Rhino (.3dm)` opens an export dialog: scope (project / selection / level / layer), target unit, layer strategy. On confirm, dispatches `rhino.export` (§4.2).

### §5.3 — Grasshopper Family panel

When a `GhDefinition` is in the project, it appears in the Families palette under "Imported · Grasshopper". User can place instances; the parameter editor exposes `GhDefinition.inputs` as form fields. Per §1.5 + §4.3, instances default to `family-template-only` runtime.

### §5.4 — Preview color is the unified PRYZM purple

Import preview ghost geometry MUST use the unified PRYZM preview style per [C18 Element Preview Visual](C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md) — `#6600FF` outline only, no fill.

---

## §6 — Tests / CI gates

### §6.1 — Reference suite

12 reference `.3dm` files live in `plugins/rhino-import/__tests__/fixtures/` covering:

1. Empty document (units only).
2. Layers-only (nested hierarchy, 3 levels deep).
3. Polylines + closed polygons.
4. NURBS curves (degree 3 + degree 5 + closed loop).
5. Mesh box (vertices + faces — quad and tri).
6. NURBS surface (single patch).
7. Brep (extruded cylinder — 3 faces, NURBS + planar).
8. SubD (subdivision surface — fallback to mesh until §8 P3).
9. Annotations (text + linear dim + leader).
10. Hatch (closed boundary + crosshatch pattern).
11. Named views (Top / Front / 3 named).
12. Grasshopper-bridged file (3dm + sibling `.gh` with 3 inputs / 1 output).

### §6.2 — CI gates

| Gate | What it checks |
|---|---|
| `check-rhino-tolerance` | Round-trip a NURBS curve through `readRhino3dm → writeRhino3dm` and assert the control-point delta is within `absoluteTolerance`. Hard-fail. |
| `check-rhino-units` | Import a 3DM authored in feet with `tolerance = 0.001 ft`. Assert the in-memory `absoluteTolerance` is `0.3048 mm`. Assert every element's `_provenance.sourceUnit === 'feet'`. Hard-fail. |
| `check-gh-bridge-purity` | The `GhDefinitionBridge` MUST NOT import any of: `rhino3dm` at top level (lazy only), `child_process`, `node:fs`, `node:net`, `@grasshopper/*`. The bridge is a pure translator. Hard-fail. |
| `check-rhino-roundtrip` | Run the 12-file reference suite through `readRhino3dm → writeRhino3dm → readRhino3dm` and diff layer count / curve count / NURBS control points / annotations / views. Soft-fail (deltas reported, hard-fail at 100%-coverage milestone). |
| `check-rhino-spans` | Static AST check: every exported function in `@pryzm/plugin-rhino-{import,export,grasshopper-bridge}` opens at least one OTel span. Hard-fail. Extends existing `check-spans.ts`. |
| `check-rhino-layer-preserve` | Round-trip a file with 50 nested layers and assert byte-identical layer tree on the way out. Hard-fail. |

### §6.3 — Unit tests

Per-package vitest suites (extends existing `plugins/rhino-import/__tests__/`):

- `reader.spec.ts` — every `RhinoObject` subkind. Edge cases: zero-length curve, degenerate mesh, NURBS surface with trim that wraps the seam, embedded `EarthAnchorPoint`.
- `writer.spec.ts` — every `RhinoObject` subkind. Edge cases: write then read with rhino3dm and compare counts.
- `bridge.spec.ts` — `.gh` parse + `GhDefinition` shape + family translation + `family-template-only` runtime mode.
- `layer-map.spec.ts` — every heuristic in `mapRhinoLayerToPryzm`.

---

## §7 — NFT targets

Per [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md):

| Operation | Budget | Measurement |
|---|---|---|
| 100 MB `.3dm` import | < 5 s wall-clock | `pryzm.rhino.import` span duration; CI runs the budget assertion in `__tests__/perf-budgets.spec.ts`. |
| 100 MB `.3dm` export | < 7 s wall-clock | `pryzm.rhino.export` span duration. |
| Grasshopper definition import (1 MB `.gh`, ≤ 500 nodes) | < 800 ms | `pryzm.rhino.bridge.run` span. |
| Layer hierarchy resolution (1000 layers) | < 50 ms | `pryzm.rhino.layer.map` span. |
| First-paint impact on editor bundle | 0 | The plugin is dynamically imported on first `rhino.import` dispatch — first-paint bundle MUST NOT include `rhino3dm` WASM. Verified by `check-bundle-budgets`. |

Memory: the reader MUST stream `.3dm` parsing — no full in-memory copy beyond the byte buffer + the produced `Rhino3dmDocument`. For a 100 MB file the peak RSS delta MUST stay below 800 MB (the `rhino3dm` WASM working set is the dominant cost — McNeel acknowledged; PRYZM does not control this lower bound).

---

## §8 — Migration plan

The existing `plugins/rhino-import/` is at v0.1 fidelity (per the package.json description). Migration phases ratchet it to the C33 contract:

### §8.1 — Phase R-α — close the reader gaps (sprint 1, ~3 dev-days)

- **R-α-1**: NURBS preservation. Replace the v0.1 `meshFromGeo` branch with a true `nurbsCurveFromGeo` / `nurbsSurfaceFromGeo` / `brepFromGeo`. Add `geometryFidelity: 'nurbs' | 'mesh-fallback'` annotation. Closes §1.1.
- **R-α-2**: Annotation + hatch readers (`annotationFromGeo`, `hatchFromGeo`). Closes §1.6.
- **R-α-3**: View reader (`readViews`). Closes §1.7.
- **R-α-4**: `EarthAnchorPoint` reader feeds [C12](C12-GEOSPATIAL.md) LTP-ENU rebasing. Closes the geospatial seed.
- **R-α-5**: Replace counts struct with the full §2.1 set; drop the v0.1 `droppedNoMesh` exclusivity.

### §8.2 — Phase R-β — writer (sprint 2, ~5 dev-days)

- **R-β-1**: New package `@pryzm/plugin-rhino-export` skeleton.
- **R-β-2**: `writeRhino3dm` per object type (point / curve / mesh / brep / NURBS surface / annotation / hatch).
- **R-β-3**: `buildRhinoDocumentFromProject` per element type.
- **R-β-4**: Layer-strategy implementation (`by-type` / `by-level` / `preserve`).
- **R-β-5**: Unit re-coercion on export per §1.3.
- **R-β-6**: Round-trip CI gate `check-rhino-roundtrip` over the 12-file suite (soft-fail initially).

### §8.3 — Phase R-γ — Grasshopper bridge (sprint 3, ~4 dev-days)

- **R-γ-1**: New package `@pryzm/plugin-rhino-grasshopper-bridge`.
- **R-γ-2**: `.gh` / `.ghx` parsers — pure declarative; no execution.
- **R-γ-3**: `ghDefinitionToFamily` translator → P0 `FamilyDescriptor`.
- **R-γ-4**: `family-template-only` runtime — bakes a fallback mesh at import time and instances from it.
- **R-γ-5**: `check-gh-bridge-purity` gate ratcheted to hard-fail.

### §8.4 — Phase R-δ — UI + commands (sprint 4, ~3 dev-days)

- **R-δ-1**: `RhinoImportWizard` per §5.1.
- **R-δ-2**: `File → Export → Rhino` menu + dialog per §5.2.
- **R-δ-3**: `rhino.import` / `rhino.export` / `rhino.ghBridge.run` commands per §4 wired to `commandBus` (P6).
- **R-δ-4**: Grasshopper Families palette per §5.3.

### §8.5 — Phase R-ε — round-trip ratchet (sprint 5, ongoing)

- **R-ε-1**: `check-rhino-roundtrip` ratchet to hard-fail.
- **R-ε-2**: NFT budgets enforced in CI.
- **R-ε-3**: Customer-supplied reference suite extends the 12-file kit (incoming as escalations).

Total estimated effort: **~15 dev-days** to full C33 conformance.

---

## §9 — What is NOT in this contract

- **DXF / DWG interchange** — covered by [C32 DXF/DWG Round-Trip](C32-DXF-DWG-ROUND-TRIP.md). 3dm has zero overlap with the AutoCAD format family — a separate reader, writer, and tolerance model.
- **IFC export / import** — covered by [C25](C25-IFC-EXPORT-PRODUCTION.md). PRYZM does NOT route Rhino-to-anywhere-else through IFC — Rhino → PRYZM → Rhino is a direct path. (Rhino → PRYZM → IFC IS supported, via two separate command dispatches.)
- **Revit interchange** — covered by [C26](C26-REVIT-ROUND-TRIP.md). The Rhino bridge does NOT cross-translate to Revit families.
- **Family Platform internals** — covered by the P0 Family Platform contract (drafting). C33 only declares **how** a `GhDefinition` becomes a `FamilyDescriptor`; the registry / instancing / parameter-resolution rules belong to P0.
- **Rhino.Compute hosting / billing** — `'rhino-compute'` runtime mode in §4.3 is a delegation surface; the compute endpoint is customer-configured. PRYZM does NOT host or proxy compute. Open Q below.
- **Rhino's own scripting (RhinoScript / Python)** — out of scope. Only Grasshopper visual definitions are bridged.
- **Real-time / streaming Rhino sync** — `.3dm` is a file-based interchange. Live Rhino plugin sync (à la Speckle) is out of scope; if added, raise a separate contract.

---

## §10 — Open questions

1. **Grasshopper closed-source bridge** — Grasshopper components are predominantly closed-source. The `family-template-only` runtime side-steps this by NOT executing the graph, but limits the bridge's value. The two execution paths (`rhino-compute` / `local-rhino`) require either (a) an external paid service (Rhino.Compute hosted by McNeel — Q: licensing?), or (b) the customer to have Rhino installed locally (Q: does PRYZM ship the CLI invocation glue, or does this become a marketplace plugin?). **Recommendation pending architect input**: ship `family-template-only` in C33 as the canonical path; defer the other two runtime modes to a follow-up contract once licensing is settled.

2. **NURBS-to-mesh fallback when destination is mesh-only** — when exporting to a downstream consumer that does NOT support NURBS (e.g. a STL exporter, a low-precision PDF, an embedded Three.js viewer), PRYZM tessellates the NURBS. Q: should the tessellation be done eagerly at the boundary (write-time) with the source `absoluteTolerance` driving the chord deviation, OR lazily (lazy tessellation cache keyed by NURBS hash + tolerance)? §1.1 forbids silent fallback inside the PRYZM store, but the boundary policy at format-conversion time is unsettled. **Recommendation pending**: lazy tessellation with a `pryzm.geometry.nurbsTessellate` span that records the destination format + chord tolerance. Track in `RhinoObject._provenance.tessellatedFor: string[]` to keep the audit trail.

3. **EarthAnchorPoint vs project origin precedence** — if a 3DM file carries an `EarthAnchorPoint` AND the PRYZM project already has a `ProjectLocation` from [C12](C12-GEOSPATIAL.md), which wins? Recommendation pending: warn-on-mismatch, default to project's existing origin, offer a UI override.

4. **Grasshopper definition versioning** — Grasshopper components are versioned by GUID; new releases ship with the same GUID + new behaviour. If a customer re-imports a definition six months later, do we re-bake the template (R-γ-4) or honour the old bake? Recommendation pending: content-address by `definitionId` per §2.4 (hash of the `.gh` bytes); a behaviour change ships a new hash; the family lives at both versions.

---

> **C33 Cross-link target for [C00 INDEX](README.md)**: add row after C32 — "Rhino Interchange · `.3dm` reader + writer + Grasshopper bridge via P0 families · DRAFT 2026-06-01 · 11 invariants · P5, P6, P7, P8".
