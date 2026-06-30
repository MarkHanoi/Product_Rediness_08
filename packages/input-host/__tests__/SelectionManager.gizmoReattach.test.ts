// @vitest-environment happy-dom
/**
 * §SELECT-GIZMO-REATTACH — SelectionManager tests for the transform-gizmo
 * stale-attach flood fix.
 *
 * ROOT CAUSE: when a selected element is MOVED / UNDONE / re-created, its mesh
 * is disposed and rebuilt — the old Object3D is removed from the scene graph and
 * a NEW group (same userData.id) is added. The TransformControls gizmo (and
 * `selectedObject`) still point at the now-DETACHED old mesh, so THREE's
 * TransformControls.updateMatrixWorld throws "The attached 3D object must be a
 * part of the scene graph" on EVERY render frame, wedging the selection loop.
 *
 * The fix:
 *   1. `guardTransformControlsAttachment()` — detaches the gizmo when its
 *      attached object is no longer in the scene graph (per-frame safety net).
 *   2. `_resolveLiveObjectById()` — resolves the CURRENT scene-attached Object3D
 *      for an element id, never returning a stale/detached cache entry.
 *   3. `_reresolveSelectionAfterRebuild()` — re-selects the rebuilt mesh (or
 *      unselects if the element is gone) so the next click resolves it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { SelectionManager } from '../src/SelectionManager.js';

// ── Minimal structural fakes ────────────────────────────────────────────────

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

/** Fake TransformControls that tracks its attached `object` like the real one. */
function makeTransformControls() {
  const tc: {
    object: THREE.Object3D | null;
    attach: ReturnType<typeof vi.fn>;
    detach: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
  } = {
    object: null,
    attach: vi.fn(),
    detach: vi.fn(),
    addEventListener: vi.fn(),
  };
  // Mirror THREE's semantics: attach sets `object`, detach clears it.
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

function makeManager(scene: THREE.Scene, tc: ReturnType<typeof makeTransformControls>): SelectionManager {
  return new SelectionManager(
    makeWorld(scene),
    makeCamera(),
    makeDom(),
    tc as unknown as ConstructorParameters<typeof SelectionManager>[3],
    () => {},
  );
}

/** A selectable element mesh carrying the userData a builder stamps. */
function makeElement(id: string, type = 'door'): THREE.Group {
  const g = new THREE.Group();
  g.userData.id = id;
  g.userData.elementType = type;
  g.userData.selectable = true;
  return g;
}

describe('SelectionManager §SELECT-GIZMO-REATTACH — guardTransformControlsAttachment', () => {
  let scene: THREE.Scene;
  let tc: ReturnType<typeof makeTransformControls>;
  let mgr: SelectionManager;
  beforeEach(() => {
    scene = new THREE.Scene();
    tc = makeTransformControls();
    mgr = makeManager(scene, tc);
  });

  it('detaches the gizmo when its attached object was removed from the scene graph', () => {
    const el = makeElement('door-1');
    scene.add(el);
    tc.attach(el);
    expect(tc.object).toBe(el);

    // Simulate a rebuild: the old mesh is removed from the scene.
    scene.remove(el);

    const detached = mgr.guardTransformControlsAttachment();
    expect(detached).toBe(true);
    expect(tc.detach).toHaveBeenCalled();
    expect(tc.object).toBeNull();
  });

  it('leaves the gizmo attached when its object is still in the scene graph', () => {
    const el = makeElement('wall-1', 'wall');
    scene.add(el);
    tc.attach(el);
    tc.detach.mockClear();

    const detached = mgr.guardTransformControlsAttachment();
    expect(detached).toBe(false);
    expect(tc.detach).not.toHaveBeenCalled();
    expect(tc.object).toBe(el);
  });

  it('is a no-op when nothing is attached', () => {
    expect(mgr.guardTransformControlsAttachment()).toBe(false);
    expect(tc.detach).not.toHaveBeenCalled();
  });
});

describe('SelectionManager §SELECT-GIZMO-REATTACH — _resolveLiveObjectById', () => {
  it('returns the LIVE (scene-attached) object for an id, ignoring a detached one', () => {
    const scene = new THREE.Scene();
    const tc = makeTransformControls();
    const mgr = makeManager(scene, tc) as unknown as {
      _resolveLiveObjectById: (id: string) => THREE.Object3D | null;
    };

    const live = makeElement('door-7');
    scene.add(live);
    expect(mgr._resolveLiveObjectById('door-7')).toBe(live);

    // Detached element with the same id must not be returned.
    const stale = makeElement('door-7');
    expect(mgr._resolveLiveObjectById('door-99')).toBeNull();
    // (stale is never added to the scene, so it is never resolved)
    expect(mgr._resolveLiveObjectById('door-7')).toBe(live);
    void stale;
  });
});

describe('SelectionManager §SELECT-GIZMO-REATTACH — _reresolveSelectionAfterRebuild', () => {
  let scene: THREE.Scene;
  let tc: ReturnType<typeof makeTransformControls>;
  let mgr: SelectionManager;
  let priv: {
    selectedObject: THREE.Object3D | null;
    _reresolveSelectionAfterRebuild: (id: string) => void;
  };
  beforeEach(() => {
    scene = new THREE.Scene();
    tc = makeTransformControls();
    mgr = makeManager(scene, tc);
    priv = mgr as unknown as typeof priv;
  });

  it('re-attaches the gizmo to the REBUILT mesh after a move/undo swap', () => {
    // Select the original mesh.
    const oldMesh = makeElement('door-1');
    scene.add(oldMesh);
    tc.attach(oldMesh);
    priv.selectedObject = oldMesh;

    // Rebuild: remove old, add a brand-new mesh with the same id.
    scene.remove(oldMesh);
    const newMesh = makeElement('door-1');
    scene.add(newMesh);

    priv._reresolveSelectionAfterRebuild('door-1');

    // Selection now points at the NEW mesh and the gizmo is attached to it.
    expect(priv.selectedObject).toBe(newMesh);
    expect(tc.object).toBe(newMesh);
    // The stale old mesh is never the gizmo target.
    expect(tc.object).not.toBe(oldMesh);
  });

  it('unselects (and detaches) when the rebuilt element is gone from the scene', () => {
    const oldMesh = makeElement('win-3', 'window');
    scene.add(oldMesh);
    tc.attach(oldMesh);
    priv.selectedObject = oldMesh;

    // Undo-of-create: the mesh is removed and nothing replaces it.
    scene.remove(oldMesh);

    priv._reresolveSelectionAfterRebuild('win-3');

    expect(priv.selectedObject).toBeNull();
    expect(tc.object).toBeNull();
    expect(tc.detach).toHaveBeenCalled();
  });

  it('does nothing when the rebuilt element is not the selected one', () => {
    const selected = makeElement('door-1');
    scene.add(selected);
    tc.attach(selected);
    priv.selectedObject = selected;
    tc.detach.mockClear();
    tc.attach.mockClear();

    priv._reresolveSelectionAfterRebuild('door-OTHER');

    expect(priv.selectedObject).toBe(selected);
    expect(tc.object).toBe(selected);
    expect(tc.detach).not.toHaveBeenCalled();
  });
});

describe('SelectionManager §SELECT-HOVER-MATRIX-GUARD — _safeUpdateMatrixWorldForPick', () => {
  /**
   * A scene-child gizmo that mirrors stock THREE.TransformControls:
   * `updateMatrixWorld` THROWS "must be a part of the scene graph" while it holds
   * an attached object whose parent chain no longer reaches a scene root. This is
   * exactly the throw that aborts the hover RAF / click pick under the resi-building
   * background-rebuild churn. Adding it as a child of the scene means
   * `scene.updateMatrixWorld(true)` recurses into it (as the real scene does).
   */
  class FakeGizmo extends THREE.Object3D {
    attachedTo: THREE.Object3D | null = null;
    override updateMatrixWorld(force?: boolean): void {
      if (this.attachedTo !== null) {
        let cur: THREE.Object3D | null = this.attachedTo;
        let inScene = false;
        while (cur !== null) {
          if ((cur as THREE.Object3D).type === 'Scene') { inScene = true; break; }
          cur = cur.parent;
        }
        if (!inScene) {
          throw new Error('TransformControls: The attached 3D object must be a part of the scene graph.');
        }
      }
      super.updateMatrixWorld(force);
    }
  }

  function makeManagerWithGizmo(scene: THREE.Scene, gizmo: FakeGizmo) {
    const tc = {
      object: null as THREE.Object3D | null,
      attach: vi.fn((o: THREE.Object3D) => { tc.object = o; gizmo.attachedTo = o; }),
      detach: vi.fn(() => { tc.object = null; gizmo.attachedTo = null; }),
      addEventListener: vi.fn(),
    };
    const mgr = new SelectionManager(
      makeWorld(scene),
      makeCamera(),
      makeDom(),
      tc as unknown as ConstructorParameters<typeof SelectionManager>[3],
      () => {},
    );
    return { mgr: mgr as unknown as { _safeUpdateMatrixWorldForPick: () => void }, tc };
  }

  it('does NOT throw and updates matrices when the gizmo target was rebuilt out of the scene', () => {
    const scene = new THREE.Scene();
    const gizmo = new FakeGizmo();
    scene.add(gizmo); // gizmo is a scene child, like the real TransformControls

    const { mgr, tc } = makeManagerWithGizmo(scene, gizmo);

    // Select an element, then simulate the background rebuild disposing its mesh.
    const el = makeElement('wall-1', 'wall');
    scene.add(el);
    tc.attach(el);
    scene.remove(el); // mesh disposed/detached out from under the gizmo

    // A naive scene.updateMatrixWorld(true) would throw here — the guard must not.
    expect(() => mgr._safeUpdateMatrixWorldForPick()).not.toThrow();
    // The stale gizmo was detached so the throw can never recur.
    expect(tc.object).toBeNull();
    expect(tc.detach).toHaveBeenCalled();
  });

  it('leaves a still-attached gizmo alone and completes the matrix sync', () => {
    const scene = new THREE.Scene();
    const gizmo = new FakeGizmo();
    scene.add(gizmo);

    const { mgr, tc } = makeManagerWithGizmo(scene, gizmo);

    const el = makeElement('wall-2', 'wall');
    scene.add(el);
    tc.attach(el);
    tc.detach.mockClear();

    expect(() => mgr._safeUpdateMatrixWorldForPick()).not.toThrow();
    // Healthy attachment is preserved — no needless detach/realign churn.
    expect(tc.object).toBe(el);
    expect(tc.detach).not.toHaveBeenCalled();
  });
});
