import { describe, it, expect } from 'vitest';
import { insetPolygonToInnerFaces, polygonAreaM2 } from '../RoomPolygonUtils';
import type { RoomVertex } from '../RoomTypes';

/**
 * §FLOOR-INNER-FACE — the floor finish must stop at the room's INNER wall faces,
 * not span to the wall centrelines (which overlaps the neighbour under the
 * partition). insetPolygonToInnerFaces offsets each edge inward by the bounding
 * wall's half-thickness, mitering at corners.
 */
describe('insetPolygonToInnerFaces', () => {
  // A 4 m × 3 m room (centreline rect), CCW in world X-Z.
  const rect: RoomVertex[] = [
    { x: 0, z: 0 },
    { x: 4, z: 0 },
    { x: 4, z: 3 },
    { x: 0, z: 3 },
  ];

  it('insets all edges by half-thickness → inner rect shrinks by 2×inset on each axis', () => {
    // 0.10 m walls all round → inset 0.05 m per edge.
    const inner = insetPolygonToInnerFaces(rect, [0.05, 0.05, 0.05, 0.05]);
    // Expect a 3.9 × 2.9 rect: x ∈ [0.05, 3.95], z ∈ [0.05, 2.95].
    const xs = inner.map(v => v.x).sort((a, b) => a - b);
    const zs = inner.map(v => v.z).sort((a, b) => a - b);
    expect(xs[0]!).toBeCloseTo(0.05, 6);
    expect(xs[3]!).toBeCloseTo(3.95, 6);
    expect(zs[0]!).toBeCloseTo(0.05, 6);
    expect(zs[3]!).toBeCloseTo(2.95, 6);
    expect(polygonAreaM2(inner)).toBeCloseTo(3.9 * 2.9, 4);
  });

  it('keeps an edge on the centreline where its inset is 0 (door-gap → floors meet)', () => {
    // Edge 0 (z=0, the bottom wall) carries a door → inset 0; others inset 0.05.
    const inner = insetPolygonToInnerFaces(rect, [0, 0.05, 0.05, 0.05]);
    // The bottom edge must remain at z = 0 (reaches the centreline / threshold).
    const minZ = Math.min(...inner.map(v => v.z));
    expect(minZ).toBeCloseTo(0, 6);
    // The opposite (top) edge is still pulled in to z = 2.95.
    const maxZ = Math.max(...inner.map(v => v.z));
    expect(maxZ).toBeCloseTo(2.95, 6);
  });

  it('mixes per-edge thicknesses (thicker wall → larger inset on that edge)', () => {
    // Bottom edge backs a 0.30 m wall (inset 0.15); others 0.10 m (inset 0.05).
    const inner = insetPolygonToInnerFaces(rect, [0.15, 0.05, 0.05, 0.05]);
    const minZ = Math.min(...inner.map(v => v.z));
    expect(minZ).toBeCloseTo(0.15, 6);
  });

  it('fail-safe: a too-large inset that collapses the polygon returns the original', () => {
    // Inset 5 m on a 3 m-deep room → would invert; util returns the input ref.
    const inner = insetPolygonToInnerFaces(rect, [5, 5, 5, 5]);
    expect(inner).toBe(rect);
  });

  it('returns the input unchanged for a degenerate (<3 vertex) polygon', () => {
    const two: RoomVertex[] = [{ x: 0, z: 0 }, { x: 1, z: 0 }];
    expect(insetPolygonToInnerFaces(two, [0.05, 0.05])).toBe(two);
  });

  it('treats missing / NaN edge insets as 0', () => {
    const inner = insetPolygonToInnerFaces(rect, [0.05, NaN, 0.05, 0.05]);
    // Edge 1 (x = 4) had NaN → inset 0, so the right edge stays at x = 4.
    const maxX = Math.max(...inner.map(v => v.x));
    expect(maxX).toBeCloseTo(4, 6);
  });
});
