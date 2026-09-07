// §CTX-TILES-PROXY (L-578) — tests for the same-origin context-tile passthrough.
//
// The load-bearing assertion is RANGE FORWARDING. PMTiles reads a byte range per tile; a proxy
// that dropped `Range` would still return correct bytes and pass any naive test, while turning
// every tile read into a full 19 MB download — correct and catastrophic at the same time, which
// is the exact shape of failure this subsystem keeps getting bitten by.

import { describe, it, expect, vi } from 'vitest';
import {
    makeContextTilesHandler,
    makeContextTilesManifestHandler,
    CONTEXT_TILE_LAYERS,
    CONTEXT_TILES_PATH,
    CONTEXT_TILES_MANIFEST_FILE,
// @ts-expect-error — the proxy is plain JS (server modules are not TS in this tree).
} from '../context-delivery/contextTilesProxy.js';

/** Minimal Express-ish res double. */
function makeRes() {
    const res = {
        statusCode: 200,
        headers: {},
        body: null,
        ended: false,
        status(c) { this.statusCode = c; return this; },
        setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
        json(o) { this.body = o; this.ended = true; return this; },
        end(b) { if (b !== undefined) this.body = b; this.ended = true; return this; },
    };
    return res;
}

function upstreamResponse({ status = 206, headers = {}, bytes = new Uint8Array([1, 2, 3]) } = {}) {
    const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return {
        status,
        body: bytes,
        headers: { get: (k) => h.get(k.toLowerCase()) ?? null },
        arrayBuffer: async () => bytes.buffer,
    };
}

