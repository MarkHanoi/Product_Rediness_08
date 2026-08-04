// §COR-MC-STREET-WIDTH — unit tests for the pure(ish) geometry wiring, with the ONE network
// boundary (`fetchBlock`) injected rather than stubbed at the `fetch` layer, since this module's
// own contract is "same shape as Barcelona's inline §BCN-ALCADA-WIDTH block, extracted for
// testability". The dispatch-level integration (through the real `fetch` stub) lives in
// `cordobaSiteDispatch.test.ts`.

import { describe, it, expect } from 'vitest';
import type { Pt } from '@pryzm/schemas';
import { resolveCordobaMcStreetWidth } from '../src/ui/site/parcel/resolveCordobaMcStreetWidth.js';
import type { BlockFeature } from '../src/ui/site/parcel/CatastroBlockProvider.js';
import type { LatLon } from '../src/ui/site/boundaryProjection.js';

/**
 * A trivial "projection" that carries `lon` straight into `x` and `lat` straight into `z` — this
 * suite constructs its fixture rings directly in the numeric space it wants to measure in, so a
 * real WGS84 equirectangular projection would only obscure the arithmetic under test.
 */
const identityFrame = (p: LatLon): Pt => ({ x: p.lon, z: p.lat });

/** Three vertical-strip parcels that dissolve (exact edge-cancellation) to a 20×20 block ring. */
const BLOCK_PARCELS: ReadonlyArray<{ refcat: string; ring: LatLon[]; areaM2: number }> = [
    { refcat: 'P1', areaM2: 140, ring: [{ lon: 0, lat: 0 }, { lon: 7, lat: 0 }, { lon: 7, lat: 20 }, { lon: 0, lat: 20 }] },
    { refcat: 'P2', areaM2: 120, ring: [{ lon: 7, lat: 0 }, { lon: 13, lat: 0 }, { lon: 13, lat: 20 }, { lon: 7, lat: 20 }] },
    { refcat: 'P3', areaM2: 140, ring: [{ lon: 13, lat: 0 }, { lon: 20, lat: 0 }, { lon: 20, lat: 20 }, { lon: 13, lat: 20 }] },
];

/** A neighbour block 6 m across the east edge (x = 20 → x = 26). */
const NEIGHBOUR_6M = {
    refcat: 'N1',
    ring: [
        { lon: 26, lat: 0 }, { lon: 46, lat: 0 }, { lon: 46, lat: 20 }, { lon: 26, lat: 20 },
    ] as LatLon[],
};

/** A parcel ring well inside the block — touches no block edge, so `facing` is empty and the
 *  whole-block fallback governs (deliberately simple: this suite is about the width plumbing, not
 *  the frontage-matching heuristic `blockEdgesFacingParcel` already has its own tests for). */
const INTERIOR_PARCEL_RING: Pt[] = [
    { x: 8, z: 8 }, { x: 12, z: 8 }, { x: 12, z: 12 }, { x: 8, z: 12 },
];

function blockFixture(opts: { neighbours: ReadonlyArray<{ refcat: string; ring: LatLon[] }> }): BlockFeature {
    return {
        manzana: 'TESTMZ',
        parcels: BLOCK_PARCELS,
        totalAreaM2: 400,
        neighbours: opts.neighbours,
    };
}

describe('§COR-MC-STREET-WIDTH — refcat / centroid plumbing', () => {
    it('refuses `no-refcat` without hitting the injected fetch at all', async () => {
        let called = false;
        const r = await resolveCordobaMcStreetWidth(null, undefined, INTERIOR_PARCEL_RING, identityFrame, {
            fetchBlock: async () => { called = true; return null; },
        });
        expect(r).toEqual({ ok: false, reason: 'no-refcat' });
        expect(called).toBe(false);
    });

    it('refuses `no-refcat` on an empty-string refcat too', async () => {
        const r = await resolveCordobaMcStreetWidth('   ', undefined, INTERIOR_PARCEL_RING, identityFrame, {
            fetchBlock: async () => null,
        });
        expect(r).toEqual({ ok: false, reason: 'no-refcat' });
    });
});

