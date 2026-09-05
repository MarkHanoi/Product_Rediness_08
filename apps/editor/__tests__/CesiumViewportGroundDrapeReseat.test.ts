// @vitest-environment happy-dom
//
// §GROUND-DRAPE-ON-RELIEF (L-12924) — founder, Lisbon Baixa 2026-09-05 (3D Site, terrain ON): "the grey
// layer (urban landuse) and probably others is CUTTING the buildings — not set on the correct height".
// The console showed the mechanism: buildings seated PER FOOTPRINT ("resolved 6349/6349 real ground
// heights … centroid base 68.9 m, relief ON") while the flat ground layers were seated at ONE scalar
// ("1413 road/park/water entity(ies) lifted onto settled ground (base 71.0 m)"). On a hillside one scalar
// is a plane ABOVE the ground downhill (through the buildings) and UNDER it uphill.
//
// Binds the SHIPPED private re-seat to a stub `this` (the CesiumViewportTreesReseat pattern) and asserts
// the fact the symptom follows from: with relief attached, entities on a slope get DIFFERENT heights —
// each its own sampled ground + the C12 §12.4 ladder offset — and the second pass samples what the cache
// did not hold. Flat ground stays a no-op. No real Cesium viewer; `sampleTerrainMostDetailed` is a stub.

import { describe, it, expect, vi } from 'vitest';

// `vi.mock` is hoisted above every import and declaration, so the stubs it closes over must be
// hoisted with it.
const { ConstantProperty, sampleTerrainMostDetailed, BAIXA, groundAt } = vi.hoisted(() => {
    // A synthetic Lisbon: ground rises 1 m per 0.0001° of longitude eastward from Baixa (~11 m per 100 m).
    const BAIXA = { lat: 38.7107, lon: -9.1374 };
    const groundAt = (_lat: number, lon: number): number => 60 + (lon - BAIXA.lon) / 0.0001;
    class ConstantProperty {
        constructor(readonly value: number) {}
        getValue(): number { return this.value; }
    }
    const calls: Array<Array<{ lon: number; lat: number; height: number }>> = [];
    const sampleTerrainMostDetailed = Object.assign(
        async (_p: unknown, cartos: Array<{ lon: number; lat: number; height: number }>) => {
            calls.push(cartos);
            for (const c of cartos) c.height = groundAt(c.lat, c.lon);
            return cartos;
        },
        { calls },
    );
    return { ConstantProperty, sampleTerrainMostDetailed, BAIXA, groundAt };
});

vi.mock('cesium', () => ({
    Ion: { defaultAccessToken: '' },
    EllipsoidTerrainProvider: class {},
    CesiumTerrainProvider: { fromUrl: async () => { throw new Error('unused'); } },
    Cartographic: { fromDegrees: (lon: number, lat: number) => ({ lon, lat, height: 0 }) },
    ConstantProperty,
    sampleTerrainMostDetailed,
}));

import { CesiumViewport } from '../src/ui/geospatial/CesiumViewport';

type ConstantProperty = InstanceType<typeof ConstantProperty>;

type Ent = { polygon?: { height?: ConstantProperty }; corridor?: { height?: ConstantProperty } };
type Stub = {
    viewer: { scene: { requestRender: () => void }; terrainProvider: object } | null;
    groundReliefAttached: () => boolean;
    formaTerrainBaseHeight: number;
    contextGroundCache: Map<string, number>;
    contextGroundSeatPoints: WeakMap<object, { layer: string; point: { lat: number; lon: number } | null }>;
    contextLanduseEntities: Ent[];
    contextParkEntities: Ent[];
    contextRoadEntities: Ent[];
    contextSeaEntities: Ent[];
    contextRailEntities: Ent[];
    contextWaterEntities: Ent[];
    terrainProviderHasElevationData: () => boolean;
    sampleGround: (lat: number, lon: number, base?: number) => number;
    sampleContextGroundsBatch: (pts: Array<{ lat: number; lon: number }>) => Promise<void>;
    reseatContextGroundFeaturesForBase: () => void;
    unsampledContextGroundSeatPoints: () => Array<{ lat: number; lon: number }>;
};

const key = (p: { lat: number; lon: number }): string => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;

function makeStub(over: Partial<Stub> = {}): Stub {
    const proto = CesiumViewport.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    const s: Stub = {
        viewer: { scene: { requestRender: () => {} }, terrainProvider: { availability: {} } },
        groundReliefAttached: () => true,
        formaTerrainBaseHeight: 71.0,                   // the founder's settled Baixa base
        contextGroundCache: new Map(),
        contextGroundSeatPoints: new WeakMap(),
        contextLanduseEntities: [],
        contextParkEntities: [],
        contextRoadEntities: [],
        contextSeaEntities: [],
        contextRailEntities: [],
        contextWaterEntities: [],
        terrainProviderHasElevationData: () => true,
        sampleGround: () => NaN,
        sampleContextGroundsBatch: async () => {},
        reseatContextGroundFeaturesForBase: () => {},
        unsampledContextGroundSeatPoints: () => [],
        ...over,
    };
    // The SHIPPED methods, bound to the stub. `sampleGround` is the real one too, so the cache /
    // fallback rule under test is the production rule (no globe → the safe base).
    for (const m of ['reseatContextGroundFeaturesForBase', 'unsampledContextGroundSeatPoints',
                     'sampleGround', 'sampleContextGroundsBatch']) {
        (s as unknown as Record<string, unknown>)[m] = (proto[m] as (...a: unknown[]) => unknown).bind(s);
    }
    return s;
}

