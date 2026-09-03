// LANE HU — the Hungary country-adapter suite. NETWORK: none. Every assertion runs the pure parser
// / the resolver over RECORDED-LIVE fixtures whose bytes were captured from the real Lechner INSPIRE
// CP WFS on 2026-09-03 (transcript audit/europe-adapters-2/2026-09-02/lane-hu-transcripts/), so the
// test is deterministic in CI while pinning the real upstream shape — and the fixtures are the ONLY
// honest evidence for a sample-only / fee-gated country.
//
// THE LOAD-BEARING PROPERTY (the whole reason the lane exists): a click at the CAPITAL returns the
// self-announcing DECLARED DEFERRAL (transient, HU_INSPIRE_CP_DEFERRED_TOKEN), NEVER an `absent`.
// "The free sample does not reach Budapest" is not "there is no parcel in Budapest" — that parcel
// lives in the fee-gated national cadastre (§CONTEXT-DATA-HONESTY at national scale).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    isTransientOutcome,
    isTransientFetchReason,
    type FetchOutcome,
} from '@pryzm/schemas';
import {
    HUNGARY_BBOX,
    isInHungary,
    HU_INSPIRE_CP_OWS,
    HU_CP_LAYER,
    HU_NATIVE_CRS,
    HU_PARCEL_PROVIDER_ID,
    HU_INSPIRE_CP_DEFERRED_TOKEN,
    HU_INSPIRE_CP_SAMPLE_COVERAGE,
    HU_CADASTRE_DEFERRAL,
    assertHuCadastreDeferralNotExpired,
    huInspireCpCoversPoint,
    parseHuParcelFeature,
    resolveHuParcelAtWgs84Point,
    HU_ADAPTER_SOURCES,
    HU_INSPIRE_CP_SOURCE_ID,
    HU_NATIONAL_CADASTRE_SOURCE_ID,
    huCountryAdapter,
    type HuWfsFeature,
} from '../src/countryAdapters/hu/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX_DIR = resolve(HERE, 'fixtures/hu-lechner-inspire-cp-2026-09-03');

const SAMPLE_COLLECTION = JSON.parse(
    readFileSync(resolve(FIX_DIR, 'mesterszallas-parcels-native23700.json'), 'utf-8'),
) as { readonly features: readonly HuWfsFeature[]; readonly crs?: unknown };
const BUDAPEST_EMPTY = readFileSync(resolve(FIX_DIR, 'budapest-capital-empty.json'), 'utf-8');

/** A fake `fetch` that returns a fixed body string for the WFS OWS endpoint, else throws. */
function makeFetch(body: string, ok = true, status = 200): typeof fetch {
    return (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (!url.startsWith(HU_INSPIRE_CP_OWS)) {
            throw new Error(`FAKE FETCH: unrouted ${url}`);
        }
        return { ok, status, text: async () => body } as unknown as Response;
    }) as unknown as typeof fetch;
}
/** A fake `fetch` that throws — the endpoint did not answer (transport failure). */
const BOOM: typeof fetch = (async () => {
    throw new Error('ECONNRESET (simulated)');
}) as unknown as typeof fetch;

