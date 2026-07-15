// §FIX-GLOBE-ACTIVATE-STALE-VIEWER (L-313) — the CesiumThreeBridge must ALWAYS activate against
// the CURRENT, live Cesium viewer, re-acquired from the owner (CesiumViewport, via a provider).
//
// THE BUG: after a WebGPU device-loss cascade, `§FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE` disposes
// and re-creates CesiumViewport's viewer. The bridge used to CAPTURE the viewer at construction,
// so a GIS re-entry called `bridge.activate()` which read `this.cesiumViewer.scene` off the
// DESTROYED viewer — Cesium's `scene` getter reads `_cesiumWidget.scene` off `undefined` and
// throws "Cannot read properties of undefined (reading 'scene')". That unhandled throw hung the
// view-activation loading overlay for 25s at stage "content".
//
// THE TOOTH: after a dispose+recreate, activate() must bind to the NEW viewer and NEVER read
// `.scene` off the disposed one; when no live viewer exists it must FAIL FAST with a clear error
// (so the caller surfaces the overlay's "Try again"), not the raw `.scene`-of-undefined crash.
//
// Mocks the heavy `cesium` + THREE modules and drives the SHIPPED class on stub viewers.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('cesium', () => ({
  Cartesian3: { clone: (c: unknown) => c },
  Transforms: { eastNorthUpToFixedFrame: () => new Array(16).fill(0) },
  Matrix4: class {},
  PerspectiveFrustum: class {},
  Math: { toDegrees: (r: number) => r },
}));

vi.mock('@pryzm/renderer-three/three', () => ({
  Group: class { name = ''; },
  Matrix4: class { set() {} copy() {} },
  Scene: class {},
  PerspectiveCamera: class {},
}));

import { CesiumThreeBridge } from '../src/CesiumThreeBridge';

/** A stub Cesium Viewer whose `.scene` getter THROWS once destroyed — exactly like the real one. */
function makeViewer() {
  const postRender = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const sceneObj = { postRender };
  return {
    _destroyed: false,
    isDestroyed(): boolean { return this._destroyed; },
    camera: {},
    get scene() {
      if (this._destroyed) {
        throw new TypeError("Cannot read properties of undefined (reading 'scene')");
      }
      return sceneObj;
    },
    _postRender: postRender,
  };
}

function makeWorld() {
  return { camera: { three: {} }, scene: { three: { children: [] } } };
}

describe('§FIX-GLOBE-ACTIVATE-STALE-VIEWER (L-313) — CesiumThreeBridge.activate re-acquires the live viewer', () => {
  beforeEach(() => {
    (globalThis as unknown as { window?: unknown }).window = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('after a dispose+recreate (device-loss cascade), activate() binds to the NEW viewer and does NOT touch the disposed one', () => {
    let current = makeViewer(); // viewer A
    const bridge = new CesiumThreeBridge(() => current, makeWorld());

    bridge.activate();
    expect(current._postRender.addEventListener).toHaveBeenCalledTimes(1);

    // Simulate §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE: dispose A, re-create as B.
    const disposedA = current;
    disposedA._destroyed = true; // A.scene now THROWS if read
    const viewerB = makeViewer();
    current = viewerB;

    // GIS re-entry — must NOT throw the raw ".scene of undefined" crash, must bind to B.
    expect(() => bridge.activate()).not.toThrow();
    expect(viewerB._postRender.addEventListener).toHaveBeenCalledTimes(1);
    // The disposed A got no NEW listener on re-activation (only the original activate).
    expect(disposedA._postRender.addEventListener).toHaveBeenCalledTimes(1);
  });

  it('fails FAST with a clear error (not the raw TypeError) when the provider yields only a DISPOSED viewer', () => {
    const disposed = makeViewer();
    disposed._destroyed = true;
    const bridge = new CesiumThreeBridge(() => disposed, makeWorld());

    let thrown: unknown;
    try { bridge.activate(); } catch (e) { thrown = e; }

    expect(thrown).toBeInstanceOf(Error);
    expect(String((thrown as Error).message)).toMatch(/no live Cesium viewer\/scene available/);
    // The controlled fail-fast — NOT the raw ".scene of undefined" crash that hung the overlay.
    expect(String((thrown as Error).message)).not.toMatch(/reading 'scene'/);
    // The disposed viewer's throwing `.scene` getter was never invoked (isDestroyed short-circuits).
    expect(disposed._postRender.addEventListener).not.toHaveBeenCalled();
  });

  it('fails FAST when the owner has no viewer at all (mid-recreate → provider returns null)', () => {
    const bridge = new CesiumThreeBridge(() => null, makeWorld());
    expect(() => bridge.activate()).toThrow(/no live Cesium viewer\/scene available/);
  });

  it('accepts a raw live Viewer for backward compatibility', () => {
    const viewer = makeViewer();
    const bridge = new CesiumThreeBridge(viewer as never, makeWorld());
    expect(() => bridge.activate()).not.toThrow();
    expect(viewer._postRender.addEventListener).toHaveBeenCalledTimes(1);
  });
});
