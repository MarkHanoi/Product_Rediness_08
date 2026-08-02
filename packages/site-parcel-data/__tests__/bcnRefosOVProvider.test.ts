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
    // §AMB-UNBIND (2026-08-02) — the municipality parameter and the branded INE vocabulary.
    AMB_BARCELONA,
    ambMunicipalityByIne,
    ineCodeLiteral,
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
        expect(heightFromFloorsAboveGround(5)).toEqual({ height_m: 22.4, basis: 'table-exact' });
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
        const res = await resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, PT, { municipality: AMB_BARCELONA, fetchImpl });
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
        const res = await resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, PT, { municipality: AMB_BARCELONA, fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('unparseable-plantes');
    });

    it('ABSENT PLANTES → refuses (the floor count is the whole clau-18 win)', async () => {
        const { fetchImpl } = fakeFetch(okBody({ CLAU: '18' }, REAL_RING));
        const res = await resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, PT, { municipality: AMB_BARCELONA, fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('unparseable-plantes');
    });

    it('a mismatched ringRef refuses WITHOUT fetching (wrong vintage / plane)', async () => {
        const { fetchImpl, calls } = fakeFetch(okBody({ PLANTES: 'B+7' }, REAL_RING));
        const res = await resolveBcnRefosOV('bcn-refos-ov:something/v-9', PT, { municipality: AMB_BARCELONA, fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('ringref-mismatch');
        expect(calls()).toBe(0);
    });

    it('a missing point refuses WITHOUT fetching (nothing to query by)', async () => {
        const { fetchImpl, calls } = fakeFetch(okBody({ PLANTES: 'B+7' }, REAL_RING));
        const res = await resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, null, { municipality: AMB_BARCELONA, fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
        expect(calls()).toBe(0);
    });

    it('no OV feature at the point → `no-feature`', async () => {
        const { fetchImpl } = fakeFetch({ features: [] });
        const res = await resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, PT, { municipality: AMB_BARCELONA, fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-feature');
    });

    it('degenerate geometry (< 3 vertices) → `degenerate-geometry`', async () => {
        const { fetchImpl } = fakeFetch(
            okBody({ PLANTES: 'B+7' }, [[[2.2, 41.4], [2.2, 41.4]]]),
        );
        const res = await resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, PT, { municipality: AMB_BARCELONA, fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('degenerate-geometry');
    });

    it('an upstream non-OK response → `endpoint-unreachable`, never throws', async () => {
        const badFetch = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
        const res = await resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, PT, { municipality: AMB_BARCELONA, fetchImpl: badFetch });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });

    it('a THROWING fetch → `endpoint-unreachable`, never throws into the caller', async () => {
        const throwFetch = (async () => {
            throw new Error('network down');
        }) as unknown as typeof fetch;
        await expect(
            resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, PT, { municipality: AMB_BARCELONA, fetchImpl: throwFetch }),
        ).resolves.toMatchObject({ ok: false, reason: 'endpoint-unreachable' });
    });

    it('a malformed JSON body (json() throws) → `endpoint-unreachable`, never throws', async () => {
        const badJson = (async () => ({
            ok: true,
            json: async () => {
                throw new Error('unexpected token');
            },
        })) as unknown as typeof fetch;
        const res = await resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, PT, { municipality: AMB_BARCELONA, fetchImpl: badJson });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// §AMB-UNBIND (2026-08-02) — THE MUNICIPALITY IS A PARAMETER, AND BARCELONA DID NOT MOVE.
//
// ⚠ THESE TESTS EXERCISE THE NEW PATH. Every one of them reads `deps.municipality`, which did not
// exist before this change; the file does not compile against the previous tree. The first test is
// the BYTE-IDENTITY CONTROL made permanent — it is the one that would catch a future "tidy-up" of
// the query builder, and it is written against the URL STRING rather than the parsed result
// because the parsed result is insensitive to `where=` and the whole defect lives there.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** A fetch that RECORDS the URL it was called with — the control needs the request, not the reply. */
function urlCapturingFetch(body: unknown): { fetchImpl: typeof fetch; urls: string[] } {
    const urls: string[] = [];
    const fetchImpl = (async (u: string) => {
        urls.push(String(u));
        return { ok: true, json: async () => body };
    }) as unknown as typeof fetch;
    return { fetchImpl, urls };
}

describe('§AMB-UNBIND — the CODI_INE filter is the municipality`s, not a constant', () => {
    it('🔒 CONTROL — Barcelona`s query is BYTE-IDENTICAL to the pre-parameterisation URL', async () => {
        // Captured from the UNMODIFIED tree on 2026-08-02 by driving the same fixture through the
        // same point. Not "equivalent", not "contains 08019" — the exact bytes, in order, including
        // the encoding of the `where` clause. Barcelona is the one city where the answer is known.
        const { fetchImpl, urls } = urlCapturingFetch(
            okBody({ PLANTES: 'B+7', CLAU: '18hs', EXP: 'EXP-1234/99' }, REAL_RING),
        );
        await resolveBcnRefosOV(
            BCN_REFOS_OV_RING_REF,
            { lat: 41.3903, lon: 2.1703 },
            { municipality: AMB_BARCELONA, fetchImpl },
        );
        expect(urls).toHaveLength(1);
        expect(urls[0]).toBe(
            '/api/bcn-refos/ov?layer=17' +
                '&geometry=%7B%22x%22%3A2.1703%2C%22y%22%3A41.3903%2C%22spatialReference%22%3A%7B%22wkid%22%3A4326%7D%7D' +
                '&geometryType=esriGeometryPoint&inSR=4326' +
                '&spatialRel=esriSpatialRelIntersects' +
                "&where=CODI_INE%3D'08019'" +
                '&outFields=PLANTES%2CCLAU%2CEXP' +
                '&returnGeometry=true&outSR=4326&f=json',
        );
    });

    it('a DIFFERENT AMB municipality actually reaches the wire — the unbinding, proven', async () => {
        // The point of the change. Before it, this URL was `CODI_INE='08019'` no matter which
        // municipality was asked for, so 35 of 36 were unreachable. Sant Boi is chosen because it
        // is a REGISTERED jurisdiction whose publication gate is nonetheless SHUT — reachability
        // and authorisation are different axes and this test only claims the first.
        const santBoi = ambMunicipalityByIne(ineCodeLiteral('08200'))!;
        const { fetchImpl, urls } = urlCapturingFetch(
            okBody({ PLANTES: 'B+4', CLAU: '18', EXP: 'X/1' }, REAL_RING),
        );
        const res = await resolveBcnRefosOV(
            BCN_REFOS_OV_RING_REF,
            PT,
            { municipality: santBoi, fetchImpl },
        );
        expect(urls[0]).toContain("where=CODI_INE%3D'08200'");
        expect(urls[0]).not.toContain('08019');
        expect(res.ok).toBe(true);
    });

    it('⛔ 08196 — the COLLISION FIXTURE. The INE reading is in scope and reaches the wire', async () => {
        // THE KNOWN-ANSWER CONTROL the previous guards passed cleanly on. INE 08196 = Sant Andreu
        // de la Barca, inside the AMB with published polygons; DGC 08196 = Sant Andreu de
        // Llavaneres, ~40 km away and NOT in the AMB. Both are five digits, both start '08'.
        //
        // ⚠ WHAT THIS TEST CAN AND CANNOT PROVE. At RUNTIME the two are the same string, so no
        // assertion here can distinguish them — that is the defect's whole nature, and claiming
        // otherwise would be the "guard that proves nothing" pattern. The DGC value is blocked by
        // the BRAND at compile time (`esMunicipalCode.test.ts` pins that with @ts-expect-error).
        // What THIS test pins is the other half: the INE reading is a real, in-scope municipality,
        // so the code cannot be dismissed as unreachable and the brand cannot be dropped as inert.
        const sab = ambMunicipalityByIne(ineCodeLiteral('08196'));
        expect(sab, 'INE 08196 must be in AMB scope — if null, the table holds the DGC reading').not.toBeNull();
        expect(sab!.nameInSource).toBe('Sant Andreu de la Barca');

        const { fetchImpl, urls } = urlCapturingFetch(okBody({ PLANTES: 'B+3', CLAU: '18' }, REAL_RING));
        await resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, PT, { municipality: sab!, fetchImpl });
        expect(urls[0]).toContain("where=CODI_INE%3D'08196'");
    });

    it('⛔ an OUT-OF-SCOPE municipality refuses `unknown-municipality` and NEVER fetches', async () => {
        // Madrid's INE code handed to the AMB resolver. The refusal must be `unknown-municipality`
        // — a statement about the QUERY — and NOT `no-feature`, which is a statement about the
        // LAND and would report a coverage hole as a legal fact (§CONTEXT-DATA-HONESTY).
        // It must also short-circuit BEFORE the network: an out-of-scope query is not worth a
        // round-trip and the service would answer an empty feature set, i.e. the wrong reason.
        const { fetchImpl, urls } = urlCapturingFetch(okBody({ PLANTES: 'B+7' }, REAL_RING));
        const madrid = { ineCode: ineCodeLiteral('28079'), nameInSource: 'Madrid', jurisdictionId: null };
        const res = await resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, PT, { municipality: madrid, fetchImpl });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toBe('unknown-municipality');
        expect(res.reason).not.toBe('no-feature');
        expect(urls, 'an out-of-scope municipality must not reach the network').toHaveLength(0);
    });

    it('the refusal for out-of-scope is DISTINCT from the refusal for a genuinely empty result', async () => {
        // The pair that makes the distinction load-bearing rather than decorative.
        const inScope = urlCapturingFetch({ features: [] });
        const empty = await resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, PT, {
            municipality: AMB_BARCELONA,
            fetchImpl: inScope.fetchImpl,
        });
        expect(empty.ok).toBe(false);
        if (!empty.ok) expect(empty.reason).toBe('no-feature');
        expect(inScope.urls).toHaveLength(1); // it DID ask — the land genuinely has no OV footprint
    });
});
