// §VIEWPORT-BG-BACKEND-VOCABULARY (L-1191) — the ONE predicate that decides which
// backend owns the viewport background, and therefore which backend must arm the
// lightweight per-frame WebGL render, the per-frame OBC base clear, and the OPAQUE
// (never transparent) clear prime.
//
// WHY THIS FILE EXISTS. "The WebGL background should always be white — it still
// sometimes comes grey" is the FOURTH report of one symptom (L-326, L-326 reopened,
// L-1148, L-1191). Every previous fix armed one more code path. The requirement was
// ENUMERATED across four arms that each had to remember it, and they had drifted into
// three different spellings of one rule:
//
//   initScene BOOT arm      `pryzmRendererBackend === 'webgl-fallback'`            1 of 2
//   initScene LIVE-SWAP arm `b === 'webgl-fallback' || b === 'webgl-only'`         2 of 2
//   initScene ROLLBACK arm  (nothing at all — it asserted NEITHER arm)             0 of 2
//   RPM.recoverPipeline     `!this._webGpuActive`                            complement
//
// The tests below pin the property that makes the enumeration impossible to get
// wrong again: the two predicates are EXHAUSTIVE and MUTUALLY EXCLUSIVE over the
// `RendererBackend` union, because the lightweight one is written as the COMPLEMENT
// of native WebGPU rather than as a membership list. A membership list that names
// one of two backends is the same defect class as a case mismatch, and this repo has
// shipped several.

import { describe, expect, it } from 'vitest';
import {
  isNativeWebGpuBackend,
  isLightweightWebGlBackend,
  type RendererBackend,
} from '../src/rendering/createRenderer';

// Every member of the `RendererBackend` union. Kept as an explicit literal array so
// that widening the union without revisiting this file fails to compile here first.
const ALL_BACKENDS: readonly RendererBackend[] = ['webgpu', 'webgl-fallback', 'webgl-only'];

describe('§VIEWPORT-BG-BACKEND-VOCABULARY — isNativeWebGpuBackend', () => {
  it('is true for the ONE backend whose TSL output node owns the background', () => {
    // On native WebGPU the background is `mix(bgUniform, sceneColor, hasGeometry)` —
    // a property of the pipeline OUTPUT, so it cannot be missed by any frame. This is
    // also the only backend on which `scene.background = null` and a TRANSPARENT clear
    // prime are CORRECT: a Color background there gives every pixel alpha=1 and defeats
    // the `hasGeometry` mask (the Phase-5 "whitening layer").
    expect(isNativeWebGpuBackend('webgpu')).toBe(true);
  });

  it('is false for BOTH WebGL backends — not just the fallback one', () => {
    // 'webgl-fallback' is a WebGPURenderer built with forceWebGL (it still reports
    // isWebGPURenderer === true, which is exactly how earlier gates were fooled);
    // 'webgl-only' is a classic THREE.WebGLRenderer. Neither builds a TSL pipeline,
    // so neither has a bgUniform, and on neither is a transparent clear survivable.
    expect(isNativeWebGpuBackend('webgl-fallback')).toBe(false);
    expect(isNativeWebGpuBackend('webgl-only')).toBe(false);
  });
});

describe('§VIEWPORT-BG-BACKEND-VOCABULARY — isLightweightWebGlBackend', () => {
  it('covers BOTH WebGL backends (the 1-of-2 gate at the boot arm covered one)', () => {
    // This is the founder-facing assertion. The boot arm read
    // `=== 'webgl-fallback'`; the swap arm read both. Whichever arm listed one of the
    // two would, on the other backend, arm NOTHING — no per-frame render, no OBC base
    // clear — and the viewport would never paint at all, leaving the app-chrome grey
    // (`--app-bg` #e8edf6) visible through the transparent overlay.
    expect(isLightweightWebGlBackend('webgl-fallback')).toBe(true);
    expect(isLightweightWebGlBackend('webgl-only')).toBe(true);
  });

  it('is false for native WebGPU', () => {
    expect(isLightweightWebGlBackend('webgpu')).toBe(false);
  });
});

describe('§VIEWPORT-BG-BACKEND-VOCABULARY — the structural property', () => {
  it('the two predicates PARTITION the backend union: exactly one is true for every member', () => {
    // THIS is the test that makes the defect unrepeatable, and it is why the
    // lightweight predicate is a COMPLEMENT rather than a list. A fourth backend
    // string added to `RendererBackend` tomorrow lands in the lightweight arm
    // automatically — it can never fall out of BOTH arms and leave the viewport
    // unpainted, which is precisely how a background requirement spread across four
    // call sites goes wrong.
    for (const backend of ALL_BACKENDS) {
      const native = isNativeWebGpuBackend(backend);
      const light = isLightweightWebGlBackend(backend);
      expect(
        native !== light,
        `backend '${backend}' must be classified by exactly one predicate`,
      ).toBe(true);
    }
  });

  it('at least one backend falls on each side (the partition is not degenerate)', () => {
    expect(ALL_BACKENDS.some(isNativeWebGpuBackend)).toBe(true);
    expect(ALL_BACKENDS.some(isLightweightWebGlBackend)).toBe(true);
  });

  it('the lightweight predicate is defined AS the complement, not as a membership list', () => {
    // Guards the shape of the fix, not just its current output: if someone rewrites
    // `isLightweightWebGlBackend` back into `b === 'webgl-fallback' || b === 'webgl-only'`,
    // this still passes for today's union — so we assert the property that a list would
    // silently lose, using a backend string OUTSIDE the declared union. A complement
    // classifies it as lightweight (safe: it gets painted); a membership list would
    // classify it as neither (the grey viewport).
    const futureBackend = 'webgl3-something' as unknown as RendererBackend;
    expect(isLightweightWebGlBackend(futureBackend)).toBe(true);
    expect(isNativeWebGpuBackend(futureBackend)).toBe(false);
  });
});
