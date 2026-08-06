// @vitest-environment happy-dom
/**
 * §FIX-STAIR-SELECTION-REBIND / §FIX-ELEMENT-REBIND-ON-ROOT-SWAP
 *
 * FOUNDER DEFECT: after editing a stair's WIDTH the mesh rebuilt correctly but the
 * purple selection highlight kept tracing the OLD geometry.
 *
 * ROOT CAUSE: the selection layer re-bound only on `bim-<type>-updated`
 * (§SELECT-GIZMO-REATTACH). `GenerateStairGeometryCommand` performs the
 * AUTHORITATIVE mesh swap by calling `stairMeshBuilder.updateStair()` DIRECTLY and
 * emits only `bim-stair-geometry-updated`, which nothing in SelectionManager
 * subscribes to. Any rebuild that swaps the root without a store write therefore
 * left `selectedObject` — and the highlight overlay, which CLONES the element's
 * live BufferGeometry — bound to the disposed old group.
 *
 * INVARIANT ASSERTED HERE: after ANY element root swap, the selection and its
 * highlight overlay reference the NEW root's geometry, whether or not a
 * `bim-*-updated` event was emitted. Asserted on the selection/highlight registry
 * contents (object + geometry identity), never on pixels.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { _resetFrameSchedulerForTest } from '@pryzm/frame-scheduler';
import { SelectionManager } from '../src/SelectionManager.js';

// ── Minimal structural fakes (same shape as SelectionManager.gizmoReattach) ──

function makeWorld(scene: THREE.Scene) {
  const threeRenderer = {
    domElement: { clientWidth: 100, clientHeight: 100 },
    capabilities: { maxTextureSize: 4096 },
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    render: () => {},
    readRenderTargetPixels: () => {},
  };
  return {
    scene: { three: scene },
    renderer: { three: threeRenderer },
  } as unknown as ConstructorParameters<typeof SelectionManager>[0];
}

function makeCamera() {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  cam.position.set(0, 0, 5);
  return { three: cam } as unknown as ConstructorParameters<typeof SelectionManager>[1];
}

function makeTransformControls() {
  const tc: {
    object: THREE.Object3D | null;
    attach: ReturnType<typeof vi.fn>;
    detach: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
  } = { object: null, attach: vi.fn(), detach: vi.fn(), addEventListener: vi.fn() };
  tc.attach.mockImplementation((o: THREE.Object3D) => { tc.object = o; });
  tc.detach.mockImplementation(() => { tc.object = null; });
  return tc;
}

function makeDom(): HTMLElement {
  return {
    style: {},
    addEventListener: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  } as unknown as HTMLElement;
}

/**
 * A stair root exactly as `StairMeshBuilder.updateStair()` stamps it: a fresh
 * Group per build, carrying `userData.id`, holding one tread mesh whose geometry
 * encodes the stair WIDTH.
 */
function makeStairRoot(id: string, width: number): THREE.Group {
  const g = new THREE.Group();
  g.name = `stair-${id}`;
  const ud = { id, elementId: id, elementType: 'Stair', type: 'stair', selectable: true };
  g.userData = { ...ud };
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 1, 1), new THREE.MeshBasicMaterial());
  mesh.name = `stair-mesh-${id}`;
  mesh.userData = { ...ud };
  g.add(mesh);
  return g;
}

/** The geometries the highlight overlay is currently drawing. */
function highlightGeometries(mgr: SelectionManager): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  (mgr as unknown as { highlightMesh: THREE.Object3D | null }).highlightMesh
    ?.traverse((c) => { if ((c as THREE.Mesh).isMesh) out.push((c as THREE.Mesh).geometry); });
  return out;
}

/** The geometries an element root actually renders. */
function liveGeometries(rootObj: THREE.Object3D): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  rootObj.traverse((c) => { if ((c as THREE.Mesh).isMesh) out.push((c as THREE.Mesh).geometry); });
  return out;
}

/**
 * Replay `StairMeshBuilder.updateStair()`: dispose+detach the old root, register
 * and add a brand-new one. NOTE: no `bim-stair-updated` is dispatched — that is
 * the whole point (`GenerateStairGeometryCommand` emits none on this path).
 */
function builderSwapRoot(scene: THREE.Scene, id: string, old: THREE.Object3D, next: THREE.Object3D): void {
  scene.remove(old);
  elementRegistry.unregisterRoot(id); // removeStair()
  elementRegistry.registerRoot(id, next);
  scene.add(next);
}

