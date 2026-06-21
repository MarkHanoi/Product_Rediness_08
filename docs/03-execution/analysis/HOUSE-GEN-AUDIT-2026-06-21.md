# Generated-house audit — wall-spike / non-mitered join + downstream (2026-06-21)

Audit of a live 2-storey house generation (founder console + plan screenshots). Covers parity,
the non-mitered wall join, room connectivity, floor quality, and door↔furniture clash.

## TL;DR — ONE root explains most of it

A short interior partition stub at a multi-wall junction **collapses to ~99 mm** after the
post-openings re-resolve. `§POST-RESOLVE-PRESERVE` keeps its *pre-collapse* baseline (to avoid a
zero-length wall) — so the wall is NOT trimmed/mitered into the corner. That single preserved spike
cascades into: the **non-mitered double-line corner** (the circled defect), a **100 mm open
perimeter gap**, and **non-simple room polygons** that make the **Bathroom room drop** and the
**Entrance-Hall / Bedroom-1 floors bow-tie**. This is the [[walljoinresolver-multi-cluster-bug]]
class. The door↔furniture clash is a SEPARATE gap.

## ✓ Parity — CLEAN (no action)

```
§DIAG-PARITY-OPENINGS openings=17 posDrift=0 posMax=0mm widthMax=0mm ✓
§DIAG-PARITY Ground: walls=12 shifted=0 latMax=11mm  ✓ built == previewed
        Level 01:  walls=16 shifted=0 latMax=11mm endTrimMax=299mm ✓
```
Preview ↔ built is exact (11 mm lateral is sub-wall-thickness miter trim). The endTrimMax=299 mm on
L1 is the symptom below, not a parity break.

## ① Non-mitered wall join / wall spike  ← the circled defect

```
§DIAG-WALL-SPIKE wall_…3GMCBCK9QRTA619WD t=0.100 srcLen=1.649m newLen=0.099m dLen=-1.550m
   lateral=99mm preserve=true  src=(17.650,2.203)→(19.189,1.612) new=(19.224,1.704)→(19.189,1.612)
§POST-RESOLVE-PRESERVE kept committed baseline … post-openings re-resolve would collapse (newLen=0.099m)
§DIAG-PERIM-CORNER-WHOLE ⚠ L0 corner …3GMCBCK9QRTA619WD(start)↔…3EWQF4BR4KDWKRY7R(start)
   GAP=100mm bothMitred=true — open corner (resolver did NOT close it).
§DIAG-PERIM-CORNER-WHOLE L0 summary: L-corners=14 bothMitred=7 gappy(>5mm)=1
T-JOIN: trim distance exceeds safety bound, skipping
```
L1 repeats it: walls `…ER6X2S4SP3JQ46EER` (3.951 → 0.099 m), `…EGRFGW1583WPX9652` (1.856 → 0.099 m),
`…EJWC9K9QXHH26HWPC` (lateral 299 mm).

**Mechanism:** at a 3-/4-way cluster the partition's end is clamped onto the host inner face
(`PARTITION→SHELL … clamp=+99.0mm landed=innerFace✓`); the post-openings re-resolve then computes a
near-zero remaining length, so `§POST-RESOLVE-PRESERVE` keeps the old baseline rather than commit a
collapse. Result: the stub's end overlaps the corner instead of mitering — the two/three parallel
lines in the zoom — and the perimeter corner is left 100 mm open. `T-JOIN … skipping` is the same
junction failing the trim safety bound.

**Precise root (traced 2026-06-21) — it is NOT the resolver.** `packages/geometry-wall/WallJoinResolver`
already handles this correctly: `§RESOLVED-STUB-SWEEP` + the `§PARITY-GATE` invariant (test (f) in
`WallJoinResolver.degenerateStub.test.ts`) guarantee no wall ships rendered in the `[1e-3, 0.15)` m
dead band unless flagged `invalid`. The 0.099 m collapse WOULD be flagged invalid by the resolver.

