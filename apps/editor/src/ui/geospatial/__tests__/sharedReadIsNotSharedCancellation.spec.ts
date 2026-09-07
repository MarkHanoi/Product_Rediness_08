// §CTX-ONE-READ-PER-BBOX / §ABORT-PROMISES-NOTHING (L-13171, 2026-09-07, lane GULF-TERRAIN-SLUG) —
// ONE consumer's cancellation must never become EVERY consumer's empty answer.
//
// THE DEFECT. The founder's Dubai, Abu Dhabi and Riyadh consoles carried a render line for every
// context layer EXCEPT roads, and `§STREET-LIFE: 0 mapped lamp(s) … along 0 road way(s) + 0 synthetic
// pedestrian(s)` — street life is synthesised FROM the road network, so one defect, three symptoms.
// `CesiumViewport.loadContextRoads` opens by aborting its previous controller, then calls
// `fetchContextRoads` again; `inFlight.delete(key)` lives in a `.finally` that has not run yet, so
// the second call ADOPTED the promise it had just poisoned and received `emptyRoadCollection()`.
//
// ⭐ THE TELL WAS THE LIST OF LAYERS THAT WORKED. L-585 / L-13110 moved parks, rail, trees,
// furniture, landuse and buildings onto "shared read takes NO signal, each caller checks its own
// after the await". `roads` and `water` were the only two left on the old shape — and roads is
// exactly the layer that never rendered. This spec pins that they are now all one shape.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The readers cache per module instance, so each case gets a fresh module registry.
beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/**
 * The read funnel every context reader sits on. Held open by a deferred so a test can abort a
 * consumer WHILE the shared read is in flight — the exact window the defect lived in.
 */
function stubReader() {
    let release!: (features: unknown[]) => void;
    const started: string[] = [];
    const gate = new Promise<unknown[]>((res) => { release = res; });
    const readContextTileFeatures = vi.fn(async (layer: string, _bbox: unknown, signal?: AbortSignal) => {
        started.push(layer);
        const features = await gate;
        // ⛔ THE DEFECT, REPRODUCED: the funnel honours whatever signal it was handed. If the shared
        // promise is driven by one consumer's signal, that consumer's abort empties it for everyone.
        if (signal?.aborted) return { status: 'aborted' as const, features: [], tilesRead: 0, tilesFailed: 0, ms: 1 };
        return { status: 'ok' as const, features, tilesRead: 1, tilesFailed: 0, ms: 1 };
    });
    return { readContextTileFeatures, release: (f: unknown[] = []) => release(f), started };
}

/** A ~905 m RESIDENTIAL street through Business Bay (0.009 deg of longitude at lat 25.18). The class
 *  matters: `placePedestrians` walks footway/pedestrian/path/steps centre-lines and residential /
 *  tertiary sidewalks ONLY, so a `primary` way would place lamps and no people — correctly, and for a
 *  reason that has nothing to do with this defect. */
const LONG_ROAD = [{
    rings: [[[55.2550, 25.1845], [55.2640, 25.1845]]],
    tags: { highway: 'residential' },
    syntheticId: 7,
}];

/** One baked road way in Business Bay, in the REAL `ContextTileFeature` shape the reader emits
 *  (`rings` + stringified `tags`, not GeoJSON `geometry`/`properties` — a fixture invented from the
 *  call site rather than the type is a fake that cannot falsify anything). */
const ONE_ROAD = [{
    rings: [[[55.25, 25.18], [55.26, 25.19]]],
    tags: { highway: 'primary' },
    syntheticId: 1,
}];

describe('§CTX-ONE-READ-PER-BBOX (L-13171) — roads: a cancelled consumer does not empty the others', () => {
    it('a second caller that ABORTS the first still receives the real ways', async () => {
        const stub = stubReader();
        vi.doMock('../contextTiles', async (orig) => ({
            ...(await orig<Record<string, unknown>>()),
            readContextTileFeatures: stub.readContextTileFeatures,
        }));
        const { fetchContextRoads } = await import('../contextRoads');

        // Consumer A opens the shared read, then cancels — exactly what `loadContextRoads` does to
        // itself on its second call (abort, then re-enter and adopt the same in-flight promise).
        const a = new AbortController();
        const pA = fetchContextRoads(25.18451, 55.25983, a.signal);
        a.abort();
        // Consumer B (street life) adopts the SAME in-flight promise while it is still running.
        const b = new AbortController();
        const pB = fetchContextRoads(25.18451, 55.25983, b.signal);
        stub.release(ONE_ROAD);

        // ⭐ THE ASSERTION THE DEFECT FAILED: B never cancelled anything, so B gets the roads.
        expect((await pB).ways.length).toBe(1);
        // A cancelled, so A honestly gets nothing — a fact about A's view, not about the world.
        expect((await pA).ways.length).toBe(0);
        // …and exactly ONE underlying read was issued for the bbox (the sharing still works).
        expect(stub.started.filter((l) => l === 'roads').length).toBe(1);
    });

    it('the abandoned read still fills the cache, so the NEXT caller is served', async () => {
        const stub = stubReader();
        vi.doMock('../contextTiles', async (orig) => ({
            ...(await orig<Record<string, unknown>>()),
            readContextTileFeatures: stub.readContextTileFeatures,
        }));
        const { fetchContextRoads } = await import('../contextRoads');

        const a = new AbortController();
        const pA = fetchContextRoads(25.18451, 55.25983, a.signal);
        a.abort();
        stub.release(ONE_ROAD);
        expect((await pA).ways.length).toBe(0);          // A dropped it, honestly

        // The read it paid for is not wasted — this is what makes "do not share the cancellation"
        // cheap rather than merely correct.
        const after = await fetchContextRoads(25.18451, 55.25983);
        expect(after.ways.length).toBe(1);
        expect(stub.started.filter((l) => l === 'roads').length).toBe(1);
    });
});

