# SPEC — Non-Rectangular Apartments, Corridor-First

> **Stamp**: 2026-06-26 · **Status**: DRAFT (design spike — research findings + staged plan; NOT yet
> implemented). Tag: `§SPIKE-NONRECT-APARTMENTS`.
> **Authority / governed by**: [C53 — Generative Layout Engine Architecture](../../02-decisions/contracts/C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md)
> (the L-PRINCIPLE topology↔geometry separation), [C50 — Typology Pipeline](../../02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md)
> (§1.7 infeasible → soft-fail, never throw), [C20 — Building & Apartment Aggregates](../../02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md),
> [ADR-0073 — Hierarchical Access Graph + corridor spine](../../02-decisions/adrs/0073-hierarchical-access-graph-corridor-spine.md),
> ADR-0072 (corridor spine on stair-fragmented plates), ADR-0061 (determinism substrate).
> **Builds on**: [SPEC-SPINE-FIRST-RESIDENTIAL-ENGINE](SPEC-SPINE-FIRST-RESIDENTIAL-ENGINE-2026-06-21.md),
> [SPEC-APARTMENT-LAYOUT-GENERATOR](SPEC-APARTMENT-LAYOUT-GENERATOR.md) (the "doc §13" polygon-native
> seam), [SPEC-CIRCULATION-GRAPH](../../03_PRYZM3/SPEC-CIRCULATION-GRAPH.md) (the §DIAG topology gates),
> [SPEC-ARCHITECTURAL-PROGRAM-RULES](SPEC-ARCHITECTURAL-PROGRAM-RULES.md) (the connectivity matrix).

---

## 0. Thesis

Two independent capabilities exist in the codebase today, but they are **not yet joined**:

1. **The single-apartment engine (D-TGL) is already polygon-native.** `apartmentLayout/tgl/polySubdivide.ts`
   tiles a *real* convex quad (Phase 3) and a *concave* simple polygon — L/U/T or an arbitrary drawn
   boundary (Phase 4) — into program-driven room CELLS via recursive Sutherland–Hodgman half-plane
   clips, splitting at a reflex vertex first and distributing the whole program area-proportionally.
   `enumerate.ts` already routes a sheared/concave shell there (`shouldUsePolygonConcaveRoute`).

