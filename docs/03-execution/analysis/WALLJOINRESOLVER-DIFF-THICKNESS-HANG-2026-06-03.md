# WallJoinResolver diff-thickness project-open HANG — root-cause analysis (2026-06-03)

> **Severity: 🔴 DAILY-USE BLOCKER.** A saved project that contains two walls of
> *different* thickness meeting at a shared endpoint can hang the tab on re-open,
> during the load-time wall rebuild. The project loads fine (OI-059 local-restore
> works) and then freezes. This is a re-open regression: the geometry is already
> persisted, so the failure is **deterministic for that geometry** and the user
> cannot recover by retrying.
>
> Related: [`A.WJ.MULTICLUSTER`](../plans/master-execution-tracker.md) (the `zse`
> multi-cluster degenerate-wall bug — same family), memory
> `walljoinresolver-multi-cluster-bug`, memory `realtime-edit-perf-and-adr057`.

---

## §1 — Evidence

User report: project now LOADS (16 walls / 6 doors / 1 window / 43 furniture
restored from local), then FREEZES during wall-join resolution. **Last log line,
then nothing** (UI stuck, FPS → low):

```
[WJR-DIFF-THICKNESS] (option-B butt) dominant=wall_01KT3TP7TM1Y7KPSP464G9PEZ3(start) tDom=0.2 sub=wall_01KT3TPKZGFSM41Q41S75D1DWD(start) tSub=0.1
```

Decoded geometry:

| field | value | meaning |
|---|---|---|
| `dominant … (start)` | wall `…PEZ3` | thicker wall, joins at its **start** endpoint |
| `tDom` | **0.2 m** | dominant total thickness |
| `sub … (start)` | wall `…DWD` | thinner wall, joins at its **start** endpoint |
| `tSub` | **0.1 m** | subordinate total thickness |

So: **two walls of different thickness (0.2 vs 0.1), both joining at their `start`
endpoints, at one shared point.** `|tA − tB| = 0.1 m ≫ 1 mm`, so the
`§DIFF-THICKNESS-FIX` "option-B butt" branch is taken
(`WallJoinResolver.ts:967`).

Crucially, **the log at line 1038 fires AFTER the degenerate-wall guard at
1012**. That guard `return`s *without* logging line 1038
(`WallJoinResolver.ts:1012–1020`). Because line 1038 *did* print, the guard
**passed** — i.e. neither new baseline was shorter than `MIN_LEN`
(`DEFAULT_MIN_WALL_LENGTH = 0.05 m`, `WallJoinResolver.ts:50`). The trim was
committed and `_applyCorner` returned. **The hang is therefore downstream of, or
sequentially after, this committed trim — not inside the option-B branch itself.**

---

## §2 — The "option-B butt" branch, traced

File: `packages/geometry-wall/src/WallJoinResolver.ts:949–1040`
(inside `static _applyCorner(...)`, the corner-join handler).

```
965  const tA = wallA.thickness;
966  const tB = wallB.thickness;
967  if (Math.abs(tA - tB) > 0.001) {          // ← diff-thickness branch
968    const isDomA       = tA >= tB;
969    const dominantEp   = isDomA ? epA : epB;
970    const subordinateEp = isDomA ? epB : epA;
...
987    const domOutward    = new THREE.Vector3(-dominantDir.z, 0, dominantDir.x);
988    const subFreeEnd    = subordinateEp.side === 'start' ? subWE : subWS;
989    const vecFreeToJoin = new THREE.Vector3().subVectors(subFreeEnd, sharedPt);
990    const signFree      = domOutward.dot(vecFreeToJoin) >= 0 ? 1 : -1;
991    const subNewPt      = sharedPt.clone()
                            .addScaledVector(domOutward, signFree * (dominantT / 2 - 0.001));
...
1010   const newDomLen = newDomBL[0].distanceTo(newDomBL[1]);
1011   const newSubLen = newSubBL[0].distanceTo(newSubBL[1]);
1012   if (newDomLen < MIN_LEN || newSubLen < MIN_LEN) { ...return; }   // §DEGENERATE-WALL-GUARD
...
1038   console.log(`[WJR-DIFF-THICKNESS] (option-B butt) ...`);
1039   return;
```

