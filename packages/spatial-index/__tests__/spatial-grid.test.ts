// @pryzm/spatial-index — SpatialGrid contract tests (Wave 13 zero-test drive).
//
// Covers:
//   1. insert + query: items inserted at known bounds are found in a query.
//   2. remove: removing an item makes it invisible to subsequent queries.
//   3. queryRadius + clear: radius query and clear leave an empty grid.

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { SpatialGrid } from '../src/SpatialGrid.js';

describe('@pryzm/spatial-index — SpatialGrid insert + query', () => {
  it('returns an item whose bounds intersect the query box', () => {
    const grid = new SpatialGrid<string>(1.0);

    const bounds = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 1, 1),
    );
    grid.insert('wall-1', bounds);
    expect(grid.size).toBe(1);

    const queryBox = new THREE.Box3(
      new THREE.Vector3(0.5, 0, 0.5),
      new THREE.Vector3(1.5, 1, 1.5),
    );
    const results = grid.query(queryBox);
    expect(results).toContain('wall-1');
  });

  it('does NOT return an item whose bounds do not overlap the query box', () => {
    const grid = new SpatialGrid<string>(1.0);

    grid.insert('wall-far', new THREE.Box3(
      new THREE.Vector3(100, 0, 100),
      new THREE.Vector3(101, 3, 101),
    ));

    const nearQuery = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 3, 1),
    );
    const results = grid.query(nearQuery);
    expect(results).not.toContain('wall-far');
  });
});

describe('@pryzm/spatial-index — SpatialGrid remove', () => {
  it('remove() returns true for a present item and makes it invisible to queries', () => {
    const grid = new SpatialGrid<string>(1.0);

    const bounds = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 3, 0.3),
    );
    grid.insert('door-1', bounds);
    expect(grid.size).toBe(1);

    const removed = grid.remove('door-1');
    expect(removed).toBe(true);
    expect(grid.size).toBe(0);

    const results = grid.query(bounds);
    expect(results).not.toContain('door-1');
  });

  it('remove() returns false for an item that was never inserted', () => {
    const grid = new SpatialGrid<string>(1.0);
    expect(grid.remove('ghost-element')).toBe(false);
  });
});

describe('@pryzm/spatial-index — SpatialGrid queryRadius + clear', () => {
  it('queryRadius finds items within the specified radius', () => {
    const grid = new SpatialGrid<string>(1.0);

    grid.insert('near', new THREE.Box3(
      new THREE.Vector3(1, 0, 1),
      new THREE.Vector3(2, 3, 2),
    ));
    grid.insert('far', new THREE.Box3(
      new THREE.Vector3(50, 0, 50),
      new THREE.Vector3(51, 3, 51),
    ));

    const center = new THREE.Vector3(1.5, 1.5, 1.5);
    const results = grid.queryRadius(center, 5);
    expect(results).toContain('near');
    expect(results).not.toContain('far');
  });

  it('clear() empties the grid', () => {
    const grid = new SpatialGrid<string>(1.0);
    grid.insert('a', new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)));
    grid.insert('b', new THREE.Box3(new THREE.Vector3(2, 0, 2), new THREE.Vector3(3, 1, 3)));
    expect(grid.size).toBe(2);

    grid.clear();
    expect(grid.size).toBe(0);
    expect(grid.query(new THREE.Box3(new THREE.Vector3(-100, -100, -100), new THREE.Vector3(100, 100, 100)))).toHaveLength(0);
  });
});
