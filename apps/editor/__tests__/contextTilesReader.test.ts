// §CTX-PMTILES-READER (L-513b) — unit tests for the baked-context-tiles reader.
//
// The load-bearing assertion here is the HONESTY DISCRIMINATOR, not the tile maths: the entire
// reason this subsystem exists is that live Overpass reports failures IN BAND as an empty success
// (§CONTEXT-DATA-HONESTY, L-422/457/467/469), so a reader that collapsed `unavailable` into `[]`
// would have reintroduced the exact bug it replaces. No network in this file.

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
    tilesCovering,
    lonToTileX,
    latToTileY,
    contextTilesBaseUrl,
    contextTilesEnabled,
    contextTilesOrigin,
    readContextTileFeatures,
    __setContextTilesBaseUrl,
    MAX_TILES_PER_FETCH,
    CONTEXT_TILES_SAME_ORIGIN_BASE,
    CONTEXT_TILESET_VERSION,
    clearContextTileArchives,
    contextTileCacheSize,
    zoomForExtent,
    tileCountCovering,
    coalesceRanges,
    __createRangeSourceForTest,
    RANGE_COALESCE_MAX_GAP_BYTES,
    type TileBbox,
    type ContextTileFeature,
} from '../src/ui/geospatial/contextTiles';
import {
    tilesToCollection,
    resolveFarRingCap,
    CONTEXT_FAR_MAX_BUILDINGS,
    CONTEXT_TOTAL_MAX_BUILDINGS,
} from '../src/ui/geospatial/contextBuildings';

afterEach(() => { __setContextTilesBaseUrl(null); });

/** A closed square ring of side ~2·d centred on (lon,lat). */
function square(lon: number, lat: number, d = 0.0001): number[][] {
    return [
        [lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d],
    ];
}

describe('tile addressing', () => {
    it('places Barcelona on the tile the live probe read', () => {
        // Cross-checked against the real archive: 16/33162/24477 covers 41.3874,2.1686.
        expect(lonToTileX(2.1686, 16)).toBe(33162);
        expect(latToTileY(41.3874, 16)).toBe(24477);
    });

    it('covers a bbox row-major with y increasing SOUTHWARD', () => {
        const bbox: TileBbox = [2.16, 41.38, 2.18, 41.40];
        const tiles = tilesCovering(bbox, 16);
        expect(tiles.length).toBeGreaterThan(1);
        // The north edge must map to the LOWEST y — the classic slippy-map sign error.
        const yNorth = latToTileY(41.40, 16);
        const ySouth = latToTileY(41.38, 16);
        expect(yNorth).toBeLessThanOrEqual(ySouth);
        expect(Math.min(...tiles.map((t) => t.y))).toBe(yNorth);
        expect(Math.max(...tiles.map((t) => t.y))).toBe(ySouth);
    });

    it('is insensitive to a bbox given with swapped corners', () => {
        const a = tilesCovering([2.16, 41.38, 2.18, 41.40], 15);
        const b = tilesCovering([2.18, 41.40, 2.16, 41.38], 15);
        expect(b).toEqual(a);
    });

    it('clamps beyond the Mercator limit instead of emitting Infinity', () => {
        expect(Number.isFinite(latToTileY(89.9, 16))).toBe(true);
        expect(Number.isFinite(latToTileY(-89.9, 16))).toBe(true);
    });

    it('covers the real far extent within the fan-out cap', () => {
        // CONTEXT_BBOX_FAR_HALF_DEG = 0.011 around Barcelona — the widest extent we ever ask for.
        const h = 0.011;
        const tiles = tilesCovering([2.1686 - h, 41.3874 - h, 2.1686 + h, 41.3874 + h], 16);
        expect(tiles.length).toBeLessThanOrEqual(MAX_TILES_PER_FETCH);
    });
});

