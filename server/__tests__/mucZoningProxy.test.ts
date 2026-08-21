// §MUC-ZONING-PROXY (L-480) — tests for the Catalan clau lookup.
//
// The fixtures below are SHAPED FROM REAL RESPONSE BODIES probed live on
// 2026-07-20 against `https://sig.gencat.cat/ows/MUC/wms` (layer
// `MUCVW_MUCS_QUAL`) — not from documentation. That distinction matters here:
// L-473 records a route shipped BROKEN in v225 precisely because it was written
// from docs instead of a response, and had no test.
//
// The behaviour under test is mostly REFUSAL. This lookup selects the rule pack
// that produces a *profunditat edificable*; a confident wrong clau yields a
// confident wrong buildable depth, which C58 treats as worse than no answer.

import { describe, expect, it, beforeEach } from 'vitest';
import {
    selectContainingQualification,
    disambiguateViaAmbQuTrames,
    buildAmbQuUrl,
    AMB_QU_LAYER,
    geometryContainsPoint,
    pointInRing,
    buildGetFeatureInfoUrl,
    fetchQualificationAtPoint,
    makeMucZoningHandler,
    __resetMucCache,
    mucCacheStats,
    MUC_QUAL_LAYER,
} from '../jurisdiction/mucZoningProxy.js';

/** A square ring around (lon, lat) with the given half-size in degrees. */
const square = (lon: number, lat: number, h: number): number[][] => [
    [lon - h, lat - h], [lon + h, lat - h], [lon + h, lat + h], [lon - h, lat + h], [lon - h, lat - h],
];

/** Real Eixample parcel centroid (0229701DF3802G, manzana 02297) — measured 13a. */
const EIXAMPLE = { lat: 41.39323988, lon: 2.16438054 };
/** The founder's Poblenou test parcel — measured 13b, NOT covered by the 13a/13E pack. */
const POBLENOU = { lat: 41.404569, lon: 2.208071 };

function feature(clau: string, mucCode: string, ring: number[][], desc = '') {
    return {
        type: 'Feature',
        geometry: { type: 'MultiPolygon', coordinates: [[ring]] },
        properties: {
            CODI_QUAL_AJUNT: clau,
            DESC_QUAL_AJUNT: desc,
            CODI_QUAL_MUC: mucCode,
            DESC_QUAL_MUC: 'Residencial, Urbà tradicional',
            CODI_INE: '08019',
        },
    };
}

describe('§MUC-ZONING-PROXY pointInRing / geometryContainsPoint', () => {
    it('resolves a point inside and outside a ring', () => {
        const ring = square(2.0, 41.0, 0.001);
        expect(pointInRing(2.0, 41.0, ring)).toBe(true);
        expect(pointInRing(2.01, 41.0, ring)).toBe(false);
    });

    it('handles MultiPolygon (the shape MUC actually returns)', () => {
        const geom = { type: 'MultiPolygon', coordinates: [[square(2.0, 41.0, 0.001)]] };
        expect(geometryContainsPoint(geom, 2.0, 41.0)).toBe(true);
        expect(geometryContainsPoint(geom, 2.5, 41.0)).toBe(false);
    });

    it('never throws on malformed geometry — it answers "not contained"', () => {
        expect(geometryContainsPoint(null, 1, 1)).toBe(false);
        expect(geometryContainsPoint({ type: 'Point', coordinates: [1, 1] }, 1, 1)).toBe(false);
        expect(geometryContainsPoint({ type: 'Polygon' }, 1, 1)).toBe(false);
    });
});

/**
 * §MUC-ONE-CONTAINER-OR-REFUSE — the defect this guards is subtle and would look
 * completely valid in production: a WMS pixel query returns NEIGHBOURS, so a plot
 * beside a street comes back with the road system too. Measured at one Eixample
 * point: three features — `5b`, `13a`, `SX2` — of which exactly one contained it.
 */
