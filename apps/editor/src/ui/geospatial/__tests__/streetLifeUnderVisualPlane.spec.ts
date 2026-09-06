// §CTX-SEAT-FIRST-FOR-BAKED-LAYERS (L-12964) — founder, Córdoba 2026-09-06: "the trees and maybe
// OTHER ASSETS sits under the visual plane on the 3d view originally — after the user selects the
// parcel they are nicely visually again". THE "OTHER ASSETS" HALF is this file's subject.
//
// Lamps and pedestrians are the SECOND baked-position layer: `buildLamps` / `buildPeople` call
// `host.groundAt(lat, lon)` and bake the answer straight into each instance's `modelMatrix`, so the
// ground a lamp is asked for at build time is the ground it stands on until the whole primitive is
// rebuilt. The host's `groundAt` is `CesiumViewport.sampleGround`, which consults the detailed
// `contextGroundCache` and, ON A MISS, falls back to `globe.getHeight` — the currently tessellated
// mesh (`renderedTerrainTiles=2`, `camH=600m` at start-up). Nothing pre-sampled the lamp/person
// points, so at start-up every one of them was seated from that coarse mesh, exactly like the
// canopies (`CesiumViewportTreesUnderVisualPlane.test.ts`).
//
// THE FIX UNDER TEST is the `prepareGrounds` hook: the layer chooses its own points, so only the
// layer can say WHICH points need the detailed sampler — and it must be asked BEFORE the first
// `groundAt`, not after. That ORDER is the whole defect, and it is what these cases pin.
//
// ⛔ NOT AN OFFSET. Nothing is lifted by a constant here; the layer asks the same question the parcel
// path asks, over its own points. See the §COARSE-VS-DETAILED probe in `CesiumViewport` for what is
// and is NOT established about the founder's 161.6 → 168.5 pair.

import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Ordered trace of every host interaction — the assertion subject. */
const trace: string[] = [];

vi.mock('cesium', () => {
    class Cartesian3 { constructor(public x = 0, public y = 0, public z = 0) {} }
    const geom = class { constructor(public o: unknown) {} };
    return {
        CylinderGeometry: geom,
        EllipsoidGeometry: geom,
        GeometryInstance: class { constructor(public o: unknown) {} },
        Primitive: class { constructor(public o: unknown) {} },
        PerInstanceColorAppearance: Object.assign(
            class { constructor(public o: unknown) {} }, { VERTEX_FORMAT: {} },
        ),
        ColorGeometryInstanceAttribute: { fromColor: () => ({}) },
        Color: { fromCssColorString: () => ({ withAlpha: () => ({}) }) },
        Cartesian3: Object.assign(Cartesian3, {
            fromDegrees: (lon: number, lat: number, height: number) => {
                trace.push(`bake@${height.toFixed(2)}`);
                return new Cartesian3(lon, lat, height);
            },
        }),
        Transforms: { eastNorthUpToFixedFrame: (c: unknown) => c },
        ShadowMode: { DISABLED: 0 },
    };
});

const LAMP = { lon: -4.79761, lat: 37.88779, synthetic: false, osmId: 1, distM: 10 };
const PERSON = {
    lon: -4.79760, lat: 37.88780, synthetic: true as const, headingRad: 0,
    palette: 0, wayOsmId: 2, distM: 12,
};

vi.mock('../contextFurniture', () => ({ fetchContextFurniture: async () => ({ lamps: [], state: 'ok' }) }));
vi.mock('../contextRoads', () => ({ fetchContextRoads: async () => ({ ways: [] }) }));
vi.mock('../contextLanduse', () => ({ fetchContextLanduse: async () => ({ areas: [] }) }));
vi.mock('../contextStreetLife', () => ({
    PEDESTRIAN_PALETTE_SIZE: 6,
    placeLamps: () => ({
        lamps: [LAMP], mappedCount: 1, syntheticCount: 0, waysLit: 1,
        waysEligible: 1, waysSkippedMapped: 0, syntheticDroppedByCap: 0,
    }),
    placePedestrians: () => ({ people: [PERSON], droppedByCap: 0 }),
    streetLifeLogLine: () => 'stub log line',
}));

import { StreetLifeLayer, LAMP_POLE_HEIGHT_M } from '../contextStreetLifeRender';

/** The two readings of the SAME ground the defect is made of. */
const COARSE_GLOBE_M = 161.6;   // globe.getHeight on the start-up mesh — `sampleGround`'s cache MISS
const DETAILED_M = 168.5;       // sampleTerrainMostDetailed — what every other layer already uses

const CORDOBA = { lat: 37.88779, lon: -4.79761 };

function makeViewer(): { scene: { primitives: { add: () => void; remove: () => void }; requestRender: () => void }; isDestroyed: () => boolean } {
    return {
        scene: { primitives: { add: () => {}, remove: () => {} }, requestRender: () => {} },
        isDestroyed: () => false,
    };
}

