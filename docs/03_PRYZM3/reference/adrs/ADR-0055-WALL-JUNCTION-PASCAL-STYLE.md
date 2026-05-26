# ADR-0055 — Replace `WallJunctionInfill` with per-wall miter trimming (Pascal-style)

- **Status:** proposed (2026-05-26)
- **Owner:** wall geometry (`@pryzm/geometry-wall`)
- **Affects:** [SPEC-WALL-GEOMETRY], [C01-CORE], `MiterPrismBuilder`, `WallJoinResolver`, `WallJunctionInfill*`, `WallFragmentBuilder`.

## Context — the visible defect

At 3-wall (T) and 4-wall (X) junctions a **dark V-wedge** is visible between adjacent wall caps in 3D. The infill prism rendered by `WallJunctionInfillManager` does not cleanly cover the void between the square wall caps at oblique angles.

```
   wall A ──────┐  ← outer face
                │
                │ ▼ void  (dark wedge in the rendered scene)
                │
   ─────────────┘  ← square cap face of wall A
                
                ← wall B's outer face
```

Adding `polygonOffset` to the infill material (commit `67b4afc`) fixed a separate z-fighting symptom but the geometric void itself remains for irregular angles.

## Why the current design produces this

`WallJunctionInfill.computeJunctionInfills()` produces an **N-vertex polygon** for an N-wall cluster — one vertex per adjacent wall *pair*, each vertex being the **outer-edge intersection** of consecutive walls. That polygon's edges run **outer-corner to outer-corner**, not along the wall caps. For acute angles the prism's base does not cover the cap rectangle that sits between two adjacent outer corners; a thin triangular region remains uncovered → the dark wedge.

The square-cap + infill-prism architecture is a **patch over a deeper modelling choice**: PRYZM caps each wall perpendicular at its centerline endpoint and then tries to fill the gap. The void is a *consequence* of the design, not a bug in the infill code.

## Pascal's approach — eliminate the void by construction

[`pascalorg/editor`](https://github.com/pascalorg/editor) does **not** use square caps or an infill prism for multi-wall junctions. Instead, every wall ends in a **3-/4-/5-vertex miter polygon** whose corners are *shared* with the adjacent walls' polygons — the floor-plan footprints of adjacent walls **share their boundary corners exactly**, so there is no void.

### Algorithm (`packages/core/src/systems/wall/wall-mitering.ts`)

1. **Junction detection** (two passes):
   - Snap-point cluster: walls sharing an endpoint within a tolerance.
   - **T-projection:** walls whose endpoint falls on another wall's *segment interior*.
2. **Per-wall edge construction.** At each junction, compute the wall's `nUnit` and two infinite line equations offset by `±halfT` from the junction point — `edgeA` = left, `edgeB` = right.
3. **The T-junction trick.** A passthrough wall (one whose endpoint is the junction but whose body continues past) is inserted into the sorted-by-angle ring **TWICE — once forward, once reversed**. T-junctions therefore look exactly like 4-way crosses in the ring sweep, and the algorithm is uniform.
4. **Angular sort + ring sweep.** Sort all entries (real + duplicated passthroughs) by `atan2(v.y, v.x)`. For each adjacent pair `(wall_i, wall_{i+1})`, solve the 2×2 linear system `wall_i.edgeA ∩ wall_{i+1}.edgeB` and write that point as **both** `wall_i.left` corner AND `wall_{i+1}.right` corner. Edge coincidence is guaranteed by construction.
5. **Parallel guard.** `|det| < 1e-9` → fall back to default perpendicular offset.

### Footprint (`wall-footprint.ts`)

The wall's 2-D plate is **a 5- or 6-vertex polygon** that hinges on the junction centre as a pivot:

```ts
const polygon = [pStartRight, pEndRight]
if (endJunction)   polygon.push(wallEnd)         // ← PIVOT vertex at the junction centre
polygon.push(pEndLeft, pStartLeft)
if (startJunction) polygon.push(wallStart)        // ← PIVOT vertex (if start is also a junction)
```

That extra pivot at the centre point is what closes the wedge — the polygon literally hinges on the centerline endpoint so the trimmed corners on either side meet cleanly there.

### Mesh (`wall-system.tsx`)

`THREE.Shape` over the footprint → `ExtrudeGeometry(depth: height, bevelEnabled: false)`. **One mesh per wall** — no level-wide CSG union of walls. (CSG is reserved for door/window cutouts on individual walls.)

## Decision

Adopt Pascal's per-wall miter trimming for multi-wall junctions and **retire** the square-cap + infill-prism architecture for those clusters. Concretely:

1. New module `packages/geometry-wall/src/JunctionResolver.ts` — port `findJunctions`, `calculateLevelMiters`, T-projection detection (replaces `WallJoinResolver._handleMultiWallClusters`).
2. New module `packages/geometry-wall/src/WallFootprint2D.ts` — produce the 5/6-vertex polygon per wall (consumed by `MiterPrismBuilder` and the renderer).
3. `MiterPrismBuilder` — switch its 2-D-stage to consume the new polygon; the existing extrusion + cap building stays.
4. **Delete** `WallJunctionInfill.ts` + `WallJunctionInfillManager.ts` (and the `polygonOffset` mitigation in commit `67b4afc`) — they become dead code once the algorithm is replaced.

L-corners (2-wall) are a special case of N=2: `wall_i.left = wall_{i+1}.right` is the simple outer corner; no T-duplication needed.

## Consequences

**Positive**
- Dark V-wedge **eliminated by construction** at every T, Y, X junction regardless of angle.
- One mesh per wall (unchanged); no separate infill mesh to dispose / re-sync.
- Polygon coincidence makes the 2-D plan view cleaner too (no spurious infill outline).
- Single algorithm uniformly handles L / T / Y / X — fewer code paths.

**Risk / migration**
- Touches `MiterPrismBuilder`, `WallJoinResolver`, `WallFragmentBuilder`, the 2-D projector (`EdgeProjectorService`), and door/window opening builders (which read wall geometry to position openings). The opening builders need the wall's local centerline + thickness, which the new model retains — no change expected.
- The level-wide miter resolver runs per frame in Pascal. PRYZM can do the same (it's pure 2-D, fast) but should benchmark.
- Existing projects don't store miter info (already derived) — no migration.

## Reference implementations

- Pascal source: <https://github.com/pascalorg/editor> — `packages/core/src/systems/wall/wall-mitering.ts`, `wall-footprint.ts`, `wall-curve.ts`, `wall-system.tsx`.

## Implementation phases

1. **P1 — port the resolver.** New `JunctionResolver.ts` + tests for L / T / Y / X cases. No editor wiring yet.
2. **P2 — new footprint builder.** `WallFootprint2D.ts` + tests for the 5/6-vertex polygon shape.
3. **P3 — switch `MiterPrismBuilder`.** Replace its corner-computation stage; keep extrusion. Visual diff vs. current scene.
4. **P4 — retire infill.** Delete `WallJunctionInfill*`. Remove polygonOffset patch. Confirm scene has no wedges.
5. **P5 — door / window opening builders.** Confirm they still read wall thickness + centerline correctly (no schema change expected).

## Until the rewrite ships — interim mitigation

Inflate the existing infill prism's vertices outward from the consensus point by a small epsilon (≈ wall thickness × 0.25, capped at 25 mm) so the prism overlaps the wall caps with slack. This is a band-aid — it can leave the prism slightly proud of the wall's outer face at acute angles. It is replaced by P1–P4.
