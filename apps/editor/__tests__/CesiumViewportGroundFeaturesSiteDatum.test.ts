// @vitest-environment happy-dom
//
// §CTX-RESEAT-ANCHOR-IS-CURRENT-SITE (L-13270) + §A-LIFT-IS-NOT-A-DRAPE (L-13271) — founder,
// 2026-09-09, one session, Albox (≈51 m) → Granada (≈800 m):
//
//   "the buildings are at a different height than other assets and there are extrusions from the
//    buildings level to the other layer — looking really bad"              (Granada)
//   "the grey layer seems flat, horizontally flat, whereas this is heavy terrain"   (Almanzora/Albox)
//
// ONE defect family: ground features seated on the WRONG terrain datum. His console carries both
// halves.
//
// ── HALF ONE — a foreign site's features, re-seated with confidence ────────────────────────────
//   [CTX-DIAG] ground-features re-seat: 5045 road/park/water entity(ies) lifted onto settled ground
//     (base 812.3 m) — PER ENTITY on its own ground: 5045 per-feature (51.0–523.6 m), 0 on the safe base
//   [CTX-DIAG] context buildings rendered … per-footprint seat, centroid base 799.9 m, relief ON
//
// 51.0–523.6 m is ALBOX's relief. The buildings are at 799.9 m. The gap between those two datums IS
// the "extrusions". The tell that these are the PREVIOUS site's entities is `0 on the safe base`:
// all 5045 resolved a REAL measured ground, which only happens when the points belong to the terrain
// under them. The SAME log shows the L-12964 guard working twice — for the far tier and for street
// life ("REFUSING to rebuild … 130624 m from the current site") — and NOT for this pass, which had no
// anchor to check. That is the hole under test.
//
// ── HALF TWO — a lift is not a drape ───────────────────────────────────────────────────────────
//   §FORMA-CTX-LANDUSE rendered: §GROUND-DRAPE-ON-RELIEF: flat seat base 0.0 m + 0.005 (no relief attached; one scalar)
//   … then: ground-features re-seat: 0 per-feature (387.5–387.5 m), 8 on the safe base
//
// `resolveGroundDrapePieces` returns `seat: null` on the flat branch, so the re-seat has nothing to
// sample and can only write ONE number for the whole layer. At Granada the identical code reports
// `3642/3642 piece(s) on their own sampled ground` — the difference is ARRIVAL ORDER, not the drape.
//
// Binds the SHIPPED private methods to a stub `this` (the CesiumViewportGroundDrapeReseat /
// CesiumViewportReseatAnchorCurrentSite pattern). No real Cesium viewer.

import { describe, it, expect, vi } from 'vitest';

const { ConstantProperty } = vi.hoisted(() => {
    class ConstantProperty {
        constructor(readonly value: number) {}
        getValue(): number { return this.value; }
    }
    return { ConstantProperty };
});

vi.mock('cesium', () => ({
    Ion: { defaultAccessToken: '' },
    EllipsoidTerrainProvider: class {},
    CesiumTerrainProvider: { fromUrl: async () => { throw new Error('unused'); } },
    Cartographic: { fromDegrees: (lon: number, lat: number) => ({ lon, lat, height: 0 }) },
    ConstantProperty,
    sampleTerrainMostDetailed: async (_p: unknown, c: unknown[]) => c,
}));

import { CesiumViewport } from '../src/ui/geospatial/CesiumViewport';

type ConstantPropertyT = InstanceType<typeof ConstantProperty>;
type LatLon = { lat: number; lon: number };

/** The founder's two sites. ALBOX is the anchor the L-12964 guard named in his own console. */
const ALBOX = { lat: 37.33973, lon: -2.13609 };
const GRANADA = { lat: 37.17730, lon: -3.59860 };   // ~130 km away — his log measured 130624 m
const GRANADA_BASE = 812.3;                          // the settled base the stale pass printed

/**
 * A ground model that answers with the RIGHT city's relief for the point asked. Albox's valley reads
 * 51–523 m (the founder's stale range); Granada's plain reads ~800 m. Any answer in the Albox band
 * inside a Granada scene is the defect, stated as a number.
 */
const groundAt = (lat: number, lon: number): number =>
    (Math.abs(lat - ALBOX.lat) < 0.5 && Math.abs(lon - ALBOX.lon) < 0.5)
        ? 51 + (lon - ALBOX.lon) * 100000        // Albox: 51 m at the town, rising into the sierra
        : 795 + (lon - GRANADA.lon) * 100000;    // Granada: ~800 m

type Ent = { polygon?: { height?: ConstantPropertyT }; corridor?: { height?: ConstantPropertyT } };

const KEY = (p: LatLon): string => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
const h = (e: Ent): number => (e.polygon?.height ?? e.corridor?.height)!.getValue();