2. **The multi-family plate engine is strictly rectangular.** `residentialBuilding/platePartition.ts`
   emits apartment cells as axis-aligned `Rect`s; `runApartmentCellLayout.ts` accepts only a `Rect`
   cell and synthesises a 4-corner `ShellAnalysis` from it. A non-rectangular residual of the plate
   (everything the rect packer can't tile) is **left blank** — the founder's recurring "deep plate
   leaves wasted area" and "an L-shape comes out rectangular" defects.

**The spike's conclusion:** non-rectangular apartments at the *building* scale do **not** require an
engine rewrite. They require (a) widening the plate→cell handoff from `Rect` to *polygon*, and (b)
re-using the polygon subdivider that already exists for the single-apartment case. The corridor-first
inversion that SPEC-SPINE-FIRST began (`deriveCorridorSpine`) is the structural key that makes the
non-rect residual *safe*: when the corridor network is derived first and every unit is a residual cell
that fronts it, an irregular cell shape can never break circulation — it only changes the cell's
*geometry*, not its *access*.

This is a **plan doc**. No engine code is changed here; the implementation is staged and gated below.

---

## 1. Current state — where "rectangular-only" actually lives (file:line)

### 1.1 The apartment-engine layer is NOT the blocker — it is already polygon-aware

| capability | location | note |
|---|---|---|
| Rectilinear slab decomposition (exact for rect / L / T / U, stair-steps slanted edges) | `tgl/rectDecomposition.ts:302` `decomposeToRects` | The *axis-aligned* polygon foundation. |
| Convex-quad rectify (skewed plot → bbox tiling) | `tgl/rectDecomposition.ts:116` `rectifyConvexQuad` | The bbox-overflow workaround the polygon route supersedes. |
| **Polygon-native subdivide (the real fix)** | `tgl/polySubdivide.ts:313` `subdividePolygon` | Convex (`tileConvexZones:367`) + concave (`tileConcave:477`) real-polygon tiling. |
| Concave-route predicate | `tgl/polySubdivide.ts:180` `shouldUsePolygonConcaveRoute` | True for off-axis / reflex shells; excludes axis L/U/T (rect path tiles those exactly). |
| Polygon room CELL type | `tgl/subdivide.ts:49` `RoomCell { polygon: Pt[] }` | The `§POLYGON-NATIVE-SEAM` — a strict superset of the rect `RoomPlacement`. |
| Engine routing to the polygon path | `tgl/enumerate.ts:1252-1361` (`usePolygonRoute`, `subdividePolygon(...)`) | Already wired; gates still score the bbox-rect tiling in parallel during migration. |
| Stair keep-out as a polygon HOLE | `tgl/polySubdivide.ts:636` `subtractRectFromCell` | Exact rectilinear `cell \ hole` (L/U notch). |
| Corridor-first spine derivation | `tgl/deriveCorridorSpine.ts:89` `deriveCorridorSpine` | Long-axis chord through the convex shell + stair leg + entry leg. Adapts to skewed/convex plates. |

**Conclusion for layer L2 (apartment engine):** a single apartment can already be an L/stepped/skewed
polygon. The remaining engine gaps are interior (the rect-scoring gates run on the bbox tiling, not the
real polygon — `enumerate.ts:1308-1312` "the two coexist during migration"), tracked by the apartment
generator spec, NOT by this spike.

### 1.2 The residential-building layer IS the blocker — hard rect assumptions

| assumption | location | consequence |
|---|---|---|
| Apartment cell is a `Rect` | `residentialBuilding/platePartition.ts:77` `ApartmentCell { rect: Rect }` | A cell can only be an axis-aligned box. |
| Door edge is one of 4 rect edges | `platePartition.ts:82` `doorEdge: 'x0'|'x1'|'z0'|'z1'` | Corridor adjacency is expressed per-rect-edge, not per-polygon-edge. |
| Whole partition tiles the **bbox**, then clips by centre-in-polygon | `platePartition.ts:296-668` `_partition`; drop loop `670-683` (`§RESI-CLIP-BOUNDARY`) | A non-rect plate **drops** out-of-shape cells (whole apartments deleted) rather than **reshaping** them — wasted residual. |
| Footprint must be ~rectangular or it is rejected | `platePartition.ts:313` `bboxFill < 0.8` → `reject(...)` | A genuine L-plate is refused outright (`§RESI-APPROX-RECT`). |
| Depth capped → deep residual left un-tiled | `platePartition.ts:125` `MAX_APARTMENT_DEPTH_M = 9`, `:139` `MAX_OUTER_BAND_DEPTH_M = 12` | The deep-plate **under-fill** problem: "the deeper residual … is left un-tiled (wasted area)". |
| Sub-min remainder greedy-sliced and **left un-built** | `platePartition.ts:519-535` `§RESI-T3-FIT-REGRESSION-FIX` (`sliceWidth`, "leave the remainder unbuilt") | The irregular strip a polygon cell would absorb is dropped. |
| Per-cell engine call takes a `Rect` only | `runApartmentCellLayout.ts:79` `cell: Rect`; `:306` `shellFromCell(cell: Rect)` builds a 4-corner shell | The polygon-capable engine is fed a box even though it can tile a polygon. |
| Façade-edge computation is per-rect-edge | `residentialBuildingOrchestrator.ts:392` `facadeEdgesFor(cell, plateBB)` over `cell.rect`'s 4 edges | Window/party-wall classification assumes 4 axis edges. |

**The single seam to widen:** `ApartmentCell.rect: Rect` → add `ApartmentCell.polygon: Pt[]`, threaded
through `runApartmentCellLayout` into `shellFromCell` (which already builds a `ShellAnalysis.perimeter`
ring — it just hard-codes 4 corners at `runApartmentCellLayout.ts:315-320`). The engine downstream of
that point already consumes an arbitrary `perimeter`.

### 1.3 Corridor-first: what is already inverted

`platePartition.ts` already derives the **corridor grid first** and packs units into the residual:

- `§RESI-FILL-PLATE` (`platePartition.ts:330-422`): corridor centre-lines are chosen *before* any
  apartment, tiling the whole plate depth; apartments are the residual on each side.
- `§RESI-CORE-SPINE` (`platePartition.ts:424-436`): a vertical spine ties every corridor band to the core.
- `§RESI-ENTRY-INTO-CORRIDOR` (`deriveCorridorSpine.ts:113-174` `addEntryLeg`; consumed per-cell at
  `runApartmentCellLayout.ts:374-403`): the apartment's *internal* corridor is forced to reach the
  cell's corridor-facing `doorEdge` midpoint, so the front door opens into circulation.

So the **invariant is already half-built**: corridor before units, units front the corridor. What is
missing is letting the residual cell be a *polygon* so the corridor's leftover area is absorbed instead
of dropped.

---

## 2. Proposed staged design

### 2.1 The data model change (the seam)

```
// platePartition.ts
interface ApartmentCell {
  typology: Typology;
  polygon: readonly Pt[];        // NEW — the real (rect OR rectilinear-poly) cell ring, CCW
  rect: Rect;                    // KEEP — the bbox AABB cover, for the rect-consuming gates
                                 //         (mirror `cellBBoxRect` in polySubdivide.ts:724)
  areaM2: number;                // shoelace of `polygon` (cellAreaM2, subdivide.ts:88)
  doorEdgeSeg: { a: Pt; b: Pt }; // NEW — the polygon EDGE (segment) that fronts the corridor
  doorEdge?: 'x0'|'x1'|'z0'|'z1';// KEEP for a rect cell (back-compat); undefined for a poly cell
}
```

A rect cell sets `polygon = rectPolygon(rect)` (the lift already exists, `subdivide.ts:60`) → the new
fields are byte-identical to today for every rectangular plate. The polygon ring and the door segment
are the only genuinely new outputs.

### 2.2 CORRIDOR-FIRST as the invariant (the driver)

This is the load-bearing principle; everything else is residual.

```
PARTITION(plate, core, corridorSpec, mix):
  1. CORRIDOR NETWORK FIRST  — derive the corridor centre-lines + the core spine
     (today's §RESI-FILL-PLATE grid). The corridor is a first-class GEOMETRIC object,
     not a leftover. This already exists.
  2. RESIDUAL = plate \ (core ∪ corridorBands)  — the union of polygons left to house units.
     On a rectangular plate this is a set of rectangles (today). On an L/stepped/skewed
     plate it is a set of RECTILINEAR POLYGONS.
  3. UNIT PARTITION OF THE RESIDUAL — slice each residual region into per-typology unit
     cells, each anchored so one of its edges (`doorEdgeSeg`) lies on a corridor band.
     A unit MUST front the corridor (the I1-analogue: every unit shares ≥ door-width with
     the corridor) — this is the hard invariant, asserted by the gate (§4).
  4. PER-UNIT LAYOUT — run the polygon-native engine on each unit polygon (§2.4).
```

**Invariant CF (merge-blocking):** *the corridor network is derived in step 1, before any unit exists;
every emitted unit cell shares ≥ `DOOR_WIDTH_M` of one polygon edge with a corridor band.* A cell that
cannot front the corridor is not minted (soft-fail per C50 §1.7), never shipped sealed.

### 2.3 Non-rectangular unit cells — the staged shape model

A residual region is a rectilinear polygon (axis-aligned L/U/stepped) or a sheared convex polygon
(off-axis plate). Three ways a unit can be non-rect, in increasing capability:

**(P1 — interim) Rect-decomposed compound unit.** Decompose a non-rect residual region into axis-aligned
sub-rects with `decomposeToRects` (`rectDecomposition.ts:302`, already exact for L/T/U), then **group**
adjacent sub-rects into ONE unit whose `polygon` is the union ring of its sub-rects, provided the union
fronts the corridor. The engine is still fed the *bbox* of that union internally, but the *unit identity*
(one front door, one apartment number, one party-wall set) spans the compound shape. This reuses 100% of
the existing rect machinery; the only new code is the **union-ring builder** + the **front-door-on-
corridor selector**. Trade-off: interior walls may not perfectly follow the notch (the engine still tiles
a bbox internally), but the *unit footprint* is the real L — fixing the founder's "L comes out
rectangular".

**(P2 — native) Polygon unit, polygon-native room layout.** Feed the real unit polygon to the engine via
the widened `shellFromCell` (perimeter = the polygon ring). `subdividePolygon` (`polySubdivide.ts:313`)
already tiles a convex quad and a concave polygon into rooms. The corridor-facing edge becomes the
internal-corridor anchor (the `entry`/`doorEdge` already threaded at `runApartmentCellLayout.ts:374`,
generalised from a rect-edge midpoint to a `doorEdgeSeg` midpoint). This is the real non-rect apartment:
rooms tile the true L/stepped shape; interior walls follow the notch by construction.

**(P3 — optimisation) Residual-driven shape choice.** Let the partition *choose* a unit's shape to
absorb the residual the rect packer wastes: e.g. a corner unit takes an L that wraps the core; a deep
plate's back unit takes a stepped shape that hits two façades. Scored by a fill objective (residual area
absorbed) balanced against an aspect/awkwardness penalty (avoid 5:1 slivers and thin necks).

