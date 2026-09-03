// LANE GR — GREECE adapter: the parcel arm (Hellenic Cadastre operating cadastre, ArcGIS Online),
// the FetchOutcome classification (found / absent / transient — DIFFERENT VALUES), the routing
// promotion (GRC claimable since the 2026-09-03 boundary wave -> claimsNation('GR') live), and the
// documents-only rules stance.
//
// Fixtures are RECORDED LIVE 2026-09-03 bodies (fixtures/gr-athens-2026-09-03/*.json). Every test
// injects `fetchImpl` — never a live call. The point path exercises the shared ArcGIS container.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    grCountryAdapter,
    GR_SOURCES,
    GR_ADAPTER_ENDPOINT_BINDINGS,
    GR_PARCEL_SOURCE_ID,
    GR_PARCEL_SERVICE,
    GR_INCOMPLETE_CADASTRE_CAVEAT,
    GREECE_BBOX,
    GREECE_ROUTING_DEFERRAL,
    isInGreece,
    parseGrParcelFeature,
    resolveGrParcelAtWgs84Point,
    resolveGrParcelByKaek,
    grParcelWhereQuery,
    type GrArcgisDeps,
} from '../src/countryAdapters/gr/index.js';
import { isTransientFetchReason } from '@pryzm/schemas';
import { resolveNationalJurisdiction } from '../src/jurisdiction/nationalJurisdictionResolver.js';

const FIX = JSON.parse(
    readFileSync(
        new URL('./fixtures/gr-athens-2026-09-03/recorded-live-2026-09-03.json', import.meta.url),
        'utf8',
    ),
) as {
    athensSyntagmaPoint: unknown;
    kaekLookup: unknown;
    seaAbsent: unknown;
    badField: unknown;
};

/** A fetch stub returning a fixed JSON body (ok:true, 200), the shape both query paths read. */
function makeFetch(body: unknown, { ok = true, status = 200 }: { ok?: boolean; status?: number } = {}): GrArcgisDeps {
    const fetchImpl = (async () => ({
        ok,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
    })) as unknown as typeof fetch;
    return { fetchImpl };
}

/** A fetch stub that throws (transport failure). */
function throwingFetch(): GrArcgisDeps {
    const fetchImpl = (async () => {
        throw new Error('ECONNRESET (simulated)');
    }) as unknown as typeof fetch;
    return { fetchImpl };
}

const ATHENS = { lat: 37.9755, lon: 23.7348 }; // Syntagma
const ATHENS_KAEK = '050095701001';

describe('isInGreece — specificity-metric predicate (NOT a routing authority)', () => {
    it('Athens / Thessaloniki / Heraklion (Crete) / Corfu are inside the box', () => {
        expect(isInGreece(37.9755, 23.7348)).toBe(true); // Athens
        expect(isInGreece(40.6401, 22.9444)).toBe(true); // Thessaloniki
        expect(isInGreece(35.3387, 25.1442)).toBe(true); // Heraklion, Crete
        expect(isInGreece(39.6243, 19.9217)).toBe(true); // Corfu
    });
    it('outside Greece and non-finite -> false', () => {
        expect(isInGreece(48.8566, 2.3522)).toBe(false); // Paris
        expect(isInGreece(Number.NaN, 23)).toBe(false);
    });
    it('the box is a coarse rectangle covering the mainland + islands', () => {
        expect(GREECE_BBOX.minLat).toBeLessThan(35); // Gavdos/Crete south
        expect(GREECE_BBOX.maxLon).toBeGreaterThan(29); // Kastellorizo east
    });
});

describe('the ROUTING promotion — GRC is modelled by the national resolver since 2026-09-03', () => {
    it('resolveNationalJurisdiction CLAIMS GR at Athens and Thessaloniki (measured 2026-09-03)', () => {
        // retiredBy[0] of the deferral landed (lane BOUNDARY-WAVE): GRC entered the boundary set
        // as a claimable country with its ALB/MKD/TUR land neighbours refusal-only (BGR claimable
        // in the same wave), so claimsNation('GR') is now true at Greek points.
        for (const [lat, lon] of [[37.9755, 23.7348], [40.6401, 22.9444]] as const) {
            const v = resolveNationalJurisdiction(lat, lon);
            expect(v.ok).toBe(true);
            if (v.ok) expect(v.regionCode).toBe('GR');
        }
    });
    it('no overreach: the Turkish coast refuses naming TUR, never a GR claim', () => {
        for (const [lat, lon] of [[38.4237, 27.1428], [41.6771, 26.5557]] as const) { // İzmir, Edirne
            const v = resolveNationalJurisdiction(lat, lon);
            expect(v.ok).toBe(false);
            if (!v.ok) expect(v.detail).toContain('TUR');
        }
    });
    it('the deferral record survives as dated history (BOTH halves closed 2026-09-03: boundary + gr proxy)', () => {
        expect(GREECE_ROUTING_DEFERRAL.declaredOn).toBe('2026-09-03');
        expect(GREECE_ROUTING_DEFERRAL.reviewBy).toBe('2027-03-01');
        expect(GREECE_ROUTING_DEFERRAL.retiredBy.length).toBe(2); // resolver boundary + proxy row
        expect(GREECE_ROUTING_DEFERRAL.evidence).toMatch(/no-national-candidate/);
        expect(GREECE_ROUTING_DEFERRAL.boundaryRetiredOn).toBe('2026-09-03'); // boundary landed; PROXY-LEGS wired /api/parcel/gr the same day
    });
});

