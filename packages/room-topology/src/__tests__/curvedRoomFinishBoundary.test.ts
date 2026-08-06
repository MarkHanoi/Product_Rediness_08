import { describe, it, expect } from 'vitest';
import {
  deriveRoomFinishBoundary,
  polygonAreaM2,
  isSimple,
  type RoomFinishWall,
} from '../RoomPolygonUtils';
import type { RoomVertex } from '../RoomTypes';

/**
 * §FIX-CURVED-ROOM-FINISH-BOUNDARY (2026-08-06) — a room bounded by a CURVED wall must
 * derive a finish boundary that FOLLOWS the curve at the walls' inner faces.
 *
 * The founder's parity bug: a room enclosed by curved walls got a floor/ceiling finish
 * that failed to follow the curve, while the SLAB (which stores the traced tessellated
 * ring verbatim) hugged it perfectly. Root cause: `_wallForFinishEdge` matched each room
 * edge against the wall's 2-point `baseLine` — for a curved wall that is only the CHORD,
 * so the ring's tessellated arc edges matched erratically (a few chord-parallel edges
 * inset by t/2, the rest left at inset 0) → a sawtooth mixed-inset boundary and, in the
 * common deep-arc case, the whole arc left ON THE CENTRELINE (overshooting half the wall
 * thickness into the curved wall on every arc edge).
 *
 * The fix teaches the ONE canonical derivation about the wall's `curve` metadata (the
 * quadratic-Bézier arc of the canonical wall schema), sampling it EXACTLY as
 * RoomDetectionEngine does (`segments ?? 16`), so every arc edge of the room ring
 * coincides with a sampled chord and insets by the wall's half-thickness — identical
 * behaviour to a straight wall, per edge.
 */

// ── Fixture: 4 m × 3 m room whose RIGHT side is a Bézier arc bulging to x≈5.5 ──────────
const S = { x: 4, z: 0 };
const E = { x: 4, z: 3 };
const CTRL = { x: 7, z: 1.5 };
const SEGS = 16;
const THICKNESS = 0.2; // → 0.10 m inner-face inset

/** The same quadratic Bézier RoomDetectionEngine / PathResolver evaluate. */
function bez(t: number): RoomVertex {
  const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t;
  return { x: a * S.x + b * CTRL.x + d * E.x, z: a * S.z + b * CTRL.z + d * E.z };
}

/** Room ring exactly as room detection produces it: straight edges + tessellated arc. */
function curvedRing(): RoomVertex[] {
  const ring: RoomVertex[] = [{ x: 0, z: 0 }];
  for (let i = 0; i <= SEGS; i++) ring.push(bez(i / SEGS));
  ring.push({ x: 0, z: 3 });
  return ring;
}

const STRAIGHT_WALLS: RoomFinishWall[] = [
  { baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }], thickness: THICKNESS },
  { baseLine: [{ x: 4, z: 3 }, { x: 0, z: 3 }], thickness: THICKNESS },
  { baseLine: [{ x: 0, z: 3 }, { x: 0, z: 0 }], thickness: THICKNESS },
];

const CURVED_WALL: RoomFinishWall = {
  baseLine: [S, E],
  thickness: THICKNESS,
  curve: { control: CTRL, segments: SEGS },
};

/** Min distance from a point to the (finely sampled) source arc centreline. */
function distToArc(p: RoomVertex): number {
  let best = Infinity;
  for (let i = 0; i <= 512; i++) {
    const q = bez(i / 512);
    const d = Math.hypot(p.x - q.x, p.z - q.z);
    if (d < best) best = d;
  }
  return best;
}

