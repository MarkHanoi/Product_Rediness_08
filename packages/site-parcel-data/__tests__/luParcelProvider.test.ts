// LANE LU-PARCEL — THE LUXEMBOURG PARCEL ADAPTER, proven at the RESOLVER layer (committed ≠
// reachable: these run the real `resolveLuParcelAtWgs84Point` against RECORDED-LIVE bodies, not a
// pure parser return). Fixtures:
//   __tests__/fixtures/lu-luxcity/recorded-live-2026-09-03.json — GetFeature at the FOUNDER'S
//     reported click 49.61195,6.12926 (the bug coordinate), replayed via LuParcelWfsDeps.fetchImpl.
//   __tests__/fixtures/lu-esch/recorded-live-2026-09-03.json    — Esch-sur-Alzette 49.496,5.981.
//
// THE FALSIFICATION TARGETS (each named at its test):
//   • features[0] IS THE WRONG PARCEL — LU parcels are dense; a click window straddles 3–4 parcels
//     returned in feature-id order. The founder fixture's features[0] is 075F00138000000 but the
//     CONTAINING parcel is 075F00137000000. The resolver MUST point-in-polygon-pick the container,
//     never features[0]. Test 1 asserts BOTH (the resolved ref, and that it ≠ features[0]).
//   • empty ≠ failure — a network throw is `transient` naming the endpoint; a 200-empty
//     FeatureCollection is `absent`; an HTTP-400 OWS ExceptionReport is `transient` with the
//     server text. Collapsing any of these is caught. Severing the endpoint NEVER yields a
//     wrong-country parcel (a LU fixture can only ever mint an LU reference).
//   • the click URL is the MEASURED working shape — small window, lat,lon urn:4326 bbox,
//     srsName=EPSG:4326, GeoJSON. Flipping any of these breaks the real service.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FetchOutcome } from '@pryzm/schemas';
import {
    LU_PARCEL_CLICK_HALF_DEG,
    LU_PARCEL_LAYER,
    LU_PARCEL_PROVIDER_ID,
    buildLuParcelClickUrl,
    extractLuOwsExceptionText,
    isInLuxembourg,
    luCountryAdapter,
    parseLuParcelFeature,
    pickLuParcelFeature,
    resolveLuParcelAtWgs84Point,
    type LuCadastralParcel,
    type LuParcelWfsDeps,
    type LuParcelWfsFeature,
} from '../src/countryAdapters/lu/index.js';

const LUXCITY = JSON.parse(
    readFileSync(new URL('./fixtures/lu-luxcity/recorded-live-2026-09-03.json', import.meta.url), 'utf8'),
) as { features: LuParcelWfsFeature[] };
const ESCH = JSON.parse(
    readFileSync(new URL('./fixtures/lu-esch/recorded-live-2026-09-03.json', import.meta.url), 'utf8'),
) as { features: LuParcelWfsFeature[] };

/** A fake fetch that returns the canned body (ignoring the URL — the resolver builds it). */
function makeFetch(body: unknown, opts: { ok?: boolean; status?: number } = {}): LuParcelWfsDeps {
    const fetchImpl = (async () =>
        ({
            ok: opts.ok ?? true,
            status: opts.status ?? 200,
            text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
        }) as unknown as Response) as typeof fetch;
    return { fetchImpl };
}

function foundValue<T>(o: FetchOutcome<T>): T {
    expect(o.status).toBe('found');
    if (o.status !== 'found') throw new Error('unreachable');
    return o.value;
}

