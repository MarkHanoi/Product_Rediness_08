# ADR-0368 — GPU instancing covers 0% of a real building, and the opening clause is the whole predicate

- **Status:** ACCEPTED (measurement) · PROPOSED (the two remediations in §6)
- **Date:** 2026-08-24
- **Lane:** STARTUP27 · **Issue:** L-10440
- **Supersedes / amends:** nothing. Amends the reading of `C04 §GPU-INSTANCING` in place.
- **Artefact:** `packages/geometry-wall/__tests__/STARTUP27ProjectOpenScale.measure.test.ts`

---

## 1. Context — the founder's mandate

> *"Our projects are still small — they will likely be **20× and 100× larger**, many elements
> within. I need to make sure the project's opening and startup is sound … **quick, fast,
> robust**."*

The console reports `[InstancedElementRenderer] wired — Phase 7 GPU instancing active.` and
`[LevelScoped3DCullingService] Active (mode=all)`. Both are true statements about WIRING. Neither
is a statement about COVERAGE, and coverage is what a 100× claim depends on.

⛔ **Nothing in this ADR is reasoned from the founder's current project.** A 100× claim cannot be
reasoned about from a 200-element file, so the first deliverable was a reproducible synthetic load.

## 2. The instrument

`STARTUP27ProjectOpenScale.measure.test.ts` generates a multi-storey building on a `g × g` cell
grid and drives it through the **real** wall half of project open — the same three calls
`WallRebuildCoordinator._flush` and `ProjectLoader` make, per level:

```
builder.refreshV2Cache(specs)              →  V2 footprint spec cache
WallJoinResolver.resolveLevel(walls)       →  junction / mitre solve
builder.buildWall(w, join, renderMap, off) →  geometry + the instancing decision
```

Instancing counts come from the **existing** `§PRYZM-PERF` per-clause counters inside
`WallFragmentBuilder`'s `isSimpleWall` router (`PERF_KEYS.WALL_REJECT_*`) — no rival instrument was
minted. Group counts come from the **real** `InstancedElementRenderer`, not a stub, so the collapse
ratio is the one production would get.

⛔ **NOT measured here** (needs a browser, and is named rather than estimated): GPU upload,
shader/PSO compile, first paint, store hydration, plugin registration, culling-service escalation.
An estimate printed beside real numbers reads as a real number.

⭐ **Every scale is generated TWICE** — once with a realistic opening profile (perimeter walls get
a window, interior walls get a door), once with `openings: []` and *nothing else changed*. Without
that control, a census of the subject cannot separate "openings caused this" from "openings
correlate with this".

## 3. What was measured

```
  scale profile     walls  lvls |  specCache    resolve      build      TOTAL |  instanced   notInst   inst%
  1x    realistic    200     5  |     73.0      155.1     1318.3     1548.3 |         0       200    0.0%
  1x    none         200     5  |     25.8       38.5      619.2      689.4 |       160        40   80.0%
  20x   realistic   3960    18  |    516.8     1781.8    11061.9    13371.7 |         0      3960    0.0%
  20x   none        3960    18  |    580.8      922.7     1423.1     2928.4 |      3816       144   96.4%
  100x  realistic  20240    20  |   3951.9    21694.0    72921.7    98606.2 |         0     20240    0.0%
  100x  none       20240    20  |   8185.8    42404.9    59255.9   109847.0 |     20080       160   99.2%

  REJECTION CLAUSES (per FAILING clause — read each against notInstanced, never against each other)
  scale profile   notInst  openings  mitreStart  mitreEnd   curve    rake  layers profile noBridge
  1x    realistic     200       200          20        20       0       0       0       0        0
  20x   realistic    3960      3960          72        72       0       0       0       0        0
  100x  realistic   20240     20240          80        80       0       0       0       0        0

  ALLOCATION + DRAW-CALL SHAPE (constructions, not live objects)
  scale profile     walls   sceneMeshes   geomCreated   matCreated  instGroups  instTotal  mat/wall
  1x    realistic    200          1080          2440         1680           0          0      8.40
  1x    none         200           205           400           82           5        160      0.41
  20x   realistic   3960         20520         42048        32400           0          0      8.18
  20x   none        3960          3978          7920          289          18       3816      0.07
  100x  realistic  20240        102960        207040       163680           0          0      8.09
  100x  none        20240        20280         40480          321          40      20080      0.02
```

