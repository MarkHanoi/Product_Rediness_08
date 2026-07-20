// §OVERPASS-CLIENT-FAILOVER (L-457 slice 2) — the client half of the zero-context fix.
//
// THE DEFECT: the server proxy answers `200 {elements: []}` when every upstream mirror fails, so
// the client cannot tell a FAILURE from a legitimately EMPTY area. Slice 1 made the server say so
// (`_upstreamFailed: true` + `X-Overpass-Upstream: FAILED`) — and nothing read it. Two
// consequences, both live:
//
//   1. CACHE POISONING. Callers did `if (viaProxy) { cache.set(key, empty); return empty; }`, so
//      one transient 429 wrote "this area has no context" into the session-lifetime cache. Every
//      later call short-circuited on that cache entry, so the area stayed empty until reload —
//      across buildings, parks, roads AND water simultaneously, since all four share one proxy.
//   2. DEAD RESILIENCE CODE. Because a failed proxy response is still a truthy object, the early
//      return meant the direct-mirror cascade, the gentle-mirror throttle, the 429 cooldown
//      registry and the staggered race NEVER RAN while the BFF was up — an entire tested
//      subsystem that only engaged when the server was absent, the one case it wasn't needed for.
//
// Translating the marker to `null` fixes both at the root: `null` already means "the proxy could
// not answer", which is exactly what a total upstream failure IS for a caller. No per-layer cache
// guards are needed — the poisoning branch simply becomes unreachable.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchOverpassViaProxy } from '../src/ui/geospatial/contextBuildings';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

function mockFetch(body: unknown, ok = true): void {
    globalThis.fetch = vi.fn(async () => ({
        ok,
        json: async () => body,
    })) as unknown as typeof fetch;
}

describe('§OVERPASS-CLIENT-FAILOVER — a proxy-reported upstream failure is NOT an empty area', () => {
    it('returns null when the proxy reports _upstreamFailed', async () => {
        mockFetch({ elements: [], _upstreamFailed: true });
        // null is the contract for "fall back to the direct mirrors" — the whole point.
        expect(await fetchOverpassViaProxy('[out:json];out;')).toBeNull();
    });

    // THE REGRESSION GUARD THAT MATTERS: a genuinely empty area must stay a real answer, or
    // every empty rural bbox would hammer the mirrors forever and never cache.
    it('returns the empty result AS-IS when upstream was healthy', async () => {
        mockFetch({ elements: [] });
        const res = await fetchOverpassViaProxy('[out:json];out;');
        expect(res).not.toBeNull();
        expect(res!.elements).toEqual([]);
    });

    it('returns data normally on success', async () => {
        mockFetch({ elements: [{ type: 'way', id: 7 }] });
        const res = await fetchOverpassViaProxy('[out:json];out;');
        expect(res!.elements).toHaveLength(1);
    });

    it('returns null on a non-2xx proxy response', async () => {
        mockFetch({ elements: [] }, false);
        expect(await fetchOverpassViaProxy('[out:json];out;')).toBeNull();
    });

    it('returns null (never throws) when the proxy is unreachable', async () => {
        globalThis.fetch = vi.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch;
        await expect(fetchOverpassViaProxy('[out:json];out;')).resolves.toBeNull();
    });

    // `_upstreamFailed: false` is a healthy response that happens to carry the field.
    it('treats only an EXPLICIT true as failure', async () => {
        mockFetch({ elements: [{ type: 'way', id: 1 }], _upstreamFailed: false });
        const res = await fetchOverpassViaProxy('[out:json];out;');
        expect(res).not.toBeNull();
        expect(res!.elements).toHaveLength(1);
    });
});
