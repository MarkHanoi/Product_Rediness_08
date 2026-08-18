// @vitest-environment happy-dom
/**
 * L-961 §SELECT-GIZMO-REATTACH — PHASE A MEASUREMENT PROBE.
 *
 * FOUNDER DEFECT (live deploy ce400c09): select a wall, create a window in it,
 * and the selection handles vanish from the wall. Console shows
 * `guardTransformControlsAttachment ← _reresolveSelectionAfterRebuild ← registerRoot`.
 *
 * WHAT THIS FILE MEASURES — nothing about pixels, and nothing about the guard.
 * The guard is CORRECT (a gizmo driving a detached object at 60fps is worse than
 * no gizmo). The question is whether re-resolution RE-BINDS the gizmo afterwards,
 * and to WHAT.
 *
 * ORACLE. Every assertion is against the LIVE SCENE GRAPH — `tc.object`'s parent
 * chain must reach `scene`, walked here by an independent local helper — never
 * against a non-null check and never against a value the subject also computes.
 * `_isAttachedToScene` (the subject's own predicate) is deliberately NOT used.
 *
 * FIDELITY. The real `WallTransformController` is driven, not a stand-in: it is
 * the thing that owns a wall's gizmo binding (an invisible in-scene PROXY, not
 * the wall group), and a hand-rolled fake could not have shown the divergence.
 * It is wired to `bim-selection-changed` exactly as `registerTransformDragHandler`
 * wires it; SelectionManager dispatches that event on `window` AND on
 * `runtime.events` with an identical payload, so listening on `window` is the
 * same signal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { _resetFrameSchedulerForTest } from '@pryzm/frame-scheduler';
import { SelectionManager } from '../src/SelectionManager.js';
import { WallTransformController } from '../src/WallTransformController.js';

// ── Structural fakes (same shape as SelectionManager.rebuildRebind) ──────────

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

/**
 * Stand-in for THREE's TransformControls with the ONE property the subject reads
 * (`object`) and the two methods it calls. `setSpace` / `setMode` / `showX…` are
 * present because the REAL WallTransformController calls them.
 */
function makeTransformControls() {
  const tc = {
    object: null as THREE.Object3D | null,
    dragging: false,
    attach: vi.fn(),
    detach: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setSpace: vi.fn(),
    setMode: vi.fn(),
    showX: true, showY: true, showZ: true,
  };
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

type RuntimeWindow = {
  runtime: { events: { on: (e: string, cb: (p: unknown) => void) => void; emit: (e: string, p: unknown) => void } };
};

// ── The independent oracle ───────────────────────────────────────────────────

/** Walks the parent chain by hand. Shares no code with the subject. */
function isInSceneGraph(scene: THREE.Scene, obj: THREE.Object3D | null): boolean {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (cur === scene) return true;
    cur = cur.parent;
  }
  return false;
}

/** True when the gizmo sits on the WallTransformController's oriented proxy. */
function isWallProxy(obj: THREE.Object3D | null): boolean {
  return obj?.userData?.isWallTransformProxy === true;
}

// ── Element roots, stamped as the real builders stamp them ───────────────────

/** `WallFragmentBuilder.buildWall()` shape: PERSISTENT root, children swapped. */
function makeWallRoot(id: string): THREE.Group {
  const g = new THREE.Group();
  g.name = `wall-${id}`;
  g.userData = {
    id,
    elementType: 'wall',
    type: 'wall',
    selectable: true,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
    height: 2.7,
  };
  return g;
}

function addWallBody(root: THREE.Group, len: number): void {
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, 2.7, 0.2), new THREE.MeshBasicMaterial());
  m.userData = { id: root.userData.id, role: 'wall-fragment', type: 'wall-fragment' };
  root.add(m);
}

/** `WindowBuilder.build()` shape: dispose() the old group, mint a FRESH one. */
function makeWindowRoot(id: string, wallId: string, w: number): THREE.Group {
  const g = new THREE.Group();
  g.name = `window-${id}`;
  g.userData = { id, elementType: 'Window', type: 'window', selectable: true, wallId, offset: 1 };
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, 0.1), new THREE.MeshBasicMaterial());
  m.userData = { id, elementType: 'Window', type: 'window' };
  g.add(m);
  return g;
}

