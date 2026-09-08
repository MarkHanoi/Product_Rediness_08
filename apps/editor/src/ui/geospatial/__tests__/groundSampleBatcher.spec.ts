// §STARTUP-GROUND-SAMPLE-COALESCE (L-12930) — the specs that PIN the win.
//
// The founder's Córdoba run measured four ground layers each paying its own
// `sampleTerrainMostDetailed` round-trips over the same bbox — "493 terrain point(s) in 2 batch
// round-trip(s), 14101 ms" / "370 … 14129 ms" / "3555 … 14123 ms" / "9145 … 9702 ms". Three
// layers, a 7× spread in point count, and the same 14.1 s: the cost is the repeated TILE
// DOWNLOAD, not the points. These tests assert the two facts that fix it and the one fact that
// must NOT change:
//   1. concurrent callers over the same window issue ONE round-trip, not one each;
//   2. a point already in flight JOINS it (a re-seat is free);
//   3. every requested point is still SAMPLED and answered with its own real height — the
//      coalescer samples fewer TIMES, never fewer POINTS (§CONTEXT-DATA-HONESTY / C57 §1.5).
import { describe, it, expect } from 'vitest';
import {
    GroundSampleBatcher,
    countDistinctTerrainTiles,
    groundSampleKey,
    terrainTileKey,
    type GroundSamplePoint,
} from '../groundSampleBatcher';

/** A manual clock + timer queue, so the window is driven synchronously and nothing sleeps. */
function makeHarness(opts: { failEvery?: number } = {}) {
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const cache = new Map<string, number>();
    const batches: Array<ReadonlyArray<GroundSamplePoint>> = [];
    let calls = 0;
    const batcher = new GroundSampleBatcher({
        windowMs: 100,
        cache,
        schedule: (fn, ms) => { timers.push({ fn, ms }); },
        // §GROUND-SAMPLE-ONE-FLIGHT-AT-A-TIME — the degrade ceiling gets its OWN queue, never
        // fired here: a test that trips it is measuring the DEGRADED path, not the fixed one.
        scheduleCeiling: () => { /* never fires in these tests */ },
        now: () => 0,
        // The fake provider: a deterministic "terrain" height so a caller can verify it got a
        // REAL per-point answer rather than one shared scalar.
        sample: async (points) => {
            calls++;
            batches.push(points.slice());
            if (opts.failEvery && calls % opts.failEvery === 0) throw new Error('provider down');
            return points.map((p) => Math.round((p.lat + p.lon) * 1000) / 10);
        },
    });
    /** Fire every timer queued so far (a flush may queue the next window's timer). */
    const tick = (): void => {
        const due = timers.splice(0, timers.length);
        for (const t of due) t.fn();
    };
    /** Let the microtask queue drain — the flush awaits the sampler promise. */
    const settle = async (rounds = 6): Promise<void> => {
        for (let i = 0; i < rounds; i++) { tick(); await Promise.resolve(); await Promise.resolve(); }
    };
    return { batcher, cache, batches, timers, tick, settle, calls: () => calls };
}

const pt = (lat: number, lon: number): GroundSamplePoint => ({ lat, lon });

/** The four ground layers of the founder's run, at their MEASURED point counts, over one bbox. */
function layerPoints(n: number, seed: number): GroundSamplePoint[] {
    const out: GroundSamplePoint[] = [];
    for (let i = 0; i < n; i++) {
        // Deliberately OVERLAPPING lattices: real layers drape the same ground, so parks and
        // roads ask about many of the same points. Coalescing must exploit that.
        out.push(pt(37.885 + ((i * seed) % 97) / 100000, -4.797 + ((i * seed) % 89) / 100000));
    }
    return out;
}

