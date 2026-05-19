// GpuPickStrategy tests (S16-T1, 4 original + 5 depth cases Task 2.4).

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { GpuPickStrategy } from '../src/gpu-pick.js';
import {
  encodeIndexToRGBA,
  type ElementRegistry,
  type GpuPickRenderer,
  type PickContext,
} from '../src/types.js';

// ---------------------------------------------------------------------------
// Fake renderer helpers
// ---------------------------------------------------------------------------

interface FakeRT {
  readonly width: number;
  readonly height: number;
  pixels: Uint8Array;
}

/**
 * Simple fake renderer — a single shared pixel buffer backed by one render
 * target.  Used by the original tests; both the ID target and depth target
 * share the same pixel store, so depth bytes are whatever the test last
 * loaded (which is fine for tests that don't inspect distance).
 */
function makeFakeRenderer(width: number, height: number): {
  renderer: GpuPickRenderer;
  setPixels(fill: (x: number, y: number) => readonly [number, number, number, number]): void;
  rt: FakeRT;
} {
  const rt: FakeRT = { width, height, pixels: new Uint8Array(width * height * 4) };
  const renderer: GpuPickRenderer = {
    width,
    height,
    renderToTarget(_scene, _cam, _target, _override) {
      // No-op for fake; pixels are pre-loaded by the test.
    },
    readPixels(_target, x, y, w, h, buffer) {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const srcIdx = ((y + dy) * width + (x + dx)) * 4;
          const dstIdx = (dy * w + dx) * 4;
          buffer[dstIdx + 0] = rt.pixels[srcIdx + 0] ?? 0;
          buffer[dstIdx + 1] = rt.pixels[srcIdx + 1] ?? 0;
          buffer[dstIdx + 2] = rt.pixels[srcIdx + 2] ?? 0;
          buffer[dstIdx + 3] = rt.pixels[srcIdx + 3] ?? 0;
        }
      }
    },
    createRenderTarget(_w, _h) {
      return rt as unknown as THREE.WebGLRenderTarget;
    },
  };
  function setPixels(fill: (x: number, y: number) => readonly [number, number, number, number]) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [r, g, b, a] = fill(x, y);
        const idx = (y * width + x) * 4;
        rt.pixels[idx + 0] = r;
        rt.pixels[idx + 1] = g;
        rt.pixels[idx + 2] = b;
        rt.pixels[idx + 3] = a;
      }
    }
  }
  return { renderer, setPixels, rt };
}

/**
 * Depth-aware fake renderer — two separate render targets returned in order
 * (first call → idRt, second call → depthRt).  Successive `readPixels` calls
 * return from the corresponding pixel store, allowing tests to pre-load
 * independent ID and depth pixel buffers.
 *
 * readPixels call order mirrors renderToTarget call order:
 *   call 0 → ID target pixels, call 1 → depth target pixels.
 */
function makeDepthAwareFakeRenderer(width: number, height: number): {
  renderer: GpuPickRenderer;
  idRt: FakeRT;
  depthRt: FakeRT;
  setIdPixels(fill: (x: number, y: number) => readonly [number, number, number, number]): void;
  setDepthPixels(fill: (x: number, y: number) => readonly [number, number, number, number]): void;
} {
  const idRt: FakeRT = { width, height, pixels: new Uint8Array(width * height * 4) };
  const depthRt: FakeRT = { width, height, pixels: new Uint8Array(width * height * 4) };

  // Map render target objects to their pixel stores.
  const idRtHandle = {} as THREE.WebGLRenderTarget;
  const depthRtHandle = {} as THREE.WebGLRenderTarget;
  const pixelsFor = new Map<object, FakeRT>([
    [idRtHandle, idRt],
    [depthRtHandle, depthRt],
  ]);

  let rtCallCount = 0;
  const renderer: GpuPickRenderer = {
    width,
    height,
    renderToTarget(_scene, _cam, _target, _override) {
      // No-op; pixel stores are pre-loaded by the test.
    },
    readPixels(target, x, y, w, h, buffer) {
      const store = pixelsFor.get(target) ?? idRt;
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const srcIdx = ((y + dy) * width + (x + dx)) * 4;
          const dstIdx = (dy * w + dx) * 4;
          buffer[dstIdx + 0] = store.pixels[srcIdx + 0] ?? 0;
          buffer[dstIdx + 1] = store.pixels[srcIdx + 1] ?? 0;
          buffer[dstIdx + 2] = store.pixels[srcIdx + 2] ?? 0;
          buffer[dstIdx + 3] = store.pixels[srcIdx + 3] ?? 0;
        }
      }
    },
    createRenderTarget(_w, _h) {
      return rtCallCount++ === 0 ? idRtHandle : depthRtHandle;
    },
  };

  function setPixels(
    rt: FakeRT,
    fill: (x: number, y: number) => readonly [number, number, number, number],
  ) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [r, g, b, a] = fill(x, y);
        const idx = (y * width + x) * 4;
        rt.pixels[idx + 0] = r;
        rt.pixels[idx + 1] = g;
        rt.pixels[idx + 2] = b;
        rt.pixels[idx + 3] = a;
      }
    }
  }

  return {
    renderer,
    idRt,
    depthRt,
    setIdPixels: (fill) => setPixels(idRt, fill),
    setDepthPixels: (fill) => setPixels(depthRt, fill),
  };
}

