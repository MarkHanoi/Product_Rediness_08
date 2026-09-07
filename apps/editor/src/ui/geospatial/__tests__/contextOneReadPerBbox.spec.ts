// §CTX-ONE-READ-PER-BBOX EXTENDED TO PARKS + LANDUSE (L-13110, lane STARTUP-PROVE, 2026-09-07).
//
// ⭐ THE FOUNDER'S OWN NUMBERS, and the verdict they actually support.
// His first Barcelona load prints, on ONE page load:
//     §CTX-PMTILES-READER parks:   800 green area(s) from 81 baked tile(s)  ×3 — 5672 / 3401 / 3400 ms
//     §CTX-PMTILES-READER landuse: 2265 area(s)      from 30 baked tile(s)  ×3 — 3754 / 1486 / 1486 ms
//
// ⚠ IT IS NEITHER "THREE CACHE MISSES" NOR "THREE REDUNDANT DECODES OF HITS". It is BOTH, at two
// different layers, and calling it either one alone leads to the wrong fix:
//   · AT THE TILE LAYER IT IS A HIT. `contextTiles.tileInFlight` registers each tile's promise
//     BEFORE it settles, so callers 2 and 3 share caller 1's download. The three equal END times
//     (5672 − 3401 ≈ 5672 − 3400) are the signature of one download, not three. No duplicate bytes.
//   · AT THE COLLECTION LAYER IT IS A MISS. `fetchContextParks` / `fetchContextLanduse` had a
//     RESOLVED-VALUE cache and no in-flight map, so each of the three ran a full
//     `readContextTileFeatures` — tile-list computation, `Promise.all` over 81 (resp. 30) tiles, a
//     per-read bbox CROP of every feature in them, and a full collection build (800 rings / 2,265
//     areas). The cache is populated on COMPLETION and could not help callers issued while the first
//     read was still in flight — which, on the onboarding flow, they always are.
//
// ⛔ THIS IS §CTX-ONE-READ-PER-BBOX (L-585), WHICH WAS APPLIED TO BUILDINGS AND NEVER PROPAGATED.
// `contextBuildings.fetchForBbox` has carried the guard since L-585 with the reasoning spelled out
// ("DE-DUPLICATE **BEFORE** THE TILE READ, NOT AFTER IT"); `contextRoads`/`contextWater` carry the
// older §L-323 FIX B form. Parks, landuse, rail, trees, furniture and canopy carried NEITHER.
//
// ⭐ WHAT THESE CASES PIN, and why they can fail: the subject is the NUMBER OF CALLS the layer
// reader makes into `readContextTileFeatures` for N concurrent callers of one bbox. That number was
// 3 and must be 1. It is counted from a mocked `contextTiles`, so the count is the production
// reader's own behaviour, not a restatement of the test's setup. Reverting either guard makes these
// go red — verified by mutation before commit.

import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Every `readContextTileFeatures` call the layer readers make, in order. THE assertion subject. */
const tileReads: string[] = [];
/** Released by the test, so N callers are genuinely concurrent (the first read is still in flight). */
let releaseRead: (() => void) | null = null;

vi.mock('../contextTiles', () => ({
    readContextTileFeatures: async (layer: string) => {
        tileReads.push(layer);
        await new Promise<void>((r) => { releaseRead = r; });
        return { status: 'ok', features: [], tilesRead: 81, ms: 5672 };
    },
}));

// The Overpass fallback must never be reached on an `ok` tile read; if it ever is, this throws
// rather than silently making a network call under test.
vi.mock('../contextBuildings', async () => {
    const actual = await vi.importActual<typeof import('../contextBuildings')>('../contextBuildings');
    return {
        ...actual,
        fetchOverpassViaProxy: () => { throw new Error('Overpass must not be reached on an ok tile read'); },
    };
});

import { fetchContextParks } from '../contextParks';
import { fetchContextLanduse } from '../contextLanduse';

// ⚠ EVERY CASE GETS ITS OWN COORDINATES. The layer readers' resolved-value caches are MODULE
// state and there is no reset seam; a shared lat/lon would make case 2 onwards a cache hit and the
// assertions would pass without exercising the guard at all — the "check that could never have
// failed" shape. A fresh pair per case is a cold key by construction.
let siteN = 0;
function coldSite(): [number, number] {
    siteN += 1;
    return [41.3874 + siteN * 0.5, 2.1686 + siteN * 0.5];
}

beforeEach(() => {
    tileReads.length = 0;
    releaseRead = null;
});

