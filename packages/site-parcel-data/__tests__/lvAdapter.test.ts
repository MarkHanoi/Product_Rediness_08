// LANE LV — the Latvia adapter suite. Fixtures are RECORDED LIVE 2026-09-03 bodies from the
// geolatvija VRAA GeoServer (see fixtures/lv-riga-pilsiela/*.json — the __label__ names the
// service and the re-record path), replayed via `LvWfsDeps.fetchImpl` so the suite runs offline.
// The LIVE click proof (Rīga → cadastral code 01000070006) is these very bytes.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    LATVIA_BBOX,
    LV_CADASTRE_SOURCE_ID,
    LV_JURISDICTION_DEFERRAL,
    LV_PARCEL_PROVIDER_ID,
    LV_TAPIS_ZONING_SOURCE_ID,
    buildLvCqlUrl,
    claimsLatvia,
    isInLatvia,
    lvCountryAdapter,
    lvWfsGetFeatures,
    parseLvParcelFeature,
    resolveLvParcelAtWgs84Point,
    resolveLvParcelByCode,
    type LvWfsDeps,
    type LvWfsFeature,
} from '../src/countryAdapters/lv/index.js';

const FX = JSON.parse(
    readFileSync(
        new URL('./fixtures/lv-riga-pilsiela/recorded-live-2026-09-03.json', import.meta.url),
        'utf8',
    ),
) as Record<string, unknown> & {
    __label__: string;
    parcelByCode: unknown;
    parcelsAtPoint: unknown;
    seaEmpty: unknown;
    wrongLayerBody: string;
};

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

/** Route a decoded-URL substring → [status, body]; unrouted URLs fail the test BY NAME. */
function makeFetch(routes: ReadonlyArray<readonly [string, number, unknown]>): LvWfsDeps {
    const fetchImpl = (async (input: string | URL | Request) => {
        const url = decodeURIComponent(String(input));
        for (const [needle, status, body] of routes) {
            if (url.includes(needle)) {
                return {
                    ok: (status as number) >= 200 && (status as number) < 300,
                    status,
                    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
                } as unknown as Response;
            }
        }
        throw new Error(`lvAdapter.test: unrouted URL in fixture replay — ${url.slice(0, 180)}`);
    }) as typeof fetch;
    return { fetchImpl };
}

describe('LV parcel provider — the live click path (recorded)', () => {
    it('by cadastral code → found, with the measured identity + WGS84 ring', async () => {
        const deps = makeFetch([['cql_filter', 200, FX.parcelByCode]]);
        const out = await resolveLvParcelByCode('01000070006', deps);
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        const p = out.value;
        expect(p.cadastralCode).toBe('01000070006');
        expect(p.address).toContain('Pils iela 23');
        expect(p.areaM2).toBe(1435);
        expect(p.crs).toBe('EPSG:4326');
        expect(p.source).toBe(LV_PARCEL_PROVIDER_ID);
        expect(p.ownershipForm).toBeTruthy();
        expect(p.ownedByMunicipality).toBe(false);
        expect(p.ring.length).toBeGreaterThanOrEqual(3);
        // WGS84 [lon,lat]: Rīga sits near lon 24.1, lat 56.9 — never swapped.
        const [lon, lat] = p.ring[0]!;
        expect(lon).toBeGreaterThan(23.9);
        expect(lon).toBeLessThan(24.3);
        expect(lat).toBeGreaterThan(56.8);
        expect(lat).toBeLessThan(57.1);
    });

    it('at a WGS84 point (the map click) → found, a real land-unit code', async () => {
        const deps = makeFetch([['bbox', 200, FX.parcelsAtPoint]]);
        const out = await resolveLvParcelAtWgs84Point(56.9497, 24.1038, deps);
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        expect(out.value.cadastralCode).toMatch(/^\d{11}$/);
        expect(out.value.crs).toBe('EPSG:4326');
    });

    it('EMPTY vs FAILURE stay different values — a water point is ABSENT, not transient', async () => {
        const deps = makeFetch([['bbox', 200, FX.seaEmpty]]);
        const out = await resolveLvParcelAtWgs84Point(57.9, 24.0, deps);
        expect(out.status).toBe('absent');
        if (out.status === 'absent') expect(out.reason).toContain('no-feature');
    });

    it('a wrong layer is a TRANSIENT refusal that carries the server text — never "nothing here"', async () => {
        const deps = makeFetch([['parcel_WRONG', 400, FX.wrongLayerBody]]);
        const out = await lvWfsGetFeatures(
            buildLvCqlUrl('vraa:parcel_WRONG', "code='01000070006'", 1),
            'wrong-layer control',
            deps,
        );
        expect(out.status).toBe('transient');
        if (out.status === 'transient') {
            expect(out.reason).toContain('upstream-failed');
            expect(out.reason).toContain('HTTP 400');
        }
    });

    it('an empty feature collection by-code is a durable ABSENT (no such code), not a failure', async () => {
        const deps = makeFetch([['cql_filter', 200, EMPTY_FC]]);
        const out = await resolveLvParcelByCode('99999999999', deps);
        expect(out.status).toBe('absent');
    });

    it('a network throw is a TRANSIENT (endpoint-unreachable), never absent', async () => {
        const deps: LvWfsDeps = {
            fetchImpl: (async () => {
                throw new Error('ECONNRESET');
            }) as typeof fetch,
        };
        const out = await resolveLvParcelByCode('01000070006', deps);
        expect(out.status).toBe('transient');
        if (out.status === 'transient') expect(out.reason).toContain('endpoint-unreachable');
    });
});

