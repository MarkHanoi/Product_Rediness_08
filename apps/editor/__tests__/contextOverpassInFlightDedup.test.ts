// @vitest-environment node
//
// §L-323 FIX B (SS-FIX-FORMA-SITE-SINGLE-EXPORT-AND-CONTEXT-CACHE) — the context roads + water
// loaders now share ONE in-flight Overpass request per bbox (mirroring the buildings loader), so
// concurrent consumers (the 3D Forma context + the 2D map context, or a rapid globe↔forma
// re-entry) dedupe to a single POST instead of racing duplicates that feed the public mirrors'
// 429 rate limiter. These tests make that FALSIFIABLE without any network: a deferred stub `fetch`
// keeps the FIRST request in-flight while a SECOND concurrent load is issued, then asserts exactly
// ONE same-origin proxy call was made and both callers received the SAME shared collection.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchContextRoads } from '../src/ui/geospatial/contextRoads';
import { fetchContextWater } from '../src/ui/geospatial/contextWater';
import { OVERPASS_PROXY_ENDPOINT } from '../src/ui/geospatial/contextBuildings';

/** A stub `fetch` that stays in-flight (for the same-origin proxy) until `release()` is called,
 *  so two concurrent loads genuinely overlap. Counts the proxy calls. */
function makeDeferredProxyFetch() {
    let releaseBody: () => void = () => {};
    const released = new Promise<void>((r) => { releaseBody = r; });
    const proxyCalls: string[] = [];
    const fetchMock = vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes(OVERPASS_PROXY_ENDPOINT)) {
            proxyCalls.push(u);
            await released; // remain in-flight so the second concurrent call overlaps
            return { ok: true, json: async () => ({ elements: [] }) } as unknown as Response;
        }
        // Direct-mirror fallback — never reached while the proxy returns ok.
        return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
    });
    return { fetchMock, proxyCalls, release: () => releaseBody() };
}

// A site unlikely to collide with any other test's in-memory cache key.
const LAT = 41.3907;
const LON = 2.1610;

afterEach(() => vi.restoreAllMocks());

describe('§L-323 FIX B — one in-flight Overpass request per bbox (roads + water)', () => {
    it('roads: two concurrent loads for the same site issue exactly ONE proxy fetch', async () => {
        const { fetchMock, proxyCalls, release } = makeDeferredProxyFetch();
        vi.stubGlobal('fetch', fetchMock);

        const a = fetchContextRoads(LAT, LON);
        const b = fetchContextRoads(LAT, LON); // overlaps `a` while it is still in-flight
        release();
        const [ra, rb] = await Promise.all([a, b]);

        expect(proxyCalls.length).toBe(1); // deduped — not two duplicate POSTs
        expect(ra).toBe(rb);               // both got the SAME shared collection instance
    });

    it('water: two concurrent loads for the same site issue exactly ONE proxy fetch', async () => {
        const { fetchMock, proxyCalls, release } = makeDeferredProxyFetch();
        vi.stubGlobal('fetch', fetchMock);

        const a = fetchContextWater(LAT, LON);
        const b = fetchContextWater(LAT, LON);
        release();
        const [ra, rb] = await Promise.all([a, b]);

        expect(proxyCalls.length).toBe(1);
        expect(ra).toBe(rb);
    });
});
