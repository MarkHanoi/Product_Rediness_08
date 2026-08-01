// BARCELONA-GIS-AUDIT-SPIKE — `resolveBcnRefosOV` + `parsePlantes`: the AMB Refós OV_Trames resolver.
//
// The compliance-critical seam turned pure: given a FIXTURE ArcGIS response (NEVER a live call —
// every test injects `fetchImpl`), the parse is deterministic. The fixture ring + PLANTES are a REAL
// clau-18 OV_Trames feature captured from the AMB Refós plane (findings/BARCELONA-GIS-AUDIT-SPIKE.md).
// These tests pin the three honesty properties in the resolver header: never throws, returns WGS84
// (does not project), and parses PLANTES under assertion (unparseable → refusal, never a default).

import { describe, it, expect } from 'vitest';
import {
    resolveBcnRefosOV,
    parsePlantes,
    BCN_REFOS_OV_RING_REF,
    BCN_REFOS_OV_CERTIFIED,
    BCN_VOLUMETRIA_18_RULE,
    heightFromFloorsAboveGround,
} from '../src/index.js';

// A REAL clau-18 OV_Trames feature (WGS84, outSR=4326 ⇒ [lon, lat] pairs, closing vertex repeated):
//   attrs { CLAU: '18hs', PLANTES: 'B+7', EXP: '1998/001498' }  — captured 2026-07-24.
const REAL_RING: number[][][] = [
    [
        [2.204238, 41.428826],
        [2.204132, 41.4287],
        [2.203667, 41.428922],
        [2.203771, 41.429049],
        [2.204238, 41.428826], // ArcGIS closing vertex (== first) — dropped by the resolver.
    ],
];
const okBody = (attributes: Record<string, unknown>, rings: number[][][]) => ({
    features: [{ attributes, geometry: { rings } }],
});

/** A fetch stub returning `body` as JSON with `ok: true`, counting its calls. */
function fakeFetch(body: unknown): { fetchImpl: typeof fetch; calls: () => number } {
    let n = 0;
    const fetchImpl = (async () => {
        n++;
        return { ok: true, json: async () => body };
    }) as unknown as typeof fetch;
    return { fetchImpl, calls: () => n };
}

const PT = { lat: 41.4288, lon: 2.2039 };

describe('parsePlantes — the AMB PLANTES floor-count grammar', () => {
    it('B+N → floors above ground = N, total storeys = N+1', () => {
        expect(parsePlantes('B+7')).toEqual({
            raw: 'B+7',
            floorsAboveGround: 7,
            totalStoreys: 8,
            hasAttic: false,
        });
    });
    it('PX+N (porxo ground) parses like B+N', () => {
        expect(parsePlantes('PX+3')?.floorsAboveGround).toBe(3);
        expect(parsePlantes('PX+3')?.totalStoreys).toBe(4);
    });
    it('B+N+A (àtic) counts the attic as one more storey and flags it', () => {
        const p = parsePlantes('B+5+A');
        expect(p?.floorsAboveGround).toBe(5);
        expect(p?.totalStoreys).toBe(7); // ground + 5 + attic
        expect(p?.hasAttic).toBe(true);
    });
    it('tall volumetric counts parse (B+32)', () => {
        expect(parsePlantes('B+32')?.floorsAboveGround).toBe(32);
    });
    it('a non-floor value ("ED", blank, null) → null (never a fabricated storey)', () => {
        expect(parsePlantes('ED')).toBeNull();
        expect(parsePlantes('')).toBeNull();
        expect(parsePlantes(null)).toBeNull();
        expect(parsePlantes(undefined)).toBeNull();
        expect(parsePlantes('B+')).toBeNull();
        expect(parsePlantes('7')).toBeNull();
    });
});

describe('heightFromFloorsAboveGround — Art. 327.2 storey module reuse', () => {
    it('within the table (PB+5) returns the band’s certified height, basis table-exact', () => {
        expect(heightFromFloorsAboveGround(5)).toEqual({ height_m: 20.75, basis: 'table-exact' });
    });
    it('above the table (PB+7, clau-18 range) extrapolates on the module and says so', () => {
        const h = heightFromFloorsAboveGround(7);
        expect(h?.basis).toBe('table-module-extrapolated');
        // 5.5 + 3.05×7 = 26.85
        expect(h?.height_m).toBeCloseTo(26.85, 6);
    });
    it('a non-positive / non-integer count → null (never guesses)', () => {
        expect(heightFromFloorsAboveGround(0)).toBeNull();
        expect(heightFromFloorsAboveGround(-2)).toBeNull();
        expect(heightFromFloorsAboveGround(3.5)).toBeNull();
    });
});