describe('configuration', () => {
    it('is disabled — and says so distinctly — when tiles are explicitly turned off', async () => {
        __setContextTilesBaseUrl('');
        expect(contextTilesEnabled()).toBe(false);
        const r = await readContextTileFeatures('buildings', [2.16, 41.38, 2.17, 41.39]);
        // ⚠ NOT `ok` with []. "Not configured" must never look like "no buildings here".
        expect(r.status).toBe('disabled');
    });

    it('§CTX-TILES-PROXY falls back to the SAME-ORIGIN base when no direct URL is set', () => {
        // The R2 bucket sends no CORS headers, so a browser cannot read it directly. An unset
        // variable must therefore mean "proxy", not "go back to live Overpass" — Overpass is the
        // dependency L-513 proved cannot be made reliable.
        __setContextTilesBaseUrl(null);
        expect(contextTilesBaseUrl()).toBe(CONTEXT_TILES_SAME_ORIGIN_BASE);
        expect(contextTilesEnabled()).toBe(true);
    });

    it('prefers the DIRECT R2 URL when configured, so the proxy unwires itself', () => {
        __setContextTilesBaseUrl('https://cdn.example/tiles/');
        expect(contextTilesBaseUrl()).toBe('https://cdn.example/tiles/');
    });

    it('needs no CSP origin for the same-origin fallback', () => {
        __setContextTilesBaseUrl(null);
        // A relative base has no origin to allowlist — connect-src 'self' already covers it.
        expect(contextTilesOrigin()).toBeNull();
    });

    it('normalises a missing trailing slash so the archive URL is well formed', () => {
        __setContextTilesBaseUrl('https://cdn.example/tiles');
        expect(contextTilesBaseUrl()).toBe('https://cdn.example/tiles/');
    });

    it('exposes the ORIGIN the server CSP must allow (§L-570-CSP)', () => {
        __setContextTilesBaseUrl('https://cdn.example/tiles/');
        // A path in connect-src is meaningless; only the origin is asserted.
        expect(contextTilesOrigin()).toBe('https://cdn.example');
    });

    it('reports no origin — rather than throwing — for a malformed URL', () => {
        __setContextTilesBaseUrl('not a url');
        expect(contextTilesOrigin()).toBeNull();
    });
});

describe('tilesToCollection', () => {
    const tf = (over: Partial<ContextTileFeature> = {}): ContextTileFeature => ({
        rings: [square(2.17, 41.39)],
        tags: { building: 'apartments' },
        syntheticId: 1,
        ...over,
    });

    it('carries the OSM tags through the SAME height/provenance resolver as Overpass', () => {
        const c = tilesToCollection([
            tf({ tags: { building: 'yes', height: '34' }, syntheticId: 1 }),
            tf({ tags: { building: 'yes', 'building:levels': '6' }, syntheticId: 2 }),
            tf({ tags: { building: 'yes' }, syntheticId: 3 }),
        ]);
        expect(c.features.map((f) => f.properties.heightProvenance))
            .toEqual(['tagged', 'derived-levels', 'assumed']);
        expect(c.features[0]!.properties.heightM).toBe(34);
        // A tile footprint is NOT more trustworthy than an Overpass one — the untagged case is
        // still the fabricated 9 m default, and must still be badged `assumed`.
        expect(c.features[2]!.properties.heightM).toBe(9);
        expect(c.features[1]!.properties.floors).toBe(6);
    });

    it('gives every multipolygon PART a distinct id so a Set<osmId> cannot swallow one', () => {
        const c = tilesToCollection([
            tf({ rings: [square(2.17, 41.39), square(2.18, 41.39)], syntheticId: 7 }),
        ]);
        expect(c.features).toHaveLength(2);
        expect(new Set(c.features.map((f) => f.properties.osmId)).size).toBe(2);
    });

    it('keeps ids distinct ACROSS features too', () => {
        const c = tilesToCollection([
            tf({ rings: [square(2.17, 41.39), square(2.18, 41.39)], syntheticId: 7 }),
            tf({ rings: [square(2.19, 41.39)], syntheticId: 8 }),
        ]);
        expect(new Set(c.features.map((f) => f.properties.osmId)).size).toBe(3);
    });

    it('drops degenerate rings rather than emitting a zero-area footprint', () => {
        const c = tilesToCollection([tf({ rings: [[[2.17, 41.39], [2.18, 41.39]]] })]);
        expect(c.features).toHaveLength(0);
    });

    it('returns an empty collection for no input without throwing', () => {
        expect(tilesToCollection([]).features).toHaveLength(0);
    });
});

