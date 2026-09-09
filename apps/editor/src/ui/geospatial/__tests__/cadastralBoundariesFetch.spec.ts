// §CADASTRAL-BOUNDARIES-FETCH (C57 §5.5.4) — the arms that BIND on the fetcher.
//
// The three properties that would fail INVISIBLY if they regressed:
//   1. in-flight de-duplication — two surfaces reacting to one flip must cost ONE upstream request
//      ([[context-one-read-per-bbox]], a defect this repo has already shipped once);
//   2. an OUTAGE is never cached, an `unsupported` IS — caching an outage turns a transient failure
//      into a durable "no boundaries here";
//   3. the radius is min(scope, measured ceiling) — passing the 1781 m default scope through would
//      ask PDOK for tens of thousands of parcels.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ParcelAreaOutcome, ParcelFeature } from '../../site/parcel/ParcelProvider.js';

const fetchParcelsInArea = vi.fn<
    (lon: number, lat: number, radiusM: number) => Promise<ParcelAreaOutcome>
>();

// ⛔ The fetcher must consume the ROUTING REGISTRY (`defaultParcelProvider`), not a single
// cadastre — that is what makes an unwired country answer `unsupported` instead of drawing
// nothing. Mocking the barrel pins that it is the registry being asked.
vi.mock('../../site/parcel/index.js', () => ({
    defaultParcelProvider: {
        id: 'registry',
        label: 'Cadastral parcel / building footprint',
        fetchParcelAtPoint: vi.fn(),
        fetchParcelOutcomeAtPoint: vi.fn(),
        fetchParcelsInArea: (lon: number, lat: number, r: number) => fetchParcelsInArea(lon, lat, r),
    },
}));

import {
    refreshCadastralBoundaries,
    refreshCadastralBoundariesIfEnabled,
    cadastralBoundariesRadiusM,
    getCadastralBoundarySet,
    CADASTRAL_BOUNDARIES_RADIUS_CEILING_M,
    __resetCadastralBoundaryFetchForTests,
} from '../cadastralBoundaries.js';
import {
    getCadastralBoundariesVerdict,
    setCadastralBoundariesEnabled,
    __resetCadastralBoundariesForTests,
} from '../../site/cadastralBoundariesLayer.js';
import {
    DEFAULT_SITE_CONTEXT_SCOPE,
    scopeOuterRadiusM,
    type SiteContextScope,
} from '../contextExtentBudget.js';

function parcel(refcat: string): ParcelFeature {
    return {
        ring: [{ lat: 41.0, lon: 2.0 }, { lat: 41.001, lon: 2.0 }, { lat: 41.001, lon: 2.001 }],
        refcat,
        areaM2: 100,
        source: 'catastro',
    };
}

beforeEach(() => {
    __resetCadastralBoundaryFetchForTests();
    __resetCadastralBoundariesForTests();
    fetchParcelsInArea.mockReset();
});

describe('the radius is scope-bound AND ceiling-bound', () => {
    it('⭐ the DEFAULT scope is clamped — 1781 m through to PDOK would be catastrophic', () => {
        // The measured payload curve (NL): ±220 m → 435 parcels / 804 KB, super-linear in area.
        expect(scopeOuterRadiusM(DEFAULT_SITE_CONTEXT_SCOPE))
            .toBeGreaterThan(CADASTRAL_BOUNDARIES_RADIUS_CEILING_M);
        expect(cadastralBoundariesRadiusM(DEFAULT_SITE_CONTEXT_SCOPE))
            .toBe(CADASTRAL_BOUNDARIES_RADIUS_CEILING_M);
    });

    it('a scope SMALLER than the ceiling wins — the user asked for less, so we ask for less', () => {
        // ⚠ CONSTRUCTED, NOT SPREAD. `SiteContextScope` is a DISCRIMINATED union on `shape`;
        // spreading the default and overriding `radiusM` widens it to a union whose members TS can
        // no longer discriminate, so the literal is written out.
        const tight: SiteContextScope = { shape: 'circle', radiusM: 150 };
        const r = cadastralBoundariesRadiusM(tight);
        expect(r).toBe(Math.min(scopeOuterRadiusM(tight), CADASTRAL_BOUNDARIES_RADIUS_CEILING_M));
        expect(r).toBeLessThanOrEqual(CADASTRAL_BOUNDARIES_RADIUS_CEILING_M);
    });

    it('the clamped radius is what actually reaches the provider', async () => {
        fetchParcelsInArea.mockResolvedValue({ status: 'ok', parcels: [], truncated: false });
        await refreshCadastralBoundaries(41.3874, 2.1686, DEFAULT_SITE_CONTEXT_SCOPE);
        expect(fetchParcelsInArea).toHaveBeenCalledWith(
            2.1686, 41.3874, CADASTRAL_BOUNDARIES_RADIUS_CEILING_M,
        );
    });
});