/** A seated entity with its recorded seat point, as a loader would leave it. */
function ent(s: Stub, list: keyof Stub, kind: 'polygon' | 'corridor', layer: string, point: { lat: number; lon: number } | null, h = 71.0): Ent {
    const e: Ent = kind === 'polygon' ? { polygon: { height: new ConstantProperty(h) } } : { corridor: { height: new ConstantProperty(h) } };
    (s[list] as Ent[]).push(e);
    s.contextGroundSeatPoints.set(e, { layer, point });
    return e;
}
const h = (e: Ent): number => (e.polygon?.height ?? e.corridor?.height)!.getValue();

describe('§GROUND-DRAPE-ON-RELIEF (L-12924) — the ground-feature re-seat is PER ENTITY, on a slope', () => {
    it('with the seat points cached, entities down the hill get DIFFERENT heights = own ground + ladder', () => {
        const s = makeStub();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const west = { lat: BAIXA.lat, lon: BAIXA.lon };            // ground 60
        const east = { lat: BAIXA.lat, lon: BAIXA.lon + 0.005 };    // ground 110 — 50 m uphill
        s.contextGroundCache.set(key(west), groundAt(west.lat, west.lon));
        s.contextGroundCache.set(key(east), groundAt(east.lat, east.lon));
        const gW = ent(s, 'contextLanduseEntities', 'polygon', 'landuse', west);
        const gE = ent(s, 'contextLanduseEntities', 'polygon', 'landuse', east);
        const rW = ent(s, 'contextRoadEntities', 'corridor', 'roads', west);
        const rE = ent(s, 'contextRoadEntities', 'corridor', 'roads', east);
        const railE = ent(s, 'contextRailEntities', 'corridor', 'rail', east);
        const wE = ent(s, 'contextWaterEntities', 'polygon', 'water', east);

        s.reseatContextGroundFeaturesForBase();

        // The old pass wrote 71.005 into BOTH landuse polygons. Now: 60.005 at Baixa, 110.005 uphill.
        expect(h(gW)).toBeCloseTo(60.005, 6);
        expect(h(gE)).toBeCloseTo(110.005, 6);
        expect(h(gE) - h(gW)).toBeCloseTo(50, 6);
        // The §12.4 ladder is preserved RELATIVE to each entity's own ground.
        expect(h(rW)).toBeCloseTo(60.02, 6);
        expect(h(rE)).toBeCloseTo(110.02, 6);
        expect(h(railE)).toBeCloseTo(110.022, 6);        // rail: in the re-seat for the first time
        expect(h(wE)).toBeCloseTo(110.03, 6);
        expect(h(gE)).toBeLessThan(h(rE));
        expect(h(rE)).toBeLessThan(h(railE));
        expect(h(railE)).toBeLessThan(h(wE));
    });

    it('an entity whose point is NOT cached seats on the safe base in pass 1, then pass 2 samples it and corrects in place', async () => {
        const s = makeStub();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        sampleTerrainMostDetailed.calls.length = 0;
        const east = { lat: BAIXA.lat, lon: BAIXA.lon + 0.003 };    // ground 90, not yet in the cache
        const gE = ent(s, 'contextParkEntities', 'polygon', 'parks', east);
        const noPoint = ent(s, 'contextParkEntities', 'polygon', 'parks', null);

        s.reseatContextGroundFeaturesForBase();
        // Pass 1 (synchronous): the safe base + ladder — never a stray 0, never left at the load height.
        expect(h(gE)).toBeCloseTo(71.01, 6);
        expect(h(noPoint)).toBeCloseTo(71.01, 6);
        // Pass 2: exactly the missing point was batch-sampled ONCE, and the entity moved onto its ground.
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
        expect(sampleTerrainMostDetailed.calls).toHaveLength(1);
        expect(sampleTerrainMostDetailed.calls[0]).toHaveLength(1);
        expect(h(gE)).toBeCloseTo(90.01, 6);
        expect(h(noPoint)).toBeCloseTo(71.01, 6);          // no point → stays on the safe base
    });

    it('is a no-op on flat / keyless ground (the load-time single scalar was already exact)', () => {
        const s = makeStub({ groundReliefAttached: () => false });
        const e = ent(s, 'contextLanduseEntities', 'polygon', 'landuse', { lat: BAIXA.lat, lon: BAIXA.lon }, 0.005);
        s.reseatContextGroundFeaturesForBase();
        expect(h(e)).toBe(0.005);
    });

    it('skips an entity of the other geometry kind and one with no scalar height, and never throws', () => {
        const s = makeStub();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const noHeight: Ent = { polygon: {} };
        s.contextLanduseEntities.push(noHeight);
        const corridorInPolygonList: Ent = { corridor: { height: new ConstantProperty(5) } };
        s.contextLanduseEntities.push(corridorInPolygonList);
        expect(() => s.reseatContextGroundFeaturesForBase()).not.toThrow();
        expect(h(corridorInPolygonList)).toBe(5);         // landuse lifts polygons only; untouched
    });
});
