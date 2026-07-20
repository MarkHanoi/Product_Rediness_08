// §OVERPASS-PROXY — /api/overpass same-origin proxy + shared-cache tests.
//
// Pins the three behaviours the founder's context-render reliability depends on:
//   1. CACHE MISS → forwards to the mirrors once, returns the upstream JSON, and
//      stores it (X-Overpass-Cache: MISS).
//   2. CACHE HIT  → a second identical query is served from the shared cache WITHOUT
//      a second upstream call (X-Overpass-Cache: HIT). This is what dodges the
//      per-browser 429 across demo reloads.
//   3. UPSTREAM FAILURE (all mirrors down/429) → NEVER crashes: answers 200
//      { elements: [] } so the client's non-fatal "no context" path still renders.
//   + an empty query → 400.

import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import {
    OVERPASS_PATH,
    overpassBodyParser,
    makeOverpassHandler,
    fetchFromMirrors,
    overpassCacheStats,
    __resetOverpassCache,
} from '../overpassProxy.js';

function listen(app: express.Express): Promise<{ server: Server; url: string }> {
    return new Promise((resolve) => {
        const server = createServer(app);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as AddressInfo;
            resolve({ server, url: `http://127.0.0.1:${port}` });
        });
    });
}
const close = (s: Server) => new Promise<void>((r) => s.close(() => r()));

/** A fake `fetch` that records call counts and can be scripted per-response. */
function makeFakeFetch(script: () => Response | Promise<Response>) {
    let calls = 0;
    const fn = (async () => { calls++; return script(); }) as unknown as typeof fetch;
    return { fetch: fn, get calls() { return calls; } };
}

const QUERY = '[out:json][timeout:25];(way["building"](1,2,3,4););out geom;';

