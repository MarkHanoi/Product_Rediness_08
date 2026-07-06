# SPIKE — Deterministic AutoDimension Engine (`packages/auto-dimension`)

- **Status:** DESIGN / RESEARCH (design spike — no committed code beyond this doc)
- **Logged:** founder 2026-07-06 · Issue Log **L-138** (see `docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md`)
- **Governs / touches:** C24.1 (Auto-Documentation Sheets), C34 (Print & Drawing Standards),
  C03 (schemas/commands/state), C11 (creation pipeline), C15 (hosted elements), ADR-0055 (wall
  pipeline), ADR-0061 (determinism)
- **Format siblings:** `SPIKE-GENRECON-generative-reconstruction.md`, `[[pascalorg-editor-research]]`

> **One-line thesis.** PRYZM already has the *output half* of an auto-dimensioning system
> (`DimensionString` schema + `produceDimensions` + `evaluateDimensions` + the plan-view
> annotation render loop) and the *input half* (a wall connectivity graph in
> `JunctionResolverV2` + a planar-face room/perimeter tracer in `PlanarTopologyEngine` +
> opening spans in `WallOccupancyStore`). What is missing is the **intelligence layer in
> between**: a deterministic engine that turns a floor plan into a *non-redundant,
> non-overlapping, architect-grade dimension SET*. This spike designs that layer as a new pure
> package `@pryzm/auto-dimension`, grounded entirely in the existing subsystems.

---

## 0. Motivation — what exists, and the exact gap

The current `produceDimensions` (`packages/geometry-kernel/src/dimensions/producer.ts:128`) is a
**naive per-element emitter**: it walks `walls[]`, `doors[]`, `windows[]`, `rooms[]` and emits
one `DimensionString` per element (`producer.ts:164-227`) — a wall length here, an opening width
there, a room bbox X/Z there. It performs **no graph traversal, no collinear grouping, no chain
assembly, no overall span, no placement/stacking, no conflict resolution, and no QA**. Two walls
that are collinear across a façade get two independent length dims that neither chain nor share a
datum; every opening gets a width but no *location*; nothing guarantees the opening widths + piers
sum to the wall length; and nothing prevents two dims landing on the same line.

The `set-out` mode (`producer.ts:300-393`) is closer to architect intent (offset-from-datum +
width + overall) but is still a blind per-opening emission with the explicit disclaimer that it
"does not resolve along-wall geometry — that is the evaluator's job; set-out only declares WHICH
offsets to measure" (`producer.ts:310-312`).

**The AutoDimension engine is the missing planner.** It consumes the same element snapshot, runs a
deterministic 8-stage pipeline over the wall graph, and emits a *complete, deduplicated, stacked,
QA-validated* `DimensionString[]` that the existing evaluator + render loop already know how to
draw. It fully **supersedes** the intelligence-free `produceDimensions` per-element/set-out modes
(which become thin fallbacks) without changing the output schema or the render/persist sinks.

**Determinism mandate (ADR-0061, C24.1 §1.1).** Same input geometry → byte-identical
`DimensionString[]`. No AI/ML/LLM, no `Math.random`, no `Date.now`, no floating tie-breaks. Every
ordering is a total order with an `elementId` (ULID) final tiebreak. Only graph traversal,
computational geometry, line intersection, vector math, spatial indexing, and rule-based decision
trees.

---

## 1. System architecture & the 8-layer placement

### 1.1 New package: `@pryzm/auto-dimension` (L2, PURE)

| Property | Value |
|---|---|
| Package | `packages/auto-dimension` → `@pryzm/auto-dimension` |
| Layer | **L2** (domain-geometry peer of `geometry-kernel`, `constraint-solver`, `drawing-primitives`) |
| Purity | **PURE** — zero THREE (P2), zero DOM (P4), zero I/O, zero RNG. Mirrors `setOutDimensions.ts` and the geometry-kernel `dimensions/` producer, both pure L2/L4. |
| OTel | `@opentelemetry/api` allowed (the one non-pure-domain import — same as `setOutDimensions.ts:26-28`). Every exported fn opens ≥1 span (P8). |

**Downward dependencies only** (a layer imports only from lower layers):

- **L0 `@pryzm/schemas`** — `Wall`, `Door`, `Window`, embedded `Opening` (`packages/schemas/src/elements/Wall.ts:33-77`, `Door.ts:12-39`, `Window.ts:12-28`) and the output type
  `DimensionString` + `DimensionReference` + `DimAnchor` (`packages/schemas/src/annotation/dimension.ts:62-181`).
- **Pure geometry cores** reused as algorithms (see §4 for the layer caveat):
  - `resolveJunctions` / `detectJunctions` (`packages/geometry-wall/src/JunctionResolverV2.ts:836,350`) — THREE-free `{x,z}` junction clustering.
  - `computeTopology` (`packages/room-topology/src/PlanarTopologyEngine.ts:98`) — THREE-free half-edge face traversal for perimeter + room rings.
  - `WallOccupancyStore.getOccupiedSpans` (`packages/geometry-wall/src/WallOccupancyStore.ts:311`) — sorted opening spans per wall.

**The engine imports NO store, NO command bus, NO renderer.** It is a pure DTO→DTO function. All
mutation happens in a thin editor-side executor (§1.3) that dispatches the emitted strings through
the command bus (P6).

### 1.2 Data flow

