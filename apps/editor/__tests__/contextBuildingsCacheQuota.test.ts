// @vitest-environment happy-dom

/**
 * §FIX-CTXBLD-UNBOUNDED-CACHE + §FIX-STORAGE-RECLAIMER-REGISTRY (L-273)
 *
 * THE FOUNDER'S SCREENSHOT, VERBATIM:
 *
 *     "Nothing safe to reclaim. pryzm:ctxbld:-0.2125,51.5056,-0.1964,51.5156 is using
 *      1.56 MB of browser storage — export your project and clear site data."
 *
 * The diagnostic NAMED the hog correctly (L-269 working as designed). Then "Free up
 * space" freed NOTHING — because `ProjectRepository` scans only its OWN key family and
 * must not delete another module's keys (C13 single-writer). So 1.56 MB of pure,
 * re-fetchable OSM cache sat in his origin while HIS AUTOSAVE INDEX FAILED TO WRITE.
 * A cached map layer was taking his project history down with it.
 *
 * I ALSO GUESSED THE HOG WRONG. I suspected legacy inline underlay rasters. The
 * diagnostic refuted me — which is precisely why L-269 was built to MEASURE AND NAME
 * the consumer instead of leaving anyone (me) to guess.
 *
 * THREE DEFECTS, EACH INDEPENDENTLY SUFFICIENT, ALL GUARDED HERE:
 *   Q-1  UNBOUNDED — one key per bbox, no cap. A 7-day TTL is not a bound; it is a
 *        promise to leak more slowly.
 *   Q-2  EXPIRY FREED NOTHING — `lsRead` returned null past the TTL and LEFT THE KEY.
 *        An "expired" entry held its megabytes forever AND could not be read.
 *   Q-3  NOT RECLAIMABLE — the owner never offered a way to reclaim, so the honest
 *        answer really was "nothing safe to reclaim".
 *
 * Q-4 guards the architecture itself: the reclaimer must register EAGERLY. If it only
 * registers when the lazy geospatial chunk loads, it cannot help a user who is out of
 * quota and has not opened the globe — the exact case that matters.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    ctxbldRead,
    ctxbldWrite,
    reclaimContextBuildingCache,
    CTXBLD_LS_PREFIX,
} from '../src/ui/geospatial/contextBuildingsCache';
import { runRegisteredReclaimers } from '../src/ui/platform/StorageQuotaDiagnostics';

/** A cached bbox payload of roughly realistic shape. */
function collection(n: number) {
    return {
        type: 'FeatureCollection' as const,
        features: Array.from({ length: n }, (_, i) => ({
            type: 'Feature' as const,
            geometry: { type: 'Polygon' as const, coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] },
            properties: { heightM: 10 + i, osmId: i },
        })),
    };
}

function ctxbldKeys(): string[] {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(CTXBLD_LS_PREFIX)) out.push(k);
    }
    return out;
}

describe('§L-273 — the context-buildings cache was a leak with a TTL comment', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('Q-1: the cache is BOUNDED — a new bbox evicts the oldest, it does not grow forever', () => {
        // The founder visited many sites; each minted another multi-MB key, uncapped.
        for (let i = 0; i < 12; i++) {
            ctxbldWrite(`bbox-${i}`, collection(3));
        }

        const keys = ctxbldKeys();
        // A cache is only a cache if it is bounded. Whatever the cap is, it must HOLD.
        expect(keys.length).toBeGreaterThan(0);
        expect(keys.length).toBeLessThanOrEqual(6);

        // …and it must be the OLDEST that went (LRU), not the newest.
        expect(ctxbldRead('bbox-11')).not.toBeNull();  // most recent survives
        expect(ctxbldRead('bbox-0')).toBeNull();       // oldest evicted
    });

    it('Q-2: an EXPIRED entry is DELETED on read — not merely ignored while holding its bytes', () => {
        // Forge an entry written 8 days ago (TTL is 7).
        const key = CTXBLD_LS_PREFIX + 'stale-bbox';
        const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
        localStorage.setItem(key, JSON.stringify({ t: eightDaysAgo, c: collection(2) }));

        expect(ctxbldKeys()).toContain(key);

        // The old code returned null here and LEFT THE KEY — unreadable AND undeletable.
        expect(ctxbldRead('stale-bbox')).toBeNull();

        // The whole point: expiry must actually FREE the space it promised to.
        expect(ctxbldKeys()).not.toContain(key);
    });

    it('Q-3: the owner CAN reclaim its own cache — "nothing safe to reclaim" was true, and is no longer', () => {
        ctxbldWrite('a', collection(5));
        ctxbldWrite('b', collection(5));
        expect(ctxbldKeys().length).toBe(2);

        const freed = reclaimContextBuildingCache();

        expect(freed.keysDropped).toBe(2);
        expect(freed.bytesFreed).toBeGreaterThan(0);
        expect(ctxbldKeys().length).toBe(0);

        // Safe by construction: every dropped value is a re-fetchable OSM footprint set.
        // It costs one Overpass request. It never costs a byte of the user's work.
    });

    it('Q-4: the reclaimer is REGISTERED — and registering is what "Free up space" actually calls', () => {
        ctxbldWrite('registered-bbox', collection(4));
        expect(ctxbldKeys().length).toBe(1);

        // This is the platform-side entry point. Importing the cache module registers the
        // owner's reclaimer; the platform never reaches across the C13 boundary itself.
        const result = runRegisteredReclaimers();

        expect(result.keysDropped).toBeGreaterThanOrEqual(1);
        expect(result.byFamily.some(f => /context buildings/i.test(f.label))).toBe(true);
        expect(ctxbldKeys().length).toBe(0);
    });
});
