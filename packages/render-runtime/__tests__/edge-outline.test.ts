// @pryzm/render-runtime — buildEdgeOutline + disposeEdgeOutline tests
// (Wave 13 zero-test drive — adds 2 tests to reach the ≥ 3 total target).

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { buildEdgeOutline, disposeEdgeOutline } from '../src/highlight.js';

describe('@pryzm/render-runtime — buildEdgeOutline', () => {
  it('returns a Line whose geometry has at least 2 positions', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const line = buildEdgeOutline(geometry);

    try {
      expect(line).toBeInstanceOf(THREE.LineSegments);
      const positions = line.geometry.getAttribute('position');
      expect(positions).toBeDefined();
      // A box has 12 edges × 2 points = 24 vertices in EdgesGeometry.
      expect(positions.count).toBeGreaterThanOrEqual(2);
    } finally {
      geometry.dispose();
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
  });

  it('disposeEdgeOutline disposes geometry and material without throwing', () => {
    const geometry = new THREE.BoxGeometry(2, 3, 0.2);
    const line = buildEdgeOutline(geometry);

    expect(() => disposeEdgeOutline(line)).not.toThrow();

    geometry.dispose(); // cleanup source geometry
  });
});