describe('L-961 — does re-resolution re-BIND the gizmo, or only the selection?', () => {
  let scene: THREE.Scene;
  let tc: ReturnType<typeof makeTransformControls>;
  let mgr: SelectionManager;
  let wallCtl: WallTransformController;
  let priv: { selectedObject: THREE.Object3D | null; select: (o: THREE.Object3D) => void };
  let selectionEvents: Array<THREE.Object3D | null>;
  let selectionListener: (e: Event) => void;
  let reanchors: THREE.Object3D[];
  let warnSpy: ReturnType<typeof vi.spyOn>;

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

    // The REAL controller that owns a wall's gizmo binding, wired the way
    // registerTransformDragHandler.ts wires it on `bim-selection-changed`.
    wallCtl = new WallTransformController(
      tc as unknown as ConstructorParameters<typeof WallTransformController>[0],
      scene,
    );
    selectionEvents = [];
    // Removed in afterEach: happy-dom's `window` is shared across tests in a
    // file, so a leaked listener would let a previous test's controller run
    // against the current one and make the measurement unreadable.
    selectionListener = (e: Event) => {
      const obj = (e as CustomEvent).detail?.object ?? null;
      selectionEvents.push(obj);
      if (obj) wallCtl.activateFor(obj);
      else wallCtl.deactivate();
    };
    window.addEventListener('bim-selection-changed', selectionListener);

    // The runtime bus, carrying the two subscriptions registerTransformDragHandler
    // registers on it. `pryzm-reanchor-transform` is the production re-bind channel
    // and exists ONLY here, so a test that omitted it could not see the fix work.
    reanchors = [];
    const handlers: Record<string, Array<(p: unknown) => void>> = {};
    (window as unknown as { runtime: unknown }).runtime = {
      events: {
        on: (evt: string, cb: (p: unknown) => void) => { (handlers[evt] ??= []).push(cb); },
        emit: (evt: string, p: unknown) => { for (const cb of handlers[evt] ?? []) cb(p); },
      },
    };
    (window as unknown as RuntimeWindow).runtime.events.on('pryzm-reanchor-transform', (payload) => {
      const obj = (payload as { object?: THREE.Object3D | null })?.object
        ?? (mgr as unknown as { selectedObject: THREE.Object3D | null }).selectedObject;
      if (!obj) return;
      reanchors.push(obj);
      wallCtl.activateFor(obj);   // the wall arm of the four-controller chain
    });

    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    window.removeEventListener('bim-selection-changed', selectionListener);
    delete (window as unknown as { runtime?: unknown }).runtime;
    warnSpy.mockRestore();
    vi.useRealTimers();
    elementRegistry.clear();
  });

  // ── PROBE 1 — the WALL arm (the founder's element) ─────────────────────────
  //
  // `WallFragmentBuilder` keeps a PERSISTENT root in `this.wallRoots` and calls
  // `registerRoot(id, sameRoot)` on every build, which ElementRegistry treats as
  // idempotent — so a wall NEVER fires `onRootSwapped`. A selected wall reaches
  // `_reresolveSelectionAfterRebuild` only via `bim-wall-updated`, and always
  // lands in the `freshRoot === sel` REUSE branch.
  it('PROBE 1 — after a wall rebuild the gizmo must still be on the wall PROXY', () => {
    const wall = makeWallRoot('wall-1');
    addWallBody(wall, 4);
    elementRegistry.registerRoot('wall-1', wall);
    scene.add(wall);

    priv.select(wall);

    // Baseline the fix must preserve: a selected wall's gizmo lives on the
    // in-scene proxy, NOT on the wall group.
    expect(isWallProxy(tc.object)).toBe(true);
    expect(isInSceneGraph(scene, tc.object)).toBe(true);

    const eventsBefore    = selectionEvents.length;
    const reanchorsBefore  = reanchors.length;

    // Rebuild: children disposed + rebuilt, SAME root re-registered, store emits.
    wall.clear();
    addWallBody(wall, 4);
    elementRegistry.registerRoot('wall-1', wall);
    window.dispatchEvent(new CustomEvent('bim-wall-updated', { detail: { id: 'wall-1' } }));
    vi.runAllTimers();

    // MEASURE.
    expect(isInSceneGraph(scene, tc.object)).toBe(true);
    expect(isWallProxy(tc.object)).toBe(true);

    // MECHANISM — stated separately so a regression names its own cause: the
    // per-type controllers re-bind ONLY on an event. A re-resolve that
    // re-attaches the gizmo itself and emits nothing cannot reach them.
    expect(reanchors.length).toBeGreaterThan(reanchorsBefore);
    // ...and it must be the CHEAP channel: `bim-selection-changed` re-populates
    // every property panel, and this fires on every rebuild of the selection.
    expect(selectionEvents.length).toBe(eventsBefore);
  });

  // ── PROBE 2 — the WINDOW arm (fresh-root builders) ────────────────────────
  //
  // `WindowBuilder.build()` calls `dispose(id)` (scene.remove(old)) then mints a
  // fresh Group and `registerRoot`s it — a GENUINE root swap, which is the
  // `registerRoot` frame in the founder's trace. The old root is already
  // detached when the deferred re-resolve runs, which is why the guard warns.
  it('PROBE 2 — after a fresh-root rebuild the gizmo must be on a LIVE object', () => {
    const win = makeWindowRoot('win-1', 'wall-1', 1.2);
    elementRegistry.registerRoot('win-1', win);
    scene.add(win);

    priv.select(win);
    expect(isInSceneGraph(scene, tc.object)).toBe(true);

    // WindowBuilder shape.
    const next = makeWindowRoot('win-1', 'wall-1', 1.6);
    scene.remove(win);
    elementRegistry.registerRoot('win-1', next);
    scene.add(next);
    window.dispatchEvent(new CustomEvent('bim-window-updated', { detail: { id: 'win-1' } }));
    vi.runAllTimers();

    expect(priv.selectedObject).toBe(next);
    expect(isInSceneGraph(scene, tc.object)).toBe(true);
    expect(tc.object).toBe(next);
  });

  // ── PROBE 3 — blast radius: is the wall arm about openings, or every edit? ─
  it('PROBE 3 — a plain wall MOVE (no opening involved) takes the same path', () => {
    const wall = makeWallRoot('wall-2');
    addWallBody(wall, 4);
    elementRegistry.registerRoot('wall-2', wall);
    scene.add(wall);
    priv.select(wall);
    expect(isWallProxy(tc.object)).toBe(true);

    // A pure baseline move: same persistent root, new position, store emits.
    wall.position.set(2, 0, 0);
    wall.userData.baseLine = [{ x: 2, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }];
    wall.clear();
    addWallBody(wall, 4);
    elementRegistry.registerRoot('wall-2', wall);
    window.dispatchEvent(new CustomEvent('bim-wall-updated', { detail: { id: 'wall-2' } }));
    vi.runAllTimers();

    expect(isWallProxy(tc.object)).toBe(true);
  });
});
