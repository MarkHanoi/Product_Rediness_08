// sketchViewStore — WHICH WORK PLANE the author is drawing on, plus the
// per-view camera so switching away and back does not lose the pan/zoom.
//
// ⚠ THIS IS NOT A RIVAL TO `stores/viewTabStore.ts`, AND THE DISTINCTION IS
//   LOAD-BEARING. `viewTabStore` selects a PANEL — sketch / 3d / parameters,
//   three different screens. This store selects a PROJECTION *within* the
//   drawing screen — plan / front / side, the same document set seen from
//   three work planes. They are orthogonal: an author can be on the Front
//   elevation and still switch to the Parameters panel and back.
//
//   Both stores deliberately share ONE contract shape (frozen snapshot,
//   monotonic `version`, idempotent setter, `subscribe` returning an
//   unsubscriber) because this app's house store pattern is that shape —
//   copying the SHAPE is not forking the STORE.
//
// LAYER — L1-equivalent: pure store. No THREE, no DOM, no rAF, no
// `(window as any)`.

import {
  SKETCH_VIEW_KINDS,
  isSketchViewKind,
  type SketchViewKind,
} from './viewProjection.js';

/** Camera state remembered per view. Mirrors the fields of
 *  `sketch/transform.ts`'s `ViewState` that are NOT canvas-size derived —
 *  canvas width/height belong to the DOM element, not to the view. */
export interface ViewCamera {
  /** Pixels per millimetre. */
  readonly zoom: number;
  /** Work-plane mm at the canvas centre. */
  readonly panX: number;
  /** Work-plane mm at the canvas centre. */
  readonly panZ: number;
}

export const DEFAULT_VIEW_CAMERA: ViewCamera = Object.freeze({
  zoom: 1,
  panX: 0,
  panZ: 0,
});

export interface SketchViewSnapshot {
  readonly active: SketchViewKind;
  /** Remembered camera for every view, including the inactive ones. */
  readonly cameras: Readonly<Record<SketchViewKind, ViewCamera>>;
  /** Monotonic transition counter — bumps on view change AND camera change. */
  readonly version: number;
}

export type SketchViewSubscriber = (snap: SketchViewSnapshot) => void;

export interface SketchViewStore {
  get(): SketchViewSnapshot;
  subscribe(fn: SketchViewSubscriber): () => void;
  /** Switch work plane. Idempotent — re-setting the active view is a no-op. */
  setActive(next: SketchViewKind): void;
  /** Remember a view's camera. Idempotent when nothing moved. */
  setCamera(kind: SketchViewKind, camera: ViewCamera): void;
  /**
   * Read one view's remembered camera.
   *
   * ⚠ NAMED `getCamera`, NOT `cameraOf`, AND THE NAME IS LOAD-BEARING.
   * `tools/ga-gate/check-no-direct-store-writes.ts` (P6) classifies every
   * method call on a `*Store` receiver by a FAIL-CLOSED allowlist of read
   * PREFIXES — the name must START with `get`/`has`/`is`/`read`/… .
   * `cameraOf` puts the read verb in the SUFFIX, matched nothing, and this
   * pure read was therefore counted as a direct store write from UI, which
   * broke the ratchet. The fix is to speak the vocabulary the repo already
   * uses, never to teach the gate an `…Of` suffix: a suffix rule would
   * silently exempt a future `mutateOf`/`applyOf`, which is exactly the
   * fail-open hole the prefix allowlist exists to prevent.
   */
  getCamera(kind: SketchViewKind): ViewCamera;
}

function freezeCameras(
  cameras: Record<SketchViewKind, ViewCamera>,
): Readonly<Record<SketchViewKind, ViewCamera>> {
  return Object.freeze({ ...cameras });
}

function defaultCameras(): Record<SketchViewKind, ViewCamera> {
  const out = {} as Record<SketchViewKind, ViewCamera>;
  for (const k of SKETCH_VIEW_KINDS) out[k] = DEFAULT_VIEW_CAMERA;
  return out;
}

function sameCamera(a: ViewCamera, b: ViewCamera): boolean {
  return a.zoom === b.zoom && a.panX === b.panX && a.panZ === b.panZ;
}

export function createSketchViewStore(initial: SketchViewKind = 'plan'): SketchViewStore {
  if (!isSketchViewKind(initial)) {
    throw new Error(`createSketchViewStore: invalid initial view "${String(initial)}".`);
  }

  const cameras = defaultCameras();
  let snap: SketchViewSnapshot = Object.freeze({
    active: initial,
    cameras: freezeCameras(cameras),
    version: 0,
  });
  const subscribers = new Set<SketchViewSubscriber>();

  function publish(active: SketchViewKind): void {
    snap = Object.freeze({
      active,
      cameras: freezeCameras(cameras),
      version: snap.version + 1,
    });
    for (const fn of subscribers) fn(snap);
  }

  return {
    get() {
      return snap;
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
    setActive(next) {
      if (!isSketchViewKind(next)) {
        throw new Error(`sketchViewStore.setActive: invalid view "${String(next)}".`);
      }
      if (next === snap.active) return;
      publish(next);
    },
    setCamera(kind, camera) {
      if (!isSketchViewKind(kind)) {
        throw new Error(`sketchViewStore.setCamera: invalid view "${String(kind)}".`);
      }
      if (!Number.isFinite(camera.zoom) || camera.zoom <= 0) {
        throw new Error(`sketchViewStore.setCamera: zoom must be > 0 (got ${camera.zoom}).`);
      }
      if (!Number.isFinite(camera.panX) || !Number.isFinite(camera.panZ)) {
        throw new Error('sketchViewStore.setCamera: pan must be finite.');
      }
      const next: ViewCamera = Object.freeze({
        zoom: camera.zoom,
        panX: camera.panX,
        panZ: camera.panZ,
      });
      if (sameCamera(cameras[kind], next)) return;
      cameras[kind] = next;
      publish(snap.active);
    },
    getCamera(kind) {
      if (!isSketchViewKind(kind)) {
        throw new Error(`sketchViewStore.getCamera: invalid view "${String(kind)}".`);
      }
      return cameras[kind];
    },
  };
}
