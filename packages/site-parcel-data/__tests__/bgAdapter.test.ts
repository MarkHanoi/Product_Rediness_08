// LANE BG — BULGARIA adapter: the parcel arm (GCCA/AGKK INSPIRE Cadastral Parcels, ArcGIS REST),
// the FetchOutcome classification (found / absent / transient — DIFFERENT VALUES), the routing
// deferral (BG not modelled by the national resolver → claimsNation('BG') inert), the sweep-
// confirmed WMS GetFeatureInfo channel, and the documents-only rules stance.
//
// Fixtures are RECORDED LIVE 2026-09-03 bodies (fixtures/bg-sofia-2026-09-03/). Every test injects
// `fetchImpl` — never a live call. The point path exercises the shared ArcGIS container.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    bgCountryAdapter,
    BG_SOURCES,
    BG_ADAPTER_ENDPOINT_BINDINGS,
    BG_PARCEL_SOURCE_ID,
    BG_KAIS_EXTRACT_SOURCE_ID,
    BG_INSPIRE_CADASTRE_BASE,
    BG_WMS_ENDPOINT,
    BG_INCOMPLETE_CADASTRE_CAVEAT,
    BULGARIA_BBOX,
    BG_ROUTING_DEFERRAL,
    isInBulgaria,
    parseBgParcelFeature,
    resolveBgParcelAtWgs84Point,
    resolveBgParcelByReference,
    bgParcelWhereQuery,
    buildBgWmsGetFeatureInfoUrl,
    parseBgWmsGetFeatureInfo,
    type BgArcgisDeps,
} from '../src/countryAdapters/bg/index.js';
import { isTransientFetchReason } from '@pryzm/schemas';
import { resolveNationalJurisdiction } from '../src/jurisdiction/nationalJurisdictionResolver.js';

const FIX = JSON.parse(
    readFileSync(
        new URL('./fixtures/bg-sofia-2026-09-03/recorded-live-2026-09-03.json', import.meta.url),
        'utf8',
    ),
) as {
    sofiaCenterPoint: unknown;
    refLookup: unknown;
    seaAbsent: unknown;
    badField: unknown;
};
const WMS_GFI = JSON.parse(
    readFileSync(
        new URL('./fixtures/bg-sofia-2026-09-03/wms-getfeatureinfo-sofia.geojson', import.meta.url),
        'utf8',
    ),
) as unknown;

/** A fetch stub returning a fixed JSON body (ok:true, 200), the shape both query paths read. */
function makeFetch(body: unknown, { ok = true, status = 200 }: { ok?: boolean; status?: number } = {}): BgArcgisDeps {
    const fetchImpl = (async () => ({
        ok,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
    })) as unknown as typeof fetch;
    return { fetchImpl };
}

/** A fetch stub that throws (transport failure). */
function throwingFetch(): BgArcgisDeps {
    const fetchImpl = (async () => {
        throw new Error('ECONNRESET (simulated)');
    }) as unknown as typeof fetch;
    return { fetchImpl };
}

