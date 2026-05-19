/**
 * LTPENURebase tests — Wave A17-T17 (≥ 6 tests required).
 *
 * Uses a mock proj4 that treats coordinates as flat-Earth metres
 * (lon → x metres, lat → y metres) so tests are deterministic
 * without network calls or EPSG database lookups.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LTPENURebase, type Proj4Fn } from '../src/LTPENURebase.js';

/** Simple flat-Earth mock: degrees treated as metres (1°≈111_320m for real; here 1° = 1m for simplicity). */
function makeMockProj4(): Proj4Fn {
  const fn = (fromCRS: string, toCRS: string, coord: [number, number]): [number, number] => {
    if (fromCRS === 'WGS84' && toCRS === 'PROJECT_CRS') return [coord[0] * 1000, coord[1] * 1000];
    if (fromCRS === 'PROJECT_CRS' && toCRS === 'WGS84') return [coord[0] / 1000, coord[1] / 1000];
    return coord;
  };
  (fn as unknown as { defs: (n: string, d: string) => void }).defs = vi.fn();
  return fn as unknown as Proj4Fn;
}

describe('LTPENURebase', () => {
  let rebase: LTPENURebase;
  let proj4: Proj4Fn;

  beforeEach(() => {
    proj4 = makeMockProj4();
    rebase = new LTPENURebase(proj4, '+proj=utm +zone=30 +datum=WGS84 +units=m');
  });

  it('T1 — constructor registers PROJECT_CRS with proj4.defs', () => {
    expect((proj4 as unknown as { defs: ReturnType<typeof vi.fn> }).defs).toHaveBeenCalledWith(
      'PROJECT_CRS',
      '+proj=utm +zone=30 +datum=WGS84 +units=m',
    );
  });

  it('T2 — projectToScene returns zero vector at origin', () => {
    rebase.setOrigin(0, 0, 0);
    const pos = rebase.projectToScene(0, 0, 0);
    expect(pos.x).toBeCloseTo(0, 6);
    expect(pos.y).toBeCloseTo(0, 6);
    expect(pos.z).toBeCloseTo(0, 6);
  });

  it('T3 — projectToScene: East offset is scene +X, elev is scene +Y, North offset is scene -Z', () => {
    rebase.setOrigin(0, 0, 0);
    const pos = rebase.projectToScene(0, 1, 0); // 1 degree East of origin
    expect(pos.x).toBeGreaterThan(0);  // East → +X
    expect(pos.y).toBeCloseTo(0, 6);
    // North unchanged (lat same) → Z should be ~0
    expect(pos.z).toBeCloseTo(0, 6);

    const posN = rebase.projectToScene(1, 0, 0); // 1 degree North
    expect(posN.z).toBeLessThan(0);  // North → -Z convention
    expect(posN.x).toBeCloseTo(0, 6);
  });

  it('T4 — unprojectFromScene is the inverse of projectToScene', () => {
    rebase.setOrigin(51.5, -0.1, 10); // London-ish
    const original = { lat: 51.51, lon: -0.09, elev: 15 };
    const scenePos = rebase.projectToScene(original.lat, original.lon, original.elev);
    const roundTrip = rebase.unprojectFromScene(scenePos);
    expect(roundTrip.lat).toBeCloseTo(original.lat, 5);
    expect(roundTrip.lon).toBeCloseTo(original.lon, 5);
    expect(roundTrip.elev).toBeCloseTo(original.elev, 5);
  });

  it('T5 — recenter returns non-zero translation when origin shifts', () => {
    rebase.setOrigin(0, 0, 0);
    // Move origin 1 degree East + 1 degree North
    const translation = rebase.recenter(1, 1, 0);
    // The old origin (0,0,0) in the new frame (1,1,0) → negative offsets
    expect(typeof translation.x).toBe('number');
    expect(typeof translation.y).toBe('number');
    expect(typeof translation.z).toBe('number');
    // mock: proj(0,0) = (0,0), proj(1,1) = (1000,1000) → x = 0-1000 = -1000
    expect(translation.x).not.toBeCloseTo(0, 1);
    expect(translation.z).not.toBeCloseTo(0, 1);
  });

  it('T6 — recenter updates origin so subsequent projectToScene uses new origin', () => {
    rebase.setOrigin(0, 0, 0);
    rebase.recenter(10, 10, 0);
    expect(rebase.origin.lat).toBe(10);
    expect(rebase.origin.lon).toBe(10);
    // At new origin, scene position of (10,10) should be zero
    const pos = rebase.projectToScene(10, 10, 0);
    expect(pos.x).toBeCloseTo(0, 6);
    expect(pos.z).toBeCloseTo(0, 6);
  });

  it('T7 — distanceFromOriginMetres returns 0 at origin', () => {
    rebase.setOrigin(51.5, -0.1, 0);
    const dist = rebase.distanceFromOriginMetres(51.5, -0.1);
    expect(dist).toBeCloseTo(0, 6);
  });

  it('T8 — distanceFromOriginMetres returns positive value away from origin', () => {
    rebase.setOrigin(0, 0, 0);
    const dist = rebase.distanceFromOriginMetres(0, 1); // 1 degree East
    expect(dist).toBeGreaterThan(0);
  });

  it('T9 — RECENTER_THRESHOLD_M is 1000 (1 km)', () => {
    expect(LTPENURebase.RECENTER_THRESHOLD_M).toBe(1_000);
  });

  it('T10 — origin getter returns a copy (mutation-safe)', () => {
    rebase.setOrigin(51.0, -0.5, 100);
    const o = rebase.origin;
    (o as { lat: number }).lat = 999;
    expect(rebase.origin.lat).toBe(51.0); // original unchanged
  });
});