describe('§FIX-CURVED-ROOM-FINISH-BOUNDARY — curve-aware inner-face derivation', () => {
  it('every arc edge insets to the inner face — the finish FOLLOWS the curve', () => {
    const out = deriveRoomFinishBoundary(curvedRing(), [...STRAIGHT_WALLS, CURVED_WALL]);
    expect(isSimple(out)).toBe(true);
    // The bulge region (x > 4.05) must sit a uniform half-thickness inside the arc.
    const bulge = out.filter(v => v.x > 4.05);
    expect(bulge.length).toBeGreaterThanOrEqual(SEGS - 3); // the curve is preserved, not chorded
    for (const v of bulge) {
      const d = distToArc(v);
      expect(d).toBeGreaterThan(0.09);  // pulled OFF the centreline…
      expect(d).toBeLessThan(0.11);     // …by exactly the half-thickness (miter tolerance)
    }
    // Straight walls still inset normally.
    expect(Math.min(...out.map(p => p.x))).toBeCloseTo(0.1, 2);
    expect(Math.min(...out.map(p => p.z))).toBeCloseTo(0.1, 2);
    expect(Math.max(...out.map(p => p.z))).toBeCloseTo(2.9, 2);
    // An inset never grows the finish.
    expect(polygonAreaM2(out)).toBeLessThan(polygonAreaM2(curvedRing()));
  });

  it('REGRESSION SHAPE — without curve metadata the arc stays on the centreline (the bug)', () => {
    // The pre-fix behaviour, pinned so the mechanism is documented: matching against the
    // CHORD leaves the deep-arc edges unmatched → inset 0 → the finish overshoots half the
    // wall thickness into the curved wall on every arc edge.
    const chordOnly: RoomFinishWall = { baseLine: [S, E], thickness: THICKNESS };
    const out = deriveRoomFinishBoundary(curvedRing(), [...STRAIGHT_WALLS, chordOnly]);
    const bulge = out.filter(v => v.x > 4.5); // deep-arc region, far from the chord
    expect(bulge.length).toBeGreaterThan(0);
    // At least one deep-arc vertex is left ON the centreline — the defect the fix removes.
    expect(Math.min(...bulge.map(distToArc))).toBeLessThan(0.05);
  });

  it('is deterministic — repeated calls yield identical output', () => {
    const a = deriveRoomFinishBoundary(curvedRing(), [...STRAIGHT_WALLS, CURVED_WALL]);
    const b = deriveRoomFinishBoundary(curvedRing(), [...STRAIGHT_WALLS, CURVED_WALL]);
    expect(a).toEqual(b);
  });

  it('a straight wall still matches via its single chord — existing behaviour untouched', () => {
    const rect: RoomVertex[] = [
      { x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 },
    ];
    const walls: RoomFinishWall[] = [
      { baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }], thickness: 0.2 },
      { baseLine: [{ x: 4, z: 0 }, { x: 4, z: 3 }], thickness: 0.2 },
      { baseLine: [{ x: 4, z: 3 }, { x: 0, z: 3 }], thickness: 0.2 },
      { baseLine: [{ x: 0, z: 3 }, { x: 0, z: 0 }], thickness: 0.2 },
    ];
    const inner = deriveRoomFinishBoundary(rect, walls);
    expect(inner).toHaveLength(4);
    expect(polygonAreaM2(inner)).toBeCloseTo(3.8 * 2.8, 6);
  });

  it('a DOOR on a curved wall is skipped (solid inner-face inset, no misplaced threshold)', () => {
    const curvedWithDoor: RoomFinishWall = {
      ...CURVED_WALL,
      openings: [{ type: 'door', offset: 2.0, width: 1.0 }],
    };
    const out = deriveRoomFinishBoundary(curvedRing(), [...STRAIGHT_WALLS, curvedWithDoor]);
    expect(isSimple(out)).toBe(true);
    // The arc still fully insets — the door does NOT drop any arc edge back to inset 0.
    for (const v of out.filter(p => p.x > 4.05)) {
      expect(distToArc(v)).toBeGreaterThan(0.09);
    }
  });

  it('degenerate curve metadata (non-finite control) degrades to the chord, never throws', () => {
    const bad: RoomFinishWall = {
      baseLine: [S, E], thickness: THICKNESS,
      curve: { control: { x: Number.NaN, z: Number.NaN }, segments: SEGS },
    };
    const out = deriveRoomFinishBoundary(curvedRing(), [...STRAIGHT_WALLS, bad]);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(isSimple(out)).toBe(true);
  });
});
