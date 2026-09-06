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
    groundSampleKey,
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
