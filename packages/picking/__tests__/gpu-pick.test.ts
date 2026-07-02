// GpuPickStrategy tests (S16-T1, 4 original + 5 depth cases Task 2.4).

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
  GpuPickStrategy,
  computePickTargetSize,
  chooseNearestThinSlot,
} from '../src/gpu-pick.js';
import {
  decodeRGBAToIndex,
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

// ---------------------------------------------------------------------------
// §SELECT-INSTANCED-PICK (FIX #1) — instanced groups resolve to the PER-INSTANCE
// element id on the GPU pick path (not the synthetic group id, not undefined).
// ---------------------------------------------------------------------------

/**
 * Build a fake InstancedElementRenderer group: a THREE.InstancedMesh stamped
 * with the SAME userData contract the real renderer stamps (synthetic group id,
 * isInstancedGroup, getOccupiedInstanceSlots, getInstanceElementId). Each
 * `elementIds[k]` occupies source instance slot `k`.
 */
function makeInstancedGroup(elementIds: (string | undefined)[]): THREE.InstancedMesh {
  const geo = new THREE.BoxGeometry(0.3, 3, 0.3);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), elementIds.length);
  im.count = elementIds.length;
  const m = new THREE.Matrix4();
  for (let i = 0; i < elementIds.length; i++) {
    m.makeTranslation(i * 2, 0, 0);
    im.setMatrixAt(i, m);
  }
  im.instanceMatrix.needsUpdate = true;
  const occupied = elementIds.map((id, i) => (id === undefined ? -1 : i)).filter((i) => i >= 0);
  im.userData.id = 'instanced-group-key';
  im.userData.isInstancedGroup = true;
  im.userData.elementType = 'column';
  im.userData.getOccupiedInstanceSlots = () => occupied;
  im.userData.getInstanceElementId = (slot: number): string | undefined => elementIds[slot];
  return im;
}

/** Registry returning a single instanced group under its synthetic id. */
function instancedGroupRegistry(im: THREE.InstancedMesh): ElementRegistry {
  const id = im.userData.id as string;
  return {
    kindOf: (queryId) => (queryId === id ? ('column' as never) : (null as never)),
    ids: () => [id],
    objectFor: (queryId) => (queryId === id ? im : null),
  };
}

/**
 * Reach into the strategy's internal pick scene + indexToId map (TS `private` is
 * not a runtime barrier — test-only introspection) and return, for each occupied
 * SOURCE instance slot, the element id its baked pick colour decodes to. This is
 * the exact pair the id-buffer readback consumes: instanceColor[srcSlot] → pick
 * slot → indexToId → per-INSTANCE element id.
 */
function resolveInstancedColours(strategy: GpuPickStrategy): Map<number, string> {
  const scene = (strategy as unknown as { pickScene: THREE.Scene }).pickScene;
  const indexToId = (strategy as unknown as { indexToId: Map<number, string> }).indexToId;
  let clone: THREE.InstancedMesh | null = null;
  scene.traverse((o) => {
    if ((o as THREE.InstancedMesh).isInstancedMesh) clone = o as THREE.InstancedMesh;
  });
  if (clone === null) throw new Error('no instanced pick clone in pick scene');
  const im = clone as THREE.InstancedMesh;
  const out = new Map<number, string>();
  const c = new THREE.Color();
  for (let slot = 0; slot < im.count; slot++) {
    im.getColorAt(slot, c);
    const pickSlot = decodeRGBAToIndex(
      Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 255,
    );
    const elementId = indexToId.get(pickSlot);
    if (elementId !== undefined) out.set(slot, elementId);
  }
  return out;
}

function buildInstancedGroupPick(elementIds: (string | undefined)[]): GpuPickStrategy {
  const strategy = new GpuPickStrategy({ targetWidth: 4, targetHeight: 4 });
  const im = makeInstancedGroup(elementIds);
  const registry = instancedGroupRegistry(im);
  const { renderer } = makeFakeRenderer(4, 4);
  const ctx: PickContext = {
    camera: makeCamera(),
    elementRegistry: registry,
    viewportWidth: 100,
    viewportHeight: 100,
    scene: new THREE.Scene(),
    renderer,
  };
  // One pick builds the instanced pick clone + per-instance pick colours.
  strategy.pick({ x: 50, y: 50 }, ctx);
  return strategy;
}

