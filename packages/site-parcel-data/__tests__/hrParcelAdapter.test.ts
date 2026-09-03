// LANE HR — THE CROATIA PARCEL ADAPTER, proven at the RESOLVER layer (committed ≠ reachable: these
// run the real `resolveHrParcelAtWgs84Point` against the RECORDED-LIVE Zagreb body, not a pure
// parser return). Fixture: __tests__/fixtures/hr-zagreb/recorded-live-2026-09-03.json — the
// byte-exact GetFeature response probed 2026-09-03 (Ban Jelačić; transcripts PROBES.md), replayed
// via `HrWfsDeps.fetchImpl`.
//
// THE FALSIFICATION TARGETS (each named at its test):
//   • axis order — the click bbox is lat,lon urn:4326 (the MEASURED working order); flipping it to
//     lon,lat is caught by the URL test below.
//   • empty ≠ failure — an ORA-01000 HTTP 400 is `transient` (naming the server text), a 200 empty
//     FeatureCollection is `absent`; collapsing either is caught.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FetchOutcome } from '@pryzm/schemas';
import {
    CROATIA_BBOX,
    HR_PARCEL_PROVIDER_ID,
    HR_SOURCES,
    buildHrWgs84BboxUrl,
    extractOwsExceptionText,
    hrCountryAdapter,
    isInCroatia,
    parseHrParcelFeature,
    resolveHrParcelAtWgs84Point,
    type HrCadastralParcel,
    type HrWfsDeps,
    type HrWfsFeature,
} from '../src/countryAdapters/hr/index.js';

const ZAGREB_FIXTURE = JSON.parse(
    readFileSync(new URL('./fixtures/hr-zagreb/recorded-live-2026-09-03.json', import.meta.url), 'utf8'),
) as { features: HrWfsFeature[] };