describe('§MUC-ONE-CONTAINER-OR-REFUSE picks the containing polygon, or refuses', () => {
    it('THE BUG: does not return the FIRST feature when a street polygon leads', () => {
        // Ordered exactly as observed live: the road system came back first.
        const fc = {
            features: [
                feature('5b', 'SX2', square(2.1600, 41.3900, 0.0002)),      // elsewhere
                feature('13a', 'R2', square(EIXAMPLE.lon, EIXAMPLE.lat, 0.0005)), // contains
                feature('SX2', 'SX2', square(2.1700, 41.3950, 0.0002)),     // elsewhere
            ],
        };
        const got = selectContainingQualification(fc, EIXAMPLE.lon, EIXAMPLE.lat);
        // Taking features[0] would have reported this building plot as road system.
        expect(got?.clau).toBe('13a');
        expect(got?.source).toBe('muc-gencat');
        expect(got?.sourceLayer).toBe(MUC_QUAL_LAYER);
    });

    it('REFUSES when no returned polygon contains the point', () => {
        const fc = { features: [feature('13a', 'R2', square(2.9, 41.9, 0.0002))] };
        expect(selectContainingQualification(fc, EIXAMPLE.lon, EIXAMPLE.lat)).toBeNull();
    });

    it('REFUSES when TWO polygons contain the point (overlap / on a boundary)', () => {
        // Genuinely ambiguous. A buildable depth chosen by coin-flip between two claus
        // is exactly what C58 forbids, so ambiguity must surface as no answer.
        const fc = {
            features: [
                feature('13a', 'R2', square(EIXAMPLE.lon, EIXAMPLE.lat, 0.0005)),
                feature('13b', 'R2', square(EIXAMPLE.lon, EIXAMPLE.lat, 0.0006)),
            ],
        };
        expect(selectContainingQualification(fc, EIXAMPLE.lon, EIXAMPLE.lat)).toBeNull();
    });

    it('REFUSES a containing feature that carries no municipal clau', () => {
        const f = feature('', 'R2', square(EIXAMPLE.lon, EIXAMPLE.lat, 0.0005));
        expect(selectContainingQualification({ features: [f] }, EIXAMPLE.lon, EIXAMPLE.lat)).toBeNull();
    });

    it('REFUSES an empty / malformed collection rather than inventing a zone', () => {
        expect(selectContainingQualification({ features: [] }, 2, 41)).toBeNull();
        expect(selectContainingQualification(null, 2, 41)).toBeNull();
        expect(selectContainingQualification({}, 2, 41)).toBeNull();
    });

    /**
     * ⚠ THE ONE THAT PROTECTS THE DEMO. `CODI_QUAL_MUC` is the harmonised
     * cross-Catalonia code and is COARSER than the municipal clau: 13a and 13b are
     * BOTH 'R2'. Keying a rule pack on it would apply Eixample's Art. 242.2
     * parameters to the founder's Poblenou parcel, which is 13b.
     */
    it('keeps 13b distinct from 13a even though both carry MUC code R2', () => {
        const bcn = selectContainingQualification(
            { features: [feature('13a', 'R2', square(EIXAMPLE.lon, EIXAMPLE.lat, 0.0005))] },
            EIXAMPLE.lon, EIXAMPLE.lat,
        );
        const pbn = selectContainingQualification(
            { features: [feature('13b', 'R2', square(POBLENOU.lon, POBLENOU.lat, 0.0005))] },
            POBLENOU.lon, POBLENOU.lat,
        );
        expect(bcn?.clau).toBe('13a');
        expect(pbn?.clau).toBe('13b');
        // The coarse code is identical — which is exactly why it must not select a pack.
        expect(bcn?.mucCode).toBe(pbn?.mucCode);
    });
});

describe('§MUC-ZONING-PROXY buildGetFeatureInfoUrl', () => {
    it('builds a CRS:84 (lon,lat) bbox centred on the point', () => {
        const url = buildGetFeatureInfoUrl(41.4, 2.2, 0.001);
        expect(url).toContain('request=GetFeatureInfo');
        expect(url).toContain(`query_layers=${MUC_QUAL_LAYER}`);
        expect(url).toContain('crs=CRS%3A84');
        // CRS:84 is lon,lat — a swapped axis order silently queries the wrong hemisphere.
        expect(url).toContain('bbox=2.199%2C41.399%2C2.201%2C41.401');
    });
});

