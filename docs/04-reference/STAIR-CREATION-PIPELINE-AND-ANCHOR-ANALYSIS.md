# How the generated house stair is created — pipeline + anchor-reference analysis

*Authored 2026-06-09. Founder question: "How do you programmatically create the stair? I feel
using the starting point as the initial geolocation reference is not right — because the errors
always follow the same pattern." This doc describes the exact pipeline and confirms the founder's
hypothesis: the systematic `cornersInShell=1/4` / "pokes out toward the same corner" defect is a
**start-corner anchor + fixed-direction growth** problem, not a random one.*

---

## 1 — The pipeline (5 stages, frame-by-frame)

The stair is a PURE engine decision (mm, deterministic) that the editor turns into a
`CreateStairCommand`. Everything happens in TWO frames: the **LAYOUT frame** (the plate rotated so
its principal axis is axis-aligned — origin at the footprint bbox min corner) and the **WORLD
frame** (the real, rotated plot). The conversion is a rotation by `±principalAxisRad` about a pivot.

**Stage 1 — Reserve the core rect** (`packages/ai-host/src/workflows/houseLayout/stairCore.ts`
`reserveStairCoreShaped`). Given the storey gap + plate, it picks a SHAPE (I / L / U — U is the most
compact for a tall gap) and a rect SIZE (default U ≈ 2.0 m × 2.8 m), all in the **layout frame**.

**Stage 2 — Position the core** (`stairPosition.ts` `chooseStairCorePosition`). Scores a small
candidate set (`central` / `left` / `right` / `back`) by circulation **waste** + **aspect**
(worst-façade bias) + **§STAIR-ANTI-FRAGMENT** (prefer a CORNER carve = flush to a side wall AND the
rear wall → one dominant rectangle). Returns the **min-corner (x, y)** of the rect in the layout
frame + the position `kind`. On a rotated plate, `snapRectInsidePoly` then nudges the rect toward the
plate centre to keep it inside the (rotated) shell polygon.

**Stage 3 — Resolve flight directions** (`houseOrchestrator.ts` `resolveFlightPlans`). Flight 1 runs
along the core's LONGER axis (`runAlongZ`); for a U, flight 2 is the REVERSE (parallel return). These
layout-frame directions are rotated to world by `+principalAxisRad`. The interior side for the
U-turn is now carried as `StairCore.interiorSide` (from the position kind — the 2026-06-09 fix).

**Stage 4 — Build the rigid stair body** (`apps/editor/src/ui/house-layout/HouseLayoutExecutor.ts`
`_createStair` + `_buildFlights`). THIS is the anchor step:
- **`startPosition` = the NEAR CORNER of the core rect** (`{x0 + wM/2, z0}` when `runAlongZ`, else
  `{x0, z0 + hM/2}`) — in the layout frame.
- Flights + landings are built GROWING FROM that start: flight 1 advances `+dir1 × runLength`; the U
  half-landing + second flight offset sideways by `perp × width` (now toward `interiorSide`) and
  advance back `+dir2`.
- The whole rigid body (start + every flight `startOverride`) is then rotated to WORLD by
  `+principalAxisRad` about the pivot.

**Stage 5 — Dispatch + mesh + void** (`CreateStairCommand`, `geometry-stair`). Builds the mesh from
`startPosition` + `flights` + `landings` + `riserHeight`/`treadDepth`/`width`; `autoCreateOpening`
punches the slabwell void above via `computeStairFootprintRect` (the SAME footprint the guardrail +
floor/ceiling cuts use). §DIAG-STAIR logs the core rect's world corners vs the shell (`cornersInShell`).

---

## 2 — The founder's hypothesis is correct: it's an ANCHOR problem

The defect is **systematic, not random**: every rotated run logs `rot≈−44° … cornersInShell=1/4`,
and the stair always pokes out toward the SAME corner. Random float error would scatter; a fixed
pattern means a fixed geometric cause. Two reinforcing causes, both rooted in "anchor to a corner,
grow in a fixed direction":

