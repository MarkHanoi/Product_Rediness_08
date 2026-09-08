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

/**
 * §GROUND-SAMPLE-TILE-ATTRIBUTION (L-12952, founder Cordoba 2026-09-06) — HOW MANY TERRAIN TILES
 * a batch of points actually touches, which is the ONLY quantity the round-trip is billed in.
 *
 * ⭐ THE FOUNDER'S OWN EVIDENCE SAID SO AND NOBODY HAD NAMED IT. Parks asked for **493** points
 * and roads for **3555** — 7× more — and both took **14.1 s**, to within 30 ms. A cost that is
 * FLAT in the point count is not paid per point. The shipped Cesium source says exactly why
 * (`node_modules/cesium/Build/CesiumUnminified/Cesium.js`, 1.143.0, MEASURED 2026-09-06):
 *   · **208004–208027** `doSampling` buckets every position into `tileRequestSet[xy.toString()]`
 *     and builds ONE `tileRequest` per DISTINCT tile — a thousand points inside one tile produce
 *     ONE entry.
 *   · **207963–207980** `attemptConsumeNextQueueItem` issues exactly one
 *     `terrainProvider.requestTileGeometry(x, y, level)` per entry, and every point inside that
 *     tile is then answered by `interpolateHeight` on the ALREADY-DOWNLOADED mesh — free.
 *
 * ⛔ THE CONSEQUENCE, AND IT REVERSES A PLAUSIBLE-LOOKING FIX: "sample fewer points / drop the
 * drape density" buys approximately NOTHING, because the tile set is fixed by the BBOX, not by
 * how densely you sample inside it. Landuse's 9 145 points and a hypothetical 900 land in the
 * SAME handful of tiles and cost the SAME download. Decimating the drape would have traded real
 * per-feature seating accuracy (the L-12924 defect the founder reported the day before) for no
 * measured gain. What DOES cost is asking for those tiles more than once — which is what this
 * module removes.
 *
 * Cesium terrain is served on a `GeographicTilingScheme`, whose defaults are 2 tiles in X and 1
 * in Y at level 0 (`Cesium.js:40748`, `getNumberOfXTilesAtLevel = 2 << level`). Pure arithmetic —
 * no Cesium import, so this is unit-testable and cannot drift with a bundler change.
 */
export function terrainTileKey(p: GroundSamplePoint, level: number): string {
    const nx = 2 * 2 ** level;
    const ny = 2 ** level;
    const x = Math.min(nx - 1, Math.max(0, Math.floor(((p.lon + 180) / 360) * nx)));
    const y = Math.min(ny - 1, Math.max(0, Math.floor(((90 - p.lat) / 180) * ny)));
    return `${level}/${x}/${y}`;
}

/** The number of DISTINCT terrain tiles `points` land in at `level` — i.e. the number of
 *  `requestTileGeometry` downloads `sampleTerrain` issues for them. */
export function countDistinctTerrainTiles(
    points: ReadonlyArray<GroundSamplePoint>,
    level: number,
): number {
    const seen = new Set<string>();
    for (const p of points) {
        if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lon)) continue;
        seen.add(terrainTileKey(p, level));
    }
    return seen.size;
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
    /** §GROUND-SAMPLE-TILE-ATTRIBUTION — distinct terrain tiles those points land in at
     *  `tileLevel`, i.e. the number of downloads Cesium actually issues for them. THIS is what
     *  the round-trip costs; `sampled` is very nearly free. */
    readonly tiles: number;
    /** The level `tiles` was counted at (the batcher's `tileLevel` option). */
    readonly tileLevel: number;
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
    /** §GROUND-SAMPLE-ONE-FLIGHT-AT-A-TIME — the HIGH-WATER MARK of simultaneous sampler calls.
     *  It must read 1. Two round-trips in the air at once re-download the same tiles, which is
     *  the exact defect this module was built to remove; windowing alone left it half-fixed —
     *  a late layer (landuse entered ~4 s after the other three, hence its own 9 702 ms) and
     *  EVERY layer's second, split-piece batch each started a fresh concurrent flight. */
    readonly maxConcurrentFlights: number;
    /** Flushes that WAITED for an in-flight round-trip instead of racing it. */
    readonly deferredFlushes: number;
    /** Points a flush no longer had to sample because the round-trip it waited for answered
     *  them — the split-piece and late-layer batches paying nothing. */
    readonly pointsResolvedByAnEarlierFlight: number;
    /** §TILE-DEDUP-RETIRES-THE-FIFO (L-13263) — how many flushes skipped the FIFO because the
     *  tile memo guarantees each tile downloads once. 0 ⇒ this run serialised, as before. */
    readonly flightsRunConcurrently: number;
}