describe('§L-579 far-ring budget', () => {
    it('spends the whole-scene budget the near ring left over', () => {
        // Eixample, measured live: 3,101 near ⇒ the far ring may draw 2,899, not a flat 900.
        // Under the old fixed cap that site rendered 54% of the buildings OSM actually has.
        expect(resolveFarRingCap(3101, 6000)).toBe(2899);
    });

    it('⚠ is MONOTONE — it can never allow FEWER than the historic cap', () => {
        // The load-bearing property: this change must be INCAPABLE of drawing less than before.
        // A near ring that alone exceeds the budget must still leave the far floor intact rather
        // than fall to zero and blank the surrounding fabric.
        expect(resolveFarRingCap(5900, 6000)).toBe(CONTEXT_FAR_MAX_BUILDINGS);
        expect(resolveFarRingCap(99999, 6000)).toBe(CONTEXT_FAR_MAX_BUILDINGS);
        for (const near of [0, 1, 900, 1600, 3101, 5999, 6000, 12000]) {
            expect(resolveFarRingCap(near, 6000)).toBeGreaterThanOrEqual(CONTEXT_FAR_MAX_BUILDINGS);
        }
    });

    it('lets a SPARSE site keep everything — no invented limit where none is needed', () => {
        // Vila Olímpica, measured: 1,157 near and only 882 far candidates. The allowance must sit
        // comfortably above 882 so a site that costs nothing to draw in full is never truncated.
        expect(resolveFarRingCap(1157, 6000)).toBeGreaterThan(882);
    });

    it('never returns a negative, fractional or zero allowance', () => {
        for (const near of [-5, 0, 7000]) {
            const cap = resolveFarRingCap(near, 6000);
            expect(Number.isInteger(cap)).toBe(true);
            expect(cap).toBeGreaterThan(0);
        }
    });

    it('defaults to the shipped total budget when the near ring is empty', () => {
        expect(resolveFarRingCap(0)).toBe(CONTEXT_TOTAL_MAX_BUILDINGS);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §CTX-RANGE-URL-SOURCE + §CTX-TILE-DECODE-CACHE (L-661) — the 80-SECOND CONTEXT READ.
//
// WHAT THESE PROTECT, and why they assert on the TRANSPORT rather than on a duration.
// The founder's console showed the same bbox read twice, at 79,725 ms and 79,431 ms. Measured
// against the real archive, the work in that read is: 0.84 MB over 36–42 byte ranges, ~800–955 ms
// when the ranges are issued CONCURRENTLY, and 67 ms to decode 13,339 features. The only way to
// reach 80 s is to run the ranges ONE AT A TIME (their latencies sum to 26.5–30.8 s here, and more
// on a home connection) — and the only way for the SECOND read to cost the same as the first, to
// within 0.4%, is for there to be no HTTP cache at all.
//
// Both follow from `pmtiles`' own `FetchSource`, which sets `cache: "no-store"` on every range
// request when it sniffs Windows + Chromium, and addresses every range through ONE URL. So the
// regression that matters is not "is it fast" (untestable without the network, and a duration
// assertion would be flaky anyway) but "does each range get its own cacheable URL, and do we ever
// send no-store". Those are exact, cheap and deterministic.
describe('§CTX-RANGE-URL-SOURCE — the range transport', () => {
    interface Recorded { url: string; init: RequestInit | undefined }
    let calls: Recorded[] = [];
    let realFetch: typeof globalThis.fetch;

    beforeEach(() => {
        calls = [];
        realFetch = globalThis.fetch;
        globalThis.fetch = ((url: string, init?: RequestInit) => {
            calls.push({ url: String(url), init });
            // Bytes that are not a PMTiles header — the read fails honestly, which is fine: these
            // tests are about WHAT WAS REQUESTED, not about decoding a synthetic archive.
            return Promise.resolve({
                status: 206,
                headers: { get: (h: string) => (h.toLowerCase() === 'content-length' ? '16384' : null) },
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(16384)),
            });
        }) as unknown as typeof globalThis.fetch;
        __setContextTilesBaseUrl('https://tiles.test/');
    });

    afterEach(() => {
        globalThis.fetch = realFetch;
        __setContextTilesBaseUrl(null);
        clearContextTileArchives();
    });

    it('gives every byte range its OWN URL, so the ranges cannot contend for one cache entry', async () => {
        await readContextTileFeatures('buildings', [2.16, 41.38, 2.18, 41.40]);
        expect(calls.length).toBeGreaterThan(0);
        for (const c of calls) {
            // The per-range suffix is what makes each request independently cacheable.
            expect(c.url).toMatch(/[?&]r=\d+-\d+/);
        }
    });

    it('keeps the §CONTEXT-CACHE-BUST version stamp — the range suffix is ADDITIVE, never a replacement', async () => {
        await readContextTileFeatures('buildings', [2.16, 41.38, 2.18, 41.40]);
        for (const c of calls) expect(c.url).toContain(`v=${CONTEXT_TILESET_VERSION}`);
    });

    it('still sends a real HTTP Range header — the URL suffix is addressing, not a substitute', async () => {
        await readContextTileFeatures('buildings', [2.16, 41.38, 2.18, 41.40]);
        const headers = calls[0]!.init!.headers as Record<string, string>;
        expect(headers['range']).toMatch(/^bytes=\d+-\d+$/);
    });

    it('NEVER sends cache:no-store — that is the pmtiles Windows/Chromium default that cost 80 s', async () => {
        await readContextTileFeatures('buildings', [2.16, 41.38, 2.18, 41.40]);
        // The whole point: the second read of a tileset must be allowed to hit the browser cache.
        for (const c of calls) expect(c.init?.cache).toBeUndefined();
    });

    it('reports an honest failure when the bytes are not a tileset — it does NOT invent an empty city', async () => {
        const r = await readContextTileFeatures('buildings', [2.16, 41.38, 2.18, 41.40]);
        // §CONTEXT-DATA-HONESTY — a broken read is `unavailable`, never `ok` with zero features.
        expect(r.status).toBe('unavailable');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §CTX-RANGE-COALESCE (L-716) — the founder's fourth "Opening the 3D Site — taking too long".
//
// MEASURED against the live R2 tileset (Barcelona Eixample, scratchpad/probe-ctx-coalesce.mjs):
// one cold open issues 124 range requests carrying 1,002 KiB, and one range request measured
// STRICTLY SERIALLY costs 197 ms (3,948 ms for roads' 20 tiles, against 613 ms concurrently).
// 124 × 197 ms = 24.4 s, against the founder's observed 26–27 s. The bytes are not the problem —
// one megabyte is 1.6 s even at 5 Mbit/s — the ROUND-TRIP COUNT is. Merging adjacent ranges takes
// it to 18 requests for 1,274 KiB.
//
// These tests pin the PROPERTIES that make that safe: the merge arithmetic, the caps, the
// slice-back correctness, and — the load-bearing one — that a failed span never costs a tile.
describe('§CTX-RANGE-COALESCE — merge arithmetic', () => {
    it('merges strictly adjacent ranges into one span with no extra bytes', () => {
        const spans = coalesceRanges([{ offset: 0, length: 10 }, { offset: 10, length: 10 }], 0);
        expect(spans).toHaveLength(1);
        expect(spans[0]).toMatchObject({ offset: 0, length: 20 });
        expect([...spans[0]!.members].sort()).toEqual([0, 1]);
    });

    it('bridges a gap up to the tolerance, and refuses to bridge one beyond it', () => {
        const near = coalesceRanges([{ offset: 0, length: 10 }, { offset: 1_010, length: 10 }], 1_000);
        expect(near).toHaveLength(1);
        expect(near[0]!.length).toBe(1_020); // the 1,000 skipped bytes are the price of one round trip
        const far = coalesceRanges([{ offset: 0, length: 10 }, { offset: 1_011, length: 10 }], 1_000);
        expect(far).toHaveLength(2);
    });

    it('⚠ carries members as INDICES INTO THE INPUT, not into the sorted order', () => {
        // Given out of order, so an implementation that returned sorted positions would pair a
        // tile with another tile's bytes — silently, and only on archives that read backwards.
        const spans = coalesceRanges([{ offset: 100, length: 10 }, { offset: 0, length: 10 }], 1_000);
        expect(spans).toHaveLength(1);
        expect(spans[0]!.offset).toBe(0);
        expect([...spans[0]!.members]).toEqual([1, 0]);
    });

    it('splits rather than merging past the span ceiling — a nonsense merge must not pull a gigabyte', () => {
        const spans = coalesceRanges(
            [{ offset: 0, length: 600 }, { offset: 600, length: 600 }],
            RANGE_COALESCE_MAX_GAP_BYTES,
            1_000,
        );
        expect(spans).toHaveLength(2);
    });

    it('never invents or drops a range — every input is served by exactly one span', () => {
        const ranges = Array.from({ length: 40 }, (_, i) => ({ offset: i * 5_000, length: 900 }));
        const seen = coalesceRanges(ranges).flatMap((s) => [...s.members]).sort((a, b) => a - b);
        expect(seen).toEqual(ranges.map((_, i) => i));
    });

    it('is a no-op shape for a single range — the header read must not grow a span', () => {
        expect(coalesceRanges([{ offset: 0, length: 16_384 }])).toEqual([
            { offset: 0, length: 16_384, members: [0] },
        ]);
    });
});

describe('§CTX-RANGE-COALESCE — the transport', () => {
    interface Recorded { url: string; init: RequestInit | undefined }
    let calls: Recorded[] = [];
    let realFetch: typeof globalThis.fetch;
    /** Fail every request whose range is exactly `"<start>:<length>"` — so a test can poison the
     *  merged SPAN without also poisoning the individual re-issues it falls back to. */
    let failRanges: Set<string>;

    const rangeOf = (init: RequestInit | undefined): { start: number; end: number } => {
        const h = (init?.headers ?? {}) as Record<string, string>;
        const m = /bytes=(\d+)-(\d+)/.exec(h['range'] ?? '');
        return { start: Number(m?.[1] ?? 0), end: Number(m?.[2] ?? 0) };
    };

    beforeEach(() => {
        calls = [];
        failRanges = new Set();
        realFetch = globalThis.fetch;
        globalThis.fetch = ((url: string, init?: RequestInit) => {
            calls.push({ url: String(url), init });
            const { start, end } = rangeOf(init);
            const len = end - start + 1;
            if (failRanges.has(`${start}:${len}`)) return Promise.resolve({ status: 500, headers: { get: () => null } });
            // A body whose every byte equals (absoluteOffset % 251) — so a mis-sliced span is
            // detectable by value, not just by length.
            const buf = new Uint8Array(len);
            for (let i = 0; i < len; i++) buf[i] = (start + i) % 251;
            return Promise.resolve({
                status: 206,
                headers: { get: (h: string) => (h.toLowerCase() === 'content-length' ? String(len) : null) },
                arrayBuffer: () => Promise.resolve(buf.buffer),
            });
        }) as unknown as typeof globalThis.fetch;
    });

    afterEach(() => { globalThis.fetch = realFetch; });

    /** Drive the private transport the way pmtiles does, without a real archive. */
    const source = (): { getBytes(o: number, l: number, s?: AbortSignal): Promise<{ data: ArrayBuffer }> } =>
        __createRangeSourceForTest('https://tiles.test/buildings.pmtiles?v=X');

    it('collapses a fan-out of adjacent ranges into ONE request — the 124→18 property', async () => {
        const src = source();
        // 30 adjacent 1 KiB ranges, issued the way `Promise.all(tiles.map(...))` issues them.
        const wanted = Array.from({ length: 30 }, (_, i) => ({ offset: i * 1_024, length: 1_024 }));
        const got = await Promise.all(wanted.map((r) => src.getBytes(r.offset, r.length)));
        expect(calls).toHaveLength(1);
        expect(got).toHaveLength(30);
        // Every caller got ITS OWN bytes back, not the span's head.
        for (let i = 0; i < wanted.length; i++) {
            const first = new Uint8Array(got[i]!.data)[0];
            expect(first).toBe(wanted[i]!.offset % 251);
            expect(got[i]!.data.byteLength).toBe(1_024);
        }
    });

    it('splits at a gap wider than the tolerance instead of pulling the whole archive', async () => {
        const src = source();
        await Promise.all([
            src.getBytes(0, 1_024),
            src.getBytes(50_000_000, 1_024),
        ]);
        expect(calls).toHaveLength(2);
    });

    it('⚠ a failed span RE-ISSUES its members individually — coalescing must never cost a tile', async () => {
        const src = source();
        failRanges.add('0:3072'); // poison the MERGED span, not the individual ranges
        const got = await Promise.all([
            src.getBytes(0, 1_024),
            src.getBytes(1_024, 1_024),
            src.getBytes(2_048, 1_024),
        ]);
        // 1 failed span + 3 individual re-issues = 4 requests, and NOT ONE TILE LOST. This is the
        // property that makes the optimisation safe: the worst case is exactly today's behaviour.
        expect(got.map((g) => g.data.byteLength)).toEqual([1_024, 1_024, 1_024]);
        expect(new Uint8Array(got[2]!.data)[0]).toBe(2_048 % 251);
        expect(calls).toHaveLength(4);
    });

    it('reports the failure honestly when the individual retry fails too — no empty success', async () => {
        const src = source();
        failRanges.add('0:2048').add('0:1024').add('1024:1024');
        const results = await Promise.allSettled([src.getBytes(0, 1_024), src.getBytes(1_024, 1_024)]);
        // §CONTEXT-DATA-HONESTY — a broken read REJECTS. It must never resolve with zero bytes,
        // which the decoder would read as "this tile is empty".
        expect(results.every((r) => r.status === 'rejected')).toBe(true);
    });

    it('drops a caller that aborted while the window was open — and fetches nothing for it', async () => {
        const src = source();
        const ac = new AbortController();
        const p = src.getBytes(0, 1_024, ac.signal);
        ac.abort();
        await expect(p).rejects.toThrow(/abort/i);
        expect(calls).toHaveLength(0);
    });

    it('never sends an AbortSignal on the wire — one caller must not empty a shared download', async () => {
        const src = source();
        const ac = new AbortController();
        await Promise.all([src.getBytes(0, 1_024, ac.signal), src.getBytes(1_024, 1_024)]);
        for (const c of calls) expect((c.init as { signal?: unknown } | undefined)?.signal).toBeUndefined();
    });
});

describe('§CTX-TILE-DECODE-CACHE — one read per TILE', () => {
    afterEach(() => { __setContextTilesBaseUrl(null); clearContextTileArchives(); });

    it('starts empty and is emptied by the archive reset', () => {
        clearContextTileArchives();
        expect(contextTileCacheSize()).toBe(0);
    });

    it('is dropped when the tiles base URL changes — decoded features belong to ONE tileset', () => {
        // Reconfiguring must never serve one tileset's decoded features under another's config.
        __setContextTilesBaseUrl('https://a.test/');
        __setContextTilesBaseUrl('https://b.test/');
        expect(contextTileCacheSize()).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §CTX-ZOOM-FITS-EXTENT (L-662) — the two WIDEST context layers were never served from the baked
// tiles at all. `landuse` (CONTEXT_WIDE_HALF_DEG, 0.072° ≈ 8 km radius) and `water`
// (CONTEXT_SEA_HALF_DEG, 0.10° ≈ 11 km) need ~1,008 and ~1,900 tiles at the fixed z16, blew the
// 64-tile cap on EVERY read, and fell back to live Overpass — the third party this subsystem
// exists to remove.
//
// ⚠ THE CAUSE IS THE FIXED ZOOM, NOT A BAD BBOX. Those extents are declared constants; they are
// that wide by design, for any search anywhere. Asking for 450-metre tiles across 16–22 km of
// ground is the error. Verified against the real archive: at z13 landuse reads 30 tiles / 8,246
// features and water 49 tiles / 5,283 features, both from the tiles, no Overpass call.
describe('§CTX-ZOOM-FITS-EXTENT — precision is chosen to match the extent', () => {
    const around = (halfDeg: number): TileBbox => {
        const lat = 41.3888, lon = 2.159;
        const k = 1 / Math.cos((lat * Math.PI) / 180);
        return [lon - halfDeg * k, lat - halfDeg, lon + halfDeg * k, lat + halfDeg];
    };

    it('keeps the NEAR buildings extent at full z16 — the hot path must not regress', () => {
        // CONTEXT_BBOX_FAR_HALF_DEG = 0.011 already fits the cap at z16.
        expect(zoomForExtent(around(0.011), 16, 12)).toBe(16);
    });

    it('steps the 8 km landuse extent down until it fits, instead of refusing', () => {
        const z = zoomForExtent(around(0.072), 16, 9);
        expect(z).toBeLessThan(16);
        expect(tileCountCovering(around(0.072), z)).toBeLessThanOrEqual(MAX_TILES_PER_FETCH);
    });

    it('steps the 11 km sea extent down until it fits', () => {
        const z = zoomForExtent(around(0.1), 16, 8);
        expect(tileCountCovering(around(0.1), z)).toBeLessThanOrEqual(MAX_TILES_PER_FETCH);
    });

    it('counts without enumerating — a huge extent must not allocate a tile per tile', () => {
        // Arithmetic, so this is instant and allocation-free. Calling `tilesCovering` here would
        // try to build ~10^9 objects and crash the process — which is what happened when this
        // guard was first written: the protection against a nonsense extent WAS the crash.
        expect(tileCountCovering([-90, -45, 90, 45], 16)).toBeGreaterThan(1e8);
        expect(tileCountCovering(around(0.011), 16)).toBe(tilesCovering(around(0.011), 16).length);
    });

    it('never goes below the tileset floor, even when nothing fits', () => {
        // A whole-hemisphere bbox cannot fit at any level; the reader must still refuse rather
        // than read a level the archive does not carry.
        expect(zoomForExtent([-90, -45, 90, 45], 16, 12)).toBe(12);
    });

    it('never returns FINER than asked — a coarse layer is not silently upgraded', () => {
        expect(zoomForExtent(around(0.001), 13, 9)).toBe(13);
    });

    it('picks the FINEST zoom that fits, not merely any that fits', () => {
        const z = zoomForExtent(around(0.072), 16, 9);
        // One level finer must genuinely be over the cap, or we gave away precision for nothing.
        expect(tileCountCovering(around(0.072), z + 1)).toBeGreaterThan(MAX_TILES_PER_FETCH);
    });
});
