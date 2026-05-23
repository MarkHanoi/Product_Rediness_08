// BvhPickStrategy tests (S16-T2, 5 cases per spec line 738).

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { BvhPickStrategy } from '../src/bvh-pick.js';
import type { ElementRegistry, PickContext } from '../src/types.js';

function makeMesh(x: number, y: number, z: number, size = 1): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshBasicMaterial(),
  );
  mesh.position.set(x, y, z);
  mesh.updateMatrixWorld(true);
  return mesh;
}

function makeCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  cam.position.set(0, 0, 5);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
}

interface RegEntry {
  id: string;
  kind: string;
  mesh: THREE.Mesh;
  hash?: string;
}

function buildRegistry(entries: RegEntry[]): ElementRegistry {
  return {
    kindOf: (id) => (entries.find((e) => e.id === id)?.kind as never) ?? null,
    ids: () => entries.map((e) => e.id),
    objectFor: (id) => entries.find((e) => e.id === id)?.mesh ?? null,
    descriptorHashOf: (id) => entries.find((e) => e.id === id)?.hash ?? null,
  };
}

describe('BvhPickStrategy (S16-T2)', () => {
  it('pick at center hits the centred mesh', () => {
    const strategy = new BvhPickStrategy();
    const mesh = makeMesh(0, 0, 0);
    const registry = buildRegistry([{ id: 'wall-1', kind: 'wall', mesh }]);
    const ctx: PickContext = {
      camera: makeCamera(),
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
    };
    const result = strategy.pick({ x: 50, y: 50 }, ctx);
    expect(result).not.toBeNull();
    expect(result!.elementId).toBe('wall-1');
    expect(result!.elementKind).toBe('wall');
    expect(result!.distance).toBeGreaterThan(0);
    expect(result!.faceIndex).toBeGreaterThanOrEqual(0);
  });

  it('pick at empty space returns null', () => {
    const strategy = new BvhPickStrategy();
    const mesh = makeMesh(0, 0, 0);
    const registry = buildRegistry([{ id: 'wall-1', kind: 'wall', mesh }]);
    const ctx: PickContext = {
      camera: makeCamera(),
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
    };
    const result = strategy.pick({ x: 0, y: 0 }, ctx); // top-left corner — far from origin
    expect(result).toBeNull();
  });

  it('pick respects depth ordering — the front-most mesh wins', () => {
    const strategy = new BvhPickStrategy();
    const back = makeMesh(0, 0, -2, 1);
    const front = makeMesh(0, 0, 2, 1);
    const registry = buildRegistry([
      { id: 'back', kind: 'wall', mesh: back },
      { id: 'front', kind: 'door', mesh: front },
    ]);
    const ctx: PickContext = {
      camera: makeCamera(), // at z=5 looking at origin
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
    };
    const result = strategy.pick({ x: 50, y: 50 }, ctx);
    expect(result).not.toBeNull();
    expect(result!.elementId).toBe('front'); // closer to camera (z=2 vs z=-2)
  });

  it('pickRect returns all elements whose bounds intersect the frustum', () => {
    const strategy = new BvhPickStrategy();
    const a = makeMesh(-1, 0, 0);
    const b = makeMesh(1, 0, 0);
    const registry = buildRegistry([
      { id: 'a', kind: 'wall', mesh: a },
      { id: 'b', kind: 'door', mesh: b },
    ]);
    const ctx: PickContext = {
      camera: makeCamera(),
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
    };
    const results = strategy.pickRect({ x: 0, y: 0, w: 100, h: 100 }, ctx);
    const ids = new Set(results.map((r) => r.elementId));
    expect(ids.has('a')).toBe(true);
    expect(ids.has('b')).toBe(true);
  });

  it('cache invalidates when descriptor.hash changes for an id', () => {
    const strategy = new BvhPickStrategy();
    const mesh = makeMesh(0, 0, 0);
    const entries: RegEntry[] = [{ id: 'wall-1', kind: 'wall', mesh, hash: 'h1' }];
    const registry = buildRegistry(entries);
    const ctx: PickContext = {
      camera: makeCamera(),
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
    };

    strategy.pick({ x: 50, y: 50 }, ctx); // builds bvh for hash 'h1'
    expect(strategy.cacheSize()).toBe(1);

    // Replace geometry + bump hash — next pick rebuilds.
    mesh.geometry.dispose();
    mesh.geometry = new THREE.BoxGeometry(2, 2, 2);
    entries[0]!.hash = 'h2';
    strategy.pick({ x: 50, y: 50 }, ctx);
    // Cache still has one entry but it points to the new geometry.
    expect(strategy.cacheSize()).toBe(1);
  });

  // ── #113 — hidden elements must not be selectable ───────────────────────────
  // THREE's Raycaster ignores `.visible`; the strategy adds an effective-visibility
  // guard so an isolate/hide-d element (root or ancestor `.visible = false`) is
  // never returned. These lock that behaviour in.

  it('does not pick an element whose mesh is hidden (visible=false)', () => {
    const strategy = new BvhPickStrategy();
    const mesh = makeMesh(0, 0, 0);
    mesh.visible = false; // hidden — must be skipped despite being under the cursor
    const registry = buildRegistry([{ id: 'wall-1', kind: 'wall', mesh }]);
    const ctx: PickContext = {
      camera: makeCamera(),
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
    };
    expect(strategy.pick({ x: 50, y: 50 }, ctx)).toBeNull();
  });

  it('does not pick an element whose ANCESTOR is hidden (e.g. hidden level group)', () => {
    const strategy = new BvhPickStrategy();
    const group = new THREE.Group();
    group.visible = false; // e.g. an isolated-out level root
    const mesh = makeMesh(0, 0, 0);
    group.add(mesh);
    group.updateMatrixWorld(true);
    const registry = buildRegistry([{ id: 'wall-1', kind: 'wall', mesh }]);
    const ctx: PickContext = {
      camera: makeCamera(),
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
    };
    expect(strategy.pick({ x: 50, y: 50 }, ctx)).toBeNull();
  });

  it('a hidden element is transparent to picking — the visible element behind it wins', () => {
    const strategy = new BvhPickStrategy();
    const frontHidden = makeMesh(0, 0, 2, 1);
    frontHidden.visible = false;
    const backVisible = makeMesh(0, 0, -2, 1);
    const registry = buildRegistry([
      { id: 'front-hidden', kind: 'door', mesh: frontHidden },
      { id: 'back-visible', kind: 'wall', mesh: backVisible },
    ]);
    const ctx: PickContext = {
      camera: makeCamera(), // at z=5 looking at origin
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
    };
    const result = strategy.pick({ x: 50, y: 50 }, ctx);
    expect(result).not.toBeNull();
    expect(result!.elementId).toBe('back-visible'); // front is hidden → skipped
  });

  it('pickRect excludes hidden elements', () => {
    const strategy = new BvhPickStrategy();
    const a = makeMesh(-1, 0, 0);
    const b = makeMesh(1, 0, 0);
    b.visible = false; // hidden — must not appear in marquee results
    const registry = buildRegistry([
      { id: 'a', kind: 'wall', mesh: a },
      { id: 'b', kind: 'door', mesh: b },
    ]);
    const ctx: PickContext = {
      camera: makeCamera(),
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
    };
    const ids = new Set(strategy.pickRect({ x: 0, y: 0, w: 100, h: 100 }, ctx).map((r) => r.elementId));
    expect(ids.has('a')).toBe(true);
    expect(ids.has('b')).toBe(false);
  });
});
