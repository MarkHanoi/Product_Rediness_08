// MaterialPool unit tests — ref counting, dispose, hash dedup.

import { describe, expect, it, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { MaterialPool } from '../src/MaterialPool.js';

describe('MaterialPool', () => {
  it('reuses a Material on second acquire of the same hash', () => {
    const pool = new MaterialPool();
    const factory = vi.fn(() => new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    const h1 = pool.acquire('red', factory);
    const h2 = pool.acquire('red', factory);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(h1.material).toBe(h2.material);
    expect(pool.size()).toBe(1);
    expect(pool.refCount('red')).toBe(2);
  });

  it('disposes the Material when the last handle releases', () => {
    const pool = new MaterialPool();
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const disposeSpy = vi.spyOn(mat, 'dispose');
    const h1 = pool.acquire('green', () => mat);
    const h2 = pool.acquire('green', () => mat);
    expect(h1.release()).toBe(1);
    expect(disposeSpy).not.toHaveBeenCalled();
    expect(h2.release()).toBe(0);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(pool.refCount('green')).toBe(0);
    expect(pool.size()).toBe(0);
  });

  it('release is idempotent', () => {
    const pool = new MaterialPool();
    const h = pool.acquire('blue', () => new THREE.MeshBasicMaterial({ color: 0x0000ff }));
    h.release();
    expect(() => h.release()).not.toThrow();
  });

  it('access to .material after release throws', () => {
    const pool = new MaterialPool();
    const h = pool.acquire('blue', () => new THREE.MeshBasicMaterial({ color: 0x0000ff }));
    h.release();
    expect(() => h.material).toThrow(/already released/);
  });

  it('different hashes get distinct Materials', () => {
    const pool = new MaterialPool();
    const a = pool.acquire('red', () => new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    const b = pool.acquire('green', () => new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    expect(a.material).not.toBe(b.material);
    expect(pool.size()).toBe(2);
  });

  it('dispose() releases every Material regardless of outstanding refs', () => {
    const pool = new MaterialPool();
    const mat = new THREE.MeshBasicMaterial({ color: 0x123456 });
    const disposeSpy = vi.spyOn(mat, 'dispose');
    pool.acquire('x', () => mat);
    pool.acquire('x', () => mat);
    pool.dispose();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(pool.size()).toBe(0);
  });

  it('throws on acquire after dispose', () => {
    const pool = new MaterialPool();
    pool.dispose();
    expect(() => pool.acquire('y', () => new THREE.MeshBasicMaterial())).toThrow(
      /disposed/,
    );
  });

  it('TC39 [Symbol.dispose] is callable and equivalent to release()', () => {
    const pool = new MaterialPool();
    const mat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
    const disposeSpy = vi.spyOn(mat, 'dispose');
    const h = pool.acquire('z', () => mat);
    // Direct-call form — covers `using` via the same code path.
    h[Symbol.dispose]?.();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  // S05-T6 — GPU-leak assertion (deterministic).  The
  // `(performance as any).memory` Chromium-only test is gated;
  // the deterministic refCount/size shape is always green.
  //
  // This proves the pool does not leak entries even after sustained
  // churn — every release() that drops refs to zero MUST also remove
  // the entry from the internal Map (otherwise `size()` would creep).
  it('1K acquire/release cycles leave pool.size === 0 and every refCount === 0', () => {
    const pool = new MaterialPool();
    const HASH = 'churn/standard/grey';
    const ITERATIONS = 1000;
    const handles: { release: () => void }[] = [];
    let factoryCalls = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const h = pool.acquire(HASH, () => {
        factoryCalls++;
        return new THREE.MeshStandardMaterial({ color: 0x808080 });
      });
      handles.push(h);
    }
    expect(pool.size()).toBe(1);
    expect(pool.refCount(HASH)).toBe(ITERATIONS);
    // Factory ran exactly ONCE — the pool's primary contract.
    expect(factoryCalls).toBe(1);

    // Release in interleaved order to flush both code paths.
    for (let i = 0; i < ITERATIONS; i += 2) handles[i]!.release();
    expect(pool.refCount(HASH)).toBe(ITERATIONS / 2);
    expect(pool.size()).toBe(1);
    for (let i = 1; i < ITERATIONS; i += 2) handles[i]!.release();

    // Net leak check.
    expect(pool.refCount(HASH)).toBe(0);
    expect(pool.size()).toBe(0);
  });

  it('1K acquire/release with rotating distinct hashes drains all entries', () => {
    const pool = new MaterialPool();
    const N = 1000;
    const handles: { release: () => void; hash: string }[] = [];
    for (let i = 0; i < N; i++) {
      const hash = `churn/${i}`;
      handles.push(pool.acquire(hash, () => new THREE.MeshBasicMaterial()));
    }
    expect(pool.size()).toBe(N);
    for (const h of handles) {
      expect(pool.refCount(h.hash)).toBe(1);
      h.release();
      expect(pool.refCount(h.hash)).toBe(0);
    }
    expect(pool.size()).toBe(0);
  });
});
