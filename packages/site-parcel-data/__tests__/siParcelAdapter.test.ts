// LANE SI — SLOVENIA parcel adapter, proven at the layers the user experiences (committed ≠
// reachable): the pure parser, the FetchOutcome-classified provider replayed from a RECORDED-LIVE
// body, the failure/absent honesty split, the registry DORMANT-BUT-SAFE guarantee, and — the load
// bearing one — the QUEUED resolver/boundary promotion driven through the REAL resolver with a
// FALSIFICATION CONTROL that shows why Croatia+Hungary must land with Slovenia.
//
// Fixtures are RECORDED LIVE 2026-09-03 bodies (fixtures/si-ljubljana/*.json — the __label__ names
// the requests + the re-record path), replayed via `SiWfsDeps.fetchImpl`.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    parseSiParcelFeature,
    resolveSiParcelAtWgs84Point,
    resolveSiParcelByEid,
    siCountryAdapter,
    isInSlovenia,
    SLOVENIA_BBOX,
    SLOVENIA_BBOX_OVERLAP_AUDIT,
    extractSiOwsExceptionText,
    type SiParcel,
    type SiWfsDeps,
    type SiWfsFeature,
} from '../src/countryAdapters/si/index.js';
import {
    resolveNationalJurisdiction,
    NATIONAL_BOUNDARY_SET,
    type NationalBoundarySet,
} from '../src/jurisdiction/nationalJurisdictionResolver.js';
import { isInItaly } from '../src/parcelProviders/agenziaEntrateParcelProvider.js';
import {
    listParcelJurisdictions,
    resolveParcelCandidates,
} from '../src/parcelProviders/registry.js';
import { isTransientFetchReason, type FetchOutcome } from '@pryzm/schemas';

const FIX = JSON.parse(
    readFileSync(new URL('./fixtures/si-ljubljana/recorded-live-2026-09-03.json', import.meta.url), 'utf8'),
) as {
    parcelLjubljana: { features: SiWfsFeature[] };
    parcelByEid: { features: SiWfsFeature[] };
    wrongLayerExceptionBody: string;
};
const QUEUED = JSON.parse(
    readFileSync(new URL('./fixtures/si-ljubljana/queued-resolver-additions.json', import.meta.url), 'utf8'),
) as { neighbours: { HRV: unknown; HUN: unknown } };

const LJUBLJANA = { lat: 46.0569, lon: 14.5058 };

/** A canned fetch: OK 200 with the given JSON body (the found/absent path). */
function okJson(body: unknown): SiWfsDeps {
    return {
        fetchImpl: (async () =>
            ({ ok: true, status: 200, text: async () => JSON.stringify(body) }) as unknown as Response) as typeof fetch,
    };
}

function found<T>(o: FetchOutcome<T>): T {
    expect(o.status).toBe('found');
    if (o.status !== 'found') throw new Error('unreachable');
    return o.value;
}

describe('SI parser — the recorded-live Ljubljana parcel maps to a SiParcel with the real identifier', () => {
    it('parses KO_ID + ST_PARCELE into the canonical cadastral reference, native 3794 ring', () => {
        const feature = FIX.parcelLjubljana.features[0]!;
        const p = parseSiParcelFeature(feature) as SiParcel;
        expect(p).not.toBeNull();
        expect(p.parcelRef).toBe('1725 2468/4'); // KO_ID + ST_PARCELE — the real capital parcel
        expect(p.eid).toBe('100100001379837235');
        expect(p.koId).toBe(1725);
        expect(p.stParcele).toBe('2468/4');
        expect(p.naziv).toBe('1725 AJDOVŠČINA');
        expect(p.areaM2).toBe(1896);
        expect(p.crs).toBe('EPSG:3794'); // native-CRS-on-the-object; NEVER reprojected in-package
        expect(p.ring.length).toBeGreaterThanOrEqual(3);
        // native D96/TM easting/northing, not degrees (the axis honesty: no silent lon/lat)
        expect(p.ring[0]![0]).toBeGreaterThan(400_000);
        expect(p.source).toBe('si-gurs-kn-parcele');
    });

    it('refuses a feature with no identity or no ring (returns null, never a half-parcel)', () => {
        expect(parseSiParcelFeature({ properties: {}, geometry: null })).toBeNull();
        expect(
            parseSiParcelFeature({ properties: { EID_PARCELA: 'x' }, geometry: { type: 'Point', coordinates: [1, 2] } }),
        ).toBeNull();
    });
});

