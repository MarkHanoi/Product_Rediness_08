/**
 * §FIX-PLAN-CUT-POCHE-OCCLUSION (L-260 B) — the plan cut poché is SOLID.
 *
 * Founder (L-260 B): *"Plan view in theory is a cut section projection about 1.2 m from
 * the level. Walls are solid, and so are slabs — the slab should NOT be visible through
 * the walls. This line of slab should not be visible in plan view as the walls should be
 * SOLID."* His live log: `[HiddenLineRemoval] v1 pass — 2 occluder(s), 0/1532 segments
 * removed` — HLR ran, found the walls, and removed NOTHING.
 *
 * REPRODUCED MECHANISM (this fixture is the proof): HLR v1's test was Cohen-Sutherland
 * "trivial accept" — a segment was hidden only when BOTH endpoints fell inside an occluder
 * AABB. A slab plate edge runs from one side of the plan to the other and CROSSES the wall;
 * both of its endpoints are outside the wall box, so the segment could never be classified
 * hidden, and it was drawn — in full — straight through the wall poché. Neither occluder
 * registration nor edge testing was broken: the *test itself* could not express the case.
 * (Draw order compounds it: PlanViewCanvas paints poché fills first, then all linework on
 * top — so an un-clipped segment is guaranteed to sit ON the poché.)
 *
 * THE INVARIANT GUARDED HERE: nothing below or beyond the cut plane may be drawn INSIDE a
 * cut element's poché region. Segments are CLIPPED at the poché boundary; the parts outside
 * survive, the parts inside are removed.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { removeHiddenLines } from './HiddenLineRemoval';

function makeFakeDrawing() {
    const three = new THREE.Group();
    const createdLayers = new Set<string>();
    const drawing = {
        three,
        layers: { create: (name: string) => { createdLayers.add(name); }, has: (n: string) => createdLayers.has(n) },
        addProjectionLines: (lines: THREE.LineSegments, _layer: string) => { three.add(lines); },
    };
    return { drawing: drawing as unknown as import('@thatopen/components').TechnicalDrawing, three, createdLayers };
}

/** LineSegments in drawing space (H = x, V = z), stamped like EdgeProjectorService. */
function seg(uuid: string, layerName: string, points: Array<[number, number]>): THREE.LineSegments {
    const pos: number[] = [];
    for (const [x, z] of points) pos.push(x, 0, z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial());
    ls.name = layerName;
    ls.userData.layerName = layerName;
    ls.userData.elementUUID = uuid;
    return ls;
}

/** Closed rectangle outline as 4 segments (the plane∩solid section of a cut wall). */
function rectOutline(x0: number, z0: number, x1: number, z1: number): Array<[number, number]> {
    return [
        [x0, z0], [x1, z0],
        [x1, z0], [x1, z1],
        [x1, z1], [x0, z1],
        [x0, z1], [x0, z0],
    ];
}

function segmentsOf(ls: THREE.LineSegments): Array<[[number, number], [number, number]]> {
    const p = ls.geometry.getAttribute('position') as THREE.BufferAttribute;
    const out: Array<[[number, number], [number, number]]> = [];
    for (let i = 0; i + 1 < p.count; i += 2) {
        out.push([[p.getX(i), p.getZ(i)], [p.getX(i + 1), p.getZ(i + 1)]]);
    }
    return out;
}

function findNode(three: THREE.Object3D, uuid: string, layerName: string): THREE.LineSegments | undefined {
    let found: THREE.LineSegments | undefined;
    three.traverse((o) => {
        if (o instanceof THREE.LineSegments &&
            o.userData?.elementUUID === uuid &&
            o.userData?.layerName === layerName) found = o;
    });
    return found;
}

/** True when point (px,pz) lies strictly inside the axis-aligned box. */
function inside(px: number, pz: number, x0: number, z0: number, x1: number, z1: number): boolean {
    return px > x0 + 1e-6 && px < x1 - 1e-6 && pz > z0 + 1e-6 && pz < z1 - 1e-6;
}