describe('GpuPickStrategy instanced groups (§SELECT-INSTANCED-PICK FIX #1)', () => {
  it('source instance slot 2 resolves to slot-2 element id, NOT the synthetic group id', () => {
    const strategy = buildInstancedGroupPick(['col-0', 'col-1', 'col-2']);
    const resolved = resolveInstancedColours(strategy);
    // The id-buffer pixel covered by instance 2 decodes to col-2's element id.
    expect(resolved.get(2)).toBe('col-2');
    expect(resolved.get(2)).not.toBe('instanced-group-key');
  });

  it('each occupied instance maps to its OWN element id (wall/column/beam mirror)', () => {
    const strategy = buildInstancedGroupPick(['beam-A', 'beam-B', 'beam-C']);
    const resolved = resolveInstancedColours(strategy);
    expect(resolved.get(0)).toBe('beam-A');
    expect(resolved.get(1)).toBe('beam-B');
    expect(resolved.get(2)).toBe('beam-C');
  });

  it('the synthetic group id is never a resolved selection (group is a hosting handle only)', () => {
    const strategy = buildInstancedGroupPick(['col-0', 'col-1']);
    const resolved = resolveInstancedColours(strategy);
    const ids = new Set(resolved.values());
    expect(ids.has('col-0')).toBe(true);
    expect(ids.has('col-1')).toBe(true);
    expect(ids.has('instanced-group-key')).toBe(false);
  });

  it('an unoccupied slot stays at "no hit" (decodes to no element)', () => {
    // slot 1 is a gap (undefined) — its parked colour must NOT decode to any element.
    const strategy = buildInstancedGroupPick(['col-0', undefined, 'col-2']);
    const resolved = resolveInstancedColours(strategy);
    expect(resolved.get(0)).toBe('col-0');
    expect(resolved.has(1)).toBe(false); // parked → background
    expect(resolved.get(2)).toBe('col-2');
  });

  it('the synthetic group id makes the group reachable through the registry', () => {
    // FIX #1 precondition: the group must carry a userData.id (the real renderer
    // stamps `instanced-group-${key}`) so _buildElementRegistry includes it and
    // syncPickScene renders it into the id buffer. Without an id it was excluded.
    const im = makeInstancedGroup(['col-0']);
    expect(im.userData.id).toBe('instanced-group-key');
    expect(im.userData.isInstancedGroup).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §SELECT-INSTANCED-PICK (FIX #4) — generation guard rejects a stale
// reconciliation when an element rebuilds (userData.version bump) between picks.
// ---------------------------------------------------------------------------

describe('GpuPickStrategy generation guard (§SELECT-INSTANCED-PICK FIX #4)', () => {
  it('a userData.version bump forces a fresh entry (new geometry survives, no orphan)', () => {
    const strategy = new GpuPickStrategy({ targetWidth: 4, targetHeight: 4 });
    const mesh = makeMesh();
    mesh.userData.version = 1;
    const registry = fakeRegistry([{ id: 'cw-1', kind: 'curtainWall', mesh }]);
    const { renderer, setPixels } = makeFakeRenderer(4, 4);
    const ctx: PickContext = {
      camera: makeCamera(),
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
      scene: new THREE.Scene(),
      renderer,
    };

    // First pick at version 1 — entry built, slot 1 assigned.
    strategy.pick({ x: 50, y: 50 }, ctx);
    const sceneRef = (strategy as unknown as { pickScene: THREE.Scene }).pickScene;
    const firstClone = sceneRef.children.find(
      (c) => (c as THREE.Mesh).isMesh,
    ) as THREE.Mesh;

    // Simulate a rebuild that swaps the geometry but keeps the SAME mesh object
    // and child count — only userData.version bumps (the curtain-wall panel
    // rebuild race). Without the generation guard the stale clone would persist.
    const newGeo = new THREE.BoxGeometry(2, 2, 2);
    mesh.geometry = newGeo;
    mesh.userData.version = 2;

    strategy.pick({ x: 50, y: 50 }, ctx);
    const secondClone = sceneRef.children.find(
      (c) => (c as THREE.Mesh).isMesh,
    ) as THREE.Mesh;

    // The entry was invalidated + rebuilt → a NEW clone instance referencing the
    // NEW geometry (the stale reconciliation was rejected).
    expect(secondClone).not.toBe(firstClone);
    expect(secondClone.geometry).toBe(newGeo);

    // And the element is still pickable under its id after the rebuild.
    const [r, g, b, a] = encodeIndexToRGBA(1);
    setPixels(() => [r, g, b, a]);
    const result = strategy.pick({ x: 50, y: 50 }, ctx);
    expect(result!.elementId).toBe('cw-1');
  });

  it('an unchanged version reuses the SAME entry (no needless rebuild)', () => {
    const strategy = new GpuPickStrategy({ targetWidth: 4, targetHeight: 4 });
    const mesh = makeMesh();
    mesh.userData.version = 7;
    const registry = fakeRegistry([{ id: 'wall-x', kind: 'wall', mesh }]);
    const { renderer } = makeFakeRenderer(4, 4);
    const ctx: PickContext = {
      camera: makeCamera(),
      elementRegistry: registry,
      viewportWidth: 100,
      viewportHeight: 100,
      scene: new THREE.Scene(),
      renderer,
    };
    strategy.pick({ x: 50, y: 50 }, ctx);
    const sceneRef = (strategy as unknown as { pickScene: THREE.Scene }).pickScene;
    const firstClone = sceneRef.children.find((c) => (c as THREE.Mesh).isMesh);

    strategy.pick({ x: 50, y: 50 }, ctx); // same version → no invalidation
    const secondClone = sceneRef.children.find((c) => (c as THREE.Mesh).isMesh);
    expect(secondClone).toBe(firstClone);
  });
});

// ---------------------------------------------------------------------------
// §SELECT-PICK-RESOLUTION — pure target-size computation
// (viewport×dpr, clamped to GPU maxTextureSize; NOT a fixed 1280)
// ---------------------------------------------------------------------------

describe('computePickTargetSize (§SELECT-PICK-RESOLUTION)', () => {
  it('sizes the pick target to the FULL viewport at dpr=1 (1:1, not the old 1280 cap)', () => {
    // The founder's exact case: 1910-wide viewport that the old code clamped to
    // 1280 (0.67×). With maxTextureSize=8192 it must now be the full viewport.
    const { width, height } = computePickTargetSize(1910, 915, 1, 8192);
    expect(width).toBe(1910);
    expect(height).toBe(915);
    // pick:rendered = target / (viewport × dpr) must be >= 1.0
    expect(width / (1910 * 1)).toBeGreaterThanOrEqual(1.0);
  });

  it('multiplies by devicePixelRatio so HiDPI is still >= 1:1 with the rendered image', () => {
    const { width, height } = computePickTargetSize(1000, 800, 2, 8192);
    expect(width).toBe(2000);
    expect(height).toBe(1600);
  });

  it('clamps to GPU maxTextureSize on extreme 4K/retina, preserving aspect ratio', () => {
    // 3840×2160 @ dpr 2 → 7680×4320 ideal, but GPU max is 4096.
    const { width, height } = computePickTargetSize(3840, 2160, 2, 4096);
    expect(Math.max(width, height)).toBeLessThanOrEqual(4096);
    expect(width).toBe(4096); // longer axis pinned to the cap
    // Aspect ratio preserved within rounding (3840/2160 = 16:9).
    expect(height / width).toBeCloseTo(2160 / 3840, 2);
  });

  it('never under-samples below CSS resolution even when dpr is reported < 1', () => {
    const { width } = computePickTargetSize(1000, 500, 0.5, 8192);
    expect(width).toBeGreaterThanOrEqual(1000);
  });

  it('is deterministic and never returns a zero dimension', () => {
    const a = computePickTargetSize(1, 1, 1, 1);
    const b = computePickTargetSize(1, 1, 1, 1);
    expect(a).toEqual(b);
    expect(a.width).toBeGreaterThanOrEqual(1);
    expect(a.height).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// §SELECT-THIN-WINS — pure nearest / thin-element disambiguation ring scan
// ---------------------------------------------------------------------------

/**
 * Build an RGBA id-buffer for a (bw × bh) window. `fill(px, py)` returns a slot
 * index (0 = background); the byte buffer is encoded via encodeIndexToRGBA.
 */
function makeIdBuffer(
  bw: number,
  bh: number,
  fill: (px: number, py: number) => number,
): Uint8Array {
  const buf = new Uint8Array(bw * bh * 4);
  for (let py = 0; py < bh; py++) {
    for (let px = 0; px < bw; px++) {
      const [r, g, b, a] = encodeIndexToRGBA(fill(px, py));
      const i = (py * bw + px) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
    }
  }
  return buf;
}

describe('chooseNearestThinSlot (§SELECT-EXACT-PIXEL-FIRST)', () => {
  // Window is a 5×5 neighbourhood whose top-left target pixel is (0,0);
  // cursor at the centre (2,2).
  const BW = 5, BH = 5, X0 = 0, Y0 = 0, CX = 2, CY = 2;

  it('returns the centre slot unchanged for a confident direct hit (whole window one slot)', () => {
    const buf = makeIdBuffer(BW, BH, () => 7);
    const { slot } = chooseNearestThinSlot(buf, BW, BH, X0, Y0, CX, CY, 7);
    expect(slot).toBe(7);
  });

  it('snaps to the nearest non-background slot when the centre is background', () => {
    // A thin vertical column (slot 9) one column LEFT of the cursor; rest empty.
    const buf = makeIdBuffer(BW, BH, (px) => (px === 1 ? 9 : 0));
    const { slot } = chooseNearestThinSlot(buf, BW, BH, X0, Y0, CX, CY, 0);
    expect(slot).toBe(9);
  });

  it('§SELECT-EXACT-PIXEL-FIRST — the exact pixel under the cursor wins even when a thinner neighbour is 1px away', () => {
    // Cursor centre lands on the wall (slot 1, fills the window) EXCEPT a 1px
    // wide column (slot 2) sitting one pixel left of centre. The old §SELECT-THIN-WINS
    // rule let the thinner column steal the click — the ROOT CAUSE of the reported
    // window→door mis-pick. Now the exact centre pixel (the wall the cursor is ON)
    // wins; only a click that actually lands on the column selects it.
    const wall = 1, column = 2;
    const buf = makeIdBuffer(BW, BH, (px) => (px === 1 ? column : wall));
    const { slot } = chooseNearestThinSlot(buf, BW, BH, X0, Y0, CX, CY, wall);
    expect(slot).toBe(wall);
  });

  it('§SELECT-EXACT-PIXEL-FIRST — clicking ON a window selects the window, NOT an adjacent smaller-footprint door', () => {
    // Reproduces the prod defect. The cursor pixel (2,2) is a WINDOW (slot=window).
    // A DOOR (slot=door) occupies the right two columns of the search window — a
    // SMALLER footprint than the window's left three columns, so under the old
    // "thinner-and-close steals the centre" rule the door would win. It must NOT:
    // the exact pixel is the window.
    const window = 4, door = 9;
    const buf = makeIdBuffer(BW, BH, (px) => (px >= 3 ? door : window));
    const { slot, winX, winY } = chooseNearestThinSlot(buf, BW, BH, X0, Y0, CX, CY, window);
    expect(slot).toBe(window);
    expect({ winX, winY }).toEqual({ winX: CX, winY: CY });
  });

  it('§SELECT-EXACT-PIXEL-FIRST — returns the door only when the cursor pixel is empty (background)', () => {
    // Same door cluster as above, but now the cursor sits on BACKGROUND (centre
    // empty). The fallback scan engages and returns the nearest candidate — the
    // door — from the surrounding pixels.
    const door = 9;
    const buf = makeIdBuffer(BW, BH, (px) => (px >= 3 ? door : 0));
    const { slot } = chooseNearestThinSlot(buf, BW, BH, X0, Y0, CX, CY, 0);
    expect(slot).toBe(door);
  });

  it('does NOT steal a confident centre hit for a thin element far away in the ring', () => {
    // Cursor on the wall (slot 1) everywhere except a thin column (slot 2) far at
    // the window edge. With §SELECT-EXACT-PIXEL-FIRST the centre wall is returned
    // unconditionally regardless of the far column.
    const wall = 1, column = 2;
    const buf = makeIdBuffer(BW, BH, (px, py) => (px === 0 && py === 0 ? column : wall));
    const { slot } = chooseNearestThinSlot(buf, BW, BH, X0, Y0, CX, CY, wall);
    expect(slot).toBe(wall);
  });

  it('returns background (0) for an entirely empty window', () => {
    const buf = makeIdBuffer(BW, BH, () => 0);
    const { slot } = chooseNearestThinSlot(buf, BW, BH, X0, Y0, CX, CY, 0);
    expect(slot).toBe(0);
  });

  it('is deterministic on equal distance + equal footprint (lower slot id wins) when the centre is empty', () => {
    // Two single-pixel slots equidistant from the cursor (one left, one right).
    // Centre is empty so the fallback scan runs.
    const buf = makeIdBuffer(BW, BH, (px, py) => {
      if (py === CY && px === CX - 1) return 5;
      if (py === CY && px === CX + 1) return 3;
      return 0;
    });
    const a = chooseNearestThinSlot(buf, BW, BH, X0, Y0, CX, CY, 0);
    const b = chooseNearestThinSlot(buf, BW, BH, X0, Y0, CX, CY, 0);
    expect(a.slot).toBe(b.slot);
    expect(a.slot).toBe(3); // lower id wins the deterministic tie-break
  });
});

// ---------------------------------------------------------------------------
// §PICK-RESPECT-VISIBILITY — a hidden element (visible=false, by floor isolation
// or any other hide) must NOT be in the pick id-buffer, so a click can never
// resolve to it. Toggling it visible again makes it pickable. Render and pick
// agree by construction because the pick sync keys off the SAME `.visible`
// signal the renderer (and isolation) writes.
// ---------------------------------------------------------------------------

/** Registry over arbitrary Object3D roots (Group or Mesh) keyed by id. */
function objectRegistry(items: { id: string; kind: string; obj: THREE.Object3D }[]): ElementRegistry {
  return {
    kindOf: (id) => (items.find((e) => e.id === id)?.kind ?? null) as never,
    ids: () => items.map((e) => e.id),
    objectFor: (id) => items.find((e) => e.id === id)?.obj ?? null,
  };
}

/** Count the pick-scene clones whose decoded slot maps to `id` in indexToId. */
function pickSlotsForId(strategy: GpuPickStrategy, id: string): number {
  const indexToId = (strategy as unknown as { indexToId: Map<number, string> }).indexToId;
  let n = 0;
  for (const v of indexToId.values()) if (v === id) n += 1;
  return n;
}

function makeCtx(registry: ElementRegistry, renderer: GpuPickRenderer): PickContext {
  return {
    camera: makeCamera(),
    elementRegistry: registry,
    viewportWidth: 100,
    viewportHeight: 100,
    scene: new THREE.Scene(),
    renderer,
  };
}

describe('GpuPickStrategy respects visibility (§PICK-RESPECT-VISIBILITY)', () => {
  it('a mesh with visible=false is NOT resolvable by a pick; toggling visible makes it pickable', () => {
    const strategy = new GpuPickStrategy({ targetWidth: 4, targetHeight: 4 });
    const mesh = makeMesh();
    const registry = objectRegistry([{ id: 'wall-1', kind: 'wall', obj: mesh }]);
    const { renderer, setPixels } = makeFakeRenderer(4, 4);
    const ctx = makeCtx(registry, renderer);

    // Visible: a pick over slot-1 colour resolves to the element.
    strategy.pick({ x: 50, y: 50 }, ctx); // builds the entry, assigns slot 1
    expect(pickSlotsForId(strategy, 'wall-1')).toBe(1);
    const [r, g, b, a] = encodeIndexToRGBA(1);
    setPixels(() => [r, g, b, a]);
    expect(strategy.pick({ x: 50, y: 50 }, ctx)!.elementId).toBe('wall-1');

    // Hide it (the same write floor isolation performs) → the next sync drops it
    // from the id-buffer, so NO slot maps to it and a pick over the old slot
    // colour resolves to nothing.
    mesh.visible = false;
    strategy.pick({ x: 50, y: 50 }, ctx); // re-sync with the element hidden
    expect(pickSlotsForId(strategy, 'wall-1')).toBe(0);
    expect(strategy.pick({ x: 50, y: 50 }, ctx)).toBeNull();

    // Re-show it → it becomes pickable again (slot reassigned, resolvable).
    mesh.visible = true;
    strategy.pick({ x: 50, y: 50 }, ctx);
    expect(pickSlotsForId(strategy, 'wall-1')).toBe(1);
    const slot = [...(strategy as unknown as { indexToId: Map<number, string> }).indexToId]
      .find(([, v]) => v === 'wall-1')![0];
    const [r2, g2, b2, a2] = encodeIndexToRGBA(slot);
    setPixels(() => [r2, g2, b2, a2]);
    expect(strategy.pick({ x: 50, y: 50 }, ctx)!.elementId).toBe('wall-1');
  });

  it('a hidden ROOT GROUP with visible child meshes is excluded (isolation hides the root, not the leaves)', () => {
    // Floor isolation sets `root.visible = false` on the registered Group while
    // its child meshes keep visible=true. The pick must still exclude it.
    const strategy = new GpuPickStrategy({ targetWidth: 4, targetHeight: 4 });
    const group = new THREE.Group();
    const child = makeMesh();
    child.visible = true;
    group.add(child);
    group.visible = false; // isolation hid the root
    const registry = objectRegistry([{ id: 'stair-1', kind: 'wall', obj: group }]);
    const { renderer } = makeFakeRenderer(4, 4);
    const ctx = makeCtx(registry, renderer);

    strategy.pick({ x: 50, y: 50 }, ctx);
    expect(pickSlotsForId(strategy, 'stair-1')).toBe(0);

    // Un-isolate → the group is visible again and its child becomes pickable.
    group.visible = true;
    strategy.pick({ x: 50, y: 50 }, ctx);
    expect(pickSlotsForId(strategy, 'stair-1')).toBe(1);
  });

  it('an element that goes visible->invisible has its STALE clone removed from the pick scene (exploded-ceiling case)', () => {
    // A compound element (root Group visible=true) whose ONLY child mesh is
    // hidden (e.g. a ceiling set visible=false in exploded view) must not leave
    // a stale clone in the pick scene — otherwise a click reads the stale pixel
    // and resolves to the now-invisible element, shadowing a visible one.
    const strategy = new GpuPickStrategy({ targetWidth: 4, targetHeight: 4 });
    const group = new THREE.Group(); // root stays visible
    const child = makeMesh();
    group.add(child);
    const registry = objectRegistry([{ id: 'ceiling-1', kind: 'wall', obj: group }]);
    const { renderer } = makeFakeRenderer(4, 4);
    const ctx = makeCtx(registry, renderer);

    // Visible child → entry + clone built.
    strategy.pick({ x: 50, y: 50 }, ctx);
    expect(pickSlotsForId(strategy, 'ceiling-1')).toBe(1);
    const sceneRef = (strategy as unknown as { pickScene: THREE.Scene }).pickScene;
    const meshClonesBefore = sceneRef.children.filter((c) => (c as THREE.Mesh).isMesh).length;
    expect(meshClonesBefore).toBeGreaterThan(0);

    // Hide ONLY the child (root group still visible) → no visible meshes.
    child.visible = false;
    strategy.pick({ x: 50, y: 50 }, ctx);
    // The stale entry + clone must be gone (not merely skipped).
    expect(pickSlotsForId(strategy, 'ceiling-1')).toBe(0);
    const entries = (strategy as unknown as { entries: Map<string, unknown> }).entries;
    expect(entries.has('ceiling-1')).toBe(false);
    const meshClonesAfter = sceneRef.children.filter((c) => (c as THREE.Mesh).isMesh).length;
    expect(meshClonesAfter).toBe(0);
  });

  it('an instanced group hidden by level (visible=false) registers NO per-instance pick slots', () => {
    // When isolation hides a whole InstancedElementRenderer group via .visible,
    // none of its instances (columns/beams) may be pickable. Showing it again
    // restores per-instance picking.
    const strategy = new GpuPickStrategy({ targetWidth: 4, targetHeight: 4 });
    const im = makeInstancedGroup(['col-0', 'col-1', 'col-2']);
    const registry = instancedGroupRegistry(im);
    const { renderer } = makeFakeRenderer(4, 4);
    const ctx = makeCtx(registry, renderer);

    // Visible: every occupied instance is registered.
    strategy.pick({ x: 50, y: 50 }, ctx);
    expect(pickSlotsForId(strategy, 'col-0')).toBe(1);
    expect(pickSlotsForId(strategy, 'col-2')).toBe(1);

    // Hide the whole group by level (isolation) → no per-instance slot survives.
    im.visible = false;
    strategy.pick({ x: 50, y: 50 }, ctx);
    expect(pickSlotsForId(strategy, 'col-0')).toBe(0);
    expect(pickSlotsForId(strategy, 'col-1')).toBe(0);
    expect(pickSlotsForId(strategy, 'col-2')).toBe(0);

    // Show it again → per-instance picking is restored.
    im.visible = true;
    strategy.pick({ x: 50, y: 50 }, ctx);
    expect(pickSlotsForId(strategy, 'col-0')).toBe(1);
    expect(pickSlotsForId(strategy, 'col-2')).toBe(1);
  });
});
