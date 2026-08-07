# ADR-0303 — Layered walls join through the V2 footprint, not a second miter solver

| Field | Value |
|---|---|
| **Status** | Accepted — 2026-08-07 |
| **Tag** | `§FIX-LAYERED-WALL-V2-PARITY` |
| **Owner** | Walls / geometry-wall |
| **Closes** | Founder, 2026-08-07: a LAYERED interior partition drawn onto an existing L junction produced a CLASH (doubled solid at the corner) |
| **Constraints** | ADR-0055 (Pascal wall pipeline: JunctionResolverV2 → WallFootprint2D → WallPolygonExtruder), C11 |
| **Implemented by** | `5074471d` (pure module + failing-case test) · `c87dc793` (wired into the layered branch) |

> ⚠ **Numbering correction.** Both implementing commit messages cite this decision as
> "ADR-0298". That number was already taken — ADR-0298 is *Isolation probes are DECLARED,
> not discovered* — so the commits' citation is a dangling reference. The canonical number
> for the layered-wall decision is **ADR-0303** (this document). Any future doc citing
> "ADR-0298" for wall work should be corrected to ADR-0303.

---

## Context

The founder drew a layered interior partition starting on an existing L junction and got a
clash. Root cause is a **pipeline parity gap** — measured, not a bad epsilon:

- A **plain** wall body routes through the ADR-0055 V2 chain (`JunctionResolverV2` →
  `WallFootprint2D` → `WallPolygonExtruder`). V2 solves the junction as ONE ring sweep, so
  adjacent footprints are edge-coincident **by construction**.
- A straight **layered** wall never reached that code: the layered branch of `buildWall()`
  returned early and built one legacy `MiterPrismBuilder.buildMiterPrism` per layer from
  legacy `WallJoinResolver` miter normals — a per-wall plane projection with **no cross-wall
  non-overlap guarantee**.

Measured on the founder's scene (two 0.30 m arms mitred at the origin + a diagonal guest
starting on the corner; 2 mm grid sampler):

| guest ∩ arm | LEGACY (layered path) | V2 (plain path) |
|---|---|---|
| 0.10 m guest | 2 520 mm² | 0 mm² |
| 0.375 m guest | 35 112 mm² | 0 mm² |

V2 already answered this correctly. The layered path never asked it.

## Decision

1. **A layered wall's bands are cut FROM the V2 footprint; there is no second miter
   solver.** `WallLayerFootprint2D.buildWallLayerBands` slices the wall's V2 footprint into
   per-layer bands with two half-plane clips parallel to the wall axis. Every band is a
   **subset** of the footprint, so junction non-overlap is **inherited rather than
   re-derived** — there is no second solver left to disagree with the first.
2. **Band lateral extents reproduce the legacy `cursor = -total/2` walk exactly.** No layer
   moves sideways; only the mitred ENDS change.
3. **ALL-OR-NOTHING fallback.** If any band fails the spike-guard envelope
   (§V2-SPIKE-GUARD / §LEGACY-SPIKE-GUARD), the whole stack falls back to the legacy
   prisms. A half-migrated layer stack would mix two frames and is worse than a
   uniformly-legacy one.
4. **A junction is measured in BOTH failure directions.** The sampler harness measures GAP
   as well as overlap: within a disc of radius r ≤ min(halfThickness) about the junction
   vertex, a correct N-way junction is covered COMPLETELY, so any uncovered cell there is a
   real notch. (The founder's sliver was doubled solid, not a gap; the gap predicate reads
   ~0 in every configuration including the broken ones.)
5. **Order-independence is asserted.** V2 produces byte-identical polygons across all three
   creation orders — the cluster is re-solved, not applied incrementally.

## Explicitly NOT fixed — recorded as MEASURED-OPEN

**§NEAR-JUNCTION-DEAD-ZONE**: a wall whose endpoint lands NEAR (not on) a junction vertex
is a separate defect V2 does not fix. `§FIX-WALL-3RD-AT-LCORNER-IMMUTABLE` freezes the
committed L and extracts the newcomer as a T against ONE host (the most-perpendicular arm),
but near a corner the newcomer is inside BOTH arms — measured per-arm at (0.02, 0): clean
against the chosen arm, **7 548 mm² against the other**. The correct construction is to
admit the newcomer into the frozen corner's own junction and sweep all three arms about the
FROZEN vertex — a committed-mitre behaviour change, i.e. a decision, not a patch. Tracked
in the V1 audit (§NEAR-CORNER-L concealed overlap row).

Two measurement discrepancies are recorded in the test file rather than smoothed over: the
same inputs measure different magnitudes standalone vs after earlier tests in the same
file; ruled out as an id-keyed cache; assertions pin the mechanism, not the magnitude,
until the coupling is identified.

## Consequences

- One junction authority for plain AND layered walls; a future wall variant must take its
  footprint from V2 or justify in an ADR why it cannot.
- This is also a `§FIX-ONCE-IMPORT-EVERYWHERE` (ADR-0306) instance: the layered path
  re-derived what V2 already solved, and the defect lived exactly in the re-derivation.
