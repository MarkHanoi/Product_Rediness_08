/**
 * §FIX-FORMA-MASSING-FOOTPRINT-IS-PARCEL (L-1204) + §FIX-FORMA-HEIGHT-SPHERE-IS-NOT-A-HEIGHT
 * (L-1205) — the two decisions that set the Forma / 3D-Site massing's extent.
 *
 * Every number in the "founder's project" cases below is read off HIS console log:
 *   [ProjectSerializer] Snapshot created: 204 elements, 7 levels, 40 walls, 8 slabs
 *   [forma] §FORMA-FULL-HEIGHT tiled 8 massing storey band(s) (3.0 m each) up to full
 *           building height 42.4 m
 *   [forma] massing rendered: 40 wall(s) across 14 storey(s)
 *   [forma] rendering massing: 40 wall(s), 8 slab(s), 0 roof(s), 0 furniture, 85 opening(s)
 * — 7 levels authored, 14 storeys drawn, and ZERO roofs behind the "roof" he reported.
 */

import { describe, it, expect } from 'vitest';

import {
  decideMassingRing,
  resolveFullBuildingHeightM,
  boundingSphereDiameterAsHeight,
} from '../formaMassingExtent';

describe('§FIX-FORMA-MASSING-FOOTPRINT-IS-PARCEL (L-1204) — the building beats the plot', () => {
  it('⭐ prefers the WALL LOOP even when a parcel boundary is drawn (the whole defect)', () => {
    // The founder's project has BOTH: 40 walls AND a drawn 17-vertex parcel ring. The old
    // code branched on the parcel first, so the massing was extruded over the PLOT.
    const d = decideMassingRing({ hasWallLoopRing: true, hasFloorSlabRing: true, hasParcelRing: true });
    expect(d.source).toBe('wall-loop');
    expect(d.isPlotNotBuilding).toBe(false);
  });

  it('falls to the FLOOR SLAB ring when the wall loop cannot be traced, still not the parcel', () => {
    const d = decideMassingRing({ hasWallLoopRing: false, hasFloorSlabRing: true, hasParcelRing: true });
    expect(d.source).toBe('floor-slab');
    expect(d.isPlotNotBuilding).toBe(false);
  });

  it('reaches the parcel ring ONLY with no building geometry at all — and flags it as the PLOT', () => {
    const d = decideMassingRing({ hasWallLoopRing: false, hasFloorSlabRing: false, hasParcelRing: true });
    expect(d.source).toBe('parcel-boundary');
    // The caller MUST be able to tell the user this silhouette is the site, not the design.
    expect(d.isPlotNotBuilding).toBe(true);
  });

  it('degrades to per-wall boxes when nothing is available, and never claims the plot', () => {
    const d = decideMassingRing({ hasWallLoopRing: false, hasFloorSlabRing: false, hasParcelRing: false });
    expect(d.source).toBe('per-wall-boxes');
    expect(d.isPlotNotBuilding).toBe(false);
  });

  it('never returns parcel-boundary while ANY building ring exists (exhaustive over the 8 cases)', () => {
    for (const hasWallLoopRing of [true, false]) {
      for (const hasFloorSlabRing of [true, false]) {
        for (const hasParcelRing of [true, false]) {
          const d = decideMassingRing({ hasWallLoopRing, hasFloorSlabRing, hasParcelRing });
          if (hasWallLoopRing || hasFloorSlabRing) {
            expect(d.source).not.toBe('parcel-boundary');
            expect(d.isPlotNotBuilding).toBe(false);
          }
        }
      }
    }
  });
});