describe('SI provider — FetchOutcome end-to-end (empty ≠ failure)', () => {
    it('resolveSiParcelAtWgs84Point → found, the capital parcel', async () => {
        const o = await resolveSiParcelAtWgs84Point(LJUBLJANA.lat, LJUBLJANA.lon, okJson(FIX.parcelLjubljana));
        const p = found(o);
        expect(p.parcelRef).toBe('1725 2468/4');
        expect(p.areaM2).toBe(1896);
    });

    it('resolveSiParcelByEid → found, the same parcel by its stable machine id', async () => {
        const o = await resolveSiParcelByEid('100100001379837235', okJson(FIX.parcelByEid));
        expect(found(o).eid).toBe('100100001379837235');
    });

    it('a wrong-layer HTTP 400 ExceptionReport → transient carrying the server\'s own text (never absent)', async () => {
        const deps: SiWfsDeps = {
            fetchImpl: (async () =>
                ({ ok: false, status: 400, text: async () => FIX.wrongLayerExceptionBody }) as unknown as Response) as typeof fetch,
        };
        const o = await resolveSiParcelAtWgs84Point(LJUBLJANA.lat, LJUBLJANA.lon, deps);
        expect(o.status).toBe('transient');
        if (o.status !== 'transient') throw new Error('unreachable');
        expect(o.reason.startsWith('upstream-failed')).toBe(true);
        expect(isTransientFetchReason(o.reason.split(':')[0]!)).toBe(true); // token ∈ TRANSIENT table
        expect(o.reason).toContain('PARCELE_WRONGNAME'); // refuses BY NAME
    });

    it('a 200 empty FeatureCollection → absent (durable nothing-here), NOT transient', async () => {
        const o = await resolveSiParcelAtWgs84Point(47.5, 19.0, okJson({ type: 'FeatureCollection', features: [] }));
        expect(o.status).toBe('absent');
        if (o.status !== 'absent') throw new Error('unreachable');
        expect(o.reason.startsWith('no-feature')).toBe(true);
        expect(isTransientFetchReason(o.reason.split(':')[0]!)).toBe(false); // NOT a transient token
    });

    it('a network throw → transient endpoint-unreachable (the source did not answer)', async () => {
        const deps: SiWfsDeps = {
            fetchImpl: (async () => {
                throw new Error('ECONNRESET');
            }) as typeof fetch,
        };
        const o = await resolveSiParcelAtWgs84Point(LJUBLJANA.lat, LJUBLJANA.lon, deps);
        expect(o.status).toBe('transient');
        if (o.status !== 'transient') throw new Error('unreachable');
        expect(o.reason.startsWith('endpoint-unreachable')).toBe(true);
        expect(isTransientFetchReason(o.reason.split(':')[0]!)).toBe(true);
    });

    it('extractSiOwsExceptionText pulls the layer name out of the recorded exception body', () => {
        expect(extractSiOwsExceptionText(FIX.wrongLayerExceptionBody)).toContain('PARCELE_WRONGNAME');
        expect(extractSiOwsExceptionText('{"type":"FeatureCollection"}')).toBeNull();
    });
});

describe('SI §J adapter shape + sources', () => {
    it('country SI, the honest no-rule-pack path, both keyless sources', () => {
        expect(siCountryAdapter.country).toBe('SI');
        expect(siCountryAdapter.rules.kind).toBe('none'); // municipal OPN text — no national numeric feed faked
        const sources = siCountryAdapter.sources();
        expect(sources.map((s) => s.id)).toContain('si-gurs-kn-parcele-wfs');
        expect(sources.every((s) => s.gate === null)).toBe(true); // keyless
        expect(sources.every((s) => s.country === 'SI')).toBe(true);
    });
});

describe('SI jurisdiction — the bbox is a PRE-FILTER, its overlaps are DATA', () => {
    it('isInSlovenia is true at the capital, false at Vienna', () => {
        expect(isInSlovenia(LJUBLJANA.lat, LJUBLJANA.lon)).toBe(true);
        expect(isInSlovenia(48.2082, 16.3738)).toBe(false); // Vienna
        expect(isInSlovenia(NaN, 14)).toBe(false);
    });
    it('every overlap-audit witness really is inside SLOVENIA_BBOX (the SE-lane rule: no witnessless overlap)', () => {
        for (const row of SLOVENIA_BBOX_OVERLAP_AUDIT) {
            const w = row.witnessInsideSlovenia;
            if (w) {
                expect(w.lat).toBeGreaterThanOrEqual(SLOVENIA_BBOX.minLat);
                expect(w.lat).toBeLessThanOrEqual(SLOVENIA_BBOX.maxLat);
                expect(w.lon).toBeGreaterThanOrEqual(SLOVENIA_BBOX.minLon);
                expect(w.lon).toBeLessThanOrEqual(SLOVENIA_BBOX.maxLon);
            }
        }
    });
});