const SOFIA = { lat: 42.6975, lon: 23.3223 }; // Sveta Nedelya square — the capital
const SOFIA_REF = '68134.100.5';

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 0. THE FIXTURE IS RECORDED-LIVE, NOT SYNTHETIC (a proof older than its subject proves nothing).
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('BG fixtures are the real GCCA bytes', () => {
    it('the Sofia point fixture carries a WGS84 ring and the real reference', () => {
        const fc = FIX.sofiaCenterPoint as { features: Array<{ attributes: Record<string, unknown>; geometry: { rings: number[][][] } }>; spatialReference?: { wkid?: number } };
        expect(fc.spatialReference?.wkid).toBe(4326);
        expect(fc.features[0]!.attributes['nationalcadastralref']).toBe(SOFIA_REF);
        // EPSG:4326 lon,lat — Sofia ~ 23.3, 42.7 (degrees, NOT projected metres).
        expect(fc.features[0]!.geometry.rings[0]![0]![0]).toBeGreaterThan(23);
        expect(fc.features[0]!.geometry.rings[0]![0]![1]).toBeGreaterThan(42);
    });
    it('the sea fixture is an empty FeatureCollection (durable absent, no error)', () => {
        const fc = FIX.seaAbsent as { features: unknown[]; error?: unknown };
        expect(fc.features).toHaveLength(0);
        expect(fc.error).toBeUndefined();
    });
    it('the bad-field fixture is a 200-with-error body', () => {
        expect((FIX.badField as { error?: { code?: number } }).error?.code).toBe(400);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. isInBulgaria — specificity-metric predicate, NOT a routing authority.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('isInBulgaria — specificity-metric predicate (NOT a routing authority)', () => {
    it('Sofia / Plovdiv / Varna / Ruse are inside the box', () => {
        expect(isInBulgaria(42.6975, 23.3223)).toBe(true); // Sofia
        expect(isInBulgaria(42.1354, 24.7453)).toBe(true); // Plovdiv
        expect(isInBulgaria(43.2141, 27.9147)).toBe(true); // Varna (Black Sea coast)
        expect(isInBulgaria(43.8564, 25.9707)).toBe(true); // Ruse (Danube)
    });
    it('outside Bulgaria and non-finite → false', () => {
        expect(isInBulgaria(48.8566, 2.3522)).toBe(false); // Paris
        expect(isInBulgaria(Number.NaN, 23)).toBe(false);
    });
    it('the box is a coarse rectangle bracketing the country', () => {
        expect(BULGARIA_BBOX.minLat).toBeLessThan(BULGARIA_BBOX.maxLat);
        expect(BULGARIA_BBOX.minLon).toBeLessThan(BULGARIA_BBOX.maxLon);
        expect(BULGARIA_BBOX.maxLon).toBeGreaterThan(28); // Black Sea east
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE ROUTING DEFERRAL — BG is not modelled by the national resolver.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('the ROUTING deferral — BG is not modelled by the national resolver', () => {
    it('resolveNationalJurisdiction does NOT claim BG at Sofia or Varna (measured 2026-09-03)', () => {
        for (const [lat, lon] of [[42.6975, 23.3223], [43.2141, 27.9147]] as const) {
            const v = resolveNationalJurisdiction(lat, lon);
            // The whole point: the resolver never returns 'BG', so claimsNation('BG') is false.
            expect(v.ok && v.regionCode === 'BG').toBe(false);
        }
    });
    it('the deferral is stated as data with a named retirement + reviewBy (the SE pattern)', () => {
        expect(BG_ROUTING_DEFERRAL.declaredOn).toBe('2026-09-03');
        expect(BG_ROUTING_DEFERRAL.reviewBy).toBe('2027-03-01');
        expect(BG_ROUTING_DEFERRAL.retiredBy.length).toBe(2); // resolver boundary + proxy row
        expect(BG_ROUTING_DEFERRAL.evidence).toMatch(/BGR absent/);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. parseBgParcelFeature — the pure feature parse.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('parseBgParcelFeature — the pure feature parse', () => {
    it('extracts the reference + WGS84 ring + register area verbatim from the Sofia feature', () => {
        const fc = FIX.sofiaCenterPoint as { features: unknown[] };
        const parcel = parseBgParcelFeature(fc.features[0] as never);
        expect(parcel).not.toBeNull();
        expect(parcel!.nationalCadastralReference).toBe(SOFIA_REF);
        expect(parcel!.inspireNamespace).toBe('BG.CP');
        expect(parcel!.crs).toBe('EPSG:4326');
        expect(parcel!.areaM2).toBe(3499); // register m², carried verbatim
        expect(parcel!.ring.length).toBeGreaterThanOrEqual(3);
        // [lon, lat] order, near Sofia centre.
        expect(parcel!.ring[0]![0]).toBeGreaterThan(23);
        expect(parcel!.ring[0]![1]).toBeGreaterThan(42);
        expect(parcel!.source).toBe(BG_PARCEL_SOURCE_ID);
    });
    it('returns null without a reference or without a ≥3-vertex ring', () => {
        expect(parseBgParcelFeature({ attributes: {}, geometry: { rings: [[]] } } as never)).toBeNull();
        expect(
            parseBgParcelFeature({
                attributes: { nationalcadastralref: '1' },
                geometry: { rings: [[[1, 2]]] },
            } as never),
        ).toBeNull();
    });
    it('treats a served "Null" string as absence, never as a value', () => {
        const fc = FIX.sofiaCenterPoint as { features: Array<{ attributes: Record<string, unknown>; geometry: unknown }> };
        const feat = { attributes: { ...fc.features[0]!.attributes, id_namespace: 'NULL' }, geometry: fc.features[0]!.geometry };
        const parcel = parseBgParcelFeature(feat as never);
        expect(parcel!.inspireNamespace).toBeNull();
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. resolveBgParcelAtWgs84Point — the map-click path (found / absent / transient). THE DELIVERABLE.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('resolveBgParcelAtWgs84Point — the capital click (found / absent / transient)', () => {
    it('FOUND: Sofia resolves to the real reference 68134.100.5 with a WGS84 ring', async () => {
        const out = await resolveBgParcelAtWgs84Point(SOFIA.lat, SOFIA.lon, makeFetch(FIX.sofiaCenterPoint));
        expect(out.status).toBe('found');
        if (out.status !== 'found') throw new Error('unreachable');
        expect(out.value.nationalCadastralReference).toBe(SOFIA_REF);
        expect(out.value.areaM2).toBe(3499);
        expect(out.value.ring.length).toBe(51); // measured: 51-vertex ring
    });

    it('ABSENT: a sea point returns absent (NOT transient) carrying the incomplete-cadastre caveat', async () => {
        const out = await resolveBgParcelAtWgs84Point(43.2, 28.9, makeFetch(FIX.seaAbsent));
        expect(out.status).toBe('absent');
        if (out.status !== 'absent') throw new Error('unreachable');
        expect(out.reason).toContain('no-feature');
        expect(out.reason).toContain(BG_INCOMPLETE_CADASTRE_CAVEAT);
        // The absence reason token must NOT be in the transient set (§CONTEXT-DATA-HONESTY).
        expect(isTransientFetchReason('no-feature')).toBe(false);
    });

    it('TRANSIENT: an ArcGIS 200-with-error body is a failure, never an empty answer', async () => {
        const out = await resolveBgParcelAtWgs84Point(SOFIA.lat, SOFIA.lon, makeFetch(FIX.badField));
        expect(out.status).toBe('transient');
        if (out.status !== 'transient') throw new Error('unreachable');
        expect(out.reason.startsWith('upstream-failed')).toBe(true);
        expect(out.reason).toContain('400'); // the server's own code is carried
        expect(isTransientFetchReason('upstream-failed')).toBe(true);
    });

    it('TRANSIENT: a transport throw classifies transient, never absent', async () => {
        const out = await resolveBgParcelAtWgs84Point(SOFIA.lat, SOFIA.lon, throwingFetch());
        expect(out.status).toBe('transient');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. resolveBgParcelByReference — the by-id lookup path.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('resolveBgParcelByReference — the by-id lookup path', () => {
    it('FOUND: reference lookup resolves the same Sofia parcel', async () => {
        const out = await resolveBgParcelByReference(SOFIA_REF, makeFetch(FIX.refLookup));
        expect(out.status).toBe('found');
        if (out.status !== 'found') throw new Error('unreachable');
        expect(out.value.nationalCadastralReference).toBe(SOFIA_REF);
    });

    it('TRANSIENT: the where path maps a non-OK HTTP to transient (no retry, fast)', async () => {
        const out = await bgParcelWhereQuery("nationalcadastralref='x'", 'test', makeFetch({}, { ok: false, status: 500 }));
        expect(out.status).toBe('transient');
        if (out.status !== 'transient') throw new Error('unreachable');
        expect(out.reason).toContain('HTTP 500');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. The WMS GetFeatureInfo channel (sweep-confirmed INSPIRE view service) — same identifier.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('WMS GetFeatureInfo — the sweep-confirmed view channel', () => {
    it('builds a CRS:84 GetFeatureInfo URL centred on the point, against the WMS endpoint', () => {
        const url = buildBgWmsGetFeatureInfoUrl(SOFIA.lat, SOFIA.lon);
        expect(url.startsWith(BG_WMS_ENDPOINT)).toBe(true);
        expect(url).toContain('REQUEST=GetFeatureInfo');
        expect(url).toContain('CRS=CRS%3A84');
        expect(url).toContain('INFO_FORMAT=application%2Fgeo%2Bjson');
    });
    it('parses the recorded-live GetFeatureInfo body to the same reference 68134.100.5', () => {
        expect(parseBgWmsGetFeatureInfo(WMS_GFI)).toBe(SOFIA_REF);
    });
    it('returns null on an empty/garbage GetFeatureInfo body (never a fabricated id)', () => {
        expect(parseBgWmsGetFeatureInfo({ features: [] })).toBeNull();
        expect(parseBgWmsGetFeatureInfo(null)).toBeNull();
        expect(parseBgWmsGetFeatureInfo({ features: [{ properties: { nationalCadastralReference: 'NULL' } }] })).toBeNull();
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 7. bgCountryAdapter — the §J shape + sources.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('bgCountryAdapter — the §J shape + sources', () => {
    it('is BG, serves the probed sources, and states documents-only rules', () => {
        expect(bgCountryAdapter.country).toBe('BG');
        expect(bgCountryAdapter.sources()).toBe(BG_SOURCES);
        expect(bgCountryAdapter.rules.kind).toBe('documents-only');
        expect(bgCountryAdapter.rules.reason).toMatch(/ЗУТ|ОУП|ПУП/);
        expect(bgCountryAdapter.precedence.length).toBeGreaterThan(0);
    });

    it('BG_SOURCES parses (defineSources ran), splits keyless vs paid, every binding names a row', () => {
        expect(BG_SOURCES.length).toBe(2);
        for (const row of BG_SOURCES) {
            expect(row.country).toBe('BG');
            expect(row.probes.length).toBeGreaterThan(0); // no unprobed rows
        }
        const keyless = BG_SOURCES.find((s) => s.id === BG_PARCEL_SOURCE_ID)!;
        expect(keyless.gate).toBeNull();
        expect(keyless.protocol).toBe('REST');
        expect(keyless.adapterStatus).toBe('live');
        const paid = BG_SOURCES.find((s) => s.id === BG_KAIS_EXTRACT_SOURCE_ID)!;
        expect(paid.gate).toContain('paid');
        expect(paid.licence.colour).toBe('RED');
        expect(paid.adapterStatus).toBe('deferred-stub');
        for (const b of BG_ADAPTER_ENDPOINT_BINDINGS) {
            expect(BG_SOURCES.some((s) => s.id === b.sourceId)).toBe(true);
            expect(b.endpoint.startsWith(BG_INSPIRE_CADASTRE_BASE)).toBe(true);
        }
    });
});
