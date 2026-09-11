// @vitest-environment happy-dom
//
// ⭐⭐ §ENVELOPE-ROSTER-ONE-SOURCE (L-13309) + §ENVELOPE-DRAW-LIVE-DIMS (L-13308) — EVERY ROSTER
// PROFILE ON BOTH SITE VIEWS, PROVEN AGAINST THE TWO REAL ADAPTERS' RENDER MODELS.
//
// The founder, 2026-09-11:
//   3.3 *"When the user adds another profile - the previous profile gets deleted from the view - then
//        it is still there - but we dont render - neither in plan view nor in 3d view the profile"*
//   3.1 *"When the user creates the envelope under site tab - in plan view and clicks enter - it
//        renders perfect on plan view - but i would like it to render also on 3d site view"*
//   3.2 *"while defining the points … i want to see the preview dims"*
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT RUNS HERE IS PRODUCTION CODE, END TO END ABOVE THE RENDERER
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The gesture driver (`armEnvelopeDraw`), the roster (`drawnEnvelopeFootprintState`), the "add
// another profile" append (`addDrawnEnvelopeProfile` — the rail's "Another Profile" and the panel
// both call it, then ARM, which is exactly the step that used to wipe profile 1), and BOTH real
// adapters — `SiteEnvelopeDrawMap2D` and `SiteEnvelopeDrawCesium` — each over a stand-in of its
// renderer that RECORDS what the adapter pushed: the MapLibre GeoJSON source payloads and the Cesium
// entity set. 2D clicks go through the adapter's real capture-phase DOM listeners; 3D clicks through
// the adapter's real ScreenSpaceEventHandler callbacks.
//
// ⛔ WHAT THE STAND-INS DO NOT PROVE: MapLibre's `unproject`/`project` and Cesium's pick/ellipsoid
// maths — both are fixed linear stand-ins ([[fake-more-capable-than-real]]). The claims under test
// are the LIFECYCLE and the JOIN: which rings each surface holds, after which user steps, and that a
// ring drawn on one view lands at the same lat/lon on the other.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    ENVELOPE_DRAW_DIMS_TESTID,
    ENVELOPE_ROSTER_SOURCE,
    SiteEnvelopeDrawMap2D,
    type EnvelopeDrawMapLike,
} from '../siteEnvelopeDrawMap2D';
import { SiteEnvelopeDrawCesium, type SiteEnvelopeDrawCesiumDeps } from '../siteEnvelopeDrawCesium';
import {
    __resetEnvelopeDrawArmingForTests,
    armEnvelopeDraw,
    registerEnvelopeDrawSurface,
    resetEnvelopeDrawProjectState,
} from '../siteEnvelopeDrawArming';
import {
    __resetDrawnEnvelopeFootprintForTests,
    addDrawnEnvelopeProfile,
    clearDrawnEnvelopeProfiles,
    getDrawnEnvelopeFootprint,
    getDrawnEnvelopeProfiles,
    removeDrawnEnvelopeProfile,
} from '../drawnEnvelopeFootprintState';
import { latLonToProjectXZ } from '../siteEnvelopeDrawFrame';
import { formatEnvelopeDrawLength } from '../envelopeDrawDims';
import { __resetSpaceEnvelopeFaceDragFocusForTests } from '../spaceEnvelopeFaceDragFocusState';

const BCN = { lat: 41.3874, lon: 2.1686 };
/** Barcelona's grid is ~45° off north — θ ≠ 0 is where a frame bug hides (§L-446, L-10740). */
const THETA = Math.PI / 4;
const FRAME = { origin: BCN, thetaRad: THETA };

/** ONE linear pixel → lng/lat stand-in, shared by both renderers so a join can be asserted. */
const toLngLat = (x: number, y: number): { lng: number; lat: number } =>
    ({ lng: BCN.lon + x * 1e-5, lat: BCN.lat - y * 1e-5 });

// ── the MapLibre stand-in ──────────────────────────────────────────────────────────────────────

