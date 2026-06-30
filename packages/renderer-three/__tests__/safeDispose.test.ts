// §I2 — WebGPU-safe disposal helper tests.
//
// The real WebGPU NodeManager `usedTimes` throw requires a live GPU device,
// which is unavailable in Node/vitest. We instead drive the helpers with
// lightweight stub THREE-like objects whose `dispose()` throws the exact
// device-loss TypeError ("…reading 'usedTimes'"), and assert:
//   1. the helper swallows ONLY that error (rebuild() must not abort),
//   2. any OTHER error still propagates (real dispose bugs not masked),
//   3. the happy path disposes exactly once and never throws.

import { describe, expect, it, vi } from 'vitest';
import type { BufferGeometry, Material, Object3D, Mesh } from '../src/three-re-export.js';
import {
  isUsedTimesDisposeError,
  safeDisposeMaterial,
  safeDisposeMaterials,
  safeDisposeGeometry,
  safeDisposeObject3D,
} from '../src/safeDispose.js';

// ── Stubs ──────────────────────────────────────────────────────────────────

/** A material whose node-state is missing → dispose() throws the §I2 error. */
function makeUsedTimesThrowingMaterial(): Material {
  return {
    dispose: vi.fn(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'usedTimes')");
    }),
  } as unknown as Material;
}

function makeHappyMaterial(): Material {
  return { dispose: vi.fn() } as unknown as Material;
}

function makeUsedTimesThrowingGeometry(): BufferGeometry {
  return {
    dispose: vi.fn(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'usedTimes')");
    }),
  } as unknown as BufferGeometry;
}

// ── isUsedTimesDisposeError ──────────────────────────────────────────────────

describe('isUsedTimesDisposeError', () => {
  it('matches the WebGPU NodeManager usedTimes TypeError', () => {
    expect(
      isUsedTimesDisposeError(
        new TypeError("Cannot read properties of undefined (reading 'usedTimes')"),
      ),
    ).toBe(true);
  });

  it('matches a raw string message containing usedTimes', () => {
    expect(isUsedTimesDisposeError('boom usedTimes boom')).toBe(true);
  });

  it('does NOT match unrelated errors', () => {
    expect(isUsedTimesDisposeError(new Error('something else'))).toBe(false);
    expect(isUsedTimesDisposeError(null)).toBe(false);
    expect(isUsedTimesDisposeError(undefined)).toBe(false);
    expect(isUsedTimesDisposeError(42)).toBe(false);
  });
});

// ── safeDisposeMaterial ──────────────────────────────────────────────────────

describe('safeDisposeMaterial', () => {
  it('disposes a material whose node-state is missing WITHOUT throwing (§I2)', () => {
    const mat = makeUsedTimesThrowingMaterial();
    expect(() => safeDisposeMaterial(mat)).not.toThrow();
    expect(mat.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes a healthy material exactly once on the happy path', () => {
    const mat = makeHappyMaterial();
    safeDisposeMaterial(mat);
    expect(mat.dispose).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for null / undefined', () => {
    expect(() => safeDisposeMaterial(null)).not.toThrow();
    expect(() => safeDisposeMaterial(undefined)).not.toThrow();
  });

  it('re-throws errors that are NOT the usedTimes device-loss throw', () => {
    const mat = {
      dispose: vi.fn(() => {
        throw new Error('genuine disposal bug');
      }),
    } as unknown as Material;
    expect(() => safeDisposeMaterial(mat)).toThrow('genuine disposal bug');
  });
});

// ── safeDisposeMaterials (Material | Material[]) ─────────────────────────────

describe('safeDisposeMaterials', () => {
  it('disposes every material in an array even if one throws usedTimes', () => {
    const a = makeUsedTimesThrowingMaterial();
    const b = makeHappyMaterial();
    expect(() => safeDisposeMaterials([a, b])).not.toThrow();
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(b.dispose).toHaveBeenCalledTimes(1);
  });

  it('handles a single material', () => {
    const m = makeHappyMaterial();
    safeDisposeMaterials(m);
    expect(m.dispose).toHaveBeenCalledTimes(1);
  });
});

// ── safeDisposeGeometry ──────────────────────────────────────────────────────

describe('safeDisposeGeometry', () => {
  it('disposes a geometry whose node-state is missing WITHOUT throwing (§I2)', () => {
    const geo = makeUsedTimesThrowingGeometry();
    expect(() => safeDisposeGeometry(geo)).not.toThrow();
    expect(geo.dispose).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for null / undefined', () => {
    expect(() => safeDisposeGeometry(null)).not.toThrow();
    expect(() => safeDisposeGeometry(undefined)).not.toThrow();
  });
});

// ── safeDisposeObject3D ──────────────────────────────────────────────────────

describe('safeDisposeObject3D', () => {
  /** Build a minimal Object3D-like with a traverse() that visits the given nodes. */
  function makeRoot(nodes: Array<Partial<Mesh>>): Object3D {
    return {
      traverse(cb: (o: Object3D) => void) {
        for (const n of nodes) cb(n as unknown as Object3D);
      },
    } as unknown as Object3D;
  }

  it('disposes geometry + material of every descendant, swallowing usedTimes throws', () => {
    const goodGeo = { dispose: vi.fn() } as unknown as BufferGeometry;
    const throwingMat = makeUsedTimesThrowingMaterial();
    const okMat = makeHappyMaterial();

    const root = makeRoot([
      { geometry: makeUsedTimesThrowingGeometry(), material: throwingMat },
      { geometry: goodGeo, material: okMat },
      {}, // a non-mesh node (Group): no geometry/material — must be skipped
    ]);

    expect(() => safeDisposeObject3D(root)).not.toThrow();
    expect(goodGeo.dispose).toHaveBeenCalledTimes(1);
    expect(throwingMat.dispose).toHaveBeenCalledTimes(1);
    expect(okMat.dispose).toHaveBeenCalledTimes(1);
  });

  it('skips material disposal when disposeMaterials=false (shared-material rule)', () => {
    const sharedMat = makeHappyMaterial();
    const geo = { dispose: vi.fn() } as unknown as BufferGeometry;
    const root = makeRoot([{ geometry: geo, material: sharedMat }]);

    safeDisposeObject3D(root, /* disposeMaterials */ false);
    expect(geo.dispose).toHaveBeenCalledTimes(1);
    expect(sharedMat.dispose).not.toHaveBeenCalled();
  });

  it('is a no-op for null / undefined', () => {
    expect(() => safeDisposeObject3D(null)).not.toThrow();
    expect(() => safeDisposeObject3D(undefined)).not.toThrow();
  });
});
