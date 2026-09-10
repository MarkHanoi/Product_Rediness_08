// @vitest-environment happy-dom
//
// §RELIEF-FOR-THIS-SITE (L-13301) — founder, 2026-09-09, Albox (≈51 m) → Granada (≈800 m) in one session:
//
//   relief=on ('albox')                                             … printed INSIDE the Granada scene
//   ground-features re-seat: 5045 … per-feature (51.0–523.6 m), 0 on the safe base
//
// `groundReliefAttached()` answered "is A provider with elevation data on the viewer?" and every ground
// seat read it as "may I sample the relief for THIS site?". Across the async re-attach the PREVIOUS
// city's tileset stays on the viewer, so the old predicate read TRUE and ~20 callers of `sampleGround`
// measured Granada's points against Albox's terrain. `cbb09c23` made ONE re-seat immune by refusing
// foreign ENTITIES (the L-12964 anchor guard); it did nothing for the relief itself. This suite binds
// the replacement: ONE predicate, `groundReliefState()`, three answers (flat · ready · foreign), read
// by every seat.
//
// Binds the SHIPPED private methods to a stub `this` — the `CesiumViewportGroundFeaturesSiteDatum`
// harness (cbb09c23), not a second one. No real Cesium viewer. The coverage table is the REAL one, and
// the first case pins what it says about the two sites so the fixture cannot rot silently.

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

import * as Cesium from 'cesium';
import { CesiumViewport } from '../src/ui/geospatial/CesiumViewport';
import { terrainSlugCandidates } from '../src/ui/geospatial/terrainCoverage';
import {
    resolveGroundReliefState, resolveTerrainTransition, attachedTilesetServesSite, describeGroundReliefState,
} from '../src/ui/geospatial/terrainProviderTransition';

type LatLon = { lat: number; lon: number };
type ConstantPropertyT = InstanceType<typeof ConstantProperty>;
type Ent = { polygon?: { height?: ConstantPropertyT } };

const ALBOX = { lat: 37.33973, lon: -2.13609 };
const GRANADA = { lat: 37.17730, lon: -3.59860 };
const GRANADA_BASE = 812.3;
const KEY = (p: LatLon): string => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
const h = (e: Ent): number => e.polygon!.height!.getValue();
const origin = (p: LatLon) => ({ ...p, centroidEast: 0, centroidNorth: 0, areaM2: 400 });

type Stub = Record<string, unknown> & {
    viewer: { scene: { requestRender: ReturnType<typeof vi.fn>; globe: { getHeight: ReturnType<typeof vi.fn> } }; terrainProvider: unknown };
    formaTerrainCity: string | null;
    formaMassingOrigin: ReturnType<typeof origin> | null;
    contextGroundCache: Map<string, number>;
    contextGroundSeatPoints: WeakMap<object, { layer: string; point: LatLon | null }>;
    contextParkEntities: Ent[];
    sampleContextGroundsBatch: ReturnType<typeof vi.fn>;
    groundReliefState: (at?: LatLon) => { kind: string; city?: string; attached?: string | null; wants?: readonly string[]; siteKnown?: boolean };
    terrainProviderState: () => { attachedCity: string | null; reliefAttached: boolean };
    sampleGround: (lat: number, lon: number, fb?: number) => number;
    reseatContextGroundFeaturesForBase: () => void;
};

const BOUND = [
    'groundReliefState', 'terrainSlugsServing', 'currentContextSite', 'terrainProviderHasElevationData',
    'terrainProviderState', 'sampleGround', 'reseatContextGroundFeaturesForBase', 'redrapeGroundLayersBuiltFlat',
    'unsampledContextGroundSeatPoints', 'reseatAnchorForCurrentSite',
] as const;

function makeStub(over: Partial<Stub> = {}): Stub {
    const proto = CesiumViewport.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    const s: Stub = {
        // A bounded tileset IS attached (availability present) — the founder's exact state: it is ALBOX's.
        viewer: { scene: { requestRender: vi.fn(), globe: { getHeight: vi.fn(() => 300) } }, terrainProvider: { availability: {} } },
        formaTerrainCity: 'albox',
        // The site the viewport is on RIGHT NOW — Granada (the L-12964 authority, `currentContextSite`).
        formaMassingOrigin: origin(GRANADA),
        readSiteLocation: () => null,
        formaTerrainBaseHeight: GRANADA_BASE,
        // The re-seat's OWN anchor is this site: cbb09c23's entity guard PASSES here on purpose.
        contextGroundFeaturesAt: { ...GRANADA },
        contextGroundCache: new Map<string, number>(),
        contextGroundSeatPoints: new WeakMap(),
        contextLanduseEntities: [], contextParkEntities: [], contextRoadEntities: [],
        contextSeaEntities: [], contextRailEntities: [], contextWaterEntities: [],
        formaTerrainToken: 7,
        groundLayerRedrapedAtToken: new Map<string, number>(),
        sampleContextGroundsBatch: vi.fn(async () => {}),
        loadContextRoads: vi.fn(), loadContextRail: vi.fn(), loadContextWater: vi.fn(), loadContextParks: vi.fn(), loadContextLanduse: vi.fn(),
        foreignReliefNoted: null,
        terrainSlugsServingMemo: null,
        ...over,
    } as Stub;
    for (const m of BOUND) (s as Record<string, unknown>)[m] = proto[m]!.bind(s);
    return s;
}