/**
 * Pack a float depth value ∈ [0,1] into 4 RGBA bytes using the same
 * algorithm as THREE's `packDepthToRGBA` GLSL function.
 * Used in tests to synthesise depth pixel buffers without running WebGL.
 */
function packDepthToRGBA(depth: number): readonly [number, number, number, number] {
  const factors = [1.0, 255.0, 65025.0, 16581375.0];
  const r: number[] = factors.map((f) => (depth * f) % 1.0);
  // Remove the carry that each channel gives to the next.
  r[0] = r[0]! - r[1]! / 255.0;
  r[1] = r[1]! - r[2]! / 255.0;
  r[2] = r[2]! - r[3]! / 255.0;
  return [
    Math.round(Math.max(0, r[0]!) * 255),
    Math.round(Math.max(0, r[1]!) * 255),
    Math.round(Math.max(0, r[2]!) * 255),
    Math.round(Math.max(0, r[3]!) * 255),
  ];
}

function fakeRegistry(entries: { id: string; kind: string; mesh: THREE.Mesh }[]): ElementRegistry {
  return {
    kindOf: (id) => entries.find((e) => e.id === id)?.kind as never,
    ids: () => entries.map((e) => e.id),
    objectFor: (id) => entries.find((e) => e.id === id)?.mesh ?? null,
  };
}

function makeMesh(): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
}

function makeCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  cam.position.set(0, 0, 5);
  cam.lookAt(0, 0, 0);
  return cam;
}

// ---------------------------------------------------------------------------
// Original tests (S16-T1 — must keep passing after Task 2.4)
// ---------------------------------------------------------------------------

