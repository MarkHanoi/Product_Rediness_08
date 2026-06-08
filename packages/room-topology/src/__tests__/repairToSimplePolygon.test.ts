// §A.21.D58 — room-boundary self-intersection repair tests.
//
// The planar face-tracer (PlanarTopologyEngine) can emit a SELF-INTERSECTING
// ring on the upper (central-stair) storey of a generated house. The live root
// is a PROPER CROSSING: two non-adjacent boundary edges of the SAME traced face
// geometrically cross because a wall crossing on the dense upper floor was not
// split into a shared graph node, so the minimal-face walk threads an edge across
// another edge of its own boundary (a bow-tie / loop). Pinch (figure-8 at a
// shared node) and spur (collinear dangling dead-end) are related degeneracies.
//
// Any of these makes RoomStore's `isSimple()` Zod gate reject the room
// ("Room boundary polygon must not self-intersect") and the room is silently
// dropped. `repairToSimplePolygon` must produce a SIMPLE polygon that passes the
// same gate, without changing which room exists.

import { describe, it, expect } from 'vitest';
import { isSimple, polygonAreaM2, repairToSimplePolygon } from '../RoomPolygonUtils';
import type { RoomVertex } from '../RoomTypes';

// Mirror the production Zod refinements (RoomDataSchema.RoomBoundarySchema) so
// the test proves the repaired polygon would actually pass RoomStore's gate.
function passesRoomStoreGate(poly: RoomVertex[] | null): boolean {
  if (!poly) return false;
  if (poly.length < 3) return false;
  const area = Math.abs(polygonAreaM2(poly));
  if (!(area >= 0.01)) return false;
  return isSimple(poly);
}

describe('repairToSimplePolygon — §A.21.D58 self-intersection repair', () => {
  it('passes a simple polygon straight through (ground floor unaffected)', () => {
    // A plain 4 m × 3 m rectangle — exactly what a clean ground-floor room is.
    const square: RoomVertex[] = [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 3 },
      { x: 0, z: 3 },
    ];
    expect(isSimple(square)).toBe(true);
    const repaired = repairToSimplePolygon(square);
    expect(passesRoomStoreGate(repaired)).toBe(true);
    expect(polygonAreaM2(repaired!)).toBeCloseTo(12, 6);
  });

  it('repairs a PROPER CROSSING (bow-tie) — the live RoomStore-rejecting case', () => {
    // Classic bow-tie quad: edges (4,0)->(0,3) and (0,3)->... cross. This is the
    // exact shape RoomStore's isSimple() refinement rejects ("must not
    // self-intersect"). Two triangular loops of equal area meet at the crossing.
    const bowtie: RoomVertex[] = [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 0, z: 3 },
      { x: 4, z: 3 },
    ];
    expect(isSimple(bowtie)).toBe(false); // confirms the bug precondition (gate rejects)

    const repaired = repairToSimplePolygon(bowtie);
    expect(repaired).not.toBeNull();
    expect(passesRoomStoreGate(repaired)).toBe(true);
  });

  it('repairs a CROSSING with unequal loops — keeps the LARGER loop', () => {
    // A large rectangle whose boundary loops back through itself, threading a
    // small triangular pocket. The big loop (area ~ 24) must survive; the small
    // pocket is the excised crossing loop. Models the stair-void bridge crossing.
    const crossing: RoomVertex[] = [
      { x: 0, z: 0 },
      { x: 6, z: 0 },
      { x: 6, z: 4 },
      { x: 3, z: 4 },
      { x: 3, z: -1 }, // shoots back DOWN past z=0, crossing the bottom edge
      { x: 0, z: 4 },
    ];
    expect(isSimple(crossing)).toBe(false);

    const repaired = repairToSimplePolygon(crossing);
    expect(repaired).not.toBeNull();
    expect(passesRoomStoreGate(repaired)).toBe(true);
    // The retained ring is the dominant (largest) simple component.
    expect(polygonAreaM2(repaired!)).toBeGreaterThan(10);
  });

  it('cleans a SPUR — a collinear dangling-edge dead-end (A→B→A)', () => {
    // 4×3 room with a partition stub poking IN from the right wall to (2,1.5)
    // and straight back out — the n===1 half-edge "out-and-back" the tracer emits
    // for a dangling / §WJR-INVALID edge. The repair strips the spur, leaving the
    // clean rectangle.
    const withSpur: RoomVertex[] = [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 1.5 },
      { x: 2, z: 1.5 }, // spur tip (into the room)
      { x: 4, z: 1.5 }, // back to the wall — duplicate of two-before
      { x: 4, z: 3 },
      { x: 0, z: 3 },
    ];
    const repaired = repairToSimplePolygon(withSpur);
    expect(repaired).not.toBeNull();
    expect(passesRoomStoreGate(repaired)).toBe(true);
    expect(polygonAreaM2(repaired!)).toBeCloseTo(12, 6);
  });

  it('decomposes a PINCH / figure-8 — two loops joined at one node', () => {
    // The central-stair case: a big outer loop and a smaller loop share one pinch
    // node (5,0); the ring visits (5,0) twice. Keep the LARGEST simple ring.
    // Big loop area = 20, small appendage area = 6.
    const figureEight: RoomVertex[] = [
      { x: 0, z: 0 },
      { x: 5, z: 0 }, // pinch (first visit)
      { x: 8, z: 0 },
      { x: 8, z: 2 },
      { x: 5, z: 2 },
      { x: 5, z: 0 }, // pinch (second visit)
      { x: 5, z: 4 },
      { x: 0, z: 4 },
    ];
    const repaired = repairToSimplePolygon(figureEight);
    expect(repaired).not.toBeNull();
    expect(passesRoomStoreGate(repaired)).toBe(true);
    expect(polygonAreaM2(repaired!)).toBeCloseTo(20, 6);
  });

  it('returns null for an irreparable degenerate ring', () => {
    const degenerate: RoomVertex[] = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 0, z: 0 },
    ];
    expect(repairToSimplePolygon(degenerate)).toBeNull();
  });
});