/** A park polygon seated at `point` (cache pre-filled with `ground`), or an UNCACHED one (`point` null). */
function park(s: Stub, point: LatLon | null, height: number, ground?: number): Ent {
    const e: Ent = { polygon: { height: new ConstantProperty(height) } };
    s.contextParkEntities.push(e);
    s.contextGroundSeatPoints.set(e, { layer: 'parks', point });
    if (point && ground !== undefined) s.contextGroundCache.set(KEY(point), ground);
    return e;
}

const quiet = (): { warn: ReturnType<typeof vi.spyOn>; log: ReturnType<typeof vi.spyOn> } => ({
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
});

describe('§RELIEF-FOR-THIS-SITE (L-13301) — the fixture is the REAL coverage table', () => {
    it("Albox's tileset does not serve Granada; 'spain' serves both (the region fallback the transition table honours)", () => {
        const albox = terrainSlugCandidates(ALBOX.lon, ALBOX.lat);
        const granada = terrainSlugCandidates(GRANADA.lon, GRANADA.lat);
        expect(albox).toContain('albox');
        expect(granada).toContain('granada');
        expect(granada).not.toContain('albox');          // ⛔ if this ever fails, every case below is testing nothing
        expect(albox).toContain('spain');
        expect(granada).toContain('spain');
    });
});

