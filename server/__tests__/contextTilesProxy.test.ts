// §CTX-TILES-PROXY (L-578) — tests for the same-origin context-tile passthrough.
//
// The load-bearing assertion is RANGE FORWARDING. PMTiles reads a byte range per tile; a proxy
// that dropped `Range` would still return correct bytes and pass any naive test, while turning
// every tile read into a full 19 MB download — correct and catastrophic at the same time, which
// is the exact shape of failure this subsystem keeps getting bitten by.

import { describe, it, expect, vi } from 'vitest';
import {
    makeContextTilesHandler,
    CONTEXT_TILE_LAYERS,
    CONTEXT_TILES_PATH,
// @ts-expect-error — the proxy is plain JS (server modules are not TS in this tree).
} from '../contextTilesProxy.js';

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

    it('marks the response cacheable — a given bake is immutable', async () => {
        const handler = makeContextTilesHandler({ fetch: async () => upstreamResponse() });
        const res = makeRes();
        await handler({ params: { layer: 'parks' }, headers: {} }, res);
        expect(res.headers['cache-control']).toContain('max-age=86400');
    });

    it('exposes the route prefix the client composes against', () => {
        expect(CONTEXT_TILES_PATH).toBe('/api/context-tiles');
    });
});