// ── 1. THE RECORDED-LIVE CLICKS — the founder bug coordinate + Esch resolve the CONTAINING parcel ─
describe('LU — the recorded-live click resolves the CONTAINING cadastral parcel (never features[0])', () => {
    it('the founder click 49.61195,6.12926 → national_cadastral_reference 075F00137000000 (label 137)', async () => {
        const outcome = await resolveLuParcelAtWgs84Point(49.61195, 6.12926, makeFetch(LUXCITY));
        const parcel: LuCadastralParcel = foundValue(outcome);
        expect(parcel.nationalCadastralReference).toBe('075F00137000000');
        expect(parcel.label).toBe('137');
        expect(parcel.areaM2).toBeCloseTo(140.92, 2);
        expect(parcel.section).toBe('75F');
        expect(parcel.crs).toBe('EPSG:4326');
        expect(parcel.source).toBe(LU_PARCEL_PROVIDER_ID);
        expect(parcel.ring.length).toBeGreaterThanOrEqual(3);
        // The FALSIFICATION: the served features[0] is a DIFFERENT (adjacent) parcel — proof the
        // resolver point-in-polygon-picks the container, never the first feature.
        const firstRef = String(LUXCITY.features[0]!.properties['national_cadastral_reference']);
        expect(firstRef).toBe('075F00138000000');
        expect(parcel.nationalCadastralReference).not.toBe(firstRef);
    });

    it('Esch-sur-Alzette 49.496,5.981 → 039A00606016640 (label 606/16640), also not features[0]', async () => {
        const outcome = await resolveLuParcelAtWgs84Point(49.496, 5.981, makeFetch(ESCH));
        const parcel = foundValue(outcome);
        expect(parcel.nationalCadastralReference).toBe('039A00606016640');
        expect(parcel.label).toBe('606/16640');
        expect(parcel.crs).toBe('EPSG:4326');
        const firstRef = String(ESCH.features[0]!.properties['national_cadastral_reference']);
        expect(parcel.nationalCadastralReference).not.toBe(firstRef); // features[0] is 039A00600012957
    });

    it('byte-identical restore — re-running the same fixture yields the same parcel (deterministic)', async () => {
        const a = foundValue(await resolveLuParcelAtWgs84Point(49.61195, 6.12926, makeFetch(LUXCITY)));
        const b = foundValue(await resolveLuParcelAtWgs84Point(49.61195, 6.12926, makeFetch(LUXCITY)));
        expect(a.nationalCadastralReference).toBe(b.nationalCadastralReference);
        expect(a.ring).toEqual(b.ring);
    });

    it('the pure parser drops a feature with no national_cadastral_reference or a degenerate ring', () => {
        expect(
            parseLuParcelFeature({ properties: { label: '137' }, geometry: null }),
        ).toBeNull();
        expect(
            parseLuParcelFeature({
                properties: { national_cadastral_reference: '075F00137000000' },
                geometry: { type: 'Polygon', coordinates: [[[6, 49], [6.1, 49.1]]] }, // 2 verts < 3
            }),
        ).toBeNull();
    });
});

// ── 2. FetchOutcome — empty ≠ failure, and severing the endpoint NEVER invents a parcel ──────────
describe('LU — a failed source and an empty answer are DIFFERENT outcomes (§CONTEXT-DATA-HONESTY)', () => {
    it('a network throw is TRANSIENT naming the endpoint (never absent, never a wrong-country parcel)', async () => {
        const deps: LuParcelWfsDeps = {
            fetchImpl: (async () => {
                throw new Error('ECONNRESET');
            }) as typeof fetch,
        };
        const outcome = await resolveLuParcelAtWgs84Point(49.61195, 6.12926, deps);
        expect(outcome.status).toBe('transient');
        if (outcome.status === 'transient') {
            expect(outcome.reason).toMatch(/^endpoint-unreachable:/);
            expect(outcome.reason).toContain('wms.inspire.geoportail.lu');
        }
    });

    it('a 200 empty FeatureCollection is ABSENT (durable "no parcel here"), never transient', async () => {
        const outcome = await resolveLuParcelAtWgs84Point(
            49.815, // open countryside — no parcel
            6.3,
            makeFetch({ type: 'FeatureCollection', features: [] }),
        );
        expect(outcome.status).toBe('absent');
        if (outcome.status === 'absent') expect(outcome.reason).toMatch(/^no-parcel:/);
    });

    it('an HTTP-400 OWS ExceptionReport is TRANSIENT and carries the server text (never absent)', async () => {
        const body =
            '<?xml version="1.0"?><ows:ExceptionReport xmlns:ows="http://www.opengis.net/ows/1.1">' +
            '<ows:Exception exceptionCode="NoApplicableCode"><ows:ExceptionText>' +
            'Bounding box coordinate 0 is not parsable' +
            '</ows:ExceptionText></ows:Exception></ows:ExceptionReport>';
        const outcome = await resolveLuParcelAtWgs84Point(
            49.61195,
            6.12926,
            makeFetch(body, { ok: false, status: 400 }),
        );
        expect(outcome.status).toBe('transient');
        if (outcome.status === 'transient') {
            expect(outcome.reason).toMatch(/^upstream-failed:/);
            expect(outcome.reason).toMatch(/not parsable/);
        }
    });

    it('extractLuOwsExceptionText pulls the text out of a GeoServer ExceptionReport, null on JSON', () => {
        expect(
            extractLuOwsExceptionText(
                '<ows:ExceptionReport><ows:ExceptionText>Bounding box coordinate 0 is not parsable</ows:ExceptionText></ows:ExceptionReport>',
            ),
        ).toMatch(/not parsable/);
        expect(extractLuOwsExceptionText('{"type":"FeatureCollection"}')).toBeNull();
    });
});

