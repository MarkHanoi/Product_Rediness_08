// §SEA-REAL-PRODUCT (lane SEA-BAKE, 2026-09-06) — the sea layer against the REAL osmdata product.
//
// WHY THIS FILE EXISTS SEPARATELY FROM seaPolygons.spec.ts. That suite proves the reader against a
// SYNTHETIC shapefile this repo writes itself, and a fixture built from the header cannot falsify
// the header (§FAKE-MORE-CAPABLE-THAN-REAL). Until 2026-09-06 nothing had ever run the clipper over
// the real 904 MB archive, so the honest status of the whole layer was "wired, never measured".
//
// It has now been run. The two fixtures beside this file are REAL OUTPUT — the bytes
// `clipWaterPolygonsToRegions` wrote from `water-polygons-split-4326.zip` (sha256
// 9ddbe246…c32f45, Last-Modified Sun 06 Sep 2026 03:40:56 GMT), clipped to a tight bbox around
// each subject. They are not hand-authored and not round-tripped through anything.
//
// WHAT IS PINNED, and it is deliberately BOTH halves:
//   · the WIN — Dubai/Palm Jumeirah: the sea is drawn AROUND the reclaimed land, because the Palm
//     arrives as ISLAND HOLES of the Gulf polygon. This is the case the client's LAYER_KEEPS_HOLES
//     exists for; drop the holes and the bake paints the Palm blue.
//   · the LIMIT — Sydney/Cremorne Point (L-12921): the layer does NOT cover Sydney Harbour, because
//     the harbour carries no `natural=coastline` at all. A test that pinned only the win would let
//     the next reader close L-12921 on this bake, which would be wrong.
//
// Network-free: the fixtures are on disk, and the daily-rebuilt byte count is deliberately NOT
// asserted (it moved 903,819,020 → 903,852,707 inside 17 h).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SEA_SOURCE, SEA_FEATURE_TAGS, SEA_REAL_RUN, SEA_NOT_COVERED, pointInRing, signedArea,
} from '../seaPolygons.mjs';

type Feature = {
  type: 'Feature'; id: number;
  properties: { sea: string; source: string; osmdata_rec: number };
  geometry: { type: 'Polygon'; coordinates: [number, number][][] };
};

const FIX = join(__dirname, 'fixtures');
const load = (name: string): Feature[] =>
  readFileSync(join(FIX, name), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Feature);

const DUBAI = 'sea-real-dubai-palm-2026-09-06.geojsonseq';
const SYDNEY = 'sea-real-sydney-harbour-2026-09-06.geojsonseq';

/** The client's own question: is this point painted sea? Inside an outer and outside every hole. */
function classify(features: Feature[], pt: [number, number]): 'sea' | 'island' | 'not-covered' {
  for (const f of features) {
    const [outer, ...holes] = f.geometry.coordinates;
    if (!pointInRing(pt, outer)) continue;
    return holes.some((h) => pointInRing(pt, h)) ? 'island' : 'sea';
  }
  return 'not-covered';
}

describe('§SEA-REAL-PRODUCT — the fixtures are real product output', () => {
  it('carries the tags the client keys on, and nothing invented', () => {
    for (const name of [DUBAI, SYDNEY]) {
      const feats = load(name);
      expect(feats.length, name).toBeGreaterThan(0);
      for (const f of feats) {
        expect(f.geometry.type).toBe('Polygon');
        expect(f.properties.sea).toBe(SEA_FEATURE_TAGS.sea);
        expect(f.properties.source).toBe(SEA_FEATURE_TAGS.source);
        // provenance back to the exact source record — a feature we cannot trace is a feature we invented
        expect(Number.isInteger(f.properties.osmdata_rec)).toBe(true);
        expect(f.properties.osmdata_rec).toBeGreaterThan(0);
      }
    }
  });

  it('emits RFC 7946 winding — outer CCW, holes CW — which is what makes a hole a hole', () => {
    for (const name of [DUBAI, SYDNEY]) {
      for (const f of load(name)) {
        const [outer, ...holes] = f.geometry.coordinates;
        expect(signedArea(outer), `${name} outer`).toBeGreaterThan(0);
        for (const h of holes) expect(signedArea(h), `${name} hole`).toBeLessThan(0);
      }
    }
  });

  it('closes every ring (first vertex === last)', () => {
    for (const name of [DUBAI, SYDNEY]) {
      for (const f of load(name)) {
        for (const ring of f.geometry.coordinates) {
          expect(ring.length).toBeGreaterThanOrEqual(4);
          expect(ring[0]).toEqual(ring[ring.length - 1]);
        }
      }
    }
  });
});