// Points.
const BUDAPEST = { lat: 47.4979, lon: 19.0402 }; // the capital — OUTSIDE the sample
const MESTERSZALLAS = { lat: 46.95, lon: 20.45 }; // INSIDE the measured sample coverage

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE FIXTURE IS RECORDED-LIVE, NOT SYNTHETIC (a proof older than its subject proves nothing).
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('HU fixtures are the real Lechner bytes', () => {
    it('the sample collection is native EOV (EPSG:23700) and every feature is Mesterszállás', () => {
        expect((SAMPLE_COLLECTION.crs as { properties?: { name?: string } })?.properties?.name).toBe(
            'urn:ogc:def:crs:EPSG::23700',
        );
        expect(SAMPLE_COLLECTION.features.length).toBeGreaterThan(0);
        for (const f of SAMPLE_COLLECTION.features) {
            expect(f.properties['administrativeunit']).toBe('Mesterszállás');
        }
    });

    it('the Budapest capital fixture is an EMPTY FeatureCollection (numberMatched=0)', () => {
        const parsed = JSON.parse(BUDAPEST_EMPTY) as {
            features: unknown[];
            numberMatched: number;
        };
        expect(parsed.features).toHaveLength(0);
        expect(parsed.numberMatched).toBe(0);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. PURE PARSER — native-CRS ring, helyrajzi szám, area; nothing invented.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('parseHuParcelFeature (pure)', () => {
    it('maps a real Mesterszállás feature into a native-EOV parcel', () => {
        const parcel = parseHuParcelFeature(SAMPLE_COLLECTION.features[0]!);
        expect(parcel).not.toBeNull();
        expect(parcel!.crs).toBe(HU_NATIVE_CRS);
        expect(parcel!.source).toBe(HU_PARCEL_PROVIDER_ID);
        expect(parcel!.nationalCadastralReference.length).toBeGreaterThan(0);
        expect(parcel!.administrativeUnit).toBe('Mesterszállás');
        expect(parcel!.areaM2).toBeGreaterThan(0);
        expect(parcel!.ring.length).toBeGreaterThanOrEqual(3);
        // EOV eastings are ~750k, northings ~180k — NOT degrees. Proves we kept native CRS.
        expect(parcel!.ring[0]![0]).toBeGreaterThan(400000);
    });

    it('returns null for a feature with no reference or no ring', () => {
        expect(parseHuParcelFeature({ properties: {} })).toBeNull();
        expect(
            parseHuParcelFeature({
                properties: { label: '1' },
                geometry: { type: 'Polygon', coordinates: [[[1, 1]]] },
            }),
        ).toBeNull();
    });

    it('treats the served string "NULL" as absence, never as a value', () => {
        const parcel = parseHuParcelFeature({
            properties: {
                nationalcadastralreference: '015',
                zoning: 'NULL',
                validto: 'NULL',
            },
            geometry: {
                type: 'Polygon',
                coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
            },
        });
        expect(parcel!.landUse.zoning).toBeNull();
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE CAPITAL CLICK — the deliverable. Budapest → DECLARED DEFERRAL, never `absent`.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('resolveHuParcelAtWgs84Point — the capital is a DECLARED DEFERRAL', () => {
    it('Budapest (capital) → transient, self-announcing, NOT absent and NOT a fabricated parcel', async () => {
        const out = await resolveHuParcelAtWgs84Point(BUDAPEST.lat, BUDAPEST.lon, {
            fetchImpl: makeFetch(BUDAPEST_EMPTY),
        });
        expect(out.status).toBe('transient');
        expect(isTransientOutcome(out)).toBe(true);
        if (out.status !== 'transient') return;
        // C74 §3.2 — the refusal names itself.
        expect(out.reason).toContain(HU_INSPIRE_CP_DEFERRED_TOKEN);
        // §CONTEXT-DATA-HONESTY — the reason classifies as TRANSIENT, not a genuine absence.
        expect(isTransientFetchReason(out.reason.split(':')[0]!)).toBe(true);
        // It names the fee-gate so a caller knows WHY.
        expect(out.reason.toLowerCase()).toContain('fee-gated');
    });

    it('a served parcel inside the Mesterszállás sample → found (a REAL helyrajzi szám)', async () => {
        const out = await resolveHuParcelAtWgs84Point(MESTERSZALLAS.lat, MESTERSZALLAS.lon, {
            fetchImpl: makeFetch(readFileSync(resolve(FIX_DIR, 'mesterszallas-parcels-native23700.json'), 'utf-8')),
        });
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        expect(out.value.crs).toBe(HU_NATIVE_CRS);
        expect(out.value.nationalCadastralReference.length).toBeGreaterThan(0);
        expect(out.value.administrativeUnit).toBe('Mesterszállás');
    });

    it('an empty answer INSIDE the covered sample is a genuine gap → absent (NOT the deferral)', async () => {
        const out = await resolveHuParcelAtWgs84Point(MESTERSZALLAS.lat, MESTERSZALLAS.lon, {
            fetchImpl: makeFetch(BUDAPEST_EMPTY), // the empty body, but the point IS in-coverage
        });
        expect(out.status).toBe('absent');
        if (out.status !== 'absent') return;
        expect(out.reason).toContain('no-feature');
        expect(out.reason).not.toContain(HU_INSPIRE_CP_DEFERRED_TOKEN);
    });

    it('a transport failure passes the transient THROUGH (endpoint-unreachable)', async () => {
        const out = await resolveHuParcelAtWgs84Point(BUDAPEST.lat, BUDAPEST.lon, { fetchImpl: BOOM });
        expect(out.status).toBe('transient');
        if (out.status !== 'transient') return;
        expect(out.reason.startsWith('endpoint-unreachable')).toBe(true);
    });

    it('a non-finite point → absent no-point, never a throw', async () => {
        const out = await resolveHuParcelAtWgs84Point(Number.NaN, 19, { fetchImpl: BOOM });
        expect(out.status).toBe('absent');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. COVERAGE & PREFILTER — the sample bbox is measured; the prefilter is not a routing authority.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('coverage + prefilter geometry', () => {
    it('huInspireCpCoversPoint: Mesterszállás in, Budapest out', () => {
        expect(huInspireCpCoversPoint(MESTERSZALLAS.lat, MESTERSZALLAS.lon)).toBe(true);
        expect(huInspireCpCoversPoint(BUDAPEST.lat, BUDAPEST.lon)).toBe(false);
        // the measured extent, not a guess
        expect(HU_INSPIRE_CP_SAMPLE_COVERAGE.minLon).toBeCloseTo(20.3997, 3);
        expect(HU_INSPIRE_CP_SAMPLE_COVERAGE.maxLat).toBeCloseTo(46.9844, 3);
    });

    it('isInHungary is an over-inclusive PREFILTER (Budapest in; far points out)', () => {
        expect(isInHungary(BUDAPEST.lat, BUDAPEST.lon)).toBe(true);
        expect(isInHungary(40.4168, -3.7038)).toBe(false); // Madrid
        expect(isInHungary(Number.NaN, 19)).toBe(false);
        // The box brackets the country; exactness is the resolver's job, not this rectangle's.
        expect(HUNGARY_BBOX.minLat).toBeLessThan(HUNGARY_BBOX.maxLat);
        expect(HUNGARY_BBOX.minLon).toBeLessThan(HUNGARY_BBOX.maxLon);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE DEFERRAL SCAFFOLD — owner/date/gate + a reviewBy that turns into a throw (C74 §3.4).
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('HU_CADASTRE_DEFERRAL scaffold', () => {
    it('carries an owner, a declaredOn, a retiredBy and a future reviewBy', () => {
        expect(HU_CADASTRE_DEFERRAL.owner).toContain('lane HU');
        expect(HU_CADASTRE_DEFERRAL.declaredOn).toBe('2026-09-03');
        expect(HU_CADASTRE_DEFERRAL.retiredBy.length).toBeGreaterThan(20);
        expect(HU_CADASTRE_DEFERRAL.reviewBy > HU_CADASTRE_DEFERRAL.declaredOn).toBe(true);
    });

    it('does not throw before reviewBy, throws by name after it', () => {
        expect(() => assertHuCadastreDeferralNotExpired('2026-09-03')).not.toThrow();
        expect(() => assertHuCadastreDeferralNotExpired('2099-01-01')).toThrow(/reviewBy/);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. SOURCE ROWS — validated by defineSources at import; the keyless/paid split is asserted.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('HU_ADAPTER_SOURCES', () => {
    it('holds exactly the two rows, both country HU, each with a dated probe', () => {
        expect(HU_ADAPTER_SOURCES).toHaveLength(2);
        for (const row of HU_ADAPTER_SOURCES) {
            expect(row.country).toBe('HU');
            expect(row.probes.length).toBeGreaterThan(0);
        }
    });

    it('the INSPIRE CP WFS row is KEYLESS (gate null), WFS2, live-sample', () => {
        const row = HU_ADAPTER_SOURCES.find((s) => s.id === HU_INSPIRE_CP_SOURCE_ID)!;
        expect(row.gate).toBeNull();
        expect(row.protocol).toBe('WFS2');
        expect(row.endpoint).toBe(HU_INSPIRE_CP_OWS);
        expect(row.coverage).toContain('Mesterszállás');
    });

    it('the national cadastre row is the PAID, deferred-stub retirement target', () => {
        const row = HU_ADAPTER_SOURCES.find((s) => s.id === HU_NATIONAL_CADASTRE_SOURCE_ID)!;
        expect(row.gate).toContain('paid');
        expect(row.adapterStatus).toBe('deferred-stub');
        expect(row.licence.colour).toBe('RED');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 7. §J ADAPTER VALUE — the honest no-rule-pack path.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('huCountryAdapter (§J shape)', () => {
    it('country HU, sources present, rules explicitly unavailable (no fabricated ladder)', () => {
        expect(huCountryAdapter.country).toBe('HU');
        expect(huCountryAdapter.sources()).toHaveLength(2);
        expect(huCountryAdapter.rules.kind).toBe('unavailable');
        expect(huCountryAdapter.rules.reason.toUpperCase()).toContain('OTÉK');
    });

    it('exposes the WFS layer constant it was probed against', () => {
        expect(HU_CP_LAYER).toBe('CP:CP.CadastralParcels');
    });
});

// A type-level anchor so a signature drift is a compile error, not a silent runtime surprise.
const _typecheck: (
    lat: number,
    lon: number,
) => Promise<FetchOutcome<{ readonly nationalCadastralReference: string }>> =
    resolveHuParcelAtWgs84Point;
void _typecheck;
