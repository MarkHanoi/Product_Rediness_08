// @vitest-environment happy-dom
//
// §TERRAIN-RELOCATION-DETACH (L-12913) — the founder's all-white 3D Site at São Martinho do Porto /
// Porto / a German village (2026-09-05, production ee5d00a2), reproduced at the layer the user
// experiences: `viewer.terrainProvider` after relocating.
//
// MECHANISM. A baked quantized-mesh tileset is BOUNDED (its layer.json `available` covers one city;
// Barcelona's z0 range is `{startX:1,endX:1}` — the east-hemisphere root alone, measured on R2
// 2026-09-05). `maybeAttachTerrainProvider`'s non-attach branches used to `return`, leaving the
// previous city's provider attached; over Portugal that provider has no tiles at all → the west root
// FAILS, the east root is culled, `renderedTerrainTiles=0`, and the page background is the ground —
// while the log said "skip: no-baked-city → flat ground". The founder's console had both lines.
//
// THIS TEST binds the SHIPPED private methods to a stub `this` (the pattern of
// `CesiumViewportFrameNoJump.test.ts` / `CesiumViewportSiteMetricHeatmapSeat.test.ts`): the real
// `maybeAttachTerrainProvider` + `detachBakedTerrain` + `groundReliefAttached` +
// `terrainProviderHasElevationData` + `terrainProviderState` run against a fake viewer and a
// mocked `cesium` whose `CesiumTerrainProvider.fromUrl` resolves ONLY for the slugs that exist in R2
// today (barcelona / badalona / paris → 200; portugal / germany / france / marseille → 404, all
// measured 2026-09-05). The resolver (`decideBakedTerrainAttach`) and the bbox tables are the real
// ones. It is not a pixel test — no headless Cesium exists here — it asserts the provider the globe
// is handed, which is the fact the white ground follows from.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `vi.mock` factories are hoisted above every import, so the fakes they hand out must be hoisted
// with them (`vi.hoisted`) — a plain module-level `class` would be in its TDZ when the factory runs.
const H = vi.hoisted(() => {
    // The tilesets that exist in R2 today (layer.json → 200, measured 2026-09-05). The region rows
    // (portugal / germany / france / spain) and marseille → 404.
    const PUBLISHED = new Set(['barcelona', 'badalona', 'paris']);
    class FakeEllipsoidTerrainProvider {
        readonly kind = 'ellipsoid';
        // The real one has NO `availability` (that is exactly why `terrainProviderHasElevationData` uses it).
        readonly hasVertexNormals = false;
    }
    class FakeBoundedProvider {
        readonly kind = 'bounded';
        readonly availability = { computeMaximumLevelAtPosition: () => 0 };
        readonly hasVertexNormals = true;
        constructor(readonly url: string) {}
    }
    const fromUrl = vi.fn(async (url: string): Promise<FakeBoundedProvider> => {
        const slug = /terrain\/([a-z0-9]+)\?/.exec(url)?.[1] ?? '';
        if (!PUBLISHED.has(slug)) throw new Error(`404 ${url}/layer.json`);
        return new FakeBoundedProvider(url);
    });
    const sampleTerrainMostDetailed = vi.fn(async (_p: unknown, cartos: Array<{ height?: number }>) =>
        cartos.map((c) => ({ ...c, height: 12 })));
    return { FakeEllipsoidTerrainProvider, FakeBoundedProvider, fromUrl, sampleTerrainMostDetailed };
});
const { FakeEllipsoidTerrainProvider, FakeBoundedProvider, fromUrl } = H;
type FakeBoundedProvider = InstanceType<typeof H.FakeBoundedProvider>;

vi.mock('cesium', () => ({
    Ion: { defaultAccessToken: '' },
    EllipsoidTerrainProvider: H.FakeEllipsoidTerrainProvider,
    CesiumTerrainProvider: { fromUrl: (url: string, _o: unknown) => H.fromUrl(url) },
    Cartographic: { fromDegrees: (lon: number, lat: number) => ({ lon, lat, height: 0 }) },
    sampleTerrainMostDetailed: (p: unknown, c: Array<{ height?: number }>) => H.sampleTerrainMostDetailed(p, c),
}));

import { CesiumViewport } from '../src/ui/geospatial/CesiumViewport';
import { __setContextTilesBaseUrl } from '../src/ui/geospatial/contextTiles';