interface MapStand {
    map: EnvelopeDrawMapLike;
    container: HTMLElement;
    sources: Map<string, unknown>;
    listeners: Map<string, Set<() => void>>;
    pan: { dx: number; dy: number };
    swapStyle(): void;
}

function mapStand(): MapStand {
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({
        left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}),
    }) as DOMRect;
    document.body.appendChild(container);
    const sources = new Map<string, unknown>();
    const layers = new Set<string>();
    const listeners = new Map<string, Set<() => void>>();
    const pan = { dx: 0, dy: 0 };
    const map: EnvelopeDrawMapLike = {
        getCanvasContainer: () => container,
        unproject: ([x, y]) => toLngLat(x, y),
        project: ([lng, lat]) => ({ x: (lng - BCN.lon) / 1e-5 + pan.dx, y: (BCN.lat - lat) / 1e-5 + pan.dy }),
        getSource: (id) => (sources.has(id) ? { setData: (d: unknown) => sources.set(id, d) } : undefined),
        addSource: (id, spec) => { sources.set(id, (spec as { data: unknown }).data); },
        getLayer: (id) => (layers.has(id) ? {} : undefined),
        addLayer: (spec) => { layers.add((spec as { id: string }).id); },
        on: (type, fn) => { (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn); },
        off: (type, fn) => { listeners.get(type)?.delete(fn); },
    };
    return {
        map, container, sources, listeners, pan,
        swapStyle: () => { sources.clear(); layers.clear(); },
    };
}

/** The lng/lat rings the 2D adapter pushed into its roster source — its render model. */
function mapRosterRings(m: MapStand): Array<Array<[number, number]>> {
    const fc = m.sources.get(ENVELOPE_ROSTER_SOURCE) as
        | { features: Array<{ geometry: { coordinates: Array<Array<[number, number]>> } }> }
        | undefined;
    return (fc?.features ?? []).map((f) => f.geometry.coordinates[0]!.slice(0, -1));
}

// ── the Cesium stand-in ────────────────────────────────────────────────────────────────────────

type Rec = Record<string, unknown>;
interface GlobeStand {
    deps: SiteEnvelopeDrawCesiumDeps;
    entities: Set<Rec>;
    handlers: Array<{ actions: Map<string, (m: unknown) => void> }>;
}

function globeStand(): GlobeStand {
    const entities = new Set<Rec>();
    const handlers: GlobeStand['handlers'] = [];
    const colour = (css: string, a: number): Rec => ({ css, a, withAlpha: (x: number) => colour(css, x) });
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => ({
        left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}),
    }) as DOMRect;
    class Cartesian2 { constructor(public x: number, public y: number) {} }
    class ScreenSpaceEventHandler {
        actions = new Map<string, (m: unknown) => void>();
        constructor() { handlers.push(this); }
        setInputAction(fn: (m: unknown) => void, type: string): void { this.actions.set(type, fn); }
        destroy(): void { this.actions.clear(); }
    }
    const C = {
        Cartesian2,
        Cartesian3: { fromDegrees: (lon: number, lat: number, h = 0) => ({ lon, lat, h }) },
        Color: { fromCssColorString: (css: string) => colour(css, 1), WHITE: colour('#ffffff', 1) },
        PolygonHierarchy: class { constructor(public positions: unknown[]) {} },
        ShadowMode: { DISABLED: 0 },
        HeightReference: { CLAMP_TO_GROUND: 1 },
        LabelStyle: { FILL: 0 },
        HorizontalOrigin: { CENTER: 0 },
        VerticalOrigin: { CENTER: 0 },
        ConstantProperty: class { constructor(public value: unknown) {} },
        ConstantPositionProperty: class { constructor(public value: unknown) {} },
        ScreenSpaceEventHandler,
        ScreenSpaceEventType: { LEFT_CLICK: 'LEFT_CLICK', LEFT_DOUBLE_CLICK: 'LEFT_DOUBLE_CLICK', MOUSE_MOVE: 'MOUSE_MOVE' },
        defined: (v: unknown) => v !== undefined && v !== null,
        Cartographic: {
            fromCartesian: (c: { lon: number; lat: number; h: number }) =>
                ({ longitude: (c.lon * Math.PI) / 180, latitude: (c.lat * Math.PI) / 180, height: c.h }),
        },
        Math: { toDegrees: (r: number) => (r * 180) / Math.PI },
    };
    const viewer = {
        scene: {
            canvas,
            requestRender: () => {},
            // ⚠ The same linear stand-in as the map — NOT Cesium's pick, and it proves nothing about it.
            pickPosition: (p: Cartesian2) => { const ll = toLngLat(p.x, p.y); return { lon: ll.lng, lat: ll.lat, h: 12 }; },
            globe: { pick: () => undefined },
        },
        camera: { getPickRay: () => undefined },
        entities: {
            add: (spec: Rec) => { const e: Rec = { ...spec, show: true }; entities.add(e); return e; },
            remove: (e: Rec) => entities.delete(e),
        },
    };
    const deps = {
        viewer,
        Cesium: C,
        getOrigin: () => BCN,
        getSiteLocation: () => ({ trueNorth: THETA }),
        setScenePickingEnabled: () => {},
    } as unknown as SiteEnvelopeDrawCesiumDeps;
    return { deps, entities, handlers };
}

