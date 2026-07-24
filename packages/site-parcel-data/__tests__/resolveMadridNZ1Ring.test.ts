// L-608 — `resolveMadridNZ1Ring`: the Madrid NZ 1 `ringRef` resolver (SPATIAL point-query).
//
// The compliance-critical seam turned pure: given a FIXTURE ArcGIS response (NEVER a live call —
// every test injects `fetchImpl`), the parse is deterministic. Per the MADRID-DATA-RECON-SPIKE §3
// the join is SPATIAL — the resolver sends the parcel's WGS84 POINT and the plane intersects it, so
// these tests pass a point, not a CODMANZANA string. They pin the resolver's honesty properties (see
// its header): never throws, does not project (returns WGS84), and parses COEF_Z under assertion
// (unparseable → refusal, absent → null, never a fabricated default).

import { describe, it, expect } from 'vitest';
import {
    resolveMadridNZ1Ring,
    MADRID_NZ1_RING_REF,
    MADRID_NZ1_RULE,
    MADRID_NZ1_CERTIFIED,
} from '../src/index.js';

// A representative PGOUM-97 PG_CONDICIONES_EDIFICACION layer-6 feature (geometry requested in WGS84
// via outSR=4326, so ArcGIS returns `[lon, lat]` pairs, closing vertex repeated).
const okBody = (attributes: Record<string, unknown>, rings: number[][][]) => ({
    features: [{ attributes, geometry: { rings } }],
});
const RINGS: number[][][] = [
    [
        [-3.704, 40.4166],
        [-3.7036, 40.4166],
        [-3.7036, 40.417],
        [-3.704, 40.417],
        [-3.704, 40.4166], // ArcGIS closing vertex (== first) — dropped by the resolver.
    ],
];

/** The parcel query point (WGS84) — the historic core, an NZ-1 grado. */
const PT = { lat: 40.4166, lon: -3.7038 };

/** A fetch stub that returns `body` as JSON with `ok: true`, and counts its calls. */
function fakeFetch(body: unknown): { fetchImpl: typeof fetch; calls: () => number } {
    let n = 0;
    const fetchImpl = (async () => {
        n++;
        return { ok: true, json: async () => body };
    }) as unknown as typeof fetch;
    return { fetchImpl, calls: () => n };
}