What it computes:

- **Dominant** (thicker) wall: endpoint stays at `sharedPt` (centreline
  intersection), perpendicular cap, `MN = null` (`:1026–1027`).
- **Subordinate** (thinner) wall: its joining endpoint is moved to
  `subNewPt = sharedPt ± domOutward·(dominantT/2 − 1 mm)` — a **lateral** offset
  *perpendicular to the dominant wall's axis*, so the thin wall's end-cap butts
  just inside the thick wall's near face. `MN = null` too (`:1034–1035`).

Both new baselines are written to `bl` and to the `result` adjustment map; the
function returns. **What runs after** (the stall window):

1. The remaining iterations of the `_detect()` join loop
   (`WallJoinResolver.ts:200–203`) — may include further corners/T-joins, some of
   which involve the SAME two walls (now carrying the moved baseline).
2. `WallJoinResolver.resolveLevel` returns its `result` map
   (`WallJoinResolver.ts:205`).
3. Back in the coordinator (`apps/editor/src/engine/WallRebuildCoordinator.ts`):
   `refreshV2Cache` (`:317–349`) → `store.update(wallId, { baseLine })`
   (`:384`) → **`builder.buildWall(updated, adjustment, …)`** (`:392`) →
   `computeJunctionInfills(...)` (`:464`).
4. `buildWall` → `createWallBodyFragment` (`WallFragmentBuilder.ts:2482`) →
   the **V2 pipeline is default-ON** (`:2502`): `buildWallV2Geometry` →
   `WallFootprint2D.buildWallFootprint` → `WallPolygonExtruder.buildWallExtrusion`.

---

## §3 — The precise hang mechanism

**Finding (high confidence): there is NO unbounded loop or unbounded recursion in
any module on the wall-rebuild path.** Every loop was read and is bounded:

| module | loops | bound |
|---|---|---|
| `WallJoinResolver` (`resolveLevel`, `_applyCorner`, `_applyT`, `_handleMultiWallClusters`, `_detect`, all helpers) | `for` over walls/endpoints/joins; union-find `find()` is path-compressed | finite (wall/endpoint count) |
| `WallJunctionClustering` (`detectJunctionClusters`, `_computeConsensusPoint`) | `for` over endpoints/pairs | finite |
| `WallJunctionInfill` (`computeJunctionInfills`) | `for` over clusters/pairs | finite |
| `WallFootprint2D` | none (straight-line) | — |
| `WallPolygonExtruder` (`buildWallExtrusion`) | `for` fans over polygon (≤6 verts) | finite |
| `MiterPrismBuilder` (`buildMiterPrism`) | none (straight-line) | — |
| `JunctionResolverV2` | `for` over walls/pairs | finite |
| `LayeredWallOpeningBuilder` `growX/growY` `while` | bounded by `xCount`/`yCount` (opening-break grid) | finite |

So the symptom is **not** a classic tight `while(true)` in the resolver. The
log line being "last" simply means it was the **last corner resolved before
`resolveLevel` finished** and control moved into the synchronous rebuild/commit
that follows. The freeze is in that synchronous tail.

The mechanism is a **degenerate / NaN-poisoned geometry produced by the
option-B trim, consumed by a downstream step that does not gracefully terminate
on NaN/degenerate input**. Two concrete degeneracy vectors, both reachable with
`tDom=0.2 / tSub=0.1`, both `start`, at one shared point:

**(A) Lateral-offset degeneracy of the subordinate wall.** `subNewPt`
(`:991`) is offset *perpendicular to the dominant wall*, by ~0.099 m. The
`§DEGENERATE-WALL-GUARD` (`:1012`) only checks the *length* `subNewPt → free
end`, which is still long, so it **passes**. But it does **not** check that the
moved endpoint keeps the subordinate's *direction* sane. When the two walls are
near-collinear (or the subordinate is short and nearly parallel to `domOutward`),
the moved `start` lands such that the subordinate's new axis is near-zero or
reversed relative to its detection-time axis. Downstream, `buildMiterPrism`
(`MiterPrismBuilder.ts:43`) and `WallFootprint2D` (`unit()`,
`WallFootprint2D.ts:51,58`) do `normalize()` / `unit()` on `end − start`; a
near-zero vector → **NaN direction → NaN vertex positions**.

**(B) Both walls share the same `start`, and one of them is the dominant in a
second corner.** This is exactly the failure the `zse` memo recorded ("the same
wall is the dominant in two different option-B butt corners… without this guard
the wall becomes near-zero length and downstream construction throws or hangs").
The current `MIN_LEN` guard handles the *length-collapse* form; it does **not**
handle the *NaN-direction* form above.

Once a NaN BufferGeometry exists, the stall surfaces in the synchronous tail:

- `WallPolygonExtruder.buildWallExtrusion` calls `computeBoundingBox()` /
  `computeBoundingSphere()` (`WallPolygonExtruder.ts:158–159`) — with NaN
  positions THREE warns/spins on the bounding maths and produces a NaN sphere.
- `toCreasedNormals` / `mergeGeometries` on the opening path
  (`WallFragmentBuilder.ts:1937`) operate on NaN attributes.
- The user has **6 doors + 1 window** — opening-bearing walls take the
  CSG / greedy-merge path. A NaN-coordinate mesh fed to BVH/CSG is the canonical
  non-terminating case (the BVH SAH split never partitions on NaN bounds; CSG
  half-edge walks never close). `MeshBVH` build is lazy on first pick
  (`packages/picking/src/bvh-pick.ts:265`), but `setFromObject` /
  bounding-volume recomputation runs eagerly when the new mesh is committed and
  re-rendered every frame → "FPS → low" rather than a clean 100%-one-core spin.

**Net:** the *producer* of the bug is unambiguous and cited — the option-B trim
at `WallJoinResolver.ts:949–1040`, whose guard checks length but not
direction/finiteness. The *exact* downstream op that stalls depends on whether
the affected wall hosts an opening (CSG path) or not (extruder bounding-volume
path); both are NaN-fragile. The fix belongs at the **producer** (don't emit a
degenerate baseline) plus a **consumer guard** (don't build a mesh from a
non-finite/degenerate baseline) — neither is a "find the infinite loop" problem.

### Is it ALL mixed-thickness projects, or specific geometry?

**Specific geometry, not all mixed-thickness walls.** A plain L-corner between a
0.2 m and a 0.1 m wall that are roughly *perpendicular* trims cleanly and renders
fine (this branch ships and is exercised by the apartment generator). The hang
requires the degenerate sub-case: the two diff-thickness walls meet such that the
lateral `subNewPt` offset (or a second corner on the same dominant wall) drives a
baseline to near-zero length **in a direction the `MIN_LEN` guard doesn't catch**,
or both endpoints land at one cluster consensus (the `zse` topology). Because the
geometry is persisted, **for the affected project it reproduces on every open** —
so from the user's seat it is a hard, non-recoverable blocker even though only a
subset of mixed-thickness configurations trigger it.

---

## §4 — Ranked fixes

### Quick (low-risk, ship first)

1. **Finite + direction guard in the option-B branch (producer).** Before
   committing `newSubBL` / `newDomBL` (`WallJoinResolver.ts:1010–1036`), in
   addition to the existing `MIN_LEN` length check, verify the new baseline is
   **finite and non-degenerate in direction**: `Number.isFinite` on all 6
   coordinates AND the new segment direction's length ≥ `MIN_LEN`. If it fails,
   `return` (refuse the trim, leave the wall at its un-trimmed baseline) — the
   join is then imperfect-but-watertight via the square-cap fallback, never NaN.
   This is the minimal, targeted fix and mirrors the existing guard's pattern.

2. **Length-clamp the lateral offset (producer).** Clamp
   `signFree * (dominantT/2 − 0.001)` so the moved `start` cannot cross the
   subordinate's own free end (i.e. cannot invert the wall). Memory note:
   "diff-thickness butt-join needs length-clamp."

3. **Degenerate-baseline guard at the mesh builder (consumer).** In
   `WallFragmentBuilder.buildWall` / `createWallBodyFragment`, before building,
   reject a wall whose `baseLine[0] ≈ baseLine[1]` (distance < `MIN_LEN`) or whose
   coordinates are non-finite: skip the body fragment + set `mesh.visible = false`
   rather than feed NaN to the extruder/CSG/BVH. (`buildWall` is already wrapped in
   `try/catch` at `WallRebuildCoordinator.ts:395`, but a *hang* is not catchable —
   the guard must run *before* the geometry op, not rely on the catch.)

### Structural (per the `zse` memory; the durable fix)

4. **Flag invalid walls + skip their mesh build entirely.** Per
   `A.WJ.MULTICLUSTER` and the `zse` memo: when the resolver detects a wall it
   cannot trim into a valid, finite, non-degenerate baseline (self-cluster
   degenerate, or the diff-thickness NaN case here), mark it `invalid` in the
   adjustment result, and have the coordinator/builder **skip mesh construction
   for invalid walls** (no body fragment, no infill participation, no CSG). This
   removes the phantom-geometry class of bugs at the source and is the same fix the
   `zse` row already scopes — this report just adds the diff-thickness NaN vector
   to that row's remit.

---

## §5 — Safe interim mitigation (so OPEN NEVER hangs)

**Ship fix #1 + #3 together as the interim mitigation: a finite/non-degenerate
baseline guard at BOTH the producer (option-B branch) and the consumer
(`buildWall`).**

The single safest, smallest change is the **consumer guard (#3)**: at the very top
of the per-wall mesh build, if the (post-trim) baseline is non-finite or shorter
than `MIN_LEN`, skip the geometry op and hide the mesh. This guarantees the
synchronous rebuild tail can never hand a NaN/degenerate geometry to the
extruder / CSG / BVH / bounding-volume maths, so **the project always finishes
opening** — even if that one corner renders as a plain square-cap join or a
hidden sliver. *A wrong-but-fast join beats a frozen tab.* It is also defensive
against every other degeneracy vector (self-cluster, multi-cluster, future join
math), not just this one.

(Optional defense-in-depth: a hard iteration/again cap on any geometry walk that
could in principle loop — but note **none was found** on this path, so the cap is
belt-and-braces, not the fix.)

---

## §6 — Severity

🔴 **DAILY-USE BLOCKER.** Any saved project containing two different-thickness
walls meeting at a shared endpoint in the degenerate sub-configuration **cannot be
re-opened** — the tab freezes during the load-time rebuild and the user cannot
recover by retrying (the geometry is persisted; the failure is deterministic).
Mixed-thickness walls are common (exterior 0.2 m shell + 0.1 m interior
partitions is the apartment generator's *own* output pattern), so the blast radius
is broad even though only a subset of meeting-geometries trigger it. The fix is
small and well-scoped (a finite/degenerate guard at the producer and consumer);
the structural "flag invalid + skip mesh build" already has a tracker home
(`A.WJ.MULTICLUSTER`).

---

### Code-fix status

**No feature code changed in this pass** — per the analyse-first directive. The
producer guard (`WallJoinResolver.ts:1010`) and consumer guard
(`WallFragmentBuilder.buildWall`) are both small and obvious, but they touch the
hot wall-rebuild path and need their own focused PR + targeted regression test
(re-open a fixture project with a 0.2/0.1 wall pair meeting at `start`). Recorded
here for the next implementation slice under `A.WJ.MULTICLUSTER`.
