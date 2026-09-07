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
    fetchParcelByRefcat,
    lookupParcelByRefcat,
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

// §WHERE-IS-YOUR-PROJECT (L-13057 item 4) — the SAME provider, reached by cadastral REFERENCE.
// These pin that it is the same route and the same parse (no second resolver), and that every
// failure mode still resolves to null rather than throwing into the onboarding step.
describe('fetchParcelByRefcat', () => {
    it('GETs the SAME same-origin route, keyed by refcat instead of by coordinates', async () => {
        const impl = mockFetch(PROXY_OK);
        const f = await fetchParcelByRefcat('0229720DF3802G');
        expect(f).not.toBeNull();
        expect(f!.refcat).toBe('0229720DF3802G');
        expect(f!.ring).toHaveLength(4);
        const calledUrl = String(impl.mock.calls[0]![0]);
        // ⚠ The route is the one the click path already uses — a second endpoint here would be
        // the "second resolver" this feature was explicitly not allowed to grow.
        expect(calledUrl).toContain('/api/catastro/parcel');
        expect(calledUrl).toContain('refcat=0229720DF3802G');
        expect(calledUrl).not.toContain('lat=');
    });

    it('upper-cases and trims what the user typed before asking', async () => {
        const impl = mockFetch(PROXY_OK);
        await fetchParcelByRefcat('  0229720df3802g ');
        expect(String(impl.mock.calls[0]![0])).toContain('refcat=0229720DF3802G');
    });

    it('→ null on an honest registry miss (the caller turns this into a REGISTRY-NAMED message)', async () => {
        mockFetch({ parcel: null, queriedRefcat: '0229720DF3802G' });
        await expect(fetchParcelByRefcat('0229720DF3802G')).resolves.toBeNull();
    });

    it('→ null on empty input / network error / non-OK / bad JSON, never throwing', async () => {
        const impl = mockFetch(PROXY_OK);
        await expect(fetchParcelByRefcat('   ')).resolves.toBeNull();
        expect(impl).not.toHaveBeenCalled(); // an empty field must not reach the registry at all
        mockFetch(PROXY_OK, { throwErr: true });
        await expect(fetchParcelByRefcat('0229720DF3802G')).resolves.toBeNull();
        mockFetch(PROXY_OK, { ok: false, status: 502 });
        await expect(fetchParcelByRefcat('0229720DF3802G')).resolves.toBeNull();
        mockFetch(PROXY_OK, { badJson: true });
        await expect(fetchParcelByRefcat('0229720DF3802G')).resolves.toBeNull();
    });
});


// §CADASTRAL-UNREACHABLE-IS-NOT-A-MISS (D-CAD-A, founder 2026-09-07: "make sure this works sound"
// about cadastral entry).
//
// ⭐ THE DEFECT THESE ARMS PIN. `fetchParcelByRefcat`'s doc comment has always said the caller
// "must not collapse those into one message" — and then returned a bare `null` for BOTH an honest
// Catastro miss and for offline / proxy 5xx / non-JSON, which made obeying it impossible. The
// onboarding panel therefore told a user with no network *"Catastro (Spain) has no parcel with
// reference … — check the reference"*: the product asserting a correct reference is wrong.
// Failure and empty are DIFFERENT VALUES (§CONTEXT-DATA-HONESTY, C57 §1.5).
describe('§CADASTRAL-UNREACHABLE-IS-NOT-A-MISS — lookupParcelByRefcat keeps the three outcomes apart', () => {
    it('a parcel is `ok`, and carries it', async () => {
        mockFetch(PROXY_OK);
        const r = await lookupParcelByRefcat('0229720DF3802G');
        expect(r.status).toBe('ok');
        expect(r.status === 'ok' && r.parcel.refcat).toBe('0229720DF3802G');
    });

    it('a 200 that parses to no parcel is `miss` — Catastro was ASKED and answered', async () => {
        mockFetch({ parcel: null, queriedRefcat: '0229720DF3802G' });
        await expect(lookupParcelByRefcat('0229720DF3802G')).resolves.toEqual({ status: 'miss' });
    });

    it('⛔ offline / proxy 5xx / non-JSON are `unreachable`, NEVER `miss` — this is the defect', async () => {
        mockFetch(PROXY_OK, { throwErr: true });
        const net = await lookupParcelByRefcat('0229720DF3802G');
        expect(net.status).toBe('unreachable');
        expect(net.status === 'unreachable' && net.reason).toContain('network error');

        mockFetch(PROXY_OK, { ok: false, status: 502 });
        const bad = await lookupParcelByRefcat('0229720DF3802G');
        expect(bad.status).toBe('unreachable');
        expect(bad.status === 'unreachable' && bad.reason).toContain('502');

        mockFetch(PROXY_OK, { badJson: true });
        const nj = await lookupParcelByRefcat('0229720DF3802G');
        expect(nj.status).toBe('unreachable');
        expect(nj.status === 'unreachable' && nj.reason).toContain('not JSON');
    });

    it('an empty field never reaches the registry, and is not reported as unreachable', async () => {
        const impl = mockFetch(PROXY_OK);
        await expect(lookupParcelByRefcat('   ')).resolves.toEqual({ status: 'miss' });
        expect(impl).not.toHaveBeenCalled();
    });

    it('never throws on any of the four failure modes', async () => {
        for (const opts of [{ throwErr: true }, { ok: false, status: 502 }, { badJson: true }] as const) {
            mockFetch(PROXY_OK, opts);
            await expect(lookupParcelByRefcat('0229720DF3802G')).resolves.toBeTruthy();
        }
    });

    it('⚠ the OLD `fetchParcelByRefcat` shape is unchanged — every existing caller and test still reads null', async () => {
        // The narrowing is ADDITIVE. The bare-`null` function stays exactly as documented, so the
        // map-click path and this file's own older arms are untouched.
        mockFetch({ parcel: null, queriedRefcat: 'X' });
        await expect(fetchParcelByRefcat('0229720DF3802G')).resolves.toBeNull();
        mockFetch(PROXY_OK, { ok: false, status: 502 });
        await expect(fetchParcelByRefcat('0229720DF3802G')).resolves.toBeNull();
        mockFetch(PROXY_OK);
        await expect(fetchParcelByRefcat('0229720DF3802G')).resolves.not.toBeNull();
    });
});
