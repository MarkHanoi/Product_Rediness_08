import { describe, it, expect } from 'vitest';
import {
  deriveRoomFinishBoundary,
  polygonAreaM2,
  isSimple,
  type RoomFinishWall,
} from '../RoomPolygonUtils';
import type { RoomVertex } from '../RoomTypes';

/**
 * §FIX-FLOOR-FINISH-BOUNDARY-UI-VS-BATCH (L-213) — a room's floor finish must have ONE
 * boundary derivation regardless of entry point (batch generators OR the interactive
 * floor tool AUTO mode). Both now call this single canonical helper, which insets the
 * centreline ring to the walls' INNER FACES. These tests pin:
 *   1. Convergence — a "UI"-derived and a "batch"-derived finish for the SAME room are
 *      byte-identical (the whole point of L-213).
 *   2. Regression guard — the inner-face polygon for a known room is exact + stable
 *      (batch behaviour must not drift after the extraction).
 *   3. Non-orthogonal / L-shaped rooms still derive a valid inner-face polygon.
 *   4. Fail-safe — no bounding walls → the centreline is returned unchanged.
 */
describe('deriveRoomFinishBoundary (L-213 UI↔batch convergence)', () => {
  // A 4 m × 3 m room, centreline ring CCW in world X-Z.
  const rect: RoomVertex[] = [
    { x: 0, z: 0 },
    { x: 4, z: 0 },
    { x: 4, z: 3 },
    { x: 0, z: 3 },
  ];

  // Four 0.20 m walls, one per edge (baseLine = the edge centreline). Inset = 0.10 m.
  const rectWalls: RoomFinishWall[] = [
    { baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }], thickness: 0.2 },
    { baseLine: [{ x: 4, z: 0 }, { x: 4, z: 3 }], thickness: 0.2 },
    { baseLine: [{ x: 4, z: 3 }, { x: 0, z: 3 }], thickness: 0.2 },
    { baseLine: [{ x: 0, z: 3 }, { x: 0, z: 0 }], thickness: 0.2 },
  ];

  it('insets the centreline ring to the inner wall faces (0.20 m wall → 0.10 m inset)', () => {
    const inner = deriveRoomFinishBoundary(rect, rectWalls);
    // Expected inner rect: x ∈ [0.1, 3.9], z ∈ [0.1, 2.9] — 3.8 × 2.8.
    expect(inner).toHaveLength(4);
    expect(inner[0]!.x).toBeCloseTo(0.1, 6);
    expect(inner[0]!.z).toBeCloseTo(0.1, 6);
    expect(inner[1]!.x).toBeCloseTo(3.9, 6);
    expect(inner[1]!.z).toBeCloseTo(0.1, 6);
    expect(inner[2]!.x).toBeCloseTo(3.9, 6);
    expect(inner[2]!.z).toBeCloseTo(2.9, 6);
    expect(inner[3]!.x).toBeCloseTo(0.1, 6);
    expect(inner[3]!.z).toBeCloseTo(2.9, 6);
    expect(polygonAreaM2(inner)).toBeCloseTo(3.8 * 2.8, 6);
  });

  it('CONVERGENCE — the UI path and the batch path produce an identical polygon + area', () => {
    // Both callers pass the SAME centreline (room.boundary.polygon) + the SAME wall set;
    // the only difference is where the walls are resolved (store vs window). Simulate
    // both callers by invoking the shared helper with equivalent inputs.
    const batchCentreline = rect.map(v => ({ x: v.x, z: v.z }));
    const uiCentreline = rect.map(v => ({ x: v.x, z: v.z }));
    const batchPoly = deriveRoomFinishBoundary(batchCentreline, rectWalls);
    const uiPoly = deriveRoomFinishBoundary(uiCentreline, rectWalls);
    expect(uiPoly).toEqual(batchPoly);
    expect(polygonAreaM2(uiPoly)).toBeCloseTo(polygonAreaM2(batchPoly), 12);
    // And it is genuinely the inner face — NOT the centreline overshoot.
    expect(polygonAreaM2(uiPoly)).toBeLessThan(polygonAreaM2(rect));
  });

  it('is deterministic — repeated calls yield byte-identical output', () => {
    const a = deriveRoomFinishBoundary(rect.map(v => ({ ...v })), rectWalls);
    const b = deriveRoomFinishBoundary(rect.map(v => ({ ...v })), rectWalls);
    expect(a).toEqual(b);
  });

  it('never grows the floor — inner-face area ≤ centreline area', () => {
    const inner = deriveRoomFinishBoundary(rect, rectWalls);
    expect(polygonAreaM2(inner)).toBeLessThanOrEqual(polygonAreaM2(rect) + 1e-9);
  });

  it('handles a wall carrying a door opening (finish stays a valid simple ring)', () => {
    // A 1.0 m door centred at 2.0 m along the bottom wall.
    const wallsWithDoor: RoomFinishWall[] = [
      { baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }], thickness: 0.2,
        openings: [{ type: 'door', offset: 2.0, width: 1.0 }] },
      ...rectWalls.slice(1),
    ];
    const inner = deriveRoomFinishBoundary(rect, wallsWithDoor);
    expect(inner.length).toBeGreaterThanOrEqual(3);
    expect(isSimple(inner)).toBe(true);
    // Still an inner-face inset (never larger than the centreline).
    expect(polygonAreaM2(inner)).toBeLessThanOrEqual(polygonAreaM2(rect) + 1e-9);
  });

  it('non-orthogonal / L-shaped room → valid inner-face polygon, strictly smaller', () => {
    // An L (6×5 with a 3×3 notch removed), centreline ring CCW.
    const lRoom: RoomVertex[] = [
      { x: 0, z: 0 },
      { x: 6, z: 0 },
      { x: 6, z: 2 },
      { x: 3, z: 2 },
      { x: 3, z: 5 },
      { x: 0, z: 5 },
    ];
    const lWalls: RoomFinishWall[] = [
      { baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }], thickness: 0.2 },
      { baseLine: [{ x: 6, z: 0 }, { x: 6, z: 2 }], thickness: 0.2 },
      { baseLine: [{ x: 6, z: 2 }, { x: 3, z: 2 }], thickness: 0.2 },
      { baseLine: [{ x: 3, z: 2 }, { x: 3, z: 5 }], thickness: 0.2 },
      { baseLine: [{ x: 3, z: 5 }, { x: 0, z: 5 }], thickness: 0.2 },
      { baseLine: [{ x: 0, z: 5 }, { x: 0, z: 0 }], thickness: 0.2 },
    ];
    const inner = deriveRoomFinishBoundary(lRoom, lWalls);
    expect(isSimple(inner)).toBe(true);
    expect(polygonAreaM2(inner)).toBeGreaterThan(0);
    expect(polygonAreaM2(inner)).toBeLessThan(polygonAreaM2(lRoom));
    // A ~0.1 m inset trims only a few % of area — must stay well above the 50% floor.
    expect(polygonAreaM2(inner)).toBeGreaterThan(0.5 * polygonAreaM2(lRoom));
  });

  it('fail-safe — no bounding walls returns the centreline polygon unchanged', () => {
    // The callers themselves short-circuit on an empty wall set, but the helper is also
    // robust: with no wall matching any edge, every inset is 0 → centreline is returned.
    const inner = deriveRoomFinishBoundary(rect, []);
    expect(inner).toEqual(rect);
  });
});