### 2.4 Why this improves plate FILL (the under-fill cure)

Today (`platePartition.ts:519-535` `§RESI-T3-FIT-REGRESSION-FIX`) a run that won't divide evenly inside
`[wMin,wMax]` is **greedy-sliced and the sub-min remainder is LEFT UN-BUILT** — explicitly "a thin strip
… accepted per the founder's narrowed scope". Likewise the depth cap (`:125`) leaves the deep part of a
band un-tiled. These remainders are exactly the irregular residual a *polygon* cell absorbs:

- A leftover L-strip beside the core (the "blue box", `§RESI-FILL-MIDEDGE:573`) becomes the notch of an
  adjacent unit's L instead of a separate sub-min rect that gets dropped.
- A trapezoidal sliver at a sheared façade becomes part of a corner unit's sheared edge (the engine
  already tiles a sheared convex quad — `polySubdivide.ts` Phase 3).
- A deep-plate back band that exceeds `MAX_APARTMENT_DEPTH_M` becomes a *stepped* unit (deep at the
  corridor, shallow toward the façade) rather than a capped rect + wasted strip.

The fill metric is the gate (§4 `§DIAG-RESI-FILL`): residual absorbed / residual available.

### 2.5 Nice INTERCONNECTIONS (room-to-room + unit-to-corridor)