type Stub = Record<string, unknown> & {
    contextGroundFeaturesAt: LatLon | null;
    contextLanduseEntities: Ent[];
    contextParkEntities: Ent[];
    contextRoadEntities: Ent[];
    contextSeaEntities: Ent[];
    contextRailEntities: Ent[];
    contextWaterEntities: Ent[];
    contextGroundCache: Map<string, number>;
    contextGroundSeatPoints: WeakMap<object, { layer: string; point: LatLon | null }>;
    formaTerrainToken: number;
    groundLayerRedrapedAtToken: Map<string, number>;
    loadContextRoads: ReturnType<typeof vi.fn>;
    loadContextRail: ReturnType<typeof vi.fn>;
    loadContextWater: ReturnType<typeof vi.fn>;
    loadContextParks: ReturnType<typeof vi.fn>;
    loadContextLanduse: ReturnType<typeof vi.fn>;
    reseatContextGroundFeaturesForBase: () => void;
    redrapeGroundLayersBuiltFlat: (a: LatLon) => void;
};

/** The SHIPPED methods under test, plus the pure helpers they call. Everything else is a stub. */
const BOUND = [
    'reseatContextGroundFeaturesForBase',
    'redrapeGroundLayersBuiltFlat',
    'unsampledContextGroundSeatPoints',
    'noteGroundFeaturesLoadedAt',
    'reseatAnchorForCurrentSite',
    'currentContextSite',
    'sampleGround',
] as const;

function makeStub(over: Partial<Stub> = {}): Stub {
    const proto = CesiumViewport.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    const s: Stub = {
        viewer: { scene: { requestRender: () => {} }, terrainProvider: { availability: {} } },
        groundReliefState: () => ({ kind: 'ready' as const, city: 'stub' }),
        terrainProviderHasElevationData: () => true,
        // The site the viewport is on RIGHT NOW — Granada, the second site.
        formaMassingOrigin: { ...GRANADA, centroidEast: 0, centroidNorth: 0, areaM2: 400 },
        readSiteLocation: () => null,
        formaTerrainBaseHeight: GRANADA_BASE,
        contextGroundFeaturesAt: null,
        contextGroundCache: new Map<string, number>(),
        contextGroundSeatPoints: new WeakMap(),
        contextLanduseEntities: [],
        contextParkEntities: [],
        contextRoadEntities: [],
        contextSeaEntities: [],
        contextRailEntities: [],
        contextWaterEntities: [],
        formaTerrainToken: 7,
        groundLayerRedrapedAtToken: new Map<string, number>(),
        sampleContextGroundsBatch: async () => {},
        loadContextRoads: vi.fn(),
        loadContextRail: vi.fn(),
        loadContextWater: vi.fn(),
        loadContextParks: vi.fn(),
        loadContextLanduse: vi.fn(),
        reseatContextGroundFeaturesForBase: () => {},
        redrapeGroundLayersBuiltFlat: () => {},
        ...over,
    } as Stub;
    for (const m of BOUND) (s as Record<string, unknown>)[m] = proto[m]!.bind(s);
    return s;
}

/** A seated entity with its recorded seat point, as a loader leaves it. */
function ent(s: Stub, list: keyof Stub, kind: 'polygon' | 'corridor', layer: string, point: LatLon | null, height: number): Ent {
    const e: Ent = kind === 'polygon'
        ? { polygon: { height: new ConstantProperty(height) } }
        : { corridor: { height: new ConstantProperty(height) } };
    (s[list] as Ent[]).push(e);
    s.contextGroundSeatPoints.set(e, { layer, point });
    if (point) s.contextGroundCache.set(KEY(point), groundAt(point.lat, point.lon));
    return e;
}

/** The founder's Albox scene, still on screen after the switch to Granada. */
function alboxLeftovers(s: Stub): Ent[] {
    const pts: LatLon[] = [
        { ...ALBOX },
        { lat: ALBOX.lat + 0.002, lon: ALBOX.lon + 0.002 },
        { lat: ALBOX.lat - 0.003, lon: ALBOX.lon + 0.004 },
    ];
    return [
        ent(s, 'contextLanduseEntities', 'polygon', 'landuse', pts[0]!, groundAt(pts[0]!.lat, pts[0]!.lon) + 0.005),
        ent(s, 'contextParkEntities', 'polygon', 'parks', pts[1]!, groundAt(pts[1]!.lat, pts[1]!.lon) + 0.01),
        ent(s, 'contextRoadEntities', 'corridor', 'roads', pts[2]!, groundAt(pts[2]!.lat, pts[2]!.lon) + 0.02),
    ];
}