describe('§OVERPASS-PROXY /api/overpass', () => {
    let server: Server, url: string;
    let fake: ReturnType<typeof makeFakeFetch>;

    beforeAll(async () => {
        const app = express();
        // A single injectable fetch shared by the handler across a test; each test
        // resets `fake` via a closure indirection.
        const handler = makeOverpassHandler({
            fetchImpl: ((...args: Parameters<typeof fetch>) => fake.fetch(...args)) as typeof fetch,
            mirrors: ['https://mirror-a.example/api/interpreter', 'https://mirror-b.example/api/interpreter'],
            timeoutMs: 2000,
            backoffMs: 0, // L-422 — no real sleep between retries in tests (keep call-count assertions instant).
        });
        app.post(OVERPASS_PATH, overpassBodyParser, handler);
        const a = await listen(app);
        server = a.server; url = a.url;
    });
    afterAll(async () => { await close(server); });
    beforeEach(() => __resetOverpassCache());

    const post = (body: string, ct = 'application/x-www-form-urlencoded') =>
        fetch(`${url}${OVERPASS_PATH}`, { method: 'POST', headers: { 'Content-Type': ct }, body });

    it('cache MISS forwards to the mirror and returns upstream JSON', async () => {
        fake = makeFakeFetch(() => new Response(JSON.stringify({ elements: [{ type: 'way', id: 1 }] }), { status: 200 }));
        const r = await post('data=' + encodeURIComponent(QUERY));
        expect(r.status).toBe(200);
        expect(r.headers.get('x-overpass-cache')).toBe('MISS');
        const body = await r.json();
        expect(body.elements).toHaveLength(1);
        expect(fake.calls).toBe(1);
    });

    it('cache HIT serves the same query WITHOUT a second upstream call', async () => {
        fake = makeFakeFetch(() => new Response(JSON.stringify({ elements: [{ type: 'way', id: 7 }] }), { status: 200 }));
        // First call primes the cache (MISS, 1 upstream call).
        const r1 = await post('data=' + encodeURIComponent(QUERY));
        expect(r1.headers.get('x-overpass-cache')).toBe('MISS');
        expect(fake.calls).toBe(1);
        // Second identical call is served from the shared cache — no new upstream call.
        const r2 = await post('data=' + encodeURIComponent(QUERY));
        expect(r2.status).toBe(200);
        expect(r2.headers.get('x-overpass-cache')).toBe('HIT');
        expect(fake.calls).toBe(1); // <-- did NOT hit the mirror again
        const body = await r2.json();
        expect(body.elements[0].id).toBe(7);
        expect(overpassCacheStats().hits).toBe(1);
    });

    it('all-mirrors-failed → 200 { elements: [] } (never crashes)', async () => {
        // Every attempt 429s → both mirrors × 2 attempts exhaust → null → empty.
        fake = makeFakeFetch(() => new Response('rate limited', { status: 429 }));
        const r = await post('data=' + encodeURIComponent('[out:json];(way(1,2,3,4););out geom;'));
        expect(r.status).toBe(200);
        expect(r.headers.get('x-overpass-cache')).toBe('MISS-EMPTY');
        const body = await r.json();
        expect(body.elements).toEqual([]);
        // 2 mirrors × 2 attempts (initial + retry) each = 4 upstream calls.
        expect(fake.calls).toBe(4);
    });

    // ─────────────────────────────────────────────────────────────────────────────────────
    // §OVERPASS-NO-CACHE-EMPTY (L-422 root cause) — a FAILURE MUST NEVER BE CACHEABLE.
    //
    // The empty-on-failure response is deliberate (the client degrades to "no context"), but it
    // was sent with the SUCCESS headers `public, max-age=86400`. The server correctly declined
    // to cache it — and then told the BROWSER to cache it for a day. One transient rate-limit
    // became a persistent whole-day zero-context, and because an empty body is indistinguishable
    // from a legitimately empty area it read as data absence rather than failure.
    //
    // Live evidence: for the Barcelona port bbox the app logged parks 0 / water 0 / buildings 0
    // while a direct Overpass query on the SAME bbox returned 20 water ways.
    // ─────────────────────────────────────────────────────────────────────────────────────
    it('L-422 — the FAILURE response is NOT cacheable by the browser', async () => {
        fake = makeFakeFetch(() => new Response('rate limited', { status: 429 }));
        const r = await post('data=' + encodeURIComponent('[out:json];(way(9,9,9,9););out geom;'));
        const cc = r.headers.get('cache-control') ?? '';
        expect(cc).toContain('no-store');
        expect(cc).not.toContain('max-age=86400');
        // The whole point: a transient failure must not survive as a cached "empty area".
        expect(cc).not.toMatch(/public/);
    });

    it('L-422 — the failure is machine-distinguishable from a genuinely empty area', async () => {
        fake = makeFakeFetch(() => new Response('rate limited', { status: 429 }));
        const r = await post('data=' + encodeURIComponent('[out:json];(way(8,8,8,8););out geom;'));
        expect(r.headers.get('x-overpass-upstream')).toBe('FAILED');
        const body = await r.json();
        expect(body._upstreamFailed).toBe(true);
        // Back-compat: every existing client parse path reads `elements`, which is still there.
        expect(body.elements).toEqual([]);
    });

    it('L-422 — a SUCCESSFUL response is still long-cacheable (the fix is failure-only)', async () => {
        const payload = JSON.stringify({ elements: [{ type: 'way', id: 1 }] });
        fake = makeFakeFetch(() => new Response(payload, { status: 200 }));
        const r = await post('data=' + encodeURIComponent('[out:json];(way(7,7,7,7););out geom;'));
        const cc = r.headers.get('cache-control') ?? '';
        expect(cc).toContain('max-age=86400');
        expect(cc).not.toContain('no-store');
        expect(r.headers.get('x-overpass-upstream')).toBeNull();
    });

    // §OVERPASS-NO-LONG-CACHE-EMPTY (L-467) — ⚠ THIS TEST'S ASSERTION WAS DELIBERATELY INVERTED.
    //
    // It previously asserted that a zero-element 200 "stays cacheable" for 24 h, on the stated
    // reasoning that "a genuinely empty area is a real, cacheable answer — or every empty rural
    // bbox would re-query Overpass forever". The CONCERN is right and is still honoured below.
    // The ASSERTION was the defect: Overpass mirrors under load answer 200-with-empty rather than
    // 429, so a 24 h cache turned one blip into a full day of "central Barcelona has no
    // buildings" — server-side, shared by every client, surviving hard-refresh. That is the
    // founder-reported bug, and L-457 could not have caught it: it fixed the BROWSER caching a
    // FAILED response, while this is the SERVER caching an EMPTY SUCCESSFUL one.
    //
    // The new contract: an empty answer is cached BRIEFLY (minutes, not a day) — we do not yet
    // trust the emptiness, which is exactly true — so a poisoned empty heals itself, and a
    // genuinely rural bbox still is not re-queried on every render.
    it('L-467 — an EMPTY upstream result is cached only BRIEFLY, never for 24 h', async () => {
        const payload = JSON.stringify({ elements: [] });
        fake = makeFakeFetch(() => new Response(payload, { status: 200 }));
        const r = await post('data=' + encodeURIComponent('[out:json];(way(6,6,6,6););out geom;'));
        const cc = r.headers.get('cache-control') ?? '';
        // The whole point: NOT durable.
        expect(cc).not.toContain('max-age=86400');
        // Distinct from the all-mirrors-failed marker — upstream DID answer.
        expect(r.headers.get('x-overpass-upstream')).toBe('EMPTY-UNVERIFIED');
        const body = await r.json();
        expect(body._upstreamFailed).toBeUndefined();   // not a failure, just not trusted yet
    });

    it('L-467 — the rural concern still holds: a repeat empty query is served from cache', async () => {
        // The original test's reasoning, preserved as an assertion rather than a comment: we must
        // not re-hit a shared public endpoint on every render for a legitimately empty bbox
        // (C57 §7.2). One upstream call, two requests.
        let upstreamCalls = 0;
        const payload = JSON.stringify({ elements: [] });
        fake = makeFakeFetch(() => { upstreamCalls++; return new Response(payload, { status: 200 }); });
        const q = 'data=' + encodeURIComponent('[out:json];(way(5,5,5,5););out geom;');
        await post(q);
        await post(q);
        expect(upstreamCalls).toBe(1);
    });

    // §OVERPASS-REMARK-IS-AN-ERROR (L-469) — Overpass reports server-side failure IN-BAND:
    // HTTP 200, `elements: []`, and a `remark`. There is no error status to check. Nothing in
    // the stack read that field, so a query timeout over a dense city was indistinguishable from
    // "this area genuinely has no buildings" — and it bites hardest exactly where the product is
    // most valuable, because the denser the fabric the likelier the query exceeds its budget.
    const TIMEOUT_REMARK =
        'runtime error: Query timed out in "query" at line 1 after 25 seconds.';

    it('L-469 — a 200 carrying a remark and ZERO elements is a FAILURE, not an answer', async () => {
        fake = makeFakeFetch(() =>
            new Response(JSON.stringify({ elements: [], remark: TIMEOUT_REMARK }), { status: 200 }));
        const r = await post('data=' + encodeURIComponent('[out:json];(way(1,1,1,1););out geom;'));
        // Still 200 to the client (the non-fatal degrade path is deliberate) — but now flagged.
        expect(r.status).toBe(200);
        expect(r.headers.get('x-overpass-upstream')).toBe('FAILED');
        const body = await r.json();
        expect(body._upstreamFailed).toBe(true);
        // MUST NOT be long-cached: a timeout is transient, and caching it would repeat L-467.
        expect(r.headers.get('cache-control') ?? '').not.toContain('max-age=86400');
    });

    it('L-469 — a remark response does NOT short-circuit the mirror cascade', async () => {
        // The subtler half: returning the remark body as "the winner" also stopped us trying a
        // healthier mirror. Both mirrors must be attempted before we give up.
        let calls = 0;
        fake = makeFakeFetch(() => {
            calls++;
            return new Response(JSON.stringify({ elements: [], remark: TIMEOUT_REMARK }), { status: 200 });
        });
        await post('data=' + encodeURIComponent('[out:json];(way(2,2,2,2););out geom;'));
        // 2 mirrors x (1 attempt + 1 retry) = 4.
        expect(calls).toBeGreaterThanOrEqual(2);
    });

    it('L-469 — a second mirror that ANSWERS still wins after the first remarks', async () => {
        let calls = 0;
        fake = makeFakeFetch(() => {
            calls++;
            return calls <= 2
                ? new Response(JSON.stringify({ elements: [], remark: TIMEOUT_REMARK }), { status: 200 })
                : new Response(JSON.stringify({ elements: [{ type: 'way', id: 7 }] }), { status: 200 });
        });
        const r = await post('data=' + encodeURIComponent('[out:json];(way(3,3,3,3););out geom;'));
        const body = await r.json();
        expect(body.elements).toHaveLength(1);
        expect(body._upstreamFailed).toBeUndefined();
    });

    it('L-469 — ⚠ a remark alongside REAL results is NOT discarded', async () => {
        // The over-correction guard. Overpass also emits informational remarks next to genuine
        // data; throwing those answers away would be the same defect in the opposite direction.
        fake = makeFakeFetch(() =>
            new Response(
                JSON.stringify({ elements: [{ type: 'way', id: 42 }], remark: 'some informational note' }),
                { status: 200 },
            ));
        const r = await post('data=' + encodeURIComponent('[out:json];(way(4,4,4,4););out geom;'));
        const body = await r.json();
        expect(body.elements).toHaveLength(1);
        expect(body._upstreamFailed).toBeUndefined();
    });

    it('empty query → 400', async () => {
        fake = makeFakeFetch(() => new Response('{}', { status: 200 }));
        const r = await post('data=');
        expect(r.status).toBe(400);
        expect(fake.calls).toBe(0);
    });
});

