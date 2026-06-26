# SPEC — Non-rectangular apartments (corridor-first reshape-not-drop)

| Field | Value |
|---|---|
| Status | Active — normative (Phase 1) |
| Version | 1.0 |
| Date | 2026-06-26 |
| Owner | Residential-building generator (`@pryzm/ai-host` workflows/residentialBuilding) |
| Flag | `globalThis.__pryzmNonRectCells === true` (default OFF — rectangular plates byte-identical) |
| Contracts | [C50 §1.7](../../02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md) (soft-fail, never throw), [C53](../../02-decisions/contracts/C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md) (the polygon-native engine) |
| Related | §RESI-PLATE-UNDERFILL, §RESI-CLIP-BOUNDARY, §RESI-FILL-PLATE |

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
