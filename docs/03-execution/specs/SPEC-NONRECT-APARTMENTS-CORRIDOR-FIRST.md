# SPEC — Non-rectangular apartments (corridor-first reshape-not-drop)

| Field | Value |
|---|---|
| Status | Active — normative (Phase 1 + Phase 2 + Phase 3) |
| Version | 1.2 |
| Date | 2026-06-28 |
| Owner | Residential-building generator (`@pryzm/ai-host` workflows/residentialBuilding) |
| Flag (P1) | `globalThis.__pryzmNonRectCells === true` (default OFF — rectangular plates byte-identical) |
| Flag (P2/P3) | `globalThis.__pryzmCorridorGrid` — **DEFAULT-ON since P3**. Now an OPT-OUT kill-switch: `=== false` forces baseline-only (byte-identical to pre-P3); absent / any other value ⇒ the rich corner-preserving fill (the default) |
| Contracts | [C50 §1.7](../../02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md) (soft-fail, never throw), [C53](../../02-decisions/contracts/C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md) (the polygon-native engine) |
| Related | §RESI-PLATE-UNDERFILL, §RESI-CLIP-BOUNDARY, §RESI-FILL-PLATE, §RESI-CORRIDOR-GRID, §RESI-EDGE-TYPE-VARIETY |
| ADR | [ADR-0075](../../02-decisions/adrs/ADR-0075-resi-corner-preserving-perimeter-fill.md) (corner-preserving perimeter fill, default-on) |

> The residential plate packer tiles the plate BBOX with axis-aligned rect cells and DROPS any cell
> that straddles a non-rectangular (L / trapezoid) drawn boundary — so a non-rect plot loses the
> boundary cells, and deep bands leave residual un-tiled. Phase 1 inverts the drop into a RESHAPE:
> the in-boundary part of a straddling cell (and genuine feasible residual pockets) becomes a
> rectilinear-polygon cell that still FRONTS the corridor — absorbing area the rect packer wastes,
> while keeping every unit corridor-reachable and engine-layout-able.

---

## §1 Scope & flag

Phase 1 is gated behind `globalThis.__pryzmNonRectCells`. **OFF (default): byte-identical** to the
pre-P1 behaviour on every plate (the new code paths are inert; a rectangular plate is unchanged
regardless of the flag). ON: the reshape + residual-absorption passes run. This bounds risk while
the non-rect path matures.

## §2 Cell carries a polygon — `ApartmentCell.polygon: Pt[]`