```
                      ┌─────────────────────── EDITOR (L5/L7, impure) ───────────────────────┐
 WallStore ─┐         │  applyAutoDimensions(runtime, viewId, levelId)                        │
 DoorStore ─┤ gather  │    1. gather element snapshot (walls/doors/windows/rooms for level)   │
 WindowStore┼────────▶│    2. planAutoDimensions(snapshot, opts)  ◀── @pryzm/auto-dimension   │
 RoomStore ─┘         │           (PURE — returns DimensionString[])                          │
                      │    3. batchCoordinator.runBatch(() =>                                 │
                      │          for s of strings: bus.executeCommand('dimension.create'|…))  │
                      └───────────────────────────────┬───────────────────────────────────────┘
                                                       │  (persisted DimensionString / Dimension)
                      ┌────────────────────────────────▼──────────────────────────────────────┐
                      │  evaluateDimensions(strings, snapshot, units)  (geometry-kernel L4)     │
                      │  → EvaluatedDimension[] (world-mm p1/p2/lineY/witness)                  │
                      │  → PlanViewAnnotationRenderer._renderLinearDim (plan-canvas draw loop)  │
                      └────────────────────────────────────────────────────────────────────────┘
```

- **Input:** an `AutoDimSnapshot` (see §2) built by the editor from `WallStore` / `DoorStore` /
  `WindowStore` / `RoomStore` — the same gather the docs executor already does
  (`apps/editor/src/ui/documentation/generateDocumentationSet.ts:37-55`).
- **Engine output:** `DimensionString[]` (`@pryzm/schemas/annotation/dimension`) tagged
  `isAutoGenerated: true` + `autoMode`, plus a sidecar `AutoDimReport` (coverage + validation
  errors, §8).
- **Sink:** the editor executor dispatches each string via the bus. Preferred sink is the typed,
  undoable **`dimension.create`** handler (§P3.5-DI, `plugins/dimensions/src/handlers/CreateDimension.ts:32`)
  or the persisted `DimensionString` store; both are P6-clean. Rendering re-uses
  `evaluateDimensions` (`packages/geometry-kernel/src/dimensions/evaluator.ts:112`) →
  `PlanViewAnnotationRenderer.render` (`packages/core-app-model/src/views/PlanViewAnnotationRenderer.ts:211`).

### 1.3 Why an editor-side executor (not the engine) touches the bus

P6 forbids UI/domain code from writing stores; only the command bus mutates. The engine is pure and
returns data. The executor `applyAutoDimensions` mirrors `generateDocumentationSet`
(`generateDocumentationSet.ts:151`): gather → call the pure planner → dispatch bus commands inside
one `batchCoordinator.runBatch` so a whole auto-dimension set is **one undo** (C24.1 §1.2). The
executor is the only impure surface and lives in `apps/editor` (L5).

---

## 2. Data structures

All engine-internal types are pure `{x, z}` (metres, plan XZ, y dropped) — the same convention as
`JunctionResolverV2.Pt2` (`JunctionResolverV2.ts:59`) and `setOutDimensions.PtXZ`
(`setOutDimensions.ts:31`).

### 2.1 Reused as-is (do not rebuild)

| Concept | Reuse | Source |
|---|---|---|
| Output dimension record | `DimensionString` | `schemas/annotation/dimension.ts:158` |
| Dimension anchor | `DimensionReference { elementId, anchor }`, `DimAnchor` (10 anchors incl. `face-outer/inner`, `centerline`) | `dimension.ts:62-79` |
| Chain / overall discriminator | `DimensionKind` = `linear-element \| linear-chain \| overall \| …` | `dimension.ts:131-138` |
| Provenance | `isAutoGenerated`, `autoMode` | `dimension.ts:177-179` |
| Placement offset | `offsetMm`, `WitnessLineStyle {offset, extension, weight}` | `dimension.ts:163-172` |
| Evaluated render result | `EvaluatedDimension` | `dimension.ts:185-205` |
| Wall junction graph node | `JunctionDraft { point, realEndpoints[], passthroughWalls[] }` | `JunctionResolverV2.ts:305-312` |
| Endpoint ref | `EndpointRef { wallIdx, isStart, origin }` | `JunctionResolverV2.ts:298-303` |
| Room / perimeter ring | `DetectedRoom { polygonVertices[], boundaryWallIds[] }`, `TopologyResult.outerFacePolygon` | `PlanarTopologyEngine.ts:17-30` |
| Opening span | `getOccupiedSpans → {openingId, type, offsetM, endM}` | `WallOccupancyStore.ts:311-326` |

### 2.2 New engine types (pure)

```ts
// Wall as the engine sees it — a straight baseline + metadata (curved walls tessellated first).
interface DimWall { id: string; a: PtXZ; b: PtXZ; thickness: number; systemTypeId?: string; levelId: string; }

// One maximal run of collinear, end-to-end walls along a façade — the unit a wall-chain dims.
interface WallRun {
  id: string;                     // deterministic: `run:${sortedMemberIds.join('+')}`
  axisDir: PtXZ;                   // unit direction of the run (canonicalised, §Determinism)
  members: string[];              // wall ids in along-axis order
  nodes: PtXZ[];                   // ordered junction points along the run (chain tick set)
  isExterior: boolean;            // member of the perimeter ring?
  facade?: 'N' | 'S' | 'E' | 'W' | string;
}

// An opening projected onto its host run's 1-D axis (metres from the run datum = run start).
interface OpeningRef {
  id: string; kind: 'door' | 'window';
  hostWallId: string; runId: string;
  s0: number; s1: number;         // near-edge / far-edge along-run station (metres)
  width: number;
}

// A planned but unplaced dimension string (pre-placement).
interface PlannedString {
  kind: DimensionKind; autoMode: DimensionAutoMode;
  refs: DimensionReference[];      // element+anchor (schema-native, stays live)
  axisId: string;                  // which run/datum axis it belongs to (stacking group)
  orientation: DimOrientation;
  stationSpan: [number, number];   // [start, end] along the axis (for overlap tests)
  priority: number;                // string-class rank (overall > exterior-chain > opening-chain > …)
}

// Placement decision for one axis's stack of strings.
interface PlacementRecord {
  axisId: string; side: 1 | -1;    // which side of geometry the stack sits on
  rows: PlannedString[][];         // row[0] nearest geometry … row[k] overall (outer)
  rowOffsetsMm: number[];          // cumulative offsetMm per row
}

// Engine result.
interface AutoDimResult { strings: DimensionString[]; report: AutoDimReport; }
interface AutoDimReport { coverage: {...}; errors: ValidationError[]; skipped: {id,reason}[]; }
```