/** The real host contract: a synchronous `groundAt` backed by a cache an async hook fills. */
function makeHost(opts: { withPrepare: boolean }): {
    groundAt: (lat: number, lon: number) => number;
    prepareGrounds?: (p: ReadonlyArray<{ lat: number; lon: number }>) => Promise<void>;
    prepared: Array<{ lat: number; lon: number }>;
} {
    const cache = new Map<string, number>();
    const key = (lat: number, lon: number): string => `${lat.toFixed(6)},${lon.toFixed(6)}`;
    const prepared: Array<{ lat: number; lon: number }> = [];
    const host: ReturnType<typeof makeHost> = {
        prepared,
        groundAt: (lat: number, lon: number): number => {
            trace.push('groundAt');
            // EXACTLY `CesiumViewport.sampleGround`: the detailed cache, else the coarse globe mesh.
            return cache.get(key(lat, lon)) ?? COARSE_GLOBE_M;
        },
    };
    if (opts.withPrepare) {
        host.prepareGrounds = async (points): Promise<void> => {
            trace.push('prepareGrounds');
            for (const p of points) { prepared.push(p); cache.set(key(p.lat, p.lon), DETAILED_M); }
        };
    }
    return host;
}

describe("§CTX-SEAT-FIRST-FOR-BAKED-LAYERS (L-12964) — street life must not sit under the visual plane", () => {
    beforeEach(() => {
        trace.length = 0;
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('ORDER: prepareGrounds runs BEFORE the first groundAt, and before anything is baked', async () => {
        const layer = new StreetLifeLayer();
        await layer.load(makeViewer() as never, makeHost({ withPrepare: true }) as never, CORDOBA.lat, CORDOBA.lon);

        expect(trace).toContain('prepareGrounds');
        expect(trace.indexOf('prepareGrounds')).toBeLessThan(trace.indexOf('groundAt'));
        expect(trace.indexOf('prepareGrounds')).toBeLessThan(trace.findIndex((t) => t.startsWith('bake@')));
    });

    it('every lamp and person is baked on the DETAILED ground, never the coarse mesh', async () => {
        const layer = new StreetLifeLayer();
        await layer.load(makeViewer() as never, makeHost({ withPrepare: true }) as never, CORDOBA.lat, CORDOBA.lon);

        const baked = trace.filter((t) => t.startsWith('bake@')).map((t) => Number(t.slice(5)));
        expect(baked.length).toBe(4);                       // pole + head, body + head
        // The lamp pole's centre sits at ground + half its height — the module's own rule.
        expect(baked).toContain(Number((DETAILED_M + LAMP_POLE_HEIGHT_M / 2).toFixed(2)));
        // Nothing anywhere is seated on the coarse reading, at any of the four offsets.
        for (const h of baked) expect(h).toBeGreaterThanOrEqual(DETAILED_M);
    });

    it('prepares EXACTLY the lamp + pedestrian points — no free-riding on another layer', async () => {
        const layer = new StreetLifeLayer();
        const host = makeHost({ withPrepare: true });
        await layer.load(makeViewer() as never, host as never, CORDOBA.lat, CORDOBA.lon);

        expect(host.prepared).toEqual([
            { lat: LAMP.lat, lon: LAMP.lon },
            { lat: PERSON.lat, lon: PERSON.lon },
        ]);
    });

    it('THE CONTROL: a host with NO prepareGrounds seats on the coarse mesh — the hook, not the mock, moves the number', async () => {
        const layer = new StreetLifeLayer();
        await layer.load(makeViewer() as never, makeHost({ withPrepare: false }) as never, CORDOBA.lat, CORDOBA.lon);

        const baked = trace.filter((t) => t.startsWith('bake@')).map((t) => Number(t.slice(5)));
        expect(baked.length).toBe(4);
        expect(baked).toContain(Number((COARSE_GLOBE_M + LAMP_POLE_HEIGHT_M / 2).toFixed(2)));
        // ...which is the pre-L-12964 world, still supported: the hook is OPTIONAL, so a caller with
        // no terrain (the flat/keyless path, tests) is unchanged rather than broken.
        expect(trace).not.toContain('prepareGrounds');
    });

    it('a REJECTING prepareGrounds is non-fatal — the seats fall back, the layer still builds', async () => {
        const layer = new StreetLifeLayer();
        const host = {
            groundAt: (): number => { trace.push('groundAt'); return COARSE_GLOBE_M; },
            prepareGrounds: async (): Promise<void> => { trace.push('prepareGrounds'); throw new Error('sample failed'); },
        };
        await expect(layer.load(makeViewer() as never, host as never, CORDOBA.lat, CORDOBA.lon)).resolves.toBeUndefined();
        expect(trace.filter((t) => t.startsWith('bake@')).length).toBe(4);
    });
});