describe('SI registry row — registered in FINAL form, DORMANT-BUT-SAFE today', () => {
    const siRow = listParcelJurisdictions().find((j) => j.regionCode === 'SI');
    it('exists as a cadastral row with the /api/parcel/si proxy path', () => {
        expect(siRow).toBeDefined();
        expect(siRow!.kind).toBe('cadastral');
        expect(siRow!.providerId).toBe('si-gurs-kn-parcele');
        expect(siRow!.proxyPath).toBe('/api/parcel/si');
    });
    it('is DORMANT today — a Ljubljana click offers NO Slovenian candidate, never a misroute', () => {
        // claimsNation('SI') is false until SVN is promoted; the row matches nothing today.
        const candidates = resolveParcelCandidates(LJUBLJANA.lat, LJUBLJANA.lon);
        expect(candidates.some((c) => c.regionCode === 'SI')).toBe(false);
    });
});

// ── THE LOAD-BEARING TEST — the QUEUED resolver/boundary promotion is CORRECT, and its neighbour-
//    integrity requirement is REAL, both proven through the ACTUAL resolver with injected deps. ──
describe('SI queued resolver promotion — proven correct, with a falsification control', () => {
    const base = NATIONAL_BOUNDARY_SET as NationalBoundarySet;
    const svn = (base.neighbours as Record<string, unknown> | undefined)?.SVN as { rings: unknown };
    const prefilters: ReadonlyArray<readonly [string, (a: number, b: number) => boolean]> = [
        ['ITA', isInItaly],
        ['SVN', isInSlovenia],
    ];
    function promote(withHrvHunGuard: boolean): NationalBoundarySet {
        const neighbours: Record<string, unknown> = { ...((base.neighbours as Record<string, unknown>) ?? {}) };
        delete neighbours.SVN;
        if (withHrvHunGuard) {
            neighbours.HRV = QUEUED.neighbours.HRV;
            neighbours.HUN = QUEUED.neighbours.HUN;
        }
        return {
            ...base,
            countries: { ...base.countries, SVN: { regionCode: 'SI', rings: svn.rings } },
            neighbours,
        } as unknown as NationalBoundarySet;
    }
    function claim(set: NationalBoundarySet, lat: number, lon: number): string {
        const v = resolveNationalJurisdiction(lat, lon, { boundaries: set, prefilters });
        return v.ok ? v.regionCode : `REFUSE:${v.reason}`;
    }

    it('WITH the HRV/HUN guard: Slovenian cities claim SI; Italian/Croatian/Hungarian border points do NOT', () => {
        const set = promote(true);
        for (const [lat, lon] of [
            [46.0569, 14.5058], // Ljubljana
            [46.5547, 15.6459], // Maribor
            [45.5481, 13.7302], // Koper
            [46.6625, 16.1664], // Murska Sobota (NE)
        ] as const) {
            expect(claim(set, lat, lon)).toBe('SI');
        }
        // foreign, must NOT be SI
        expect(claim(set, 45.815, 15.9819)).not.toBe('SI'); // Zagreb (HR)
        expect(claim(set, 46.07, 15.69)).not.toBe('SI'); // Kumrovec (HR, border-hugging)
        expect(claim(set, 46.64, 16.445)).not.toBe('SI'); // Rédics (HU, border-hugging)
        expect(claim(set, 45.6495, 13.7768)).toBe('IT'); // Trieste stays Italian
    });

    it('FALSIFICATION CONTROL — promoting SVN WITHOUT the HRV/HUN guard annexes a Croatian border town to SI', () => {
        const unguarded = promote(false);
        // The exact L-12887 defect this lane measured: Kumrovec (Croatia, ~1 km from the border)
        // is wrongly claimed as SI when Croatia is not a resolver member. This is why the promotion
        // must land together with the HR + HU lanes' country additions.
        expect(claim(unguarded, 46.07, 15.69)).toBe('SI'); // WRONG — the control that proves the requirement
        // ...while the guarded set refuses the same point:
        expect(claim(promote(true), 46.07, 15.69)).not.toBe('SI');
    });
});
