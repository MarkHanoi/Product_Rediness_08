/**
 * §OPENING-PROFILE-FRAME (L-1520) — **DOES THE FRAME ACTUALLY FOLLOW THE HOLE, IN THE SCENE?**
 *
 * The founder, on the circular window L-1250 shipped the control for: *"the opening [is] circular
 * but not the frame — the frame is a square frame. Same for arch — same for the door."*
 *
 * ⭐ **EVERY ASSERTION HERE IS READ OFF A BUILT SCENE GRAPH AFTER A REAL `rebuild()`, never off a
 * pure function's return.** `OpeningProfileFrameInset.test.ts` already proves the maths; that
 * suite would have passed unchanged with the builder still ignoring `openingProfile`, which is
 * exactly the [[committed-is-not-reachable]] trap. What this file measures is REACH: does the
 * mesh the user sees carry the curve?
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WindowBuilder } from '../src/WindowBuilder';
import { openingOutlineLocal, insetOutlinePoints } from '@pryzm/geometry-wall';

/** A plain 6 m STRAIGHT wall along +X. No curve, no rake — the ordinary case. */
const WALL = {
    id: 'w1', levelId: 'L0', thickness: 0.2, height: 3, baseOffset: 0,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
};

const BASE = {
    id: 'win1', wallId: 'w1', openingId: 'o1',
    offset: 2.0, width: 1.2, height: 1.2, sillHeight: 0.9,
    frameThickness: 0.05, frameDepth: 0.2, frameColor: '#e8e8e8',
    columnRatios: [1], rowRatios: [1],
    columnDividerThickness: 0.03, rowDividerThickness: 0.03,
    sill: true, sillDepth: 0.08, sillThickness: 0.03,
    glassOpacity: 0.3, windowType: 'single',
};

function buildGroup(win: Record<string, unknown>): THREE.Group {
    const wallStoreStub = {
        getById: () => WALL,
        getLevelById: () => ({ id: 'L0', elevation: 0 }),
    } as never;
    const scene = new THREE.Scene();
    const builder = new WindowBuilder(scene, wallStoreStub);
    (builder as unknown as { rebuild(x: unknown): void }).rebuild(win);
    let group: THREE.Group | null = null;
    scene.traverse(o => { if (o.userData?.id === win.id && o !== scene) group = o as THREE.Group; });
    expect(group).toBeTruthy();
    scene.updateMatrixWorld(true);
    return group!;
}

function meshesByRole(group: THREE.Group, role: string): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    group.traverse(o => { if (o instanceof THREE.Mesh && o.userData?.role === role) out.push(o); });
    return out;
}

function roleCounts(group: THREE.Group): Record<string, number> {
    const out: Record<string, number> = {};
    group.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        const r = String(o.userData?.role ?? '?');
        out[r] = (out[r] ?? 0) + 1;
    });
    return out;
}

describe('§A — the RECTANGULAR window is untouched (the byte-identity guarantee, PR-2)', () => {
    // ⭐ The DIGEST pin for this lives in `StraightHostLeafByteIdentical.test.ts`, which hashes
    // every vertex of every sub-mesh against a constant captured before any of this existed. What
    // is asserted HERE is the structural half — that the rectangular window still reaches the
    // BoxGeometry path at all — because a digest failure says "changed" and this says "how".

    it('an ABSENT profile builds four BOXES, not one band', () => {
        const g = buildGroup({ ...BASE });
        const frame = meshesByRole(g, 'windowFrame');
        expect(frame.length).toBe(4);                            // head, cill, two jambs
        for (const m of frame) expect(m.geometry.type).toBe('BoxGeometry');
    });

    it('an EXPLICIT `rectangular` is the same four boxes — absence and default coincide', () => {
        const a = roleCounts(buildGroup({ ...BASE }));
        const b = roleCounts(buildGroup({ ...BASE, id: 'win1b', openingProfile: 'rectangular' }));
        expect(b).toEqual(a);
    });

    it('⛔ A REFUSED SHAPE FALLS BACK TO THE RECTANGLE — the same fallback the WALL takes', () => {
        // `openingProfileShapeRefusal` rejects a "circle" whose width ≠ height, and
        // `openingOutline` returns `null` for the identical set. The builder therefore CANNOT
        // draw a shape the refusal would have rejected: it never constructs a shape, it only
        // consumes the one the gate vetted. And the frame stays identical to the void, which is
        // the property C86 §11 #1 is about.
        const g = buildGroup({ ...BASE, id: 'winBad', openingProfile: 'circular', width: 2, height: 1 });
        const frame = meshesByRole(g, 'windowFrame');
        expect(frame.length).toBe(4);
        for (const m of frame) expect(m.geometry.type).toBe('BoxGeometry');
    });
});

