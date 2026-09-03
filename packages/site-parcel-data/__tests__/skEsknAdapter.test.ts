// LANE SK — SLOVAKIA adapter: the parcel arm (ÚGKK/GKÚ ESKN cadastre, ArcGIS MapServer), the
// FetchOutcome classification (found / absent / transient — DIFFERENT VALUES), the routing deferral
// (SVK is a REFUSAL-ONLY NEIGHBOUR, not a claimable country -> claimsNation('SK') inert), and the
// documents-only rules stance.
//
// Fixtures are RECORDED LIVE 2026-09-03 bodies (fixtures/sk-bratislava-2026-09-03/*.json). Every
// test injects `fetchImpl` — never a live call. The point path exercises the shared ArcGIS container;
// the by-id path exercises the objectIds seam (the WAF blocks where=, so objectIds is the by-id form).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    skCountryAdapter,
    SK_SOURCES,
    SK_ADAPTER_ENDPOINT_BINDINGS,
    SK_PARCEL_SOURCE_ID,
    SK_PARCEL_ENDPOINT,
    SLOVAKIA_BBOX,
    SK_ROUTING_DEFERRAL,
    isInSlovakia,
    claimsSlovakia,
    parseSkParcelFeature,
    resolveSkParcelAtWgs84Point,
    resolveSkParcelByRegisterCId,
    type SkArcgisDeps,
} from '../src/countryAdapters/sk/index.js';
import { isTransientFetchReason } from '@pryzm/schemas';
import { resolveNationalJurisdiction } from '../src/jurisdiction/nationalJurisdictionResolver.js';

const FIX = JSON.parse(
    readFileSync(
        new URL('./fixtures/sk-bratislava-2026-09-03/recorded-live-2026-09-03.json', import.meta.url),
        'utf8',
    ),
) as {
    bratislavaOldTownPoint: unknown;
    registerCIdLookup: unknown;
    outsideCoverageAbsent: unknown;
};

/** A fetch stub returning a fixed JSON body (ok:true, 200), the shape both query paths read. */
function makeFetch(
    body: unknown,
    { ok = true, status = 200 }: { ok?: boolean; status?: number } = {},
): SkArcgisDeps {
    const fetchImpl = (async () => ({
        ok,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
    })) as unknown as typeof fetch;
    return { fetchImpl };
}

/** A fetch stub that throws (transport failure). */
function throwingFetch(): SkArcgisDeps {
    const fetchImpl = (async () => {
        throw new Error('ECONNRESET (simulated)');
    }) as unknown as typeof fetch;
    return { fetchImpl };
}

const BRATISLAVA = { lat: 48.1436, lon: 17.1077 }; // Old Town / Hlavné námestie
const BRATISLAVA_ID = 2090872505; // register-C parcel id (OID)
const BRATISLAVA_PARCEL_NO = '15';

describe('isInSlovakia — specificity-metric predicate (NOT a routing authority)', () => {
    it('Bratislava / Košice / Žilina / Poprad are inside the box', () => {
        expect(isInSlovakia(48.1436, 17.1077)).toBe(true); // Bratislava
        expect(isInSlovakia(48.7164, 21.2611)).toBe(true); // Košice
        expect(isInSlovakia(49.2231, 18.7398)).toBe(true); // Žilina
        expect(isInSlovakia(49.0559, 20.2985)).toBe(true); // Poprad
    });
    it('Vienna / Budapest / Prague (neighbour capitals just outside) and non-finite -> false', () => {
        expect(isInSlovakia(48.2082, 16.3738)).toBe(false); // Vienna (west of 16.8°E)
        expect(isInSlovakia(47.4979, 19.0402)).toBe(false); // Budapest (south of 47.7°N)
        expect(isInSlovakia(50.0755, 14.4378)).toBe(false); // Prague
        expect(isInSlovakia(Number.NaN, 20)).toBe(false);
    });
    it('the box is a coarse rectangle over the mainland', () => {
        expect(SLOVAKIA_BBOX.minLon).toBeLessThan(17); // Bratislava/Záhorie west
        expect(SLOVAKIA_BBOX.maxLon).toBeGreaterThan(22); // UA border east
    });
});

