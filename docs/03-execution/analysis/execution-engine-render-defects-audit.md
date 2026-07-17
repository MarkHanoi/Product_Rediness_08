# Execution-Engine Render/Realisation Defects — Audit + Code-Fix Recipe

**Date:** 2026-06-18
**Scope:** FOUR post-execution RENDER/REALISATION defects in the HOUSE generator. The
LAYOUT engine emits sane geometry (`§DIAG-WIN … offsetsMm=[…]`, clean perimeter at first
build); every defect below is in the **execution / realisation / render path**
(`packages/geometry-wall`, `packages/room-topology`, `WallRebuildCoordinator`,
`apps/editor/.../HouseLayoutExecutor`).

**Hard constraints honoured by every fix:**
- **Do NOT** re-propose ADR-0073 perimeter-rectify (reverted — it misaligned storeys). Every
  fix below is **alignment-preserving** (no baseline re-derivation; it re-runs the EXISTING
  join/inset passes or clamps a runaway).
- **Apartment path must stay sound.** The apartment keeps joints through openings because it
  takes the **whole-level `resolveLevel`** rebuild after openings (the house was switched to the
  same path — see §OPENING-VOID-WHOLE-LEVEL, `HouseLayoutExecutor.ts:2814`). The house defects
  are residual; the fixes are guards/re-runs that the apartment path also benefits from but does
  not regress on (each is gated to the failing input).
- **P2-safe** — no new `import * as THREE` outside `renderer-three`. All maths below is in
  packages that already own THREE (`geometry-wall`) or are pure (`room-topology`).

---

## Defect 1 — Runaway wall extrusion (thin white stub poking past a corner)

### Verified root

The miter-cap projection has **no upper clamp**; a join whose miter normal is nearly
**parallel to the wall direction** (a shallow/near-collinear corner, or a square-cap consensus
that still wrote a near-degenerate normal) makes the projection denominator `MN·dir → 0`, so the
cap vertex slides `t ∝ 1/sin(θ)` metres past the wall end → a long thin spike.

Two twin sites share the formula:

- **Plain / opening-segment / edge-overlay walls** —
  `packages/geometry-wall/src/MiterPrismBuilder.ts:69-85` (`project()`):
  ```ts
  const mnDotDir = mn.nx * dir.x + mn.nz * dir.z;
  if (Math.abs(mnDotDir) < 1e-9) return base;          // ← only guard (perpendicular-only)
  const t = (mn.nx * dx + mn.nz * dz) / mnDotDir;       // ← UNBOUNDED
  return [base[0] + t * dir.x, base[1], base[2] + t * dir.z];
  ```
  `MN·dir = cos(angle between miter normal and wall dir)`. At a 1° shallow corner this is ~0.017
  and `t` is ~30× the half-thickness. The `1e-9` floor only catches a *perfectly* perpendicular
  plane. Reached from the plain body (`WallFragmentBuilder` `createWallBodyFragment`), the
  first/last opening segments, and the edge overlay.

- **Layered walls with openings** —
  `packages/geometry-wall/src/LayeredWallOpeningBuilder.ts:135-141` (`pushVertex()`):
  ```ts
  if (startMN && x < 1e-5 && Math.abs(startMnDotDir) > 1e-4) {
      effectiveX = -(startMnDotOut * z) / startMnDotDir;          // ← runaway
  } else if (endMN && Math.abs(x - wallLength) < 1e-5 && Math.abs(endMnDotDir) > 1e-4) {
      effectiveX = wallLength - (endMnDotOut * z) / endMnDotDir;
  }
  ```
  Same `1/(MN·dir)` blow-up; the denominator floor here is only `1e-4`, so `startMnDotDir = 1e-4`
  with `z ≈ halfThickness (0.1 m)` yields `effectiveX ≈ ±1000 m` — the door-at-corner stub.