describe('§FIX-PLAN-CUT-POCHE-OCCLUSION (L-260 B) — the cut poché is solid', () => {

    it('CLIPS a slab edge that CROSSES a cut wall — the founder\'s "slab line through the wall"', () => {
        const { drawing, three } = makeFakeDrawing();

        // Wall cut at the 1.2 m plane: a 0.2 m-thick band across the plan (A-WALL:cut,
        // exactly what buildPlanCutSectionGeometry (L-246) now emits).
        three.add(seg('wall-1', 'A-WALL:cut', rectOutline(2, 0, 2.2, 6)));

        // Slab plate below the cut plane — its plate edge runs [0,3] → [6,3] and passes
        // straight THROUGH the wall band. Both endpoints are OUTSIDE the wall AABB, which
        // is precisely why HLR v1 removed 0 of it.
        three.add(seg('slab-1', 'A-FLOR:proj', [[0, 3], [6, 3]]));

        removeHiddenLines(drawing);

        const slab = findNode(three, 'slab-1', 'A-FLOR:proj')!;
        const parts = segmentsOf(slab);

        // The crossing edge survives OUTSIDE the wall and is gone INSIDE it.
        expect(parts.length).toBe(2);
        for (const [[ax, az], [bx, bz]] of parts) {
            const mx = (ax + bx) / 2, mz = (az + bz) / 2;
            expect(inside(mx, mz, 2, 0, 2.2, 6)).toBe(false);
        }
        // The visible spans reach the wall faces exactly (clip lands on the poché boundary).
        const xs = parts.flatMap(([a, b]) => [a[0], b[0]]).sort((p, q) => p - q);
        expect(xs[1]).toBeCloseTo(2.0, 6);
        expect(xs[2]).toBeCloseTo(2.2, 6);
    });

    it('removes a :beyond segment lying wholly inside the poché, and keeps one wholly outside', () => {
        const { drawing, three } = makeFakeDrawing();
        three.add(seg('wall-1', 'A-WALL:cut', rectOutline(0, 0, 4, 0.3)));
        three.add(seg('roof-1', 'A-ROOF:beyond', [[1, 0.1], [3, 0.2]]));   // inside → gone
        three.add(seg('roof-1', 'A-ROOF:proj',  [[1, 2.0], [3, 2.0]]));    // outside → kept

        removeHiddenLines(drawing);

        expect(segmentsOf(findNode(three, 'roof-1', 'A-ROOF:beyond')!).length).toBe(0);
        expect(segmentsOf(findNode(three, 'roof-1', 'A-ROOF:proj')!).length).toBe(1);
    });

    it('does NOT occlude through an OPENING — the door void is a hole in the wall section', () => {
        const { drawing, three } = makeFakeDrawing();

        // A wall with a door: the plane∩solid section is TWO closed pieces (left of the jamb,
        // right of the jamb). The void between them is not solid, so nothing may be removed there.
        const left  = rectOutline(0, 0, 2, 0.2);
        const right = rectOutline(3, 0, 5, 0.2);
        three.add(seg('wall-1', 'A-WALL:cut', [...left, ...right]));

        // Door swing arc chord sitting in the void [2,3] — must SURVIVE untouched.
        three.add(seg('door-1', 'A-DOOR-PROJ', [[2.1, 0.1], [2.9, 0.1]]));

        removeHiddenLines(drawing);

        expect(segmentsOf(findNode(three, 'door-1', 'A-DOOR-PROJ')!).length).toBe(1);
    });

    it('never occludes an element against ITSELF (a wall\'s own projection linework survives)', () => {
        const { drawing, three } = makeFakeDrawing();
        three.add(seg('wall-1', 'A-WALL:cut',  rectOutline(0, 0, 4, 0.3)));
        // The wall's own base/head edges project onto its own footprint.
        three.add(seg('wall-1', 'A-WALL:proj', [[0, 0.15], [4, 0.15]]));

        removeHiddenLines(drawing);

        expect(segmentsOf(findNode(three, 'wall-1', 'A-WALL:proj')!).length).toBe(1);
    });

    it('registers the hyphenated ISO cut convention (A-DOOR-CUT) as an occluder too', () => {
        const { drawing, three } = makeFakeDrawing();
        // Door frame jambs authored on the hyphenated `-CUT` sub-layer (DoorPlanSymbolBuilder)
        // are CUT geometry exactly like `A-WALL:cut`; the v1 regex (`/:cut$/`) missed them.
        three.add(seg('door-1', 'A-DOOR-CUT', rectOutline(0, 0, 1, 1)));
        three.add(seg('slab-1', 'A-FLOR:proj', [[0.2, 0.5], [0.8, 0.5]]));

        removeHiddenLines(drawing);

        expect(segmentsOf(findNode(three, 'slab-1', 'A-FLOR:proj')!).length).toBe(0);
    });
});
