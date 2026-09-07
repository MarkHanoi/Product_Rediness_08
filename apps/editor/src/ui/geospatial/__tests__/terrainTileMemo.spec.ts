// §TERRAIN-TILE-MEMO (L-13077) — the founder's Barcelona start-up fetched the SAME 12 level-14
// terrain tiles TWICE, five seconds each, because `sampleTerrainMostDetailed` builds its tile set
// fresh on every call and `CesiumTerrainProvider.requestTileGeometry` has no memo of its own.
// These tests pin the behaviour that removes the second download WITHOUT removing a single measured
// point, and — just as important — pin the three ways a cache like this goes wrong: memoising a
// failure, swallowing back-pressure, and growing without a bound.
import { describe, it, expect, vi } from 'vitest';
import {
    TerrainTileMemo,
    memoiseTerrainTiles,
    terrainTileMemoKey,
    type TerrainTileSource,
} from '../terrainTileMemo';

/** A counting stand-in for `CesiumTerrainProvider`: every call is a fresh "download". */
function fakeProvider(): TerrainTileSource & { calls: Array<string>; tiles: Map<string, object> } {
    const calls: Array<string> = [];
    const tiles = new Map<string, object>();
    return {
        calls,
        tiles,
        requestTileGeometry(x: number, y: number, level: number): Promise<unknown> {
            const key = terrainTileMemoKey(x, y, level);
            calls.push(key);
            const data = { key, decodedAt: calls.length };
            tiles.set(key, data);
            return Promise.resolve(data);
        },
    };
}

describe('§TERRAIN-TILE-MEMO — the second flight must not re-download the first flight’s tiles', () => {
    it('pays for the tile set ONCE across two flights over the same bbox (the founder’s 12-twice)', async () => {
        const provider = fakeProvider();
        const memo = new TerrainTileMemo();
        const view = memoiseTerrainTiles(provider, memo);

        // Flight 1 — the probe batch: 12 distinct tiles, exactly the founder's reading.
        const flight1 = await Promise.all(
            Array.from({ length: 12 }, (_, i) => view.requestTileGeometry(1000 + i, 2000, 14)),
        );
        // Flight 2 — the split-piece batch. It CANNOT be merged into flight 1 (its points are not
        // knowable until flight 1 returns), so the only way not to pay twice is to keep the tiles.
        const flight2 = await Promise.all(
            Array.from({ length: 12 }, (_, i) => view.requestTileGeometry(1000 + i, 2000, 14)),
        );

        expect(provider.calls.length).toBe(12);          // 12, not 24.
        expect(memo.stats.downloads).toBe(12);
        expect(memo.stats.hits).toBe(12);
        expect(memo.stats.requests).toBe(24);
        // ⛔ AND THE SECOND FLIGHT STILL GETS A REAL DECODED TILE FOR EVERY POINT — the SAME object,
        // not a cheaper approximation of it. Nothing is dropped, defaulted or synthesised.
        expect(flight2).toEqual(flight1);
        for (const t of flight2) expect(t).toBeDefined();
    });

    it('keys by level/x/y, so a different tile is still downloaded', async () => {
        const provider = fakeProvider();
        const memo = new TerrainTileMemo();
        const view = memoiseTerrainTiles(provider, memo);
        await view.requestTileGeometry(5, 6, 14);
        await view.requestTileGeometry(5, 6, 15);        // same x/y, different level
        await view.requestTileGeometry(6, 6, 14);        // different x
        expect(provider.calls).toEqual(['14/5/6', '15/5/6', '14/6/6']);
        expect(memo.stats.hits).toBe(0);
    });

    it('shares ONE download between two callers that ask before it settles', async () => {
        let release: (v: unknown) => void = () => { /* replaced below */ };
        let calls = 0;
        const provider: TerrainTileSource = {
            requestTileGeometry(): Promise<unknown> {
                calls++;
                return new Promise((resolve) => { release = resolve; });
            },
        };
        const memo = new TerrainTileMemo();
        const view = memoiseTerrainTiles(provider, memo);
        const a = view.requestTileGeometry(1, 1, 14);
        const b = view.requestTileGeometry(1, 1, 14);
        release({ ok: true });
        expect(await a).toEqual({ ok: true });
        expect(await b).toEqual({ ok: true });
        expect(calls).toBe(1);
    });
});