Every placed cell carries its REAL footprint polygon (metres, plan-XZ, CCW). A rectangular cell's
polygon is exactly `rectPolygon(rect)` (its 4 corners) → identical geometry. A RESHAPED cell carries
the clipped rectilinear polygon. Rect-only gates / consumers read the cell's bbox via `cellBBoxRect`
(or the cell's `rect`, which for a reshaped cell is its bounding box).

## §3 RESHAPE-NOT-DROP (the §RESI-CLIP-BOUNDARY pass)

When the §RESI-CLIP-BOUNDARY pass would DROP a cell whose centre is outside the drawn `clipPolygon`:

- **OFF:** drop it (the proven behaviour).
- **ON:** clip the cell rect to `clipPolygon` (`clipRectToPolygon` — a rectilinear grid-cover + ring
  trace, robust for the rectilinear boundaries the resi pipeline draws). KEEP the clipped cell only
  when it (a) is ≥ a feasible fragment area, AND (b) satisfies the **corridor-first invariant CF**:
  one of its polygon edges still fronts a corridor band by ≥ a door width (`polygonFrontsCorridor`).
  A cell that can't front the corridor is **soft-failed (dropped, C50 §1.7) — NEVER shipped sealed**.
  The clipped cell's `polygon` is set; its `rect` = the polygon bbox; its `areaM2` = the polygon area.

## §4 RESIDUAL ABSORPTION (the deep / pocket residual)

After the rect rows pack, the in-boundary area not covered by any cell / the core / a corridor is
flood-filled into connected rectilinear regions (`absorbResidual`). Each region is minted as an
additional reshaped cell when it passes an **engine-feasibility gate**: ≥ a real apartment area,
short side ≥ the feasible min depth (~7.5 m), aspect ≤ ~2.2:1, ≥ 75 % bbox-fill, AND it fronts a
corridor (CF). A region failing the gate stays residual — **no rejected sliver cell is ever minted**
(the founder sees only laid-out apartments). This absorbs genuine feasible pockets the rect packer
left empty; a shallow-row residual (below the feasible depth) is correctly left empty by design.

## §5 The engine lays out the non-rect cell

`shellFromCell(cell, polygon?)` threads a reshaped cell's polygon through as `ShellAnalysis.perimeter`
so the ALREADY-polygon-native single-apartment engine (`subdividePolygon` / `tileConcave`) lays out
rooms in the non-rect unit; the net area is the polygon area. A rect cell (4-corner polygon / absent)
takes the byte-identical rect ring. `runApartmentCellLayout` passes `cellPolygon` only for a `>4`-vert
cell.

## §6 Executor (flag-gated)

`ResidentialBuildingExecutor._buildCellPerimeter` builds the cell-perimeter walls from the cell
POLYGON edges (`_buildPolygonCellPerimeter`) when the flag is ON and the cell is non-rect (> 4 verts);
the corridor-fronting edge carries the entry door. Flag OFF / a rect cell ⇒ the byte-identical
4-edge rect path. (Confined to the cell-perimeter region; the deferred-opening passes are untouched.)

## §7 Gates / acceptance

- **§DIAG-RESI-PARTITION** reports `reshaped=N` + `reached=N/N` (CF holds for every placed cell).
- **§DIAG-RESI-FILL** `fillRatio` uses each cell's REAL polygon area (a reshaped cell counts its true
  footprint, not its bbox).
- **Rect plates byte-identical** with the flag OFF (and ON-without-clip) — pinned by test.
- **An L-plate reshapes** the straddling cell (clip-not-drop), every unit fronts a corridor, and no
  apartment centroid lands in the removed corner — pinned by test.
- **A deep rect plate's fill never decreases** with the flag; feasible residual is absorbed (engine-
  feasibility-gated so absorbed cells lay out). Note: a deep plate whose residual is SHALLOW-row waste
  (below the feasible depth) is intentionally NOT force-filled — minting un-layable cells is forbidden
  (§4); the deeper corridor-grid rework that would deepen those rows is a later phase.

## §8 Tests

`packages/ai-host/src/workflows/residentialBuilding/__tests__/platePartition.test.ts` §NONRECT block:
rect-cell polygon identity; flag-OFF byte-identity; L-plate reshape + CF + no-corner-overrun; deep
37×29 fill never decreases + CF. Plus byte-identity across the existing partition/fill/orchestrator
suites with the flag OFF.

---

## PHASE 2 — §RESI-CORRIDOR-GRID (deep-plate corridor-grid fill)

> Founder 2026-06-26: *"it is not possible to have only 3 apartments in such a huge floorplate."* The
> baseline §RESI-FILL-PLATE corridor walk (`sideCorridors`) steps OUTWARD from the core by a fixed
> `pitch = 2·cap + corridorWidth` and CLAMPS the last corridor a fixed `cap` in from each plate edge.
> On a MODERATELY-deep plate — depth between one and two pitches (e.g. 60×30) — the core corridor and
> both clamped edge corridors land only ~5 m apart, so the apartment ROWS between them collapse below
> `MIN_ROW_DEPTH` and are dropped. The plate keeps just its two outer rows (≈12 cells / ~0.55 fill on a
> 1 800 m² plate) with a dead middle band crossed by three useless corridors — the founder's symptom.

### §P2.1 Scope & flag

Phase 2 is gated behind `globalThis.__pryzmCorridorGrid` (independent of the P1 flag). **OFF (default):
byte-identical** to the pre-P2 partition on EVERY plate (only the baseline corridor line-set is packed).
ON: an EVEN corridor GRID is offered as an additional candidate. Both flags compose (each is read
independently inside `partitionLevelPlate`).

### §P2.2 The even corridor GRID

