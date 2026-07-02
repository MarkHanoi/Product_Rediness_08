# ADR-0100 — Plan-view door-in-wall symbol closes watertight onto the frame jambs (§FIX-PLAN-DOOR-JAMB-SEAM)

> Refines the plan-view projection / hosted-element plan symbol behaviour. Supersedes the jamb-tick
> placement introduced by §DOOR-WINDOW-PLAN-FRAME (2026-05-21) and the wall-line clip tolerance of
> §OPENING-OFFSET-LEFTEDGE-UNIFY (2026-06-24) at the seam. No `*-AUDIT.md` derivative created —
> canonical behaviour recorded here per governance.

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-02 |
| Owner | Plan projection + hosted-element plan symbols (`packages/geometry-door`, `apps/editor/src/engine/views/EdgeProjectorService.ts`) |
| Builds on | C15 (hosted-element offset/void model) · DOC-2.5a (door plan symbol injection) · Phase 6 window plan symbol |
| Governs | The 2D plan drawing of a wall with a door/window opening — the seam where the wall face lines meet the door/window frame jamb |
| Tags | §FIX-PLAN-DOOR-JAMB-SEAM |
| Contracts | P2 (no THREE outside renderer-three — the new helper imports `@pryzm/renderer-three/three`, same as its host builder) · P3 (no new rAF) · P6 (pure read; no store mutation) · 8-layer import rule respected (geometry-door stays L-low; EdgeProjectorService is L5 editor) |

## Context

Founder repro (production): in the 2D plan drawing, the two wall face lines (the wall's cut faces)
do **not** connect to the door frame/jamb — a visible gap sits between the wall line and the door
frame on **both** jambs. AEC convention requires the wall plan lines to break cleanly at the opening
and close onto the door frame jamb ticks — a proper door-in-wall plan symbol, watertight.

## Root cause

The seam is produced by two independent off-by-a-constant errors, on opposite sides of the void edge,
that compound at each jamb:

1. **Door frame ticks inset by `frameThick`.** `DoorPlanSymbolBuilder._computeSwingGeometry` drew the
   two frame-cut jamb ticks at `centre ∓ (halfWidth − frameThick)` along the wall — i.e. **inset by
   ~`frameThick` (≈ 50 mm)** from the opening void edges. (Introduced by §DOOR-WINDOW-PLAN-FRAME to
   render the "frame cut" symbol, but placed on the *leaf/frame reveal* line rather than the void
   edge.)

2. **Wall face lines clipped short of the jamb.** `EdgeProjectorService._suppressPlanViewOpeningLines`
   suppressed each along-wall face line over the zone `[offset − TOL, offset + width + TOL]` with
   `TOL = 0.035`, and **reconstructed the kept remainder terminating at `offset − TOL`** — i.e. the
   wall line stopped **35 mm short** of the void edge.

Per C15 §2 the opening void spans `[offset, offset + width]` along the wall
(`voidStart = baseLine[0] + offset·wallDir`, `voidEnd = baseLine[0] + (offset+width)·wallDir`); the
wall mesh is cut there, so the plan face lines must terminate exactly there and the frame jamb tick
must sit exactly there. The two errors put the wall-line terminus at `offset − 0.035` and the frame
tick at `offset + 0.05` → ~85 mm of empty space at each jamb.

Windows were **already correct**: `WindowPlanSymbolBuilder` draws its jamb edges at `edgeA/edgeB =
centre ∓ halfW`, i.e. on the void edges — so no window change is required.

## Decision

Make the wall face-line terminus, the opening void edge, and the frame jamb tick **one and the same
line** on both jambs. Invariant:

```
wall face-line terminus  ≡  opening void edge (offset / offset+width)  ≡  frame jamb tick
```

1. **Door frame ticks → void edges.** New pure exported helper
   `computeDoorFrameJambTicks({ centre, dir, leftNormal, halfWidth, halfThickness })` in
   `DoorPlanSymbolBuilder.ts` returns the two frame-cut ticks at `centre ∓ halfWidth`
   (= `offset` and `offset+width`), spanning the full wall thickness across the centreline. The
   builder delegates to it; the single source of truth is unit-tested. The door **leaf** still
   hinges from the inner frame corner (`halfWidth − frameThick`) — it sits inside the frame reveal —
   so leaf geometry is unchanged.

2. **Wall clip keeps a detection over-reach but snaps the kept edge to the void edge.** In
   `_suppressPlanViewOpeningLines`, `DETECT_TOL = 0.035` is used **only to decide** whether an
   along-wall line crosses the opening (so a projection-float sliver just inside the opening is still
   removed); the kept remainder is now reconstructed to terminate at the **true void edge**
   (`zone.min` / `zone.max`), not `zone.min − TOL`. The wall face line therefore runs all the way to
   the jamb where the frame tick closes it.

Reuse, not a parallel path: the fix lives in the existing plan-projection suppressor and the existing
door plan-symbol builder; windows keep their already-correct behaviour.

## Consequences

- Door-in-wall plan symbol is watertight on both jambs; the wall face lines close onto the frame
  jamb ticks with zero seam gap.
- No change to section/elevation (`_suppressWallOpeningSeams`), to 3D geometry, or to the wall
  footprint/join code.
- Regression test: `apps/editor/__tests__/DoorPlanJambSeam.test.ts` asserts the frame ticks land on
  the void edges (`offset`, `offset+width`) and coincide with the wall-line terminus within 1 mm.

## Follow-ups

- None required for windows (already on the void edge). If a future frame-reveal symbol is wanted
  *inside* the void, add it as an explicit reveal line — do not move the jamb tick off the void edge.