describe('resolveMadridNZ1Ring — the spatial ring resolver', () => {
    it('the certification gate is OFF by default (NZ 1 keeps its refusal until sign-off)', () => {
        expect(MADRID_NZ1_CERTIFIED).toBe(false);
    });

    it('the ringRef constant equals the pack rule handle (no vintage drift)', () => {
        expect(MADRID_NZ1_RING_REF).toBe('madrid-nz1:fondo-condiciones/v-2023');
        expect(MADRID_NZ1_RULE).toHaveProperty('ringRef', MADRID_NZ1_RING_REF);
    });

    it('HAPPY PATH — closes the WGS84 ring, drops the closing vertex, parses COEF_Z (comma decimal)', async () => {
        const { fetchImpl } = fakeFetch(
            okBody({ COEF_Z: '1,25', COND_EDIF: '1', CODMANZANA: '0105104' }, RINGS),
        );
        const res = await resolveMadridNZ1Ring(MADRID_NZ1_RING_REF, PT, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.ringLatLon).toHaveLength(4); // 5 arcgis pts − 1 closing vertex
            // Returned in WGS84 (property 2: the resolver does NOT project to scene-XZ).
            expect(res.ringLatLon[0]).toEqual({ lat: 40.4166, lon: -3.704 });
            expect(res.edificabilidad).toBeCloseTo(1.25, 6); // "1,25" → 1.25
            // CODMANZANA is READ from the feature (not derived from a refcat) and echoed.
            expect(res.codManzana).toBe('0105104');
        }
    });

    it('ABSENT COEF_Z → edificabilidad null (honest absence), still ok', async () => {
        const { fetchImpl } = fakeFetch(okBody({ CODMANZANA: '0105104' }, RINGS));
        const res = await resolveMadridNZ1Ring(MADRID_NZ1_RING_REF, PT, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.edificabilidad).toBeNull();
    });

    it('a placeholder dash COEF_Z ("-") → edificabilidad null (absence, not zero)', async () => {
        const { fetchImpl } = fakeFetch(okBody({ COEF_Z: '-', CODMANZANA: '1' }, RINGS));
        const res = await resolveMadridNZ1Ring(MADRID_NZ1_RING_REF, PT, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.edificabilidad).toBeNull();
    });

    it('a COMPOUND code ("0 / 5") → refuses (never the silent-zero parseFloat trap)', async () => {
        const { fetchImpl } = fakeFetch(okBody({ COEF_Z: '0 / 5', CODMANZANA: '1' }, RINGS));
        const res = await resolveMadridNZ1Ring(MADRID_NZ1_RING_REF, PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('unparseable-edificabilidad');
    });

    it('PRESENT-but-unparseable COEF_Z → refuses (never defaults to 0)', async () => {
        const { fetchImpl } = fakeFetch(okBody({ COEF_Z: 'n/a', CODMANZANA: '1' }, RINGS));
        const res = await resolveMadridNZ1Ring(MADRID_NZ1_RING_REF, PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('unparseable-edificabilidad');
    });

    it('a mismatched ringRef refuses WITHOUT fetching (wrong vintage / plane)', async () => {
        const { fetchImpl, calls } = fakeFetch(okBody({ COEF_Z: '1', CODMANZANA: '1' }, RINGS));
        const res = await resolveMadridNZ1Ring('madrid-nz1:something-else/v-9', PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('ringref-mismatch');
        expect(calls()).toBe(0);
    });

    it('a missing point refuses WITHOUT fetching (nothing to intersect by)', async () => {
        const { fetchImpl, calls } = fakeFetch(okBody({ COEF_Z: '1', CODMANZANA: '1' }, RINGS));
        const res = await resolveMadridNZ1Ring(MADRID_NZ1_RING_REF, null, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-point');
        expect(calls()).toBe(0);
    });

    it('no feature at the point → `no-feature`', async () => {
        const { fetchImpl } = fakeFetch({ features: [] });
        const res = await resolveMadridNZ1Ring(MADRID_NZ1_RING_REF, PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-feature');
    });

    it('degenerate geometry (< 3 vertices) → `degenerate-geometry`', async () => {
        const { fetchImpl } = fakeFetch(
            okBody({ COEF_Z: '1', CODMANZANA: '1' }, [[[-3.7, 40.4], [-3.7, 40.4]]]),
        );
        const res = await resolveMadridNZ1Ring(MADRID_NZ1_RING_REF, PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('degenerate-geometry');
    });

    it('an upstream non-OK response → `endpoint-unreachable`, never throws', async () => {
        const badFetch = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
        const res = await resolveMadridNZ1Ring(MADRID_NZ1_RING_REF, PT, { fetchImpl: badFetch });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });

    it('a THROWING fetch → `endpoint-unreachable`, never throws into the caller', async () => {
        const throwFetch = (async () => {
            throw new Error('network down');
        }) as unknown as typeof fetch;
        await expect(
            resolveMadridNZ1Ring(MADRID_NZ1_RING_REF, PT, { fetchImpl: throwFetch }),
        ).resolves.toMatchObject({ ok: false, reason: 'endpoint-unreachable' });
    });

    it('a malformed JSON body (json() throws) → `endpoint-unreachable`, never throws', async () => {
        const badJson = (async () => ({
            ok: true,
            json: async () => {
                throw new Error('unexpected token');
            },
        })) as unknown as typeof fetch;
        const res = await resolveMadridNZ1Ring(MADRID_NZ1_RING_REF, PT, { fetchImpl: badJson });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });
});