`PlannedString.refs` deliberately uses the **element+anchor** model (`DimensionReference`) rather
than raw points, so an auto-dim stays *live* (re-evaluates when the wall/opening moves) exactly like
the existing producer output. Raw-point sinks (`dimension.create` `points: Vec3[]`,
`elements/Dimension.ts:43`) are reached by running the string through `evaluateDimensions` in the
executor (payload adapter).

---

## 3. Geometry algorithms — what already exists vs what is new

The engine needs: perpendicular projection, line–line intersection, offset lines, collinear
grouping, point-in-polygon, signed area. **Almost all already exist as pure helpers** — the engine
composes them; it invents no new numerical primitives.

| Primitive | Reuse | Source |
|---|---|---|
| Line–line intersection (`p1+t·d1 = p2+s·d2`, parallel guard `det<1e-9`) | `intersectLines` | `JunctionResolverV2.ts:277` |
| Perpendicular projection onto segment (clamped `t∈[0,1]`, foot, perpDist) | `projectOnSeg` | `JunctionResolverV2.ts:286` |
| Perpendicular projection (foot/dist/t), incl. unclamped | `GeometryUtils.pointToLineDistance2D` | `packages/snapping/src/GeometryUtils.ts:29` |
| Left/right perpendicular of a direction (offset-line normal) | `leftPerp` | `JunctionResolverV2.ts:274` |
| Unit vector / dot / sub / add / scale | `unit/dot/sub/add/scale` | `JunctionResolverV2.ts:267-273` |
| **Collinear / extension test** (parametric `t = ((c−a)·d)/|d|²`; reject on-segment) | `extensionCandidate` | `WallAlignmentInference.ts:182-222` |
| Axis-aligned/parallel classification (dominance ratio, orthogonal set-out) | `computeSetOutDimensions` axis test | `setOutDimensions.ts:141-181` |
| Parallel-within-θ + project-onto-baseline (the perpendicular-dim constraint) | `_resolveParallelWallDim` | `LinearDimPlanToolHandler.ts:242-289` |
| Signed area / perimeter / centroid / AABB / point-in-polygon / CCW | `RoomPolygonUtils.*` | `packages/room-topology/src/RoomPolygonUtils.ts:49-188` |

**New (thin) geometry the engine adds:**

1. **Offset-line construction** — there is *no* dedicated parallel-offset helper (confirmed:
   `GeometryUtils` has none). The engine builds it in ~3 lines from `leftPerp` + `add/scale`:
   `offsetLine(a,b,dMm) = { a: a + leftPerp(dir)*d, b: b + leftPerp(dir)*d }`. This is exactly the
   witness/dim-line offset the manual tool already does inline (`LinearDimPlanToolHandler.ts:354-357`,
   `nx=-dz/len, nz=dx/len`).
2. **Run-axis station projection** — project any point onto a `WallRun.axisDir` to get its
   scalar station `s` (reuses the `extensionCandidate` parametric `t` maths).
3. **Collinear grouping into runs** — a union-find over walls sharing an infinite line within
   tolerance (reuses `extensionCandidate`'s line test + `JunctionResolverV2.clusterEndpoints`'s
   greedy-cluster pattern).

---

## 4. Stage-1 — Connectivity graph & perimeter extraction (which existing graph to reuse)

There are **two** existing wall-connectivity graphs. They serve different needs and the engine uses
**both**, in this split:

### 4.1 Junction graph — reuse `JunctionResolverV2.detectJunctions`

`detectJunctions` (`JunctionResolverV2.ts:350`) already produces exactly the Stage-1 node set the
engine needs: it clusters endpoints within a `0.20 m` band (`clusterEndpoints`,
`JunctionResolverV2.ts:315`), attaches T/X passthroughs by projecting bodies onto the cluster point
(`:358-368`), and classifies L / T / Y / X junctions with all the founder-hardened edge-case fixes
(§FIX-WALL-TJUNCTION-BUTT, §FIX-WALL-LCORNER-T-CLEAN, degenerate-stub stripping). Its output
`JunctionDraft[]` gives **nodes** (`.point`, `.realEndpoints`, `.passthroughWalls`) and, implicitly,
**edges** (each wall between the two nodes its ends belong to).

→ **Decision:** the engine's connectivity graph *is* `detectJunctions`'s output. Nodes =
junction points (endpoints + T/X intersections); edges = wall segments between them. **Do not
rebuild.** This is the ADR-0055 P1 graph the whole wall pipeline already trusts, so dimension ticks
land exactly on the corners the wall miters land on (no visual drift between a dimension witness and
the wall corner it measures).