describe('LV parcel parser — pure, total, never invents', () => {
    it('a feature with no code → null (identity is mandatory)', () => {
        const f = { properties: {}, geometry: { type: 'Polygon', coordinates: [[[1, 2], [3, 4], [5, 6], [1, 2]]] } };
        expect(parseLvParcelFeature(f as unknown as LvWfsFeature)).toBeNull();
    });
    it('a degenerate ring (<3 pts) → null (never a fabricated polygon)', () => {
        const f = { properties: { code: '0100' }, geometry: { type: 'Polygon', coordinates: [[[1, 2], [3, 4]]] } };
        expect(parseLvParcelFeature(f as unknown as LvWfsFeature)).toBeNull();
    });
});

describe('LV §J adapter shape — parcel LIVE, rules honestly DEFERRED', () => {
    it('country LV; parcel leg exposes byNationalId + atPoint', () => {
        expect(lvCountryAdapter.country).toBe('LV');
        expect(typeof lvCountryAdapter.parcel.byNationalId).toBe('function');
        expect(typeof lvCountryAdapter.parcel.atPoint).toBe('function');
    });
    it('rules.kind is "deferred" with a reason that names WHERE the numbers live (no fabricated chain)', () => {
        expect(lvCountryAdapter.rules.kind).toBe('deferred');
        expect(lvCountryAdapter.rules.reason).toMatch(/TIAN|likumi|F-extraction/);
        // The brief's zero-fill warning is honoured — nothing advertises PILN/ATN_DOK as filled.
        expect(lvCountryAdapter.rules.reason).toMatch(/PILN|ATN_DOK|zero|unpopulated/i);
    });
    it('sources() carries the LIVE cadastre and the DOCUMENTED (not-served-as-rules) TAPIS substrate', () => {
        const srcs = lvCountryAdapter.sources();
        const cad = srcs.find((s) => s.id === LV_CADASTRE_SOURCE_ID);
        const tapis = srcs.find((s) => s.id === LV_TAPIS_ZONING_SOURCE_ID);
        expect(cad?.theme).toBe('cadastre');
        expect(cad?.adapterStatus).toBe('live');
        expect(cad?.gate).toBeNull();
        expect(cad?.licence.colour).toBe('GREEN');
        expect(tapis?.theme).toBe('planning');
        expect(tapis?.adapterStatus).toBe('documented');
    });
});

describe('LV routing — DORMANT on GATE 2 (the ONLY gate), never a rectangle router', () => {
    const RIGA: readonly [number, number] = [56.9496, 24.1052];

    it('LATVIA_BBOX contains Rīga (the specificity pre-filter), but a rectangle is not a claim', () => {
        expect(isInLatvia(RIGA[0], RIGA[1])).toBe(true);
        expect(isInLatvia(48.8566, 2.3522)).toBe(false); // Paris
    });

    it('claimsLatvia is FALSE at Rīga today — LVA is a refusal-only neighbour (GATE 2)', () => {
        // This is the honest dormant state: the national resolver refuses at every Latvian point
        // because LVA is modelled as a neighbour, not a country. Flips true only when a boundary
        // wave promotes it — with no change to this adapter.
        expect(claimsLatvia(RIGA[0], RIGA[1])).toBe(false);
        expect(claimsLatvia(55.8714, 26.5161)).toBe(false); // Daugavpils
    });

    it('claimsLatvia is total — junk input never throws', () => {
        expect(claimsLatvia(Number.NaN, 0)).toBe(false);
        expect(claimsLatvia(0, Number.POSITIVE_INFINITY)).toBe(false);
    });

    it('the deferral names the single gate and records that the SERVICE is open', () => {
        expect(LV_JURISDICTION_DEFERRAL.gate).toContain('GATE 2');
        expect(LV_JURISDICTION_DEFERRAL.reviewBy).toBe('2026-12-01');
        expect(LV_JURISDICTION_DEFERRAL.serviceGate).toContain('NONE');
    });
});
