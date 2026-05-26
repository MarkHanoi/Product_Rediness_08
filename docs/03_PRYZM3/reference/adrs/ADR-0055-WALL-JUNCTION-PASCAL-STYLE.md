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

1. **P1 — port the resolver.** New [`JunctionResolverV2.ts`](../../../../packages/geometry-wall/src/JunctionResolverV2.ts) + 16 tests for L / T / Y / X / closed-loop cases. No editor wiring yet. **✅ SHIPPED 2026-05-26 — commit `5840358`.**
2. **P2 — new footprint builder.** [`WallFootprint2D.ts`](../../../../packages/geometry-wall/src/WallFootprint2D.ts) + 16 tests for the 4 / 5 / 6-vertex polygon shape and the **edge-coincidence invariant** (adjacent walls share 2–3 vertices on the junction line — the void is gone by construction). **✅ SHIPPED 2026-05-26.**
3. **P3a — polygon extruder.** [`WallPolygonExtruder.ts`](../../../../packages/geometry-wall/src/WallPolygonExtruder.ts) + 13 tests, including the **T-junction 3-D edge-coincidence proof**: wall B's start corners sit exactly on wall A's outer-face plane within A's X-range — no overlap, no gap. Top fan + bottom fan + side quads per polygon edge; per-face outward normals (hard edges for plan-view edge projection). **✅ SHIPPED 2026-05-26.**
4. **P3b — wiring (initial cut).** [`WallPipelineV2.ts`](../../../../packages/geometry-wall/src/WallPipelineV2.ts) shim (cache + feature flag + one-shot, 13 tests) **AND** the wired branch inside [`WallFragmentBuilder.createWallBodyFragment`](../../../../packages/geometry-wall/src/WallFragmentBuilder.ts) (non-layered, no-openings — the simplest call site). Old `MiterPrismBuilder` path remains the default; the V2 path is gated by `window.__pryzmWallPipelineV2 === true` AND a populated cache. **✅ SHIPPED 2026-05-27.** Layered + opening sites are follow-up commits once this is live-verified.

   **DevTools opt-in for verification:**

   ```js
   // Enable the new pipeline.
   window.__pryzmWallPipelineV2 = true;

   // Build a level-wide cache from the live wall store.
   const { WallPipelineV2Cache } = await import('@pryzm/geometry-wall');
   const cache = new WallPipelineV2Cache();
   const all = window.WallStore?.getAll?.() ?? [];
   const levelId = window.projectContext?.activeLevelId ?? 'L0';
   cache.refresh(all.filter(w => w.levelId === levelId).map(w => ({
       id: w.id,
       startXZ: { x: w.baseLine[0].x, z: w.baseLine[0].z },
       endXZ:   { x: w.baseLine[1].x, z: w.baseLine[1].z },
       thickness: w.thickness,
   })));
   window.__pryzmWallV2Cache = cache;

   // Force a rebuild — drag any wall by 1 mm and back, or call:
   window.WallRebuildCoordinator?.scheduleRebuild?.(levelId);
   ```

   Verify the rebuilt walls have `mesh.userData.pipelineV2 === true` (the diagnostic flag). L-corners + T-junctions should render WITHOUT the black wedge.

5. **P4 — retire infill.** Once P3b is live-verified for non-layered walls AND the orchestrator (`WallRebuildCoordinator`) is wired to call `refreshV2Cache(levelWalls)` automatically: extend the V2 branch to the layered + opening call sites; delete `WallJunctionInfill*`; remove the `polygonOffset` patch in `WallJunctionInfillManager`. Confirm the scene has no wedges live.
6. **P5 — door / window opening builders.** Confirm they still read wall thickness + centerline correctly (no schema change expected).

### Vertex-count contract (P3a)

| Junction context | Polygon vertices | Extruder vertex count |
|------------------|:--:|:--:|
| No junction (free wall) | 4 | 36 |
| One end at junction (L / T-abutting) | 5 | 48 |
| Both ends at junctions (closed loop) | 6 | 60 |

Formula: `verts = 6·(n − 2)  +  6·n` (top fan + bottom fan + n side quads). Pinned in [`expectedVertexCount(n)`](../../../../packages/geometry-wall/src/WallPolygonExtruder.ts) and asserted in [`wallPolygonExtruder.test.ts`](../../../../packages/ai-host/__tests__/wallPolygonExtruder.test.ts).

## Until the rewrite ships — interim mitigation

`polygonOffset` on the `WallJunctionInfillManager` material — pushes the infill prism toward the camera so it wins the depth test against the wall caps at T/L/X junctions ([`WallJunctionInfillManager.ts`](../../../../packages/geometry-wall/src/WallJunctionInfillManager.ts)). This is a **band-aid that only helps the 3-D z-fight on 3+ wall clusters**; it does NOT close the L-corner triangle visible in plan view (L-junctions don't go through `WallJunctionInfill` at all — only the 3+ wall clusters do), and the 2-D edge projector still inherits the gap. The user's screenshot from 2026-05-26 confirms the band-aid is insufficient. The fix is P3b + P4.