/** The lng/lat rings the 3D adapter holds as roster polygons — its render model. */
function globeRosterRings(g: GlobeStand): Array<Array<[number, number]>> {
    return [...g.entities]
        .filter((e) => e['polygon'] !== undefined)
        .map((e) => ((e['polygon'] as { hierarchy: { positions: Array<{ lon: number; lat: number }> } })
            .hierarchy.positions.map((p) => [p.lon, p.lat] as [number, number])));
}
const globeRosterOutlines = (g: GlobeStand): Rec[] =>
    [...g.entities].filter((e) => (e['polyline'] as Rec | undefined)?.['depthFailMaterial'] !== undefined);

// ── the gestures, through the real adapters ────────────────────────────────────────────────────

let m: MapStand;
let g: GlobeStand;
let map2d: SiteEnvelopeDrawMap2D;
let globe: SiteEnvelopeDrawCesium;
let unregister2d: () => void;
let unregister3d: () => void;

const mapClick = (x: number, y: number): void => {
    m.container.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true, cancelable: true }));
};
const mapMove = (x: number, y: number): void => {
    m.container.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true, cancelable: true }));
};
const enter = (): void => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); };
const handler = (): { actions: Map<string, (m: unknown) => void> } => {
    const h = g.handlers[g.handlers.length - 1];
    expect(h, 'the 3D adapter never armed its event handler').toBeDefined();
    return h!;
};
const globeClick = (x: number, y: number): void => {
    handler().actions.get('LEFT_CLICK')!({ position: { x, y } });
};
const globeMove = (x: number, y: number): void => {
    handler().actions.get('MOUSE_MOVE')!({ endPosition: { x, y } });
};

/** Pixel squares, far enough apart that each profile's ring is distinguishable. */
const SQ_A: Array<[number, number]> = [[100, 100], [300, 100], [300, 300], [100, 300]];
const SQ_B: Array<[number, number]> = [[400, 100], [600, 100], [600, 300], [400, 300]];
const SQ_C: Array<[number, number]> = [[100, 400], [300, 400], [300, 550], [100, 550]];

function drawOnMap(sq: Array<[number, number]>): void {
    expect(armEnvelopeDraw().ok).toBe(true);
    for (const [x, y] of sq) mapClick(x, y);
    enter();
}
function drawOnGlobe(sq: Array<[number, number]>): void {
    expect(armEnvelopeDraw().ok).toBe(true);
    for (const [x, y] of sq) globeClick(x, y);
    enter();
}
/** EXACTLY the rail's "Another Profile" (and the panel's): append a copy of the current, then ARM. */
function addAnotherProfileAndStartDrawing(): void {
    const last = getDrawnEnvelopeFootprint();
    expect(last, 'there is no profile to add another after').not.toBeNull();
    expect(addDrawnEnvelopeProfile(last!)).not.toBeNull();
    expect(armEnvelopeDraw().ok).toBe(true);
}