describe('§SEA-REAL-PRODUCT — Dubai / Palm Jumeirah: the sea is drawn AROUND the reclaimed land', () => {
  const feats = load(DUBAI);

  it('is ONE Gulf polygon carrying the Palm as island holes', () => {
    expect(feats).toHaveLength(1);
    expect(feats[0].properties.osmdata_rec).toBe(7848);
    expect(feats[0].geometry.coordinates.length - 1).toBe(16); // 16 island holes
  });

  // The whole point of L-12921's Dubai half: water between the fronds is sea, the Palm itself is not.
  it.each([
    ['Palm Jumeirah trunk centreline', [55.1390, 25.1130], 'island'],
    ['Atlantis, on the crescent', [55.1170, 25.1304], 'island'],
    ['water between the fronds', [55.1250, 25.1160], 'sea'],
    ['open Gulf west of the Palm', [55.1000, 25.1200], 'sea'],
    ['Dubai Marina shoreline (mainland, outside the cut)', [55.1600, 25.0900], 'not-covered'],
  ] as const)('%s → %s', (_label, pt, want) => {
    expect(classify(feats, pt as unknown as [number, number])).toBe(want);
  });

  it('would paint the Palm blue if the holes were dropped — which is why LAYER_KEEPS_HOLES exists', () => {
    const outerOnly = [{ ...feats[0], geometry: { ...feats[0].geometry, coordinates: [feats[0].geometry.coordinates[0]] } }] as Feature[];
    expect(classify(feats, [55.1390, 25.1130])).toBe('island');
    expect(classify(outerOnly, [55.1390, 25.1130])).toBe('sea'); // the defect, reproduced on purpose
  });
});

describe('§SEA-COVERS-COASTLINE-ONLY — Sydney Harbour is NOT in this layer (L-12921 stays OPEN)', () => {
  const feats = load(SYDNEY);

  it('reaches the open Tasman but stops at the Heads', () => {
    expect(feats).toHaveLength(1);
    expect(feats[0].properties.osmdata_rec).toBe(1371);
    expect(classify(feats, [151.3000, -33.8300])).toBe('sea'); // open ocean east of the Heads
  });

  // Measured 2026-09-06: westernmost sea longitude is 151.288 at both lat -33.83 and -33.85.
  // Sydney Harbour spans roughly 151.19..151.28, so it lies wholly outside.
  it.each([
    ['Cremorne Point, the L-12921 site', [151.2320, -33.8455]],
    ['harbour water 150 m west of Cremorne Point', [151.2300, -33.8450]],
    ['Sydney Cove / Opera House', [151.2170, -33.8540]],
    ['Sydney CBD', [151.2073, -33.8731]],
  ] as const)('%s is covered by NO sea polygon', (_label, pt) => {
    expect(classify(feats, pt as unknown as [number, number])).toBe('not-covered');
  });

  it('records the gap as a NAMED fact, not as an empty result', () => {
    const gap = SEA_NOT_COVERED.knownGaps.find((g) => g.issue === 'L-12921');
    expect(gap, 'the Sydney gap must be declared in the module, not discovered by a reader').toBeDefined();
    expect(gap!.belongsToLayer).toBe('water');
    expect(gap!.coastlineWaysInside).toBe(0);
    expect(gap!.coastlineWaysOutsideTheHeads).toBe(18);
    // the site the founder reported must actually be inside the gap this row describes
    expect(classify(feats, gap!.site as unknown as [number, number])).toBe('not-covered');
    expect(gap!.site[0]).toBeLessThan(gap!.westernmostSeaLon);
  });
});

describe('§SEA-REAL-PRODUCT — the recorded provenance is the real archive', () => {
  it('names the ODbL source and the WGS 84 product', () => {
    expect(SEA_SOURCE.product).toBe('water-polygons-split-4326');
    expect(SEA_SOURCE.crs).toBe('EPSG:4326');
    expect(SEA_SOURCE.licence).toMatch(/ODbL/);
    expect(SEA_SOURCE.url).toBe('https://osmdata.openstreetmap.de/download/water-polygons-split-4326.zip');
  });

  it('records what the first real run measured, and the fixtures agree with it', () => {
    expect(SEA_REAL_RUN.zip64).toBe(false);
    expect(SEA_REAL_RUN.fileCode).toBe(9994);
    expect(SEA_REAL_RUN.shapeType).toBe(5);
    expect(SEA_REAL_RUN.records).toBe(53_328);
    expect(SEA_REAL_RUN.shpEntry.endsWith('/water_polygons.shp')).toBe(true);
    // containment, not orientation — but the real file DID follow the ESRI convention, and none dropped
    expect(SEA_REAL_RUN.outersClockwise).toBe(SEA_REAL_RUN.outers);
    expect(SEA_REAL_RUN.holesDropped).toBe(0);
    // both fixtures came out of that same pass
    for (const name of [DUBAI, SYDNEY]) {
      for (const f of load(name)) expect(f.properties.osmdata_rec).toBeLessThanOrEqual(SEA_REAL_RUN.records);
    }
  });

  it('does NOT assert the daily-rebuilt byte count, which moved inside 17 h', () => {
    expect(SEA_SOURCE.probe.at).toBe('2026-09-06');
    expect(SEA_SOURCE.probe.http).toBe(200);
    expect(SEA_SOURCE.probe.acceptRanges).toBe('bytes');
    expect(SEA_SOURCE.probe.bytes).toBeGreaterThan(500_000_000); // a range, never an equality
  });
});
