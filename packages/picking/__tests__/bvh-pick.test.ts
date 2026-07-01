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

// ── §SELECT-INSTANCED-PICK (FIX #6) — the WebGL/headless fallback path resolves ──
// each hit InstancedElementRenderer instance to its REAL per-instance element id
// via hit.instanceId → getInstanceElementId(slot), instead of returning the
// synthetic group id (which is not a real element → no selection) or an arbitrary
// member id. This is the CPU mirror of the GPU path's per-instance colour scheme.

/**
 * Build a fake InstancedElementRenderer group: a THREE.InstancedMesh stamped with
 * the SAME userData contract the real renderer stamps. `elementIds[k]` occupies
 * source instance slot `k` (undefined = an empty/free slot). Each instance is a
 * unit box translated to (k*3, 0, 0) so a camera looking down -Z can aim a ray at a
 * chosen instance.
 */
function makeInstancedGroup(elementIds: (string | undefined)[]): THREE.InstancedMesh {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.computeBoundingBox();
  const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), elementIds.length);
  im.count = elementIds.length;
  const m = new THREE.Matrix4();
  for (let i = 0; i < elementIds.length; i++) {
    m.makeTranslation(i * 3, 0, 0);
    im.setMatrixAt(i, m);
  }
  im.instanceMatrix.needsUpdate = true;
  im.updateMatrixWorld(true);
  const occupied = elementIds
    .map((id, i) => (id === undefined ? -1 : i))
    .filter((i) => i >= 0);
  im.userData.id = 'instanced-group-key';
  im.userData.isInstancedGroup = true;
  im.userData.elementType = 'column';
  im.userData.getOccupiedInstanceSlots = (): readonly number[] => occupied;
  im.userData.getInstanceElementId = (slot: number): string | undefined => elementIds[slot];
  return im;
}

/**
 * Registry mirroring SelectionManager._buildElementRegistry: the synthetic group
 * id AND every per-instance member id all map to the SAME InstancedMesh. kindOf
 * knows only the per-instance members (real BIM elements), not the synthetic id.
 */
function instancedGroupRegistry(im: THREE.InstancedMesh): ElementRegistry {
  const groupId = im.userData.id as string;
  const getSlots = im.userData.getOccupiedInstanceSlots as () => readonly number[];
  const getElemId = im.userData.getInstanceElementId as (s: number) => string | undefined;
  const members = new Set<string>();
  for (const s of getSlots()) {
    const eid = getElemId(s);
    if (eid !== undefined) members.add(eid);
  }
  const ids = [groupId, ...members];
  return {
    kindOf: (id) => (members.has(id) ? ('column' as never) : null),
    ids: () => ids,
    objectFor: (id) => (id === groupId || members.has(id) ? im : null),
  };
}

/** Camera on the +X axis aimed at instance `k` (centred at x=k*3), looking -X. */
function makeCameraAimingInstance(k: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  cam.position.set(k * 3, 0, 5);
  cam.lookAt(k * 3, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
}

describe('BvhPickStrategy instanced groups (§SELECT-INSTANCED-PICK FIX #6)', () => {
  it('resolves the hit instance to its OWN element id, NOT the synthetic group id', () => {
    const strategy = new BvhPickStrategy();
    const im = makeInstancedGroup(['col-0', 'col-1', 'col-2']);
    const registry = instancedGroupRegistry(im);
    const ctx: PickContext = {
      camera: makeCameraAimingInstance(2), // aim at instance slot 2 (x=6)
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
    };
    const result = strategy.pick({ x: 50, y: 50 }, ctx);
    expect(result).not.toBeNull();
    expect(result!.elementId).toBe('col-2');
    expect(result!.elementId).not.toBe('instanced-group-key');
    expect(result!.elementKind).toBe('column');
  });

  it('each aimed instance resolves to its own member id (wall/column/beam mirror)', () => {
    const strategy = new BvhPickStrategy();
    const im = makeInstancedGroup(['beam-A', 'beam-B', 'beam-C']);
    const registry = instancedGroupRegistry(im);
    for (const [k, expected] of [[0, 'beam-A'], [1, 'beam-B'], [2, 'beam-C']] as const) {
      const ctx: PickContext = {
        camera: makeCameraAimingInstance(k),
        elementRegistry: registry,
        viewportWidth: 100,
        viewportHeight: 100,
      };
      const result = strategy.pick({ x: 50, y: 50 }, ctx);
      expect(result?.elementId).toBe(expected);
    }
  });

  it('never returns the synthetic group id from a real hit', () => {
    const strategy = new BvhPickStrategy();
    const im = makeInstancedGroup(['col-0', 'col-1']);
    const registry = instancedGroupRegistry(im);
    const ctx: PickContext = {
      camera: makeCameraAimingInstance(1),
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
    };
    const result = strategy.pick({ x: 50, y: 50 }, ctx);
    expect(result?.elementId).toBe('col-1');
  });

  it('pickRect enumerates each occupied instance as its own member element', () => {
    const strategy = new BvhPickStrategy();
    const im = makeInstancedGroup(['col-0', 'col-1', 'col-2']);
    const registry = instancedGroupRegistry(im);
    // Camera framing all three instances (centred between slot 0 and slot 2).
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    cam.position.set(3, 0, 12);
    cam.lookAt(3, 0, 0);
    cam.updateMatrixWorld(true);
    const ctx: PickContext = {
      camera: cam,
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
    };
    const ids = new Set(
      strategy.pickRect({ x: 0, y: 0, w: 100, h: 100 }, ctx).map((r) => r.elementId),
    );
    expect(ids.has('col-0')).toBe(true);
    expect(ids.has('col-1')).toBe(true);
    expect(ids.has('col-2')).toBe(true);
    expect(ids.has('instanced-group-key')).toBe(false);
  });

  it('an empty (unoccupied) instance slot is never resolved', () => {
    const strategy = new BvhPickStrategy();
    // slot 1 is a gap (undefined) — a marquee must not surface it.
    const im = makeInstancedGroup(['col-0', undefined, 'col-2']);
    const registry = instancedGroupRegistry(im);
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    cam.position.set(3, 0, 12);
    cam.lookAt(3, 0, 0);
    cam.updateMatrixWorld(true);
    const ctx: PickContext = {
      camera: cam,
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
    };
    const ids = new Set(
      strategy.pickRect({ x: 0, y: 0, w: 100, h: 100 }, ctx).map((r) => r.elementId),
    );
    expect(ids.has('col-0')).toBe(true);
    expect(ids.has('col-2')).toBe(true);
    expect(ids.size).toBe(2); // no phantom entry for the empty slot 1
  });
});