export interface GroundSampleBatcherOptions {
    /** Milliseconds to hold the first queued point, so concurrent callers merge into its batch. */
    readonly windowMs: number;
    readonly sample: GroundSampleFn;
    /** The shared height cache this batcher fills and reads (`CesiumViewport.contextGroundCache`). */
    readonly cache: Map<string, number>;
    /** Injected timer (P3 / testability). Defaults to `setTimeout` when omitted. */
    readonly schedule?: (fn: () => void, ms: number) => void;
    /** Injected timer for the SERIALISATION DEGRADE CEILING only — deliberately separate from
     *  `schedule`, which drives the coalescing window and which a test fires by hand. */
    readonly scheduleCeiling?: (fn: () => void, ms: number) => void;
    /** Called once per real round-trip, for the §STARTUP-BUDGET AFTER number. */
    readonly onFlush?: (stats: GroundSampleFlushStats) => void;
    /** Monotonic clock; injected so a test can assert `ms` without sleeping. */
    readonly now?: () => number;
    /** §GROUND-SAMPLE-TILE-ATTRIBUTION — the terrain level the flush log attributes tiles at.
     *  Reporting ONLY; it changes nothing about what is sampled. Defaults to 14, the level a
     *  city-scale baked quantized-mesh set typically tops out at. */
    readonly tileLevel?: number;
    /** §GROUND-SAMPLE-ONE-FLIGHT-AT-A-TIME — hard ceiling on how long a flush waits for the
     *  round-trip ahead of it. A sampler that never settles must DEGRADE (a second concurrent
     *  flight, i.e. the old behaviour) rather than deadlock every later seat behind it.
     *  Defaults to 20 s. */
    readonly serializeMaxWaitMs?: number;
    /**
     * ⭐⭐ §TILE-DEDUP-RETIRES-THE-FIFO (founder 2026-09-08 · L-13263) — is DUPLICATE TILE
     * DOWNLOAD already prevented BELOW this batcher, at the tile level?
     *
     * ⛔ THE FIFO EXISTS FOR EXACTLY ONE REASON, and its own log line states it: *"max
     * concurrent flights 1 (MUST be 1 — two calls in the air re-download the same tiles)."*
     * That was TRUE when §GROUND-SAMPLE-ONE-FLIGHT-AT-A-TIME (L-12952) was written. It stopped
     * being true when §TERRAIN-TILE-MEMO (L-13077) landed: `TerrainTileMemo.requestTileGeometry`
     * calls `remember(key, tracked)` SYNCHRONOUSLY, before the request resolves, so a second
     * caller for the same tile — even one whose flight is concurrent — gets the FIRST caller's
     * promise back. De-duplication moved from the FLIGHT to the TILE, which is both finer and
     * exact.
     *
     * ⛔ AND THE SERIALISATION IS NOT FREE. The founder's Madrid run: two drape layers each
     * reporting `~3.3 s waiting for terrain (shared FIFO), ~20 ms own work` — 6.6 s of a 21.8 s
     * start-up spent QUEUING, while the coalescer's own counters read *"0 joined a trip already
     * in flight, 0 answered by the flight ahead of them"*. Fifteen callers, five round-trips,
     * ZERO coalesced: the FIFO was paying the full price of serialisation and collecting none
     * of its benefit, because the benefit had already been collected one layer down.
     *
     * ⚠ INJECTED AND PROBED, NOT ASSUMED. A sampler that does NOT go through the memo must keep
     * the FIFO, or this becomes the duplicate-download regression L-12952 fixed. Absent or
     * `false` ⇒ the FIFO stands, unchanged.
     */
    readonly tileDedupGuaranteed?: () => boolean;
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
    /**
     * §GROUND-SAMPLE-ONE-FLIGHT-AT-A-TIME — the tail of the round-trip queue. Each flush takes
     * this promise, replaces it with its OWN, awaits the one it took, and releases its own when
     * it is done: a plain FIFO mutex, so at most ONE sampler call is ever in the air. Windowing
     * alone merges the callers that arrive TOGETHER and does nothing about the ones that arrive
     * four seconds later, nor about each layer's second (split-piece) batch — and those
     * re-download the identical tile set, which is the whole cost.
     */
    private flightChain: Promise<void> = Promise.resolve();
    private liveFlights = 0;