describe('§COR-MC-STREET-WIDTH — block availability', () => {
    it('refuses `block-unavailable` when the block fetch returns null', async () => {
        const r = await resolveCordobaMcStreetWidth('REF1', undefined, INTERIOR_PARCEL_RING, identityFrame, {
            fetchBlock: async () => null,
        });
        expect(r).toEqual({ ok: false, reason: 'block-unavailable' });
    });

    it('refuses `block-unavailable` on fewer than 3 parcels (no freeStanding signal at this layer)', async () => {
        const r = await resolveCordobaMcStreetWidth('REF1', undefined, INTERIOR_PARCEL_RING, identityFrame, {
            fetchBlock: async () => ({
                manzana: 'MZ', parcels: BLOCK_PARCELS.slice(0, 2), totalAreaM2: 100, neighbours: [],
            }),
        });
        expect(r).toEqual({ ok: false, reason: 'block-unavailable' });
    });
});

describe('§COR-MC-STREET-WIDTH — neighbours / dissolve / measurement', () => {
    it('refuses `no-neighbours` when the block bbox returned none', async () => {
        const r = await resolveCordobaMcStreetWidth('REF1', undefined, INTERIOR_PARCEL_RING, identityFrame, {
            fetchBlock: async () => blockFixture({ neighbours: [] }),
        });
        expect(r).toEqual({ ok: false, reason: 'no-neighbours' });
    });

    it('refuses `no-opposing-frontage` when no ray finds an opposing parcel', async () => {
        // A "neighbour" 500 m away — outside `measureStreetWidths`' default 80 m search.
        const r = await resolveCordobaMcStreetWidth('REF1', undefined, INTERIOR_PARCEL_RING, identityFrame, {
            fetchBlock: async () => blockFixture({
                neighbours: [{ refcat: 'FAR', ring: [
                    { lon: 520, lat: 0 }, { lon: 540, lat: 0 }, { lon: 540, lat: 20 }, { lon: 520, lat: 20 },
                ] }],
            }),
        });
        expect(r).toEqual({ ok: false, reason: 'no-opposing-frontage' });
    });

    it('MEASURES a real 6 m width from the dissolved block against the neighbour', async () => {
        const r = await resolveCordobaMcStreetWidth('REF1', undefined, INTERIOR_PARCEL_RING, identityFrame, {
            fetchBlock: async () => blockFixture({ neighbours: [NEIGHBOUR_6M] }),
        });
        expect(r.ok).toBe(true);
        if (!r.ok) throw new Error('unreachable');
        expect(r.width_m).toBeCloseTo(6, 6);
        expect(r.spread_m).toBeCloseTo(0, 6);
        expect(r.provenance).toBe('measured-geometry');
        expect(r.manzana).toBe('TESTMZ');
        expect(r.authority).toMatch(/CONSTRUCTED/);
    });

    it('passes the injected centroid straight through to `fetchBlock`', async () => {
        let seenCentroid: unknown;
        await resolveCordobaMcStreetWidth(
            'REF1',
            { lat: 37.5, lon: -4.5 },
            INTERIOR_PARCEL_RING,
            identityFrame,
            {
                fetchBlock: async (_refcat, _signal, centroid) => {
                    seenCentroid = centroid;
                    return blockFixture({ neighbours: [NEIGHBOUR_6M] });
                },
            },
        );
        expect(seenCentroid).toEqual({ lat: 37.5, lon: -4.5 });
    });
});

describe('§COR-MC-STREET-WIDTH — never throws', () => {
    it('an injected `fetchBlock` that rejects is caught — resolves `block-unavailable`, never rejects', async () => {
        const r = await resolveCordobaMcStreetWidth('REF1', undefined, INTERIOR_PARCEL_RING, identityFrame, {
            fetchBlock: async () => { throw new Error('boom'); },
        });
        expect(r).toEqual({ ok: false, reason: 'block-unavailable' });
    });
});