The connectivity rules already exist (`apartmentLayout/rules/programRules.ts` — the connectivity matrix,
privacy gradient, door caps; the topology validators in `apartmentLayout/validators/topology/*`). Non-rect
units must honour them unchanged:

1. **Entry-into-corridor, generalised.** SPEC-SPINE-FIRST's "front door opens into circulation, never a
   habitable room" generalises from a rect `doorEdge` to a polygon `doorEdgeSeg`: the internal corridor
   spine reaches whichever polygon edge fronts the building corridor. `addEntryLeg`
   (`deriveCorridorSpine.ts:146`) already builds the L/T leg to an arbitrary entry `Pt`; it only needs
   the anchor to come from the `doorEdgeSeg` midpoint instead of a rect-edge midpoint.
2. **No enter-through-bedroom.** Unchanged — enforced by the existing privacy gradient + forbidden-
   adjacency validators (`validators/topology/privacyGradient.ts`, `forbiddenAdjacency.ts`,
   `topology/validateForbiddenAdjacencies.ts`). The polygon subdivider already buckets rooms public/
   private (`polySubdivide.ts:196` `bucketRooms`) and combs each zone off the corridor band.
3. **Open-plan zones.** `scaleCellProgram` (`runApartmentCellLayout.ts:242`) already folds dining into
   kitchen for compact cells (`openPlanKitchenDining`); a non-rect open-plan zone is a single larger
   sub-polygon in the public band — no new rule, just a larger comb slice.
4. **Master↔ensuite.** `carveEnsuiteFromMasterCell` (`polySubdivide.ts:262`) already carves the ensuite
   from the master's *polygon* — works for a non-rect master cell unchanged.
