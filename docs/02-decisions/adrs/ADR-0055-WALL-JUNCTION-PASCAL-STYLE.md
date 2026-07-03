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
4. **P3b — wiring + auto-wired orchestrator.** [`WallPipelineV2.ts`](../../../../packages/geometry-wall/src/WallPipelineV2.ts) shim (cache + feature flag + one-shot, 13 tests) wired into [`WallFragmentBuilder.createWallBodyFragment`](../../../../packages/geometry-wall/src/WallFragmentBuilder.ts) (non-layered, no-openings — the simplest call site). The orchestrator [`WallRebuildCoordinator._flush`](../../../../apps/editor/src/engine/WallRebuildCoordinator.ts) now calls `builder.refreshV2Cache(specs)` **once per affected level rebuild**, immediately after `WallJoinResolver.resolveLevel`. **Default ON since 2026-05-27** — `window.__pryzmWallPipelineV2 = false` is the emergency opt-out. **✅ SHIPPED.**

   **Architectural alignment:**
   - **C01 layer matrix** — `geometry-wall` (L1) does NOT reach into any store. The orchestrator (apps/editor, drives L3 stores → L1 builder) reads `levelWalls` once + passes the slice as a value via `refreshV2Cache(LevelWallSpec[])`. Pure data hand-off; no downward layer leak.
   - **C04 rendering** — V2 produces a single `BufferGeometry` per wall (top fan + bottom fan + n side quads). No new rAF, no extra render passes, no shadow-map changes.
   - **C11 element creation** — wall command flow unchanged. The V2 swap is **geometry-generation only**; CommandManager, WallStore, BimManager, projection cache all see identical artefacts (same wall id, same baseline, same userData identity-triple), just a different `BufferGeometry` shape that closes the void.
   - **C10 performance** — resolver is O(n + k log k), called once per affected level rebuild (not per wall). No per-wall cost beyond the legacy path.
   - The diagnostic `userData.pipelineV2 === true` lets DevTools / future tests filter V2-built meshes.

5. **P4 — retire infill.** Extend V2 to the layered + opening call sites; delete `WallJunctionInfill*`; remove the `polygonOffset` patch in `WallJunctionInfillManager`. ⏳ **Backlogged** — see scope analysis below.

6. **P5 — door / window opening builders.** Confirm they still read wall thickness + centerline correctly (no schema change expected).

### P4 scope analysis (2026-05-27)

P4 is materially larger than P1–P3 combined and a session-bounded incremental ship is unsafe. Architectural reasons:

- **Layered walls.** `WallMiter` stores absolute world-XZ corner positions computed against the wall's half-thickness. A layered wall's per-layer geometry can't reuse a single wall-level miter because each layer has a *different* lateral offset and thickness — the corner positions are thickness-specific. A correct P4 for layered walls requires either (a) per-layer junction resolution (run `resolveJunctions` once per layer offset), or (b) deriving per-layer corners by inset from a single wall-level envelope. Both need a fresh ADR clarification + test bed; neither is a drop-in.
- **Walls with openings.** The current builder splits the wall into BoxGeometry segments around opening clusters. To preserve the Pascal property at junctions, the END segments (those abutting a junction) would need a 5/6-vertex polygon footprint that *also* respects the opening's left/right edges — i.e. a polygon-vs-rectangle carve. This is a CSG step (or a hand-rolled vertical carve in the extruder).

