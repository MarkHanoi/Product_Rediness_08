# Corridor centrality audit — "the corridor must be the spine" (2026-06-21, PR #520)

Founder, on the live ALMANZORA 2-storey house:
1. **Ground floor:** the corridor (18 m²) sits in a **corner**, connecting almost nothing.
2. **First floor:** the corridor is an **edge strip on one side** — "first it needs to be the spine!!!"

This audit traces both to the carve-selection logic, records an investigation that I ran AND
reverted (it didn't fire where needed), and states the real next actions. No unproven engine change
shipped — only the honest diagnosis below.

## The code root (confirmed by reading + unit-probing `subdivide.ts`)

On a storey WITH a stair keep-out (every upper house floor), `trySingleRectCarve` runs the no-public
branch with `preferSingleLoaded=true`, which **tries the single-loaded carve FIRST**
(`tryNoPublicSingleLoadedCarve`, subdivide.ts:1627). Why: the centred **double-loaded** corridor
buries the spine down the MIDDLE of the plate, so it can never abut an **edge** stair keep-out — the
single-loaded carve lays the corridor against ONE FACE, which the §STAIR-CIRC-FACE reflection can
bring to the stair edge. So the engine deliberately trades centrality for stair-reach. **That edge
strip IS the first-floor corridor the founder sees.**

The double-loaded **central** corridor only wins when the plate is deep enough to host the strip +
TWO usable private zones. I confirmed both regimes by unit-probing the no-public carve:
- **Deep plate (≈12 m):** `§NO-PUBLIC-CARVE APPLIED double-loaded corridor … every private room abuts
  the central corridor` — the engine ALREADY produces a central spine here. ✓
- **Shallow plate (≈6.5 m):** falls to the single-loaded **edge** corridor. ✗ (the founder's defect)

So the centrality defect is specifically the **shallow / stair-fragmented upper plate** case.

## The investigation I ran and REVERTED (honest record)

Hypothesis: prefer a stair-anchored **L-corridor** (`planLCorridorComb`, already built + 10 tests) —
a leg reaches the edge stair while the other leg drives into the plate — over the single-loaded edge
corridor. I wired `§LU-CORRIDOR-SPINE` ahead of the single-loaded carve, gated on the L placing EVERY
room AND reaching the stair. Full house+tgl suite stayed green (810). **But a firing probe proved it
does NOT fire on the shallow plates that need it:** on D≈6.5 m plates the L-comb can't place all 6
private rooms (master + 3 bed + 2 bath) along its legs → the all-rooms gate fails → it falls through
to the single-loaded edge corridor anyway. And structurally it sat *before* the double-loaded carve,
so on an untested deep plate it could preempt a GOOD central double-loaded layout with an L. Net: it
didn't fire where needed and carried a latent regression → **reverted** (the 5×-revert subsystem
demands a change that demonstrably fires + is browser-verified).

**Root insight:** the blocker is not the wiring — it's that `planLCorridorComb` can't FILL a shallow
stair-fragmented plate with all rooms. A central spine there needs a primitive that lays rooms along
a penetrating spine on a shallow plate (or the HAG footprint-derived spine), not just a re-ordering of
the existing carves.

## Next actions (prioritised, each test-first + browser-gated)

1. **Get the real generation logs for the founder's first floor.** The pasted console was the boot/GIS
   sequence — the `§DIAG-RECTS` / `§NO-PUBLIC-CARVE` / `§NO-SEAL-SINGLE-LOAD` / `§STAIR-CIRC-FACE`
   lines for THIS run were truncated. They pin exactly which carve fired and why double-loaded was
   rejected (shallow? master 58 m² over-allocated distorting the split? fragmentation?). Without them
   the fix is a guess. **This is the unblocker.**
2. **Master over-allocation.** The first floor shows Master Bedroom = 58 m² (vs 30/31 for others) and
   the graph makes the master the de-facto hub. An oversized master can starve the double-loaded split
   into single-loaded. Capping master area (the "master over-allocated" item in the single-apartment
   fix spec) likely lets double-loaded central win on its own — a smaller, safer lever than a new
   corridor primitive.
3. **Shallow-plate central spine.** Teach `planLCorridorComb` (or a new spine primitive) to fill a
   shallow stair-fragmented plate with all rooms, THEN it can legitimately preempt the single-loaded
   edge corridor. Gate it to preempt ONLY single-loaded (never the double-loaded central carve).
4. **Ground-floor corner corridor.** Separate diagnosis: on the ground floor the corridor serves the
   guest bedroom + bath + stair; a corner placement "connecting almost nothing" suggests the hall-hinge
   / 3-zone put the corridor where rooms don't comb off it. Needs its own `§DIAG` log read.
5. **The end-state:** ADR-0073 HAG — derive the corridor SPINE from the footprint's long axis FIRST,
   pack rooms into the residual, so centrality is by construction (not a carve-selection side effect).

## PR #521 update — clearer images, sharper per-defect diagnosis

The first floor now shows a **central horizontal double-loaded corridor (20 m²)** — centrality
LARGELY WORKS here (progress vs the edge-corridor case). Master is 26 m² (Bedroom 1 is the 34 m²
outlier), so master-over-allocation is NOT the cause this run. Two precise gaps remain, same root:

1. **Bedroom 3 (bottom-left, 29 m²) not on the corridor.** It tiles BEHIND Bedroom 2 — a depth-2
   room. The bottom-side comb placed Bedroom 2 + Bedroom 1 along the corridor, but Bedroom 3 is a
   second row further from the spine → no corridor wall → sealed/served-through.
2. **Stair (top-right) not on the corridor.** The Master Bedroom sits BETWEEN the corridor's right
   end and the stair, so the spine stops short of the stair core. §STAIR-ROOM-GROW-TO-CORRIDOR /
   §STAIR-SPINE-TOUCH did not bridge it here.

**Common root:** the spine serves the MIDDLE rooms but does not EXTEND into the far corners
(bottom-left Bedroom 3, top-right stair). The corridor is too SHORT for the plate. This is precisely
the ADR-0073 HAG fix: derive the spine to span the footprint's long axis end-to-end so every room —
including the corner rooms and the stair — borders it by construction.

**Ground floor:** the corridor is the 9 m² stub in the top-right by the stair (the corner-corridor).
The founder's red line marks the intended spine: a horizontal corridor across the mid-height linking
entrance-hall → bedroom → bathroom → stair, separating the public top row (kitchen/living) from the
private bottom row. Same "corridor must span the plate" fix.

### The ONE unblocker (asked twice — here's the low-friction way)
The pasted consoles are the boot/GIS sequence; the generation `[D-TGL] §DIAG-*` lines (which pin
WHICH carve fired + whether the stair-bridge passes ran) are truncated off the top. **In the browser
console filter box, type `D-TGL` and copy what shows after clicking Generate.** That filters out all
the boot spam and gives exactly the ~40 generation lines I need to target the corridor-extension +
stair-bridge fix precisely instead of guessing on the 5×-revert subsystem.

## What shipped this session (real, proven)
- `§HALL-HINGE-CORRIDOR-FIT` (commit `32a28af5`) — recovers the ground-floor hall-hinge carve on a
  marginally-shallow private wing by narrowing the corridor toward 1.0 m, so the bedroom combs off the
  corridor instead of dooring onto the dining room. 810 house+tgl tests green, 0 regressions.
