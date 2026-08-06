// §TERRAIN-BASE-PROVENANCE (C12 §1.4 / §1.6, §CONTEXT-DATA-HONESTY) — the baked-terrain
// clamp's provenance reduction.
//
// WHAT THESE PIN. `CesiumViewport.clampTerrainThenReplace` used to coerce BOTH a rejected
// `sampleTerrainMostDetailed` and a NaN result to `0` and seat the massing there. Three
// distinct states — "no terrain attached, so the ellipsoid IS the ground", "terrain measured
// 0 m here", and "the measurement FAILED" — collapsed onto the same number, which is exactly
// the failure C12 §1.4 forbids ("a fabricated `0` … is forbidden") and which the photoreal
// path already avoids through `resolveGlobeGroundAnchor`.
//
// These are the invariants that keep the two apart. They are PURE (no Cesium, no viewer), the
// same precedent as `globePlacementDecisions` / the L-259 anchor decisions — which is the only
// reason they can be asserted at all: the live seating is only observable in a browser.
import { describe, it, expect } from 'vitest';
import { resolveTerrainClampBase } from '../globeGroundAnchor';

describe('§TERRAIN-BASE-PROVENANCE — resolveTerrainClampBase', () => {
  it('no elevation provider → 0 m, but as a TRUE datum statement (ellipsoid-flat-ground), not a fallback', () => {
    const r = resolveTerrainClampBase({
      hasElevationProvider: false,
      sampledHeightM: null,
      sampleFailed: false,
      lastKnownBaseM: 912,
    });
    expect(r.baseHeightM).toBe(0);
    expect(r.source).toBe('ellipsoid-flat-ground');
    // The keyless / un-baked path is CORRECT, not degraded — it must not read as a failure.
    expect(r.measured).toBe(true);
  });

  it('a finite sample wins and is labelled terrain-sample', () => {
    const r = resolveTerrainClampBase({
      hasElevationProvider: true,
      sampledHeightM: 912.4,
      sampleFailed: false,
      lastKnownBaseM: 0,
    });
    expect(r.baseHeightM).toBeCloseTo(912.4, 6);
    expect(r.source).toBe('terrain-sample');
    expect(r.measured).toBe(true);
  });

  it('a genuine 0 m ground is measured — NOT confused with a failed sample', () => {
    // THE CORE DISTINCTION. Both this case and the rejection case below carry base 0; only the
    // provenance separates them, which is the whole point of the reduction.
    const real = resolveTerrainClampBase({
      hasElevationProvider: true,
      sampledHeightM: 0,
      sampleFailed: false,
      lastKnownBaseM: 0,
    });
    const failed = resolveTerrainClampBase({
      hasElevationProvider: true,
      sampledHeightM: null,
      sampleFailed: true,
      lastKnownBaseM: 0,
    });
    expect(real.baseHeightM).toBe(failed.baseHeightM); // same VALUE …
    expect(real.measured).toBe(true);                  // … different MEANING.
    expect(failed.measured).toBe(false);
    expect(real.source).toBe('terrain-sample');
    expect(failed.source).toBe('unmeasured-fallback');
  });

  it('a rejected sample KEEPS the last known base — it never fabricates ellipsoid 0 (the Burgos burial)', () => {
    // The regression this exists for: Burgos ground ≈ 912 m. The old code answered 0 on a
    // transient rejection and re-placed the building 912 m underground.
    const r = resolveTerrainClampBase({
      hasElevationProvider: true,
      sampledHeightM: null,
      sampleFailed: true,
      lastKnownBaseM: 912,
    });
    expect(r.baseHeightM).toBe(912);
    expect(r.source).toBe('unmeasured-fallback');
    expect(r.measured).toBe(false);
  });

  it('a NaN/undefined height is a failure too, even when the promise resolved', () => {
    for (const bad of [Number.NaN, undefined, null, Number.POSITIVE_INFINITY]) {
      const r = resolveTerrainClampBase({
        hasElevationProvider: true,
        sampledHeightM: bad as number | null | undefined,
        sampleFailed: false,
        lastKnownBaseM: 50,
      });
      expect(r.baseHeightM).toBe(50);
      expect(r.measured).toBe(false);
      expect(r.source).toBe('unmeasured-fallback');
    }
  });

  it('a non-finite last-known base degrades to 0 rather than propagating NaN', () => {
    const r = resolveTerrainClampBase({
      hasElevationProvider: true,
      sampledHeightM: null,
      sampleFailed: true,
      lastKnownBaseM: Number.NaN,
    });
    expect(r.baseHeightM).toBe(0);
    expect(r.measured).toBe(false); // still not a measurement — the 0 is a last resort, not ground.
  });

  it('is total: every input shape yields a finite base and a defined provenance', () => {
    for (const hasElevationProvider of [true, false]) {
      for (const sampleFailed of [true, false]) {
        for (const sampledHeightM of [null, undefined, Number.NaN, 0, -3.2, 912]) {
          for (const lastKnownBaseM of [0, 912, Number.NaN]) {
            const r = resolveTerrainClampBase({
              hasElevationProvider,
              sampledHeightM,
              sampleFailed,
              lastKnownBaseM,
            });
            expect(Number.isFinite(r.baseHeightM)).toBe(true);
            expect(['terrain-sample', 'ellipsoid-flat-ground', 'unmeasured-fallback'])
              .toContain(r.source);
            // The invariant the honesty rule rests on: `measured` is false IF AND ONLY IF the
            // source is the fallback. Nothing may be labelled measured without a datum behind it.
            expect(r.measured).toBe(r.source !== 'unmeasured-fallback');
          }
        }
      }
    }
  });
});