    private _requests = 0;
    private _pointsRequested = 0;
    private _pointsSampled = 0;
    private _pointsFromCache = 0;
    private _pointsJoinedInFlight = 0;
    private _roundTrips = 0;
    private _maxConcurrentFlights = 0;
    /** §TILE-DEDUP-RETIRES-THE-FIFO (L-13263) — flushes that skipped the FIFO because tile-level
     *  de-dup was guaranteed below. Reported so a run says WHICH regime it ran in. */
    private _flightsRunConcurrently = 0;
    private _deferredFlushes = 0;
    private _pointsResolvedByAnEarlierFlight = 0;

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
            maxConcurrentFlights: this._maxConcurrentFlights,
            flightsRunConcurrently: this._flightsRunConcurrently,
            deferredFlushes: this._deferredFlushes,
            pointsResolvedByAnEarlierFlight: this._pointsResolvedByAnEarlierFlight,
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

    /**
     * §GROUND-SAMPLE-ONE-FLIGHT-AT-A-TIME (L-12952) — wait for my turn, drop what the previous
     * turn already answered, then run ONE sampler call.
     *
     * ⭐ WHY THE WINDOW WAS NOT ENOUGH, in the founder's own numbers. The 120 ms window merges the
     * callers that arrive together; it merged three of the four ground layers. It could not merge
     * LANDUSE, which entered ~4 s later (its own line reads 9 702 ms against the others' 14 1xx),
     * and it could not merge any layer's SECOND batch — the split-piece seats, which by
     * construction cannot be known until the first batch has come back. Both of those started a
     * fresh `sampleTerrainMostDetailed` while one was still in the air, and two concurrent calls
     * download the SAME tiles twice: `doSampling` shares no tile cache between calls
     * (`Cesium.js:208004`), and an in-flight URL is not an HTTP cache hit. So the window removed
     * about half the duplication and the log still showed "2 batch round-trip(s)" per layer.
     *
     * A FIFO mutex removes the rest: at most one sampler call is in the air, so the tile set is
     * never downloaded twice AT THE SAME TIME.
     *
     * ⚠ WHAT IT DOES **NOT** CLAIM, said plainly so the next reader does not over-read it. The
     * split-piece batch still happens, and it still asks for points the probe batch never asked
     * for — piece seats are new points, by construction. Serialising makes it run AFTER the probe
     * flight instead of beside it, over (almost always) the same tiles. Whether that second
     * round-trip is then cheap depends on the browser HTTP cache for those tile URLs, which is
     * NOT MEASURED here and must not be asserted. `pointsResolvedByAnEarlierFlight` is the
     * residual-case counter for a point that became cached between being queued and getting its
     * turn; `request()` already joins an in-flight point, so it normally reads 0 and a non-zero
     * value is itself the finding.
     *
     * ⛔ IT NEVER SAMPLES FEWER POINTS. A point dropped before the sampler was MEASURED by the
     * flight in front of it and its real height is in the cache; nothing is interpolated,
     * decimated or defaulted (§CONTEXT-DATA-HONESTY / C57 §1.5). And the wait is BOUNDED
     * (`serializeMaxWaitMs`): a sampler that never settles must degrade to the old concurrent
     * behaviour, never deadlock every later seat behind it.
     */
    private async runFlush(flush: Flush): Promise<void> {
        // A newer generation (or an `invalidate()`) already retired this flush.
        if (this.flush !== flush) return;
        this.flush = null;
        const queued = Array.from(this.pending.values());
        this.pending.clear();
        if (queued.length === 0) { flush.settle(); return; }
        const queuedKeys = queued.map(groundSampleKey);
        // Registered BEFORE the mutex wait, so a caller arriving while this flush is queued JOINS
        // it rather than opening a third front.
        for (const key of queuedKeys) this.inFlight.set(key, flush.promise);

        // ── Take a ticket in the FIFO. Synchronous, so tickets are handed out in call order. ──
        const ahead = this.flightChain;
        let releaseTurn: () => void = () => { /* replaced synchronously below */ };
        this.flightChain = new Promise<void>((resolve) => { releaseTurn = resolve; });

        const clock = this.opts.now ?? (() => Date.now());
        try {
            // §TILE-DEDUP-RETIRES-THE-FIFO (L-13263) — PROBED PER FLUSH, never cached: the memo
            // is installed per PROVIDER, and a project switch replaces the provider. Asking each
            // time means a flush that runs while no memo is installed still serialises.
            let dedupBelow = false;
            try { dedupBelow = this.opts.tileDedupGuaranteed?.() === true; } catch { dedupBelow = false; }
            if (dedupBelow) {
                this._flightsRunConcurrently++;
            } else {
                // Only a flush that finds a round-trip ACTUALLY in the air was deferred; a chain
                // whose head has already released cost nothing and must not inflate the number.
                if (this.liveFlights > 0) this._deferredFlushes++;
                const settled = await this.awaitTurn(ahead);
                if (!settled) {
                    // The flight ahead exceeded `serializeMaxWaitMs`. Degrade to the pre-L-12952
                    // behaviour (a concurrent call) rather than stall the drape for ever — and say
                    // so, because a run that degraded is a different reading from one that did not.
                    this._maxConcurrentFlights = Math.max(this._maxConcurrentFlights, this.liveFlights + 1);
                }
            }
            // The generation fence, checked AFTER the wait: an `invalidate()` during it means these
            // points belong to a city we have left.
            if (flush.generation !== this.generation) return;

            // Points the flight ahead already measured are in the cache — free, and dropped here.
            const batch: GroundSamplePoint[] = [];
            const keys: string[] = [];
            for (let i = 0; i < queued.length; i++) {
                const key = queuedKeys[i]!;
                if (this.opts.cache.has(key)) { this._pointsResolvedByAnEarlierFlight++; continue; }
                batch.push(queued[i]!);
                keys.push(key);
            }
            if (batch.length === 0) return;

            const t0 = clock();
            let resolved = 0;
            this.liveFlights++;
            if (this.liveFlights > this._maxConcurrentFlights) this._maxConcurrentFlights = this.liveFlights;
            try {
                const heights = await this.opts.sample(batch);
                // ⚠ GENERATION FENCE — if the cache was invalidated while this round-trip was in
                // the air, these heights belong to the PREVIOUS city. Writing them would seat the
                // new site on the old one's relief, which is worse than not measuring at all.
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
                    const tileLevel = this.opts.tileLevel ?? 14;
                    this.opts.onFlush?.({
                        sampled: batch.length,
                        resolved,
                        ms: clock() - t0,
                        tiles: countDistinctTerrainTiles(batch, tileLevel),
                        tileLevel,
                    });
                }
            } finally {
                this.liveFlights--;
            }
        } catch {
            // A sampler failure is UNMEASURED, not zero: leave the points out of the cache and let
            // the seat ladder fall back to the safe base (the L-259 rule). Never throws upward —
            // this runs from a timer, where a rejection has no caller to catch it.
        } finally {
            releaseTurn();
            for (const key of queuedKeys) {
                if (this.inFlight.get(key) === flush.promise) this.inFlight.delete(key);
            }
            flush.settle();
        }
    }

    /** Wait for the round-trip ahead, but never longer than `serializeMaxWaitMs`.
     *  @returns true when it settled, false when the ceiling fired first (degraded, not stuck). */
    private async awaitTurn(ahead: Promise<void>): Promise<boolean> {
        const ceilingMs = this.opts.serializeMaxWaitMs ?? 20_000;
        // ⚠ ITS OWN TIMER, NOT `schedule`. `schedule` drives the coalescing WINDOW and a test
        // fires it by hand; sharing it here would let a test's window tick trip the degrade
        // ceiling and read a concurrency the run never had.
        const scheduleCeiling = this.opts.scheduleCeiling ?? ((fn, ms) => { setTimeout(fn, ms); });
        let settled = false;
        let timedOut = false;
        const ceiling = new Promise<void>((resolve) => {
            scheduleCeiling(() => { if (settled) return; timedOut = true; resolve(); }, ceilingMs);
        });
        await Promise.race([ahead.catch(() => undefined), ceiling]);
        settled = true;
        return !timedOut;
    }
}