5. **Unit-to-corridor adjacency (building scale).** Invariant CF (§2.2): every unit fronts a corridor
   band on a real polygon edge. The double-loaded corridor + core spine
   (`platePartition.ts` `§RESI-CORE-SPINE`) guarantees the corridor network is connected; a poly unit
   just attaches to it on a (possibly non-axis) edge.

---

## 3. Phased implementation roadmap

Each phase is **test-first**, **gated**, and **browser-verified on prod** (localhost dev is unusable per
the founder's standing note). The apartment engine is **FROZEN** — phases call it, never modify it
(mirrors the P7 `runApartmentCellLayout` discipline).

### Phase 1 — Rect-decomposed non-rect cells (interim, low risk)

- **Scope:** widen `ApartmentCell` to carry `polygon` + `doorEdgeSeg`; on a rect cell set
  `polygon = rectPolygon(rect)` (byte-identical). Build a **union-ring builder** that groups adjacent
  residual sub-rects (from `decomposeToRects` on the residual region) into one compound unit when (a) the
  union fronts a corridor band and (b) the union area lands in the typology band. Lay out the compound
  unit by its bbox internally (existing path) but ship the real union ring as the unit footprint + party
  walls. The `§RESI-CLIP-BOUNDARY` drop loop (`platePartition.ts:670`) is replaced by **reshape** for the
  cells it would have dropped.
- **Deliverable:** an L-plate stops "coming out rectangular"; the deep-plate residual is absorbed into
  compound units rather than left blank.
- **Risk:** LOW — no engine change; the union ring is additive metadata; the rect drop path is the only
  behaviour replaced, behind a flag (`__pryzmNonRectCells`) defaulting off until the gate is green.
- **Gates that must pass:**
  - `§DIAG-RESI-PARTITION` reached = N/N (every unit fronts the corridor — Invariant CF).
  - **NEW** `§DIAG-RESI-FILL` — residual absorbed / residual available ≥ a floor (target ≥ 0.85; the
    current rect packer measures ~0.5–0.7 on deep plates).
  - The existing `platePartition.test.ts` + `apartmentPacker.test.ts` suites byte-identical with the flag
    OFF (rect plates unchanged).

### Phase 2 — Native polygon room layout (the real non-rect apartment)

- **Scope:** thread `polygon` into `runApartmentCellLayout`: `shellFromCell` (`:306`) builds
  `ShellAnalysis.perimeter` from the unit ring instead of 4 corners; the engine's already-wired polygon
  route (`enumerate.ts:1252`) tiles the real shape. The `doorEdgeSeg` midpoint becomes the `entry`
  anchor. `facadeEdgesFor` (`residentialBuildingOrchestrator.ts:392`) generalises from 4 rect edges to
  per-polygon-edge façade classification (an edge is façade iff it lies on the footprint boundary AND is
  not the corridor edge — same rule, per edge).
- **Deliverable:** rooms tile the true L/stepped/skewed unit; interior walls follow the notch; windows on
  real façade edges only.
- **Risk:** MEDIUM — the engine's *gates* still score the bbox-rect tiling in parallel during migration
  (`enumerate.ts:1308`), so a non-rect winner must be reconciled with the rect-consuming validators
  (shape/frontage/overlap) that read `cell.rect`. Use the `cellBBoxRect` AABB cover (`polySubdivide.ts:724`)
  for those, exactly as the apartment generator already does.
- **Gates:** all Phase-1 gates PLUS the SPEC-CIRCULATION-GRAPH PART-5 topology gates per unit
  (`corridorStairGap` / `publicOnCorr` / `corrBlob` — `enumerate.ts`), and the SPEC-SPINE-FIRST
  invariants I1/I2/I5 per unit (every private room fronts the internal spine; every window-room touches a
  real façade edge; ensuite off its master).

### Phase 3 — Residual-driven shape optimisation

- **Scope:** the partition *chooses* unit shapes (corner-wrapping L, stepped deep unit) to maximise
  `§DIAG-RESI-FILL` subject to an awkwardness penalty (aspect, neck width, façade count). Add a fill +
  awkwardness axis to the objective vector (mirrors the apartment dimensional/topology objective axes).
- **Deliverable:** highest plate utilisation; corner units that genuinely wrap the core/façade.
- **Risk:** HIGHER — search/optimisation; keep deterministic (ADR-0061: no RNG, fixed iteration order, as
  every existing partition helper does).
- **Gates:** Phase-2 gates PLUS a non-regression bound — fill must improve and no topology/circulation
  gate may regress versus the Phase-2 baseline on a fixture sweep (the §CIRCULATION-ROBUSTNESS-SWEEP
  idiom, extended to the multi-family plate).

---

## 4. Gates (the §DIAG checks each phase asserts)

| gate | source | Phase | meaning |
|---|---|---|---|
| `§DIAG-RESI-PARTITION reached=N/N` | `platePartition.ts:705` (exists) | 1 | every unit fronts the corridor (Invariant CF). |
| `§DIAG-RESI-FILL ≥ floor` | NEW | 1 | residual absorbed / available — the under-fill cure metric. |
| `corridorStairGap / publicOnCorr / corrBlob` | `enumerate.ts` PART-5 gates | 2 | per-unit circulation soundness. |
| I1/I2/I5 per unit | SPEC-SPINE-FIRST §4 | 2 | private→spine, window→façade, ensuite→master. |
| forbidden/privacy adjacency | `validators/topology/*` | 2 | no enter-through-bedroom; privacy gradient. |
| determinism (byte-identical, flag OFF) | ADR-0061 | 1–3 | rect plates unchanged; same input → same output. |

---

## 5. Trade-offs & decision (does this imply an ADR?)

- **Rect-decompose (P1) vs polygon-native (P2):** P1 is cheap and reuses everything but leaves *interior*
  walls bbox-aligned (the unit footprint is real, the partitions may not chase a notch). P2 is the
  correct end state but must reconcile non-rect winners with rect-only gates. The staging (P1 ships the
  *footprint* win immediately, P2 ships the *interior* win once gates are polygon-aware) de-risks both.
- **Drop vs reshape:** replacing `§RESI-CLIP-BOUNDARY`'s *drop* with *reshape* is the central behavioural
  change. It is gated behind `__pryzmNonRectCells` and `§DIAG-RESI-FILL`, defaulting off, so a regression
  cannot reach the founder before the gate is green.
- **No new contract needed.** This work is governed by C53 (engine architecture) + C50 (soft-fail) +
  ADR-0073 (corridor spine) and operationalised by SPEC-SPINE-FIRST. It widens an existing data contract
  (`ApartmentCell`) and re-uses an existing subsystem (`polySubdivide`). A **short ADR** is warranted only
  for the one architectural decision — *"the apartment cell is a polygon, not a rect; the residual is
  reshaped, not dropped"* — recorded as ADR-NONRECT-APARTMENT-CELL (proposed, §6).

---

## 6. Proposed ADR (stub — raise if Phase 1 is greenlit)

> **ADR-NONRECT-APARTMENT-CELL — Apartment cells are polygons; the plate residual is reshaped, not dropped.**
> Context: `platePartition.ts` emits rect cells and *drops* out-of-shape residual (`§RESI-CLIP-BOUNDARY`),
> wasting deep-plate area and forcing L-plates rectangular. The single-apartment engine is already
> polygon-native (`polySubdivide.ts`). Decision: widen `ApartmentCell` to carry a `polygon` ring +
> `doorEdgeSeg`; reshape the residual into rectilinear/sheared polygon units that front the corridor;
> feed the real ring to the frozen engine via `shellFromCell`. Consequences: plate fill rises; L/stepped/
> skewed units become first-class; rect plates stay byte-identical behind a flag; rect-consuming gates use
> the `cellBBoxRect` AABB cover during migration. Status: PROPOSED.

---

## 7. Out of scope (explicitly)

- Modifying the frozen D-TGL apartment engine (`runDeterministicLayout` and below). Phases CALL it.
- The single-apartment polygon gates (already tracked by SPEC-APARTMENT-LAYOUT-GENERATOR §13).
- `platePartition.ts` packing internals owned by another agent — this SPEC describes the *interface*
  change; the packing implementation is coordinated separately.
- Curved/non-rectilinear (true arc) boundaries — out of scope; rectilinear + sheared-convex only.
</content>