describe('GpuPickStrategy (S16-T1)', () => {
  it('pick at center hits the only element (slot=1)', () => {
    const strategy = new GpuPickStrategy({ targetWidth: 4, targetHeight: 4 });
    const mesh = makeMesh();
    const registry = fakeRegistry([{ id: 'wall-1', kind: 'wall', mesh }]);
    const { renderer, setPixels } = makeFakeRenderer(4, 4);
    const ctx: PickContext = {
      camera: makeCamera(),
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
      scene: new THREE.Scene(),
      renderer,
    };

    // Sync once so slot 1 is assigned to wall-1, then pre-load pixels.
    strategy.pick({ x: 50, y: 50 }, ctx); // first pick — assigns slot
    const [r, g, b, a] = encodeIndexToRGBA(1);
    setPixels(() => [r, g, b, a]);

    const result = strategy.pick({ x: 50, y: 50 }, ctx);
    expect(result).not.toBeNull();
    expect(result!.elementId).toBe('wall-1');
    expect(result!.elementKind).toBe('wall');
  });

  it('pick at empty space returns null', () => {
    const strategy = new GpuPickStrategy({ targetWidth: 4, targetHeight: 4 });
    const mesh = makeMesh();
    const registry = fakeRegistry([{ id: 'wall-1', kind: 'wall', mesh }]);
    const { renderer, setPixels } = makeFakeRenderer(4, 4);
    setPixels(() => [0, 0, 0, 0]); // alpha=0 → "no hit"

    const result = strategy.pick(
      { x: 50, y: 50 },
      {
        camera: makeCamera(),
        elementRegistry: registry,
        viewportWidth: 100,
        viewportHeight: 100,
        scene: new THREE.Scene(),
        renderer,
      },
    );
    expect(result).toBeNull();
  });

  it('pick respects depth ordering by reading the front-most pixel', () => {
    // Two elements; pixel buffer pre-loaded to slot=2 (the "front" one).
    const strategy = new GpuPickStrategy({ targetWidth: 4, targetHeight: 4 });
    const meshBack = makeMesh();
    const meshFront = makeMesh();
    const registry = fakeRegistry([
      { id: 'back', kind: 'wall', mesh: meshBack },
      { id: 'front', kind: 'door', mesh: meshFront },
    ]);
    const { renderer, setPixels } = makeFakeRenderer(4, 4);
    const ctx: PickContext = {
      camera: makeCamera(),
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
      scene: new THREE.Scene(),
      renderer,
    };
    strategy.pick({ x: 50, y: 50 }, ctx); // assigns slot 1 to 'back', slot 2 to 'front'
    const [r, g, b, a] = encodeIndexToRGBA(2);
    setPixels(() => [r, g, b, a]);

    const result = strategy.pick({ x: 50, y: 50 }, ctx);
    expect(result).not.toBeNull();
    expect(result!.elementId).toBe('front');
    expect(result!.elementKind).toBe('door');
  });

  it('pickRect returns all unique elements covered by the buffer', () => {
    const strategy = new GpuPickStrategy({ targetWidth: 4, targetHeight: 4 });
    const meshA = makeMesh();
    const meshB = makeMesh();
    const meshC = makeMesh();
    const registry = fakeRegistry([
      { id: 'a', kind: 'wall', mesh: meshA },
      { id: 'b', kind: 'door', mesh: meshB },
      { id: 'c', kind: 'window', mesh: meshC },
    ]);
    const { renderer, setPixels } = makeFakeRenderer(4, 4);
    const ctx: PickContext = {
      camera: makeCamera(),
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
      scene: new THREE.Scene(),
      renderer,
    };
    strategy.pick({ x: 0, y: 0 }, ctx); // assigns slots 1/2/3
    setPixels((x, y) => {
      // Top-left = slot 1 (a); top-right = slot 2 (b); bottom = slot 3 (c)
      const slot = y < 2 ? (x < 2 ? 1 : 2) : 3;
      return encodeIndexToRGBA(slot);
    });

    const rectResults = strategy.pickRect(
      { x: 0, y: 0, w: 100, h: 100 },
      ctx,
    );
    const ids = new Set(rectResults.map((r) => r.elementId));
    expect(ids.has('a')).toBe(true);
    expect(ids.has('b')).toBe(true);
    expect(ids.has('c')).toBe(true);
    expect(rectResults).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Task 2.4 — Depth readback tests
// ---------------------------------------------------------------------------

describe('GpuPickStrategy depth readback (Task 2.4 / R10 / C04 §3)', () => {
  it('D1: pick returns non-zero distance when depth target provides valid depth', () => {
    // Arrange — camera at z=5, looking at origin. Pack a mid-scene depth.
    const camera = makeCamera(); // near=0.1, far=100, pos=(0,0,5)
    // Choose a world point at z=0 (distance=5 from camera).
    // Project it to get the NDC depth, then pack that depth.
    const worldPoint = new THREE.Vector3(0, 0, 0);
    const ndcPoint = worldPoint.clone().project(camera);
    // ndcPoint.z ∈ [-1,1]; depth buffer stores (ndcZ+1)/2.
    const ndcDepthValue = (ndcPoint.z + 1) / 2;
    const [dr, dg, db, da] = packDepthToRGBA(ndcDepthValue);

    const strategy = new GpuPickStrategy({ targetWidth: 4, targetHeight: 4 });
    const mesh = makeMesh();
    const registry = fakeRegistry([{ id: 'wall-1', kind: 'wall', mesh }]);
    const { renderer, setIdPixels, setDepthPixels } = makeDepthAwareFakeRenderer(4, 4);
    const ctx: PickContext = {
      camera,
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
      scene: new THREE.Scene(),
      renderer,
    };

    // First pick: assigns slot 1 to wall-1, allocates both render targets.
    strategy.pick({ x: 50, y: 50 }, ctx);

    // Pre-load ID pixels (slot 1 = wall-1) and depth pixels (packed mid-scene).
    const [r, g, b, a] = encodeIndexToRGBA(1);
    setIdPixels(() => [r, g, b, a]);
    setDepthPixels(() => [dr, dg, db, da]);

    const result = strategy.pick({ x: 50, y: 50 }, ctx);
    expect(result).not.toBeNull();
    expect(result!.elementId).toBe('wall-1');
    // Distance from camera (0,0,5) to world origin (0,0,0) ≈ 5.
    // Allow ±0.5 tolerance for floating-point depth precision.
    expect(result!.distance).toBeGreaterThan(0);
    expect(result!.distance).toBeCloseTo(5.0, 0);
  });

  it('D2: pick falls back to distance=0 when depth pixel is all-zero (background)', () => {
    const strategy = new GpuPickStrategy({ targetWidth: 4, targetHeight: 4 });
    const mesh = makeMesh();
    const registry = fakeRegistry([{ id: 'wall-1', kind: 'wall', mesh }]);
    const { renderer, setIdPixels } = makeDepthAwareFakeRenderer(4, 4);
    const ctx: PickContext = {
      camera: makeCamera(),
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
      scene: new THREE.Scene(),
      renderer,
    };

    strategy.pick({ x: 50, y: 50 }, ctx); // allocate targets + assign slot

    const [r, g, b, a] = encodeIndexToRGBA(1);
    setIdPixels(() => [r, g, b, a]);
    // Depth pixels left as all-zero → unpackRGBAToDepth = 0 → background → fallback.

    const result = strategy.pick({ x: 50, y: 50 }, ctx);
    expect(result).not.toBeNull();
    expect(result!.elementId).toBe('wall-1');
    expect(result!.distance).toBe(0);
  });

  it('D3: pickRect returns elements sorted front-to-back by distance', () => {
    // Two elements at different depths; front one should come first in results.
    const camera = makeCamera(); // camera at z=5
    const strategy = new GpuPickStrategy({ targetWidth: 4, targetHeight: 4 });
    const meshClose = makeMesh();
    const meshFar = makeMesh();
    const registry = fakeRegistry([
      { id: 'close', kind: 'wall', mesh: meshClose },
      { id: 'far', kind: 'door', mesh: meshFar },
    ]);
    const { renderer, setIdPixels, setDepthPixels } = makeDepthAwareFakeRenderer(4, 4);
    const ctx: PickContext = {
      camera,
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
      scene: new THREE.Scene(),
      renderer,
    };

    // Assign slots (slot 1 = close, slot 2 = far).
    strategy.pick({ x: 0, y: 0 }, ctx);

    // ID buffer: left half = slot 1 (close), right half = slot 2 (far).
    setIdPixels((x) => {
      const slot = x < 2 ? 1 : 2;
      return encodeIndexToRGBA(slot);
    });

    // Depth for 'close' element: world z=2 (distance≈3); 'far': world z=-2 (distance≈7).
    const closeNdcZ = new THREE.Vector3(0, 0, 2).project(camera).z;
    const farNdcZ = new THREE.Vector3(0, 0, -2).project(camera).z;
    const closeDepth = (closeNdcZ + 1) / 2;
    const farDepth = (farNdcZ + 1) / 2;
    const [cr, cg, cb, ca] = packDepthToRGBA(closeDepth);
    const [fr, fg, fb, fa] = packDepthToRGBA(farDepth);

    setDepthPixels((x) => {
      return x < 2 ? [cr, cg, cb, ca] : [fr, fg, fb, fa];
    });

    const results = strategy.pickRect({ x: 0, y: 0, w: 100, h: 100 }, ctx);
    expect(results).toHaveLength(2);
    // Front-to-back: 'close' first (shorter distance), 'far' second.
    expect(results[0]!.elementId).toBe('close');
    expect(results[1]!.elementId).toBe('far');
    expect(results[0]!.distance).toBeLessThan(results[1]!.distance);
    expect(results[0]!.distance).toBeGreaterThan(0);
    expect(results[1]!.distance).toBeGreaterThan(0);
  });

  it('D4: hitPoint uses actual depth not near-plane estimate when depth available', () => {
    // Verify hitPoint.z changes between the near-plane estimate and the real depth.
    const camera = makeCamera(); // pos=(0,0,5), looking at origin
    const strategy = new GpuPickStrategy({ targetWidth: 4, targetHeight: 4 });
    const mesh = makeMesh();
    const registry = fakeRegistry([{ id: 'slab-1', kind: 'slab', mesh }]);
    const { renderer, setIdPixels, setDepthPixels } = makeDepthAwareFakeRenderer(4, 4);
    const ctx: PickContext = {
      camera,
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
      scene: new THREE.Scene(),
      renderer,
    };

    // World point at z=1 — definitely not at the near plane or far plane.
    const targetWorld = new THREE.Vector3(0, 0, 1);
    const ndcZ = targetWorld.clone().project(camera).z;
    const ndcDepth = (ndcZ + 1) / 2;
    const [dr, dg, db, da] = packDepthToRGBA(ndcDepth);

    strategy.pick({ x: 50, y: 50 }, ctx); // allocate + assign slot
    const [r, g, b, a] = encodeIndexToRGBA(1);
    setIdPixels(() => [r, g, b, a]);
    setDepthPixels(() => [dr, dg, db, da]);

    const result = strategy.pick({ x: 50, y: 50 }, ctx);
    expect(result).not.toBeNull();

    // The hitPoint.z should be close to 1 (world z of target), not at near-plane
    // (~4.9, which is what unprojectScreenToWorld gives at ndcZ=0.5 with near=0.1).
    expect(result!.hitPoint.z).toBeCloseTo(1, 0);

    // Distance from camera (0,0,5) to (≈0,≈0,1) ≈ 4.
    expect(result!.distance).toBeCloseTo(4, 0);
  });

  it('D5: pick with no renderer falls back gracefully to distance=0', () => {
    const strategy = new GpuPickStrategy({ targetWidth: 4, targetHeight: 4 });
    const registry = fakeRegistry([]);
    const ctx: PickContext = {
      camera: makeCamera(),
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
      // No renderer, no scene.
    };
    const result = strategy.pick({ x: 50, y: 50 }, ctx);
    expect(result).toBeNull(); // null from pickInternal, not a crash
  });
});
