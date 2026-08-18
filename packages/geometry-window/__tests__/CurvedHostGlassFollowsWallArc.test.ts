/**
 * §FEAT-CURVED-WINDOW-LEAF (L-957) — SLICE 1: THE GLASS IS CURVED, ON THE WALL'S
 * OWN ARC.
 *
 * The founder's spec has three clauses and the binding one is the third: *"the
 * same precised curved than the wall."* Not an arc that resembles the wall's — the
 * wall's. So the assertion that carries this file is not "the pane is bowed"
 * (a pane bowed on an independently-computed arc would pass that and still show a
 * seam where it meets the reveal). It is:
 *
 *     EVERY VERTEX OF THE PANE EQUALS A POINT THE WALL'S OWN RESOLVER RETURNS.
 *
 * The expected values are computed here by calling `hostedElementFrame()` from
 * `@pryzm/geometry-wall` — the same function `WallFragmentBuilder`'s carve, the
 * plan symbol and the snap providers position from — and compared to the built
 * scene graph. If the builder ever grows its own Bézier, its own radius or its own
 * `atan2` over the baseline, the two stop agreeing and this file says so. That is
 * the C84 EI-9 defect this feature exists to avoid, made observable.
 *
 * COMMITTED ≠ REACHABLE: every number below is read off `matrixWorld` after a real
 * `rebuild()`, never off a pure function's return.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WindowBuilder } from '../src/WindowBuilder';
import { hostedElementFrame, wallCentreline } from '@pryzm/geometry-wall';
import { resolveWindowDimensions } from '../src/WindowDimensions';

/**
 * A 6 m-chord wall bowed toward −Z. `segments: 16` is what the pane must inherit;
 * the control point is well off the chord so the sagitta is centimetres, not noise.
 */
const CURVED_WALL = {
    id: 'w1', levelId: 'L0', thickness: 0.2, height: 3, baseOffset: 0,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    curve: { control: { x: 3, y: 0, z: -2.4 }, segments: 16 },
    openings: [{ elementId: 'win1', offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9 }],
};

const STRAIGHT_WALL = {
    id: 'w1', levelId: 'L0', thickness: 0.2, height: 3, baseOffset: 0,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
};

/** ONE pane, so "the glazing mesh" is unambiguous and its span is the full light. */
const WIN = {
    id: 'win1', wallId: 'w1', openingId: 'o1',
    offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9,
    frameThickness: 0.05, frameDepth: 0.2, frameColor: '#e8e8e8',
    columnRatios: [1], rowRatios: [1],
    columnDividerThickness: 0.03, rowDividerThickness: 0.03,
    sill: true, sillDepth: 0.08, sillThickness: 0.03,
    glassOpacity: 0.3, windowType: 'single',
};

