// @vitest-environment happy-dom
//
// §FIX-PLAN-DOOR-CUTS-WALL (L-246) — in plan, a door must DISCONTINUE THE WALL.
//
// Founder: "The door — when placed — should DISCONTINUE THE WALL in this precise
// section." The wall's face lines must terminate on the opening's void edges, the
// jambs must close the void, and the poché must not bleed across it.
//
// THE ROOT CAUSE THESE TESTS LOCK DOWN. The plan `:cut` layer was populated only by
// `classifyByVertexY`, which tags an EDGE as cut when an endpoint lies within
// CUT_LINE_EPSILON (15 cm) of the cut plane. A wall solid has NO edge anywhere near a
// 1.2 m cut plane — its horizontal edges sit at the base and the head, its vertical
// edges have endpoints only at those two elevations. So A-WALL:cut was ALWAYS EMPTY,
// which is why there was never a poché fill to clip and never a cut lineweight.
// `first()` below proves exactly that, so the regression cannot silently return.
//
// `buildPlanCutSectionGeometry` instead intersects the solid's triangles with the
// horizontal plane y = cutPlaneY. The opening is then voided BY CONSTRUCTION: no line
// and no fill can cross it on ANY wall render path, because at the cut height the
// solid simply is not there. The invariant `wall face line terminus === opening void
// edge === frame jamb tick` is OBTAINED from the geometry rather than asserted about it.

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { mergeGeometries } from '@pryzm/renderer-three';
import {
    buildPlanCutSectionGeometry,
    classifyByVertexY,
} from '../src/engine/views/EdgeProjectorService.js';

// A 4 m × 3 m wall, 0.2 m thick, carrying a 1 m door void (sill 0 → head 2.1).
const LEN = 4, THICK = 0.2, HEIGHT = 3;
const VOID_X0 = 1.5, VOID_X1 = 2.5, HEAD = 2.1;
const CUT = 1.2;   // plan cut height — ABOVE the sill, BELOW the head: it passes THROUGH the door

/** A box spanning [x0,x1] × [y0,y1] × the full wall thickness, in world space. */
function box(x0: number, x1: number, y0: number, y1: number): THREE.BufferGeometry {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, THICK);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
    return g;
}

/**
 * The wall AS THE SOLID ACTUALLY IS once a door is cut into it: a left pier, a right
 * pier, and a lintel bridging them ABOVE the door head. Note the lintel DOES span the
 * void — the solid is continuous up there — which is what makes the cut-plane test
 * meaningful rather than tautological.
 */
function wallWithDoor(): THREE.Mesh {
    const merged = mergeGeometries([
        box(0, VOID_X0, 0, HEIGHT),          // left pier
        box(VOID_X1, LEN, 0, HEIGHT),        // right pier
        box(VOID_X0, VOID_X1, HEAD, HEIGHT), // lintel, above the door head
    ], false)!;
    const mesh = new THREE.Mesh(merged);
    mesh.updateMatrixWorld(true);
    return mesh;
}

/** A plain wall with no opening — one unbroken box. */
function plainWall(): THREE.Mesh {
    const mesh = new THREE.Mesh(box(0, LEN, 0, HEIGHT));
    mesh.updateMatrixWorld(true);
    return mesh;
}

/** World-space x of every vertex in a cut geometry. */
function xs(geo: THREE.BufferGeometry | null): number[] {
    if (!geo) return [];
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    return Array.from({ length: p.count }, (_, i) => p.getX(i));
}

function ys(geo: THREE.BufferGeometry | null): number[] {
    if (!geo) return [];
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    return Array.from({ length: p.count }, (_, i) => p.getY(i));
}

describe('§FIX-PLAN-DOOR-CUTS-WALL — the plan cut is a TRUE section of the solid', () => {
    it('THE BUG: classifyByVertexY finds NO cut edge on a wall — this is why :cut was always empty', () => {
        // The wall box's edges live at y=0 and y=3. The cut plane is 1.2 with a 15 cm
        // epsilon, so NOTHING is within reach of it. An empty :cut layer means no poché
        // fill and no cut lineweight — the founder's "the drawing reads flat".
        const edges = new THREE.EdgesGeometry(plainWall().geometry);
        const { cutGeo } = classifyByVertexY(edges, CUT, 0, 0.15, null);
        expect(cutGeo).toBeNull();
    });

    it('a plain wall DOES yield a section rectangle at the cut plane', () => {
        const cut = buildPlanCutSectionGeometry(plainWall(), CUT);
        expect(cut).not.toBeNull();
        // Every vertex lies ON the cut plane — it is a horizontal section, not a projection.
        for (const y of ys(cut)) expect(y).toBeCloseTo(CUT, 6);
        // It spans the whole wall: no opening, so nothing interrupts it.
        expect(Math.min(...xs(cut))).toBeCloseTo(0, 6);
        expect(Math.max(...xs(cut))).toBeCloseTo(LEN, 6);
    });

    it('THE FIX: the door VOIDS the cut — no cut geometry exists inside the opening', () => {
        const cut = buildPlanCutSectionGeometry(wallWithDoor(), CUT);
        expect(cut).not.toBeNull();

        // NOTHING may lie strictly inside the void span. This is the founder's ask,
        // stated as an invariant: the wall does not merely LOOK interrupted at the
        // door — at the cut height it is genuinely not there. No line and no poché
        // fill can cross a void that contains no geometry.
        const inside = xs(cut).filter(x => x > VOID_X0 + 1e-4 && x < VOID_X1 - 1e-4);
        expect(inside).toEqual([]);
    });

    it('the wall face lines TERMINATE on the void edges — the jambs close the opening', () => {
        const cut = buildPlanCutSectionGeometry(wallWithDoor(), CUT);
        const x = xs(cut);
        // INVARIANT: wall face line terminus === opening void edge === frame jamb tick.
        expect(x.some(v => Math.abs(v - VOID_X0) < 1e-4)).toBe(true); // left jamb
        expect(x.some(v => Math.abs(v - VOID_X1) < 1e-4)).toBe(true); // right jamb
        // …and the wall still runs out to both of its own ends.
        expect(Math.min(...x)).toBeCloseTo(0, 6);
        expect(Math.max(...x)).toBeCloseTo(LEN, 6);
    });

    it('the LINTEL spans the void but sits above the cut — it must not re-fill the opening', () => {
        // Proves the void is empty because of WHERE THE CUT PLANE IS, not because the
        // solid is absent: raise the cut above the door head and the wall reads solid again.
        const aboveHead = buildPlanCutSectionGeometry(wallWithDoor(), (HEAD + HEIGHT) / 2);
        const spanning = xs(aboveHead).filter(v => v > VOID_X0 + 1e-4 && v < VOID_X1 - 1e-4);
        expect(aboveHead).not.toBeNull();
        expect(spanning.length).toBeGreaterThan(0); // the lintel IS cut, above the head
    });

    it('a solid that does not straddle the cut plane contributes nothing', () => {
        // The AABB straddle-reject: a slab below the plan cut must not be sectioned,
        // or the whole floor plate would be painted as poché.
        const below = new THREE.Mesh(box(0, LEN, 0, 0.3));
        below.updateMatrixWorld(true);
        expect(buildPlanCutSectionGeometry(below, CUT)).toBeNull();
    });
});