type Viewer = {
    terrainProvider: unknown;
    scene: { globe: { show: boolean; enableLighting: boolean; depthTestAgainstTerrain: boolean; _surface: { invalidateAllTiles: () => void } }; requestRender: () => void };
    camera: { positionCartographic: { height: number } };
    isDestroyed: () => boolean;
};
type Stub = {
    viewer: Viewer;
    formaTerrainEnabled: boolean;
    photorealTilesActive: boolean;
    formaMode: boolean;
    formaTerrainCity: string | null;
    formaTerrainTarget: string | null;
    formaTerrainAttach: Map<string, Promise<unknown>>;
    formaTerrainSampledAt: unknown;
    formaTerrainBaseHeight: number;
    formaTerrainBaseSource: string;
    formaTerrainBaseMeasured: boolean;
    contextGroundCache: Map<string, number>;
    formaUserMovedCamera: boolean;
    formaLastMassingInput: unknown;
    frameSiteLocationAtGround: ReturnType<typeof vi.fn>;
    clampTerrainThenReplace: ReturnType<typeof vi.fn>;
    maybeAttachTerrainProvider: (lat: number, lon: number) => Promise<void>;
    detachBakedTerrain: () => void;
    groundReliefAttached: () => boolean;
    terrainProviderHasElevationData: (p: unknown) => boolean;
    terrainProviderState: () => unknown;
    isViewerLive: () => boolean;
};

const proto = CesiumViewport.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;

function makeStub(): Stub {
    const viewer: Viewer = {
        terrainProvider: new FakeEllipsoidTerrainProvider(),
        scene: {
            globe: { show: true, enableLighting: false, depthTestAgainstTerrain: false, _surface: { invalidateAllTiles: () => {} } },
            requestRender: () => {},
        },
        camera: { positionCartographic: { height: 800 } },
        isDestroyed: () => false,
    };
    const stub = {
        viewer,
        formaTerrainEnabled: true,
        photorealTilesActive: false,
        formaMode: true,
        formaTerrainCity: null,
        formaTerrainTarget: null,
        formaTerrainAttach: new Map(),
        formaTerrainSampledAt: null,
        formaTerrainBaseHeight: 0,
        formaTerrainBaseSource: 'ellipsoid-flat-ground',
        formaTerrainBaseMeasured: true,
        contextGroundCache: new Map(),
        formaUserMovedCamera: false,
        formaLastMassingInput: null,
        frameSiteLocationAtGround: vi.fn(),
        clampTerrainThenReplace: vi.fn(),
    } as unknown as Stub;
    for (const m of ['maybeAttachTerrainProvider', 'detachBakedTerrain', 'groundReliefAttached',
        'terrainProviderHasElevationData', 'terrainProviderState', 'isViewerLive'] as const) {
        expect(typeof proto[m], `CesiumViewport.prototype.${m} must exist`).toBe('function');
        (stub as unknown as Record<string, unknown>)[m] = proto[m]!.bind(stub);
    }
    return stub;
}

// The founder's sites + the east-hemisphere city whose tileset was the stale provider.
const BARCELONA = { lat: 41.39, lon: 2.17 };
const SAO_MARTINHO = { lat: 39.509, lon: -9.134 };   // → region 'portugal' in HEAD; 'no-baked-city' in production ee5d00a2
const PORTO = { lat: 41.1447, lon: -8.6456 };         // → region 'portugal' (R2 404 today)
const GERMAN_VILLAGE = { lat: 49.85, lon: 10.2 };     // → region 'germany' (R2 404 today)
const CASABLANCA = { lat: 33.57, lon: -7.59 };        // → outside every bbox: the resolver's own 'no-baked-city'

let logs: string[] = [];
let warns: string[] = [];