describe("§RELIEF-FOR-THIS-SITE (L-13301) — the previous city's tileset is FOREIGN, not 'on'", () => {
    it("THE REPRODUCTION — 'albox' attached inside a Granada scene reads FOREIGN, while the viewer still HOLDS it", () => {
        const { warn } = quiet();
        const s = makeStub();
        const st = s.groundReliefState();
        expect(st.kind).toBe('foreign');
        expect(st.attached).toBe('albox');
        expect(st.siteKnown).toBe(true);
        expect(st.wants).toContain('granada');
        // The two arms of ONE predicate: the transition table must still see "something is attached"
        // (a foreign tileset is DETACHED, which needs knowing it is there — L-12913) …
        expect(s.terrainProviderState()).toEqual({ attachedCity: 'albox', reliefAttached: true });
        // … and the log line can no longer say `relief=on ('albox')` in a Granada scene.
        expect(describeGroundReliefState(st as never)).toMatch(/FOREIGN \('albox' is attached; this site wants 'granada'/);
        expect(describeGroundReliefState(st as never)).not.toMatch(/^on/);
        // LOUD, once (C84 EI-6).
        expect(warn.mock.calls.filter((c) => /L-13301/.test(String(c[0]))).length).toBe(1);
    });

    it("`sampleGround` in that window answers the caller's SAFE base and never reads the wrong city's mesh", () => {
        quiet();
        const s = makeStub();
        const v = s.sampleGround(GRANADA.lat, GRANADA.lon, GRANADA_BASE);
        expect(v).toBe(GRANADA_BASE);
        expect(s.viewer.scene.globe.getHeight).not.toHaveBeenCalled();
    });

    it("the ground-features re-seat REFUSES even though its ENTITY anchor is this site — cbb09c23's guard passes, the relief predicate is what refuses", () => {
        const { warn, log } = quiet();
        const s = makeStub();
        const near = { lat: GRANADA.lat, lon: GRANADA.lon + 0.001 };
        // The founder's console, as a number: a Granada point whose cached answer came off ALBOX's tileset.
        const poisoned = park(s, near, 0, 211.7);
        const uncached = park(s, null, 61.01);

        s.reseatContextGroundFeaturesForBase();

        expect(s.sampleContextGroundsBatch).not.toHaveBeenCalled();     // no round-trip against the wrong tileset
        expect(s.viewer.scene.requestRender).not.toHaveBeenCalled();
        expect(log.mock.calls.map(String).join(' ')).not.toContain('ground-features re-seat');
        expect(h(poisoned)).toBe(0);                                      // not "lifted" onto Albox's relief
        expect(h(uncached)).toBe(61.01);                                  // not written to this site's base either
        expect(warn.mock.calls.map(String).join(' ')).toContain('§RELIEF-FOR-THIS-SITE');
    });

    it('CONTROL — the attach lands (`granada` now attached): READY, and the identical pass seats per entity', () => {
        quiet();
        const s = makeStub({ formaTerrainCity: 'granada' });
        expect(s.groundReliefState()).toEqual({ kind: 'ready', city: 'granada' });
        const near = { lat: GRANADA.lat, lon: GRANADA.lon + 0.001 };
        const far = { lat: GRANADA.lat, lon: GRANADA.lon + 0.004 };
        const a = park(s, near, 0, 795.1);
        const b = park(s, far, 0, 1095.1);

        s.reseatContextGroundFeaturesForBase();

        expect(h(a)).toBeCloseTo(795.1 + 0.01, 6);
        expect(h(b)).toBeCloseTo(1095.1 + 0.01, 6);
        expect(h(b) - h(a)).toBeCloseTo(300, 6);                          // PER ENTITY, not one scalar
    });

    it("a REGION fallback serves the site: 'spain' attached is READY — the same rule the transition table calls keep-attached", () => {
        quiet();
        const s = makeStub({ formaTerrainCity: 'spain' });
        expect(s.groundReliefState()).toEqual({ kind: 'ready', city: 'spain' });
        const candidates = terrainSlugCandidates(GRANADA.lon, GRANADA.lat);
        const state = { attachedCity: 'spain', reliefAttached: true };
        expect(attachedTilesetServesSite(state, candidates)).toBe(true);
        expect(resolveTerrainTransition({ attach: true, city: 'granada', scope: 'city', candidates } as never, state))
            .toEqual({ action: 'keep-attached', city: 'spain' });
        // ONE implementation: the pure resolver and the viewport predicate agree by construction.
        expect(resolveGroundReliefState(state, { candidates })).toEqual({ kind: 'ready', city: 'spain' });
        expect(resolveGroundReliefState({ attachedCity: 'albox', reliefAttached: true }, { candidates }))
            .toMatchObject({ kind: 'foreign', attached: 'albox', siteKnown: true });
    });

    it('an EXPLICIT point wins over a lagging massing origin (the pre-plot frame path asks about the point it awaited the attach for)', () => {
        quiet();
        const s = makeStub({ formaTerrainCity: 'granada', formaMassingOrigin: origin(ALBOX) });
        expect(s.groundReliefState().kind).toBe('foreign');               // by the (stale) site authority …
        expect(s.groundReliefState(GRANADA)).toEqual({ kind: 'ready', city: 'granada' }); // … READY for the point itself
    });

    it('FLAT when the provider is the ellipsoid, whatever the slugs say; FOREIGN (untracked) when a provider is attached but the slug was nulled', () => {
        quiet();
        const flat = makeStub({ viewer: { scene: { requestRender: vi.fn(), globe: { getHeight: vi.fn() } }, terrainProvider: new Cesium.EllipsoidTerrainProvider() } });
        expect(flat.groundReliefState()).toEqual({ kind: 'flat' });
        expect(flat.terrainProviderState().reliefAttached).toBe(false);
        // The project-switch reset nulls `formaTerrainCity` and leaves the provider: never READY, still HELD.
        const untracked = makeStub({ formaTerrainCity: null });
        expect(untracked.groundReliefState()).toMatchObject({ kind: 'foreign', attached: null, siteKnown: true });
        expect(untracked.terrainProviderState().reliefAttached).toBe(true);
    });

    it('the foreign warning is latched per window: many askers, one line; a new window is news again', () => {
        const { warn } = quiet();
        const s = makeStub();
        s.groundReliefState(); s.groundReliefState(); s.sampleGround(GRANADA.lat, GRANADA.lon, 1);
        const count = (): number => warn.mock.calls.filter((c) => /L-13301/.test(String(c[0]))).length;
        expect(count()).toBe(1);
        s.formaTerrainCity = 'granada';                                    // the attach lands → window closes
        expect(s.groundReliefState().kind).toBe('ready');
        s.formaTerrainCity = 'albox';                                      // (a later relocation) → a NEW window
        s.groundReliefState();
        expect(count()).toBe(2);
    });

    it("SCRAMBLE CONTROL — with the OLD any-provider semantics restored, the founder's exact defect reproduces", () => {
        // What `groundReliefAttached()` used to answer while Albox's tileset sat under a Granada scene:
        // "ready". Feeding the pass that answer must turn every assertion of the REFUSES case inside out —
        // if it does not, the pass has stopped reading the predicate and this suite measures a sibling path.
        const { log } = quiet();
        const s = makeStub({ groundReliefState: () => ({ kind: 'ready', city: 'albox' }) });
        const near = { lat: GRANADA.lat, lon: GRANADA.lon + 0.001 };
        const poisoned = park(s, near, 0, 211.7);
        const uncached = park(s, null, 61.01);

        s.reseatContextGroundFeaturesForBase();

        expect(h(poisoned)).toBeCloseTo(211.7 + 0.01, 6);                 // "per-feature (51.0–523.6 m)" — Albox's relief
        expect(h(uncached)).toBeCloseTo(GRANADA_BASE + 0.01, 6);          // and the uncached one written to the base
        expect(log.mock.calls.map(String).join(' ')).toContain('ground-features re-seat');
    });
});
