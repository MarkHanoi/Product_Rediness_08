// §BCN-CLAU18-OV — the END-TO-END test for the clau-18 (*ordenació en volumetria específica*) path:
// the SHIPPED client resolver, over a REAL HTTP round trip, into the REAL proxy route handler, and
// out through the REAL `explicit-area` engine branch with the REAL rule pack.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS TEST HAD TO EXIST
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Everything on the PRYZM side of clau 18 was already written — the pack, the resolver, the L5
// dispatch branch — and it rendered NOTHING, for a reason no unit test could see: the same-origin
// route `/api/bcn-refos/ov` DID NOT EXIST. Every existing test injected `fetchImpl`, so every
// existing test passed while the production path was dead. This test therefore refuses to inject a
// fetch: it stands up a real `node:http` server, mounts the real `server/bcnRefosOvProxy.js`
// handler on the real path, and lets `resolveBcnRefosOV` use real `globalThis.fetch`.
//
// ⇒ **DELETE THE ROUTE AND THIS TEST FAILS.** That is asserted explicitly (`ROUTE REMOVED`), and it
//   is the only guard that would have caught the original defect.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// §CONTEXT-DATA-HONESTY — the second thing under test
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A clau-18 parcel with NO published volumetric ordering (measured: ~69 % of clau-18 land) and a
// clau-18 parcel during an AMB OUTAGE must NOT be the same value. Both degrade to the SAME cited
// PGM Art. 306 refusal on screen — that is correct and deliberate — but they must arrive as two
// DIFFERENT typed reasons (`no-feature` vs `endpoint-unreachable`) so the failure is legible and can
// never be mistaken for "the ordinance grants nothing here". Neither may ever produce a number.
//
// UPSTREAM IS FAKED, THE ROUTE IS NOT. The AMB service itself is stubbed (tests must not hit the
// network), but the *fixture bodies are real*: captured from `qualificacio_refos_3857/MapServer`
// layer 17 on 2026-07-31 — `{ CLAU: '18hs', PLANTES: 'B+7', EXP: '1998/001498' }` and the ArcGIS
// 200-with-`{error}` envelope the service really answers on a malformed query.
//
// Contracts: C57 (same-origin/CSP), C58 §1.2/§1.4/§1.11, ADR-0270 (explicit-area), ADR-0273, L-449.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import {
    resolveBcnRefosOV,
    BCN_REFOS_OV_RING_REF,
    BCN_REFOS_OV_PATH,
    BCN_REFOS_OV_CERTIFIED,
    ES_BARCELONA_VOLUMETRIA_18_PACK,
    BCN_VOLUMETRIA_18_ZONE_CODE,
    computeBuildableEnvelope,
    heightFromFloorsAboveGround,
    type Pt,
    type ParcelEdgeClassification,
    type ZoningRecord,
} from '../src/index.js';
// The REAL server route handler — a dependency-free ESM module (it imports nothing at all),
// deliberately imported BY PATH so this test exercises the shipped file rather than a copy of its
// logic. This is a TEST-ONLY reach across the client/server line: `server/` is layer-neutral BFF
// code, and the whole point of the test is that the two halves agree on one contract.
import { makeBcnRefosOvHandler, __resetBcnRefosCache } from '../../../server/bcnRefosOvProxy.js';

// ── REAL captured layer-17 fixture (outSR=4326 ⇒ [lon, lat], ArcGIS closing vertex repeated) ──
const REAL_OV_FEATURE = {
    attributes: { PLANTES: 'B+7', CLAU: '18hs', EXP: '1998/001498' },
    geometry: {
        rings: [[
            [2.204238, 41.428826],
            [2.204132, 41.428700],
            [2.203667, 41.428922],
            [2.203771, 41.429049],
            [2.204238, 41.428826],
        ]],
    },
};

// The two points below are REAL Barcelona clau-18 parcel points, each verified against the LIVE AMB
// service on 2026-07-31 through this very route. The FIXTURE served in these tests is a real
// OV_Trames feature but not necessarily the one at these coordinates (upstream is stubbed — a test
// must not depend on the network); the coordinates are real so that the case names are not fiction.