describe('resolveBcnRefosOV — the OV footprint + PLANTES resolver', () => {
    it('the certification gate is SIGNED (SIG-3, founder, 2026-08-01) — clau 18 may now render', () => {
        // Was `false` with the note "OFF by default until L-449 sign-off". The founder signed on
        // 2026-08-01; the pin flips WITH the signature, never ahead of it. The signature, what it
        // authorises and — equally binding — what it does NOT, are recorded in
        // docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/sources/VERIFICATION.md (SIG-3).
        expect(BCN_REFOS_OV_CERTIFIED).toBe(true);
    });

    it('the ringRef constant equals the pack rule handle (no vintage drift)', () => {
        expect(BCN_REFOS_OV_RING_REF).toBe('bcn-refos-ov:plantes/amb-v2024');
        expect(BCN_VOLUMETRIA_18_RULE).toHaveProperty('ringRef', BCN_REFOS_OV_RING_REF);
    });

    it('HAPPY PATH — closes the WGS84 ring, drops the closing vertex, parses PLANTES', async () => {
        const { fetchImpl } = fakeFetch(
            okBody({ PLANTES: 'B+7', CLAU: '18hs', EXP: '1998/001498' }, REAL_RING),
        );
        const res = await resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, PT, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.ringLatLon).toHaveLength(4); // 5 arcgis pts − 1 closing vertex
            // Returned in WGS84 (property 2: NOT projected to scene-XZ).
            expect(res.ringLatLon[0]).toEqual({ lat: 41.428826, lon: 2.204238 });
            expect(res.plantes.floorsAboveGround).toBe(7);
            expect(res.plantes.totalStoreys).toBe(8);
            expect(res.clau).toBe('18hs');
            expect(res.expedient).toBe('1998/001498');
        }
    });

    it('PRESENT-but-unparseable PLANTES ("ED") → refuses (never defaults to a storey)', async () => {
        const { fetchImpl } = fakeFetch(okBody({ PLANTES: 'ED', CLAU: '18' }, REAL_RING));
        const res = await resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('unparseable-plantes');
    });

    it('ABSENT PLANTES → refuses (the floor count is the whole clau-18 win)', async () => {
        const { fetchImpl } = fakeFetch(okBody({ CLAU: '18' }, REAL_RING));
        const res = await resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('unparseable-plantes');
    });

    it('a mismatched ringRef refuses WITHOUT fetching (wrong vintage / plane)', async () => {
        const { fetchImpl, calls } = fakeFetch(okBody({ PLANTES: 'B+7' }, REAL_RING));
        const res = await resolveBcnRefosOV('bcn-refos-ov:something/v-9', PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('ringref-mismatch');
        expect(calls()).toBe(0);
    });

    it('a missing point refuses WITHOUT fetching (nothing to query by)', async () => {
        const { fetchImpl, calls } = fakeFetch(okBody({ PLANTES: 'B+7' }, REAL_RING));
        const res = await resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, null, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
        expect(calls()).toBe(0);
    });

    it('no OV feature at the point → `no-feature`', async () => {
        const { fetchImpl } = fakeFetch({ features: [] });
        const res = await resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-feature');
    });

    it('degenerate geometry (< 3 vertices) → `degenerate-geometry`', async () => {
        const { fetchImpl } = fakeFetch(
            okBody({ PLANTES: 'B+7' }, [[[2.2, 41.4], [2.2, 41.4]]]),
        );
        const res = await resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('degenerate-geometry');
    });

    it('an upstream non-OK response → `endpoint-unreachable`, never throws', async () => {
        const badFetch = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
        const res = await resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, PT, { fetchImpl: badFetch });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });

    it('a THROWING fetch → `endpoint-unreachable`, never throws into the caller', async () => {
        const throwFetch = (async () => {
            throw new Error('network down');
        }) as unknown as typeof fetch;
        await expect(
            resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, PT, { fetchImpl: throwFetch }),
        ).resolves.toMatchObject({ ok: false, reason: 'endpoint-unreachable' });
    });

    it('a malformed JSON body (json() throws) → `endpoint-unreachable`, never throws', async () => {
        const badJson = (async () => ({
            ok: true,
            json: async () => {
                throw new Error('unexpected token');
            },
        })) as unknown as typeof fetch;
        const res = await resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, PT, { fetchImpl: badJson });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });
});