/** Route a decoded-URL substring → canned body; unrouted URLs fail the test BY NAME. */
function makeFetch(body: unknown, opts: { ok?: boolean; status?: number } = {}): HrWfsDeps {
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

// ── 1. THE RECORDED-LIVE CLICK — a real Zagreb parcel through the real resolver ─────────────────
describe('HR — the recorded-live Zagreb click resolves a real cadastral parcel', () => {
    it('resolveHrParcelAtWgs84Point returns k.č. 2379, k.o. 335240 (CENTAR), native EPSG:3765 ring', async () => {
        const outcome = await resolveHrParcelAtWgs84Point(45.8132, 15.9771, makeFetch(ZAGREB_FIXTURE));
        const parcel: HrCadastralParcel = foundValue(outcome);
        expect(parcel.brojCestice).toBe('2379');
        expect(parcel.koMaticniBroj).toBe(335240);
        expect(parcel.objectId).toBe(21609461);
        expect(parcel.cadastralReference).toBe('k.č. 2379, k.o. 335240');
        expect(parcel.crs).toBe('EPSG:3765');
        expect(parcel.source).toBe(HR_PARCEL_PROVIDER_ID);
        // Native ring, [E,N] in 3765 — the first served vertex, verbatim (never reprojected here).
        expect(parcel.ring.length).toBeGreaterThanOrEqual(3);
        expect(parcel.ring[0]).toEqual([459411.84, 5074884.16]);
    });

    it('the pure parser drops a feature with no BROJ_CESTICE or a degenerate ring', () => {
        expect(
            parseHrParcelFeature({ properties: { MATICNI_BROJ_KO: 335240 }, geometry: null }),
        ).toBeNull();
        expect(
            parseHrParcelFeature({
                properties: { BROJ_CESTICE: '2379' },
                geometry: { type: 'Polygon', coordinates: [[[1, 2], [3, 4]]] }, // 2 verts < 3
            }),
        ).toBeNull();
    });
});

// ── 2. FetchOutcome — empty ≠ failure (§CONTEXT-DATA-HONESTY) ────────────────────────────────────
describe('HR — a failed source and an empty answer are DIFFERENT outcomes', () => {
    it('an ORA-01000 HTTP 400 ExceptionReport is TRANSIENT and carries the server text (never absent)', async () => {
        const oraBody =
            '<?xml version="1.0"?><ows:ExceptionReport xmlns:ows="http://www.opengis.net/ows/1.1">' +
            '<ows:Exception exceptionCode="NoApplicableCode"><ows:ExceptionText>' +
            'java.io.IOExceptionORA-01000: maximum open cursors exceeded' +
            '</ows:ExceptionText></ows:Exception></ows:ExceptionReport>';
        const outcome = await resolveHrParcelAtWgs84Point(
            45.8132,
            15.9771,
            makeFetch(oraBody, { ok: false, status: 400 }),
        );
        expect(outcome.status).toBe('transient');
        if (outcome.status === 'transient') {
            expect(outcome.reason).toMatch(/^upstream-failed:/);
            expect(outcome.reason).toMatch(/ORA-01000/);
        }
    });

    it('a 200 empty FeatureCollection is ABSENT (durable "no parcel here"), never transient', async () => {
        const outcome = await resolveHrParcelAtWgs84Point(
            43.5081, // open Adriatic — no parcel
            16.4402,
            makeFetch({ type: 'FeatureCollection', features: [] }),
        );
        expect(outcome.status).toBe('absent');
        if (outcome.status === 'absent') expect(outcome.reason).toMatch(/^no-feature:/);
    });

    it('a network throw is TRANSIENT naming the endpoint', async () => {
        const deps: HrWfsDeps = {
            fetchImpl: (async () => {
                throw new Error('ECONNRESET');
            }) as typeof fetch,
        };
        const outcome = await resolveHrParcelAtWgs84Point(45.8132, 15.9771, deps);
        expect(outcome.status).toBe('transient');
        if (outcome.status === 'transient') expect(outcome.reason).toMatch(/^endpoint-unreachable:/);
    });

    it('extractOwsExceptionText pulls the ORA-01000 text out of a GeoServer ExceptionReport', () => {
        const t = extractOwsExceptionText(
            '<ows:ExceptionReport><ows:ExceptionText>ORA-01000: maximum open cursors exceeded</ows:ExceptionText></ows:ExceptionReport>',
        );
        expect(t).toMatch(/ORA-01000/);
        expect(extractOwsExceptionText('{"type":"FeatureCollection"}')).toBeNull();
    });
});

// ── 3. THE CLICK URL — measured axis order + native output ───────────────────────────────────────
describe('HR — the click bbox URL is the MEASURED working shape', () => {
    it('emits a lat,lon urn:4326 bbox and NO srsName (server reprojects the filter; native geometry out)', () => {
        const url = buildHrWgs84BboxUrl('cp_wms:CP.CadastralParcel', 45.813, 15.977, 45.814, 15.978, 1);
        const decoded = decodeURIComponent(url);
        // lat,lon order — the FALSIFICATION TARGET (flipping to lon,lat breaks the real service).
        expect(decoded).toContain('bbox=45.813,15.977,45.814,15.978,urn:ogc:def:crs:EPSG::4326');
        expect(decoded).toContain('outputFormat=application/json');
        expect(decoded).not.toContain('srsName'); // native EPSG:3765 output is deliberate
        expect(decoded).toContain('typeNames=cp_wms:CP.CadastralParcel');
    });
});

// ── 4. THE JURISDICTION PRE-FILTER — a box, never a routing authority ────────────────────────────
describe('HR — isInCroatia is a coarse pre-filter, not a border', () => {
    it('claims Zagreb and rejects a non-finite / out-of-box point', () => {
        expect(isInCroatia(45.8132, 15.9771)).toBe(true); // Zagreb
        expect(isInCroatia(42.6507, 18.0944)).toBe(true); // Dubrovnik
        expect(isInCroatia(Number.NaN, 15)).toBe(false);
        expect(isInCroatia(48.2, 16.37)).toBe(false); // Vienna — north of the box
    });

    it('the box DELIBERATELY overlaps neighbours — proof it must not be the routing authority', () => {
        // Ljubljana (SI) and Mostar (BA) both fall inside CROATIA_BBOX — exactly why the registry
        // routes on claimsNation('HR'), never on this rectangle (L-12871).
        expect(isInCroatia(46.0569, 14.5058)).toBe(true); // Ljubljana, Slovenia
        expect(isInCroatia(43.3438, 17.8078)).toBe(true); // Mostar, Bosnia & Herzegovina
        expect(CROATIA_BBOX.minLat).toBeLessThan(CROATIA_BBOX.maxLat);
        expect(CROATIA_BBOX.minLon).toBeLessThan(CROATIA_BBOX.maxLon);
    });
});

// ── 5. THE §J ADAPTER SHAPE + the honest no-rule-pack path ───────────────────────────────────────
describe('HR — the §J adapter shape', () => {
    it('exposes country HR, the four typed sources, a parcel provider, and rules.kind === "none"', () => {
        expect(hrCountryAdapter.country).toBe('HR');
        expect(hrCountryAdapter.sources()).toBe(HR_SOURCES);
        expect(HR_SOURCES.length).toBe(4);
        expect(HR_SOURCES.every((s) => s.country === 'HR')).toBe(true);
        // The honest no-rule-pack path — NOT a stub pretending structure exists.
        expect(hrCountryAdapter.rules.kind).toBe('none');
        expect(hrCountryAdapter.rules.reason).toMatch(/no machine-readable rule pack/i);
        expect(typeof hrCountryAdapter.parcel.resolveAtWgs84Point).toBe('function');
    });

    it('the parcel source row is the live keyless cp_wms channel; the INSPIRE cp: row is blocked', () => {
        const live = HR_SOURCES.find((s) => s.id === 'hr-dgu-dkp-cp-wfs')!;
        expect(live.adapterStatus).toBe('live');
        expect(live.endpoint).toContain('cp_wms/wfs');
        const complex = HR_SOURCES.find((s) => s.id === 'hr-dgu-dkp-inspire-cp-wfs')!;
        expect(complex.adapterStatus).toBe('blocked'); // ORA-01000 degraded
    });
});