/** Does `rings` contain a ring whose vertices are the unprojected pixels of `sq` (to ~1 cm)? */
function holdsSquare(rings: Array<Array<[number, number]>>, sq: Array<[number, number]>): boolean {
    return rings.some((r) => r.length === sq.length && r.every(([lon, lat], i) => {
        const want = toLngLat(sq[i]![0], sq[i]![1]);
        return Math.abs(lon - want.lng) < 1e-7 && Math.abs(lat - want.lat) < 1e-7;
    }));
}

beforeEach(() => {
    __resetEnvelopeDrawArmingForTests();
    __resetDrawnEnvelopeFootprintForTests();
    m = mapStand();
    g = globeStand();
    map2d = new SiteEnvelopeDrawMap2D({ map: m.map, getOrigin: () => BCN, getSiteLocation: () => ({ trueNorth: THETA }) });
    globe = new SiteEnvelopeDrawCesium(g.deps);
    unregister2d = registerEnvelopeDrawSurface(map2d);
    unregister3d = registerEnvelopeDrawSurface(globe);
});
afterEach(() => {
    try { globe.disposeFaceDragAffordance(); } catch { /* teardown */ }
    __resetEnvelopeDrawArmingForTests();
    __resetDrawnEnvelopeFootprintForTests();
    __resetSpaceEnvelopeFaceDragFocusForTests();
    document.body.replaceChildren();
});

describe('⭐ 3.1 — a profile closed on the 2D plan is ALSO on the 3D Site (and the reverse)', () => {
    it('Enter on the 2D map puts the ring in BOTH render models, at the same lat/lon', () => {
        drawOnMap(SQ_A);
        expect(getDrawnEnvelopeProfiles()).toHaveLength(1);
        // The 2D map — the view the founder says it already rendered on …
        expect(mapRosterRings(m)).toHaveLength(1);
        expect(holdsSquare(mapRosterRings(m), SQ_A)).toBe(true);
        // … ⭐ and the 3D Site, which is the gap: the old finish painted only the owning surface.
        expect(globeRosterRings(g)).toHaveLength(1);
        expect(holdsSquare(globeRosterRings(g), SQ_A), 'the 3D ring is not where the user clicked on 2D').toBe(true);
        expect(globeRosterOutlines(g)).toHaveLength(1);
    });

    it('…and a ring closed on the 3D Site lands on the 2D map', () => {
        drawOnGlobe(SQ_C);
        expect(holdsSquare(globeRosterRings(g), SQ_C)).toBe(true);
        expect(holdsSquare(mapRosterRings(m), SQ_C), 'a 3D-drawn profile never reached the 2D map').toBe(true);
    });

    it('a 3D Site mounted AFTER the drawing shows it at once — it is painted on registration', () => {
        unregister3d();
        drawOnMap(SQ_A);
        const late = globeStand();
        const lateGlobe = new SiteEnvelopeDrawCesium(late.deps);
        try {
            registerEnvelopeDrawSurface(lateGlobe);
            expect(holdsSquare(globeRosterRings(late), SQ_A)).toBe(true);
        } finally {
            lateGlobe.disposeFaceDragAffordance();
        }
    });
});