**Why the existing guards miss it:** `§WJR-INVALID` (`WallFragmentBuilder.ts` ~760) skips only
walls flagged `invalid` (self-cluster or already-degenerate baseline). `§WJR-NAN-GUARD`
(`MIN_WALL_LEN = 1e-3`) skips only sub-millimetre / non-finite **baselines**. Neither inspects the
**projected cap vertices**, and a runaway happens on a perfectly valid baseline *after* both
guards. The `§SHORT-WALL-SAFETY` clamp (`WallJoinResolver.ts:1521-1528`) bounds the corner
*anchor* during pair-wise **detection** only — it does not bound the geometry projection, and it
does not run on the cluster-pass corners.

### The bounded fix

Clamp the miter projection at the single chokepoint(s). Below the shallow-angle floor, fall back
to the **square cap** (return `base` / `effectiveX = x`) — geometrically watertight, no spike.

### Effort
~30 min, 2 small edits + 2 unit tests. P2-safe (both files are in `geometry-wall`).

### Acceptance
- A 3-wall near-collinear cluster + a corner door no longer produces any vertex > a few × the
  wall thickness from the wall end (assert in a unit test on `buildMiterPrism` /
  `buildContinuousLayerGeometry`).
- House generate: no white stub past any corner in 3D; perimeter reads clean.

### In-browser confirm
**Yes** — generate a house on a slightly-rotated boundary and eyeball corners + corner doors.

---

## Defect 2 — Window/door placement drift (realised ≠ modal preview)

### Verified root

The engine offset is measured along the **shell wall as it existed when the command set was
built**, but it is realised as an offset along the **post-trim** wall — and `WallJoinResolver`
moves the shell `baseLine[0]` (and shortens the span) at every mitred corner.

Data flow:
1. `HouseLayoutExecutor.ts:521-525` — `gatherShellWalls()` reads `w.baseLine` from the live wall
   store **at command-build time** (`gatherShellWalls`, `houseShellWalls.ts`-adjacent, around
   `HouseLayoutExecutor.ts:151-193`). For the GROUND floor this is the user's **pre-trim, pre-weld**
   drawn shell.
2. `HouseLayoutExecutor.ts:549` — `buildLayoutCommands(option, opts…)` calls
   `resolveAllShellWindows` → `resolveShellWindow`
   (`packages/ai-host/src/workflows/apartmentLayout/windowEmission/shellWallMatch.ts:406-639`).
   The offset is computed by projecting the window centre onto `match.shell.start` and length
   (`shellWallMatch.ts:489-494`): `offsetM = centreParam − widthM/2`, where `centreParam =
   projParam(centreW, match.shell.start, shellDir)`. **`match.shell.start` is the untrimmed
   endpoint.**
3. Later, in the wall batch (`HouseLayoutExecutor.ts:1023+`), `WallJoinResolver.resolveLevel`
   **trims/mitres** the shell: each corner endpoint moves to the centreline crossing and the
   stored `baseLine[0]` shifts (e.g. by ~halfThickness of the perpendicular neighbour).
4. `wall.createOpening` stores `offset` as **metres-from-`baseLine[0]`** and the renderer carves
   the void at that distance along the *current* (trimmed) baseline. Because `baseLine[0]` moved,
   every opening on that wall is displaced by the trim delta — the drift the founder sees.

The apartment path largely escapes this because its externals are skipped/engine-authored and the
window band coincides with engine-tiled partition endpoints; the house reuses the user's drawn
ground shell, which is the one the resolver trims.

### The bounded fix (alignment-preserving)

Make the realised offset **relative to the same origin the engine measured from**. Two safe
options, smallest first:

**(2a) Re-base the offset against the LIVE wall at dispatch.** In `HouseLayoutExecutor.ts`
`_finishOpenings`, where door openings are already re-clamped against the live wall span
(`liveDoorOpening`, `HouseLayoutExecutor.ts:2688-2702`), also **re-anchor the offset**: compute
the world position of the engine offset along the *original* shell segment captured in
`shellWalls`, then re-project that world point onto the **current** `wallStore.getById(wallId).baseLine`
and emit `offset = projParam(worldPt, liveBaseLine[0], liveDir)`. Apply the SAME re-anchor to
windows (currently windows pass through unchanged at `2703-2715`). This reuses the existing
live-wall read and the existing `shellWalls` snapshot — no new state, no baseline re-derivation.