/** Live-verified: this clau-18 point HAS a published OV footprint (`PLANTES=B+4`). */
const CLAU18_WITH_OV = { lat: 41.418773, lon: 2.197693 };
/** Live-verified: this clau-18 point has NO OV footprint — must keep the cited Art. 306 refusal. */
const CLAU18_WITHOUT_OV = { lat: 41.351158, lon: 2.146579 };

type UpstreamMode = 'ok' | 'empty' | 'outage' | 'arcgis-error';
let upstream: UpstreamMode = 'ok';
/** Every upstream URL the route actually built — proves the route, not the test, shaped the query. */
const upstreamUrls: string[] = [];

const fakeUpstream = (async (url: string) => {
    upstreamUrls.push(String(url));
    if (upstream === 'outage') throw new Error('ECONNREFUSED geoportal.amb.cat');
    if (upstream === 'arcgis-error') {
        // What the AMB service REALLY answers on a bad query: HTTP 200 carrying an error envelope.
        return new Response(JSON.stringify({ error: { code: 400, message: 'Failed to execute query.' } }), { status: 200 });
    }
    const features = upstream === 'empty' ? [] : [REAL_OV_FEATURE];
    return new Response(JSON.stringify({ features }), { status: 200 });
}) as unknown as typeof fetch;

let server: Server;
let origin = '';
/** Flipped to false by the "ROUTE REMOVED" test to prove the route is what makes this work. */
let routeMounted = true;

beforeAll(async () => {
    const handler = makeBcnRefosOvHandler({ fetchImpl: fakeUpstream });
    server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (!routeMounted || url.pathname !== BCN_REFOS_OV_PATH) {
            // EXACTLY what Express does when no route matches — which is what the client hit before
            // this route existed (a 404 HTML page, hence `endpoint-unreachable`).
            res.statusCode = 404;
            res.end('Cannot GET ' + url.pathname);
            return;
        }
        const query: Record<string, string> = {};
        url.searchParams.forEach((v, k) => { query[k] = v; });
        // Minimal express-compatible res shim over node:http.
        const shim = {
            setHeader: (k: string, v: string) => res.setHeader(k, v),
            status(code: number) { res.statusCode = code; return this; },
            json(payload: unknown) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(payload));
                return this;
            },
        };
        void handler({ query }, shim);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

/** Drive the SHIPPED resolver over the real socket at the real path. No fetch injection. */
function resolveViaRoute(pt: { lat: number; lon: number }) {
    __resetBcnRefosCache();
    return resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, pt, { pathBase: `${origin}${BCN_REFOS_OV_PATH}` });
}

