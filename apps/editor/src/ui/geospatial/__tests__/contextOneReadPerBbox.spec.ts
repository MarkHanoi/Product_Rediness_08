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

/** When set, the mocked read resolves to this instead of `ok` — used to prove the guard still holds
 *  for the layers whose archive is ABSENT today (canopy / furniture), where nothing is cached. */
let readOutcome: { status: string; reason?: string } | null = null;

vi.mock('../contextTiles', () => ({
    readContextTileFeatures: async (layer: string) => {
        tileReads.push(layer);
        await new Promise<void>((r) => { releaseRead = r; });
        if (readOutcome) return readOutcome;
        return { status: 'ok', features: [], tilesRead: 81, ms: 5672 };
    },
    // §STREET-LIFE — contextFurniture imports this to tell "not baked" from "read failed".
    isArchiveMissingError: (m: string) => /Bad response code: 40[34]\b/.test(m),
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
import { fetchContextRail } from '../contextRail';
import { fetchContextTrees } from '../contextTrees';
import { fetchContextFurniture } from '../contextFurniture';
import { fetchContextBakedCanopy } from '../contextCanopyBaked';

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
    readOutcome = null;
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

// ── THE FOUR LAYERS THE FIRST PASS LEFT OPEN (lane STARTUP-FIX, 2026-09-07) ───────────────────
//
// L-13110 closed parks + landuse and recorded, by name, that `contextRail`, `contextTrees`,
// `contextFurniture` and `contextCanopyBaked` carried the SAME gap — "same fix, same shape". These
// cases are that closure. Two of them are worth calling out because the naive reading says they
// cannot matter:
//   · TREES has a THIRD concurrent caller the others do not: `fetchContextCanopySet` reads trees +
//     parks + canopy in one `Promise.all` for the canopy join, on top of the warm and the pane mount.
//   · FURNITURE and CANOPY are ABSENT from the live tileset, and their readers deliberately do NOT
//     cache a non-`ok` result (a transient blip must never become a session-long "no lamps"). So the
//     resolved-value cache never fills for them at all, and WITHOUT this guard every overlapping
//     caller ran a full read. §CTX-KNOWN-MISSING bounds the repeat to a memo lookup — but it only
//     arms after the first probe RETURNS, which is precisely the window these callers overlap in.

describe('§CTX-ONE-READ-PER-BBOX — rail', () => {
    it('THREE concurrent callers of the same bbox make ONE tile read, not three', async () => {
        const [lat, lon] = coldSite();
        const a = fetchContextRail(lat, lon);
        const b = fetchContextRail(lat, lon);
        const c = fetchContextRail(lat, lon);
        expect(tileReads).toEqual(['rail']);
        await settle();
        const [ra, rb, rc] = await Promise.all([a, b, c]);
        expect(tileReads).toEqual(['rail']);
        expect(ra).toBe(rb);
        expect(rb).toBe(rc);
    });

    it('an aborting caller gets nothing and the shared read still completes for the others', async () => {
        const [lat, lon] = coldSite();
        const ctrl = new AbortController();
        const aborting = fetchContextRail(lat, lon, ctrl.signal);
        const watching = fetchContextRail(lat, lon);
        ctrl.abort();
        await settle();
        expect((await aborting).ways).toEqual([]);
        expect((await watching).type).toBe('ContextRailCollection');
        expect(tileReads).toEqual(['rail']);
    });
});

describe('§CTX-ONE-READ-PER-BBOX — trees', () => {
    it('THREE concurrent callers of the same bbox make ONE tile read, not three', async () => {
        const [lat, lon] = coldSite();
        const a = fetchContextTrees(lat, lon);
        const b = fetchContextTrees(lat, lon);
        const c = fetchContextTrees(lat, lon);
        expect(tileReads).toEqual(['trees']);
        await settle();
        const [ra, rb, rc] = await Promise.all([a, b, c]);
        expect(tileReads).toEqual(['trees']);
        expect(ra).toBe(rb);
        expect(rb).toBe(rc);
    });

    it('an aborting caller gets nothing and the shared read still completes for the others', async () => {
        const [lat, lon] = coldSite();
        const ctrl = new AbortController();
        const aborting = fetchContextTrees(lat, lon, ctrl.signal);
        const watching = fetchContextTrees(lat, lon);
        ctrl.abort();
        await settle();
        expect((await aborting).trees).toEqual([]);
        expect((await watching).type).toBe('ContextTreeCollection');
        expect(tileReads).toEqual(['trees']);
    });
});

describe('§CTX-ONE-READ-PER-BBOX — furniture (the layer that is ABSENT today)', () => {
    it('THREE concurrent callers of the same bbox make ONE tile read, not three', async () => {
        const [lat, lon] = coldSite();
        const a = fetchContextFurniture(lat, lon);
        const b = fetchContextFurniture(lat, lon);
        const c = fetchContextFurniture(lat, lon);
        expect(tileReads).toEqual(['furniture']);
        await settle();
        const [ra, rb, rc] = await Promise.all([a, b, c]);
        expect(tileReads).toEqual(['furniture']);
        expect(ra).toBe(rb);
        expect(rb).toBe(rc);
    });

    it('⭐ an ABSENT archive still costs ONE read for N callers — and stays `absent`, not `unavailable`', async () => {
        // The live case: `furniture.pmtiles` 404s its header, so nothing is ever put in the
        // resolved-value cache by the `ok` branch. The guard is the only thing between two
        // overlapping callers and two full reads.
        readOutcome = { status: 'unavailable', reason: 'header read failed: Bad response code: 404' };
        const [lat, lon] = coldSite();
        const a = fetchContextFurniture(lat, lon);
        const b = fetchContextFurniture(lat, lon);
        expect(tileReads).toEqual(['furniture']);
        await settle();
        const [ra, rb] = await Promise.all([a, b]);
        expect(tileReads).toEqual(['furniture']);
        // ⛔ §CONTEXT-DATA-HONESTY — de-duplicating the READ must not collapse the two states.
        // ABSENT ("not baked for this tileset version") is an honest EMPTY; `unavailable` is not.
        expect(ra.state).toBe('absent');
        expect(rb.state).toBe('absent');
    });

    it('a caller that aborts keeps its own `aborted` state — the state is per CALLER, not per read', async () => {
        const [lat, lon] = coldSite();
        const ctrl = new AbortController();
        const aborting = fetchContextFurniture(lat, lon, ctrl.signal);
        const watching = fetchContextFurniture(lat, lon);
        ctrl.abort();
        await settle();
        expect((await aborting).state).toBe('aborted');
        expect((await watching).state).toBe('ok');
        expect(tileReads).toEqual(['furniture']);
    });
});

describe('§CTX-ONE-READ-PER-BBOX — canopy (opt-in bake, absent from the live tileset)', () => {
    it('THREE concurrent callers of the same bbox make ONE tile read, not three', async () => {
        const [lat, lon] = coldSite();
        const a = fetchContextBakedCanopy(lat, lon);
        const b = fetchContextBakedCanopy(lat, lon);
        const c = fetchContextBakedCanopy(lat, lon);
        expect(tileReads).toEqual(['canopy']);
        await settle();
        const [ra, rb, rc] = await Promise.all([a, b, c]);
        expect(tileReads).toEqual(['canopy']);
        expect(ra).toBe(rb);
        expect(rb).toBe(rc);
    });

    it('⭐ an UNREADABLE archive — the live case — still costs ONE read for N callers', async () => {
        // Canopy caches NOTHING on a non-`ok` read, by design. Two overlapping callers therefore
        // meant two full reads before this guard, every time, for a layer that is never there.
        readOutcome = { status: 'unavailable', reason: 'header read failed: Bad response code: 404' };
        const [lat, lon] = coldSite();
        const a = fetchContextBakedCanopy(lat, lon);
        const b = fetchContextBakedCanopy(lat, lon);
        expect(tileReads).toEqual(['canopy']);
        await settle();
        await Promise.all([a, b]);
        expect(tileReads).toEqual(['canopy']);
        // ⚠ And the guard RELEASES: a later call re-reads rather than being pinned to the failure.
        // A failure that memoised itself here would be §CONTEXT-DATA-HONESTY's exact defect.
        const again = fetchContextBakedCanopy(lat, lon);
        expect(tileReads).toEqual(['canopy', 'canopy']);
        await settle();
        expect((await again).points).toEqual([]);
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
//
// ── §MUTATION PROOF, THE FOUR LATER LAYERS (lane STARTUP-FIX, 2026-09-07) ─────────────────────
// Re-run for the layers added above, one file at a time, guard removed (`await readXForBbox(...)`
// called directly), BEFORE commit:
//   · contextRail.ts      → 2 failed | 14 passed
//       × THREE concurrent callers … → expected [ 'rail', 'rail', 'rail' ] to deeply equal [ 'rail' ]
//       × an aborting caller … does NOT cancel the read the others are awaiting (hung to the 10 s
//         timeout: with no shared read, the second caller's own read never got released)
//   · contextFurniture.ts → 3 failed | 13 passed
//       × THREE concurrent callers …    → expected [ 'furniture', 'furniture', 'furniture' ] …
//       × ⭐ an ABSENT archive still costs ONE read → expected [ 'furniture', 'furniture' ] …
//       × a caller that aborts keeps its own `aborted` state (hung, same cause)
// Both mutations were reverted and the file re-run: 16 passed. The absent-archive case failing is
// the one worth naming — it is the case a reviewer would assume could not matter, because "the
// layer 404s anyway", and it is the case where nothing is cached and every caller paid in full.