describe('§ONE-READ-PER-BBOX — two surfaces, one upstream request', () => {
    it('⭐ THE BINDING ARM — concurrent calls for the same box share ONE provider call', async () => {
        let release!: (v: ParcelAreaOutcome) => void;
        fetchParcelsInArea.mockReturnValue(new Promise<ParcelAreaOutcome>((r) => { release = r; }));

        // Exactly the shape that occurs when the 2D map and the Forma panel both react to one flip.
        const a = refreshCadastralBoundaries(41.3874, 2.1686);
        const b = refreshCadastralBoundaries(41.3874, 2.1686);
        release({ status: 'ok', parcels: [parcel('X1')], truncated: false });
        const [ra, rb] = await Promise.all([a, b]);

        expect(fetchParcelsInArea).toHaveBeenCalledTimes(1);
        expect(ra).toBe(rb);
    });

    it('a second call AFTER the first settles is served from cache, not the register', async () => {
        fetchParcelsInArea.mockResolvedValue({ status: 'ok', parcels: [parcel('X1')], truncated: false });
        await refreshCadastralBoundaries(41.3874, 2.1686);
        await refreshCadastralBoundaries(41.3874, 2.1686);
        expect(fetchParcelsInArea).toHaveBeenCalledTimes(1);
    });

    it('a DIFFERENT plot is a different key and does hit the register again', async () => {
        fetchParcelsInArea.mockResolvedValue({ status: 'ok', parcels: [], truncated: false });
        await refreshCadastralBoundaries(41.3874, 2.1686);
        await refreshCadastralBoundaries(52.3702, 4.8952);
        expect(fetchParcelsInArea).toHaveBeenCalledTimes(2);
    });
});

describe('§UPSTREAM-UNREACHABLE-IS-NOT-A-MISS — what may be cached', () => {
    it('⭐ an OUTAGE is NOT cached: caching it would make a transient failure durable', async () => {
        fetchParcelsInArea.mockResolvedValue({ status: 'unreachable', reason: 'Catastro did not answer.' });
        await refreshCadastralBoundaries(41.3874, 2.1686);
        await refreshCadastralBoundaries(41.3874, 2.1686);
        expect(fetchParcelsInArea).toHaveBeenCalledTimes(2);
    });

    it('`unsupported` IS cached — it is a durable fact about the register', async () => {
        fetchParcelsInArea.mockResolvedValue({
            status: 'unsupported', reason: 'Swisstopo answers one point at a time.',
        });
        await refreshCadastralBoundaries(46.948, 7.447);
        await refreshCadastralBoundaries(46.948, 7.447);
        expect(fetchParcelsInArea).toHaveBeenCalledTimes(1);
    });
});

describe('the verdict reaches the ONE owner, and a failure clears the drawing', () => {
    it('an `ok` set is published with its count, truncation and attribution', async () => {
        fetchParcelsInArea.mockResolvedValue({
            status: 'ok', parcels: [parcel('A'), parcel('B')], truncated: true,
        });
        await refreshCadastralBoundaries(41.3874, 2.1686);
        const v = getCadastralBoundariesVerdict();
        expect(v).toEqual({ kind: 'ok', count: 2, truncated: true, sourceLabel: 'catastro' });
        expect(getCadastralBoundarySet()?.parcels).toHaveLength(2);
    });

    it('⭐ an `unsupported` answer CLEARS the drawn set — never leave the last country’s lines up', async () => {
        fetchParcelsInArea.mockResolvedValueOnce({
            status: 'ok', parcels: [parcel('A')], truncated: false,
        });
        await refreshCadastralBoundaries(41.3874, 2.1686);
        expect(getCadastralBoundarySet()).not.toBeNull();

        fetchParcelsInArea.mockResolvedValueOnce({
            status: 'unsupported', reason: 'Swisstopo answers one point at a time.',
        });
        await refreshCadastralBoundaries(46.948, 7.447);
        expect(getCadastralBoundarySet()).toBeNull();
        expect(getCadastralBoundariesVerdict().kind).toBe('unsupported');
    });

    it('a provider that THROWS (against its contract) is `unreachable`, never an empty area', async () => {
        fetchParcelsInArea.mockRejectedValue(new Error('boom'));
        const out = await refreshCadastralBoundaries(41.3874, 2.1686);
        expect(out.status).toBe('unreachable');
        expect(getCadastralBoundariesVerdict().kind).toBe('unreachable');
    });

    it('an invalid centre is `unreachable` and never reaches the register', async () => {
        const out = await refreshCadastralBoundaries(Number.NaN, 2.1686);
        expect(out.status).toBe('unreachable');
        expect(fetchParcelsInArea).not.toHaveBeenCalled();
    });
});

describe('refreshIfEnabled reads the ONE owner, never a local copy', () => {
    it('does nothing while the overlay is OFF', async () => {
        fetchParcelsInArea.mockResolvedValue({ status: 'ok', parcels: [], truncated: false });
        await refreshCadastralBoundariesIfEnabled(41.3874, 2.1686);
        expect(fetchParcelsInArea).not.toHaveBeenCalled();
    });

    it('⭐ fetches once the OWNER says ON — including when the OTHER chip turned it on', async () => {
        fetchParcelsInArea.mockResolvedValue({ status: 'ok', parcels: [], truncated: false });
        setCadastralBoundariesEnabled(true);
        await refreshCadastralBoundariesIfEnabled(41.3874, 2.1686);
        expect(fetchParcelsInArea).toHaveBeenCalledTimes(1);
    });
});