When ON, `gridCandidateLineSets()` offers EVEN-grid corridor line-sets for a small corridor-count range
around `mIdeal = ceil(D / pitch)` (the fewest corridors keeping each of the `2·m` double-loaded rows
≤ `cap`): `mIdeal`, `mIdeal±1`. Each set lays `m` corridors at an even pitch `D/m`, PHASE-SHIFTED so one
line lands closest to `coreCz` (the vertical SPINE still ties the grid to the core — every apartment
stays corridor-reachable). A SHALLOW plate (`D ≤ pitch ⇒ mIdeal ≤ 1`) offers NO grid candidate ⇒ the
single central corridor (proven path) is used unchanged.

### §P2.3 Best-of-candidates (no regression by construction)

`partitionLevelPlate` PACKS every candidate line-set with the identical, unchanged row-packer
(`packPlate(centreLines)` — a pure closure over the demand list) and keeps the one that places the most
apartments (tie → most placed area). The baseline is always candidate 0, so a plate the baseline already
fills well KEEPS the baseline — the grid only wins where it genuinely packs more (the deep-plate valley).
This makes the flag safe by construction: it can never reduce a plate's apartment count.

### §P2.4 Gates / acceptance (Phase 2)

- **Flag OFF byte-identical** on every plate (pinned by test) — the §DIAG shallow-row gates stay green.
- **Flag ON, shallow plate byte-identical** to OFF (the grid emits no candidate below one pitch).
- **Deep 60×30 plate** yields a sensible COUNT (≥ 24, > 2× the baseline ~12), every cell reached = N/N,
  no overlaps with cells / core / corridors.
- **Every placed cell is corridor-adjacent** (a cell edge overlaps a corridor band edge by ≥ a door
  width) — verified geometrically, not just via the `apartmentsReached` counter.
- **Never regresses** a plate the baseline already fills (60×32 / 60×36 / 80×60 / 137×137: count ≥ OFF).

### §P2.5 Tests

`platePartition.test.ts` §RESI-CORRIDOR-GRID block: flag-OFF byte-identity (multiple plates); flag-ON
shallow byte-identity; deep-60×30 many-apartments + reached=N/N; per-cell corridor-adjacency (geometric);
no-overlap; no-regression across the well-filled depths.

### §P2.6 In-browser verification still owed

The unit tests prove the partition GEOMETRY (count, reach, no-overlap). What still needs a live check on
`pryzm.fly.dev` with `globalThis.__pryzmCorridorGrid = true`: (a) the per-cell D-TGL engine actually lays
out the grid's rows (the grid rows can be shallower than the baseline's — ~6.75 m at 60×30 vs the 9 m
cap — and the frozen engine's feasible floor is ~7.5 m for a full multi-room unit; sub-floor rows scale to
studios, which is acceptable but should be eyeballed); (b) the executor builds the extra corridor bands as
real circulation (the spine still connects every grid line to the core); (c) the founder's actual large
drawn plate now reads as many apartments, not 3.

---

## PHASE 3 — §RESI-CORRIDOR-GRID DEFAULT-ON + §RESI-EDGE-TYPE-VARIETY (corner-preserving perimeter fill)

> Founder 2026-06-27 (screenshot): *"only ~4 apartments, one in each corner, the whole perimeter between
> them empty. KEEP the corner apartments — but ALSO fill the long edges between the corners with adjacent
> apartments, and these can be DIFFERENT (fewer bedrooms / different sizes). This should be the DEFAULT."*
> See [ADR-0075](../../02-decisions/adrs/ADR-0075-resi-corner-preserving-perimeter-fill.md).

### §P3.1 Default-on, corner-preserving HYBRID candidate