describe('§STARTUP-GROUND-SAMPLE-COALESCE — the four ground layers share ONE round-trip', () => {
    it('four concurrent layers issue ONE sampler round-trip, not four (the founder\'s 4× duplicate download)', async () => {
        const h = makeHarness();
        // The exact shape of `CesiumViewport`'s five fire-and-forget `void this.loadContext*`
        // calls: they land in one tick, before any of them has finished.
        const parks = h.batcher.request(layerPoints(493, 7));
        const rail = h.batcher.request(layerPoints(370, 11));
        const roads = h.batcher.request(layerPoints(3555, 13));
        const landuse = h.batcher.request(layerPoints(9145, 17));
        await h.settle();
        await Promise.all([parks, rail, roads, landuse]);

        expect(h.calls()).toBe(1);
        expect(h.batcher.stats.roundTrips).toBe(1);
        // BEFORE: 4 callers → 4 round-trips (plus a 2nd each for split seats = up to 8).
        // AFTER: 1. That ratio is the whole claim.
        expect(h.batcher.stats.requests).toBe(4);
    });

    it('samples fewer TIMES, never fewer POINTS — every distinct point still gets its own real height', async () => {
        const h = makeHarness();
        const parks = layerPoints(493, 7);
        const roads = layerPoints(3555, 13);
        await Promise.all([h.batcher.request(parks), h.batcher.request(roads), h.settle()]);

        const distinct = new Set([...parks, ...roads].map(groundSampleKey));
        // Every distinct point the callers asked for is in the cache with a finite height.
        expect(h.cache.size).toBe(distinct.size);
        for (const p of [...parks, ...roads]) {
            const got = h.cache.get(groundSampleKey(p));
            expect(Number.isFinite(got)).toBe(true);
            // …and it is THAT point's own height, not one shared scalar for the layer.
            expect(got).toBeCloseTo(Math.round((p.lat + p.lon) * 1000) / 10, 6);
        }
        // The single batch handed the sampler exactly the distinct set — no duplicates on the wire.
        expect(h.batches).toHaveLength(1);
        expect(h.batches[0]!.length).toBe(distinct.size);
    });

    it('a point already IN FLIGHT is joined, not re-sampled — a re-seat mid-download is free', async () => {
        const h = makeHarness();
        const first = h.batcher.request([pt(37.885, -4.797), pt(37.886, -4.798)]);
        h.tick();                       // the window fires; the round-trip is now in the air
        // A re-seat arrives BEFORE the sampler resolves and asks for the same points.
        const reseat = h.batcher.request([pt(37.885, -4.797), pt(37.886, -4.798)]);
        await h.settle();
        await Promise.all([first, reseat]);

        expect(h.calls()).toBe(1);
        expect(h.batcher.stats.pointsJoinedInFlight).toBe(2);
        expect(h.batcher.stats.roundTrips).toBe(1);
    });

    it('a CACHED point costs nothing — the second identical request issues no round-trip at all', async () => {
        const h = makeHarness();
        await Promise.all([h.batcher.request([pt(37.885, -4.797)]), h.settle()]);
        expect(h.calls()).toBe(1);

        await Promise.all([h.batcher.request([pt(37.885, -4.797)]), h.settle()]);
        expect(h.calls()).toBe(1);                       // still one
        expect(h.batcher.stats.pointsFromCache).toBe(1);
    });

    it('the window is FIXED from the first point, not debounced — a trickle cannot starve it', async () => {
        const h = makeHarness();
        const a = h.batcher.request([pt(37.8850, -4.7970)]);
        // A later arrival must NOT push the window out; it joins this batch if it is still open.
        const b = h.batcher.request([pt(37.8851, -4.7971)]);
        expect(h.timers).toHaveLength(1);                // ONE timer, not two, not rescheduled
        await h.settle();
        await Promise.all([a, b]);
        expect(h.calls()).toBe(1);
        expect(h.batches[0]!.length).toBe(2);
    });

    it('a request that arrives AFTER the flush fired starts the NEXT batch (it is not dropped)', async () => {
        const h = makeHarness();
        const first = h.batcher.request([pt(37.885, -4.797)]);
        await h.settle();
        await first;
        const second = h.batcher.request([pt(37.999, -4.111)]);
        await h.settle();
        await second;
        expect(h.calls()).toBe(2);
        expect(h.cache.get(groundSampleKey(pt(37.999, -4.111)))).toBeDefined();
    });

    it('a sampler FAILURE leaves points UNMEASURED, never a fabricated 0, and never rejects', async () => {
        const h = makeHarness({ failEvery: 1 });
        // Must resolve (the seat ladder falls back to the safe base) rather than reject into a timer.
        await expect(
            Promise.all([h.batcher.request([pt(37.885, -4.797)]), h.settle()]),
        ).resolves.toBeDefined();
        expect(h.cache.size).toBe(0);                    // absent = "not measured", not 0 m
        expect(h.batcher.stats.roundTrips).toBe(0);      // a failed trip is not a served one
    });

    it('invalidate() fences an in-flight round-trip — a previous city\'s heights never land in the new cache', async () => {
        const h = makeHarness();
        const req = h.batcher.request([pt(37.885, -4.797)]);
        h.tick();                                        // round-trip in the air
        h.batcher.invalidate();                          // terrain detached / project switched
        await h.settle();
        await req;                                       // still settles — never hangs a caller
        expect(h.cache.size).toBe(0);
    });

    it('invalidate() settles callers waiting on a window that had not fired yet', async () => {
        const h = makeHarness();
        const req = h.batcher.request([pt(37.885, -4.797)]);
        h.batcher.invalidate();                          // before the timer fires
        await expect(req).resolves.toBeUndefined();
        expect(h.calls()).toBe(0);
    });

    it('groundSampleKey matches the contextGroundCache literal — 6 decimal places', () => {
        // If this drifts from `CesiumViewport.sampleGround`'s key, the batcher fills a cache
        // nothing reads and re-samples every point forever while reporting a healthy hit rate.
        expect(groundSampleKey(pt(37.8850712, -4.7976123))).toBe('37.885071,-4.797612');
    });

    it('non-finite points are skipped rather than poisoning the batch', async () => {
        const h = makeHarness();
        const req = h.batcher.request([pt(Number.NaN, -4.797), pt(37.885, -4.797)]);
        await h.settle();
        await req;
        expect(h.batches[0]!.length).toBe(1);
    });
});