describe('the ROUTING deferral — SVK is a refusal-only neighbour, not a claimable country', () => {
    it('resolveNationalJurisdiction does NOT claim SK at Bratislava or Košice (measured 2026-09-03)', () => {
        for (const [lat, lon] of [[48.1436, 17.1077], [48.7164, 21.2611]] as const) {
            const v = resolveNationalJurisdiction(lat, lon);
            // The whole point: the resolver never returns 'SK', so claimsNation('SK') is false.
            expect(v.ok && v.regionCode === 'SK').toBe(false);
            // MEASURED: the capital refuses `no-national-candidate` (no prefilter covers it).
            expect(v.ok).toBe(false);
            if (!v.ok) expect(v.reason).toBe('no-national-candidate');
        }
    });
    it('a northern Slovak point inside POLAND_BBOX refuses `claimed-by-unmodelled-neighbour` naming SVK (L-12887)', () => {
        // Poprad (49.055,20.298) is inside POLAND_BBOX; the SVK neighbour polygon refuses the POL
        // candidate rather than misrouting to Poland. This is why SVK belongs in the boundary set.
        const v = resolveNationalJurisdiction(49.055, 20.298);
        expect(v.ok).toBe(false);
        if (!v.ok) {
            expect(v.reason).toBe('claimed-by-unmodelled-neighbour');
            expect(v.detail).toContain('SVK');
        }
    });
    it('claimsSlovakia is false at Bratislava (dormant until SVK is promoted)', () => {
        expect(claimsSlovakia(48.1436, 17.1077)).toBe(false);
        expect(claimsSlovakia(Number.NaN, 20)).toBe(false);
    });
    it('the deferral is stated as data with a named retirement + reviewBy (the SE pattern)', () => {
        expect(SK_ROUTING_DEFERRAL.declaredOn).toBe('2026-09-03');
        expect(SK_ROUTING_DEFERRAL.reviewBy).toBe('2026-12-03');
        expect(SK_ROUTING_DEFERRAL.retiredBy.length).toBe(3); // promote SVK + prefilter + HUN neighbour
        expect(SK_ROUTING_DEFERRAL.evidence).toMatch(/claimed-by-unmodelled-neighbour/);
        expect(SK_ROUTING_DEFERRAL.evidence).toMatch(/SVK/);
    });
});

describe('parseSkParcelFeature — the pure feature parse', () => {
    it('extracts parcel №, register-C id, k.ú. id, LV id + WGS84 ring + register AREA verbatim', () => {
        const fc = FIX.bratislavaOldTownPoint as { features: unknown[] };
        const parcel = parseSkParcelFeature(fc.features[0] as never);
        expect(parcel).not.toBeNull();
        expect(parcel!.parcelNumber).toBe(BRATISLAVA_PARCEL_NO);
        expect(parcel!.registerCId).toBe(BRATISLAVA_ID);
        expect(parcel!.cadastralUnitId).toBe(2933);
        expect(parcel!.folioId).toBe(335384911);
        expect(parcel!.areaM2).toBe(832); // register m² (Výmera SPI), NOT derived from the ring
        expect(parcel!.crs).toBe('EPSG:4326');
        expect(parcel!.ring.length).toBeGreaterThanOrEqual(3);
        // [lon, lat] order, near Bratislava Old Town.
        expect(parcel!.ring[0]![0]).toBeGreaterThan(17);
        expect(parcel!.ring[0]![1]).toBeGreaterThan(48);
        expect(parcel!.source).toBe(SK_PARCEL_SOURCE_ID);
    });
    it('returns null without a PARCEL_NUMBER or without a >=3-vertex ring', () => {
        expect(parseSkParcelFeature({ attributes: {}, geometry: { rings: [[]] } } as never)).toBeNull();
        expect(
            parseSkParcelFeature({ attributes: { PARCEL_NUMBER: '1' }, geometry: { rings: [[[1, 2]]] } } as never),
        ).toBeNull();
    });
});