describe('§FIX-FORMA-HEIGHT-SPHERE-IS-NOT-A-HEIGHT (L-1205) — 20.9 m stays 20.9 m', () => {
  // The founder's seven authored bands, verbatim from his log.
  const AUTHORED_BANDS = [
    { baseElevation: 0.0, heightM: 3.0 },
    { baseElevation: 3.0, heightM: 3.0 },
    { baseElevation: 5.8, heightM: 3.2 },
    { baseElevation: 9.0, heightM: 3.1 },
    { baseElevation: 12.2, heightM: 2.7 },
    { baseElevation: 15.2, heightM: 2.7 },
    { baseElevation: 17.9, heightM: 3.0 },
  ];

  it('⭐ resolves the founder\'s building to its AUTHORED 20.9 m — not 42.4 m', () => {
    const d = resolveFullBuildingHeightM({ bands: AUTHORED_BANDS });
    expect(d.authoredTopM).toBeCloseTo(20.9, 6);
    expect(d.heightM).toBeCloseTo(20.9, 6);
    expect(d.source).toBe('authored storey bands');
  });

  it('⛔ the deleted bounding-sphere leg REPRODUCES the founder\'s 42.4 m from a 20.9 m building', () => {
    // This is the arithmetic that produced "42.4 m", preserved as an executable proof that
    // the removed source was structurally incapable of measuring a height — not merely
    // imprecise. A ~32 × 18.5 m plate 20.9 m tall (an ordinary urban block footprint for a
    // 7-storey building) puts the sphere diameter at the founder's number almost exactly.
    const wouldHaveBeen = boundingSphereDiameterAsHeight({
      planWidthM: 32, planDepthM: 18.5, trueHeightM: 20.9,
    });
    // The building is 20.9 m tall; the sphere diameter says 42.4 — his log's figure.
    expect(wouldHaveBeen).toBeGreaterThan(42.0);
    expect(wouldHaveBeen).toBeLessThan(43.0);
    // …i.e. it doubled the tower, which is exactly what "14 storeys for 7 levels" means.
    expect(wouldHaveBeen / 20.9).toBeGreaterThan(2.0);

    // And the resolver no longer has any way to consume it: the authored answer stands.
    expect(resolveFullBuildingHeightM({ bands: AUTHORED_BANDS }).heightM).toBeCloseTo(20.9, 6);
  });

  it('the sphere leg gets WORSE the wider the building — it tracks plan extent, not height', () => {
    const narrow = boundingSphereDiameterAsHeight({ planWidthM: 8, planDepthM: 8, trueHeightM: 20.9 });
    const wide = boundingSphereDiameterAsHeight({ planWidthM: 80, planDepthM: 40, trueHeightM: 20.9 });
    // Same building height, wildly different "height". That is the disqualifying property.
    expect(wide).toBeGreaterThan(narrow * 3);
  });

  it('still honours the AUTHORED signals, and names which one won', () => {
    expect(
      resolveFullBuildingHeightM({ bands: AUTHORED_BANDS, fullBuildingHeightM: 30 }).source,
    ).toBe('caller override (fullBuildingHeightM)');
    expect(
      resolveFullBuildingHeightM({ bands: AUTHORED_BANDS, slabs: [{ topElevation: 24 }] }),
    ).toMatchObject({ heightM: 24, source: 'slab topElevation' });
    expect(
      resolveFullBuildingHeightM({ bands: AUTHORED_BANDS, roofs: [{ baseElevation: 25, thickness: 0.4 }] }),
    ).toMatchObject({ heightM: 25.4, source: 'roof top' });
  });

  it('a signal SHORTER than the authored bands never lowers the building', () => {
    const d = resolveFullBuildingHeightM({
      bands: AUTHORED_BANDS,
      fullBuildingHeightM: 5,
      slabs: [{ topElevation: 3 }],
      roofs: [{ baseElevation: 1, thickness: 0.2 }],
    });
    expect(d.heightM).toBeCloseTo(20.9, 6);
    expect(d.source).toBe('authored storey bands');
  });

  it('ignores non-finite / absent signals rather than propagating NaN', () => {
    const d = resolveFullBuildingHeightM({
      bands: AUTHORED_BANDS,
      fullBuildingHeightM: Number.NaN,
      slabs: [{}, { topElevation: undefined }],
      roofs: [{ baseElevation: undefined, thickness: undefined }],
    });
    expect(Number.isFinite(d.heightM)).toBe(true);
    expect(d.heightM).toBeCloseTo(20.9, 6);
  });

  it('the genuine case the tiling exists for still works: a collapsed single band + a real override', () => {
    // ADR-0268 §D4's motivating case — a perf-capped tower whose walls collapse to ONE
    // ground band, with a NAMED height source. That is legitimate; the sphere never was.
    const d = resolveFullBuildingHeightM({
      bands: [{ baseElevation: 0, heightM: 4 }],
      fullBuildingHeightM: 160,
    });
    expect(d.authoredTopM).toBe(4);
    expect(d.heightM).toBe(160);
    expect(d.source).toBe('caller override (fullBuildingHeightM)');
  });
});