/** Let the one in-flight read settle, then drain the microtask queue for the awaiting callers. */
async function settle(): Promise<void> {
    expect(releaseRead, 'a read should be in flight').not.toBeNull();
    const release = releaseRead!;
    releaseRead = null;
    release();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

describe('§CTX-ONE-READ-PER-BBOX — parks', () => {
    it('THREE concurrent callers of the same bbox make ONE tile read, not three', async () => {
        // The onboarding flow's three overlapping callers, reproduced: the `city`-stage warm
        // (`warmAllContextLayers`), the 3D-Site pane mount, and the post-terrain re-render.
        const [lat, lon] = coldSite();
        const a = fetchContextParks(lat, lon);
        const b = fetchContextParks(lat, lon);
        const c = fetchContextParks(lat, lon);
        // ⛔ THE ASSERTION. Before the guard this was 3 — three tile-list computations, three
        // `Promise.all`s over 81 tiles, three bbox crops and three 800-ring collection builds.
        expect(tileReads).toEqual(['parks']);
        await settle();
        const [ra, rb, rc] = await Promise.all([a, b, c]);
        expect(tileReads).toEqual(['parks']);
        // All three get the SAME collection object — one read, one answer, no divergent crops.
        expect(ra).toBe(rb);
        expect(rb).toBe(rc);
    });

    it('a caller that aborts gets nothing, and does NOT cancel the read the others are awaiting', async () => {
        const [lat, lon] = coldSite();
        const ctrl = new AbortController();
        const aborting = fetchContextParks(lat, lon, ctrl.signal);
        const watching = fetchContextParks(lat, lon);
        expect(tileReads).toEqual(['parks']);
        // §L-579 — the abort must cancel the RENDER, never a download others are awaiting.
        ctrl.abort();
        await settle();
        expect((await aborting).areas).toEqual([]);
        // The other caller still receives the real answer: the read ran to completion.
        expect((await watching).type).toBe('ContextParkCollection');
        expect(tileReads).toEqual(['parks']);
    });

    it('a SEQUENTIAL second call is a plain cache hit — no read at all', async () => {
        const [lat, lon] = coldSite();
        const first = fetchContextParks(lat, lon);
        await settle();
        await first;
        expect(tileReads).toEqual(['parks']);
        await fetchContextParks(lat, lon);
        // No new read, and no new in-flight entry: the resolved-value cache answers.
        expect(tileReads).toEqual(['parks']);
    });

    it('a DIFFERENT extent is a different key and legitimately reads again', async () => {
        const [lat, lon] = coldSite();
        const near = fetchContextParks(lat, lon, undefined, 0.008);
        expect(tileReads).toEqual(['parks']);
        await settle();
        await near;
        const wide = fetchContextParks(lat, lon, undefined, 0.016);
        // ⚠ NOT a de-dup failure. The wide read asks for a strictly larger box and must not be
        // served the near crop — that would be handing the second caller the first caller's answer.
        expect(tileReads).toEqual(['parks', 'parks']);
        await settle();
        await wide;
    });
});

describe('§CTX-ONE-READ-PER-BBOX — landuse', () => {
    it('THREE concurrent callers of the same bbox make ONE tile read, not three', async () => {
        const [lat, lon] = coldSite();
        const a = fetchContextLanduse(lat, lon);
        const b = fetchContextLanduse(lat, lon);
        const c = fetchContextLanduse(lat, lon);
        expect(tileReads).toEqual(['landuse']);
        await settle();
        const [ra, rb, rc] = await Promise.all([a, b, c]);
        expect(tileReads).toEqual(['landuse']);
        expect(ra).toBe(rb);
        expect(rb).toBe(rc);
    });

    it('an aborting caller gets nothing and the shared read still completes for the others', async () => {
        const [lat, lon] = coldSite();
        const ctrl = new AbortController();
        const aborting = fetchContextLanduse(lat, lon, ctrl.signal);
        const watching = fetchContextLanduse(lat, lon);
        ctrl.abort();
        await settle();
        expect((await aborting).areas).toEqual([]);
        expect((await watching).type).toBe('ContextLanduseCollection');
        expect(tileReads).toEqual(['landuse']);
    });
});

describe('§CTX-ONE-READ-PER-BBOX — the guard releases, so a session is not pinned to one answer', () => {
    it('the in-flight entry is dropped once the read settles (a later cold key reads again)', async () => {
        const [lat1, lon1] = coldSite();
        const first = fetchContextParks(lat1, lon1);
        await settle();
        await first;
        // A different place: a fresh key, a fresh read. If `inFlight` leaked its entry this would
        // hang or return the previous site's parks — the failure mode a memo without a `finally`
        // produces.
        const [lat2, lon2] = coldSite();
        const second = fetchContextParks(lat2, lon2);
        expect(tileReads).toEqual(['parks', 'parks']);
        await settle();
        expect((await second).type).toBe('ContextParkCollection');
    });
});

// ── §MUTATION PROOF (lane STARTUP-PROVE, 2026-09-07) ──────────────────────────────────────────
//
// The parks guard was removed (`await readParksForBbox(...)` called directly, no `inFlight`) and
// this file re-run BEFORE commit:
//   × THREE concurrent callers of the same bbox make ONE tile read, not three
//     → AssertionError: expected [ 'parks', 'parks', 'parks' ] to deeply equal [ 'parks' ]
//   × a caller that aborts … does NOT cancel the read the others are awaiting
//     → AssertionError: expected [ 'parks', 'parks' ] to deeply equal [ 'parks' ]
// The mutation was reverted. THREE is the number the founder's console printed; this file is the
// reason it cannot come back silently.