// ─────────────────────────────────────────────────────────────────────────────────────────────
// §GROUND-SAMPLE-ONE-FLIGHT-AT-A-TIME (L-12952) — the half of the duplicate download the WINDOW
// could not reach.
//
// The 120 ms window merges the callers that arrive TOGETHER. The founder's Córdoba run had two
// kinds that do not: LANDUSE entered about four seconds after the other three (its line reads
// 9 702 ms against their 14 1xx), and EVERY layer takes a SECOND batch for its split-piece seats
// — "2 batch round-trip(s)" on all four lines — which by construction cannot exist until the
// first batch has come back. Both started a fresh `sampleTerrainMostDetailed` while one was
// already in the air, and two concurrent calls download the same tiles twice: `doSampling` shares
// no tile cache between calls, and an in-flight URL is not an HTTP cache hit.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** A harness whose sampler HANGS until the test releases it, so "was a second call made while the
 *  first was in the air?" is a decidable question rather than a timing accident. */
function makeGatedHarness() {
    const timers: Array<() => void> = [];
    const cache = new Map<string, number>();
    const batches: Array<ReadonlyArray<GroundSamplePoint>> = [];
    const gates: Array<() => void> = [];
    /** The concurrency the SAMPLER itself observed — independent of the batcher's own counter,
     *  so a bug in the counter cannot make this test pass. */
    let live = 0;
    let maxLive = 0;
    let tileDedup = false;
    const batcher = new GroundSampleBatcher({
        windowMs: 100,
        cache,
        schedule: (fn) => { timers.push(fn); },
        scheduleCeiling: () => { /* the degrade path has its own test */ },
        now: () => 0,
        // §TILE-DEDUP-RETIRES-THE-FIFO (L-13263) — the harness defaults to the SERIALISING
        // regime, so every arm written before that lane keeps measuring what it measured.
        tileDedupGuaranteed: () => tileDedup,
        sample: async (points) => {
            batches.push(points.slice());
            live++;
            if (live > maxLive) maxLive = live;
            await new Promise<void>((resolve) => { gates.push(resolve); });
            live--;
            return points.map((pp) => Math.round((pp.lat + pp.lon) * 1000) / 10);
        },
    });
    const tick = (): void => { for (const fn of timers.splice(0, timers.length)) fn(); };
    const drain = async (rounds = 8): Promise<void> => {
        for (let i = 0; i < rounds; i++) { tick(); await Promise.resolve(); await Promise.resolve(); }
    };
    /** Let the oldest hanging sampler call return. */
    const release = (): void => { gates.shift()?.(); };
    return {
        batcher, cache, batches, tick, drain, release, maxLive: () => maxLive, gates,
        setTileDedup: (v: boolean): void => { tileDedup = v; },
    };
}