describe('parseGrParcelFeature — the pure feature parse', () => {
    it('extracts KAEK + WGS84 ring + register AREA verbatim from the Athens feature', () => {
        const fc = FIX.athensSyntagmaPoint as { features: unknown[] };
        const parcel = parseGrParcelFeature(fc.features[0] as never);
        expect(parcel).not.toBeNull();
        expect(parcel!.kaek).toBe(ATHENS_KAEK);
        expect(parcel!.crs).toBe('EPSG:4326');
        expect(parcel!.areaM2).toBeCloseTo(10839.766, 1); // register m², not Shape__Area
        expect(parcel!.ring.length).toBeGreaterThanOrEqual(3);
        // [lon, lat] order, near Syntagma.
        expect(parcel!.ring[0]![0]).toBeGreaterThan(23);
        expect(parcel!.ring[0]![1]).toBeGreaterThan(37);
        expect(parcel!.source).toBe(GR_PARCEL_SOURCE_ID);
    });
    it('returns null without a KAEK or without a >=3-vertex ring', () => {
        expect(parseGrParcelFeature({ attributes: {}, geometry: { rings: [[]] } } as never)).toBeNull();
        expect(
            parseGrParcelFeature({ attributes: { KAEK: '1' }, geometry: { rings: [[[1, 2]]] } } as never),
        ).toBeNull();
    });
});

describe('resolveGrParcelAtWgs84Point — the map-click path (found / absent / transient)', () => {
    it('FOUND: Athens/Syntagma resolves to KAEK 050095701001 with a WGS84 ring', async () => {
        const out = await resolveGrParcelAtWgs84Point(ATHENS.lat, ATHENS.lon, makeFetch(FIX.athensSyntagmaPoint));
        expect(out.status).toBe('found');
        if (out.status !== 'found') throw new Error('unreachable');
        expect(out.value.kaek).toBe(ATHENS_KAEK);
        expect(out.value.ring.length).toBe(10); // measured: 10-vertex ring
    });

    it('ABSENT: a sea point returns absent (NOT transient) carrying the incomplete-cadastre caveat', async () => {
        const out = await resolveGrParcelAtWgs84Point(37.9, 23.6, makeFetch(FIX.seaAbsent));
        expect(out.status).toBe('absent');
        if (out.status !== 'absent') throw new Error('unreachable');
        expect(out.reason).toContain('no-feature');
        expect(out.reason).toContain(GR_INCOMPLETE_CADASTRE_CAVEAT);
        // The absence reason token must NOT be in the transient set (§CONTEXT-DATA-HONESTY).
        expect(isTransientFetchReason('no-feature')).toBe(false);
    });

    it('TRANSIENT: an ArcGIS 200-with-error body is a failure, never an empty answer', async () => {
        const out = await resolveGrParcelAtWgs84Point(ATHENS.lat, ATHENS.lon, makeFetch(FIX.badField));
        expect(out.status).toBe('transient');
        if (out.status !== 'transient') throw new Error('unreachable');
        expect(out.reason.startsWith('upstream-failed')).toBe(true);
        expect(out.reason).toContain('400'); // the server's own code is carried
        expect(isTransientFetchReason('upstream-failed')).toBe(true);
    });

    it('TRANSIENT: a transport throw classifies transient, never absent', async () => {
        const out = await resolveGrParcelAtWgs84Point(ATHENS.lat, ATHENS.lon, throwingFetch());
        expect(out.status).toBe('transient');
    });
});

describe('resolveGrParcelByKaek — the by-id lookup path', () => {
    it('FOUND: KAEK lookup resolves the same Athens parcel', async () => {
        const out = await resolveGrParcelByKaek(ATHENS_KAEK, makeFetch(FIX.kaekLookup));
        expect(out.status).toBe('found');
        if (out.status !== 'found') throw new Error('unreachable');
        expect(out.value.kaek).toBe(ATHENS_KAEK);
    });

    it('TRANSIENT: the where path maps a non-OK HTTP to transient (no retry, fast)', async () => {
        const out = await grParcelWhereQuery("KAEK='x'", 'test', makeFetch({}, { ok: false, status: 500 }));
        expect(out.status).toBe('transient');
        if (out.status !== 'transient') throw new Error('unreachable');
        expect(out.reason).toContain('HTTP 500');
    });
});

describe('grCountryAdapter — the §J shape + sources', () => {
    it('is GR, serves the probed sources, and states documents-only rules', () => {
        expect(grCountryAdapter.country).toBe('GR');
        expect(grCountryAdapter.sources()).toBe(GR_SOURCES);
        expect(grCountryAdapter.rules.kind).toBe('documents-only');
        expect(grCountryAdapter.rules.reason).toMatch(/FEK/);
        expect(grCountryAdapter.precedence.length).toBeGreaterThan(0);
    });

    it('GR_SOURCES parses (defineSources ran) and every endpoint binding names a registered row', () => {
        expect(GR_SOURCES.length).toBeGreaterThanOrEqual(1);
        for (const row of GR_SOURCES) {
            expect(row.country).toBe('GR');
            expect(row.probes.length).toBeGreaterThan(0); // no unprobed rows
        }
        for (const b of GR_ADAPTER_ENDPOINT_BINDINGS) {
            expect(GR_SOURCES.some((s) => s.id === b.sourceId)).toBe(true);
            expect(b.endpoint.startsWith(GR_PARCEL_SERVICE)).toBe(true);
        }
    });
});