describe('§B — the PROFILED window: the frame IS the outline', () => {
    const PROFILES: ReadonlyArray<readonly [string, number, number]> = [
        ['round-arch', 1.2, 1.5],
        ['segmental-arch', 1.2, 1.5],
        ['circular', 1.2, 1.2],
    ];

    it.each(PROFILES)('%s — the frame is ONE band, and it is not a box', (kind, width, height) => {
        const g = buildGroup({ ...BASE, id: `win-${kind}`, openingProfile: kind, width, height });
        const frame = meshesByRole(g, 'windowFrame');
        // ⭐ ONE member, not four. A circular frame is a RING — it has no cill and no jambs to
        // name — and an arched one is a curved head continuous with its jambs, which a joiner
        // makes as a single scarf-jointed section.
        expect(frame.length).toBe(1);
        expect(frame[0]!.geometry.type).toBe('ExtrudeGeometry');
    });

    it.each(PROFILES)('%s — ⭐ EVERY frame vertex is a point of the OUTLINE or its INSET', (kind, width, height) => {
        // THE ASSERTION THE FOUNDER'S DEFECT REDUCES TO. C86 §10.1 PR-1 says no arm may re-derive
        // the arc; this proves the frame did not, by showing there is no third source its vertices
        // could have come from. Tolerance is 1e-5 m: THREE stores positions as Float32, and 1e-5
        // is far below the 2 mm sag the outline is sampled to, so it separates "the same point,
        // narrowed" from "a different point".
        const g = buildGroup({ ...BASE, id: `win-v-${kind}`, openingProfile: kind, width, height });
        const outline = openingOutlineLocal(kind, width, height)!;
        const inner = insetOutlinePoints(outline.points, BASE.frameThickness)!;
        const allowed = [...outline.points, ...inner];

        const geo = meshesByRole(g, 'windowFrame')[0]!.geometry;
        const pos = geo.getAttribute('position');
        expect(pos.count).toBeGreaterThan(50);
        let worst = 0;
        for (let i = 0; i < pos.count; i++) {
            let best = Infinity;
            for (const p of allowed) best = Math.min(best, Math.hypot(pos.getX(i) - p.x, pos.getY(i) - p.y));
            worst = Math.max(worst, best);
        }
        expect(worst).toBeLessThan(1e-5);
    });

    it('CIRCULAR — no vertex escapes the circle, and the bbox CORNERS are empty', () => {
        // The C86 §10.1 separating test, applied to the FRAME instead of the wall body: a
        // rectangle pretending to be a circle would put material in the corners. Nothing does.
        const r = 0.6;
        const g = buildGroup({ ...BASE, id: 'win-c2', openingProfile: 'circular', width: 1.2, height: 1.2 });
        const geo = meshesByRole(g, 'windowFrame')[0]!.geometry;
        const pos = geo.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
            expect(Math.hypot(pos.getX(i), pos.getY(i))).toBeLessThanOrEqual(r + 1e-5);
        }
    });

    it('⛔ CIRCULAR HAS NO CILL BOARD — an unknown is OMITTED, not drawn as a rectangle', () => {
        // A circle's outline has no bottom edge for a board to sit on. Drawing one would be a
        // member no fabricator makes, which is the same class of defect as an unknown drawn as a
        // zero. NON-VACUITY: the arches keep theirs, so this is an omission and not a regression
        // in the sill code.
        const circ = roleCounts(buildGroup({ ...BASE, id: 'win-c3', openingProfile: 'circular', width: 1.2, height: 1.2 }));
        const arch = roleCounts(buildGroup({ ...BASE, id: 'win-a3', openingProfile: 'round-arch', width: 1.2, height: 1.5 }));
        const rect = roleCounts(buildGroup({ ...BASE, id: 'win-r3' }));
        expect(circ.windowSill).toBeUndefined();
        expect(arch.windowSill).toBe(1);
        expect(rect.windowSill).toBe(1);
    });

    it('the SASH and the BEAD are concentric bands at LOD fine, and the pane is one sheet', () => {
        const g = buildGroup({ ...BASE, id: 'win-f', openingProfile: 'round-arch', width: 1.2, height: 1.5 });
        const c = roleCounts(g);
        expect(c.windowSash).toBe(1);
        expect(c.windowBead).toBe(1);
        // ⛔ ONE pane, and NO grid. The orthogonal cell grid is a bounding-box construction; a real
        // arched or circular window carries FAN or RADIAL tracery, which nothing on the record can
        // describe. Omitted rather than clipped — a KNOWN GAP, recorded as one.
        expect(c.windowGlazing).toBe(1);
        expect(c.windowMullion).toBeUndefined();
        expect(c.windowTransom).toBeUndefined();
        // …and NON-VACUITY: the rectangular arm at the same settings DOES divide.
        const rectGrid = roleCounts(buildGroup({
            ...BASE, id: 'win-g', columnRatios: [1, 1], rowRatios: [1, 1],
        }));
        expect(rectGrid.windowMullion).toBe(1);
        expect(rectGrid.windowGlazing).toBe(4);
    });

    it('the frame member is EVERYWHERE frameThickness wide — a constant section', () => {
        // Measured on the built mesh rather than on the helper, so a builder that passed the wrong
        // inset (a hard-coded number, `frameDepth`, half the thickness) is caught here.
        const g = buildGroup({ ...BASE, id: 'win-w', openingProfile: 'circular', width: 1.2, height: 1.2 });
        const geo = meshesByRole(g, 'windowFrame')[0]!.geometry;
        const pos = geo.getAttribute('position');
        const radii = new Set<number>();
        for (let i = 0; i < pos.count; i++) radii.add(Math.round(Math.hypot(pos.getX(i), pos.getY(i)) * 1e4));
        const sorted = [...radii].sort((a, b) => a - b).map(v => v / 1e4);
        // Exactly TWO distinct radii — the outer circle and the inner one — separated by ft.
        expect(sorted.length).toBeLessThanOrEqual(3);
        expect(sorted[sorted.length - 1]! - sorted[0]!).toBeCloseTo(BASE.frameThickness, 3);
    });
});

