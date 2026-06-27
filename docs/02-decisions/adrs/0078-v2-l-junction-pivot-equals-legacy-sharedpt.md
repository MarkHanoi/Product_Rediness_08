# ADR-0078 — V2 L-junction pivot = legacy `sharedPt` (close mixed-pipeline perimeter corners)

- **Status:** accepted (2026-06-26)
- **Owner:** wall geometry (`@pryzm/geometry-wall`)
- **Affects:** `JunctionResolverV2`, `WallFootprint2D` (consumer), `WallFragmentBuilder` (V2 + legacy paths), `WallJoinResolver` (legacy reference), §DIAG-PERIM-CORNER-WHOLE.
- **Supersedes nothing; refines** ADR-0055 (Pascal-style wall pipeline) for the drifted-corner / mixed-pipeline case.

## Context — the visible defect

A generated **house** and **residential building** render an **un-mitred seam** (open corner / overlap, not a clean 45° mitre) at the **perimeter external corners**, even where the `§DIAG-PERIM-CORNER-WHOLE` probe reports `bothMitred=true` and the legacy-vs-legacy gap reads ≈ 0 mm.

## Root cause — two miter pipelines pivot a drifted corner differently

PRYZM runs **two** miter systems that must agree at a shared corner:

- **Legacy** `WallJoinResolver` → `buildMiterPrism`. A perimeter wall **with a window** renders through this path (the opening-segment branch). It trims both walls of an L to `sharedPt` = the **centreline × centreline intersection**.
- **V2** `JunctionResolverV2` → `WallFootprint2D` → `WallPolygonExtruder` (ADR-0055, default-ON). A **plain** neighbour (no opening) renders through this path. The ring sweep mitred each wall's offset edges around the endpoint-cluster **centroid** (`j.point`).

On a **perfect** corner, `centroid ≡ intersection`, so both pipelines place the shared corner at the same point (gap 0). On a **generated / welded** shell the two corner endpoints drift tens–hundreds of mm apart (post-weld / principal-axis drift — see §RESI-L0-CORNER-CLOSE), so `centroid ≠ intersection`. A window-bearing wall (legacy) and its plain neighbour (V2) then place their shared outer corner at **two different points** → the corner opens. A measured 116 mm endpoint drift produces a ~59 mm corner gap. `bothMitred` stays true because each wall individually has a valid miter; the legacy gap probe stays ≈ 0 because it only compares legacy trimmed baselines against each other — it never compares the **two pipelines**.

## Decision

For a **pure 2-real-endpoint L junction** (no passthrough), refine the V2 ring-sweep pivot from the cluster **centroid** to the **centreline × centreline intersection** — the exact `sharedPt` the legacy resolver already uses. Implemented in `JunctionResolverV2.refineLJunctionPivot` and applied in `applyRingSweep` to both the edge anchors and the footprint pivot vertex.

Guards (so the change is conservative):
- **L-only:** any passthrough, or ≠ 2 real endpoints (T / X / Y) → keep the centroid.
- **Near-parallel skip:** `|sin θ| < 0.05` → no well-defined L crossing → keep the centroid.
- **Band clamp:** accept the crossing only when it lies within the near-junction band (0.20 m) of the centroid, so a shallow corner can never teleport the pivot far down the wall.
- **Escape hatch:** `globalThis.__pryzmWallV2LPivotRefine = false` restores the pre-fix centroid pivot.

## Why this is safe (no doubling, no baseline relocation)

`resolveJunctions` returns per-end corner **points** only; it **never** relocates a wall's centreline baseline. This refinement only changes the **reference point the corners are computed from** — it is the §CLAMP-COSHARE-WELD / ADR-0072 P3c-b invariant (do NOT move shared centreline endpoints) restated. The unit tests pin that each wall's footprint centreline still equals its input baseline at every drift offset.

## Consequences

- A window-bearing perimeter wall (legacy) and its plain neighbour (V2) now place a drifted external corner **identically** (verified 0.00 mm). The seam closes.
- All existing V2 invariants hold: V2-vs-V2 corner coincidence (welded 0–200 mm), the two-distinct-junctions regression (0.6 m stays 0.6 m), T / X pivots, perfect-L pivot, and the §WALL-BODY-INNER-FACE partition-tongue suppression are unchanged.
- Pure / deterministic; no new exported function (P8 span N/A). THREE is untouched (P2). No `(window as any)` (P4) — reads `globalThis` exactly as the sibling V2 flags do.

## Verification

- Unit: `packages/ai-host/__tests__/junctionResolverV2.test.ts` — new `§RESI-PERIM-CORNER-PIVOT` suite (pivot == legacy sharedPt across the drift band; V2 coincidence retained; perfect-L byte-identical; no baseline relocation; T/X unaffected; escape hatch).
- In-browser (pending): generate a **house** AND a **residential building**, inspect external perimeter corners (especially window-bearing walls meeting plain walls) in 3D and plan.