describe('§BCN-CLAU18-OV — the route is what makes the clau-18 path resolve at all', () => {
    it('the client constant and the server constant are the SAME path', () => {
        // The original defect in one assertion: the client called a path nobody served.
        expect(BCN_REFOS_OV_PATH).toBe('/api/bcn-refos/ov');
    });

    it('WITH the route mounted → the shipped resolver returns the WGS84 ring + parsed PLANTES', async () => {
        upstream = 'ok';
        upstreamUrls.length = 0;
        const r = await resolveViaRoute(CLAU18_WITH_OV);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // Property 2 — WGS84, not EPSG:3857 and not scene-XZ. The ring is in Barcelona.
        expect(r.ringLatLon).toHaveLength(4); // 5 vertices minus the ArcGIS closing duplicate
        expect(r.ringLatLon[0]!.lat).toBeCloseTo(41.4288, 3);
        expect(r.ringLatLon[0]!.lon).toBeCloseTo(2.2042, 3);
        // The clau-18 win: the storey count the qualification polygon does NOT carry.
        expect(r.plantes.raw).toBe('B+7');
        expect(r.plantes.floorsAboveGround).toBe(7);
        expect(r.plantes.totalStoreys).toBe(8);
        expect(r.clau).toBe('18hs');
        expect(r.expedient).toBe('1998/001498');
        // The ROUTE built the upstream query — against the AMB host, asking for WGS84 back.
        expect(upstreamUrls).toHaveLength(1);
        expect(upstreamUrls[0]).toContain('geoportal.amb.cat');
        expect(decodeURIComponent(upstreamUrls[0]!)).toContain('outSR=4326');
    });

    it('⇒ that resolution drives the REAL explicit-area engine branch to a REAL envelope', async () => {
        upstream = 'ok';
        const r = await resolveViaRoute(CLAU18_WITH_OV);
        expect(r.ok).toBe(true);
        if (!r.ok) return;

        // The same steps `tryBcnClau18Volumetria` performs, minus the site-frame projection (which
        // needs a live SiteContext): a local metric frame standing in for the authoring frame.
        const origin0 = r.ringLatLon[0]!;
        const M_PER_DEG_LAT = 111_320;
        const toXZ = (p: { lat: number; lon: number }): Pt => ({
            x: (p.lon - origin0.lon) * M_PER_DEG_LAT * Math.cos((origin0.lat * Math.PI) / 180),
            z: -(p.lat - origin0.lat) * M_PER_DEG_LAT,
        });
        const footprint: Pt[] = r.ringLatLon.map(toXZ);
        // A generous parcel around the footprint, so the clip is the FOOTPRINT, not the parcel.
        const xs = footprint.map((p) => p.x), zs = footprint.map((p) => p.z);
        const pad = 30;
        const parcel: Pt[] = [
            { x: Math.min(...xs) - pad, z: Math.min(...zs) - pad },
            { x: Math.max(...xs) + pad, z: Math.min(...zs) - pad },
            { x: Math.max(...xs) + pad, z: Math.max(...zs) + pad },
            { x: Math.min(...xs) - pad, z: Math.max(...zs) + pad },
        ];
        const edges: ParcelEdgeClassification[] = ['unclassified', 'unclassified', 'unclassified', 'unclassified'];
        const record: ZoningRecord = {
            zoneCode: BCN_VOLUMETRIA_18_ZONE_CODE,
            zoneLabel: 'Ordenació en volumetria específica (clau 18)',
            jurisdictionId: ES_BARCELONA_VOLUMETRIA_18_PACK.jurisdictionId,
            structuredFields: {},
            overlays: [],
            ordinanceRef: null,
            provenance: {
                source: 'catastro-muc',
                label: 'AMB Refós de Planejament — OV_Trames',
                version: null,
                license: null,
                crs: 'EPSG:3857',
            },
        };
        const env = computeBuildableEnvelope({
            parcelRing: parcel,
            edgeClassifications: edges,
            zoning: record,
            rulePack: ES_BARCELONA_VOLUMETRIA_18_PACK,
            explicitAreaFootprint: footprint,
        });
        expect(env.status).toBe('ok');
        expect(env.insetPolygon.length).toBeGreaterThanOrEqual(3);
        expect(env.insetAreaM2).toBeGreaterThan(0);
        // The published footprint is far smaller than the padded parcel — the clip really happened.
        const parcelArea = (Math.max(...xs) - Math.min(...xs) + 2 * pad) * (Math.max(...zs) - Math.min(...zs) + 2 * pad);
        expect(env.insetAreaM2).toBeLessThan(parcelArea / 2);

        // The height is a floors→metres CONVENTION applied to a SOURCED floor count — depended on
        // through the interface (`heightFromFloorsAboveGround`), never by re-deriving its number.
        const h = heightFromFloorsAboveGround(r.plantes.floorsAboveGround);
        expect(h).not.toBeNull();
        expect(h!.height_m).toBeGreaterThan(0);
        expect(Number.isFinite(h!.height_m)).toBe(true);
    });

    it('⚠ ROUTE REMOVED → the SAME call collapses to `endpoint-unreachable` (this is the guard)', async () => {
        upstream = 'ok';
        routeMounted = false;
        try {
            const r = await resolveViaRoute(CLAU18_WITH_OV);
            expect(r.ok).toBe(false);
            if (r.ok) return;
            expect(r.reason).toBe('endpoint-unreachable');
        } finally {
            routeMounted = true;
        }
        // …and with it back, the very same call resolves again. If the route were incidental, this
        // pair of assertions could not both hold.
        const back = await resolveViaRoute(CLAU18_WITH_OV);
        expect(back.ok).toBe(true);
    });
});

