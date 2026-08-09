// §CATALOG-R2-PROXY (L-578b) — tests for the furniture-catalogue passthrough.
//
// The security-critical assertion is the KEY GUARD. The object key comes straight from the URL,
// so without it this route is an open proxy to any key in the bucket, served from our hostname.
// The correctness-critical one is the CONTENT TYPE: R2 hands back octet-stream (or an HTML error
// page) and a GLTFLoader given the wrong type fails in a way that reads as a corrupt model rather
// than a transport problem — the same success-shaped failure this whole work stream keeps hitting.

import { describe, it, expect, vi } from 'vitest';
import {
    makeCatalogAssetHandler,
    isSafeCatalogKey,
    CATALOG_PROXY_PATH,
    CATALOG_ALLOWED_EXT,
// @ts-expect-error — the proxy is plain JS (server modules are not TS in this tree).
} from '../context-delivery/catalogAssetProxy.js';

function makeRes() {
    return {
        statusCode: 200,
        headers: {} as Record<string, string>,
        body: null as unknown,
        status(c: number) { this.statusCode = c; return this; },
        setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; return this; },
        json(o: unknown) { this.body = o; return this; },
        end(b?: unknown) { if (b !== undefined) this.body = b; return this; },
    };
}

function upstream({ status = 200, headers = {} as Record<string, string>, bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]) } = {}) {
    const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return {
        status,
        ok: status >= 200 && status < 300,
        body: bytes,
        headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null },
        arrayBuffer: async () => bytes.buffer,
    };
}

describe('catalogue key guard', () => {
    it('accepts the real catalogue shapes', () => {
        for (const k of [
            'Sofas/sofa/model.glb',
            'Sofas/lounge-chair/thumbnail.webp',
            'Tables/dining table (large)/model.glb',
            'Beds/bed_01/scene.gltf',
            'Beds/bed_01/buffer.bin',
        ]) expect(isSafeCatalogKey(k), k).toBe(true);
    });

    it('⚠ REFUSES traversal, absolute paths and non-catalogue keys — no open proxy', () => {
        for (const k of [
            '../secrets.json',
            'Sofas/../../etc/passwd',
            '/etc/passwd',
            '\\windows\\system32',
            'https://evil.test/x.glb',
            'tiles/buildings.pmtiles',   // a real bucket key, but not a catalogue asset
            'Sofas/sofa/model.exe',
            'Sofas/sofa/model',          // no extension
            '',
        ]) expect(isSafeCatalogKey(k), k).toBe(false);
    });

    it('refuses an absurdly long key', () => {
        expect(isSafeCatalogKey(`${'a/'.repeat(400)}x.glb`)).toBe(false);
    });

    it('never reaches the network for a rejected key', async () => {
        const fetchImpl = vi.fn(async () => upstream());
        const handler = makeCatalogAssetHandler({ fetch: fetchImpl });
        const res = makeRes();
        await handler({ params: { 0: '../../secret.glb' }, headers: {} }, res);
        expect(res.statusCode).toBe(404);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});

describe('catalogue proxy', () => {
    it('maps the logical path onto the bucket key', async () => {
        const fetchImpl = vi.fn(async () => upstream());
        const handler = makeCatalogAssetHandler({ fetch: fetchImpl, upstream: 'https://r2.test/items/' });
        await handler({ params: { 0: 'Sofas/sofa/model.glb' }, headers: {} }, makeRes());
        expect(fetchImpl.mock.calls[0][0]).toBe('https://r2.test/items/Sofas/sofa/model.glb');
    });

    it('⚠ sets the GLB content type itself rather than trusting the bucket', async () => {
        // R2 serves unknown extensions as octet-stream; a GLTFLoader given that reports a corrupt
        // model, which reads as a data problem rather than a transport one.
        const handler = makeCatalogAssetHandler({
            fetch: async () => upstream({ headers: { 'content-type': 'application/octet-stream' } }),
        });
        const res = makeRes();
        await handler({ params: { 0: 'Sofas/sofa/model.glb' }, headers: {} }, res);
        expect(res.headers['content-type']).toBe('model/gltf-binary');
    });

    it('types thumbnails correctly too', async () => {
        const handler = makeCatalogAssetHandler({ fetch: async () => upstream() });
        const res = makeRes();
        await handler({ params: { 0: 'Sofas/sofa/thumbnail.webp' }, headers: {} }, res);
        expect(res.headers['content-type']).toBe('image/webp');
    });

    it('forwards Range so a large model streams instead of re-downloading', async () => {
        const fetchImpl = vi.fn(async () => upstream({ status: 206 }));
        const handler = makeCatalogAssetHandler({ fetch: fetchImpl });
        await handler({ params: { 0: 'Sofas/sofa/model.glb' }, headers: { range: 'bytes=0-1023' } }, makeRes());
        expect(fetchImpl.mock.calls[0][1].headers.Range).toBe('bytes=0-1023');
    });

    it('⚠ does NOT pass an upstream error page through as if it were a model', async () => {
        // A 404 HTML body relayed with a model content-type is the success-shaped failure that
        // cost this subsystem four deploys. The status must survive.
        const handler = makeCatalogAssetHandler({
            fetch: async () => upstream({ status: 404, headers: { 'content-type': 'text/html' } }),
        });
        const res = makeRes();
        await handler({ params: { 0: 'Sofas/missing/model.glb' }, headers: {} }, res);
        expect(res.statusCode).toBe(404);
        expect(res.body).toBeNull();
    });

    it('reports transport failure as a status, distinguishing timeout from refusal', async () => {
        const dead = makeCatalogAssetHandler({ fetch: async () => { throw new Error('ECONNRESET'); } });
        const r1 = makeRes();
        await dead({ params: { 0: 'Sofas/sofa/model.glb' }, headers: {} }, r1);
        expect(r1.statusCode).toBe(502);

        const slow = makeCatalogAssetHandler({
            fetch: async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; },
        });
        const r2 = makeRes();
        await slow({ params: { 0: 'Sofas/sofa/model.glb' }, headers: {} }, r2);
        expect(r2.statusCode).toBe(504);
    });

    it('caches immutably — a catalogue object never changes under its key', async () => {
        const handler = makeCatalogAssetHandler({ fetch: async () => upstream() });
        const res = makeRes();
        await handler({ params: { 0: 'Sofas/sofa/model.glb' }, headers: {} }, res);
        expect(res.headers['cache-control']).toContain('immutable');
    });

    it('exposes the mount point the client base is built from', () => {
        expect(CATALOG_PROXY_PATH).toBe('/api/catalog/items');
        expect(CATALOG_ALLOWED_EXT).toContain('.glb');
    });
});
