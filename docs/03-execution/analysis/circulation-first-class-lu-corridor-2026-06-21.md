# Circulation as first-class: L/U-shaped corridors (2026-06-21)

**Founder directive (live, critical):** the generated FIRST FLOOR ships a **Corridor with no door
to most of the floor** — Bedrooms 1/2/3 + Bathroom 1 don't connect to it. Circulation must be
**first-class** in the graph/algorithm: every habitable room reaches the corridor, and the corridor
may bend into a **sound L or U** (not only a straight strip) **without clashing with walls / rooms /
doors**. Founder sketch: extend the corridor along the top into an **L** (green) + add doors (blue)
into Bedroom 2, Bedroom 3, Bathroom 1, and the stair.

## Log evidence (the smoking gun)

```
§EVERY-ROOM-ACCESS-COMB fell back to squarify privateRooms=2 faceAxis=z (comb infeasible — floors/depth too tight)
§DIAG-CORRIDOR-QUALITY … directAccess=0/3 servedThrough=3 access=0.00 ⚠      (z-fwd-id, a sealed candidate)
§DIAG-ADJACENCY r5(bedroom) → NO DOOR ✗                                       (bedroom sealed)
§DIAG-CORRIDOR-CONTIGUITY-SUMMARY … selected=NO with contiguous=0 ⇒ the carve/orientation must place
   the corridor against the entrance hall, the gate alone cannot
```
The winner that *does* ship (`z-rev-mir`) only reaches all rooms because `§STAIR-SPANNING-CORRIDOR`
rescued the GROUND floor. The UPPER floor (4 bed / 2 bath) has too many rooms for one straight
corridor run, the comb bails, squarify buries the back rooms, and they end up corridor-less.

## Root — pinned to line (`tgl/subdivide.ts`)

The comb carve `sliceZoneAlongFace` (863–930) lays every private room as a **full-depth strip off ONE
straight corridor face**. It returns `null` (→ squarify fallback, which does NOT guarantee corridor
adjacency) on any of:

| line | guard | meaning |
|------|-------|---------|
| 893 | `depth > MAX_COMB_DEPTH_M` (~7 m) | deep zone → a full-depth slice over-sizes small rooms |
| 902 | `floorSum > along` | the rooms' min widths exceed the single corridor run → **the 4-bed case** |
| 907 | `depth < maxFloor` | depth too shallow → tunnels |

When it bails, `squarify` tiles the zone by area with **no corridor-adjacency guarantee** → back-row
rooms (Bedroom 1/2/3, Bathroom 1) sit behind front rooms, off the corridor → sealed / served-through.
**This is the ADR-0068 INV-3 "corridor-from-graph" gap: circulation is a downstream consequence of
the carve, not a first-class driver.**

## The fix — an L-comb, built on infra that ALREADY EXISTS

The polygon plumbing for a non-straight corridor is **already present** and used by the spanning
rescue: `legUnionLRing` (2500), `rectUnionRing` (2659), `polyRectSharedWallM` (3834, polygon↔rect
shared-wall for door eligibility), `cellAreaM2` (shoelace), and `SubdivideResult.cellPolygonById`
(the corridor can already be an L/U polygon). The corridor data model is NOT the blocker.

**The blocker is the carve decision.** Add an **L-comb** path that fires *before* the squarify
fallback: when a single straight comb is infeasible (902 / 893), split the private rooms into TWO
contiguous legs laid along **perpendicular** faces of an L-corridor, doubling the corridor run so all
rooms keep a corridor-adjacent wall.

### Shape (per the founder's L sketch)
```
   ┌─────────── leg-A rooms (off the top corridor leg) ───────────┐
   │  Bed1   Bed2   Bed3   Bath1                                   │
   ├───── corridor leg A (horizontal) ─────┐                       │
   │ leg-B    │ corridor leg B (vertical)  │   (L inner corner)    │
   │ rooms    │                            │                       │
   └──────────┴────────────────────────────┘
```
- Corridor = `rectUnionRing([legA, legB])` → an L polygon in `cellPolygonById[corridorId]`.
- Each room is a straight slice off whichever leg it hangs from (reuse `sliceZoneAlongFace` per leg
  sub-rect → no new slice maths, just two calls).
- **Feasible iff** BOTH legs are feasible combs (each passes 893/902/907 on its sub-run) AND the two
  room bands + the L tile the zone with no overlap AND every room clears its floor.

### Why this is architecturally sound + non-regressing
- **Additive / opt-in:** the L-comb is only attempted when the straight comb returns `null` today
  (the squarify fallback). When the L-comb is itself infeasible it returns `null` and the code falls
  to squarify exactly as now → **byte-identical** on every plate that doesn't take the new branch
  (ADR-0061 I2). It can only CONVERT today's squarify-buried-rooms case into a corridor-served one.
- **Reuses proven helpers:** `sliceZoneAlongFace` (per leg), `rectUnionRing` (the L polygon),
  `polyRectSharedWallM` (door eligibility already understands polygon corridors) — no new geometry
  primitives, no new corridor data model.
- **No wall/room/door clash:** the two legs are axis-aligned sub-rects of the zone and the room
  bands tile the remainder; the L ring is a simple rectilinear polygon (the existing shoelace +
  `polyRectSharedWallM` already handle it). The door pass places one door per room onto its leg.
- **U is the natural extension:** three legs via `rectUnionRing([legA, legB, legC])` once the L lands.

### Insertion points (exact)
1. New pure helper `trySliceZoneAlongLFace(zone, rooms, primaryAxis, minAlongFor?)` next to
   `sliceZoneAlongFace` — partitions rooms into two legs, calls `sliceZoneAlongFace` per leg sub-rect,
   returns `{ placements, corridorPolygon, droppedRooms }` or `null`.
2. At each `sliceZoneAlongFace(...) ?? squarify(...)` call site, insert
   `?? trySliceZoneAlongLFace(...)` BEFORE the squarify fallback.
3. Thread the returned `corridorPolygon` into `cellPolygonById[corridorId]` (the field already exists).

### Test plan (pure, no browser)
- New `tglLCorridor.test.ts`: a deep/narrow private zone with N rooms that fails the straight comb
  (902) → assert the L-comb returns all N rooms each with a corridor-adjacent wall
  (`polyRectSharedWallM(corridorPolygon, roomRect) ≥ doorWidth`), zero drops, no overlaps, L polygon
  is simple.
- Regression: the existing `tglSubdivide.test.ts` §NO-PUBLIC-CARVE + `tglCorridorPhysiognomy` +
  the full `house*.test.ts` suite stay green (the L path doesn't fire on their plates).

## Priority
This is THE circulation keystone and it lives in the **testable ai-host engine** (not the editor
render layer). It is the highest-value sound work available and directly answers the founder's
"prioritise circulation / allow L and U corridors". Implement test-first; gate the merge on the full
`house*.test.ts` + `tglSubdivide` suites green, then browser-verify the 4-bed upper floor.
