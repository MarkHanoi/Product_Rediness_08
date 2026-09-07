// §TERRAIN-TILE-MEMO (L-13077, founder Barcelona 2026-09-07: "check how to improve speed +
// performance as much as possible" — he watches a loading page for 61 s on project start-up).
//
// ⭐ THE MEASUREMENT THAT NAMES THE DEFECT. The founder's console, ONE start-up, verbatim
// (`§STARTUP-GROUND-SAMPLE-COALESCE` flush lines):
//     flight 1  "resolved 18789/18789 … in 5213 ms. Tiles: 12 distinct terrain tile(s) at level 14"
//     flight 2  "resolved  9520/9520 … in 4975 ms. Tiles: 12 distinct terrain tile(s) at level 14"
//     flight 3  185 points ·  115 ms ·  8 tiles
//     flight 4   15 points ·   21 ms ·  4 tiles
// ⭐ READ THE TWO TILE COUNTS, NOT THE POINT COUNTS. The SAME 12 level-14 tiles were fetched
// TWICE, five seconds each. `§STARTUP-GROUND-SAMPLE-COALESCE` had already removed the CONCURRENT
// duplication (max concurrent flights 1) and the coalescing window had already merged the callers
// that arrive together; what neither could remove is duplication ACROSS TIME. Flight 2 is the
// split-piece seat batch, and by construction it cannot be known until flight 1 has come back —
// so it is a SEPARATE call, and a separate call re-downloads everything.
//
// WHY IT RE-DOWNLOADS — VERIFIED IN THE SHIPPED SOURCE, NOT ASSUMED. Cesium 1.143.0,
// `node_modules/cesium/Build/CesiumUnminified/Cesium.js`, MEASURED 2026-09-07:
//   · :208004 `doSampling` buckets the positions into `tileRequestSet[xy.toString()]` and builds
//     ONE `tileRequest` per DISTINCT tile — a thousand points inside one tile produce one entry.
//     The set is a LOCAL, built fresh on every call: nothing survives the call.
//   · :207963 `attemptConsumeNextQueueItem` then calls
//     `tileRequest.terrainProvider.requestTileGeometry(x, y, level)` for every entry.
//   · :257526 `CesiumTerrainProvider.prototype.requestTileGeometry` → :257569
//     `requestTileGeometry2` → `resource.getDerivedResource({…}).fetchArrayBuffer()` → decode.
//     There is NO memo anywhere on that path: every call is a fresh GET plus a fresh decode.
// So `sampleTerrainMostDetailed` shares no tile with the previous `sampleTerrainMostDetailed`, and
// it shares no tile with the GLOBE either (the globe's own `GlobeSurfaceTile` cache is a different
// object graph). Two flights over one bbox = two downloads of one tile set.
//
// ⛔ THE FIX IS NOT "RAISE CONCURRENCY". `§GROUND-SAMPLE-ONE-FLIGHT-AT-A-TIME` caps the sampler at
// one flight in the air and that constraint is CORRECT — its own line says why: "two calls in the
// air re-download the same tiles". This module attacks the same waste from the other side: it
// makes the SECOND flight free instead of making it concurrent.
//
// WHAT THIS MODULE DOES. It is a memo in front of `requestTileGeometry`, keyed `level/x/y`. The
// first flight downloads and decodes; every later flight that lands in the same tile gets the
// already-decoded `TerrainData` back and Cesium interpolates its points out of it in memory.
// `memoiseTerrainTiles(provider, memo)` returns a THIN DERIVED VIEW of the real provider
// (`Object.create`, so every getter — `tilingScheme`, `availability`, `_layers`, `_scheme`,
// `_requestVertexNormals` … — resolves through the prototype chain to the real provider's own
// fields) with exactly one own property overridden: `requestTileGeometry`. Cesium's own sampling
// logic runs UNCHANGED; only the download is skipped.
//
// ⛔ WHAT IT DELIBERATELY DOES NOT DO — IT DOWNLOADS FEWER TIMES, NEVER MEASURES FEWER POINTS.
// Every point every caller asks for is still sampled, still interpolated from a REAL decoded
// terrain mesh, and still answered with its own measured height. Nothing is interpolated between
// tiles, decimated, defaulted or faked (§CONTEXT-DATA-HONESTY / C57 §1.5: a synthesised height
// presented as a measured one is the one thing speed may never buy). The heights that come out are
// bit-identical to the un-memoised path — it is the SAME `TerrainData` object answering, not a
// cheaper approximation of it.
//
// ⚠ A FAILED DOWNLOAD IS NEVER MEMOISED. Caching a rejection would pin a transient 503 as "this
// tile has no ground" for the rest of the session — the §CONTEXT-DATA-HONESTY family's exact
// failure mode (a failure that renders as an answer). A rejected entry is dropped so the next
// flight retries it. A `undefined` return (Cesium's "the scheduler is saturated, ask again")
// is likewise not memoised — it is not a tile, it is a back-pressure signal.
//
// ⚠ IT IS BOUNDED. An unbounded decoded-mesh cache is a memory leak with a good story attached
// (§L-273 learned that the expensive way). `maxTiles` evicts least-recently-USED; the founder's
// whole Barcelona start-up touched 12 distinct tiles, so the default has ~10× headroom over the
// measured working set.
//
// Pure: no Cesium import, no DOM, no `window`, no rAF (P3). The provider is a structural type, so
// this is unit-testable against a fake and cannot drift with a bundler change.
//
// P8: every exported function carries an OTel span.
import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.terrain-tile-memo');