describe('§CTX-RESEAT-ANCHOR-IS-CURRENT-SITE (L-13270) — the ground-features re-seat is inside the guard', () => {
    // ⚠ WHAT THE ASSERTIONS HAD TO BE, AND WHY NOT THE OBVIOUS ONE. "the heights do not change" is
    // NOT a binding assertion here: an entity ALREADY correctly seated on its own city's ground is
    // re-measured by this pass to the SAME number, so a test written that way stays green with the
    // guard removed — the exact "measured a sibling path" failure this lane was warned about. The
    // harms that ARE observable are the ones asserted below: a terrain round-trip issued for the
    // PREVIOUS city's points in the middle of this site's start-up, a diagnostic that reports
    // 5045 features "lifted onto settled ground (base 812.3 m)" when nothing of the sort happened,
    // and — for any feature the cache cannot answer — a real wrong height, the foreign feature
    // written to THIS site's base.
    it("REFUSES: no round-trip for the previous city's points, no 'lifted onto settled ground' claim", () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const batch = vi.fn(async () => {});
        const render = vi.fn();
        const s = makeStub({
            contextGroundFeaturesAt: { ...ALBOX },                   // placed at Albox
            sampleContextGroundsBatch: batch,
            viewer: { scene: { requestRender: render }, terrainProvider: { availability: {} } },
        });
        alboxLeftovers(s);
        // …and one Albox feature the cache cannot answer: the pass's fallback would write GRANADA's
        // base into it, which is a wrong height by ~760 m, not merely a wasted rewrite.
        const uncached = ent(s, 'contextParkEntities', 'polygon', 'parks', null, 61.01);

        s.reseatContextGroundFeaturesForBase();                      // …while the site is Granada

        expect(batch).not.toHaveBeenCalled();                        // no round-trip for a foreign city
        expect(render).not.toHaveBeenCalled();
        expect(log.mock.calls.map(String).join(' ')).not.toContain('ground-features re-seat');
        expect(warn.mock.calls.map(String).join(' ')).toContain('§CTX-RESEAT-ANCHOR-IS-CURRENT-SITE');
        // ⛔ A wrong height is never preferable to an honest absence.
        expect(h(uncached)).toBe(61.01);
        expect(Math.abs(h(uncached) - GRANADA_BASE)).toBeGreaterThan(700);
    });

    it("CONTROL — the identical pass runs, and seats per entity, when the features ARE this site's", () => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const s = makeStub({ contextGroundFeaturesAt: { ...GRANADA } });
        const near = { lat: GRANADA.lat, lon: GRANADA.lon + 0.001 };
        const far = { lat: GRANADA.lat, lon: GRANADA.lon + 0.004 };
        const a = ent(s, 'contextLanduseEntities', 'polygon', 'landuse', near, 0);
        const b = ent(s, 'contextLanduseEntities', 'polygon', 'landuse', far, 0);

        s.reseatContextGroundFeaturesForBase();

        expect(h(a)).toBeCloseTo(groundAt(near.lat, near.lon) + 0.005, 6);
        expect(h(b)).toBeCloseTo(groundAt(far.lat, far.lon) + 0.005, 6);
        expect(h(b) - h(a)).toBeCloseTo(300, 6);                     // PER ENTITY, not one scalar
    });

    it("SCRAMBLE CONTROL — with the anchor removed, the founder's exact defect reproduces", () => {
        // The pre-fix world: these five layers had NO `…At` memo at all, so the guard had nothing to
        // check and the pass ran on whatever was in the lists. Wiring the memo to null puts the code
        // back in that world, and every assertion in the first case INVERTS. If this ever goes green
        // while the first case also passes, the guard has stopped being the thing under test.
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const batch = vi.fn(async () => {});
        const s = makeStub({ contextGroundFeaturesAt: null, sampleContextGroundsBatch: batch });
        const es = alboxLeftovers(s);
        const uncached = ent(s, 'contextParkEntities', 'polygon', 'parks', null, 61.01);

        s.reseatContextGroundFeaturesForBase();

        // "5045 per-feature (51.0–523.6 m), 0 on the safe base" — Albox's relief, in a Granada scene.
        for (const e of es) {
            expect(h(e)).toBeLessThan(600);
            expect(h(e)).toBeGreaterThan(40);
        }
        // …and the feature the cache could not answer is written to GRANADA's base — the wrong height.
        expect(h(uncached)).toBeCloseTo(GRANADA_BASE + 0.01, 6);
        expect(log.mock.calls.map(String).join(' ')).toContain('ground-features re-seat');
    });

    it('the anchor is stamped by the loader helper, and only for a finite lat/lon', () => {
        const s = makeStub();
        (s.noteGroundFeaturesLoadedAt as (a: number, b: number) => void)(GRANADA.lat, GRANADA.lon);
        expect(s.contextGroundFeaturesAt).toEqual({ ...GRANADA });
        (s.noteGroundFeaturesLoadedAt as (a: number, b: number) => void)(Number.NaN, GRANADA.lon);
        expect(s.contextGroundFeaturesAt).toEqual({ ...GRANADA });   // a bad load never claims it
    });
});