describe('⭐ 3.3 — adding another profile never takes the earlier ones off either view', () => {
    it('⭐ "Another profile" ARMS a new draw — profile 1 stays painted on both views WHILE profile 2 is drawn', () => {
        drawOnMap(SQ_A);
        addAnotherProfileAndStartDrawing();              // the step that used to wipe profile 1
        mapClick(SQ_B[0]![0], SQ_B[0]![1]);               // first corner of profile 2 is placed
        expect(holdsSquare(mapRosterRings(m), SQ_A), '2D: profile 1 vanished when profile 2 started').toBe(true);
        expect(holdsSquare(globeRosterRings(g), SQ_A), '3D: profile 1 vanished when profile 2 started').toBe(true);
    });

    it('⭐ a roster of THREE → both render models hold all three, each where it was drawn', () => {
        drawOnMap(SQ_A);
        addAnotherProfileAndStartDrawing();
        for (const [x, y] of SQ_B) mapClick(x, y);
        enter();
        addAnotherProfileAndStartDrawing();
        for (const [x, y] of SQ_C) globeClick(x, y);      // the third one on the OTHER view
        enter();

        expect(getDrawnEnvelopeProfiles().map((p) => p.label)).toEqual(['Profile 1', 'Profile 2', 'Profile 3']);
        for (const [name, rings] of [['2D map', mapRosterRings(m)], ['3D Site', globeRosterRings(g)]] as const) {
            expect(rings, `${name}: roster rings painted`).toHaveLength(3);
            expect(holdsSquare(rings, SQ_A), `${name}: profile 1`).toBe(true);
            expect(holdsSquare(rings, SQ_B), `${name}: profile 2`).toBe(true);
            expect(holdsSquare(rings, SQ_C), `${name}: profile 3`).toBe(true);
        }
        expect(globeRosterOutlines(g)).toHaveLength(3);
    });

    it('a seeded copy that has not been redrawn is ONE ring, not two stacked fills', () => {
        drawOnMap(SQ_A);
        addAnotherProfileAndStartDrawing();
        expect(getDrawnEnvelopeProfiles()).toHaveLength(2);
        expect(mapRosterRings(m)).toHaveLength(1);
        expect(globeRosterRings(g)).toHaveLength(1);
    });

    it('Esc while drawing profile 2 keeps profile 1 on both views', () => {
        drawOnMap(SQ_A);
        addAnotherProfileAndStartDrawing();
        mapClick(SQ_B[0]![0], SQ_B[0]![1]);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(holdsSquare(mapRosterRings(m), SQ_A)).toBe(true);
        expect(holdsSquare(globeRosterRings(g), SQ_A)).toBe(true);
    });
});

describe('the roster is the ONE source — removing or clearing takes the paint with it', () => {
    function threeProfiles(): void {
        drawOnMap(SQ_A);
        addAnotherProfileAndStartDrawing();
        for (const [x, y] of SQ_B) mapClick(x, y);
        enter();
        addAnotherProfileAndStartDrawing();
        for (const [x, y] of SQ_C) mapClick(x, y);
        enter();
    }

    it('removing profile 2 removes ITS ring from both views and keeps the other two', () => {
        threeProfiles();
        const p2 = getDrawnEnvelopeProfiles()[1]!;
        removeDrawnEnvelopeProfile(p2.profileId);
        for (const rings of [mapRosterRings(m), globeRosterRings(g)]) {
            expect(rings).toHaveLength(2);
            expect(holdsSquare(rings, SQ_B)).toBe(false);
            expect(holdsSquare(rings, SQ_A) && holdsSquare(rings, SQ_C)).toBe(true);
        }
    });

    it('clearing the roster empties both views', () => {
        threeProfiles();
        clearDrawnEnvelopeProfiles();
        expect(mapRosterRings(m)).toHaveLength(0);
        expect(globeRosterRings(g)).toHaveLength(0);
        expect(globeRosterOutlines(g)).toHaveLength(0);
    });

    it('⛔ a project switch drops the roster AND its paint — rings about another plot never carry over', () => {
        drawOnMap(SQ_A);
        resetEnvelopeDrawProjectState();                  // the C13 teardown the registry runs
        expect(getDrawnEnvelopeProfiles()).toHaveLength(0);
        expect(mapRosterRings(m)).toHaveLength(0);
        expect(globeRosterRings(g)).toHaveLength(0);
    });

    it('unregistering the 3D adapter takes its rings out of the viewer (the rewire case)', () => {
        drawOnMap(SQ_A);
        expect(globeRosterRings(g)).toHaveLength(1);
        unregister3d();
        expect(globeRosterRings(g)).toHaveLength(0);
        expect(mapRosterRings(m)).toHaveLength(1);
        unregister2d();
    });

    it('a basemap swap on the 2D map puts the roster back (setStyle destroys every source)', () => {
        drawOnMap(SQ_A);
        m.swapStyle();
        expect(mapRosterRings(m)).toHaveLength(0);         // the swap took it …
        for (const fn of [...(m.listeners.get('styledata') ?? [])]) fn();
        expect(holdsSquare(mapRosterRings(m), SQ_A)).toBe(true);  // … and the adapter restored it
    });
});