describe('§C — ⛔ THE SECOND BUG: a profiled window must NOT be GPU-instanced', () => {
    it('the frame survives as a real ExtrudeGeometry mesh, never converted to instances', () => {
        // `_convertGroupToInstances` recovers each sub-box's size from
        // `(geometry as BoxGeometry).parameters`. An ExtrudeGeometry has none, so the conversion
        // would fall through its `?? 1` guards and render the founder's circular window as a stack
        // of 1 m CUBES — and windows are the ONE family whose instancing is DEFAULT-ON
        // (§INSTANCE-WINDOWS-DEFAULT-ON, L-1180), so that would have been the DEFAULT rendering of
        // this very fix. The gate reads `isProfiledOpening`, the same predicate the geometry branch
        // branches on, so the two cannot disagree.
        const g = buildGroup({ ...BASE, id: 'win-i', openingProfile: 'circular', width: 1.2, height: 1.2 });
        const frame = meshesByRole(g, 'windowFrame');
        expect(frame.length).toBe(1);
        expect(frame[0]!.geometry.type).toBe('ExtrudeGeometry');
        // A converted group keeps ONLY an invisible hit-proxy; the presence of the real member
        // with its role intact is the evidence that conversion did not run.
        let hitProxy = 0;
        g.traverse(o => { if (o instanceof THREE.Mesh && o.userData?.role === 'hit-proxy') hitProxy++; });
        expect(hitProxy).toBe(0);
    });
});
