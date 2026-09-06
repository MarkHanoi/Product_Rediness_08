// §STARTUP-GROUND-SAMPLE-COALESCE (L-12930, founder Córdoba 2026-09-06: "first it takes too long
// time to load the split view … the time from selection on 2d to render on 3d is now larger — it
// should be less than a second").
//
// THE MEASUREMENT THAT NAMES THE DEFECT. The founder's console, one run, verbatim
// (§GROUND-DRAPE-ON-RELIEF summaries):
//     PARKS   "493 terrain point(s) in 2 batch round-trip(s), 14101 ms"
//     RAIL    "370 terrain point(s) in 2 batch round-trip(s), 14129 ms"
//     ROADS   "3555 terrain point(s) in 2 batch round-trip(s), 14123 ms"
//     LANDUSE "9145 terrain point(s) in 2 batch round-trip(s), 9702 ms"
// ⭐ READ THE THREE 14 1xx NUMBERS, NOT THE POINT COUNTS. Parks asked for 493 points and rail for
// 370 — SEVEN TIMES fewer than roads' 3555 — and all three took the SAME 14.1 s to within 30 ms.
// A cost that is flat in the number of points is not being paid per point. It is being paid on the
// TERRAIN TILE DOWNLOADS, and the three layers finished together because they STARTED together:
// `CesiumViewport` fires `loadContextRoads / …Water / …Parks / …Landuse / …Rail` as five
// fire-and-forget `void` calls in one tick, so five `sampleTerrainMostDetailed` calls run
// CONCURRENTLY over the SAME bbox at the SAME level of detail.
//
// WHY THAT COSTS 4× RATHER THAN 1×. `Cesium.sampleTerrainMostDetailed` does NOT read the globe's
// tile cache and does NOT share tiles between calls: it calls `provider.requestTileGeometry` for
// every tile its positions land in, every time. Five concurrent calls over one bbox therefore
// request the SAME tile set five times, and those requests all queue through one `RequestScheduler`
// with a per-server concurrency cap — so each caller waits behind four duplicate copies of its own
// download. Each layer also takes a SECOND round-trip for its split-piece seats, so the ceiling was
// TEN downloads of one tile set. The points were never the cost; the repetition was.
//
// WHAT THIS MODULE DOES. It is a coalescing front end for one terrain sampler. Callers keep asking
// for exactly the points they need; requests that arrive inside one short window are merged into
// ONE round-trip, points already in flight JOIN that flight instead of starting another, and points
// already in the cache cost nothing. The five layers plus the buildings pass thus share ONE download
// of the tile set they all wanted anyway.
//
// ⛔ WHAT IT DELIBERATELY DOES NOT DO — IT SAMPLES FEWER TIMES, NEVER FEWER POINTS. Every point a
// caller asks for is still sampled and still answered with its own real terrain height. Nothing is
// interpolated, decimated, defaulted or faked (§CONTEXT-DATA-HONESTY / C57 §1.5: a synthesised
// height presented as a measured one is the one thing speed may never buy). The geometry that comes
// out the other side is byte-identical to the un-coalesced path; only the number of network
// round-trips changes. A caller that gets no answer for a point is told `null` — "not measured" —
// and the seat ladder's existing safe-base fallback (`decideGroundFeatureSeat`) handles it, exactly
// as it did before.
//
// ⚠ THE WINDOW IS FIXED FROM THE FIRST QUEUED POINT, NOT DEBOUNCED. A debounce that restarts on
// every arrival can be starved indefinitely by a steady trickle of callers — the ground layers are
// exactly such a trickle — and would turn a latency fix into a latency bug. The window therefore
// runs once from the first point that needs it: a late arrival joins the NEXT batch rather than
// delaying this one.
//
// Pure: no Cesium, no DOM, no `window`, no rAF (P3 — the timer is INJECTED, so tests drive it
// synchronously and the module holds no ambient scheduler).
//
// P8: every exported function carries an OTel span.
import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.ground-sample-batcher');

export interface GroundSamplePoint {
    readonly lat: number;
    readonly lon: number;
}