describe('SelectionManager §FIX-STAIR-SELECTION-REBIND — rebind on element root swap', () => {
  let scene: THREE.Scene;
  let tc: ReturnType<typeof makeTransformControls>;
  let mgr: SelectionManager;
  let priv: { selectedObject: THREE.Object3D | null; select: (o: THREE.Object3D) => void };

  beforeEach(() => {
    vi.useFakeTimers();
    _resetFrameSchedulerForTest();
    elementRegistry.clear();
    scene = new THREE.Scene();
    tc = makeTransformControls();
    mgr = new SelectionManager(
      makeWorld(scene),
      makeCamera(),
      makeDom(),
      tc as unknown as ConstructorParameters<typeof SelectionManager>[3],
      () => {},
    );
    mgr.init();
    priv = mgr as unknown as typeof priv;
  });

  afterEach(() => {
    vi.useRealTimers();
    elementRegistry.clear();
  });

  it('re-targets the highlight at the NEW geometry after a rebuild that emits NO bim-*-updated event', () => {
    const before = makeStairRoot('stair-1', 1.0);
    elementRegistry.registerRoot('stair-1', before);
    scene.add(before);
    priv.select(before);

    // Baseline: the overlay clones the CURRENT root's geometry.
    expect(highlightGeometries(mgr)).toEqual(liveGeometries(before));

    // Width edit → GenerateStairGeometryCommand → direct stairMeshBuilder.updateStair().
    const after = makeStairRoot('stair-1', 2.0);
    builderSwapRoot(scene, 'stair-1', before, after);
    vi.runAllTimers();

    // Selection AND the highlight now reference the rebuilt root — not the disposed one.
    expect(priv.selectedObject).toBe(after);
    expect(highlightGeometries(mgr)).toEqual(liveGeometries(after));
    expect(highlightGeometries(mgr)).not.toContain(liveGeometries(before)[0]);
  });

  it('invalidates the pick caches so a swapped-out root is never a raycast candidate', () => {
    const before = makeStairRoot('stair-2', 1.0);
    elementRegistry.registerRoot('stair-2', before);
    scene.add(before);

    // Warm the caches the way a click/hover pick does.
    const cachePriv = mgr as unknown as {
      _ensureSelectableCache: () => void;
      _selectableCache: THREE.Object3D[] | null;
    };
    cachePriv._ensureSelectableCache();
    expect(cachePriv._selectableCache).toContain(before);

    const after = makeStairRoot('stair-2', 2.0);
    builderSwapRoot(scene, 'stair-2', before, after);

    expect(cachePriv._selectableCache).toBeNull();
    cachePriv._ensureSelectableCache();
    expect(cachePriv._selectableCache).not.toContain(before);
    expect(cachePriv._selectableCache).toContain(after);
  });

  it('is type-agnostic — a wall rebuilt by overwriting its root in place re-binds too', () => {
    const before = makeStairRoot('wall-9', 0.2);
    before.userData.elementType = 'wall';
    before.userData.type = 'wall';
    elementRegistry.registerRoot('wall-9', before);
    scene.add(before);
    priv.select(before);

    // WallFragmentBuilder shape: registerRoot() overwrites without unregistering.
    const after = makeStairRoot('wall-9', 0.4);
    after.userData.elementType = 'wall';
    after.userData.type = 'wall';
    scene.remove(before);
    elementRegistry.registerRoot('wall-9', after);
    scene.add(after);
    vi.runAllTimers();

    expect(priv.selectedObject).toBe(after);
    expect(highlightGeometries(mgr)).toEqual(liveGeometries(after));
  });

  it('leaves an UNSELECTED element alone (no spurious selection on a background rebuild)', () => {
    const selected = makeStairRoot('stair-3', 1.0);
    elementRegistry.registerRoot('stair-3', selected);
    scene.add(selected);
    priv.select(selected);

    const other = makeStairRoot('stair-4', 1.0);
    elementRegistry.registerRoot('stair-4', other);
    scene.add(other);
    const otherRebuilt = makeStairRoot('stair-4', 2.0);
    builderSwapRoot(scene, 'stair-4', other, otherRebuilt);
    vi.runAllTimers();

    expect(priv.selectedObject).toBe(selected);
    expect(highlightGeometries(mgr)).toEqual(liveGeometries(selected));
  });

  it('drops the selection when the rebuild removed the element from the scene', () => {
    const before = makeStairRoot('stair-5', 1.0);
    elementRegistry.registerRoot('stair-5', before);
    scene.add(before);
    priv.select(before);

    // Root swapped but never added back (e.g. an empty-geometry build bail-out).
    const orphan = makeStairRoot('stair-5', 2.0);
    scene.remove(before);
    elementRegistry.unregisterRoot('stair-5');
    elementRegistry.registerRoot('stair-5', orphan);
    vi.runAllTimers();

    expect(priv.selectedObject).toBeNull();
    expect(highlightGeometries(mgr)).toEqual([]);
  });
});