**Decision (2026-05-27):** P4 is split into:
   - **P4a (layered, no openings)** — per-layer V2 polygon via offset envelope. Needs ADR addendum + 5–8 new tests.
   - **P4b (walls with openings)** — per-segment V2 carve at junction-touching segments only. Needs ADR addendum + new CSG/carve helper.
   - **P4c (retire infill)** — delete `WallJunctionInfill*` + `polygonOffset` patch, gated on P4a + P4b verification.

   The current ship state (P1+P2+P3a+P3b, default-ON) already closes the wedge for the **dominant** production case (plain partition walls — the apartment generator's `constraints.wallTypeId: 'partition'`), so user-reported defect screenshots from 2026-05-26 are resolved. Layered + opening junctions retain `WallJunctionInfill` as the interim mitigation until P4a/P4b ship.

## How to opt out

```js
// Emergency rollback to the legacy `MiterPrismBuilder` path:
window.__pryzmWallPipelineV2 = false;
// Trigger a rebuild — drag any wall by 1 mm or reload the project.
```

### Vertex-count contract (P3a)

| Junction context | Polygon vertices | Extruder vertex count |
|------------------|:--:|:--:|
| No junction (free wall) | 4 | 36 |
| One end at junction (L / T-abutting) | 5 | 48 |
| Both ends at junctions (closed loop) | 6 | 60 |

Formula: `verts = 6·(n − 2)  +  6·n` (top fan + bottom fan + n side quads). Pinned in [`expectedVertexCount(n)`](../../../../packages/geometry-wall/src/WallPolygonExtruder.ts) and asserted in [`wallPolygonExtruder.test.ts`](../../../../packages/ai-host/__tests__/wallPolygonExtruder.test.ts).

## Until the rewrite ships — interim mitigation

`polygonOffset` on the `WallJunctionInfillManager` material — pushes the infill prism toward the camera so it wins the depth test against the wall caps at T/L/X junctions ([`WallJunctionInfillManager.ts`](../../../../packages/geometry-wall/src/WallJunctionInfillManager.ts)). This is a **band-aid that only helps the 3-D z-fight on 3+ wall clusters**; it does NOT close the L-corner triangle visible in plan view (L-junctions don't go through `WallJunctionInfill` at all — only the 3+ wall clusters do), and the 2-D edge projector still inherits the gap. The user's screenshot from 2026-05-26 confirms the band-aid is insufficient. The fix is P3b + P4.

## Refinement — §FIX-WALL-TJUNCTION-BUTT (L-vs-T classification, 2026-07-02)

**Status:** SHIPPED. Refines the **junction-detection** step (§Algorithm step 1) — it does not change the ring sweep, footprint, or extruder; a superseding ADR is unnecessary because it only tightens the L-vs-T *classification* the original algorithm already assumed.

**Defect (founder, prod/WebGPU).** An existing HOST wall is in place; a GUEST wall is drawn to connect INTO it (a T). The guest's connecting end rendered as a weird **"arrow"/spike** — a mitred point — instead of butting flat against the host's face, and the host cap was perturbed too. Expected: host stays exactly as-is; guest butts cleanly — a perfect T, no spike.

**Root cause.** §RESI-L0-CORNER-CLOSE widened the endpoint-cluster band to 0.20 m so a *welded/drifted L-corner* closes. But that same band **fuses the guest's terminating end with the host's nearby endpoint** when the guest lands on the host body *near* the host's end. `detectJunctions` then sees **two real endpoints and no passthrough → an L-corner**, and the ring sweep applies the closed-form **mutual bisector miter** — which extends the guest end to the intersection of the two offset edge-lines (one corner pushed **past the host's end / through the host's outer face**): the "arrow". A bisector miter is only valid when **exactly two walls co-TERMINATE** at the corner; a genuine T (the host **continues past** the contact) violates that premise.

**The L-vs-T invariant (now enforced at detection).** A clustered endpoint of wall **H** is a **passthrough (T-host)** — not an L-arm — precisely when another cluster-member **G**'s own endpoint projects **strictly interior** onto H's segment (0 < t < 1, not clamped to an end), within the T-projection band, **and** the contact foot is displaced from H's own clustered endpoint by **at least H's half-thickness** (H's body genuinely continues past → the guest butts H's **side** face, not its **end**), **and** G is not a near-collinear continuation of H (> ~20°). Then H is moved from `realEndpoints` to `passthroughWalls`, the junction pivot is re-pointed onto H's body at G's foot, and the ring sweep produces the same clean flat butt the mid-span T already produces. **The host is left untouched.**

A genuine L-corner is byte-unchanged: at a welded/perfect corner each wall's endpoint is at its **own** terminus, so the neighbour's foot **clamps** to the wall end (interior = false) or the host continues **less than** half-a-thickness past (a corner, not a side-face butt) → no reclassification → the existing bisector miter (and §RESI-PERIM-CORNER-PIVOT refinement) hold.

- **Locus:** [`JunctionResolverV2.detectJunctions`](../../../../packages/geometry-wall/src/JunctionResolverV2.ts) (§FIX-WALL-TJUNCTION-BUTT). Detection-frame only — **never relocates a centreline baseline** (the §CLAMP-COSHARE-WELD / ADR-0072 P3c-b doubling regression mode is not reachable).
- **Escape hatch:** `window.__pryzmWallV2TJunctionButt = false` restores the pre-fix L classification.
- **Tests:** [`junctionResolverV2.tJunctionButt.test.ts`](../../../../packages/ai-host/__tests__/junctionResolverV2.tJunctionButt.test.ts) — passthrough classification, spike-guard (no footprint vertex pierces the host outer face or spikes past the host end), host-untouched, oblique-guest butt, mid-span-T unchanged, near-corner stays L, welded/perfect-L regression, escape hatch. All existing L / T / Y / X / §RESI-L0 / §RESI-PERIM-CORNER-PIVOT / §WALL-BODY-INNER-FACE V2 tests remain green.
- **Alignment:** C15 (wall/hosted-element) — the guest butts the host face and the host footprint is unchanged, so hosted-element (door/window) anchoring on both walls is unperturbed. C04/C10 — no new geometry pass, no rAF; the reclassification is O(k²) over a single junction's members (k tiny). P2 respected — pure 2-D math, no THREE in `JunctionResolverV2`.

## Refinement — §FIX-WALL-TJUNCTION-BUTT-2 (ring-sweep pivot, not classification — 2026-07-02, re-open of L-27)

**Status:** SHIPPED. Refines the **ring-sweep pivot / footprint-assembly** step (not detection). Still within ADR-0055 — it corrects the footprint to match this ADR's own stated intent ("no dark wedge … butt cleanly"); the junction contract's public shape (`WallMiter`, `WallFootprint`) is unchanged, so no superseding ADR.

**Defect (founder, re-open).** After §FIX-WALL-TJUNCTION-BUTT shipped (with a green spike-guard test), a **real thin interior-partition-into-wall T still showed the arrow** — a black wedge in 3D, a chevron tip in plan. The prior fix was necessary but **not sufficient**: it fixed *classification*, not the *ring-sweep spike*.

**Root cause — the ring-sweep PIVOT, not the classification.** For a correctly-classified T (host = passthrough; the guest's two side-corners `endLeft`/`endRight` correctly land on the host **near face** at z=+halfT), `applyRingSweep` ALSO writes a **centreline PIVOT** vertex at `j.point` (the host centreline) for the T-attacher, and `WallFootprint2D` inserts that pivot **between** the two near-face corners. The extruder then builds a solid **triangular tongue** from the near face (z=+halfT) **down to the host centreline (z=0)** — a wedge poking `hostHalfThickness` into the host: the founder's 3D wedge / plan chevron "arrow". §54's earlier `§WALL-BODY-INNER-FACE` clause had spotted this exact tongue but **suppressed the pivot only when the host was ≥1.5× thicker** (a partition→shell). An **equal-thickness** (or <1.5×) partition-into-wall T therefore still wrote the pivot and still spiked. The ADR's general "5/6-vertex polygon hinges on the junction-centre pivot" (§ above) is the correct pattern for **co-terminating L/X/Y corners** — but **a T-attacher must not carry that pivot** (a T is not an X: the guest butts the host's *side*, it does not interpenetrate at a shared centre).

**The invariant (now enforced at the ring sweep).** A real endpoint that abuts **any** passthrough at a junction is a **T-attacher** and gets **no centreline pivot** — its footprint ends flat on the two near-face corners — **regardless of thickness ratio**. Junctions with **no passthrough** (L / X / Y) keep the shared centre pivot exactly as before (byte-unchanged). Additionally, the ring-sweep **pivot for every clean 1-real-end T is re-pointed onto the host-centreline foot** (the perpendicular projection of the guest end onto the host segment), so the host's barrier edge-lines sit on the host's *true* faces and a guest ending on the host **inner face** (z=+halfT, not the centreline) butts **flush** — closing a latent half-thickness gap the old centroid pivot left. Both were previously done only for the *reclassified* near-end T; now the naturally-detected mid-span T shares the same rule.

- **Locus:** [`JunctionResolverV2.applyRingSweep`](../../../../packages/geometry-wall/src/JunctionResolverV2.ts) (`suppressInnerFacePivot` now = "junction has ≥1 passthrough", thickness-independent) + [`detectJunctions`](../../../../packages/geometry-wall/src/JunctionResolverV2.ts) (foot re-point for every 1-real-end T). Detection/ring-sweep frame only — **never relocates a centreline baseline**.
- **Plan chevron:** just the projection of the (now-corrected) 3D footprint. [`EdgeProjectorService`](../../../../apps/editor/src/engine/views/EdgeProjectorService.ts) has **no** T-junction logic — it projects the wall mesh and clips along-wall lines at openings — so the plan chevron resolves automatically; no edit there.
- **Layered / opening-bearing partitions** render via the LEGACY path (`WallFragmentBuilder` layered/openings branches → `buildMiterPrism`), whose `WallJoinResolver._clampEndToShellInnerFace` already butt-clamps a body-T endpoint onto the host inner face and square-caps it — **no centreline pivot, no arrow**. The arrow is therefore **V2-footprint-specific**; the fix lives in V2. (Follow-up, not fixed here: a guest landing within a host-half-thickness of the host END on the legacy path is still treated as an L-bisector — matches V2's pre-fix behaviour; not reported by the founder for layered walls; touching the legacy L path risks the reverted §CLAMP-COSHARE-WELD doubling.)
- **Escape hatch:** `window.__pryzmWallPartitionInnerFaceV2 = false` restores the pre-fix pivot (thicker-shell case); `__pryzmWallV2TJunctionButt = false` restores the pre-fix detection.
- **Tests:** new FOOTPRINT-level regression in [`junctionResolverV2.tJunctionButt.test.ts`](../../../../packages/ai-host/__tests__/junctionResolverV2.tJunctionButt.test.ts) — mid-span + near-end thin-partition T: the guest end-cap is a flat 4-vertex butt, **no vertex reaches the host centreline** (z < +halfT), no vertex spikes past the host end, host baseline verbatim; plus a guest ending on the host inner face butts flush (no half-thickness gap). Updated the T-junction footprint expectations in `wallFootprint2D.test.ts`, `wallPipelineV2.test.ts`, and `junctionResolverV2.test.ts` (T-attacher = 4-vertex flat butt, no pivot). All 94 V2 junction/footprint tests + the 114-test geometry-wall suite (incl. the legacy WallJoinResolver join tests) green.
- **Alignment:** C15 / C11 (element-creation + hosted elements) — guest butts flat, host unchanged. C04/P2/P3 respected — pure 2-D math, no new geometry pass, no THREE in `JunctionResolverV2`.

### Cluster sub-case — §FIX-WALL-CLUSTER-DEGENERATE (L-corner + third/stub wall — 2026-07-02, L-27 cluster)

**Status:** SHIPPED. Additive to §FIX-WALL-TJUNCTION-BUTT-2 (same ADR, same re-open of L-27). Adds one optional field to `WallMiter` / `WallFootprint` (`invalid?`) — no change to the corner geometry contract — so still within ADR-0055, not a superseding ADR.

**Defect (founder, real repro).** Two walls already meet at a shared vertex forming an **L-corner** (both TERMINATE there); a **THIRD** wall also terminates at that **same** vertex → a **black triangular spike** at the node. This is **not** a guest-into-host-BODY T (the node has **no passthrough** — all ends co-terminate), so §FIX-WALL-TJUNCTION-BUTT-2's passthrough-pivot suppression does not apply.

**Root cause — a DEGENERATE cluster member, not the genuine N-way sweep (verified by reproduction).** A genuine 3-wall co-terminating node of *full-length* walls tiles **cleanly**: the ring sweep produces edge-coincident corners with positive signed area and a single shared pivot — no void, no overlap (reproduced with C = (5,0)→(1,4): all three footprints CCW-positive, sharing (5,0)). The spike appears only when a wall is **shorter than the cluster band (0.20 m)**, so **BOTH its endpoints snap into the SAME junction cluster** — it appears in `realEndpoints` **twice**. The ring sweep then hinges *both* of that wall's ends on the *one* pivot → a **bow-tie / negative-area (inverted-normal)** footprint (reproduced: a 6-vertex polygon revisiting the pivot, signed area **−0.03** → renders black regardless of camera). Before the member is stripped, its presence in the angular sort also **distorts the L-corner walls' corners** (A's near corner shifted, its area dropped 1.000 → 0.969). The existing `§V2-SPIKE-GUARD` bbox check catches a *gross* metre-scale overshoot but **not** this small-bbox self-intersecting case (inverted normals inside a normal bbox). Note this stub (0.158 m end-to-end) is **longer** than the legacy `DEGENERATE_STUB_LENGTH` (0.15 m) — a length gate would miss it — and the legacy resolver's **tighter 0.12 m** cluster band never doubles it, so `joinData` stays clean and the legacy `§WJR-INVALID` skip never fires; the **default-ON V2 pipeline is exactly the path that renders it**.

**The invariant.** A wall whose **both endpoints are real members of one junction cluster** is degenerate at that node (it cannot span the node without self-overlap). Such a wall is (a) **stripped from every junction** — so the OTHER walls' ring sweep is the clean genuine-L / genuine-N-way sweep, untouched (A & B recover exact positive-area footprints sharing (5,0)) — and (b) flagged **`invalid`** on its `WallMiter`. `WallFootprint2D` then returns an **empty** footprint (`polygon: []`, `invalid: true`), and `WallFragmentBuilder.buildWall` **skips the wall at the shared `§WJR-INVALID` checkpoint** (hides the wall group, returns no fragment) — the exact treatment the legacy resolver's degenerate walls already receive, so the stub reaches neither the renderer, picking, nor CSG. This is the precise degeneracy signature — a genuine wall contributes exactly ONE endpoint to any node — so full-length N-way L/T/Y/X clusters never double a member and are never flagged (no false positive). Handles the general N-endpoint cluster (any wall doubled in any cluster is dropped), not just N=3.

- **Locus:** [`JunctionResolverV2.resolveJunctions`](../../../../packages/geometry-wall/src/JunctionResolverV2.ts) (`collectDegenerateClusterWalls` → strip refs from every junction + flag `invalid`), [`WallFootprint2D.buildWallFootprint`](../../../../packages/geometry-wall/src/WallFootprint2D.ts) (empty footprint + `invalid` propagation), [`WallFragmentBuilder.buildWall`](../../../../packages/geometry-wall/src/WallFragmentBuilder.ts) (V2-invalid skip alongside the legacy `§WJR-INVALID` check — reuses the shared `__wjrNaNHidden` / `__wjrInvalidLogged` latches, so a later valid rebuild restores visibility). `WallMiter.invalid` / `WallFootprint.invalid` added as **additive** optional fields (no existing consumer breaks). Pure detection — **never relocates a centreline baseline**.
- **Escape hatch:** `window.__pryzmWallPipelineV2 = false` reverts the whole wall to the legacy pipeline (which drops the stub via its own `§WJR-INVALID` when its band catches it).
- **Tests:** [`junctionResolverV2.tJunctionButt.test.ts`](../../../../packages/ai-host/__tests__/junctionResolverV2.tJunctionButt.test.ts) — L-corner + stub: stub flagged `invalid` + empty footprint; A & B render clean positive-area L sharing (5,0) with no spiking vertex; a **genuine 3-wall full-length** junction is unaffected (no false positive, all positive-area, shared corner); a near-collinear stub is also flagged; a plain 2-wall L-corner is byte-unchanged (5-vertex, never flagged). All 5 new cases + the 12 prior §FIX-WALL-TJUNCTION-BUTT(-2) cases green; the 114-test geometry-wall suite and the 67 V2 junction/footprint/pipeline tests remain green **without edits** (additive field only).
- **Alignment:** C15 / C11 — a degenerate stub carries no hosted elements; skipping it cannot orphan a door/window. C04/P2/P3 respected — pure 2-D math, no new geometry pass, no THREE in `JunctionResolverV2`; matches the platform-wide `invalid`-then-skip degenerate-wall pattern (`WallJoinResolver` `§WJR-INVALID` / `DEGENERATE_STUB_LENGTH`).

### Cluster sub-case — §FIX-WALL-LCORNER-T-CLEAN (L-corner + a 3rd wall teeing on an arm near the corner — 2026-07-03, L-61)

**Status:** SHIPPED. Additive to §FIX-WALL-TJUNCTION-BUTT — a **detection-frame** cluster split; no change to the corner geometry contract, the sweep, the footprint, or any `WallMiter` field. Still within ADR-0055, not a superseding ADR. Gated via the existing `__pryzmWallV2TJunctionButt` escape hatch.

**Defect (founder, real repro, two images).** Two walls are joined in an **L-corner** (A + B share the corner vertex, both TERMINATE there). A **THIRD** wall C then joins to form a **T** — C butts onto **arm A's BODY** a little *before* the corner. Result: (img 1) a triangular **spike/tongue** at the junction; (img 2) **doubled/overlapping parallel lines** on the horizontal wall inside the junction. Distinct from §FIX-WALL-CLUSTER-DEGENERATE (there the 3rd wall co-terminates at the *same vertex*; here it tees on an arm's *side*) and from the plain L-27 near-end T (there is **no** surviving L-corner in that cluster).

**Root cause — the spike and the doubled edge are ONE bug: a T-attacher fused into an L-corner cluster dissolves the L (verified by reproduction).** C's terminating endpoint lands INSIDE the 0.20 m §RESI-L0 cluster band of the corner node, so `clusterEndpoints` **fuses C into the A+B corner cluster** → three real endpoints {A.end, B.start, C.start}. §FIX-WALL-TJUNCTION-BUTT then correctly sees C teeing interior on A's body and reclassifies **A → passthrough** — but A is ALSO the L-arm co-terminating with B, and a passthrough is **not** mitred, so the A–B corner is **dissolved**: A square-caps straight THROUGH the corner (its end face pokes past the corner = the **spike**) and A's outer face then **OVERLAPS B's body** in the junction (two coincident parallel lines on the horizontal wall = the **doubled edge**). Reproduced in a footprint harness (`resolveJunctions`→`buildWallFootprint`) with A (0,0)→(5,0), B (5,0)→(5,5), C tee at x=4.85 (0.15 m before the (5,0) corner): A collapses to a 4-gon square cap at x=5 (L-mitre gone, area jumps to a full rectangle), and C emits a degenerate 5-gon revisiting its start vertex. A sweep over the tee position confirmed every tee within the band is corrupted; every tee outside the band is already a clean independent T.

**The invariant.** In a junction cluster with ≥3 real endpoints, a member C is a **tee-attacher** (a T on another member's side, *not* a co-terminating corner arm) precisely when C's endpoint projects **strictly interior** onto another member H's body, **on-face** (within the T-projection band), **continuing past** H's own end by ≥ H's half-thickness, and **not collinear** — the *exact* §FIX-WALL-TJUNCTION-BUTT predicate. If removing every tee-attacher from the cluster STILL leaves **≥2 real endpoints**, a genuine corner (L/Y/X) survives among the co-terminating members. Then each tee-attacher is **extracted into its OWN T-junction** on its host body (real end = C, passthrough = H, pivot = C's perpendicular foot on H) and **removed from the corner cluster**. The corner cluster resolves as the clean L/Y/X it is — H is **never** reclassified there, so the A–B mitre is **byte-identical to the L with no third wall present** (verified) — and C butts flat on A's near face (a clean 4-gon, no centreline pivot, no tongue). When removing the tee-attachers leaves **<2** real ends (the simple near-end T of L-27 — a host + a guest, no corner), the split is a **no-op** and the existing in-place §FIX-WALL-TJUNCTION-BUTT reclassification handles it byte-unchanged. A genuine 3-way **Y** (C co-terminating at the corner vertex, foot clamps to A's end, continuesPast = 0 < half-thickness) is not a tee-attacher → untouched (the co-terminating fan tiles cleanly, per §FIX-WALL-CLUSTER-DEGENERATE's verification).

- **Locus:** [`JunctionResolverV2.detectJunctions`](../../../../packages/geometry-wall/src/JunctionResolverV2.ts) — a new cluster-split pass runs BEFORE the in-place §FIX-WALL-TJUNCTION-BUTT reclassification: it computes each cluster member's tee-host, and when a corner survives extraction, pushes one new `JunctionDraft` per tee-attacher (real end + host passthrough at the body foot) and prunes it from the corner cluster. The subsequent §FIX-WALL-TJUNCTION-BUTT-2 repoint + participant filter see the new junctions as ordinary 1-real-end Ts (idempotent). Pure detection — **never relocates a centreline baseline** (no §CLAMP-COSHARE-WELD / ADR-0072 P3c-b doubling regression). No new fields; no change to `applyRingSweep` / `WallFootprint2D` / `WallFragmentBuilder`.
- **Escape hatch:** `window.__pryzmWallV2TJunctionButt = false` reverts to the pre-fix behavior (both the reclassification and this split are disabled together, since the split shares the T-butt invariant).
- **Tests:** [`junctionResolverV2.lCornerT.test.ts`](../../../../packages/geometry-wall/__tests__/junctionResolverV2.lCornerT.test.ts) — (1) near-corner T (x=4.85): A+B keep their L-mitre (corners + shared (5,0) pivot, byte-identical to the bare L), C is a clean 4-gon flat butt on A's near face with no pivot, and NO footprint has a tongue vertex nor a doubled (same-direction near-coincident parallel) edge across walls; (2) exact-vertex 3-way Y stays a clean positive-area fan with no doubling; (3) far mid-span T unchanged; (4) the L-27 near-end T (host+guest, no corner) is byte-unchanged. All 4 new cases green; the 125-test geometry-wall suite (→129 with these) and the 107 ai-host wall/junction/footprint/pipeline tests remain green **without edits**.
- **Alignment:** C15 / C11 — the extracted T is an ordinary hosted-junction; splitting the cluster cannot orphan a door/window (host relations are per-wall, unchanged). C04/P2/P3 respected — pure 2-D detection math, no new geometry pass, no THREE in `JunctionResolverV2`.

## Refinement — §FIX-WALL-JOIN-BASELINE-IMMUTABLE (a join never mutates a stored baseline — 2026-07-02, L-44 / L-46 / L-47)

**Status:** SHIPPED. Refines the **orchestration seam** (`WallRebuildCoordinator._rebuildWalls` write-back), not the junction algorithm/footprint/extruder. The `WallMiter` / `WallFootprint` / `JoinData` contracts are unchanged; this ADR already states joins should "butt cleanly … no dark wedge" as a *render-time footprint* operation, so enforcing that the persisted baseline is authoritative is a tightening within ADR-0055, not a superseding decision.

**Defect (founder, three reports → one root).**
- **L-44** — a T of 3 DIFFERENT walls (two collinear bars of different thickness + a perpendicular stem) renders a **perfect PREVIEW** but a **wrong COMMIT**. Console at commit: `[WallJoinResolver] §MULTI-CLUSTER-PARTITION-TRIM … angled arm 0.004m off junction → square-cap to consensus`.
- **L-46** — changing a wall's **TYPE** (`UPDATE_WALL_SYSTEM_TYPE`) **shrinks** it (`§DIAG-WALL-SPIKE srcLen=1.531→newLen=1.153 preserve=false bMoved=true`).
- **L-47** (decisive) — drawing a **NEARBY** wall changes the length of an **unrelated, already-cleanly-joined** wall.

**Root cause (unified).** The **preview** and the **default (V2) commit** both render each wall from its **authored** `_sourceBaseLine` (the V2 footprint mitres/butts by construction; the `resolveJunctions` band is 0.20 m, so a 0.004 m-off arm is treated as coincident — a clean shared node). But `WallRebuildCoordinator._rebuildWalls` **persisted** the legacy `WallJoinResolver.resolveLevel` **trimmed / square-capped baseline** back to the store (`store.update({ baseLine: _newBL })`) for any move the *destructive-only* §POST-RESOLVE-PRESERVE guard did not classify as a spike/collapse/>20 mm-pivot. Small along-axis join trims (a type-change re-trim, a nearby-create consensus trim, the 0.004 m square-cap) sailed through and **mutated the authored length** — the stored baseline then diverged from the previewed footprint (preview ≠ commit), and re-fired on every nearby edit/undo/redo. This is exactly the **§CLAMP-COSHARE-WELD** "moving shared baselines → length changes / doubled walls" hazard (previously reverted) that `§MULTI-CLUSTER-PARTITION-TRIM` reintroduced through the write-back.

**Principle enforced.** *A wall's authored baseline is IMMUTABLE except by an explicit user move/edit. A whole-level JOIN re-resolve is a RENDER-TIME footprint operation — it mitres/butts the extruded geometry via the `JoinData` miter normals + the V2 footprint (both computed from the same authored source, §SOURCE-BL-FIX) — and must NEVER mutate/persist another wall's stored baseline/length.*

**Fix.** In `WallRebuildCoordinator._rebuildWalls` (`§FIX-WALL-JOIN-BASELINE-IMMUTABLE`): every **moved, authored-VALID** wall in a join re-resolve is anchored back to its `_sourceBaseLine` (kept as BOTH `baseLine` and `_sourceBaseLine`, idempotent), so the stored length never changes on a join. The trim still flows to the render footprint; only the **persist** is suppressed. Only a genuinely-degenerate **authored** stub (`< DEGENERATE_STUB_LENGTH`) is excluded, so §FIX-WALL-CLUSTER-DEGENERATE / §RESOLVED-STUB-SWEEP still skip real stubs. Explicit user moves are unaffected — `UpdateWallBaselineCommand` (§R5-FIX) refreshes `_sourceBaseLine` to the new position, so anchoring never reverts an intended edit. Escape hatch: `window.__pryzmWallJoinBaselineImmutable = false` restores the pre-fix trim-persist path.

- **Locus:** [`WallRebuildCoordinator._rebuildWalls`](../../../../apps/editor/src/engine/WallRebuildCoordinator.ts) — the store write-back only; `WallJoinResolver` / `JunctionResolverV2` / `WallFootprint2D` are untouched (the resolver may still *compute* a trimmed footprint; it is just never persisted). `decidePreservedBaseline` is left intact (its destructive-classifier unit tests still pin it); immutability is an additional, higher-priority anchor at the write site.
- **Tests:** geometry-wall [`junctionResolverV2.tJunctionNearNode.test.ts`](../../../../packages/geometry-wall/__tests__/junctionResolverV2.tJunctionNearNode.test.ts) — the 0.004 m-off stem participates in the junction (real corners, edge-coincident with the bars, byte-close ≤5 mm to the exact-at-node footprint; a far wall is not fused). Editor [`wallJoinBaselineImmutable.test.ts`](../../../../apps/editor/__tests__/wallJoinBaselineImmutable.test.ts) — drives the REAL `_flush`: the 3-wall T commits byte-unchanged; a nearby create + a type change leave every neighbour baseline byte-identical; repeated re-resolves never drift. The three §POST-RESOLVE-PRESERVE suites (17 cases) and the 114+ geometry-wall / 67 V2 suites remain green.
- **Alignment:** C03/C06 — the persisted baseline is authored state; a render join is not a mutation and must go through no store write. C04/P2/P3 respected — no new geometry pass; the fix is confined to the L5 orchestrator's write-back, keeping the L1/L2 join packages pure.