describe('§OVERPASS-PROXY fetchFromMirrors — mirror fallback', () => {
    it('falls through a 429 mirror to the next mirror that answers 2xx', async () => {
        let calls = 0;
        const fetchImpl = (async (endpoint: string) => {
            calls++;
            // mirror-a always 429s (2 attempts), mirror-b answers on its first try.
            if (String(endpoint).includes('mirror-a')) return new Response('429', { status: 429 });
            return new Response(JSON.stringify({ elements: [{ id: 42 }] }), { status: 200 });
        }) as unknown as typeof fetch;

        const text = await fetchFromMirrors('q', {
            fetchImpl,
            mirrors: ['https://mirror-a.example/api/interpreter', 'https://mirror-b.example/api/interpreter'],
            timeoutMs: 1000,
        });
        expect(text).not.toBeNull();
        expect(JSON.parse(text as string).elements[0].id).toBe(42);
        // mirror-a: 2 attempts (429 + retry) + mirror-b: 1 → 3 calls.
        expect(calls).toBe(3);
    });

    it('returns null when every mirror fails', async () => {
        const fetchImpl = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
        const text = await fetchFromMirrors('q', {
            fetchImpl,
            mirrors: ['https://mirror-a.example/api/interpreter'],
            timeoutMs: 500,
        });
        expect(text).toBeNull();
    });
});