describe('§CTX-ONE-READ-PER-BBOX (L-13171) — water: the OTHER layer left behind, fixed on the same evidence', () => {
    it('a cancelled consumer does not empty a concurrent one', async () => {
        const stub = stubReader();
        vi.doMock('../contextTiles', async (orig) => ({
            ...(await orig<Record<string, unknown>>()),
            readContextTileFeatures: stub.readContextTileFeatures,
        }));
        const { fetchContextWater } = await import('../contextWater');

        const a = new AbortController();
        const pA = fetchContextWater(25.18451, 55.25983, a.signal);
        const b = new AbortController();
        const pB = fetchContextWater(25.18451, 55.25983, b.signal);
        a.abort();
        stub.release([]);

        // Both resolve; B's answer is the read's own verdict, never A's cancellation.
        await expect(pA).resolves.toBeTruthy();
        await expect(pB).resolves.toBeTruthy();
        expect(stub.started.filter((l) => l === 'water').length).toBe(1);
    });
});

describe('§ABORT-PROMISES-NOTHING (L-13171) — the read funnel stops promising a repaint it cannot deliver', () => {
    it('the ABORTED line no longer says "a newer read paints this layer"', async () => {
        // The sentence was FALSE in exactly the Gulf case: the "newer read" WAS the cancelled one.
        // A log line that asserts a behaviour the code does not provide sends the next reader to the
        // wrong file — the same class of defect as a gate that does not gate.
        const [fs, path] = await Promise.all([import('node:fs'), import('node:path')]);
        const src = fs.readFileSync(
            path.resolve(process.cwd(), 'apps/editor/src/ui/geospatial/contextTiles.ts'), 'utf8');
        const aborted = src.slice(src.indexOf("layer=${layer} ABORTED"));
        expect(aborted.slice(0, 900)).not.toMatch(/a newer read paints this layer/);
        expect(src).toMatch(/§ABORT-PROMISES-NOTHING/);
        // What IS true is still said: an abort is neither a failure nor an empty.
        expect(aborted.slice(0, 900)).toMatch(/NOT a failure, NOT an empty/);
    });
});

describe('§STREET-LIFE (L-12936 / L-13171) — the lamps and pedestrians come back WITH the roads', () => {
    it('the recovered collection drives lamps and pedestrians, so one fix closes all three symptoms', async () => {
        // ⭐ VERIFIED, NOT ASSUMED. The founder's three Gulf traces read
        // `0 mapped lamp(s) + 0 synthesised lamp(s) along 0 road way(s) + 0 synthetic pedestrian(s)`.
        // Street life is SYNTHESISED FROM THE ROAD NETWORK — `placeLamps(…, roads.ways, …)` and
        // `placePedestrians(roads.ways, …)` — so "no roads", "no street furniture" and "no people"
        // were one defect. This walks the ACTUAL chain: a consumer aborts, the road read survives,
        // and the ways it returns are handed to the real synthesisers.
        const stub = stubReader();
        vi.doMock('../contextTiles', async (orig) => ({
            ...(await orig<Record<string, unknown>>()),
            readContextTileFeatures: stub.readContextTileFeatures,
        }));
        const { fetchContextRoads } = await import('../contextRoads');
        const { placeLamps, placePedestrians } = await import('../contextStreetLife');

        const a = new AbortController();
        const pA = fetchContextRoads(25.18451, 55.25983, a.signal);
        a.abort();                                   // the loader cancels itself, as it did in Dubai
        const b = new AbortController();
        const pB = fetchContextRoads(25.18451, 55.25983, b.signal);
        stub.release(LONG_ROAD);

        expect((await pA).ways.length).toBe(0);      // the caller that gave up gets nothing, honestly
        const roads = await pB;
        expect(roads.ways.length).toBe(1);           // …and the one still watching gets the street

        const origin = { lat: 25.18451, lon: 55.25983 };
        const lamps = placeLamps([], roads.ways, { origin, radiusM: 2519 });
        const people = placePedestrians(roads.ways, [], { origin, radiusM: 2519 });
        expect(lamps.lamps.length).toBeGreaterThan(0);
        expect(people.people.length).toBeGreaterThan(0);

        // ⚠ No land-use is handed in, so these are RURAL-spaced people (§STREET-LIFE treats an absence
        // as NOT urban — an absence is never an urban finding). The point here is > 0, not the density.
        // …and the counter-case, which is what the console actually printed: no ways in, nothing out.
        expect(placeLamps([], [], { origin, radiusM: 2519 }).lamps.length).toBe(0);
        expect(placePedestrians([], [], { origin, radiusM: 2519 }).people.length).toBe(0);
    });
});