describe('§TERRAIN-TILE-MEMO — the three ways a cache like this lies', () => {
    it('NEVER memoises a failure — a transient 503 must not read as "no ground here" forever', async () => {
        let attempt = 0;
        const provider: TerrainTileSource = {
            requestTileGeometry(): Promise<unknown> {
                attempt++;
                return attempt === 1 ? Promise.reject(new Error('503')) : Promise.resolve({ ok: true });
            },
        };
        const memo = new TerrainTileMemo();
        const view = memoiseTerrainTiles(provider, memo);

        await expect(view.requestTileGeometry(1, 1, 14)).rejects.toThrow('503');
        expect(memo.stats.failures).toBe(1);
        expect(memo.stats.resident).toBe(0);             // the failure was dropped, not kept.

        // The retry reaches the provider and gets a real tile.
        await expect(view.requestTileGeometry(1, 1, 14)).resolves.toEqual({ ok: true });
        expect(attempt).toBe(2);
        expect(memo.stats.resident).toBe(1);
    });

    it('passes `undefined` through unchanged — it is back-pressure, not a tile', async () => {
        // Cesium's `drainTileRequestQueue` reads `undefined` as "the scheduler is saturated, retry
        // in 100 ms" (Cesium.js:207985). Turning it into a resolved promise would silently DROP the
        // tile and every point inside it.
        let saturated = true;
        const provider: TerrainTileSource = {
            requestTileGeometry(): Promise<unknown> | undefined {
                if (saturated) { saturated = false; return undefined; }
                return Promise.resolve({ ok: true });
            },
        };
        const memo = new TerrainTileMemo();
        const view = memoiseTerrainTiles(provider, memo);
        expect(view.requestTileGeometry(1, 1, 14)).toBeUndefined();
        expect(memo.stats.downloads).toBe(0);
        expect(memo.stats.resident).toBe(0);
        await expect(view.requestTileGeometry(1, 1, 14)).resolves.toEqual({ ok: true });
    });

    it('is BOUNDED — least-recently-used is evicted and the eviction is counted', async () => {
        const provider = fakeProvider();
        const memo = new TerrainTileMemo({ maxTiles: 2 });
        const view = memoiseTerrainTiles(provider, memo);
        await view.requestTileGeometry(1, 0, 14);
        await view.requestTileGeometry(2, 0, 14);
        await view.requestTileGeometry(1, 0, 14);        // touch tile 1 → tile 2 is now the LRU
        await view.requestTileGeometry(3, 0, 14);        // evicts tile 2
        expect(memo.stats.resident).toBe(2);
        expect(memo.stats.evicted).toBe(1);
        await view.requestTileGeometry(1, 0, 14);
        expect(provider.calls.filter((k) => k === '14/1/0').length).toBe(1);   // still held
        await view.requestTileGeometry(2, 0, 14);
        expect(provider.calls.filter((k) => k === '14/2/0').length).toBe(2);   // was evicted
    });

    it('clear() drops every held tile, so a new city never answers with the old one’s ground', async () => {
        const provider = fakeProvider();
        const memo = new TerrainTileMemo();
        const view = memoiseTerrainTiles(provider, memo);
        await view.requestTileGeometry(1, 1, 14);
        expect(memo.stats.resident).toBe(1);
        memo.clear();
        expect(memo.stats.resident).toBe(0);
        await view.requestTileGeometry(1, 1, 14);
        expect(provider.calls.length).toBe(2);
    });
});

describe('§TERRAIN-TILE-MEMO — the wrapper is a VIEW of the provider, not a facade of it', () => {
    it('reaches every other member through the prototype chain and leaves the real one untouched', async () => {
        const provider = {
            tilingScheme: { name: 'geographic' },
            availability: { max: 14 },
            _requestVertexNormals: true,
            loadTileDataAvailability(): undefined { return undefined; },
            requestTileGeometry(): Promise<unknown> { return Promise.resolve({ ok: true }); },
        };
        const original = provider.requestTileGeometry;
        const memo = new TerrainTileMemo();
        const view = memoiseTerrainTiles(provider, memo);

        // Every member Cesium's sampling path reads is still reachable, by identity.
        expect(view.tilingScheme).toBe(provider.tilingScheme);
        expect(view.availability).toBe(provider.availability);
        expect(view._requestVertexNormals).toBe(true);
        expect(view.loadTileDataAvailability()).toBeUndefined();
        // ⛔ AND THE REAL PROVIDER IS NOT MUTATED — the globe keeps sampling-free behaviour.
        expect(provider.requestTileGeometry).toBe(original);
        expect(Object.prototype.hasOwnProperty.call(provider, 'requestTileGeometry')).toBe(true);
        expect(view.requestTileGeometry).not.toBe(original);
        await expect(view.requestTileGeometry(1, 1, 14)).resolves.toEqual({ ok: true });
    });

    it('calls a shared tile’s createMesh ONCE — a second call would scrape its own buffers', async () => {
        // `QuantizedMeshTerrainData.prototype.createMesh` (Cesium.js:256607) NULLS `_quantizedVertices`
        // when its worker task returns. On the un-memoised path each sample call had its own decoded
        // instance so that was harmless; a SHARED instance can be asked twice, and the second ask
        // would lose real measurements to UNMEASURED. The memo guards it.
        const createMesh = vi.fn(() => Promise.resolve({ mesh: true }));
        const data = { createMesh };
        const provider: TerrainTileSource = {
            requestTileGeometry(): Promise<unknown> { return Promise.resolve(data); },
        };
        const memo = new TerrainTileMemo();
        const view = memoiseTerrainTiles(provider, memo);
        const t = (await view.requestTileGeometry(1, 1, 14)) as { createMesh: (o: unknown) => Promise<unknown> };
        const m1 = await t.createMesh({ throttle: false });
        const m2 = await t.createMesh({ throttle: false });
        expect(createMesh).toHaveBeenCalledTimes(1);
        expect(m1).toBe(m2);
    });
});
