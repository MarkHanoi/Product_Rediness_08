// §PARCEL-SELECT (L-380 P0/P1) — CatastroParcelProvider client tests.
//
// The provider is a thin fetch+parse of the same-origin proxy JSON. We pin:
//   1. parseProxyResponse — { parcel: {...} } → ParcelFeature (ring/refcat/area/src).
//   2. fetchParcelAtPoint — mocks the proxy fetch → returns a ParcelFeature.
//   3. Graceful misses — { parcel: null }, network error, non-OK, bad JSON → null
//      (never throws — the map falls back to manual draw).

import { describe, expect, it, vi, afterEach } from 'vitest';
import {
    catastroParcelProvider,
    parseProxyResponse,
} from '../src/ui/site/parcel/CatastroParcelProvider.js';

const PROXY_OK = {
    parcel: {
        ring: [
            { lat: 41.392927, lon: 2.165278 },
            { lat: 41.392908, lon: 2.165304 },
            { lat: 41.392889, lon: 2.165329 },
            { lat: 41.392800, lon: 2.165200 },
        ],
        refcat: '0229720DF3802G',
        areaM2: 1046,
        address: 'PS GRACIA 56 BARCELONA (BARCELONA)',
        source: 'catastro',
    },
};

function mockFetch(response: unknown, { ok = true, status = 200, throwErr = false, badJson = false } = {}) {
    const impl = vi.fn(async () => {
        if (throwErr) throw new Error('network down');
        return {
            ok,
            status,
            statusText: ok ? 'OK' : 'ERR',
            json: async () => {
                if (badJson) throw new Error('not json');
                return response;
            },
        } as unknown as Response;
    });
    vi.stubGlobal('fetch', impl);
    return impl;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('parseProxyResponse', () => {
    it('maps a proxy hit → ParcelFeature', () => {
        const f = parseProxyResponse(PROXY_OK);
        expect(f).not.toBeNull();
        expect(f!.refcat).toBe('0229720DF3802G');
        expect(f!.areaM2).toBe(1046);
        expect(f!.ring).toHaveLength(4);
        expect(f!.ring[0]).toEqual({ lat: 41.392927, lon: 2.165278 });
        expect(f!.source).toBe('catastro');
        expect(f!.address).toContain('PS GRACIA 56');
    });

    it('→ null on a miss { parcel: null } / malformed / < 3 vertices / no refcat', () => {
        expect(parseProxyResponse({ parcel: null })).toBeNull();
        expect(parseProxyResponse({})).toBeNull();
        expect(parseProxyResponse(null)).toBeNull();
        expect(parseProxyResponse({ parcel: { ring: [{ lat: 1, lon: 2 }], refcat: 'x' } })).toBeNull();
        expect(parseProxyResponse({ parcel: { ring: PROXY_OK.parcel.ring, refcat: '' } })).toBeNull();
    });

    it('drops non-finite vertices when parsing the ring', () => {
        const f = parseProxyResponse({
            parcel: { ...PROXY_OK.parcel, ring: [...PROXY_OK.parcel.ring, { lat: 'NaN', lon: null }] },
        });
        expect(f!.ring).toHaveLength(4); // the junk vertex is dropped
    });
});

describe('catastroParcelProvider.fetchParcelAtPoint', () => {
    it('resolves a ParcelFeature from the proxy', async () => {
        const impl = mockFetch(PROXY_OK);
        const f = await catastroParcelProvider.fetchParcelAtPoint(2.16492, 41.3925);
        expect(f).not.toBeNull();
        expect(f!.refcat).toBe('0229720DF3802G');
        // Hit the same-origin proxy route with the click coords.
        const calledUrl = String(impl.mock.calls[0]![0]);
        expect(calledUrl).toContain('/api/catastro/parcel');
        expect(calledUrl).toContain('lon=2.16492');
        expect(calledUrl).toContain('lat=41.3925');
    });

    it('→ null on a proxy miss without throwing', async () => {
        mockFetch({ parcel: null });
        await expect(catastroParcelProvider.fetchParcelAtPoint(2.16492, 41.3925)).resolves.toBeNull();
    });

    it('→ null on network error / non-OK / bad JSON / bad coords', async () => {
        mockFetch(PROXY_OK, { throwErr: true });
        await expect(catastroParcelProvider.fetchParcelAtPoint(2, 41)).resolves.toBeNull();
        mockFetch(PROXY_OK, { ok: false, status: 500 });
        await expect(catastroParcelProvider.fetchParcelAtPoint(2, 41)).resolves.toBeNull();
        mockFetch(PROXY_OK, { badJson: true });
        await expect(catastroParcelProvider.fetchParcelAtPoint(2, 41)).resolves.toBeNull();
        await expect(catastroParcelProvider.fetchParcelAtPoint(NaN, 41)).resolves.toBeNull();
    });
});