describe('resolveSkParcelAtWgs84Point — the map-click path (found / absent / transient)', () => {
    it('FOUND: Bratislava Old Town resolves to register-C id 2090872505 / parcel №15 with a WGS84 ring', async () => {
        const out = await resolveSkParcelAtWgs84Point(BRATISLAVA.lat, BRATISLAVA.lon, makeFetch(FIX.bratislavaOldTownPoint));
        expect(out.status).toBe('found');
        if (out.status !== 'found') throw new Error('unreachable');
        expect(out.value.parcelNumber).toBe(BRATISLAVA_PARCEL_NO);
        expect(out.value.registerCId).toBe(BRATISLAVA_ID);
        expect(out.value.ring.length).toBe(23); // measured: 23-vertex ring
    });

    it('ABSENT: an outside-coverage point returns absent (NOT transient)', async () => {
        const out = await resolveSkParcelAtWgs84Point(48.2082, 16.3738, makeFetch(FIX.outsideCoverageAbsent));
        expect(out.status).toBe('absent');
        if (out.status !== 'absent') throw new Error('unreachable');
        expect(out.reason).toContain('no-feature');
        // The absence reason token must NOT be in the transient set (§CONTEXT-DATA-HONESTY).
        expect(isTransientFetchReason('no-feature')).toBe(false);
    });

    it('TRANSIENT: the WAF 403 (a non-OK HTTP) is a failure, never an empty answer', async () => {
        const out = await resolveSkParcelAtWgs84Point(BRATISLAVA.lat, BRATISLAVA.lon, makeFetch({}, { ok: false, status: 403 }));
        expect(out.status).toBe('transient');
        if (out.status !== 'transient') throw new Error('unreachable');
        expect(out.reason).toContain('HTTP 403');
        expect(isTransientFetchReason('upstream-failed')).toBe(true);
    });

    it('TRANSIENT: an ArcGIS 200-with-error body classifies transient, carrying the server code', async () => {
        const errBody = { error: { code: 400, message: 'Invalid query parameters.', details: ['bad'] } };
        const out = await resolveSkParcelAtWgs84Point(BRATISLAVA.lat, BRATISLAVA.lon, makeFetch(errBody));
        expect(out.status).toBe('transient');
        if (out.status !== 'transient') throw new Error('unreachable');
        expect(out.reason.startsWith('upstream-failed')).toBe(true);
        expect(out.reason).toContain('400');
    });
});

describe('resolveSkParcelByRegisterCId — the objectIds by-id path (WAF blocks where=)', () => {
    it('FOUND: objectIds lookup resolves the same Bratislava parcel', async () => {
        const out = await resolveSkParcelByRegisterCId(BRATISLAVA_ID, makeFetch(FIX.registerCIdLookup));
        expect(out.status).toBe('found');
        if (out.status !== 'found') throw new Error('unreachable');
        expect(out.value.parcelNumber).toBe(BRATISLAVA_PARCEL_NO);
        expect(out.value.registerCId).toBe(BRATISLAVA_ID);
    });

    it('TRANSIENT: a non-OK HTTP maps to transient (no retry, fast)', async () => {
        const out = await resolveSkParcelByRegisterCId(BRATISLAVA_ID, makeFetch({}, { ok: false, status: 500 }));
        expect(out.status).toBe('transient');
        if (out.status !== 'transient') throw new Error('unreachable');
        expect(out.reason).toContain('HTTP 500');
    });

    it('TRANSIENT: a transport throw classifies transient, never absent', async () => {
        const out = await resolveSkParcelByRegisterCId(BRATISLAVA_ID, throwingFetch());
        expect(out.status).toBe('transient');
    });
});

describe('skCountryAdapter — the §J shape + sources', () => {
    it('is SK, serves the probed sources, and states documents-only rules', () => {
        expect(skCountryAdapter.country).toBe('SK');
        expect(skCountryAdapter.sources()).toBe(SK_SOURCES);
        expect(skCountryAdapter.rules.kind).toBe('documents-only');
        expect(skCountryAdapter.rules.reason).toMatch(/2028|územné/);
        expect(skCountryAdapter.precedence.length).toBeGreaterThan(0);
    });

    it('SK_SOURCES parses (defineSources ran) and every endpoint binding names a registered row', () => {
        expect(SK_SOURCES.length).toBeGreaterThanOrEqual(1);
        for (const row of SK_SOURCES) {
            expect(row.country).toBe('SK');
            expect(row.probes.length).toBeGreaterThan(0); // no unprobed rows
        }
        for (const b of SK_ADAPTER_ENDPOINT_BINDINGS) {
            expect(SK_SOURCES.some((s) => s.id === b.sourceId)).toBe(true);
            expect(b.endpoint.startsWith(SK_PARCEL_ENDPOINT)).toBe(true);
        }
    });
});
