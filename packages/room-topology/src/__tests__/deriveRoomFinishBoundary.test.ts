import { describe, it, expect } from 'vitest';
import {
  deriveRoomFinishBoundary,
  resolveRoomFinishBoundary,
  ringsCoincide,
  polygonAreaM2,
  isSimple,
  type RoomFinishWall,
} from '../RoomPolygonUtils';
import type { RoomVertex } from '../RoomTypes';

/**
 * §FIX-FLOOR-FINISH-BOUNDARY-UI-VS-BATCH (L-213) · §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS
 * (L-240) — a room's floor finish must have ONE boundary derivation regardless of entry
 * point, which insets the centreline ring to the walls' INNER FACES.
 *
 * ⚠ THIS SUITE WAS TITLED "UI↔batch convergence" AND THAT FRAMING IS WHY L-213 REGRESSED.
 * It compared the only two paths that had ALREADY been converged, so it stayed green while
 * a THIRD path (the 3D FloorTool AUTO_FROM_ROOM branch) shipped the raw centreline. Two-way
 * convergence is a coincidence, not an invariant. The N-WAY, chokepoint-level convergence
 * test now lives in `apps/editor/__tests__/floorFinishInnerFaceAllPaths.test.ts`, where it
 * exercises the REAL `CreateFloorCommand` — the seam every creation path must pass through.
 *
 * What remains here is the GEOMETRY contract of the two shared helpers:
 *   1. The inner-face inset for a known room is exact + stable (no drift).
 *   2. Convergence — every caller feeding the same centreline + walls gets the same ring.
 *   3. Non-orthogonal / L-shaped rooms still derive a valid inner-face polygon.
 *   4. Fail-safe — no bounding walls → the centreline is returned unchanged.
 *   5. `resolveRoomFinishBoundary` — the ONE store-aware wall resolution (previously
 *      duplicated in the batch command and the plan tool).
 *   6. `ringsCoincide` — recognises a centreline ring, never an inset one (so the
 *      chokepoint can never inset a boundary twice).
 */
describe('deriveRoomFinishBoundary (all-paths inner-face convergence — L-213 · L-240)', () => {
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

  // ── §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS (L-240) — the shared store-aware resolver ──

  describe('resolveRoomFinishBoundary — the ONE store-aware wall resolution', () => {
    const lookup = {
      getRoomById: () => ({ boundingWallIds: ['w0', 'w1', 'w2', 'w3'] }),
      getWallById: (id: string) => rectWalls[Number(id.slice(1))],
      getWallsByLevel: () => rectWalls,
    };

    it('resolves the room\'s boundingWallIds and insets to the inner faces', () => {
      const inner = resolveRoomFinishBoundary(rect, { roomId: 'r1', levelId: 'L0', lookup });
      expect(polygonAreaM2(inner)).toBeCloseTo(3.8 * 2.8, 6);
      // Identical to calling the pure helper directly — one derivation, not two.
      expect(inner).toEqual(deriveRoomFinishBoundary(rect, rectWalls));
    });

    it('falls back to the level\'s walls when the room records no boundingWallIds', () => {
      const inner = resolveRoomFinishBoundary(rect, {
        roomId: 'r1', levelId: 'L0',
        lookup: { ...lookup, getRoomById: () => ({ boundingWallIds: [] }) },
      });
      expect(polygonAreaM2(inner)).toBeCloseTo(3.8 * 2.8, 6);
    });

    it('fail-safe — no store, no room, or no walls returns the centreline (a floor is ALWAYS made)', () => {
      expect(resolveRoomFinishBoundary(rect, { roomId: 'r1', levelId: 'L0', lookup: {} })).toEqual(rect);
      expect(resolveRoomFinishBoundary(rect, {
        roomId: 'r1', levelId: 'L0',
        lookup: { getRoomById: () => undefined, getWallsByLevel: () => [] },
      })).toEqual(rect);
      // A throwing store must not lose the floor.
      expect(resolveRoomFinishBoundary(rect, {
        roomId: 'r1', levelId: 'L0',
        lookup: { getRoomById: () => { throw new Error('store down'); } },
      })).toEqual(rect);
    });
  });

  describe('ringsCoincide — the chokepoint\'s "is this a centreline?" guard', () => {
    it('recognises the room centreline ring', () => {
      expect(ringsCoincide(rect.map(v => ({ ...v })), rect)).toBe(true);
    });

    it('NEVER matches an already-inset inner-face ring → a boundary can never be inset twice', () => {
      const inner = deriveRoomFinishBoundary(rect, rectWalls);
      expect(ringsCoincide(inner, rect)).toBe(false);
    });

    it('rejects mismatched / degenerate / missing rings', () => {
      expect(ringsCoincide(rect, rect.slice(0, 3))).toBe(false);
      expect(ringsCoincide(rect, undefined)).toBe(false);
      expect(ringsCoincide([{ x: 0, z: 0 }, { x: 1, z: 1 }], [{ x: 0, z: 0 }, { x: 1, z: 1 }])).toBe(false); // < 3 verts
    });
  });
});