describe('context tiles proxy', () => {
    it('⚠ FORWARDS the Range header — the whole reason a byte-range proxy is viable', async () => {
        const fetchImpl = vi.fn(async () => upstreamResponse());
        const handler = makeContextTilesHandler({ fetch: fetchImpl });
        const res = makeRes();
        await handler({ params: { layer: 'buildings.pmtiles' }, headers: { range: 'bytes=0-127' } }, res);

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [, init] = fetchImpl.mock.calls[0];
        expect(init.headers.Range).toBe('bytes=0-127');
    });

    it('passes 206 through rather than collapsing it to 200', async () => {
        // Collapsing 206 → 200 would break the client's range accounting silently.
        const handler = makeContextTilesHandler({
            fetch: async () => upstreamResponse({ status: 206, headers: { 'content-range': 'bytes 0-127/19166216' } }),
        });
        const res = makeRes();
        await handler({ params: { layer: 'buildings' }, headers: { range: 'bytes=0-127' } }, res);
        expect(res.statusCode).toBe(206);
        expect(res.headers['content-range']).toBe('bytes 0-127/19166216');
    });

    it('resolves the layer with or without the .pmtiles suffix', async () => {
        const fetchImpl = vi.fn(async () => upstreamResponse());
        const handler = makeContextTilesHandler({ fetch: fetchImpl, upstream: 'https://x.test/tiles/' });
        await handler({ params: { layer: 'roads' }, headers: {} }, makeRes());
        await handler({ params: { layer: 'roads.pmtiles' }, headers: {} }, makeRes());
        expect(fetchImpl.mock.calls[0][0]).toBe('https://x.test/tiles/roads.pmtiles');
        expect(fetchImpl.mock.calls[1][0]).toBe('https://x.test/tiles/roads.pmtiles');
    });

    it('serves every baked layer', async () => {
        const fetchImpl = vi.fn(async () => upstreamResponse());
        const handler = makeContextTilesHandler({ fetch: fetchImpl });
        for (const layer of CONTEXT_TILE_LAYERS) {
            const res = makeRes();
            await handler({ params: { layer }, headers: {} }, res);
            expect(res.statusCode).toBe(206);
        }
    });

    it('⚠ REFUSES anything not on the allowlist — this route must not be an open proxy', async () => {
        const fetchImpl = vi.fn(async () => upstreamResponse());
        const handler = makeContextTilesHandler({ fetch: fetchImpl });
        for (const bad of ['../secrets', 'items/Sofas/sofa/model.glb', 'buildings/../../etc', 'anything']) {
            const res = makeRes();
            await handler({ params: { layer: bad }, headers: {} }, res);
            expect(res.statusCode).toBe(404);
        }
        // Nothing reached the network at all.
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('reports an upstream failure as a STATUS, never as an empty success', async () => {
        // §CONTEXT-DATA-HONESTY — an unreadable tile and an empty tile must not be the same answer.
        const handler = makeContextTilesHandler({ fetch: async () => { throw new Error('socket hang up'); } });
        const res = makeRes();
        await handler({ params: { layer: 'buildings' }, headers: {} }, res);
        expect(res.statusCode).toBe(502);
    });

    it('maps an upstream timeout to 504, distinctly from a connection failure', async () => {
        const handler = makeContextTilesHandler({
            fetch: async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; },
        });
        const res = makeRes();
        await handler({ params: { layer: 'water' }, headers: {} }, res);
        expect(res.statusCode).toBe(504);
    });

    it('§L-580-CACHE caches, but REVALIDATES — the tiles are not immutable under this URL', async () => {
        // A re-bake REPLACES `<layer>.pmtiles` in place. The first version of this header used
        // `max-age=86400, stale-while-revalidate=604800`, which would have served the OLD tileset
        // for a day — up to a WEEK while revalidating — after a bake that fixed real coverage
        // (L-580 raised Gòtic 79% → 121%). A stale cache that looks like a broken fix is the same
        // class of misleading-green as the rest of this subsystem's history.
        const handler = makeContextTilesHandler({ fetch: async () => upstreamResponse() });
        const res = makeRes();
        await handler({ params: { layer: 'parks' }, headers: {} }, res);
        expect(res.headers['cache-control']).toContain('must-revalidate');
        expect(res.headers['cache-control']).not.toContain('stale-while-revalidate');
    });

    it('exposes the route prefix the client composes against', () => {
        expect(CONTEXT_TILES_PATH).toBe('/api/context-tiles');
    });

    it('⭐ FORWARDS canopy instead of refusing it — our own 404 is not the upstream\'s', async () => {
        // §CTX-MANIFEST-KNOWN-MISSING (L-13111). `canopy` reached the client's ContextTileLayer union
        // with §VEG-REAL-CANOPY-BAKE (L-12935) and never reached this allowlist, so a canopy read got
        // OUR 404 — indistinguishable, client-side, from "never baked". Measured against production
        // 2026-09-07, and the SIZE is the tell because both answers are a bare 404:
        //   canopy.pmtiles    → 404 in 205 ms, 38 bytes    (`{"error":"unknown context tile layer"}` — OURS)
        //   furniture.pmtiles → 404 in 436 ms, 27150 bytes (R2's)
        // This does not make canopy render. It makes its absence attributable to the bake.
        const fetchImpl = vi.fn(async () => upstreamResponse());
        const handler = makeContextTilesHandler({ fetch: fetchImpl, upstream: 'https://x.test/tiles/' });
        const res = makeRes();
        await handler({ params: { layer: 'canopy' }, headers: {} }, res);
        expect(fetchImpl.mock.calls[0][0]).toBe('https://x.test/tiles/canopy.pmtiles');
        expect(res.statusCode).toBe(206);
    });
});

// ── §CTX-MANIFEST-KNOWN-MISSING (L-13111, lane STARTUP-FIX 2026-09-07) ────────────────────────
//
// ⭐ THIS ROUTE IS THE UNBLOCK, NOT AN OPTIMISATION. L-13111's cure — read the tileset manifest once
// and skip the archive-header probe for layers it does not name — was recorded as SOUND and NOT
// SHIPPED, because the client could not reach the artefact: `VITE_CONTEXT_TILES_URL` is deployed as
// this same-origin proxy (L-776), the `:layer` handler is an ALLOWLIST, and `tileset-manifest.json`
// is not a layer. Measured against production 2026-09-07, before this route existed:
//     https://pub-…r2.dev/tiles/tileset-manifest.json               → 200, 24,279 B, 196 ms
//     https://app.pryzm.so/api/context-tiles/tileset-manifest.json  → 404,     38 B, 242 ms
// The live manifest names `layers = [buildings, landuse, parks, rail, roads, trees, water]` — the
// seven that answer, and none of `canopy` / `sea` / `furniture`, which are the three that 404.
describe('§CTX-MANIFEST-KNOWN-MISSING — the tileset manifest route', () => {
    const jsonUpstream = ({ status = 200, headers = {}, text = '{"layers":{"buildings":{}}}' } = {}) => {
        const bytes = new TextEncoder().encode(text);
        const h = new Map(Object.entries({ 'content-type': 'application/json', ...headers })
            .map(([k, v]) => [k.toLowerCase(), v]));
        return { status, body: bytes, headers: { get: (k) => h.get(k.toLowerCase()) ?? null }, arrayBuffer: async () => bytes.buffer };
    };

    it('fetches tileset-manifest.json from the upstream base, beside the tiles', async () => {
        const fetchImpl = vi.fn(async () => jsonUpstream());
        const handler = makeContextTilesManifestHandler({ fetch: fetchImpl, upstream: 'https://x.test/tiles/' });
        const res = makeRes();
        await handler({ headers: {} }, res);
        expect(fetchImpl.mock.calls[0][0]).toBe('https://x.test/tiles/tileset-manifest.json');
        expect(res.statusCode).toBe(200);
        expect(new TextDecoder().decode(res.body)).toContain('buildings');
    });

    it('⛔ does NOT cache the manifest for an hour — a per-layer merge rewrites it in place', async () => {
        // The tiles carry `max-age=3600, must-revalidate` (§L-580-CACHE). Applying that here would
        // suppress a layer for an hour AFTER the publish that landed it — the same mistake with a
        // worse blast radius, because it hides a whole layer rather than serving a stale one. The
        // publish sets `no-cache` on this object for exactly that reason; we forward it.
        const handler = makeContextTilesManifestHandler({ fetch: async () => jsonUpstream({ headers: { 'cache-control': 'no-cache' } }) });
        const res = makeRes();
        await handler({ headers: {} }, res);
        expect(res.headers['cache-control']).toBe('no-cache');
        expect(res.headers['cache-control']).not.toContain('max-age=3600');
    });

    it('defaults to no-cache when the upstream states nothing', async () => {
        const handler = makeContextTilesManifestHandler({ fetch: async () => jsonUpstream({ headers: { 'cache-control': undefined } }) });
        const res = makeRes();
        await handler({ headers: {} }, res);
        expect(res.headers['cache-control']).toBe('no-cache');
    });

    it('reports an upstream failure as a STATUS — the client then probes exactly as before', async () => {
        // ⛔ FAILING OPEN IS THE CONTRACT (§CONTEXT-DATA-HONESTY). An unreadable manifest must cost
        // the client nothing but the probes it was already paying; it must never seed an absence.
        const handler = makeContextTilesManifestHandler({ fetch: async () => { throw new Error('socket hang up'); } });
        const res = makeRes();
        await handler({ headers: {} }, res);
        expect(res.statusCode).toBe(502);
    });

    it('maps an upstream timeout to 504, distinctly from a connection failure', async () => {
        const handler = makeContextTilesManifestHandler({
            fetch: async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; },
        });
        const res = makeRes();
        await handler({ headers: {} }, res);
        expect(res.statusCode).toBe(504);
    });

    it('passes a 404 straight through — before this route, WE were the 404', async () => {
        const handler = makeContextTilesManifestHandler({ fetch: async () => jsonUpstream({ status: 404, text: 'nope' }) });
        const res = makeRes();
        await handler({ headers: {} }, res);
        expect(res.statusCode).toBe(404);
    });

    it('names the file the merge publishes, so the client and the bake cannot drift', () => {
        expect(CONTEXT_TILES_MANIFEST_FILE).toBe('tileset-manifest.json');
        // ⚠ And it is NOT a tile layer. `CONTEXT_TILE_LAYERS` means "an archive a PMTiles RANGE
        // reader may ask for"; the manifest is a whole small JSON document. Putting it on that list
        // would make the range-read case above try to byte-range a JSON file.
        expect(CONTEXT_TILE_LAYERS).not.toContain(CONTEXT_TILES_MANIFEST_FILE);
    });
});
