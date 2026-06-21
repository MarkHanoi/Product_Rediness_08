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

**Fix direction (HIGH-RISK subsystem — needs full wall suite + browser):** when the re-resolve
predicts a collapse to < ~150 mm, the wall is degenerate at this junction — it should be **flagged
invalid and excluded from the mesh + the room-boundary polygon** (the [[walljoinresolver-multi-cluster-bug]]
recommendation), NOT preserved as a rendered stub. Better still, prevent the carve from minting a
< min-wall-length partition arm at a cluster (upstream). Do NOT blind-edit `WallJoinResolver` /
`WallRebuildCoordinator` — this is the documented high-revert subsystem.

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

## ⑤ Doors clashing with furniture — SEPARATE gap (no log; from screenshots)

The kitchen/dining table + chairs sit inside a door's swing; the furnish engine places furniture
against the room polygon but does **not** subtract the **door swing arcs** (or a door-leaf clearance
zone) from the placeable area. There is no `§DIAG` for it because the furnish + door engines don't
cross-check. **Fix direction:** before furnishing, build a keep-out set = each door's swing sector
(centre = hinge, radius = leaf width, ±90°) and exclude furniture footprints that intersect it.
This is a pure geometry pre-filter (unit-testable) feeding the existing furnish placement — a
good low-risk core + additive wiring, mirroring the §WALL-SETOUT split.

## ⑥ Perf (minor, noted not actioned)

```
§WARN DEFERRED-RESUME-FLUSH delayed 3053ms — main thread blocked (PBR chunks? PSO compile?)
```
A ~3 s main-thread stall during the floor batch (concurrent PBR upgrade `skipPbrUpgrade=false`).
Pre-existing perf class, not part of this audit's geometry focus.

## Priority + risk

| # | defect | root | risk to fix | verifiable now? |
|---|--------|------|-------------|-----------------|
| ① | non-mitered join / spike | degenerate <150 mm partition stub preserved | HIGH (WallJoinResolver) | partial (pure degeneracy guard testable) |
| ② | bathroom dropped | ① corrupts polygon | fixed by ① | — |
| ③ | floor bow-ties | ① corrupts polygon | fixed by ① (graceful today) | — |
| ⑤ | door↔furniture clash | furnish ignores swing arcs | LOW-MED (additive pre-filter) | YES (pure swing-keepout helper) |

**Recommendation:** ① is the keystone but lives in the high-revert wall-join subsystem — audit-only
here, fix in a dedicated browser-verified pass. ⑤ is the best low-risk win: a pure door-swing
keep-out helper (unit-tested now) + an additive furnish pre-filter, same pattern as §WALL-SETOUT.

## Fix landed (foundation) — ⑤ pure door-swing keep-out core

`packages/ai-host/src/workflows/furnishLayout/doorSwingKeepout.ts` — pure L2 geometry:
`makeSwingSector` (hinge + latch dir + leaf width → quarter-disc sector), `pointInSwing`,
`rectIntersectsSwing` (conservative: corner-in-sector ∪ hinge-in-rect ∪ sampled-leaf-tips-in-rect),
and `rejectFurnitureClashingDoors(items, swings)` (order-preserving filter). 9/9 unit tests, no
browser. Soundness: pure, zero imports, no THREE/DOM/IO; no span (matches the package's pure-helper
precedent — `validators/dimensional/*`; P8 boundary is the AiPlane). **Remaining (browser-verified
follow-up):** wire it into the furnish placement pass — build the per-door `SwingSector[]` from the
level's doors (hinge + leaf width + open side) and pre-filter candidate footprints before commit.
Additive + read-through; worst case it over-excludes a doorway zone, never blocks furnishing.