describe('§GROUND-SAMPLE-ONE-FLIGHT-AT-A-TIME — never two sampler calls in the air', () => {
    it('a layer that arrives WHILE a round-trip is in flight waits for it instead of racing it', async () => {
        const h = makeGatedHarness();
        // Roads/parks/rail land together and the window merges them — the L-12930 half.
        const first = h.batcher.request([pt(37.885, -4.797), pt(37.886, -4.798)]);
        await h.drain(3);
        expect(h.batches).toHaveLength(1);          // the round-trip is now in the air, and hangs

        // LANDUSE, ~4 s later in the founder's run: brand-new points, so nothing to join.
        const late = h.batcher.request([pt(37.887, -4.799), pt(37.888, -4.7995)]);
        await h.drain(3);
        // BEFORE: this fired a SECOND concurrent `sampleTerrainMostDetailed` over the same tiles.
        expect(h.batches).toHaveLength(1);

        h.release();                                 // the first round-trip returns
        await h.drain(3);
        expect(h.batches).toHaveLength(2);           // …only now does the second one start
        h.release();
        await h.drain(3);
        await Promise.all([first, late]);

        expect(h.maxLive()).toBe(1);                 // measured at the SAMPLER
        expect(h.batcher.stats.maxConcurrentFlights).toBe(1);
        expect(h.batcher.stats.deferredFlushes).toBe(1);
        expect(h.batcher.stats.roundTrips).toBe(2);
    });

    it('the founder\'s shape — four layers, each with a second split-piece batch — never exceeds ONE flight', async () => {
        const h = makeGatedHarness();
        const waits: Array<Promise<void>> = [];
        // Pass 1: the four layers' probe batches, in one tick (parks/rail/roads together, the
        // window's job) — then landuse late, then each layer's split-piece seats.
        waits.push(h.batcher.request(layerPoints(493, 7)));
        waits.push(h.batcher.request(layerPoints(370, 11)));
        waits.push(h.batcher.request(layerPoints(3555, 13)));
        await h.drain(3);
        waits.push(h.batcher.request(layerPoints(9145, 17)));       // landuse, ~4 s late
        for (let i = 0; i < 4; i++) {
            waits.push(h.batcher.request(layerPoints(200, 23 + i))); // each layer's second batch
        }
        // Let every gate open, one at a time, draining between: if serialisation is broken the
        // sampler sees more than one call live at once and `maxLive` records it.
        for (let i = 0; i < 12; i++) { await h.drain(3); h.release(); }
        await h.drain(6);
        await Promise.all(waits);

        expect(h.maxLive()).toBe(1);
        expect(h.batcher.stats.maxConcurrentFlights).toBe(1);
        // Every point still measured — serialising must not lose one.
        expect(h.cache.size).toBeGreaterThan(0);
    });

    it('a sampler that NEVER settles degrades to a concurrent call — it must not deadlock every later seat', async () => {
        const ceilings: Array<() => void> = [];
        const timers: Array<() => void> = [];
        const cache = new Map<string, number>();
        const batches: Array<ReadonlyArray<GroundSamplePoint>> = [];
        const batcher = new GroundSampleBatcher({
            windowMs: 100,
            cache,
            schedule: (fn) => { timers.push(fn); },
            scheduleCeiling: (fn) => { ceilings.push(fn); },
            serializeMaxWaitMs: 20_000,
            now: () => 0,
            // The Cesium hazard this guards: `drainTileRequestQueue` retries for ever when
            // `requestTileGeometry` keeps returning undefined (Cesium 1.143 :207987-:208002).
            sample: (points) => { batches.push(points.slice()); return new Promise(() => { /* never */ }); },
        });
        const tick = async (rounds = 4): Promise<void> => {
            for (let i = 0; i < rounds; i++) {
                for (const fn of timers.splice(0, timers.length)) fn();
                await Promise.resolve(); await Promise.resolve();
            }
        };
        void batcher.request([pt(37.885, -4.797)]);
        await tick();
        expect(batches).toHaveLength(1);          // hung for ever

        void batcher.request([pt(37.9, -4.8)]);
        await tick();
        expect(batches).toHaveLength(1);          // correctly waiting…

        for (const fn of ceilings.splice(0, ceilings.length)) fn();   // …until the ceiling fires
        await tick();
        expect(batches).toHaveLength(2);          // DEGRADED, not stuck
        expect(batcher.stats.maxConcurrentFlights).toBeGreaterThan(1); // and it SAYS it degraded
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §GROUND-SAMPLE-TILE-ATTRIBUTION (L-12952) — the founder's evidence, turned into an assertion.
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('§GROUND-SAMPLE-TILE-ATTRIBUTION — the TILES are the cost, the points inside them are free', () => {
    it('9145 points and 493 points over the SAME bbox land in the SAME number of tiles', () => {
        // This is the founder's own measurement restated as arithmetic: parks asked 493 points and
        // roads 3555 and BOTH took 14.1 s. Cesium's `doSampling` issues one `requestTileGeometry`
        // per DISTINCT tile and interpolates every point inside it for free, so the download bill
        // is set by the bbox, not the density.
        const sparse = layerPoints(493, 7);
        const dense = layerPoints(9145, 17);
        const tilesSparse = countDistinctTerrainTiles(sparse, 14);
        const tilesDense = countDistinctTerrainTiles(dense, 14);
        expect(tilesDense).toBe(tilesSparse);
        // ⛔ …which is why "drop the drape sample density" is NOT the fix: it moves the point
        // count by 18× and the download bill by nothing, while giving up per-feature seating
        // accuracy (the L-12924 defect reported the day before).
        expect(dense.length / sparse.length).toBeGreaterThan(18);
    });

    it('terrainTileKey is the GeographicTilingScheme arithmetic (2 << level in X, 1 << level in Y)', () => {
        // Cesium.js:40748 — numberOfLevelZeroTilesX defaults to 2, Y to 1. So level 0 is TWO
        // tiles wide and ONE tall: every latitude is y=0 there, which is itself worth pinning
        // (a 2×2 assumption would put the southern hemisphere in a tile that does not exist).
        expect(terrainTileKey(pt(0.001, 0.001), 0)).toBe('0/1/0');
        expect(terrainTileKey(pt(-0.001, -0.001), 0)).toBe('0/0/0');
        expect(terrainTileKey(pt(89.999, 179.999), 0)).toBe('0/1/0');
        // Level 1 (4 × 2) is where Y first splits: north of the equator is y=0, south is y=1.
        expect(terrainTileKey(pt(0.001, 0.001), 1)).toBe('1/2/0');
        expect(terrainTileKey(pt(-0.001, -0.001), 1)).toBe('1/1/1');
        // Clamped, never negative or out of range, at the exact corners.
        expect(terrainTileKey(pt(90, 180), 3)).toBe('3/15/0');
        expect(terrainTileKey(pt(-90, -180), 3)).toBe('3/0/7');
    });

    it('the flush stats carry the tile count and the level it was counted at', async () => {
        const seen: Array<{ tiles: number; tileLevel: number; sampled: number }> = [];
        const timers: Array<() => void> = [];
        const batcher = new GroundSampleBatcher({
            windowMs: 100,
            cache: new Map<string, number>(),
            schedule: (fn) => { timers.push(fn); },
            scheduleCeiling: () => { /* unused */ },
            tileLevel: 12,
            now: () => 0,
            sample: async (points) => points.map(() => 100),
            onFlush: ({ tiles, tileLevel, sampled }) => { seen.push({ tiles, tileLevel, sampled }); },
        });
        const req = batcher.request(layerPoints(3555, 13));
        for (let i = 0; i < 6; i++) {
            for (const fn of timers.splice(0, timers.length)) fn();
            await Promise.resolve(); await Promise.resolve();
        }
        await req;
        expect(seen).toHaveLength(1);
        expect(seen[0]!.tileLevel).toBe(12);
        expect(seen[0]!.tiles).toBeGreaterThan(0);
        // The number that must go DOWN is `tiles`; `sampled` going down buys nothing.
        expect(seen[0]!.tiles).toBeLessThan(seen[0]!.sampled);
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════
// §TILE-DEDUP-RETIRES-THE-FIFO (founder 2026-09-08 · L-13263)
//
// *"try to go as quick as possible ideally 1 second to the location."*
//
// ⛔ THE FIFO'S OWN LOG LINE STATES ITS ONLY JUSTIFICATION: *"max concurrent flights 1 (MUST
// be 1 — two calls in the air re-download the same tiles)."* That was TRUE when
// §GROUND-SAMPLE-ONE-FLIGHT-AT-A-TIME (L-12952) shipped. §TERRAIN-TILE-MEMO (L-13077) then
// made it FALSE: `TerrainTileMemo.requestTileGeometry` calls `remember(key, tracked)`
// SYNCHRONOUSLY, before the request resolves, so a second caller for the same tile — even on
// a concurrent flight — gets the first caller's promise. De-dup moved from the FLIGHT to the
// TILE, which is finer and exact.
//
// ⚠ AND THE SERIALISATION WAS NOT FREE. Founder's Madrid run: two drape layers each reporting
// `~3.3 s waiting for terrain (shared FIFO), ~20 ms own work`, while the coalescer's own
// counters read *"0 joined a trip already in flight, 0 answered by the flight ahead of them"*.
// Full price of serialisation, none of its benefit — the benefit was already collected below.
// ═════════════════════════════════════════════════════════════════════════════════════════
describe('§TILE-DEDUP-RETIRES-THE-FIFO — concurrency is allowed only when de-dup is guaranteed', () => {
    it('⛔ WITHOUT the guarantee the FIFO stands — this is the L-12952 behaviour, unchanged', async () => {
        const h = makeGatedHarness();
        h.setTileDedup(false);
        h.batcher.request([{ lat: 1, lon: 1 }]);
        await h.drain(2);
        h.batcher.request([{ lat: 2, lon: 2 }]);
        await h.drain(2);
        expect(h.maxLive(), 'a second flight must NOT open while one is in the air').toBe(1);
        h.release(); await h.drain(2);
        h.release(); await h.drain(2);
    });

    it('⭐ WITH the guarantee the second flight runs CONCURRENTLY instead of queuing', async () => {
        const h = makeGatedHarness();
        h.setTileDedup(true);
        h.batcher.request([{ lat: 1, lon: 1 }]);
        await h.drain(2);
        h.batcher.request([{ lat: 2, lon: 2 }]);
        await h.drain(2);
        // ⭐ THE 6.6 s. Two flights in the air at once, each downloading nothing the other
        // already has, because the tile memo below joins them at the tile.
        expect(h.maxLive(), 'the second flight must not wait for the first').toBe(2);
        expect(h.batcher.stats.flightsRunConcurrently).toBeGreaterThan(0);
        h.release(); h.release(); await h.drain(2);
    });

    it('the regime is PROBED PER FLUSH — a provider that loses its memo re-serialises', async () => {
        // The memo is installed per PROVIDER and a project switch replaces the provider, so a
        // cached answer would let one city's guarantee license another city's concurrency.
        const h = makeGatedHarness();
        h.setTileDedup(true);
        h.batcher.request([{ lat: 1, lon: 1 }]);
        await h.drain(2);
        h.setTileDedup(false);
        h.batcher.request([{ lat: 2, lon: 2 }]);
        await h.drain(2);
        expect(h.maxLive(), 'with the guarantee withdrawn the FIFO must hold again').toBe(1);
        h.release(); await h.drain(2);
        h.release(); await h.drain(2);
    });

    it('a THROWING predicate is treated as NO guarantee — it serialises, never races', async () => {
        // §CONTEXT-DATA-HONESTY: an unanswerable question is not a yes. Racing on a throw
        // would turn an unknown into the duplicate-download regression L-12952 fixed.
        const cache = new Map<string, number>();
        const timers: Array<() => void> = [];
        let live = 0; let maxLive = 0;
        const gates: Array<() => void> = [];
        const b = new GroundSampleBatcher({
            windowMs: 100, cache,
            schedule: (fn) => { timers.push(fn); },
            scheduleCeiling: () => { /* not under test */ },
            now: () => 0,
            tileDedupGuaranteed: () => { throw new Error('provider gone'); },
            sample: async (points) => {
                live++; if (live > maxLive) maxLive = live;
                await new Promise<void>((r) => { gates.push(r); });
                live--;
                return points.map(() => 1);
            },
        });
        const drain = async (n = 4): Promise<void> => {
            for (let i = 0; i < n; i++) { for (const fn of timers.splice(0)) fn(); await Promise.resolve(); await Promise.resolve(); }
        };
        b.request([{ lat: 1, lon: 1 }]); await drain(2);
        b.request([{ lat: 2, lon: 2 }]); await drain(2);
        expect(maxLive).toBe(1);
        expect(b.stats.flightsRunConcurrently).toBe(0);
        gates.shift()?.(); await drain(2);
        gates.shift()?.(); await drain(2);
    });
});
