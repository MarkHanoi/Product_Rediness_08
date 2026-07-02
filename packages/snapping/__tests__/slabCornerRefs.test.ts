// @pryzm/snapping — §FEAT-SLAB-CORNER-REFS (ADR-0112) cross-level slab-corner
// reference provider.
//
// Covers (task L-31):
//   (b) a slab with known corners yields those corners as snap candidates for a
//       draw on that level, level-gated to the active draw level;
//   (c) a draw point near a slab corner snaps to that corner.
//
// Imports come from the provider/type SOURCE modules (not the package barrel)
// so this pure-geometry suite runs under vitest's `node` environment without
// pulling the barrel's DOM-requiring transitive import graph.

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { SlabSnapProvider } from '../src/providers/SlabSnapProvider.js';
import { SnapType } from '../src/types.js';

// A 6m × 4m rectangular slab on level "L1", positioned at origin.
const slabL1 = {
  id: 'slab-L1',
  levelId: 'L1',
  position: { x: 0, y: 0, z: 0 },
  polygon: [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 4 },
    { x: 0, y: 4 },
  ],
};
// A different slab on "L0" that must NOT leak into an L1 draw.
const slabL0 = {
  id: 'slab-L0',
  levelId: 'L0',
  position: { x: 100, y: 0, z: 100 },
  polygon: [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 5, y: 5 },
    { x: 0, y: 5 },
  ],
};
const store = { getAll: () => [slabL1, slabL0] };
const endpointTypes = new Set([SnapType.ENDPOINT]);

describe('SlabSnapProvider — cross-level slab-corner references', () => {
  it('(b) yields the slab corners as ENDPOINT candidates for the active level', () => {
    const provider = new SlabSnapProvider(store, () => 'L1');
    // Query from mid-slab with a huge radius so every L1 corner is in range.
    const cands = provider.getCandidates(new THREE.Vector3(3, 0, 2), 100, endpointTypes);
    const corners = cands
      .filter((c) => c.type === SnapType.ENDPOINT)
      .map((c) => `${c.point.x},${c.point.z}`);

    // All four L1 corners present…
    expect(corners).toContain('0,0');
    expect(corners).toContain('6,0');
    expect(corners).toContain('6,4');
    expect(corners).toContain('0,4');
    // …and NONE of the L0 slab's corners (level gate).
    expect(cands.some((c) => c.sourceId === 'slab-L0')).toBe(false);
    expect(cands.every((c) => c.metadata?.refType === 'slab-corner')).toBe(true);
  });

  it('(c) a draw point near a slab corner snaps to that corner within radius', () => {
    const provider = new SlabSnapProvider(store, () => 'L1');
    // Draw point ~8cm from the (6,0) corner, radius 0.5m.
    const near = new THREE.Vector3(6.05, 0, 0.06);
    const cands = provider.getCandidates(near, 0.5, endpointTypes);
    expect(cands.length).toBeGreaterThan(0);
    const best = cands.sort((a, b) => a.distance - b.distance)[0]!;
    expect(best.type).toBe(SnapType.ENDPOINT);
    expect(best.point.x).toBeCloseTo(6, 5);
    expect(best.point.z).toBeCloseTo(0, 5);
    expect(best.sourceId).toBe('slab-L1');
  });

  it('level gate scopes candidates to the active draw level (L0)', () => {
    const provider = new SlabSnapProvider(store, () => 'L0');
    const cands = provider.getCandidates(new THREE.Vector3(100, 0, 100), 50, endpointTypes);
    expect(cands.length).toBeGreaterThan(0);
    expect(cands.every((c) => c.sourceId === 'slab-L0')).toBe(true);
  });

  it('with no active-level accessor, all slabs contribute (backwards-compatible)', () => {
    const provider = new SlabSnapProvider(store);
    const cands = provider.getCandidates(new THREE.Vector3(3, 0, 2), 500, endpointTypes);
    const ids = new Set(cands.map((c) => c.sourceId));
    expect(ids.has('slab-L1')).toBe(true);
    expect(ids.has('slab-L0')).toBe(true);
  });

  it('exposes edge nearest-points (EDGE) and edge midpoints (MIDPOINT) when enabled', () => {
    const provider = new SlabSnapProvider(store, () => 'L1');
    const types = new Set([SnapType.EDGE, SnapType.MIDPOINT]);
    // Query near the middle of the bottom edge (z=0), between corners.
    const cands = provider.getCandidates(new THREE.Vector3(3, 0, 0.1), 0.5, types);
    expect(cands.some((c) => c.type === SnapType.EDGE)).toBe(true);
    expect(cands.some((c) => c.type === SnapType.MIDPOINT)).toBe(true);
  });
});