describe('§A-LIFT-IS-NOT-A-DRAPE (L-13271) — a layer built on the flat branch is RE-RENDERED, not lifted', () => {
    it('re-renders a layer whose every entity has NO seat point (the Albox grey plate)', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const s = makeStub({ contextGroundFeaturesAt: { ...GRANADA } });
        // Rendered BEFORE terrain attached: one scalar, `seat: null`, for all eight.
        for (let i = 0; i < 8; i++) ent(s, 'contextLanduseEntities', 'polygon', 'landuse', null, 0.005);

        s.reseatContextGroundFeaturesForBase();

        expect(s.loadContextLanduse).toHaveBeenCalledTimes(1);
        expect(s.loadContextLanduse).toHaveBeenCalledWith(GRANADA.lat, GRANADA.lon, true);
        // Untouched layers are not dragged in.
        expect(s.loadContextParks).not.toHaveBeenCalled();
        expect(s.loadContextRoads).not.toHaveBeenCalled();
    });

    it('CONTROL — a layer that DOES carry seat points is left to the per-entity lift (no re-render)', () => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const s = makeStub({ contextGroundFeaturesAt: { ...GRANADA } });
        const p = { lat: GRANADA.lat, lon: GRANADA.lon + 0.001 };
        ent(s, 'contextLanduseEntities', 'polygon', 'landuse', p, 0);
        ent(s, 'contextLanduseEntities', 'polygon', 'landuse', null, 0);  // one hole is NOT the flat branch

        s.reseatContextGroundFeaturesForBase();

        expect(s.loadContextLanduse).not.toHaveBeenCalled();
    });

    it('fires at most ONCE per terrain token, so an empty reload cannot re-arm on every settle', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const s = makeStub({ contextGroundFeaturesAt: { ...GRANADA } });
        ent(s, 'contextRoadEntities', 'corridor', 'roads', null, 0.02);

        s.reseatContextGroundFeaturesForBase();
        s.reseatContextGroundFeaturesForBase();
        expect(s.loadContextRoads).toHaveBeenCalledTimes(1);

        s.formaTerrainToken++;                                            // a new site's terrain
        s.reseatContextGroundFeaturesForBase();
        expect(s.loadContextRoads).toHaveBeenCalledTimes(2);
    });

    it('is a no-op with no relief attached — the flat scalar is exactly correct there', () => {
        const s = makeStub({ contextGroundFeaturesAt: { ...GRANADA }, groundReliefState: () => ({ kind: 'flat' as const }) });
        ent(s, 'contextParkEntities', 'polygon', 'parks', null, 0.01);
        s.reseatContextGroundFeaturesForBase();
        expect(s.loadContextParks).not.toHaveBeenCalled();
    });
});

describe('§C13-GROUND-FEATURES-ARE-PROJECT-SCOPED (L-13270) — the teardown drops EVERY context layer', () => {
    // ⛔ MEMBERSHIP, NOT A COUNT. Three layer families have now leaked through this one function
    // (footprints L-676 → canopies + street life L-12964 → these five ground layers), each time
    // because a new layer was added with its own list and nothing forced its author to come here.
    // So this asserts the SET: every `clearContextX` the class defines must be reachable from
    // `resetProjectScopedState`, directly or through one clear it calls. A hand-copied list of names
    // would have passed on the day this defect shipped.
    const proto = CesiumViewport.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    const clears = Object.getOwnPropertyNames(CesiumViewport.prototype).filter((n) => /^clearContext[A-Z]/.test(n));

    /** `resetProjectScopedState`'s body plus the bodies of the clears it calls directly. */
    const reachable = (): string => {
        let body = proto.resetProjectScopedState!.toString();
        for (const c of clears) if (new RegExp(`this\\.${c}\\(`).test(body)) body += proto[c]!.toString();
        return body;
    };

    it('finds the clear methods at all (the detector is not vacuous)', () => {
        expect(clears).toContain('clearContextBuildings');
        expect(clears).toContain('clearContextLanduse');
        expect(clears.length).toBeGreaterThanOrEqual(9);
        // SCRAMBLE CONTROL — a name that is NOT called must be reported as missing, or this whole
        // describe is a test that cannot fail.
        expect(new RegExp('this\\.clearContextNoSuchLayer\\(').test(reachable())).toBe(false);
    });

    it('every context layer the class can clear IS cleared on a project switch', () => {
        const body = reachable();
        const missing = clears.filter((c) => !new RegExp(`this\\.${c}\\(`).test(body));
        expect(missing).toEqual([]);
    });

    it('and the ground-features load anchor is dropped with them', () => {
        expect(proto.resetProjectScopedState!.toString()).toContain('contextGroundFeaturesAt = null');
    });
});