**(2b) (alternative) Capture the shell snapshot AFTER the wall batch settles.** Move
`gatherShellWalls` for the ground floor to run after `wall.batch.create` has resolved (read the
trimmed baselines), so `resolveShellWindow` projects onto the post-trim segment directly. Heavier
(re-orders the build), but removes the snapshot/realisation mismatch at the source. **2a is
preferred** (local, low-risk, mirrors the door clamp already in place).

### Effort
2a: ~1–2 h (one helper, applied to door + window opening items). 2b: ~half day (re-order risk).

### Acceptance
- A generated house's realised window/door centres match the modal preview within < wall-thickness
  on every mitred-corner wall (compare `§DIAG-WIN offsetsMm` against the carved void centre).
- The drift is independent of corner count (currently it grows with each mitred corner upstream of
  the opening).

### In-browser confirm
**Yes** — generate, open the modal preview side-by-side with the 2D plan, verify openings line up.

---

## Defect 3 — L-corner joints open a gap AFTER openings are created

### Verified root

The console proof:
```
§DIAG-PERIM-CORNER-WHOLE ⚠ L0 corner wall_…(end)↔wall_…(start) GAP=2271mm bothMitred=true
L-corners=16 bothMitred=6 gappy(>5mm)=2
§MULTI-CLUSTER … [primary=0 t-into=0 pinned=0 trimmed=4]
```

`bothMitred=true` yet `GAP=2271mm` means **both walls carry a miter normal, but their trimmed
joining ENDS were moved to DIFFERENT points** — they were never mitred *to a shared corner*. This
happens when the corner is swept into a **multi-wall cluster** (the partition welded onto the shell
near the corner pulls all three endpoints into one cluster at the editor's zoom-dependent
snapRadius). In that cluster:

- `WallJoinResolver._handleMultiWallClusters` (`WallJoinResolver.ts:506+`) finds **no pinned
  primary pair** (`primary=0`) because the two shell endpoints are > `PINNED_TOL` (1 mm) apart on
  the welded/rotated shell.
- The `§NEAR-CORNER-L` recovery (`WallJoinResolver.ts:702-853`) is supposed to recover that
  un-pinned L-corner and defer it to the pair-wise bisector miter. But it requires a
  **`hasTAttacher`** discriminator (`WallJoinResolver.ts:818-852`): a third
  cluster member must sit on the **mid-span body** of one L-pair wall. When the partition was
  *dropped* by the weld (sub-floor collapse), or T-attaches near the **end** rather than mid-span,
  `hasTAttacher` is false → `primaryPair = null` → both shell endpoints fall to the
  **`§CONSENSUS-ON-CENTRELINE`** trim (`WallJoinResolver.ts:1290-1338`), each getting a **square
  cap** projected onto **its own** centreline. The summary then logs `trimmed=4`, and the two
  square caps no longer share a plane → the corner opens (and `bothMitred` reads true only because
  a *later* pass wrote some MN, while the trimmed ENDS already diverged — hence `GAP=2271mm` with
  `bothMitred=true`).

So even though the house now takes the whole-level `resolveLevel` path after openings
(`§OPENING-VOID-WHOLE-LEVEL`, `HouseLayoutExecutor.ts:2814`), the corner is **mis-classified inside
the cluster pass** as a Y/star and square-capped, not mitred.

### Why the apartment stays sound

The apartment's perimeter is engine-authored and bit-exact, so its corners are either pinned pairs
(`PINNED_TOL` ≤ 1 mm) or never clustered with a partition — they hit the pair-wise `_applyCorner`
bisector directly and stay flush. The house reuses a drawn/welded/rotated shell whose endpoints
drift past 1 mm, which is exactly the input `§NEAR-CORNER-L` was added for — but its `hasTAttacher`
gate is too strict for the dropped-divider / end-attach case.

### The bounded fix (alignment-preserving — re-runs the EXISTING corner-join)

Two layered, minimal options:

**(3a) Broaden the `§NEAR-CORNER-L` discriminator** so a near-coincident, materially-long,
perpendicular endpoint pair is recovered as an L-corner even when the third member T-attaches near
an END (not strictly mid-span), OR when the third member was dropped (cluster is just the two
shell ends after the partition collapsed). Concretely, in `WallJoinResolver.ts:818-852`, treat the
`wellSeparated` test as sufficient on its own when the cluster has **exactly two non-self-cluster
members from two long perpendicular walls** (the 2-wall corner case already returns
`hasTAttacher = nearestOther === Infinity` at `:822`; extend that to "no OTHER member is a
body-attacher within snapRadius OR the only others are short stubs"). This keeps a pure interior
Y/star (three long arms meeting at their ends) on the consensus path (no `§CONSENSUS` regression)
but recovers the shell corner.

**(3b) Post-resolve corner-flush re-run (belt-and-braces, alignment-preserving).** After the
whole-level resolve in `WallRebuildCoordinator._flush` (right where `§DIAG-PERIM-CORNER-WHOLE`
already detects the gap, `WallRebuildCoordinator.ts:864-930`), for any 2-wall L-corner reported
`gappy(>5mm)`, re-mitre **just those two walls** to their shared centreline crossing using the
EXISTING `_applyCorner`-equivalent (the same bisector the pair-wise loop uses), writing the matched
`startMN`/`endMN` and moving both trimmed ends to the crossing. This does NOT re-derive any
baseline source (no ADR-0073), touches only the two corner walls, and runs after the body rebuild
so it never re-opens the void. The probe that finds the gap is already there — turn it from
diagnostic into a fix by calling the resolver's pair-wise corner on the offending pair.

**Preferred:** (3a) (fixes the root classification) + keep the (3b) probe as a guard that re-runs
`_applyCorner` only when (3a) still leaves a gap. Both reuse `_applyCorner` / the bisector miter —
no new join algorithm.

### Effort
3a: ~2–3 h + a `WallJoinResolver.cornerFlush` test variant. 3b: ~2 h.

### Acceptance
- `§DIAG-PERIM-CORNER-WHOLE` reports `gappy(>5mm)=0` after a house generate (currently 2/16).
- The `§MULTI-CLUSTER … primary=0 … trimmed=4` corner instead logs `§NEAR-CORNER-L recovered …`
  and the pair-wise bisector fires.
- Storey alignment unchanged (no perimeter-rectify): upper-storey walls still sit on their levels.

### In-browser confirm
**Yes** — generate, inspect L-corners in plan + 3D after openings land; check console for
`gappy(>5mm)=0`.

---

## Defect 4 — Floor finish overshoots the room (past the inner wall face)

### Verified root

The floor finish should clip to each bounding wall's **inner face**, but on some rooms the inset
**collapses** and the builder falls back to the **centreline** polygon — which spans to the wall
*centre*, overshooting the room by half the wall thickness.

Console proof:
```
§DIAG-FLOOR-INSET … self-intersecting (bow-tie) → centreline fall-back
boundary=centreline ⚠ (inset collapsed)
```

Path:
- `CreateFloorsByRoomTypeCommand._innerFacePolygon`
  (`packages/command-registry/src/floors/CreateFloorsByRoomTypeCommand.ts:234-343`) subdivides each
  centreline edge at door openings, assigning inset `thickness/2` on solid runs and `0` across door
  gaps, then calls `insetPolygonToInnerFaces`.
- `insetPolygonToInnerFaces`
  (`packages/room-topology/src/RoomPolygonUtils.ts:233-280`) tries the inset; on a **rotated room
  whose ring was subdivided at door gaps** the collinear inset-transition vertices fold the offset
  edges into a self-intersecting wedge → `_insetToInnerFacesOnce` returns `null` at the `isSimple`
  bow-tie guard (`RoomPolygonUtils.ts:508`). The `§FLOOR-INSET-COLLAPSE` retry
  (`_collapseCollinearRing`, `:300-350`) merges collinear runs and retries; if THAT still fails the
  function returns the **original centreline polygon** (`:279`) as the always-produce-a-floor
  fail-safe.
- The consumer's `§FLOOR-INSET-VALIDATE` area guard
  (`CreateFloorsByRoomTypeCommand.ts:313-338`) only catches a *>50% area drop / sign flip*; a
  centreline fall-back has the FULL (over-large) area, so it passes the guard and the oversized
  floor ships.

So the overshoot is the **centreline fail-safe firing too often** on rotated / door-subdivided
rooms, because the collinear-collapse retry doesn't always remove the bow-tie source.

### The bounded fix

Make the fail-safe **inner-face-correct rather than centreline** in the collapse case. Smallest
robust change: when both the direct inset and the `§FLOOR-INSET-COLLAPSE` retry fail, fall back to a
**uniform single-pass inset of the UN-subdivided centreline ring** (drop the door-gap subdivision
entirely and inset every edge by its wall half-thickness via the SAME `_insetToInnerFacesOnce`).
The door-gap centreline-meeting is a refinement; losing it (floors abut under the wall centreline at
a threshold) is **far less wrong** than overshooting the whole room by half a wall thickness. Only
if THAT un-subdivided inset is also non-simple do we keep the centreline fall-back.

Concretely in `packages/room-topology/src/RoomPolygonUtils.ts:264-279`: add a third attempt
between the collinear-collapse retry and the centreline return — `_insetToInnerFacesOnce` on a
ring built from the room's TRUE corners only (no subdivision points) with a uniform per-edge inset
equal to the max wall half-thickness of that edge. Accept it iff `isSimple` and strictly smaller
than the source.

(Alternatively, fix the SUBDIVISION at the source: `_innerFacePolygon` could skip inserting
door-gap vertices on edges shorter than ~2× the door width, where the collinear fold is most
likely — but the room-topology-side third attempt is the more general, self-contained guard.)

### Effort
~1–2 h + extend `insetPolygonToInnerFaces.test.ts` with a rotated door-subdivided ring fixture.
Pure (`room-topology` has no THREE / no I/O), so P5/P2-safe.

### Acceptance
- `§DIAG-FLOOR-INSET … centreline fall-back` no longer appears for door-subdivided rotated rooms;
  the diag reads `boundary=inner-face ✓`.
- No floor extends past any wall inner face in the generated house (visual + an inner-face
  containment unit assert).

### In-browser confirm
**Yes** — generate a house on a rotated boundary, view floors in plan, confirm each floor stops at
the wall inner face (no overlap under partitions, no spill past the façade).

---

## Cross-cutting notes

- **None** of these fixes re-derive a wall baseline or rectify the perimeter (ADR-0073 stays
  reverted). Defect 1 clamps a projection; Defect 2 re-bases an offset against the live wall;
  Defect 3 re-runs the EXISTING `_applyCorner` bisector on the two corner walls; Defect 4 retries
  the EXISTING inset with a simpler ring. All are alignment-preserving.
- **Apartment regression risk:** Defect 1/4 fixes are input-gated (only fire on the degenerate
  shallow-corner / bow-tie cases the apartment doesn't hit). Defect 2 (2a) only re-bases when the
  live wall differs from the snapshot — a no-op when they match (apartment engine-authored shell).
  Defect 3 (3a) keeps the pure-Y/star consensus path byte-identical; it only recovers a
  near-coincident perpendicular **shell** corner pair.

## File:line index

| Defect | Root file:line | Fix site |
|---|---|---|
| 1 Runaway extrusion | `MiterPrismBuilder.ts:77-84`; `LayeredWallOpeningBuilder.ts:137-141` | clamp `t` / `effectiveX`, square-cap below sin(θ) floor |
| 2 Opening drift | `shellWallMatch.ts:489-494` (offset vs untrimmed shell); snapshot at `HouseLayoutExecutor.ts:521-525` | re-base offset against live wall in `_finishOpenings` (`HouseLayoutExecutor.ts:2688-2715`) |
| 3 L-corner gap after openings | `WallJoinResolver.ts:818-852` (`§NEAR-CORNER-L` `hasTAttacher` too strict) → consensus square-cap `:1290-1338` | broaden discriminator; optional re-mitre at `WallRebuildCoordinator.ts:864-930` |
| 4 Floor overshoot | `RoomPolygonUtils.ts:264-279` (centreline fail-safe) ← bow-tie reject `:508` | add un-subdivided uniform-inset third attempt before centreline return |