function buildOn(wall: unknown, win: Record<string, unknown> = WIN): THREE.Group {
    const wallStoreStub = {
        getById: () => wall,
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

function meshesWithRole(group: THREE.Group, role: string): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    group.traverse(o => { if (o instanceof THREE.Mesh && o.userData?.role === role) out.push(o); });
    return out;
}

/** Every vertex of `mesh`, in WORLD space, de-duplicated to 1e-9 m. */
function worldVerts(mesh: THREE.Mesh): Array<{ x: number; y: number; z: number }> {
    const pos = mesh.geometry.getAttribute('position');
    const seen = new Set<string>();
    const out: Array<{ x: number; y: number; z: number }> = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld);
        const k = `${v.x.toFixed(9)}|${v.y.toFixed(9)}|${v.z.toFixed(9)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ x: v.x, y: v.y, z: v.z });
    }
    return out;
}

// The pane's clear sight line, derived exactly as `buildVisuals` derives it at LOD
// `fine`: one cell the size of the inner frame opening, reduced by the sash on each
// side. Restated from the dimension RESOLVER, never from a literal.
const DIMS = resolveWindowDimensions(WIN as never);
const INNER_W = WIN.width - 2 * WIN.frameThickness;
const INNER_H = WIN.height - 2 * WIN.frameThickness;
const SASH_T = Math.min(DIMS.sashThickness, INNER_W / 2, INNER_H / 2);
const GLASS_W = Math.max(INNER_W - 2 * SASH_T, 0.01);
const HALF_T = DIMS.glazingThickness / 2;

describe('§FEAT-CURVED-WINDOW-LEAF slice 1 — curved glass on the host wall\'s own arc', () => {
    it('THE SPEC: every pane vertex is a point the WALL\'S OWN resolver returns', () => {
        const glazing = meshesWithRole(buildOn(CURVED_WALL), 'windowGlazing');
        expect(glazing).toHaveLength(1);
        const got = worldVerts(glazing[0]!);

        // The expected surface, from the canonical resolver — the SAME call the
        // wall's carve and the plan symbol make. Two concentric runs at ±half the
        // glazing thickness, over the pane's own span.
        const hf = hostedElementFrame(CURVED_WALL, WIN.offset, WIN.width);
        const expected: Array<{ x: number; z: number }> = [];
        for (const n of [-HALF_T, HALF_T]) expected.push(...hf.run(-GLASS_W / 2, GLASS_W / 2, n));

        // Every built vertex's XZ must BE one of them. (Y is the leaf's own two
        // levels, asserted separately — the host curve has no Y component at all.)
        //
        // ⚠ The comparison is to 1e-5 m and that is not slack, it is the storage.
        // `BufferGeometry` positions are FLOAT32: at these coordinates one ulp is
        // ~2.4e-7 m, and the world transform compounds a few of them. The wall
        // body's own vertices go through exactly the same float32 attribute, so
        // this is the precision at which pane and reveal can agree AT ALL. What
        // the assertion pins is the SOURCE of the numbers: an independently
        // computed arc — a different Bézier, a fitted radius, a chord — misses by
        // millimetres to centimetres here, three to five orders of magnitude out.
        const TOL = 1e-5;
        const builtXZ = new Map<string, { x: number; z: number }>();
        for (const p of got) builtXZ.set(`${p.x.toFixed(6)}|${p.z.toFixed(6)}`, p);
        expect(builtXZ.size).toBe(expected.length);

        let worst = 0;
        for (const p of builtXZ.values()) {
            let best = Infinity;
            for (const e of expected) best = Math.min(best, Math.hypot(p.x - e.x, p.z - e.z));
            worst = Math.max(worst, best);
        }
        expect(worst).toBeLessThan(TOL);
    });

    it('inherits the HOST\'S segment count and stations — not a resolution of its own', () => {
        const glazing = meshesWithRole(buildOn(CURVED_WALL), 'windowGlazing')[0]!;
        const stations = new Set(worldVerts(glazing).map(p => p.x.toFixed(9)));

        // Interior stations of the HOST centreline that fall strictly inside the
        // pane's span, plus its two ends. Anything else means the pane picked its
        // own tessellation, and pane and reveal would meet on different polylines.
        const cl = wallCentreline(CURVED_WALL);
        const centreS = WIN.offset + WIN.width / 2;
        const lo = centreS - GLASS_W / 2;
        const hi = centreS + GLASS_W / 2;
        const interior = cl.cum.filter(c => c > lo && c < hi).length;
        expect(interior).toBeGreaterThan(0);          // non-vacuity: it really spans chords

        // Two X per station (front + back face) unless they project alike; count
        // stations by the run length the resolver itself reports.
        const hf = hostedElementFrame(CURVED_WALL, WIN.offset, WIN.width);
        expect(hf.run(-GLASS_W / 2, GLASS_W / 2, 0)).toHaveLength(interior + 2);
        expect(stations.size).toBeGreaterThanOrEqual(interior + 2);
    });

    it('THE GLASS ACTUALLY BOWS: its mid-span is off the chord by a real sagitta', () => {
        // Guards against the pin above passing on a pane that is technically built
        // from resolver points but has collapsed to two of them.
        const glazing = meshesWithRole(buildOn(CURVED_WALL), 'windowGlazing')[0]!;
        const vs = worldVerts(glazing).filter(p => Math.abs(p.y - (WIN.sillHeight + WIN.height / 2)) < 1);
        const xs = vs.map(p => p.x);
        const xMin = Math.min(...xs), xMax = Math.max(...xs);
        const end0 = vs.find(p => Math.abs(p.x - xMin) < 1e-9)!;
        const end1 = vs.find(p => Math.abs(p.x - xMax) < 1e-9)!;
        const mid = vs.reduce((best, p) =>
            Math.abs(p.x - (xMin + xMax) / 2) < Math.abs(best.x - (xMin + xMax) / 2) ? p : best, vs[0]!);
        // Perpendicular offset of the mid vertex from the chord joining the ends.
        const dx = end1.x - end0.x, dz = end1.z - end0.z;
        const L = Math.hypot(dx, dz);
        const sagitta = Math.abs((mid.x - end0.x) * dz - (mid.z - end0.z) * dx) / L;
        expect(sagitta).toBeGreaterThan(0.002);       // millimetres, not float noise
    });

    it('the pane is a swept BufferGeometry — a BoxGeometry cannot be curved', () => {
        const curved = meshesWithRole(buildOn(CURVED_WALL), 'windowGlazing')[0]!;
        expect((curved.geometry as { parameters?: unknown }).parameters).toBeUndefined();
        expect(curved.geometry.getAttribute('position').count).toBeGreaterThan(24);
        // …and it carries authored normals, not `computeVertexNormals()` averages
        // that would round the 90° edge between glass face and reveal.
        expect(curved.geometry.getAttribute('normal')).toBeTruthy();
    });

    it('VERTICALS STAY STRAIGHT — the jambs are still boxes, re-seated not swept', () => {
        // The founder's simplification, and slice 2 must not erode it: a vertical
        // line on a vertical-axis sweep is already straight.
        const frames = meshesWithRole(buildOn(CURVED_WALL), 'windowFrame');
        const boxes = frames.filter(m => (m.geometry as { parameters?: unknown }).parameters !== undefined);
        expect(boxes.length).toBeGreaterThanOrEqual(2);   // the two jambs, at minimum
    });

    // ── NON-VACUITY ─────────────────────────────────────────────────────────
    it('on a STRAIGHT host the pane is still a plain BoxGeometry', () => {
        const flat = meshesWithRole(buildOn(STRAIGHT_WALL), 'windowGlazing')[0]!;
        const params = (flat.geometry as unknown as { parameters?: { width: number; depth: number } }).parameters;
        expect(params).toBeDefined();
        expect(params!.width).toBeCloseTo(GLASS_W, 9);
        expect(params!.depth).toBeCloseTo(DIMS.glazingThickness, 9);
    });

    it('the escape hatch restores the flat pane on a curved host', () => {
        // `__pryzmHostedOnCurvedWall = false` is the switch the whole
        // §FEAT-HOSTED-ON-CURVED-WALL family is governed by. The curved LEAF must
        // obey it too, or turning it off leaves bowed glass in a chorded hole.
        const g = globalThis as { __pryzmHostedOnCurvedWall?: boolean };
        g.__pryzmHostedOnCurvedWall = false;
        try {
            const off = meshesWithRole(buildOn(CURVED_WALL), 'windowGlazing')[0]!;
            expect((off.geometry as { parameters?: unknown }).parameters).toBeDefined();
        } finally {
            delete g.__pryzmHostedOnCurvedWall;
        }
    });
});
