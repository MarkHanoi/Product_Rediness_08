// @vitest-environment happy-dom
/**
 * §SELECT-STUCK-STATE-SELFHEAL — regression tests for the "selection goes
 * permanently dead after a double-click" lockup.
 *
 * TRIGGER: the click→select guard in performSelection() early-returns when
 * `window.isCameraDragging` or `this.isTransforming` is true. Both are cleared
 * by EVENTS that can be MISSED:
 *   - A dblclick-zoom calls camera-controls `setLookAt(..., true)`, which fires
 *     `controlstart` (→ window.isCameraDragging = true) but does NOT always fire
 *     a matching `rest`/`sleep` (e.g. the camera was already framed → no
 *     movement → no `rest`). The flag sticks TRUE and EVERY later click is
 *     swallowed → selection permanently dead, no recovery.
 *   - A TransformControls drag whose `dragging-changed:false` is dropped (pointer
 *     left the canvas / exception) leaves `isTransforming` stuck true.
 *
 * FIX (self-healing): a browser `click` only fires after press+release WITHOUT a
 * real drag, so if a flag is set but the gesture did not actually drag (and the
 * gizmo is not LIVE-dragging per transformControls.dragging), the flag is STALE —
 * performSelection() heals it and proceeds. Escape also force-heals.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { SelectionManager } from '../src/SelectionManager.js';

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

/** Fake TransformControls with a settable live `.dragging` boolean. */
function makeTransformControls() {
  return {
    dragging: false,
    object: null as THREE.Object3D | null,
    attach: vi.fn(),
    detach: vi.fn(),
    addEventListener: vi.fn(),
  };
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

type Priv = {
  performSelection: (e: MouseEvent | PointerEvent) => void;
  _healStuckInteractionState: (reason: string) => void;
  _pointerDraggedThisGesture: boolean;
  isTransforming: boolean;
  unselectAll: () => void;
};

const CLICK = { button: 0, clientX: 50, clientY: 50 } as MouseEvent;

describe('SelectionManager §SELECT-STUCK-STATE-SELFHEAL — performSelection self-heals', () => {
  let scene: THREE.Scene;
  let tc: ReturnType<typeof makeTransformControls>;
  let mgr: SelectionManager;
  let priv: Priv;

  beforeEach(() => {
    scene = new THREE.Scene();
    tc = makeTransformControls();
    mgr = makeManager(scene, tc);
    priv = mgr as unknown as Priv;
    window.isCameraDragging = false;
  });
  afterEach(() => { window.isCameraDragging = false; });

  it('a stale window.isCameraDragging is HEALED by a click without a real drag (selection proceeds)', () => {
    // Simulate the dblclick-zoom lockup: flag stuck true, no actual user drag.
    window.isCameraDragging = true;
    priv._pointerDraggedThisGesture = false;
    const unselectSpy = vi.spyOn(priv, 'unselectAll');

    priv.performSelection(CLICK);

    // Flag healed → no longer wedged.
    expect(window.isCameraDragging).toBe(false);
    // performSelection PROCEEDED (empty-scene click → unselectAll), i.e. it did
    // NOT early-return at the guard.
    expect(unselectSpy).toHaveBeenCalled();
  });

  it('a stale isTransforming is HEALED when the gizmo is not live-dragging', () => {
    priv.isTransforming = true;
    tc.dragging = false;
    const unselectSpy = vi.spyOn(priv, 'unselectAll');

    priv.performSelection(CLICK);

    expect(priv.isTransforming).toBe(false);
    expect(unselectSpy).toHaveBeenCalled();
  });

  it('does NOT heal / DOES bail while the gizmo is GENUINELY live-dragging', () => {
    priv.isTransforming = true;
    tc.dragging = true; // a real drag is in progress
    const unselectSpy = vi.spyOn(priv, 'unselectAll');

    priv.performSelection(CLICK);

    // Real drag → guard bails, isTransforming preserved, no selection mutation.
    expect(priv.isTransforming).toBe(true);
    expect(unselectSpy).not.toHaveBeenCalled();
  });

  it('respects a genuine camera drag-release: flag set AND user dragged this gesture → bail', () => {
    window.isCameraDragging = true;
    priv._pointerDraggedThisGesture = true; // the user actually orbited this gesture
    const unselectSpy = vi.spyOn(priv, 'unselectAll');

    priv.performSelection(CLICK);

    // Genuine drag-release click → bail (do not select), flag left for the
    // camera-controls rest/sleep to clear normally.
    expect(unselectSpy).not.toHaveBeenCalled();
  });

  it('the per-gesture drag flag is consumed (reset to false) every click', () => {
    window.isCameraDragging = false;
    priv._pointerDraggedThisGesture = true;
    priv.performSelection(CLICK);
    expect(priv._pointerDraggedThisGesture).toBe(false);
  });
});

describe('SelectionManager §SELECT-STUCK-STATE-SELFHEAL — _healStuckInteractionState', () => {
  let scene: THREE.Scene;
  let tc: ReturnType<typeof makeTransformControls>;
  let priv: Priv;

  beforeEach(() => {
    scene = new THREE.Scene();
    tc = makeTransformControls();
    priv = makeManager(scene, tc) as unknown as Priv;
    window.isCameraDragging = false;
  });
  afterEach(() => { window.isCameraDragging = false; });

  it('clears both stuck flags when the gizmo is idle', () => {
    priv.isTransforming = true;
    window.isCameraDragging = true;
    priv._healStuckInteractionState('test');
    expect(priv.isTransforming).toBe(false);
    expect(window.isCameraDragging).toBe(false);
  });

  it('leaves flags ALONE when the gizmo is genuinely live-dragging', () => {
    priv.isTransforming = true;
    window.isCameraDragging = true;
    tc.dragging = true;
    priv._healStuckInteractionState('test');
    // Real drag in progress — must not be clobbered.
    expect(priv.isTransforming).toBe(true);
    expect(window.isCameraDragging).toBe(true);
  });
});