// ── 3. THE CLICK URL — the MEASURED working shape (small window · urn:4326 · WGS84 out · GeoJSON) ─
describe('LU — the click bbox URL is the MEASURED working shape', () => {
    it('emits a SMALL lat,lon urn:4326 bbox, srsName=EPSG:4326, GeoJSON, on the ACT INSPIRE host', () => {
        const url = buildLuParcelClickUrl(49.61195, 6.12926);
        const decoded = decodeURIComponent(url);
        expect(decoded).toContain('wms.inspire.geoportail.lu/geoserver/wfs');
        expect(decoded).toContain(`typeNames=${LU_PARCEL_LAYER}`);
        expect(decoded).toContain('srsName=EPSG:4326');
        expect(decoded).toContain('outputFormat=application/json');
        // lat,lon urn order — the FALSIFICATION TARGET (a CQL INTERSECTS / bare EPSG:4326 returns 0).
        expect(decoded).toContain('urn:ogc:def:crs:EPSG::4326');
        // the window is SMALL on purpose (dense LU parcels) — the bbox min corner is lat-h,lon-h.
        const h = LU_PARCEL_CLICK_HALF_DEG;
        expect(decoded).toContain(`bbox=${49.61195 - h},${6.12926 - h},`);
        expect(h).toBeLessThan(0.0002); // materially smaller than the shared HALF_DEG (0.00035)
    });
});

// ── 4. THE §J ADAPTER SHAPE + the jurisdiction pre-filter ────────────────────────────────────────
describe('LU — the §J adapter exposes the parcel leg alongside the untouched rules half', () => {
    it('luCountryAdapter.parcel.resolveAtWgs84Point resolves the founder parcel; rules stay structured', async () => {
        expect(typeof luCountryAdapter.parcel.resolveAtWgs84Point).toBe('function');
        // The RULES half is untouched (one authority per concept — parcel ≠ rules).
        expect(luCountryAdapter.rules.kind).toBe('structured');
        const outcome = await (
            luCountryAdapter.parcel.resolveAtWgs84Point as (
                lat: number,
                lon: number,
                deps?: LuParcelWfsDeps,
            ) => Promise<FetchOutcome<LuCadastralParcel>>
        )(49.61195, 6.12926, makeFetch(LUXCITY));
        expect(foundValue(outcome).nationalCadastralReference).toBe('075F00137000000');
    });

    it('isInLuxembourg claims Luxembourg City + Esch and rejects the neighbours it sits inside', () => {
        expect(isInLuxembourg(49.6116, 6.1319)).toBe(true); // Luxembourg City
        expect(isInLuxembourg(49.496, 5.981)).toBe(true); // Esch-sur-Alzette
        expect(isInLuxembourg(49.1193, 6.1757)).toBe(false); // Metz (FR)
        expect(isInLuxembourg(Number.NaN, 6.13)).toBe(false);
    });

    it('pickLuParcelFeature returns the CONTAINING feature, and a nearest fallback off any polygon', () => {
        // container at the founder click
        const picked = pickLuParcelFeature(LUXCITY.features, 49.61195, 6.12926);
        expect(picked).not.toBeNull();
        expect(String(picked!.properties['national_cadastral_reference'])).toBe('075F00137000000');
        // a point far outside every ring still yields SOME feature (nearest centroid), never null,
        // as long as at least one usable ring is present.
        const far = pickLuParcelFeature(LUXCITY.features, 49.7, 6.3);
        expect(far).not.toBeNull();
        // no usable ring → null
        expect(pickLuParcelFeature([{ properties: {}, geometry: null }], 49.6, 6.1)).toBeNull();
    });
});
