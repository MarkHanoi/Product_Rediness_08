# ADR-0112 — Cross-level slab-corner snap reference + far-from-origin snap-bounds fix

- Status: Accepted
- Date: 2026-07-02
- Tags: `§FEAT-SLAB-CORNER-REFS`, `§FIX-SNAP-BOUNDS-OVERFLOW`
- Scope: `packages/snapping/src/providers/SlabSnapProvider.ts`,
  `packages/snapping/src/SnapManager.ts` (provider wiring),
  `packages/spatial-index/src/SpatialGrid.ts` (bounds overflow),
  plus regression tests in `packages/snapping/__tests__/slabCornerRefs.test.ts`
  and `packages/spatial-index/__tests__/spatial-grid.test.ts`.
- Governs: C06 (UI shell & tools — interaction/snapping). Reuses the existing
  `ISnapProvider` / `SnapManager` architecture (`§B.2`, `§5.1.3`, `§5.1.4`).
- Consistent with: `§WALL-AUDIT-2026-C2` (SpatialGrid cell caps), `§40` (grid
  snap hierarchy). Does not supersede any prior ADR.

## Context (founder issue L-31)

Workflow: the user defines core walls on the **Ground** floor and a slab on the
**First** floor whose footprint is derived from those ground-floor walls. When
they then draw walls on the **First** floor, PRYZM offered no cross-level
reference — aligning the upper-floor walls to the shell below was guesswork.
Revit surfaces exactly this kind of reference; PRYZM lacked it.

In the same flow, drawing walls on L1 **far from the world origin** threw:

```
SnapBoundsError: SpatialGrid.getCellKeysForBounds: total cell count 11039838
  exceeds cap 1000000
```

which aborted the snap query (and, on the insert path, propagated out of the
wall-draw flow entirely).

### Root cause — the snap-bounds overflow

`SpatialGrid.getCellKeysForBounds()` **solid-filled** an element's AABB, one
grid cell per position inside it. Two situations blow past the cell caps:

1. A **degenerate** element AABB spanning from `(0,0,0)` back to a far point —
   e.g. a partially-initialised wall segment left with one default endpoint.
2. A **geolocated** project authored at large world coordinates (x≈12000,
   z≈8000), where any AABB straddling that region is tens of thousands of cells
   across.

`query()` caught `SnapBoundsError` and degraded to `[]`, but **`insert()` did
not** — so building/updating the spatial index during a far-from-origin draw
threw an uncaught error straight out of the tool. The cap existed to prevent
unbounded allocation, but throwing was the wrong remedy: it broke correctness
instead of preserving it.

## Decision

### 1. `§FIX-SNAP-BOUNDS-OVERFLOW` — corner-cell fallback, never a throw

When the solid AABB fill would exceed `MAX_CELLS_PER_AXIS` (1000) or
`MAX_TOTAL_CELLS` (1_000_000), `getCellKeysForBounds()` now indexes only the
AABB's **≤8 corner cells** (deduplicated) instead of throwing. Rationale:

- Snap queries always look near an **endpoint/corner** of an element. A
  radius/point query overlapping any corner cell still finds the item.
- The result is O(≤8) cells per insert regardless of AABB extent — bounded
  allocation, no throw on the insert path, and snapping stays correct at the
  corners/endpoints that actually matter.
- `queryRadius()` clamps its own box to the (small) snap radius, so it never
  triggers the fallback; the fix is a pure safety net for oversized inserts.

A **non-finite** bound (NaN/Infinity) remains a genuine programming error and
still throws `SnapBoundsError`; `query()` continues to degrade that to `[]`.

### 2. `§FEAT-SLAB-CORNER-REFS` — level-gated slab-corner reference provider

`SlabSnapProvider` (already an `ISnapProvider`) is extended to:

- emit each slab-polygon **vertex** as an `ENDPOINT` candidate (the slab
  corners), each **edge midpoint** as `MIDPOINT`, and each **edge
  nearest-point** as `EDGE` (bonus, off by default — enabled only when the
  caller turns EDGE on);
- accept an optional `getActiveLevelId()` accessor and **level-gate** its
  candidates to the floor being drawn on, read lazily on every
  `getCandidates()` so a level switch takes effect without re-registration.

The provider is **wired by default** in `SnapManager.createWithDefaults()`.
Callers that don't pass a `slabStore` (e.g. `WallTool`, which forwards only
`{ gridStore }`) still get the reference: the factory falls back to the
read-only `window.slabStore` global and reads the active level lazily from
`window.projectContext.activeLevelId` — the same guarded lazy-global pattern
`SnapManager.gatherCandidates()` already uses for the wall-store mutation guard.
Both reads are fully guarded; absent globals just yield an all-slabs (or
no-slab) provider, never a crash.

Because the candidates use the standard `ENDPOINT`/`MIDPOINT`/`EDGE` snap types,
the existing `SnapVisualizer` renders them with the existing snap-indicator
style (green corner / cyan midpoint), and they rank and compose with the L-26
wall-alignment guide and the ortho modes through the normal
`SnapManager.rankCandidates()` pipeline — no parallel system.

## Architecture / principle mapping

- **P2 (single THREE owner):** all THREE access goes through
  `@pryzm/renderer-three/three`; no new `import * as THREE` owner.
- **P3 (single rAF):** no animation added.
- **P4 (`window as any`):** the factory's lazy-global reads mirror the existing
  allowlisted SnapManager pattern; provider core is pure and window-free.
- **P6 (commands are the only mutation path):** snapping is read-only; it never
  mutates stores — slab geometry is consumed via `slabStore.getAll()`, not
  scene traversal.
- **8-layer:** all changes stay in L2 (`spatial-index`) / L3 (`snapping`); no
  upward imports.

## Consequences

- Upper-floor walls snap to the floor-below shell (slab corners/edges) with the
  same visuals and ranking as every other snap — a genuine cross-level
  reference capability, scoped to the active draw level.
- Snapping stays correct and fast far from origin; the insert path can no longer
  throw for oversized/degenerate AABBs.
- Backwards compatible: with no active-level accessor the provider offers all
  slabs (prior plan-dimensioning behaviour).

## Tests

- `spatial-grid.test.ts (a)` — far-from-origin / origin-spanning insert stays
  under the cell cap, does not throw, and the item is still found by a small
  radius query at its far corner; non-finite bounds still throw / `query()`
  degrades to `[]`.
- `slabCornerRefs.test.ts (b)` — a slab with known corners yields those corners
  as `ENDPOINT` candidates for the active level, with the other level's slab
  gated out.
- `slabCornerRefs.test.ts (c)` — a draw point near a slab corner snaps to that
  corner within radius.
- Plus: level-gate scoping to L0, all-slabs fallback with no accessor, and
  EDGE/MIDPOINT emission.