describe('§TERRAIN-RELOCATION-DETACH (L-12913) — relocating off a baked city detaches its tileset', () => {
    beforeEach(() => {
        __setContextTilesBaseUrl('https://tiles.example/tiles/');
        fromUrl.mockClear();
        logs = []; warns = [];
        vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
        vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { warns.push(a.map(String).join(' ')); });
    });
    afterEach(() => {
        __setContextTilesBaseUrl(null);
        vi.restoreAllMocks();
    });

    it('attaches a bounded tileset at Barcelona (the precondition the founder\'s session had)', async () => {
        const s = makeStub();
        await s.maybeAttachTerrainProvider(BARCELONA.lat, BARCELONA.lon);
        expect(s.viewer.terrainProvider).toBeInstanceOf(FakeBoundedProvider);
        expect(s.formaTerrainCity).toBe('barcelona');
        expect(s.groundReliefAttached()).toBe(true);
        expect(fromUrl).toHaveBeenCalledTimes(1);
    });

    it('THE REPRODUCTION — Barcelona → Porto (unpublished region tileset): provider reverts to the Ellipsoid, city cleared', async () => {
        const s = makeStub();
        await s.maybeAttachTerrainProvider(BARCELONA.lat, BARCELONA.lon);
        expect(s.viewer.terrainProvider).toBeInstanceOf(FakeBoundedProvider);
        const stale = s.viewer.terrainProvider;

        await s.maybeAttachTerrainProvider(PORTO.lat, PORTO.lon);
        // The fromUrl-catch path: 'portugal' layer.json 404s. Before the fix this `return`ed and left
        // Barcelona's provider under Porto — zero tiles renderable there.
        expect(s.viewer.terrainProvider).toBeInstanceOf(FakeEllipsoidTerrainProvider);
        expect(s.viewer.terrainProvider).not.toBe(stale);
        expect(s.formaTerrainCity).toBeNull();
        expect(s.groundReliefAttached()).toBe(false);
        expect(s.formaTerrainBaseHeight).toBe(0);
        expect(s.viewer.scene.globe.enableLighting).toBe(false);
        // Loud, and naming the mechanism — never a silent state change (C84 EI-6).
        expect(warns.some((w) => /L-12913/.test(w) && /'barcelona'/.test(w))).toBe(true);
    });

    it('THE REPRODUCTION (production shape) — Barcelona → a site outside EVERY bbox (no-baked-city): detaches', async () => {
        const s = makeStub();
        await s.maybeAttachTerrainProvider(BARCELONA.lat, BARCELONA.lon);
        fromUrl.mockClear();
        await s.maybeAttachTerrainProvider(CASABLANCA.lat, CASABLANCA.lon);
        expect(s.viewer.terrainProvider).toBeInstanceOf(FakeEllipsoidTerrainProvider);
        expect(s.formaTerrainCity).toBeNull();
        expect(fromUrl).not.toHaveBeenCalled();          // nothing to probe; the verdict was the resolver's
        expect(warns.some((w) => /no-baked-city/.test(w) && /Detaching/.test(w))).toBe(true);
    });

    it('the log can no longer say "flat ground" while a bounded provider is attached', async () => {
        const s = makeStub();
        await s.maybeAttachTerrainProvider(BARCELONA.lat, BARCELONA.lon);
        logs = []; warns = [];
        await s.maybeAttachTerrainProvider(CASABLANCA.lat, CASABLANCA.lon);
        // Every line emitted while the stale provider was still on the viewer (i.e. before/at the
        // detach) must not claim flat ground; the only "flat ground" claim allowed is on a flat viewer.
        const beforeDetach = [...logs, ...warns].filter((l) => !/Detaching|detached baked terrain/.test(l));
        for (const l of beforeDetach) expect(l).not.toMatch(/→ flat ground/);
        // …and on a genuinely flat viewer the honest line IS "flat ground".
        logs = [];
        await s.maybeAttachTerrainProvider(CASABLANCA.lat, CASABLANCA.lon);
        expect(logs.some((l) => /no-baked-city/.test(l) && /flat ground/.test(l))).toBe(true);
        expect(s.viewer.terrainProvider).toBeInstanceOf(FakeEllipsoidTerrainProvider);
    });

    it("the founder's route — Barcelona → São Martinho → Porto → German village: never a provider that does not cover the site", async () => {
        const s = makeStub();
        await s.maybeAttachTerrainProvider(BARCELONA.lat, BARCELONA.lon);
        for (const site of [SAO_MARTINHO, PORTO, GERMAN_VILLAGE]) {
            await s.maybeAttachTerrainProvider(site.lat, site.lon);
            // None of these region tilesets is published → the ground must be the honest ellipsoid.
            expect(s.viewer.terrainProvider).toBeInstanceOf(FakeEllipsoidTerrainProvider);
            expect(s.formaTerrainCity).toBeNull();
        }
    });

    it('repeat pans over the same unpublished site do not churn the provider or re-hammer layer.json', async () => {
        const s = makeStub();
        await s.maybeAttachTerrainProvider(BARCELONA.lat, BARCELONA.lon);
        await s.maybeAttachTerrainProvider(PORTO.lat, PORTO.lon);
        const flat = s.viewer.terrainProvider;
        fromUrl.mockClear();
        await s.maybeAttachTerrainProvider(PORTO.lat, PORTO.lon);
        await s.maybeAttachTerrainProvider(PORTO.lat, PORTO.lon);
        expect(s.viewer.terrainProvider).toBe(flat);      // same Ellipsoid instance — no re-tessellation churn
        expect(fromUrl).not.toHaveBeenCalled();           // the 'unavailable' memo still holds on flat ground
    });

    it('returning to Barcelona after the detach re-attaches (no stale "already attached" memory)', async () => {
        const s = makeStub();
        await s.maybeAttachTerrainProvider(BARCELONA.lat, BARCELONA.lon);
        await s.maybeAttachTerrainProvider(PORTO.lat, PORTO.lon);
        expect(s.viewer.terrainProvider).toBeInstanceOf(FakeEllipsoidTerrainProvider);
        fromUrl.mockClear();
        await s.maybeAttachTerrainProvider(BARCELONA.lat, BARCELONA.lon);
        expect(s.viewer.terrainProvider).toBeInstanceOf(FakeBoundedProvider);
        expect(s.formaTerrainCity).toBe('barcelona');
        expect(fromUrl).toHaveBeenCalledTimes(1);
    });

    it('a memo taken on flat ground ("portugal → unavailable") does not shield a later stale provider (the reverse direction)', async () => {
        const s = makeStub();
        await s.maybeAttachTerrainProvider(PORTO.lat, PORTO.lon);          // flat, memo: portugal → unavailable
        expect(s.viewer.terrainProvider).toBeInstanceOf(FakeEllipsoidTerrainProvider);
        await s.maybeAttachTerrainProvider(BARCELONA.lat, BARCELONA.lon);  // attach barcelona
        expect(s.formaTerrainCity).toBe('barcelona');
        await s.maybeAttachTerrainProvider(PORTO.lat, PORTO.lon);          // memo must NOT short-circuit
        expect(s.viewer.terrainProvider).toBeInstanceOf(FakeEllipsoidTerrainProvider);
        expect(s.formaTerrainCity).toBeNull();
    });

    it('same city again is idempotent (no second fromUrl, provider identity kept)', async () => {
        const s = makeStub();
        await s.maybeAttachTerrainProvider(BARCELONA.lat, BARCELONA.lon);
        const p = s.viewer.terrainProvider;
        fromUrl.mockClear();
        await s.maybeAttachTerrainProvider(BARCELONA.lat + 0.01, BARCELONA.lon + 0.01);
        expect(s.viewer.terrainProvider).toBe(p);
        expect(fromUrl).not.toHaveBeenCalled();
    });

    it('a covered → covered relocation replaces the tileset rather than keeping the old one', async () => {
        const s = makeStub();
        await s.maybeAttachTerrainProvider(BARCELONA.lat, BARCELONA.lon);
        const barcelona = s.viewer.terrainProvider as FakeBoundedProvider;
        await s.maybeAttachTerrainProvider(48.86, 2.35);                    // Paris (published)
        const paris = s.viewer.terrainProvider as FakeBoundedProvider;
        expect(paris).toBeInstanceOf(FakeBoundedProvider);
        expect(paris).not.toBe(barcelona);
        expect(paris.url).toMatch(/terrain\/paris\?/);
        expect(s.formaTerrainCity).toBe('paris');
    });

    it('a slow attach that resolves AFTER the site moved on is dropped, not landed under the new site', async () => {
        const s = makeStub();
        let release!: (p: FakeBoundedProvider) => void;
        fromUrl.mockImplementationOnce(() => new Promise<FakeBoundedProvider>((r) => { release = r; }));
        const slow = s.maybeAttachTerrainProvider(BARCELONA.lat, BARCELONA.lon);   // in flight
        await s.maybeAttachTerrainProvider(CASABLANCA.lat, CASABLANCA.lon);        // flat viewer → keep-flat
        release(new FakeBoundedProvider('https://tiles.example/tiles/terrain/barcelona?v=x'));
        await slow;
        // The newest wanted state is "flat at Casablanca"; Barcelona's late provider must not land.
        expect(s.viewer.terrainProvider).toBeInstanceOf(FakeEllipsoidTerrainProvider);
        expect(s.formaTerrainCity).toBeNull();
        // …and the dropped memo does not poison a later genuine Barcelona visit.
        fromUrl.mockClear();
        await s.maybeAttachTerrainProvider(BARCELONA.lat, BARCELONA.lon);
        expect(s.viewer.terrainProvider).toBeInstanceOf(FakeBoundedProvider);
        expect(fromUrl).toHaveBeenCalledTimes(1);
    });

    it('a project-switch reset that nulls the tracked slug but leaves the provider attached is still detached at the new site', async () => {
        const s = makeStub();
        await s.maybeAttachTerrainProvider(BARCELONA.lat, BARCELONA.lon);
        // Mirror `resetProjectScopedState` (~CesiumViewport.ts:14018): slug + memo cleared, provider NOT.
        s.formaTerrainCity = null;
        s.formaTerrainTarget = null;
        s.formaTerrainAttach.clear();
        expect(s.viewer.terrainProvider).toBeInstanceOf(FakeBoundedProvider);
        await s.maybeAttachTerrainProvider(CASABLANCA.lat, CASABLANCA.lon);
        expect(s.viewer.terrainProvider).toBeInstanceOf(FakeEllipsoidTerrainProvider);
    });
});