## 4. Findings, ranked, each with the number that proves it

### F1 ⭐⭐ — Instancing covers **0.0%** of a realistic building, at every scale. Not "almost none".

`instanced = 0` at 1×, 20× **and** 100×. The control row instances **80% / 96.4% / 99.2%** of the
identical geometry, so the arm is wired and works — the only difference between the rows is
`openings`.

The clause table settles the mechanism with no interpretation required: at 100×,
`reject.hasOpenings = 20240` against `notInstanced = 20240`. **One clause accounts for the entire
rejection.** Mitres contribute 160 of 40,480 clause-hits; curve, rake, layers and profile
contribute **zero**.

⭐ The prior expectation in the lane brief was that mitres would dominate ("a generated building
mitres its corners"). **That hypothesis is refuted.** Mitres reject 80 walls at 100×; openings
reject 20,240. The corner count grows with the PERIMETER while the opening count grows with the
BUILDING, so the mitre clause becomes *less* relevant as the model scales, not more.

### F2 ⭐⭐ — Openings cost **510× more materials** and **5× more meshes**, and the ratio does not improve with scale.

At 100×: **163,680** material constructions and **102,960** scene meshes with openings, versus
**321** materials and **20,280** meshes without. Per wall that is **8.09 materials** on the
standard arm against **0.02** on the instanced arm, and the 8.09 is flat across 1×/20×/100×
(8.40 → 8.18 → 8.09), i.e. **it is a per-wall constant, not a startup constant.**

This is the audit's "364 material instances for one visual signature" finding, scaled: the
instanced arm routes through `_getInstanceMaterial` / `dedupInstanceMaterial` and collapses to 321
materials in 40 groups; the opening-bearing arm shares nothing.

### F3 ⭐ — The wall half alone of a 100× open is **~98.6 s**, before any GPU work.

1.5 s → 13.4 s → 98.6 s across 1× / 20× / 100×. `buildWall` is 74% of it (72.9 s). Because GPU
upload, shader compile and first paint are excluded, **98.6 s is a floor, not an estimate of the
user's wait.**

### F4 ⚠ — Junction resolution is **superlinear in walls-per-level**, and only past 20×.

Per level: 40 walls → 31 ms; 220 walls → 99 ms; 1012 walls → **1085 ms**. From 1× to 20× the
solve is *sub*linear (5.5× the walls for 3.2× the time — the `_detect` spatial grid doing its job).
From 20× to 100× it is *super*linear: **4.6× the walls for 11× the time.** `_detect` is bucketed;
`_handleMultiWallClusters` → `detectJunctionClusters` runs **before** the bucketed pass and is the
remaining suspect. ⚠ **Named as a suspect, not as a root cause — it has not been isolated.**

### F5 ⚠ — The control row is SLOWER than the subject at 100× on two phases, and this is UNEXPLAINED.

100× `none` reads `specCache 8185.8` and `resolve 42404.9` against the subject's `3951.9` /
`21694.0`, while building 20,080 instanced walls. It is recorded here **because it is anomalous and
was measured**, not because it is understood. ⛔ Do not build an argument on this row until it is
explained; the likely candidates are GC pressure from the 20,080-instance matrix churn and
allocator state, neither of which is established.

### F6 — `LevelScoped3DCullingService` escalation: **UNMEASURED, and the question is live.**

It auto-escalates to massing LOD at **≥4000 elements**. Both larger rows cross it (3,960 walls at
20× *before* counting slabs/doors/windows; 20,240 at 100×). ⭐ **So the massing-LOD view the
founder has never seen becomes his DEFAULT at 20×.** Whether that view is acceptable is a **product
question this harness cannot answer** — it needs a browser and his eyes. It is stated here as an
open question rather than assumed benign.

## 5. Decision

1. **The benchmark is the deliverable and it lands.** It is checked in, reproducible, prints to a
   file as well as the console, and asserts no timing threshold (a threshold encodes today's
   hardware and would turn a shared suite red on a slow box). Its assertions guard only that the
   measurement *happened*.
2. **`C04` and `C66` are amended in place** to record COVERAGE beside WIRING, so
   "GPU instancing active" can never again be read as "GPU instancing is doing work".
3. **The instancing predicate is NOT changed by this lane.** See §7.

## 6. Proposed remediations — costed, NOT implemented here

### R1 — Share the wall body material on the standard-mesh arm (F2). ~S, contained.

The opening-bearing arm calls `createWallMaterial` per wall. The instanced arm already proves the
canonical path works (`dedupInstanceMaterial`, 321 materials for 20,240 walls). Routing the
standard arm through the same dedup would cut ~163k material constructions to a few hundred
**without touching the instancing predicate or any geometry**.
⚠ **Graphics risk: LOW but non-zero** — per-wall colour/finish overrides must continue to
re-signature out of the shared bucket, exactly as `dedupInstanceMaterial` already does. Must ship
with a pinned before/after pixel comparison.

### R2 — Make openings instanceable (F1). ~L, needs its own ADR.

A T·R·S instance matrix cannot express a hole, which is *why* the clause exists — it is a correct
guard, not an oversight. Two candidate directions, neither costed enough to choose here:
- **(a) Instance the SOLID SEGMENTS.** A wall with one opening is 2–4 rectangular prisms; each is
  T·R·S-expressible. Collapses the body while leaving reveals/frames on the standard arm.
- **(b) Per-instance geometry variants** keyed by opening signature, so identical
  window-in-identical-wall (overwhelmingly common in a real facade) shares one buffer.

⛔ **A geometry-merge batcher is NOT a candidate.** Lane SCENE6 refuted it (L-10013): PRYZM builds
its pick scene from *visible* meshes, so every merged wall becomes unclickable. Do not re-propose
it without solving picking first.

### R3 — Overlap the project fetch with the engine boot. ~S.

`buildPersistence.openProject` awaits `attachedBootstrap.ensure()` (full engine boot) at line 299
and only then awaits `tier.streamLoad(projectId)` at line 307. **Nothing on the open path is
`Promise.all`-ed.** The bundle fetch does not overlap the boot window, and the bundle is what grows
100×. ⚠ Owned jointly with the persistence path — coordinate before landing.

## 7. What this lane deliberately did NOT change, and why

- ⛔ **The instancing predicate** (`WallFragmentBuilder.ts` `isSimpleWall`). It is shared with
  DRAGPERF17's landed work, and every clause in it is a *correctness* guard — a rake needs a shear,
  a profile needs a non-rectangular silhouette, an opening needs a hole, and none of the three is a
  product of translate·rotate·scale. Removing a clause to raise the instanced count would ship
  silently-wrong walls. **The finding is that the guard is correct and its coverage cost was never
  measured — not that the guard is wrong.**
- ⛔ **`LevelScoped3DCullingService` thresholds.** Changing them is a graphics/product decision that
  requires the founder to look at a 100× model first (F6).
- ⛔ **Project isolation.** Handed to lane ISO28 mid-lane. This lane's only obligation there was to
  report leaks visible at scale; see L-10440's observation section.

## 8. Reproduce

```bash
NODE_OPTIONS=--max-old-space-size=8192 \
  pnpm --filter @pryzm/geometry-wall exec vitest run \
  __tests__/STARTUP27ProjectOpenScale.measure.test.ts \
  --pool=threads --no-file-parallelism --testTimeout=900000
```

⚠ `--pool=threads --no-file-parallelism` is **required on this machine**, not a preference: the
default forks pool dies with `Worker exited unexpectedly` under memory pressure, and it does so for
the **pre-existing** `DRAGPERF17OpeningDragChurn.measure.test.ts` as well — i.e. it is an
environment property, not a property of this file. Table is written to
`$TMPDIR/startup27-project-open-scale.txt` (override with `STARTUP27_OUT`).
