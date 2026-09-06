// @vitest-environment happy-dom
//
// §CTX-TREES-RESEAT (L-12918) — founder 2026-09-05: "we don't have trees in Spain but we do have them
// everywhere else". The canopies are a Cesium Primitive whose per-tree ground is baked into the instance
// matrices at load time, sampled before the terrain settled (flat 0). The settled-base re-seat lifted
// every ENTITY layer (buildings, roads, parks, water, landuse) and rebuilt the far tier — and skipped the
// trees, so on every city with baked relief they sat hundreds of metres under the ground. Spain had
// relief; the rest of Europe did not until 2026-09-05's national terrain rollout.
//
// Binds the SHIPPED private method to a stub `this` (the CesiumViewportTerrainRelocationDetach pattern)
// and asserts the one fact the symptom follows from: with relief attached and a primitive placed, the
// re-seat re-runs `loadContextTrees` with `force` at the site the context was loaded for — and does
// nothing on flat ground, or before anything was placed.

import { describe, it, expect, vi } from 'vitest';

vi.mock('cesium', () => ({
    Ion: { defaultAccessToken: '' },
    EllipsoidTerrainProvider: class {},
    CesiumTerrainProvider: { fromUrl: async () => { throw new Error('unused'); } },
    Cartographic: { fromDegrees: (lon: number, lat: number) => ({ lon, lat, height: 0 }) },
    sampleTerrainMostDetailed: async (_p: unknown, c: unknown[]) => c,
}));

import { CesiumViewport } from '../src/ui/geospatial/CesiumViewport';

type LatLon = { lat: number; lon: number };

type Stub = {
    viewer: { scene: { requestRender: () => void } } | null;
    groundReliefAttached: () => boolean;
    // §CTX-RESEAT-ANCHOR-IS-CURRENT-SITE (L-12964) — the CURRENT site, which is what the rebuild
    // anchors on now. The two `…At` memos below are demoted to a staleness check.
    formaMassingOrigin: (LatLon & { centroidEast: number; centroidNorth: number; areaM2: number }) | null;
    readSiteLocation: () => LatLon | null;
    contextBuildingsAt: LatLon | null;
    contextTreesAt: LatLon | null;
    contextTreesPrimitive: object | null;
    formaTerrainBaseHeight: number;
    loadContextTrees: ReturnType<typeof vi.fn>;
    currentContextSite: () => LatLon | null;
    reseatAnchorForCurrentSite: (layer: string, loadedAt: LatLon | null) => LatLon | null;
    rebuildContextTreesForBase: () => void;
};

/** Madrid, Retiro — ~650 m of relief. */
const MADRID: LatLon = { lat: 40.4150, lon: -3.6830 };

function makeStub(over: Partial<Stub> = {}): Stub {
    const proto = CesiumViewport.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    const s: Stub = {
        viewer: { scene: { requestRender: () => {} } },
        groundReliefAttached: () => true,
        formaMassingOrigin: { ...MADRID, centroidEast: 0, centroidNorth: 0, areaM2: 400 },
        readSiteLocation: () => null,
        contextBuildingsAt: { ...MADRID },
        contextTreesAt: { ...MADRID },
        contextTreesPrimitive: {},
        formaTerrainBaseHeight: 651.2,
        loadContextTrees: vi.fn(async () => {}),
        currentContextSite: () => null,
        reseatAnchorForCurrentSite: () => null,
        rebuildContextTreesForBase: () => {},
        ...over,
    };
    for (const m of ['currentContextSite', 'reseatAnchorForCurrentSite', 'rebuildContextTreesForBase'] as const) {
        (s as unknown as Record<string, unknown>)[m] = (proto[m] as (...a: unknown[]) => unknown).bind(s);
    }
    return s;
}

describe('§CTX-TREES-RESEAT (L-12918) — canopies are rebuilt on the settled terrain base', () => {
    it('with relief attached and a primitive placed, re-loads the trees with force at the context site', () => {
        const s = makeStub();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        s.rebuildContextTreesForBase();
        expect(s.loadContextTrees).toHaveBeenCalledTimes(1);
        expect(s.loadContextTrees).toHaveBeenCalledWith(40.4150, -3.6830, true);
    });

    it('is a no-op on flat ground (the load-time seat was already exact)', () => {
        const s = makeStub({ groundReliefAttached: () => false });
        s.rebuildContextTreesForBase();
        expect(s.loadContextTrees).not.toHaveBeenCalled();
    });

    it('is a no-op before anything was placed (the initial load seats itself on the settled base)', () => {
        const s = makeStub({ contextTreesPrimitive: null });
        s.rebuildContextTreesForBase();
        expect(s.loadContextTrees).not.toHaveBeenCalled();
        // No site known AT ALL — genuinely nothing to rebuild (L-12964: a guess is not an anchor).
        const t = makeStub({ formaMassingOrigin: null, readSiteLocation: () => null, contextBuildingsAt: null, contextTreesAt: null });
        t.rebuildContextTreesForBase();
        expect(t.loadContextTrees).not.toHaveBeenCalled();
    });

    // §CTX-TREES-RESEAT-SITE (L-12949) — the founder's Madrid start-up, reproduced.
    it('THE BUG: at start-up the buildings are not fetched yet, and the canopies must STILL be rebuilt', () => {
        // Real start-up order from the founder's console (2026-09-06, Madrid): the layers warm in
        // parallel and the trees render seconds BEFORE the terrain attaches; the footprints are fetched
        // AFTER it ("ground-features re-seat: 2648" then "footprints fetched" on the next line). So
        // contextBuildingsAt is still null when this runs, and reading it meant the canopies were left
        // at base 0 — ~700 m under a city at 700 m — until a parcel click re-ran the block.
        const at = { lat: 40.4168, lon: -3.7035 };
        const s = makeStub({
            formaMassingOrigin: null, readSiteLocation: () => ({ ...at }),
            contextBuildingsAt: null, contextTreesAt: { ...at },
        });
        vi.spyOn(console, 'log').mockImplementation(() => {});
        s.rebuildContextTreesForBase();
        expect(s.loadContextTrees).toHaveBeenCalledWith(at.lat, at.lon, true);
    });

    // ⚠ REWRITTEN 2026-09-06 (§CTX-RESEAT-ANCHOR-IS-CURRENT-SITE, L-12964). This case used to read
    // *"prefers the site the TREES were loaded for when the two disagree"* and asserted
    // `loadContextTrees(2, 2, true)` — i.e. it PINNED the regression. `contextTreesAt` is a memo that
    // nothing clears on a site change, so "prefer the memo" is exactly how the founder's Córdoba
    // console came to read "rebuilding canopies at 37.88507,-4.77718" while the committed parcel was
    // 1.8 km away at 37.88779,-4.79761. Neither memo may win: the CURRENT SITE does.
    // Full coverage lives in CesiumViewportReseatAnchorCurrentSite.test.ts.
    it('neither memo wins when they disagree with the current site — the current site does', () => {
        const s = makeStub({ contextBuildingsAt: { lat: 1, lon: 1 }, contextTreesAt: { lat: 2, lon: 2 } });
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        s.rebuildContextTreesForBase();
        // Both memos are hundreds of km from Madrid, so this is a stale layer → refuse, and let the
        // in-flight load for the current site seat it.
        expect(s.loadContextTrees).not.toHaveBeenCalled();
    });

    it('never throws into the re-seat pass when the reload itself throws', () => {
        const s = makeStub({ loadContextTrees: vi.fn(() => { throw new Error('boom'); }) });
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(() => s.rebuildContextTreesForBase()).not.toThrow();
    });
});