The Phase-2 even grid is REPLACED by a corner-preserving HYBRID corridor candidate that is offered on
EVERY plate by default (no opt-in). The hybrid KEEPS two DEEP outer corridors — placed `outerDepth +
halfCorr` from each plate edge so their outer rows are a full `MAX_APARTMENT_DEPTH_M` band that reaches
the edge (the founder's deep dual-aspect corner units) — and FILLS the interior between them with
`nInterior` evenly-spaced corridors. An interior corridor is added ONLY when its rows clear the
engine-feasible depth floor `ENGINE_MIN_ROW_DEPTH_M = 7.5 m`; a band too thin for a feasible row yields no
hybrid candidate for that count (the plate keeps its deep-corner baseline — correct for a smaller plate).
The flag `__pryzmCorridorGrid` is now an OPT-OUT kill-switch: `=== false` ⇒ baseline-only (byte-identical
to pre-P3); absent / anything else ⇒ the rich fill (the default).

### §P3.2 Feasible-first best-of-candidates (no regression by construction)

`partitionLevelPlate` packs every candidate line-set and scores by **(engine-feasible cell count, then
total count, then placed area)** — feasible cells FIRST. Scoring feasible cells first is what makes the
hybrid win where it tiles the perimeter with BUILDABLE units and keeps the baseline where it already fills
feasibly. The baseline is always candidate 0; a tie keeps it ⇒ the default never reduces a plate's feasible
apartment count. (A cell is "engine-feasible" when its row depth ≥ `ENGINE_MIN_ROW_DEPTH_M`.)

### §P3.3 §RESI-EDGE-TYPE-VARIETY — geometry-honest typology assignment

After placement, each cell's typology is RE-STAMPED from its REAL AREA (`typologyForArea`), choosing among
the typologies the brief enabled (`TYPOLOGY_AREA_BAND`, audit §6). Larger cells → larger typology (deep
corner cells become T3/T4), smaller cells → smaller typology (shallow edge-fill cells become T1/T2). The
orchestrator declares the full enabled-typology palette to the partition and pairs each placed cell to a
program BY ITS STAMPED TYPOLOGY (not the demand index — `programFor(cell.typology)`), so the bedroom count
matches the cell that holds it. A single-typology brief is a no-op (uniform; byte-identical). Every cell
stays within the brief's enabled mix and the min/max area bound.

### §P3.4 Gates / acceptance (Phase 3)

- **Default (no flag) never regresses** vs the opt-out baseline on any plate (feasible count + total count
  ≥ baseline) — pinned by test across 60×30 / 40×30 / 40×40 / 60×32 / 60×36 / 80×60 / 137×137.
- **Deep corner band PRESERVED**: a feasible dual-aspect cell touches each of the four plate corners on a
  deep plate (80×60) — pinned.
- **Large plate fills the perimeter**: count scales with area (40×30 < 60×40), ≥ 16 units on 60×40, not 4.
- **Variety present**: a multi-typology brief yields ≥ 2 typologies; the largest cell carries a larger
  typology than the smallest (geometry-honest). A single-typology brief stays uniform.
- **Corridor-first + no overlap** for every placed cell (reached = N/N; no cell overlaps a cell / core /
  corridor) — pinned geometrically.
- **Small plate unchanged**: a 20×15 still yields its honest few units; a 28–32 m square keeps its 4 deep
  corners (variety does not force a fixed count).
- **Opt-out (`=== false`) byte-identical** to the pre-P3 baseline.

### §P3.5 Tests

`platePartition.test.ts`: the rewritten §RESI-CORRIDOR-GRID block (opt-out determinism, default no-regression,
deep perimeter fill, shallow-plate baseline, corridor-adjacency, no-overlap, corner-preservation) + the new
§RESI-EDGE-TYPE-VARIETY block (large-plate many-apartments, variety spans typologies, reach + no-overlap,
small-plate honest count, single-typology uniform, corner cells larger typology). `residentialBuildingOrchestrator.test.ts`
demo / corner / T3-fit suites pass end-to-end with the default fill.

### §P3.6 In-browser verification still owed

On `pryzm.fly.dev` with the DEFAULT (no flag set): (a) the per-cell D-TGL engine lays out the hybrid's
interior rows as real multi-room units (interior rows are ≥ 7.5 m by construction, so this should hold —
eyeball a deep plate); (b) the executor builds the extra corridor bands + their cell walls as real
circulation tied to the core spine; (c) the founder's actual large drawn plate now reads as deep corner
units + a filled perimeter ring of varied typologies, not 4 corners around a dead band.