The spike comes from the EDITOR override `§POST-RESOLVE-PRESERVE` (`WallRebuildCoordinator.ts:813-874`,
a founder-2026-06-19 fix). When the **post-openings re-resolve** would collapse a *previously-valid*
wall, it **preserves the pre-resolve baseline AND clears the invalid flag** (`_adjMut.invalid = false`,
line 872) so the wall stays rendered. Trade-off: the wall keeps its OLD (un-trimmed) end, not the
re-resolved mitered corner → the non-mitered overshoot + the 100 mm open corner. The deeper root is
that the post-openings re-resolve *diverges* from the initial resolve (openings are mid-wall and
shouldn't move endpoints) — `§POST-RESOLVE-PRESERVE` is a guard against that divergence destroying a
valid wall; it trades a clean miter for keeping the wall.

**Why this is browser-gated, not a blind edit:** dropping the preserve (let the wall collapse +
invalidate) removes the spike BUT may re-open the room (the wall it preserved is load-bearing for the
room boundary) — exactly the regression `§POST-RESOLVE-PRESERVE` was added to prevent. The sound fix
targets the *re-resolve divergence* (so the post-openings resolve reproduces the initial miter instead
of collapsing) — an editor render-coordination change whose room-sealing + rebuild-stability effects
MUST be visually verified. Do NOT blind-edit `WallRebuildCoordinator`.

## ② Bathroom room dropped — SAME root

```
§DIAG-GRAPH-VALIDATE skipped room "Bathroom" on L0 (unusable polygon → detection fallback)
§DIAG-GRAPH-VALIDATE L0: graph-rooms created=7 / option.rooms=8 ⚠
```
The ground Bathroom's boundary runs through the spike junction → its polygon is non-simple
(self-touching) → graph-room creation rejects it → only 7/8 rooms built. So a *requested room is
missing* purely because the wall stub corrupts its boundary. Fixing ① should restore it.

## ③ Floor inset bow-ties — SAME root

```
room "Entrance Hall" §DIAG-FLOOR-INSET self-intersecting (bow-tie) → centreline fall-back  (×3)
room "Bedroom 1"     §DIAG-FLOOR-INSET self-intersecting (bow-tie) → centreline fall-back  (×3)
room "Entrance Hall" centroid-shrink fall-back (f=0.038, 22.36m² < 24.14m²)
```
Entrance Hall + Bedroom 1 border the spike corner; their boundary polygons self-intersect when
inset → the floor falls back to a cruder centreline/centroid method (cosmetic, but it's the same
non-simple-polygon symptom). The §FLOOR-INSET-SIMPLE guard (v215) catches it and degrades
gracefully — no crash — but the upstream polygon is the real fix.

## ④ Room compliance

```
[RoomBoundaryBuilder] Compliance overlay: 12 error, 0 warning room(s) tracked (overlay OFF)
```
12 room-compliance errors flagged (overlay disabled so not tinted). Likely the same boundary-quality
+ the dimensional over-grow already inventoried (see HOUSE-DIMENSIONAL-DEFECT-INVENTORY-2026-06-20).

## ⑤ Doors clashing with furniture — keep-clear EXISTS; the gap is precision

**Correction after reading the furnish engine:** the keep-clear is NOT missing. `placeSolver.doorObstacles`
(§DOOR-KEEP-CLEAR + §DOOR-SWING-DEPTH) builds a `width × swingR` quad in front of every door
(`swingR = max(door.width, 0.9)`) and EVERY floor-placement path tests it via `quadOverlapsAny`;
`kitchenLayout.ts:395` mirrors the same for the kitchen run (and excludes door walls). So furniture
is already kept out of a door's keep-clear box across paths.

Why the founder still sees a clash — the box is a deliberate CONSERVATIVE compromise, per the code
comment: *"A precise asymmetric swing SECTOR (only the hinge side) would cover the fan without the
wardrobe regression, but the door payload carries no hinge side → not available."* The width-only
box can't be widened (a +0.6 m widen regresses the bedroom wardrobe run — documented landmine), so
on some geometry a chair/table corner clips the swing FAN just outside the box. The live clash needs
a specific browser repro (which door + which piece) to pin whether it's (a) the box under-covering a
particular swing, (b) a door `normal` pointing into the wrong room so the box lands off-room, or
(c) an open-threshold piece in the adjacent room.

**Where my `doorSwingKeepout.ts` fits (repositioned):** it is NOT a fix for an unhandled gap — it is
the **precise swing-SECTOR the existing comment wishes for**. It supersedes the conservative box
WITHOUT the wardrobe regression, but ONLY once the door payload carries the **hinge side** (which jamb
+ swing direction). That payload thread (generators → `LayoutDoor`/furnish `FurnishRoomInput.doors`)
is the prerequisite; with it, `rectIntersectsSwing` replaces the `width × swingR` box in BOTH
`doorObstacles` sites. Until then the helper stays an un-wired, unit-tested staged upgrade — wiring
it naively would just duplicate the existing box. **Do NOT wire it without the hinge-side data.**

## ⑥ Perf (minor, noted not actioned)

```
§WARN DEFERRED-RESUME-FLUSH delayed 3053ms — main thread blocked (PBR chunks? PSO compile?)
```
A ~3 s main-thread stall during the floor batch (concurrent PBR upgrade `skipPbrUpgrade=false`).
Pre-existing perf class, not part of this audit's geometry focus.

## Priority + risk

| # | defect | root | risk to fix | verifiable now? |
|---|--------|------|-------------|-----------------|
| ① | non-mitered join / spike | editor `§POST-RESOLVE-PRESERVE` keeps a valid wall un-trimmed when the post-openings re-resolve diverges (resolver itself is correct) | HIGH (editor render coord; room-sealing + rebuild stability) | NO — browser-gated |
| ② | bathroom dropped | ① corrupts polygon | fixed by ① | — |
| ③ | floor bow-ties | ① corrupts polygon | fixed by ① (graceful today) | — |
| ⑤ | door↔furniture clash | keep-clear EXISTS (`doorObstacles`); only precision gap, blocked on hinge-side payload | MED (schema + 2 sites) | core done; wiring needs hinge data + browser |

**Recommendation:** ① is the keystone but lives in the high-revert wall-join subsystem — audit-only
here, fix in a dedicated browser-verified pass. ⑤ is the best low-risk win: a pure door-swing
keep-out helper (unit-tested now) + an additive furnish pre-filter, same pattern as §WALL-SETOUT.

## Staged upgrade (NOT yet wired) — ⑤ precise door-swing SECTOR core

`packages/ai-host/src/workflows/furnishLayout/doorSwingKeepout.ts` — pure L2 geometry:
`makeSwingSector` (hinge + latch dir + leaf width → quarter-disc sector), `pointInSwing`,
`rectIntersectsSwing` (corner-in-sector ∪ hinge-in-rect ∪ sampled-leaf-tips-in-rect),
`rejectFurnitureClashingDoors`. 9/9 unit tests, pure, zero imports, no span (matches the package's
pure-helper precedent; P8 boundary = AiPlane).

⚠ **This is the precise-SECTOR replacement for the existing conservative `doorObstacles` box, NOT a
new keep-out.** It is intentionally **un-wired**: the engine already keeps furniture out of a
`width × swingR` box on every path (§⑤ above). The sector only adds value once the door payload
carries the **hinge side** — then it covers the swing fan precisely AND avoids the documented +0.6 m
wardrobe-run regression that blocks simply widening the box. Wiring it before the hinge-side thread
would only duplicate the box. The honest fix sequence: (1) thread hinge side into `LayoutDoor` →
`FurnishRoomInput.doors`; (2) swap the box for `rectIntersectsSwing` in BOTH `doorObstacles` sites;
(3) browser-verify no wardrobe/sofa regression. Tracked, not shipped.