/**
 * The only member of a terrain provider this memo intercepts. Structural on purpose — the memo
 * never imports Cesium, so a test drives it with a counting fake.
 *
 * `requestTileGeometry` returns `undefined` when Cesium's `RequestScheduler` is saturated (the
 * caller is expected to retry), and a promise otherwise.
 */
export interface TerrainTileSource {
    requestTileGeometry(
        x: number,
        y: number,
        level: number,
        request?: unknown,
    ): Promise<unknown> | undefined;
}

export interface TerrainTileMemoStats {
    /** `requestTileGeometry` calls that came through the memo. */
    readonly requests: number;
    /** Of those, how many reached the provider (a real GET + decode). */
    readonly downloads: number;
    /** Of those, how many were answered by an already-decoded tile — THE number this exists to
     *  raise. On the founder's run this would have read 12 on the second flight. */
    readonly hits: number;
    /** Downloads that rejected. Never memoised, so the next flight retries them. */
    readonly failures: number;
    /** Tiles currently held. */
    readonly resident: number;
    /** Tiles dropped by the `maxTiles` bound. A non-zero value on a single site is the finding:
     *  the working set is bigger than the bound and the memo is thrashing. */
    readonly evicted: number;
}

export interface TerrainTileMemoOptions {
    /**
     * Bound on decoded tiles held. The founder's Barcelona start-up touched **12** distinct
     * level-14 tiles for the whole wide extent, so 128 is ~10× the measured working set and still
     * bounded. Eviction is least-recently-USED, which for a user panning around one site drops the
     * tiles they have moved away from.
     */
    readonly maxTiles?: number;
}

const DEFAULT_MAX_TILES = 128;

/** `level/x/y` — the triple `requestTileGeometry` is billed in. */
export function terrainTileMemoKey(x: number, y: number, level: number): string {
    return `${level}/${x}/${y}`;
}

/**
 * A bounded memo of DECODED terrain tiles, keyed `level/x/y`.
 *
 * One memo belongs to one terrain provider: a different provider is a different city's tileset and
 * the same `level/x/y` means a different piece of ground. `CesiumViewport` therefore rebuilds the
 * memo when `viewer.terrainProvider` changes, and clears it wherever the ground answers die
 * (`detachBakedTerrain`, project switch) — the same fence `GroundSampleBatcher.invalidate()` sits
 * behind, for the same reason: a previous city's elevations must never seat a new site.
 */
export class TerrainTileMemo {
    private readonly tiles = new Map<string, Promise<unknown>>();
    private readonly maxTiles: number;
    /**
     * Per-`TerrainData` guard for `createMesh`. Cesium's `createInterpolateFunction`
     * (Cesium.js:208046) calls `terrainData.createMesh(...)` when a position falls outside the
     * quantized triangles, and `QuantizedMeshTerrainData.prototype.createMesh` (:256607) NULLS
     * `_quantizedVertices` / `_indices` / `_heightValues` once its worker task returns. On the
     * un-memoised path each call had its own freshly-decoded instance, so that destruction was
     * harmless; a SHARED instance can be asked twice, and the second ask would schedule a mesh
     * task over `undefined` buffers. That does not corrupt geometry — the outer
     * `createMarkFailedFunction` turns it into `height = undefined`, i.e. UNMEASURED — but losing
     * a real measurement to a caching optimisation is exactly what this module promises not to do.
     * So the first `createMesh` promise is remembered and returned to every later caller.
     */
    private readonly meshOnce = new WeakMap<object, Promise<unknown>>();
    /** Data objects this memo has already guarded. A WeakSet, NOT an `hasOwnProperty('createMesh')`
     *  probe: Cesium puts `createMesh` on the PROTOTYPE, so the own-property test reads false the
     *  first time and true afterwards — which happens to work there and silently skips the guard for
     *  any provider whose terrain data carries `createMesh` as an own property. The set is exact for
     *  both shapes and holds no strong reference. */
    private readonly guarded = new WeakSet<object>();

    private _requests = 0;
    private _downloads = 0;
    private _hits = 0;
    private _failures = 0;
    private _evicted = 0;

    constructor(opts: TerrainTileMemoOptions = {}) {
        const n = opts.maxTiles ?? DEFAULT_MAX_TILES;
        this.maxTiles = Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_TILES;
    }