**(a) The core RECT is reasoned axis-aligned in the layout frame, then rotated whole.** A 2.0 × 2.8 m
rect placed flush to the layout-frame corner is, after a −44° rotation, a DIAMOND whose corners swing
OUTSIDE the rotated shell polygon. `snapRectInsidePoly` nudges toward the plate centre, but near 45°
(the worst case for axis-snap quantisation) a 2.8 m-long rect at the corner can't be fully contained
by a centre-ward nudge → only the centre + 1 corner end up inside (`cornersInShell=1/4`). The error is
identical every time because the rotation + corner anchor are deterministic.

**(b) The FLIGHTS grow FROM the start corner OUTWARD.** `startPosition` is the near corner and flight
1 advances along the long axis; the U half-landing historically offset to a FIXED side (left of flight
1), so the second run + landing reached AWAY from the interior — past the perimeter. The 2026-06-09
`interiorSide` fix turns the half-landing inward (the first half of the cure), but the body is still
ANCHORED at a corner and GROWN, not CONSTRAINED to fit.

### Why "starting point as the reference is not right"
Anchoring at a corner + growing in a fixed direction means the stair's *extent* is never checked
against the shell as a whole — only its single anchor corner is positioned. The footprint can (and
systematically does) spill past the perimeter on a rotated plate. The robust model is the opposite:
treat the stair as a body that must be **CONTAINED**, anchored to the INTERIOR (or to the abutted
perimeter wall, growing inward), with the FULL footprint validated against the rotated shell.

---

## 3 — Recommended fix direction (the deeper cure)

1. **Anchor to the interior / abutted wall, grow inward** — for a corner stair, set `startPosition`
   so flight 1 runs ALONG the abutted perimeter wall and the U returns TOWARD the interior (the
   `interiorSide` field now available), so the whole footprint stays on the interior side of the wall
   by construction. (Stage 4.)
2. **Validate + contain the FULL footprint in the WORLD frame** — compute the stair's
   `computeStairFootprintRect` (all flights + landings, world-rotated) and require ALL corners inside
   the shell polygon; if not, nudge the WHOLE body inward (along the abutted wall's inward normal)
   until contained — the rotated-frame analogue of `snapRectInsidePoly`, but on the real footprint,
   not the axis-aligned core rect. §DIAG-STAIR `cornersInShell` already measures exactly this — wire
   it as a hard gate, not just a warning. (Stages 2 + 4.)
3. **Reserve the core in the ROTATED frame for strongly-rotated plates** — instead of an
   axis-aligned core rect rotated whole, size/position the core against the rotated shell so the
   corner anchor is genuinely inside. (Stage 1-2.)

The 2026-06-09 `interiorSide` change is step 1's first half (half-landing inward). Steps 2-3 (full-
footprint containment in the world frame) are the systematic cure for `cornersInShell=1/4`; queued.

---

## 4 — File map (for whoever implements the cure)

| Stage | File | Symbol |
|---|---|---|
| 1 reserve | packages/ai-host/src/workflows/houseLayout/stairCore.ts | `reserveStairCoreShaped` |
| 2 position | packages/ai-host/src/workflows/houseLayout/stairPosition.ts | `chooseStairCorePosition`, `snapRectInsidePoly` |
| 3 flights | packages/ai-host/src/workflows/houseLayout/houseOrchestrator.ts | `resolveFlightPlans` |
| 3 interior side | …/houseLayout/types.ts + stairCore.ts | `StairCore.interiorSide` |
| 4 build/anchor | apps/editor/src/ui/house-layout/HouseLayoutExecutor.ts | `_createStair`, `_buildFlights` |
| 4 footprint | packages/geometry-stair | `computeStairFootprintRect` |
| 5 command | packages/command-registry (stair) | `CreateStairCommand` (autoCreateOpening) |
| diag | HouseLayoutExecutor.ts | `§DIAG-STAIR` (centreInShell, cornersInShell) |

Cross-refs: tracker §23 (layout post-mortems), [[d-tgl-deterministic-layout-engine]],
the §STAIR-ANTI-FRAGMENT + interiorSide changes (2026-06-08/09).