/**
 * The cache key for one ground point — SIX decimal places, i.e. ~0.11 m at the equator. This is
 * the SAME literal `CesiumViewport.sampleGround` / `contextGroundCache` already use; it is exported
 * so the two can never drift apart silently (a batcher that keyed differently from the cache it
 * fills would re-sample every point forever while reporting a healthy hit rate).
 */
export function groundSampleKey(p: GroundSamplePoint): string {
    return `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
}

/** Samples real terrain for a batch of points. Returns one entry per input point, in order:
 *  a finite height, or `null` where the provider could not answer (NOT a fabricated 0). */
export type GroundSampleFn = (
    points: ReadonlyArray<GroundSamplePoint>,
) => Promise<ReadonlyArray<number | null>>;

export interface GroundSampleFlushStats {
    /** Points actually handed to the sampler in this round-trip. */
    readonly sampled: number;
    /** Of those, how many came back with a finite height. */
    readonly resolved: number;
    readonly ms: number;
}

export interface GroundSampleBatcherStats {
    /** Calls to `request()` since construction — the number of callers that were coalesced. */
    readonly requests: number;
    /** Points asked for across all those calls, counting duplicates (what the OLD path sampled). */
    readonly pointsRequested: number;
    /** Points actually handed to the sampler (what the NEW path samples). */
    readonly pointsSampled: number;
    /** Points answered from the cache with no work at all. */
    readonly pointsFromCache: number;
    /** Points that joined a round-trip already in flight instead of starting a new one. */
    readonly pointsJoinedInFlight: number;
    /** Terrain round-trips actually issued — THE number this module exists to reduce. */
    readonly roundTrips: number;
}

export interface GroundSampleBatcherOptions {
    /** Milliseconds to hold the first queued point, so concurrent callers merge into its batch. */
    readonly windowMs: number;
    readonly sample: GroundSampleFn;
    /** The shared height cache this batcher fills and reads (`CesiumViewport.contextGroundCache`). */
    readonly cache: Map<string, number>;
    /** Injected timer (P3 / testability). Defaults to `setTimeout` when omitted. */
    readonly schedule?: (fn: () => void, ms: number) => void;
    /** Called once per real round-trip, for the §STARTUP-BUDGET AFTER number. */
    readonly onFlush?: (stats: GroundSampleFlushStats) => void;
    /** Monotonic clock; injected so a test can assert `ms` without sleeping. */
    readonly now?: () => number;
}

interface Flush {
    readonly promise: Promise<void>;
    readonly settle: () => void;
    readonly generation: number;
}

/**
 * Coalesces many callers' terrain-sample requests into as few round-trips as the window allows.
 *
 * Contract:
 *   · `request(points)` resolves once EVERY one of `points` is either in the cache or has been
 *     through a sampler round-trip. It never rejects — a sampler failure leaves those points
 *     unmeasured (absent from the cache), which the seat ladder already handles as "unknown".
 *   · Points already cached are free and are not re-sampled.
 *   · Points in flight are JOINED, so a re-seat arriving mid-download costs zero extra round-trips.
 *   · `invalidate()` is called when the cache's answers die (terrain detached, project switched):
 *     it drops the pending queue and makes any in-flight round-trip discard its results rather
 *     than write a previous city's elevations into the new cache.
 */
export class GroundSampleBatcher {
    private readonly opts: GroundSampleBatcherOptions;
    private readonly pending = new Map<string, GroundSamplePoint>();
    private readonly inFlight = new Map<string, Promise<void>>();
    private flush: Flush | null = null;
    private generation = 0;

    private _requests = 0;
    private _pointsRequested = 0;
    private _pointsSampled = 0;
    private _pointsFromCache = 0;
    private _pointsJoinedInFlight = 0;
    private _roundTrips = 0;

    constructor(opts: GroundSampleBatcherOptions) {
        this.opts = opts;
    }

    public get stats(): GroundSampleBatcherStats {
        return {
            requests: this._requests,
            pointsRequested: this._pointsRequested,
            pointsSampled: this._pointsSampled,
            pointsFromCache: this._pointsFromCache,
            pointsJoinedInFlight: this._pointsJoinedInFlight,
            roundTrips: this._roundTrips,
        };
    }

    /**
     * Ask for `points`. Resolves when they are all measured-or-attempted. Safe to call with
     * thousands of points and with heavy duplication between callers — that is the whole point.
     */
    public request(points: ReadonlyArray<GroundSamplePoint>): Promise<void> {
        const span = _tracer.startSpan('pryzm.ground-sample-batcher.request');
        try {
            this._requests++;
            this._pointsRequested += points.length;
            // A Set, not an array: 9145 landuse points joining ONE flight would otherwise push
            // 9145 copies of the same promise into `Promise.all`.
            const waits = new Set<Promise<void>>();
            let queued = 0;
            for (const p of points) {
                if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lon)) continue;
                const key = groundSampleKey(p);
                if (this.opts.cache.has(key)) { this._pointsFromCache++; continue; }
                const flight = this.inFlight.get(key);
                if (flight) { this._pointsJoinedInFlight++; waits.add(flight); continue; }
                if (!this.pending.has(key)) this.pending.set(key, { lat: p.lat, lon: p.lon });
                queued++;
            }
            if (queued > 0) waits.add(this.scheduleFlush());
            if (waits.size === 0) return Promise.resolve();
            return Promise.all(Array.from(waits)).then(() => undefined);
        } finally {
            span.end();
        }
    }

    /**
     * The cache's answers just died (terrain detached / project switched). Drop the queue and
     * fence the in-flight round-trip so its results are discarded instead of being written into
     * a cache that now belongs to a different city.
     */
    public invalidate(): void {
        const span = _tracer.startSpan('pryzm.ground-sample-batcher.invalidate');
        try {
            this.generation++;
            this.pending.clear();
            this.inFlight.clear();
            // A pending flush that has not fired yet must still settle its waiters — they are
            // awaiting a measurement that will now never come, and the seat ladder's safe-base
            // fallback is the honest answer for them (never a hang, never a fabricated height).
            const f = this.flush;
            if (f) { this.flush = null; f.settle(); }
        } finally {
            span.end();
        }
    }

    private scheduleFlush(): Promise<void> {
        const existing = this.flush;
        if (existing) return existing.promise;
        let settle: () => void = () => { /* replaced synchronously by the executor below */ };
        const promise = new Promise<void>((resolve) => { settle = resolve; });
        const flush: Flush = { promise, settle, generation: this.generation };
        this.flush = flush;
        const schedule = this.opts.schedule ?? ((fn, ms) => { setTimeout(fn, ms); });
        schedule(() => { void this.runFlush(flush); }, this.opts.windowMs);
        return promise;
    }

    private async runFlush(flush: Flush): Promise<void> {
        // A newer generation (or an `invalidate()`) already retired this flush.
        if (this.flush !== flush) return;
        this.flush = null;
        const batch = Array.from(this.pending.values());
        this.pending.clear();
        if (batch.length === 0) { flush.settle(); return; }
        const keys = batch.map(groundSampleKey);
        for (const key of keys) this.inFlight.set(key, flush.promise);
        const clock = this.opts.now ?? (() => Date.now());
        const t0 = clock();
        let resolved = 0;
        try {
            const heights = await this.opts.sample(batch);
            // ⚠ GENERATION FENCE — if the cache was invalidated while this round-trip was in the
            // air, these heights belong to the PREVIOUS city. Writing them would seat the new
            // site on the old one's relief, which is worse than not measuring at all.
            if (flush.generation === this.generation) {
                for (let i = 0; i < batch.length; i++) {
                    const h = heights[i];
                    if (typeof h === 'number' && Number.isFinite(h)) {
                        this.opts.cache.set(keys[i]!, h);
                        resolved++;
                    }
                }
                this._roundTrips++;
                this._pointsSampled += batch.length;
                this.opts.onFlush?.({ sampled: batch.length, resolved, ms: clock() - t0 });
            }
        } catch {
            // A sampler failure is UNMEASURED, not zero: leave the points out of the cache and let
            // the seat ladder fall back to the safe base (the L-259 rule). Never throws upward —
            // this runs from a timer, where a rejection has no caller to catch it.
        } finally {
            for (const key of keys) {
                if (this.inFlight.get(key) === flush.promise) this.inFlight.delete(key);
            }
            flush.settle();
        }
    }
}