describe('§MUC-ZONING-PROXY fetchQualificationAtPoint never throws', () => {
    it('treats a service exception (XML, not JSON) as UNRESOLVED, not as empty', () => {
        // The real service answers XML ServiceExceptionReport on a bad request. If that
        // parsed to "no zoning", a failure would masquerade as a planning fact.
        const fetchImpl = (async () =>
            new Response('<ServiceExceptionReport/>', { status: 200 })) as unknown as typeof fetch;
        return expect(fetchQualificationAtPoint(41.4, 2.2, { fetchImpl })).resolves.toBeNull();
    });

    it('treats a non-OK response as UNRESOLVED', async () => {
        const fetchImpl = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
        await expect(fetchQualificationAtPoint(41.4, 2.2, { fetchImpl })).resolves.toBeNull();
    });

    it('treats a network throw as UNRESOLVED', async () => {
        const fetchImpl = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
        await expect(fetchQualificationAtPoint(41.4, 2.2, { fetchImpl })).resolves.toBeNull();
    });

    it('rejects non-finite coordinates without contacting upstream', async () => {
        let called = 0;
        const fetchImpl = (async () => { called++; return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
        await expect(fetchQualificationAtPoint(Number.NaN, 2.2, { fetchImpl })).resolves.toBeNull();
        expect(called).toBe(0);
    });
});

describe('§MUC-ZONING-PROXY handler', () => {
    beforeEach(() => __resetMucCache());

    /** Minimal express-ish req/res doubles. */
    function invoke(handler: (req: unknown, res: unknown) => Promise<unknown>, query: Record<string, string>) {
        const headers: Record<string, string> = {};
        let status = 0; let body: Record<string, unknown> = {};
        const res = {
            setHeader: (k: string, v: string) => { headers[k.toLowerCase()] = v; },
            status(code: number) { status = code; return this; },
            json(payload: Record<string, unknown>) { body = payload; return this; },
        };
        return handler({ query }, res).then(() => ({ status, body, headers }));
    }

    const okCollection = {
        features: [feature('13a', 'R2', square(EIXAMPLE.lon, EIXAMPLE.lat, 0.0005), 'Densificació urbana intensiva')],
    };

    it('400s without coordinates', async () => {
        const h = makeMucZoningHandler({ fetchImpl: (async () => new Response('{}')) as unknown as typeof fetch });
        const r = await invoke(h as never, {});
        expect(r.status).toBe(400);
    });

    it('resolves a real Eixample point to clau 13a and caches it', async () => {
        let calls = 0;
        const fetchImpl = (async () => {
            calls++;
            return new Response(JSON.stringify(okCollection), { status: 200 });
        }) as unknown as typeof fetch;
        const h = makeMucZoningHandler({ fetchImpl });

        const first = await invoke(h as never, { lat: String(EIXAMPLE.lat), lon: String(EIXAMPLE.lon) });
        expect(first.status).toBe(200);
        expect((first.body.zoning as { clau: string }).clau).toBe('13a');
        expect(first.headers['x-muc-cache']).toBe('MISS');

        const second = await invoke(h as never, { lat: String(EIXAMPLE.lat), lon: String(EIXAMPLE.lon) });
        expect(second.headers['x-muc-cache']).toBe('HIT');
        expect(calls).toBe(1); // planning geometry changes in years — one upstream call
        expect(mucCacheStats().hits).toBe(1);
    });

    it('an UNRESOLVED answer is explicit, non-cacheable, and not a claim about the parcel', async () => {
        const fetchImpl = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
        const h = makeMucZoningHandler({ fetchImpl });
        const r = await invoke(h as never, { lat: '41.4', lon: '2.2' });

        expect(r.status).toBe(200);
        expect(r.body.zoning).toBeNull();
        expect(r.body.reason).toBe('unresolved');
        // Must never be cached: a transient outage becoming a durable "no zoning here"
        // is the L-422 / L-467 failure, and here it would silently disable a rule pack.
        expect(r.headers['cache-control']).toContain('no-store');
        expect(r.headers['x-muc-cache']).toBe('MISS-UNRESOLVED');
    });
});

/**
 * §MUC-AMB-DISAMBIGUATION (L-1661) — the full-precision tie-break for rounded WMS geometry.
 *
 * THE MEASURED DEFECT (2026-08-21, raw bodies under
 * `docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/findings/l1661/`): the WMS serialises
 * GetFeatureInfo coordinates to ~4 decimals (≈ 10 m). At parcel 3634514DF3833D's own centroid the
 * pixel returned clau `18` AND the city-wide `SX1` road MultiPolygon, BOTH "containing" the point
 * in the rounded rings — so §MUC-ONE-CONTAINER-OR-REFUSE refused, and the card called a rounding
 * artefact a source outage. The AMB `QU_Trames` layer (full precision, server-side containment)
 * answers exactly one feature there: `CLAU_URB='18'`.
 *
 * The tie-break is CORROBORATION-ONLY: it may pick one of the MUC's own candidates, never
 * introduce a clau the MUC did not return, and any doubt keeps the refusal.
 */
describe('§MUC-AMB-DISAMBIGUATION resolves rounded-geometry ambiguity via AMB QU_Trames', () => {
    /** The defect shape: both candidates "contain" the point in rounded geometry. */
    const P = { lat: 41.3981329, lon: 2.2054181 };
    const ambiguousFc = {
        features: [
            feature('18', 'R4', square(P.lon, P.lat, 0.002), 'Ordenació en volumetria específica'),
            feature('SX1', 'SX1', square(P.lon, P.lat, 0.01), 'Sistema viari: eixos estructurants'),
        ],
    };
    const ambAnswer = (clau: string, n = 1) =>
        JSON.stringify({
            features: Array.from({ length: n }, () => ({
                attributes: { CLAU_URB: clau, DESCRIP: 'x', CODI_INE: '08019' },
            })),
        });

    /** Route the fake by host: sig.gencat.cat → WMS body, geoportal.amb.cat → AMB body. */
    function routedFetch(wmsBody: string, ambBody: string | (() => never), onAmb?: (url: string) => void) {
        return (async (url: string) => {
            if (String(url).includes('geoportal.amb.cat')) {
                onAmb?.(String(url));
                if (typeof ambBody === 'function') ambBody();
                return new Response(ambBody as string, { status: 200 });
            }
            return new Response(wmsBody, { status: 200 });
        }) as unknown as typeof fetch;
    }

    it('THE DEFECT PARCEL: two rounded containers + AMB says clau 18 → resolves 18, stamped', async () => {
        let ambUrl = '';
        const fetchImpl = routedFetch(JSON.stringify(ambiguousFc), ambAnswer('18'), (u) => { ambUrl = u; });
        const q = await fetchQualificationAtPoint(P.lat, P.lon, { fetchImpl });
        expect(q).not.toBeNull();
        expect(q!.clau).toBe('18');
        expect((q as { disambiguatedBy?: string }).disambiguatedBy).toBe('amb-qu-trames-16');
        // The AMB query filters by the candidates' own INE and asks the QU layer.
        expect(ambUrl).toContain(`/${AMB_QU_LAYER}/query`);
        expect(ambUrl).toContain('08019');
    });

    it('CORROBORATION-ONLY: an AMB clau the MUC did not return resolves NOTHING', async () => {
        const fetchImpl = routedFetch(JSON.stringify(ambiguousFc), ambAnswer('13a'));
        await expect(fetchQualificationAtPoint(P.lat, P.lon, { fetchImpl })).resolves.toBeNull();
    });

    it('refuses when the AMB answers more than one feature', async () => {
        const fetchImpl = routedFetch(JSON.stringify(ambiguousFc), ambAnswer('18', 2));
        await expect(fetchQualificationAtPoint(P.lat, P.lon, { fetchImpl })).resolves.toBeNull();
    });

    it('refuses on the ArcGIS 200-with-{error} envelope (a FAILURE, never an empty)', async () => {
        const fetchImpl = routedFetch(
            JSON.stringify(ambiguousFc),
            JSON.stringify({ error: { code: 400, message: 'Invalid query' } }),
        );
        await expect(fetchQualificationAtPoint(P.lat, P.lon, { fetchImpl })).resolves.toBeNull();
    });

    it('refuses when the AMB call throws (outage keeps today\'s honest refusal)', async () => {
        const fetchImpl = routedFetch(JSON.stringify(ambiguousFc), () => { throw new Error('offline'); });
        await expect(fetchQualificationAtPoint(P.lat, P.lon, { fetchImpl })).resolves.toBeNull();
    });

    it('does NOT contact the AMB when the WMS already resolved one container', async () => {
        let ambCalls = 0;
        const oneContainer = {
            features: [feature('13a', 'R2', square(P.lon, P.lat, 0.002), 'Densificació urbana intensiva')],
        };
        const fetchImpl = routedFetch(JSON.stringify(oneContainer), ambAnswer('13a'), () => { ambCalls++; });
        const q = await fetchQualificationAtPoint(P.lat, P.lon, { fetchImpl });
        expect(q!.clau).toBe('13a');
        expect(ambCalls).toBe(0);
    });

    it('mixed-INE candidate sets are REAL ambiguity — no AMB query, no answer', async () => {
        const mixed = {
            features: [
                feature('18', 'R4', square(P.lon, P.lat, 0.002)),
                { ...feature('SX1', 'SX1', square(P.lon, P.lat, 0.01)), properties: { ...feature('SX1', 'SX1', square(P.lon, P.lat, 0.01)).properties, CODI_INE: '08101' } },
            ],
        };
        let ambCalls = 0;
        const fetchImpl = routedFetch(JSON.stringify(mixed), ambAnswer('18'), () => { ambCalls++; });
        await expect(fetchQualificationAtPoint(P.lat, P.lon, { fetchImpl })).resolves.toBeNull();
        expect(ambCalls).toBe(0);
    });

    it('buildAmbQuUrl asks for server-side containment with no geometry back', () => {
        const url = buildAmbQuUrl(P.lat, P.lon, '08019');
        expect(url).toContain('spatialRel=esriSpatialRelIntersects');
        expect(url).toContain('returnGeometry=false');
        expect(url).toContain('f=json');
    });

    it('disambiguateViaAmbQuTrames handles an empty candidate set without contacting the AMB', async () => {
        let calls = 0;
        const fetchImpl = (async () => { calls++; return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
        await expect(disambiguateViaAmbQuTrames({ features: [] }, P.lon, P.lat, { fetchImpl })).resolves.toBeNull();
        expect(calls).toBe(0);
    });
});
