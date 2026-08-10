// ADR-0315 U2.4 — headless SiteQueryService contract tests.

import { describe, expect, it } from 'vitest';
import { SiteQueryService, pointInPolygonXZ } from '../src/SiteQueryService.js';

const SQUARE = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }];
const INNER = [{ x: 2, z: 2 }, { x: 8, z: 2 }, { x: 8, z: 8 }, { x: 2, z: 8 }];

function site(over: Record<string, unknown> = {}): unknown {
  return {
    location: { latitude: 41.39, longitude: 2.17, trueNorth: 0.3 },
    parcel: {
      boundary: { polygon: SQUARE, edgeClassifications: ['front', 'side', 'rear', 'side'] },
      setbacks: { front: 3, side: null, rear: 0 },
      maxHeight: 12,
      buildableRing: INNER,
    },
    ...over,
  };
}

function svcWith(model: unknown | null): SiteQueryService {
  const svc = new SiteQueryService();
  svc.setSiteProvider(() => model as never);
  return svc;
}

describe('SiteQueryService (U2.4)', () => {
  it('no site → nulls everywhere, θ falls back to 0 — never zeros posing as data', () => {
    const svc = svcWith(null);
    expect(svc.getLocation()).toBeNull();
    expect(svc.getTrueNorth()).toBe(0);
    expect(svc.getParcelBoundary()).toBeNull();
    expect(svc.getBuildableRing()).toBeNull();
    expect(svc.getBuildableFootprint()).toBeNull();
    expect(svc.getSetbacks()).toBeNull();
    expect(svc.getMaxHeightM()).toBeNull();
    // Unknown footprint → null, not false ("unknown" must not collapse into "outside").
    expect(svc.containsPointXZ({ x: 5, z: 5 })).toBeNull();
  });

  it('reads location/θ/setbacks/maxHeight with null-semantics intact (null ≠ 0)', () => {
    const svc = svcWith(site());
    expect(svc.getLocation()).toEqual({ latitude: 41.39, longitude: 2.17, trueNorth: 0.3 });
    expect(svc.getTrueNorth()).toBeCloseTo(0.3);
    expect(svc.getSetbacks()).toEqual({ front: 3, side: null, rear: 0 });
    expect(svc.getMaxHeightM()).toBe(12);
  });

  it('buildableRing WINS over the parcel; footprint labels its source', () => {
    const withRing = svcWith(site());
    expect(withRing.getBuildableFootprint()).toEqual({ polygon: INNER, source: 'envelope' });

    const noRing = svcWith(site({ parcel: {
      boundary: { polygon: SQUARE, edgeClassifications: [] },
      setbacks: { front: null, side: null, rear: null },
      maxHeight: null, buildableRing: null,
    } }));
    expect(noRing.getBuildableRing()).toBeNull();
    expect(noRing.getBuildableFootprint()).toEqual({ polygon: SQUARE, source: 'parcel' });
    expect(noRing.getMaxHeightM()).toBeNull();
  });

  it('containsPointXZ tests against the RING when present', () => {
    const svc = svcWith(site());
    expect(svc.containsPointXZ({ x: 5, z: 5 })).toBe(true);    // inside ring
    expect(svc.containsPointXZ({ x: 1, z: 1 })).toBe(false);   // inside parcel, OUTSIDE ring
    expect(svc.containsPointXZ({ x: 20, z: 20 })).toBe(false); // outside everything
  });

  it('a throwing provider degrades to no-site, never breaks the caller', () => {
    const svc = new SiteQueryService();
    svc.setSiteProvider(() => { throw new Error('runtime not ready'); });
    expect(svc.getBuildableFootprint()).toBeNull();
    expect(svc.getTrueNorth()).toBe(0);
  });

  it('pointInPolygonXZ — pure ray-casting sanity', () => {
    expect(pointInPolygonXZ({ x: 5, z: 5 }, SQUARE)).toBe(true);
    expect(pointInPolygonXZ({ x: -1, z: 5 }, SQUARE)).toBe(false);
    expect(pointInPolygonXZ({ x: 0.001, z: 0.001 }, SQUARE)).toBe(true);
  });
});