describe('⭐ 3.2 — the live dims reach BOTH real adapters\' render models', () => {
    it('2D map: the rubber-band chip, in the one formatter, glued to the ground through a pan', () => {
        armEnvelopeDraw();
        mapClick(100, 100);
        mapMove(300, 100);
        const overlay = m.container.querySelector(`[data-testid="${ENVELOPE_DRAW_DIMS_TESTID}"]`);
        expect(overlay, 'no dimension overlay on the 2D map').not.toBeNull();
        const chips = [...overlay!.children].filter((c) => (c as HTMLElement).style.display !== 'none') as HTMLElement[];
        expect(chips).toHaveLength(1);
        const a = latLonToProjectXZ({ lat: toLngLat(100, 100).lat, lon: toLngLat(100, 100).lng }, FRAME);
        const b = latLonToProjectXZ({ lat: toLngLat(300, 100).lat, lon: toLngLat(300, 100).lng }, FRAME);
        expect(chips[0]!.textContent).toBe(formatEnvelopeDrawLength(Math.hypot(b.x - a.x, b.z - a.z)));
        expect(chips[0]!.getAttribute('data-dim-kind')).toBe('live');
        // Its screen seat is the segment midpoint through `map.project` (to float round-trip noise:
        // pixel → lat/lon → project XZ → lat/lon → pixel) …
        const seat = (el: HTMLElement): [number, number] => {
            const mm = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)/.exec(el.style.transform);
            expect(mm, `no translate on the chip: "${el.style.transform}"`).not.toBeNull();
            return [Number(mm![1]), Number(mm![2])];
        };
        expect(seat(chips[0]!)[0]).toBeCloseTo(200, 6);
        expect(seat(chips[0]!)[1]).toBeCloseTo(100, 6);
        // … and a camera `move` re-seats it without a pointer event (the pan case).
        m.pan.dx = 50;
        for (const fn of [...(m.listeners.get('move') ?? [])]) fn();
        expect(seat(chips[0]!)[0]).toBeCloseTo(250, 6);
        expect(seat(chips[0]!)[1]).toBeCloseTo(100, 6);
    });

    it('2D map: the chips and the camera listener end with the gesture', () => {
        armEnvelopeDraw();
        mapClick(100, 100);
        mapMove(300, 100);
        expect(m.listeners.get('move')?.size).toBe(1);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(m.container.querySelector(`[data-testid="${ENVELOPE_DRAW_DIMS_TESTID}"]`)).toBeNull();
        expect(m.listeners.get('move')?.size ?? 0).toBe(0);
    });

    it('3D Site: the rubber-band chip is a Cesium label with the same text', () => {
        armEnvelopeDraw();
        globeClick(100, 100);
        globeMove(300, 100);
        const labels = [...g.entities].filter((e) => e['label'] !== undefined && e['show'] !== false);
        const a = latLonToProjectXZ({ lat: toLngLat(100, 100).lat, lon: toLngLat(100, 100).lng }, FRAME);
        const b = latLonToProjectXZ({ lat: toLngLat(300, 100).lat, lon: toLngLat(300, 100).lng }, FRAME);
        const want = formatEnvelopeDrawLength(Math.hypot(b.x - a.x, b.z - a.z));
        const texts = labels.map((e) => ((e['label'] as { text: { value?: unknown } | string }).text as { value?: unknown }).value);
        expect(texts).toContain(want);
    });
});
