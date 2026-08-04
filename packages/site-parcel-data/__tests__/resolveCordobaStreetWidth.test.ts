// §COR-STREET-WIDTH — unit tests for the `idecordoba:manzana`-fed Córdoba street-width resolver.
//
// Unlike `murciaStreetWidth.test.ts`, this suite is built on SYNTHETIC (not live-captured) block
// geometry, because no live neighbourhood fixture has been captured for `idecordoba:manzana` yet.
// The synthetic rectangles are placed in real EPSG:25830 easting/northing near central Córdoba
// (≈340 000 E / 4 197 000 N — inside `CORDOBA_BBOX`), so `makeMeasurementFrame` and the UTM
// projection machinery run on realistic magnitudes, not toy numbers near the origin.
//
// The LIVE layer itself was verified this session via a real `GetFeature` request against
// `https://ide.cordoba.es/geoserver/wfs?...typeNames=idecordoba:manzana...`: valid GeoJSON,
// `crs: urn:ogc:def:crs:EPSG::25830`, `totalFeatures: 20730` (matching
// `LAYER2-GEOMETRY-RECOVERY-2026-08-02.md`'s prior count), real block polygons. That confirms the
// WIRE SHAPE this test's fixtures model; it does not replace a future live-fixture capture the way
// `murciaStreetWidth.test.ts` has one — recorded here so the gap is explicit, not silently assumed
// covered.

import { describe, it, expect } from 'vitest';
import {
    resolveCordobaStreetWidth,
    CORDOBA_STREET_WIDTH_AUTHORITY,
} from '../src/providers/resolveCordobaStreetWidth.js';

const NATIVE = 'EPSG:25830';

/** A point squarely inside `CORDOBA_BBOX` (the Sur + Noroeste pilot). */
const POINT = { lat: 37.878, lon: -4.79 };
/** The point projected into EPSG:25830 by the SAME Kruger series the resolver uses internally. */
import { projectToNative } from '../src/geometry/nativeCrs.js';
const ORIGIN = projectToNative(NATIVE, POINT.lat, POINT.lon)!;

/** A rectangular manzana polygon (GeoJSON `Polygon`, native easting/northing), closed ring. */
function rectPolygon(minE: number, minN: number, maxE: number, maxN: number): unknown {
    return {
        type: 'Feature',
        properties: {},
        geometry: {
            type: 'Polygon',
            coordinates: [[
                [minE, minN], [maxE, minN], [maxE, maxN], [minE, maxN], [minE, minN],
            ]],
        },
    };
}

// OUR block: a 20 × 30 m rectangle centred on the query point.
const OUR_BLOCK = rectPolygon(
    ORIGIN.e - 10, ORIGIN.n - 15, ORIGIN.e + 10, ORIGIN.n + 15,
);
// A neighbour across the EAST edge, 8 m of street away (10 + 8 = 18 to its near face).
const NEIGHBOUR_EAST = rectPolygon(
    ORIGIN.e + 18, ORIGIN.n - 15, ORIGIN.e + 40, ORIGIN.n + 15,
);

function fixtureFetch(
    body: { crs?: unknown; manzanas: unknown[] | null; truncated?: boolean } =
        { crs: NATIVE, manzanas: [OUR_BLOCK, NEIGHBOUR_EAST], truncated: false },
    ok = true,
): typeof fetch {
    const withCrs = 'crs' in body ? body : { crs: NATIVE, ...body };
    return (async () => ({ ok, json: async () => withCrs })) as unknown as typeof fetch;
}

describe('resolveCordobaStreetWidth — a real measurement off synthetic manzana geometry', () => {
    it('measures the street width from OUR block to the neighbour across it', async () => {
        const r = await resolveCordobaStreetWidth(POINT, { fetchImpl: fixtureFetch() });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // Near face of our block is at +10 m, near face of the neighbour at +18 m ⇒ 8 m street.
        expect(r.width_m).toBeCloseTo(8, 1);
        expect(r.provenance).toBe('measured-geometry');
        expect(r.authority).toBe(CORDOBA_STREET_WIDTH_AUTHORITY);
        expect(r.measurementCrs).toBe(NATIVE);
        expect(r.neighbourCount).toBe(1);
    });

    it('the same geometry yields a byte-identical result, every time (C1-style reproducibility)', async () => {
        const runs = await Promise.all(
            Array.from({ length: 5 }, () => resolveCordobaStreetWidth(POINT, { fetchImpl: fixtureFetch() })),
        );
        const first = JSON.stringify(runs[0]);
        for (const r of runs) expect(JSON.stringify(r)).toBe(first);
    });

    it('the authority string says CONSTRUCTED, names idecordoba:manzana, and denies being official', () => {
        expect(CORDOBA_STREET_WIDTH_AUTHORITY).toMatch(/CONSTRUCTED by PRYZM/);
        expect(CORDOBA_STREET_WIDTH_AUTHORITY).toMatch(/idecordoba:manzana/);
        expect(CORDOBA_STREET_WIDTH_AUTHORITY).toMatch(/NOT an official Córdoba street-width/);
        expect(CORDOBA_STREET_WIDTH_AUTHORITY).toMatch(/EPSG:25830/);
    });
});