    public get stats(): TerrainTileMemoStats {
        return {
            requests: this._requests,
            downloads: this._downloads,
            hits: this._hits,
            failures: this._failures,
            resident: this.tiles.size,
            evicted: this._evicted,
        };
    }

    /**
     * The memoised `requestTileGeometry`. Returns the SAME promise (hence the same decoded
     * `TerrainData`) for a tile already fetched, and delegates otherwise.
     *
     * ⚠ Returns `undefined` — never a promise of `undefined` — when the provider does, because
     * Cesium's `drainTileRequestQueue` (Cesium.js:207985) reads that as back-pressure and retries
     * after 100 ms. Turning it into a resolved promise would silently drop the tile.
     */
    public requestTileGeometry(
        source: TerrainTileSource,
        x: number,
        y: number,
        level: number,
        request?: unknown,
    ): Promise<unknown> | undefined {
        this._requests++;
        const key = terrainTileMemoKey(x, y, level);
        const held = this.tiles.get(key);
        if (held) {
            this._hits++;
            // Touch for LRU: re-inserting moves the key to the end of the Map's iteration order.
            this.tiles.delete(key);
            this.tiles.set(key, held);
            return held;
        }
        const fresh = source.requestTileGeometry(x, y, level, request);
        if (!fresh) return fresh;            // saturated scheduler — a signal, not a tile.
        this._downloads++;
        const guarded = fresh.then((data) => {
            this.guardCreateMesh(data);
            return data;
        });
        const tracked = guarded.catch((e: unknown) => {
            // ⚠ NEVER MEMOISE A FAILURE. A transient 503 during an R2 publish must not read as
            // "this tile has no ground" for the rest of the session.
            this._failures++;
            if (this.tiles.get(key) === tracked) this.tiles.delete(key);
            throw e;
        });
        this.remember(key, tracked);
        return tracked;
    }

    /** Drop every held tile. Called where the ground answers die — terrain detached, project
     *  switched, provider replaced. */
    public clear(): void {
        const span = _tracer.startSpan('pryzm.terrain-tile-memo.clear');
        try {
            this.tiles.clear();
        } finally {
            span.end();
        }
    }

    private remember(key: string, tile: Promise<unknown>): void {
        while (this.tiles.size >= this.maxTiles) {
            const oldest = this.tiles.keys().next();
            if (oldest.done) break;
            this.tiles.delete(oldest.value);
            this._evicted++;
        }
        this.tiles.set(key, tile);
    }

    /** See `meshOnce`. Idempotent: a data object already guarded is left alone. */
    private guardCreateMesh(data: unknown): void {
        if (!data || typeof data !== 'object') return;
        const obj = data as { createMesh?: (options: unknown) => Promise<unknown> | undefined };
        const original = obj.createMesh;
        if (typeof original !== 'function') return;
        const target = obj as object;
        if (this.guarded.has(target)) return;
        this.guarded.add(target);
        const meshOnce = this.meshOnce;
        Object.defineProperty(obj, 'createMesh', {
            value: (options: unknown): Promise<unknown> | undefined => {
                const existing = meshOnce.get(target);
                if (existing) return existing;
                const p = original.call(obj, options);
                if (p) meshOnce.set(target, p);
                return p;
            },
            writable: true,
            configurable: true,
            enumerable: false,
        });
    }
}

/**
 * Wrap `provider` so its `requestTileGeometry` goes through `memo`, leaving every other member
 * exactly as it was.
 *
 * ⚠ `Object.create(provider)` rather than a hand-written facade, DELIBERATELY. Cesium's sampling
 * path reads `tilingScheme`, `availability`, `loadTileDataAvailability`, and — via
 * `requestTileGeometry2` / `checkLayer` (Cesium.js:257569 / :257843) — `_layers`, `_scheme`,
 * `_tilingScheme`, `_requestVertexNormals`, `_requestWaterMask`, `_requestMetadata`,
 * `_heightmapStructure`, `_hasMetadata`, `_availability`. A facade listing today's members would
 * silently lose a member a future Cesium adds; a prototype view cannot. All of those are READS —
 * verified against 1.143.0 — so nothing shadows onto the derived object.
 *
 * The wrapper is for SAMPLING ONLY. `viewer.terrainProvider` keeps the real provider: the globe
 * renders from its own tile cache and must not be re-pointed at a sampling memo.
 */
export function memoiseTerrainTiles<T extends TerrainTileSource>(provider: T, memo: TerrainTileMemo): T {
    const span = _tracer.startSpan('pryzm.terrain-tile-memo.memoise');
    try {
        const view = Object.create(provider) as T;
        Object.defineProperty(view, 'requestTileGeometry', {
            value: (x: number, y: number, level: number, request?: unknown): Promise<unknown> | undefined =>
                memo.requestTileGeometry(provider, x, y, level, request),
            writable: true,
            configurable: true,
            enumerable: false,
        });
        return view;
    } finally {
        span.end();
    }
}