`room-topology`'s alternative `buildWallGraph` (`WallIntersectionResolver.ts:259`) quantises nodes
to a `20 mm` grid and uses `THREE.Vector3` in its signature — **not** reused for the junction graph
(the THREE dependency would taint the pure package, and the 20 mm grid is coarser than the wall
pipeline's 0.20 m cluster band, risking tick/corner mismatch).

### 4.2 Perimeter + room rings — reuse `PlanarTopologyEngine.computeTopology`

For the **exterior chain** and the **future interior-room chains**, the engine needs closed loops,
not just junctions. `computeTopology` (`PlanarTopologyEngine.ts:98`) is a pure half-edge planar-face
tracer: it angularly sorts each node's neighbours (`:117-128`), walks minimal faces via a
next-clockwise rule (`:76-96`), and returns `TopologyResult` with:

- `outerFacePolygon` — the single most-negative-signed-area face = **the building perimeter**
  (`PlanarTopologyEngine.ts:167-194`), already offset out `EXTERIOR_HALF_THICKNESS = 0.10 m` from
  centreline.
- `rooms[].polygonVertices` + `boundaryWallIds` — the **interior room rings** (P3 scope).

→ **Decision:** Stage-1 calls `computeTopology` to obtain the perimeter ring and room rings; it maps
each ring edge back to a wall id via `boundaryWallIds` / node coincidence with `detectJunctions`
nodes.

**Layer/purity caveat (must resolve before P1 code).** `computeTopology` itself is pure `{x,z}`, but
it is reached in room-topology via `buildWallGraph` (THREE) and the package barrel pulls THREE
(`TopologySpatialIndex`). Two options, in preference order:

- **P1 fast path:** build the `WallGraph` in-package from pure `{x,z}` (a ~30-line mirror of
  `buildWallGraph`'s grid-quantise + edge-map, THREE-free) and call the pure `computeTopology`
  function directly. Requires `computeTopology` to be importable without executing THREE at module
  load — verify tree-shaking, else use the mirror below.
- **P4 refactor (the "documentation core"):** lift the pure `PlanarTopologyEngine` +
  `RoomPolygonUtils` into a shared pure package (e.g. `packages/planar-topology`, L1) that both
  `room-topology` and `auto-dimension` consume. This is the clean end-state and is recommended as
  part of the P4 "documentation core" (§11).

---

## 5. Stage-2 & 3 — Segmentation and opening analysis

### 5.1 Stage-2 — wall-segment + opening segmentation

For each wall, `wallOccupancyStore.getOccupiedSpans(wall)` (`WallOccupancyStore.ts:311`) returns the
openings sorted by along-wall metric offset as `{openingId, type, offsetM, endM}`. The engine slices
each wall's `[0, wallLength]` axis into an alternating sequence of **pier** segments and **opening**
segments — the raw material of the opening chain. Opening offsets are **left-edge metric offsets
along `baseLine[0]→baseLine[1]`** (`Wall.ts:38-39`, `WallOccupancyStore.ts:66-71`), *not* parametric
`t` — so no re-parameterisation is needed; stations compose directly.

### 5.2 Stage-3 — opening analysis (project onto the run axis)

Each opening is lifted from *its host wall's* local axis to *the run's* shared axis so a chain that
spans several collinear walls measures piers/openings in one continuous coordinate. For an opening at
host-wall offset `off` with width `w`, its host-wall endpoints in world XZ are
`a + unit(b−a)·off` and `a + unit(b−a)·(off+w)` (exactly the evaluator's door-anchor maths,
`evaluator.ts:283-300`); project both onto `WallRun.axisDir` to get `[s0, s1]`. Corner windows and
double doors are handled here (§9).

---

## 6. Stage-4 — Dimension-chain planning (which strings)

The planner emits, per level, a **minimal complete** set of strings. Priority (highest rank first)
also drives the outer→inner stack order in Stage-6:

| Rank | String class | `kind` / `autoMode` | Rule |
|---|---|---|---|
| 1 | **Overall building** | `overall` | One horizontal + one vertical overall across the perimeter AABB (from `outerFacePolygon`). Refs = the two extreme corner walls' `start`/`end` anchors. |
| 2 | **Exterior wall-chain** | `linear-chain` / `set-out` | Per perimeter façade run: a chain ticking every junction node + every opening edge along that run. This is the running dimension a contractor sets out from. |
| 3 | **Opening chain** | `linear-chain` | Per run with ≥1 opening: pier–opening–pier station chain (subset of the exterior chain when they coincide — deduped in Stage-7). |
| 4 | **Interior room chain** *(P3)* | `room-bounding` | Per detected room: overall X/Z of the room ring; later, wall-to-wall internal running dims. |
| 5 | **Per-element fallback** | `linear-element` | Only for walls/openings not covered by any chain (free-standing partitions). Prevents silent omission. |

**Avoiding unnecessary strings (the core value over `produceDimensions`):**

- A wall that is an interior member of a chain gets **no** standalone length dim — its length is
  implied by the chain ticks either side (dedupe rule DR-1).
- An opening whose location + width are already ticked in the exterior chain gets **no** separate
  opening chain (DR-2) unless the exterior chain is suppressed on that façade.
- Two collinear walls forming one run produce **one** chain, not two length dims (the exact defect in
  today's per-element producer).
- The overall is emitted **once per axis**, not per wall.

Collinear grouping into runs (Stage-4 pre-pass) uses the `extensionCandidate` line test
(`WallAlignmentInference.ts:182-222`) + a greedy union-find; two walls join a run iff they are
parallel within θ (reuse the `_resolveParallelWallDim` 15° gate, `LinearDimPlanToolHandler.ts:271`),
collinear within the perpendicular band, and end-to-end adjacent at a shared `detectJunctions` node.

---

## 7. Stage-5 — Chain geometry resolution (collinear grouping → datum axes)

Stage-5 turns each planned chain into an ordered **tick station list** on a single datum axis:

1. Establish the run datum: axis origin = the run's first node, `axisDir` = canonical run direction.
2. Collect ticks: every junction node on the run + every opening `s0/s1` (Stage-3) → project to
   station scalars.
3. Sort ticks ascending by station, dedupe within `EPSILON_M = 0.001` (reuse the occupancy epsilon,
   `WallOccupancyStore.ts:94`) — this collapses a junction that coincides with an opening jamb.
4. Emit consecutive `[tick_i, tick_{i+1}]` as chain segments; assign each an element+anchor
   `DimensionReference` pair (wall `start/end`, opening `left/right`) so the string stays live.

This stage is where `setOutDimensions` and `WallAlignmentInference` maths are *already available*:
the perpendicular-foot projection (`setOutDimensions.ts:141-181`), the parallel-project-onto-baseline
(`LinearDimPlanToolHandler.ts:274-281`), and the collinear parametric `t`
(`WallAlignmentInference.ts:197`) are the three operations Stage-5 composes. Nothing new numerically.

---

## 8. Stage-6 — Placement (offsets, stacking, text, ordering)

Deterministic, rule-based (C24.1 §1.5 — **force-directed placement is out of scope**; a v1 overlap
is acceptable and must never be "fixed" with RNG).

- **Side selection.** For an exterior façade run, the stack sits on the *outside* — the side whose
  outward normal (`leftPerp(axisDir)`, sign chosen so it points away from the perimeter centroid,
  reusing `RoomPolygonUtils.polygonCentroid`) faces away from the building. Interior chains stack
  toward the nearest open side. Ties broken by choosing the `+normal` side (deterministic).
- **Stacking / row assignment.** Strings on the same axis stack outward by rank (Stage-4): row 0 =
  opening chain (nearest geometry), row 1 = exterior wall-chain, row 2 = overall. Row offset =
  `baseOffsetMm + rowIndex · rowSpacingMm`, folded into each string's `offsetMm`
  (`dimension.ts:163`). Defaults inherit the producer's mode offsets (`producer.ts:99-108`) and C34
  styles (`StandardsStore`) — no hard-coded weights in the pure engine; the caller injects a style
  table (C24.1 §1.6).
- **Witness/extension lines.** Reuse `WitnessLineStyle {offset, extension, weight}`
  (`dimension.ts:110-117`); the evaluator already computes witness endpoints
  (`evaluator.ts:395-405`) — the engine only chooses the stack offset.
- **Text position + flip.** Not persisted in `DimensionString` (confirmed — no text-pos field); it
  is derived by the evaluator/renderer (`evaluator.ts:167-171`, `PlanViewAnnotationRenderer._renderLinearDim`).
  The engine's only text decision is the *ordering* of strings so labels read left→right / bottom→top;
  arrow/tick flip is the renderer's (`LinearDimPlanToolHandler.ts:401-405` flips label to keep it
  upright). The engine passes `arrowheads: 'tick'` (architectural default, `dimension.ts:173`).
- **Ordering.** Strings sorted by `(axisId, rowIndex, stationStart, elementId)` — a total order.

---

## 9. Stage-7 — Conflict detection & resolution

Runs after placement; every rule is deterministic and merge/reposition, never drop-silently.

| Conflict | Detection | Resolution |
|---|---|---|
| **Duplicate string** (DR-1/DR-2) | Same `(axisId, stationSpan)` within `EPSILON_M`, same orientation | Keep the higher-rank string; drop the lower. Deterministic by rank then `elementId`. |
| **Zero / tiny length** | `|stationSpan| < MIN_OPENING_M = 0.05` (`WallOccupancyStore.ts:101`) | Drop the tick; merge its two neighbours into one segment (a sliver pier folds into the adjacent dim). |
| **Overlapping text** | 1-D interval overlap of label boxes projected on the axis (label width from unit-format digit count — deterministic, no font metrics) | Bump the *lower-rank* string to the next stack row (row++). Bounded retries; if still overlapping at max rows, accept (C24.1 §1.5) and log to report. |
| **Stack collision** (two axes cross) | Segment intersect (`intersectLines`, `JunctionResolverV2.ts:277`) between two dim lines of perpendicular axes | The perpendicular axes stack on *different* sides by construction; if a crossing remains, shorten the extension line at the crossing (reduce `witness.extension`). |
| **Crossing geometry** | Dim line intersects a wall footprint segment (spatial-index broad-phase, §10) | Push the whole stack out by one `rowSpacingMm` until clear (bounded). |
| **Redundant overall** | Overall equals the sum of a complete single-row chain within tolerance | Keep both (architect convention) but flag `chainCloses: true` in the report; do not drop. |

---

## 10. Stage-8 — QA validation rules

Returns `ValidationError[]` in `AutoDimReport` (never throws; C24.1 §1.3 forbids silent omission).

- **QA-1 Opening coverage.** Every door/window in the snapshot appears in ≥1 emitted string (as a
  ref). Missing → `error: 'opening-undimensioned'` + the opening id.
- **QA-2 Chain completeness.** For each run, the chain ticks partition `[0, runLength]` with no gap >
  `EPSILON_M` and no overlap. Gap/overlap → `error: 'chain-gap' | 'chain-overlap'`.
- **QA-3 Overall consistency.** Each `overall` string's geometric value equals the run/perimeter
  extent within 0.5 % (mirrors the evaluator's 5 % override flag, `evaluator.ts:154`). Mismatch →
  `error: 'overall-mismatch'`.
- **QA-4 No duplicates / no zero-length.** Post-Stage-7 invariant re-check.
- **QA-5 Perimeter closure.** `outerFacePolygon` is a closed simple ring
  (`RoomPolygonUtils.isSimple`, `RoomPolygonUtils.ts:169`); else `warn: 'open-perimeter'` and fall
  back to per-run overalls.
- **QA-6 Determinism self-check (test-only).** Running the engine twice on the same input yields a
  byte-identical `DimensionString[]` (ID factory seeded, `producer.ts:117`).

---

## 11. Pseudocode — all 8 stages (deterministic)

```
function planAutoDimensions(snapshot, opts) -> AutoDimResult:      // OTel span: pryzm.autodim.plan
  walls = tessellateCurved(snapshot.walls)                         // curved → polyline (P4; PathResolver)
  # ---- STAGE 1: connectivity graph + perimeter ------------------------------
  junctions = detectJunctions(walls, {band: 0.20})                 // reuse JunctionResolverV2:350
  graph     = edgesFromJunctions(walls, junctions)                 // node=point, edge=wall segment
  topo      = computeTopology(buildPureWallGraph(walls))           // reuse PlanarTopologyEngine:98
  perimeter = topo.outerFacePolygon                                // building shell ring
  rooms     = topo.rooms                                           // P3

  # ---- STAGE 2+3: segmentation + opening analysis ---------------------------
  openingsByWall = { w.id: wallOccupancyStore.getOccupiedSpans(w) for w in walls }   // :311

  # ---- STAGE 4: chain planning ----------------------------------------------
  runs = groupCollinearRuns(walls, graph, perimeter)              // union-find; extensionCandidate:182
  runs = sortRuns(runs)                                           // by (isExterior, facade, minStation, id)
  planned = []
  planned += planOverall(perimeter)                              // rank 1
  for run in runs where run.isExterior:
     planned += planExteriorChain(run, openingsByWall)           // rank 2
  for run in runs where hasOpening(run):
     planned += planOpeningChain(run, openingsByWall)            // rank 3
  # P3: for room in rooms: planned += planRoomChain(room)        // rank 4
  planned += planFreeElementFallback(walls, openings, covered)   // rank 5

  # ---- STAGE 5: chain geometry resolution -----------------------------------
  for p in planned:
     p.ticks = resolveTicks(p, runs, openingsByWall)             // project onto axis, dedupe EPS
     p.refs  = ticksToElementAnchorRefs(p.ticks)                 // element+anchor, stays live

  # ---- STAGE 6: placement ----------------------------------------------------
  byAxis = groupBy(planned, .axisId)
  placements = []
  for axisId, group in stableSort(byAxis):
     side = chooseSide(axisId, perimeter)                        // outward normal vs centroid
     rows = assignRows(group by rank ascending outward)          // stack
     for (rowIndex, str) in rows:
        str.offsetMm = baseOffsetMm + rowIndex * rowSpacingMm
     placements.push({axisId, side, rows})

  # ---- STAGE 7: conflicts ----------------------------------------------------
  planned = dedupe(planned)                                      // DR-1/DR-2 by (axis, span, rank, id)
  planned = mergeTinyAndZero(planned)                            // < MIN_OPENING_M
  planned = resolveTextOverlap(planned, placements)             // bump row, bounded
  planned = resolveGeometryCrossings(planned, walls, spatialIdx)

  # ---- STAGE 8: QA -----------------------------------------------------------
  errors = validate(planned, snapshot, perimeter, runs)          // QA-1..QA-6

  strings = planned.map(toDimensionString(isAutoGenerated=true, autoMode))
  strings = stableSort(strings, by=(axisId,rowIndex,stationStart,id))
  return { strings, report: {coverage, errors, skipped} }
```

Stage-1 helpers (grounded):

```
function groupCollinearRuns(walls, graph, perimeter):
  uf = UnionFind(walls)
  for (wA, wB) in adjacentPairsSharingNode(graph):               // share a detectJunctions node
     if parallelWithin(wA, wB, 15deg)                            // _resolveParallelWallDim:271
        and collinearWithinBand(wA, wB, band)                    // extensionCandidate:190-207
        and notThroughForeignJunction(wA, wB):                   # don't merge across a T-attacher
        uf.union(wA, wB)
  runs = uf.groups().map(orderAlongAxis)                         // sort members by station
  markExterior(runs, perimeter)                                  # membership in outerFacePolygon edges
  return runs
```

---

## 12. Complexity analysis (target ~O(n log n))

`n` = walls, `m` = openings, `r` = runs, `k` = strings on one axis.

| Stage | Work | Complexity | Notes / index |
|---|---|---|---|
| 1 junction graph | `detectJunctions` clusters endpoints | **O(n²)** as-shipped (`clusterEndpoints:315` is greedy pairwise) | Acceptable for per-level `n` (≤ hundreds). Reduce to **O(n log n)** with the existing spatial grid (`SpatialGrid`, `packages/spatial-index/src/SpatialGrid.ts`; or `TopologySpatialIndex.findNearby`, `TopologySpatialIndex.ts:258`). |
| 1 topology | half-edge face walk | **O(E log E)** (angular sort per node) | `PlanarTopologyEngine:117-128` already this. |
| 2+3 segmentation | per-wall sorted spans | **O(m log m)** | `getOccupiedSpans` already sorts (`:311`). |
| 4 run grouping | union-find over adjacent pairs | **O(n α(n))** with graph adjacency; **O(n²)** if brute pairwise | Use `detectJunctions` node adjacency (already computed) → near-linear. |
| 5 tick resolution | project + sort ticks per run | **O((n+m) log(n+m))** | one sort per run; Σ ticks = O(n+m). |
| 6 placement | group + stack | **O(k log k)** per axis, **O(K log K)** total | pure sorts. |
| 7 conflicts | interval overlap + dim×geometry crossing | **O(K log K)** for text (1-D sweep); geometry crossing **O(K log n)** via spatial-index broad-phase | `SpatialGrid.queryBounds` (`spatial-index`) / `TopologySpatialIndex.queryBounds:202` for dim-line-vs-wall. |
| 8 QA | linear scans | **O(n+m+K)** | — |

**Overall target: O(n log n)** once Stage-1 clustering + Stage-7 crossing use the spatial index. The
naive as-shipped `detectJunctions` O(n²) is the only super-linear hot spot and is bounded per-level;
a spatial-grid pre-bucket is the noted optimisation (not required for P1 correctness).

---

## 13. Edge cases (explicit handling)

| Case | Handling |
|---|---|
| **L-shaped plan** | Two perpendicular runs; each dims independently; overall = perimeter AABB (not a single façade). Corner node shared by both runs (one tick, deduped Stage-5). |
| **T-intersection** | `detectJunctions` already classifies T (passthrough, `:544-599`). The through-wall is one run; the stem is a separate run that terminates at the passthrough foot (no false collinear merge — `notThroughForeignJunction` guard). |
| **Angled (non-orthogonal) walls** | Runs use `axisDir` (not world X/Z); chain measures true length (`orientation: 'aligned'`). Overall still uses AABB extents. `setOutDimensions`' orthogonal-only assumption (`:141`) is *not* inherited — the engine dims along the run axis. |
| **Multiple adjacent openings** | Stage-2 alternating pier/opening slices produce pier–door–pier–window–pier ticks in one chain; overlap guard via `WallOccupancyStore.canPlace` epsilon (`:246`). |
| **Tiny fragments / stubs** | `detectJunctions` flags degenerate cluster walls `invalid` (`:86,649`); the engine skips `invalid` walls from runs and merges sub-`MIN_OPENING_M` slivers (Stage-7). |
| **Double doors** | `doorType: 'double'` (`Door.ts:17`) is one opening span → one width dim; leaf split is not dimensioned (architect convention). |
| **Corner windows** | A window whose span reaches a corner node: Stage-3 clamps `s1` to the run end (reuse `WallOccupancyStore.clampToWall`, `:127`); the two façades each show their portion. |
| **Curtain walls** | Modelled as a wall run of `curtain-wall` system type; panel mullions dimensioned as opening-like ticks in P2+ (curtain-wall geometry via `geometry-curtain-wall`). MVP: overall + panel-count chain. |
| **Parallel chains** (two walls forming a cavity/party wall) | Two distinct runs on parallel axes; each stacks on its own side; the perpendicular gap dimensioned by a single cross tie (reuse `_resolveParallelWallDim`, `LinearDimPlanToolHandler.ts:242`). |
| **Shared / nested joins (X, Y)** | `detectJunctions` handles X/Y natively (`buildSweepEntries`, `:670`); each arm is its own run; the shared node is one tick. |
| **Curved walls** | **Future.** Tessellate to polyline first (reuse `PathResolver.toPolyline`, cited via room-topology `:223-230`); dim the chord + radius (`kind: 'radius'` already in the schema, `dimension.ts:137`). Out of P1–P3. |

---

## 14. Determinism guarantees (explicit)

1. **Stable input ordering.** The engine sorts walls once at entry by `(levelId, minX, minZ, id)` —
   a total order with a ULID `id` final tiebreak (`Wall.ts` ids are `wall_<ulid>`, `BaseNode.ts:35`).
   `detectJunctions` clustering is documented order-dependent (`JunctionResolverV2.ts:834`), so the
   canonical sort makes it reproducible.
2. **Canonical run direction.** `axisDir` is canonicalised so `axisDir.x > 0`, or `axisDir.z > 0`
   when `x≈0` — never orientation-dependent on member insertion order.
3. **Tie-breaks everywhere.** Every `sort`/`min`/`max` has an explicit final `id` comparator. No
   `Set`/`Map` iteration order is trusted for output ordering (collected then sorted).
4. **Seeded ID factory.** Dimension ids via a caller-supplied `idFactory` (default monotonic,
   `producer.ts:117`); production passes a ULID factory but the *ordering* is fixed by the Stage-8
   sort, so ids are positionally stable.
5. **No wall-clock / RNG.** Zero `Date.now`/`Math.random` (C24.1 §1.1). Rounding is fixed-epsilon
   (`EPSILON_M = 0.001`, mm rounding as `setOutDimensions.ts:152`).
6. **Byte-identical re-run** is asserted in tests (QA-6).

---

## 15. Observability (P8)

Every exported engine function opens ≥1 OTel span, following the pure-module pattern already used by
`solveSetOutPoint` (`setOutDimensions.ts:216`, `startActiveSpan('pryzm.wall.solve_setout_point')`).
Proposed spans: `pryzm.autodim.plan` (root, attributes: `wall_count`, `opening_count`,
`string_count`, `error_count`), and one child per stage
(`pryzm.autodim.graph|segment|chain|resolve|place|conflict|qa`). The editor executor adds
`pryzm.autodim.apply` around the `runBatch` dispatch (C24.1 §1.9 span-at-boundary).

---

## 16. Phased implementation plan

| Phase | Scope | Reuses | Exit |
|---|---|---|---|
| **P1 — MVP** | Exterior wall-chain + opening/location dims on **rectangular + L** plans. Overall (rank 1) + exterior chain (rank 2) + opening chain (rank 3). Single-row stacking. | `detectJunctions` (Stage-1), `getOccupiedSpans` (Stage-2/3), `DimensionString` + `evaluateDimensions` (output), `dimension.create` sink. | On any rect/L plan the engine emits overall + one exterior chain per façade with every opening located; QA-1/QA-2/QA-3 pass; deterministic re-run byte-identical. |
| **P2 — Conflict + stacking** | Multi-row stacking, text-overlap bump, geometry-crossing push, dedupe (DR-1/DR-2), tiny-fragment merge. Angled + T + parallel-chain edge cases. | Stage-6/7 + spatial-index broad-phase (`spatial-index`). | Dense plans (adjacent openings, T-junctions) produce non-overlapping, non-duplicated stacks; QA-4 passes. |
| **P3 — Interior rooms** | Room-bounding chains + wall-to-wall internal running dims via `computeTopology.rooms`. | `PlanarTopologyEngine` room rings + `RoomPolygonUtils`. | Every detected room dimensioned; set matches C24.1 `room-bounding` coverage. |
| **P4 — Documentation core** | Grids, columns, sections, elevations (extend `autoMode`), + extract the shared pure `planar-topology` core (§4.2). Curtain-wall panels, curved-wall chords/radii. | `geometry-column`/grid handlers, `EdgeProjectorService` section/elevation, C24.1 DS layer. | AutoDimension is one node in the "documentation core": walls/doors/windows/rooms/grids/columns all auto-dimensioned across plan/section/elevation. |

**Modularity (deliverable #11 — the "documentation core" vision).** The engine is built as a
registry of **string-planners** keyed by element class (`WallRunPlanner`, `OpeningChainPlanner`,
`RoomChainPlanner`, later `GridPlanner`, `ColumnPlanner`, `SectionPlanner`). Each planner is a pure
`(snapshot, graph) → PlannedString[]` function; the pipeline (Stages 5–8) is planner-agnostic. Adding
grids/columns/sections is registering a new planner, never touching placement/conflict/QA. This
mirrors the geometry-kernel `producers/*` registry (`packages/geometry-kernel/src/producers/`,
one file per element type) and the plan-tool handler registry
(`plantools/planToolHandlerRegistry.ts`), so it fits PRYZM's established extension shape and feeds
directly into the C24.1 auto-documentation set as the dimension provider.

---

## 17. Contract & governance mapping

- **C03** (schemas/commands/state) — output is the existing L0 `DimensionString`; mutation only via
  the command bus (P6) through the editor executor.
- **C11** (creation pipeline) — auto-dim is a *derived* creation; the executor runs one
  `batchCoordinator.runBatch` (one undo), same as the docs executor.
- **C15** (hosted elements) — opening positions read from the C15 embedded-`Opening` offset model
  (`Wall.ts:33-44`, `WallOccupancyStore`); no new opening state.
- **C24.1** (auto-documentation) — this engine is the missing "DS5+" dimension provider; it upgrades
  the naive `produceDimensions` set-out mode to a planned, QA'd set while honouring §1.1 purity,
  §1.2 executor-only mutation, §1.3 coverage, §1.5 rule-based placement, §1.6 C34 styles.
- **C34** (drawing standards) — styles/weights injected by the caller; none hard-coded in the pure
  engine.
- **ADR-0055** — Stage-1 reuses the P1 junction graph so dimension ticks and wall miters agree.
- **ADR-0061** — determinism is a first-class invariant (§14, QA-6).

---

## 18. Open questions

1. **Sink choice** — persist `DimensionString` (element-anchored, chains, auto-provenance) vs
   dispatch `dimension.create` (typed §P3.5-DI, raw points, undoable). Recommend **both**: engine
   emits `DimensionString[]`; executor adapts to `dimension.create` via `evaluateDimensions` for the
   typed undoable path. Needs a `dimension.createMany` batch verb to keep one-undo without N handler
   round-trips.
2. **Pure-topology extraction** — do P1 with an in-package `buildPureWallGraph` mirror, or fast-track
   the P4 `packages/planar-topology` lift so `room-topology` and `auto-dimension` share one pure core
   (avoids a THREE-taint risk and code duplication)?
3. **Face vs centreline datum** — room rings are wall *centrelines* (`RoomPolygonUtils.ts:205-210`);
   `outerFacePolygon` is offset `0.10 m` (fixed) not true per-wall outer face. For exact
   outer-face dimensions, resolve per-wall thickness via the `face-outer`/`face-inner` anchors
   (already in the schema, `dimension.ts:66-67`) rather than the offset ring.

---
_Design spike only — no source changed. Implementation gated on P1 sink/verb decision (open Q1)._