describe('§NATIVE-CRS-MEASUREMENT — the CRS guard, identical discipline to Murcia', () => {
    it('a body with no declared crs REFUSES rather than assuming degrees', async () => {
        const r = await resolveCordobaStreetWidth(POINT, {
            fetchImpl: fixtureFetch({ crs: undefined, manzanas: [OUR_BLOCK, NEIGHBOUR_EAST] }),
        });
        expect(r).toMatchObject({ ok: false, reason: 'crs-not-native' });
    });

    it('a GEOGRAPHIC crs REFUSES', async () => {
        const r = await resolveCordobaStreetWidth(POINT, {
            fetchImpl: fixtureFetch({ crs: 'EPSG:4326', manzanas: [OUR_BLOCK, NEIGHBOUR_EAST] }),
        });
        expect(r).toMatchObject({ ok: false, reason: 'crs-not-native' });
    });

    it('the CRS is checked BEFORE the empty-geometry check', async () => {
        const r = await resolveCordobaStreetWidth(POINT, {
            fetchImpl: fixtureFetch({ crs: 'EPSG:4326', manzanas: [] }),
        });
        expect(r).toMatchObject({ ok: false, reason: 'crs-not-native' });
    });
});

describe('DOCTRINE B + transport honesty', () => {
    it('out-of-Córdoba refuses without any fetch', async () => {
        const r = await resolveCordobaStreetWidth({ lat: 41.38, lon: 2.17 }, { fetchImpl: fixtureFetch() });
        expect(r).toMatchObject({ ok: false, reason: 'out-of-cordoba' });
    });

    it('never throws on a null/undefined point', async () => {
        await expect(resolveCordobaStreetWidth(null)).resolves.toMatchObject({ ok: false });
        await expect(resolveCordobaStreetWidth(undefined)).resolves.toMatchObject({ ok: false });
    });

    it('a transport FAILURE is distinct from an empty published answer', async () => {
        const down = await resolveCordobaStreetWidth(POINT, { fetchImpl: fixtureFetch(undefined, false) });
        expect(down).toMatchObject({ ok: false, reason: 'endpoint-unreachable' });

        const nullBody = await resolveCordobaStreetWidth(POINT, {
            fetchImpl: fixtureFetch({ crs: NATIVE, manzanas: null }),
        });
        expect(nullBody).toMatchObject({ ok: false, reason: 'endpoint-unreachable' });

        const empty = await resolveCordobaStreetWidth(POINT, {
            fetchImpl: fixtureFetch({ crs: NATIVE, manzanas: [] }),
        });
        expect(empty).toMatchObject({ ok: false, reason: 'no-manzana-here' });
    });

    it('DOCTRINE B — a TRUNCATED neighbourhood refuses rather than measuring partial data', async () => {
        const r = await resolveCordobaStreetWidth(POINT, {
            fetchImpl: fixtureFetch({ crs: NATIVE, manzanas: [OUR_BLOCK, NEIGHBOUR_EAST], truncated: true }),
        });
        expect(r).toMatchObject({ ok: false, reason: 'neighbourhood-truncated' });
    });

    it('DOCTRINE B — no manzana covers the click ⇒ refuse, never substitute a nearby one', async () => {
        // Only the neighbour is published, nothing at the query point itself.
        const r = await resolveCordobaStreetWidth(POINT, {
            fetchImpl: fixtureFetch({ crs: NATIVE, manzanas: [NEIGHBOUR_EAST] }),
        });
        expect(r).toMatchObject({ ok: false, reason: 'no-manzana-here' });
    });

    it('no-fetch refuses when no fetch implementation is available', async () => {
        const original = globalThis.fetch;
        try {
            // @ts-expect-error — deliberately removing fetch to exercise the `no-fetch` branch.
            globalThis.fetch = undefined;
            const r = await resolveCordobaStreetWidth(POINT, {});
            expect(r).toMatchObject({ ok: false, reason: 'no-fetch' });
        } finally {
            globalThis.fetch = original;
        }
    });

    it('our own block with NO opposing frontage anywhere refuses honestly', async () => {
        const r = await resolveCordobaStreetWidth(POINT, {
            fetchImpl: fixtureFetch({ crs: NATIVE, manzanas: [OUR_BLOCK] }),
        });
        expect(r).toMatchObject({ ok: false, reason: 'no-opposing-frontage' });
    });
});
