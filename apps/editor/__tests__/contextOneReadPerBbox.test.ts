// §CTX-ONE-READ-PER-BBOX (L-585) — concurrent callers for the SAME bbox must share ONE tile read.
//
// WHY THIS TEST EXISTS. Founder 2026-07-22: the 3D Site showed boundary + envelope with no
// surrounding buildings for many seconds, on a path whose tile read is measured at ~1 s. The cause
// was not latency — it was that `fetchForBbox` consulted its `inFlight` map only on the Overpass
// FALLBACK, below the baked-tile read. So on the live tiles path every overlapping caller issued
// its own full 42-tile read, and the cache (populated only on completion) never got the chance to
// serve them. Three callers overlap on the onboarding flow: the L-470 location prefetch, the
// renderFormaMassing load, and the terrain-clamp re-seat — and the last ABORTS the second, whose
// work is then discarded (an aborted read is deliberately not cached, §L-579).
//
// The regression this pins is invisible to a screenshot and to any "does context render" test:
// the picture is eventually CORRECT either way. Only a call COUNT can see it, which is why the
// assertion is on the number of reads and not on the features.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted so the `vi.mock` factory (hoisted above the imports) can reach it.
const h = vi.hoisted(() => ({ reads: 0, resolve: null as null | ((v: unknown) => void) }));

vi.mock('../src/ui/geospatial/contextTiles', async (importOriginal) => {
    const real = await importOriginal<typeof import('../src/ui/geospatial/contextTiles')>();
    return {
        ...real,
        // Tiles are ON (this is the live configuration; the Overpass path is the fallback).
        contextTilesEnabled: () => true,
        // A read that does NOT settle until the test says so — the whole point is to have two
        // callers overlap, which cannot happen if the first read resolves synchronously.
        // ⚠ `tilesFailed` IS LOAD-BEARING and was missing here. §CTX-TILE-READ-HONESTY (L-778) made
        // `fetchForBbox` cache the result only when `tiled.tilesFailed === 0`; against `undefined`
        // that is false, so this mock's CLEAN read was treated as a PARTIAL one, nothing was cached,
        // and the fourth caller below issued a second read that no `h.resolve` ever settled — the
        // test timed out instead of failing an assertion, which is why it read as flake. A mock that
        // omits a field the code branches on does not test the code; it tests the omission.
        readContextTileFeatures: vi.fn(async () => {
            h.reads++;
            await new Promise((r) => { h.resolve = r; });
            return { status: 'ok' as const, features: [], tilesRead: 42, tilesFailed: 0, ms: 1000 };
        }),
    };
});

import {
    fetchContextBuildingsNearAndFar,
    clearContextBuildingCache,
} from '../src/ui/geospatial/contextBuildings';

beforeEach(() => {
    h.reads = 0;
    h.resolve = null;
    clearContextBuildingCache();
});
afterEach(() => { clearContextBuildingCache(); });

describe('§CTX-ONE-READ-PER-BBOX', () => {
    it('serves three overlapping callers for one site from a SINGLE tile read', async () => {
        const lat = 41.3874, lon = 2.1686; // Eixample — the founder's site.

        // The three real callers, all racing, exactly as the onboarding flow issues them:
        // the L-470 prefetch (no signal), the render load, and the terrain-clamp re-seat.
        const prefetch = fetchContextBuildingsNearAndFar(lat, lon);
        const render = fetchContextBuildingsNearAndFar(lat, lon, new AbortController().signal);
        const reseat = fetchContextBuildingsNearAndFar(lat, lon, new AbortController().signal);

        // Let the microtask queue drain so all three have reached the read.
        await new Promise((r) => setTimeout(r, 0));

        expect(h.reads).toBe(1);

        h.resolve?.(undefined);
        await Promise.all([prefetch, render, reseat]);
        expect(h.reads).toBe(1);
    });

    it('does not let ONE caller\'s abort discard the read the others are awaiting', async () => {
        const lat = 41.3874, lon = 2.1686;
        const ac = new AbortController();

        const survivor = fetchContextBuildingsNearAndFar(lat, lon);
        const doomed = fetchContextBuildingsNearAndFar(lat, lon, ac.signal);
        await new Promise((r) => setTimeout(r, 0));
        expect(h.reads).toBe(1);

        // The terrain-clamp re-seat aborts the render-path load mid-flight. The DOWNLOAD must
        // survive that: cancelling it is what forced a fresh 42-tile round trip moments later.
        ac.abort();
        h.resolve?.(undefined);
        await Promise.all([survivor, doomed]);

        // Still one read, and — decisively — a FOURTH caller arriving afterwards is served from
        // the cache the surviving read populated, with no new read at all.
        const later = await fetchContextBuildingsNearAndFar(lat, lon);
        expect(h.reads).toBe(1);
        expect(later.near.features).toEqual([]);
    });
});