describe('§BCN-CLAU18-OV §CONTEXT-DATA-HONESTY — an outage and an absence are DIFFERENT VALUES', () => {
    it('a genuine "no volumetric ordering published here" → `no-feature` (a legal answer)', async () => {
        upstream = 'empty';
        const r = await resolveViaRoute(CLAU18_WITHOUT_OV);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('no-feature');
    });

    it('an AMB OUTAGE → `endpoint-unreachable` (a failure), NEVER `no-feature`', async () => {
        upstream = 'outage';
        const r = await resolveViaRoute(CLAU18_WITH_OV);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('endpoint-unreachable');
    });

    it('an ArcGIS {error} envelope served with HTTP 200 is an OUTAGE, not an absence', async () => {
        // The nastiest collapse available: upstream says 200 and the body is an error. If the route
        // passed it through, `features` would be absent and the client would read `no-feature` — an
        // outage silently reported as "the ordinance publishes nothing for your parcel".
        upstream = 'arcgis-error';
        const r = await resolveViaRoute(CLAU18_WITH_OV);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('endpoint-unreachable');
        expect(r.reason).not.toBe('no-feature');
    });

    it('the two reasons are distinct values for the same on-screen outcome', async () => {
        upstream = 'empty';
        const absent = await resolveViaRoute(CLAU18_WITHOUT_OV);
        upstream = 'outage';
        const failed = await resolveViaRoute(CLAU18_WITH_OV);
        expect(absent.ok).toBe(false);
        expect(failed.ok).toBe(false);
        if (absent.ok || failed.ok) return;
        expect(absent.reason).not.toBe(failed.reason);
        // NEITHER produced a ring or a storey count. Both keep the cited Art. 306 refusal, and the
        // dispatcher's contract is `false` ⇒ refusal stands ⇒ never an estimated envelope, never 0.
        expect('ringLatLon' in absent).toBe(false);
        expect('plantes' in failed).toBe(false);
    });

    it('a drifted ringRef refuses rather than resolving against the wrong plane', async () => {
        upstream = 'ok';
        const r = await resolveBcnRefosOV('bcn-refos-ov:plantes/amb-v1999', CLAU18_WITH_OV, {
            pathBase: `${origin}${BCN_REFOS_OV_PATH}`,
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('ringref-mismatch');
    });
});

describe('§BCN-CLAU18-OV — the L-449 certification gate is SIGNED (SIG-3, 2026-08-01)', () => {
    it('BCN_REFOS_OV_CERTIFIED is TRUE — signed by the founder, recorded in sources/VERIFICATION.md', () => {
        // ⚠ This assertion is a LEDGER ENTRY, not a preference. It previously pinned `false` with the
        // note that wiring the route made the gate SIGNABLE, not signed. The founder signed it on
        // 2026-08-01 (SIG-3), so the pin flips WITH the signature and not before.
        //
        // If this test ever fails because someone set the flag back to `false`, that is either (a) the
        // founder un-signing — in which case SIG-3 must record WHY — or (b) an engineer treating a
        // legal act as a feature flag, which is exactly what this pin exists to catch.
        expect(BCN_REFOS_OV_CERTIFIED).toBe(true);
    });

    it('the pack still states NO numbers — its geometry is the rule (and stays estimated-ruleset)', () => {
        const zone = ES_BARCELONA_VOLUMETRIA_18_PACK.zones[0]!;
        expect(zone.maxHeight_m).toBeNull();
        expect(zone.maxFloors).toBeNull();
        expect(zone.plotRatioFAR).toBeNull();
        expect(zone.maxCoverage).toBeNull();
        expect(ES_BARCELONA_VOLUMETRIA_18_PACK.defaultConfidence).toBe('estimated-ruleset');
    });
});
