# ADR-0312 — Raked-wall JOINTS are solved exactly by a twin-solve loft; openings-on-rake and layered-rake REMAIN REFUSED, with their costs stated

**Status:** ACCEPTED · **Date:** 2026-08-10 · **Context tag:** `§WALL-RAKE-JOINT`
**Supersedes:** [ADR-0310](./ADR-0310-raked-walls-are-an-instance-property.md) — specifically its §3
"floor-only mitre" consequence and its "not yet scheduled" loft. Everything else in ADR-0310
(instance property, horizontal thickness, base-centreline pivot, the sign convention, the
schema/store refusal doors) **carries forward unchanged** and is not restated here.
**Implements:** founder request 2026-08-09/10 — joints between raked walls (ask #1 of the three).
**Amends:** [C04](../contracts/C04-RENDERING-AND-SCHEDULING.md) (wall body geometry) · touches no schema.
**Related:** [ADR-0055](./ADR-0055-pascal-wall-pipeline.md) · [C15](../contracts/C15-HOSTED-ELEMENT-CONTRACT.md) §2 · [C65](../contracts/C65-ELEMENT-TYPE-SYSTEM.md) §3.9

---

## 1. Context

ADR-0310 shipped `rakeAngleDeg` as an instance property with three deliberate refusals
(curve × rake, layers × rake, openings × rake) and one *stated approximation*: **the junction
mitre was exact at the floor and only there.** Each wall's extrusion sheared its whole base
polygon by its own `topOffset`, so at a joint between two walls of different rakes — or between
a raked wall and a vertical one — the two top corners separated: a wedge-shaped gap on one face,
an overlap on the other, growing linearly with height. The founder has asked for the three
refused/deferred capabilities as features, joints first.

This ADR makes a three-way call, honestly costed:

| Capability | Verdict | Cost |
|---|---|---|
| **1. Joints between raked walls** | **IMPLEMENTED (this ADR)** — exact, not approximated | ~3 focused days (done) |
| **2. Openings hosted on raked walls** | **REFUSAL CONTINUES** | 3–4 weeks; C15 §2 must widen first |
| **3. Layered walls with rake** | **REFUSAL CONTINUES** | 1–2 weeks; silent-re-thickening risk |

## 2. Decision 1 — joints: the twin-solve loft, and why it is EXACT

### 2.1 The geometry

Under the ADR-0310 model a raked wall's side face is a **sheared plane**: the base edge line
swept along the rise vector `(s·h_x, 1, s·h_z)` where `s = cot(rake)` and `h` is the wall's
left normal. The correct mitre between two walls A and B is the **intersection of A's face
plane with B's face plane — a straight 3-D line** (ADR-0310 §3 said exactly this). That line
passes through the base mitre corner (the corner `JunctionResolverV2` already computes) and is
**not vertical** whenever the rakes differ — including the raked-meets-vertical case, where the
vertical wall's top corner must travel along the tilted neighbour's plane.

The load-bearing observation: **every corner point V2 constructs is an affine function of the
probe elevation.** At elevation `y`, wall W's edge lines are its base edge lines translated by
`y · s_W · leftPerp(dir_W)` — directions unchanged, anchors translated linearly. Every V2
corner construct — offset-line ∩ offset-line, endpoint centroids, centreline ∩ centreline pivot
refinement, projection feet on segments, square caps — is composed of intersections and
projections of constant-direction lines with linearly-translating anchors, all of which are
affine in `y` **for a fixed junction topology**. Therefore the mitre corner at height `h` is

    corner(h) = corner(0) + h · v        (v = the corner's horizontal drift per metre)

and `v` can be recovered **exactly** (to floating point) by solving V2 a second time at a tiny
probe elevation `ε` and differencing: `v = (corner(ε) − corner(0)) / ε`.

### 2.2 The construction (what shipped)

1. `WallPipelineV2Cache.refresh()` — when **any** wall on the level has a non-vertical rake —
   runs `resolveJunctions` a **second time** with each wall's endpoints translated by
   `ε · s_W · leftPerp(dir_W)`, `ε = RAKE_JOINT_PROBE_H = 2×10⁻⁵ m`. Vertical walls (and all
   curved walls — curve × rake is refused, so curved walls always have `s = 0`) translate by
   zero. The probe displacement is ≤ `ε·cot(15°)` ≈ **0.075 mm** — two orders of magnitude
   below V2's 1 mm `SHARED_CORNER_TIGHT_M` band and three below the 0.20 m cluster band, so
   the probe solve sees the **same junction topology** as the base solve.
2. Per wall, both solves are pushed through `buildWallFootprint`. Same topology ⇒ same
   vertex layout (`[sR, eR, ePivot?, eL, sL, sPivot?]`) ⇒ index-aligned polygons. Per-vertex
   drift `v_i = (eps_i − base_i)/ε`; the wall's **per-vertex top offsets** are `h · v_i`.
3. `WallPolygonExtruder` accepts `topOffsets` (per-vertex) alongside the ADR-0310 uniform
   `topOffset`. Base polygon untouched (all ADR-0310 safety arguments hold — plan footprint,
   occupancy, room detection, junction detection are base-plane properties). Side-quad normals
   are computed per-triangle from the actual geometry, because a cap/pivot quad whose two top
   corners drift differently need not stay planar. Wall side FACES remain planar (both top
   corners lie on the wall's own face plane), so adjacent walls' faces are **edge-coincident
   along the full 3-D mitre line** — Pascal's shared-corner-by-construction property, now at
   every elevation, not just the floor.
4. Walls of different heights share the mitre **line**; each samples it at its own top. A
   height mismatch exposes the taller wall's face above the shorter — same as vertical walls
   today.

### 2.3 Honest degradation, never a wrong wall

- If the probe solve's footprint for a wall does not index-align with the base footprint
  (topology genuinely bifurcates within 0.075 mm of a classification threshold — a
  measure-zero configuration), or any per-vertex drift exceeds the geometric bound
  `2·max|cot| / RING_COLLINEAR_SIN`, or the lofted top polygon inverts, that wall **falls back
  to the ADR-0310 uniform shear** (floor-exact joint) for that build. Fallback is per-wall,
  logged, and never a throw (§FIX-RAKE-REFUSAL-IS-NOT-A-CRASH, L-812).
- A level with **zero raked walls skips the probe solve entirely** and produces bit-identical
  buffers to the pre-change build — the vertical invariant of ADR-0310 §"round-trip" holds.

### 2.4 Invalidation (the bug class that cost three deploys — L-813)

A wall's built geometry now depends on its **neighbours'** rakes, not only its own. No new
`WallData` field is added — `rakeAngleDeg` already exists and is already in all three gates —
but the two per-wall content keys must move when a *neighbour's* rake moves:

- **Gate 3** (`WallRebuildCoordinator._levelWallSig`) already folds every wall's
  `r[rake]` — a neighbour rake edit releases the level flush. No change needed; the
  `LevelSignatureCompleteness` FIELD INVENTORY is unchanged (no new field).
- **Gates 1+2** (`WallFragmentBuilder._composeCacheKey` / `_versionForBuild`) both key through
  `_rakeTag`, which now appends the level's **rake-joint signature** (sorted
  `id:rake` of every non-vertically-raked wall, supplied by the V2 cache). Empty — and the keys
  byte-identical to before — on any level with no raked wall. A rake edit anywhere on a raked
  level re-keys the whole level; deliberate over-invalidation, because rake edits are rare
  interactive events and correctness beats a cache hit.
- Neighbour **height** does *not* enter the signature: a wall's top offsets are
  `h_own · v_i`, and `v_i` depends only on base geometry (already in the join hash) and
  neighbour rakes (in the new signature).

### 2.5 What joints do NOT change

- `JunctionResolverV2` is **byte-untouched** — it still never learns what a rake is; it is
  simply run twice on translated inputs. The §FIX-WALL-ARC-LINEAR-MITRE seam discipline holds.
- `rakeAuthorability()` in `WallRake.ts` remains the **single** gate and is unchanged — joints
  were never refused there; they were floor-approximate, and are now exact.
- The legacy `MiterPrismBuilder` path (`__pryzmWallPipelineV2 = false`) still renders raked
  walls vertical — the ADR-0310 §3 honesty defect stands, unfixed, and is still named.

## 3. Decision 2 — openings on raked walls: REFUSAL CONTINUES

**Why still refused.** Two independent systems assume a vertical host face:

1. **The carve.** `WallHoleBodyBuilder` (and the CSG single-volume path) subtracts a
   **vertical band**; under a rake the void must become an **inclined parallelepiped** sheared
   with the wall, and the layered/curved carve variants each re-derive the band independently.
2. **The hosted transform (C15 §2).** The host axis is a 1-parameter line: sill is a bare
   world-Y translate at four independent sites, and `hostedElementFrame` returns a scalar
   `rotationY`. A door in a leaning wall needs a full frame — position on a 2-parameter
   surface plus an up-vector → **quaternion**, not a Y-angle. Until C15 widens, every
   door/window plugin, the plan-symbol builders, and the occupancy clamp would each be
   guessing their own vertical.

**Real cost:** 3–4 weeks. C15 §2 contract widening first (≈1 wk, cross-plugin review), then the
inclined carve in plain + CSG paths (≈1 wk), then door/window placement/preview/plan-symbol
consumers (≈1–2 wk). It also collides with the door/window TYPE-system work currently owned by
another track. **A refusal is a correct answer; a silently-wrong door is not.** The refusal
remains a human-readable store/schema decline (`rakeAuthorability` code `hosted-openings`),
never a throw.

## 4. Decision 3 — layered walls with rake: REFUSAL CONTINUES

**Why still refused.** Layer thicknesses are authored **perpendicular** to the face
(an architect's "100 mm blockwork" is 100 mm perpendicular). Honouring that on a rake requires
per-layer plan footprints widened to `t/sin θ`, threaded consistently through the layer slicer
(ADR-0298 V2-parity bands), `WallLayerFootprint2D`, the layer plan lines/symbols, and the
occupancy maths. Getting one site wrong **silently re-thickens every layered wall** — a wrong
wall on a legal drawing, invisible in casual testing. The cheap alternative (shear the layered
solid as authored-horizontal) would make the section lie about every layer's build-up.

**Real cost:** 1–2 weeks: `t/sinθ` threading (≈3 d), section/plan-symbol truthfulness (≈2 d),
regression armour across the ADR-0298 layered-parity suite (≈2–3 d). Worth doing only after a
founder call that layered feature walls need to lean; until then the `layered` refusal stands.

## 5. Consequences

- The founder's #1 ask ships correct: raked↔raked and raked↔vertical L/T/X/Y joints close
  along the true 3-D mitre line, for equal and different rake angles and heights.
- Curve × rake remains refused per ADR-0310 §2.5 (unchanged; the shear varies per station).
- Different `baseOffset`s at one junction still mis-seat exactly as they do for vertical
  walls; the loft is measured from each wall's own base. Not a regression; noted for honesty.
- Nothing here is browser-verified yet (no deploy carried it); behaviour is proven at the
  geometry layer by the `WallRakeJoint` suite — strong, but not a rendered wall on screen.

## 6. Alternatives rejected

| Option | Why rejected |
|---|---|
| Run the top solve at the REAL top displacement and loft the two results | Displacements up to `h·cot(15°)` ≈ metres change junction clustering/classification between the two solves → vertex correspondence breaks → twisted lofts. The ε-probe recovers the same line exactly, with topology pinned. |
| Teach `JunctionResolverV2` about rake (3-D solve) | Smears shape knowledge through the one module ADR-0310 kept shape-agnostic; 285-references-vs-1 discipline (§FIX-WALL-ARC-LINEAR-MITRE) would be lost. |
| Mitre only pairs of EQUAL rake (shared shear ⇒ uniform offset suffices) | Fails the most common real case — a raked feature wall meeting a vertical return — which is precisely where the gap shows. |
| Approximate openings/layers now to ship all three | ADR-0310's refusal argument is unrebutted: both fail *silently* (a door floating off a leaning face; a re-thickened assembly). One correct joint now beats three approximate features late. |
