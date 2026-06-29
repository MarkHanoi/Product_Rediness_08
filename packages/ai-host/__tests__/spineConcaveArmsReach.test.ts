// §SPINE-CONCAVE-ARMS — END-TO-END circulation reach on an L/T/U house footprint.
//
// Drives the REAL subdivide → walls/doors pipeline (spine-first + spine-tree, the house default) on a
// concave axis-rectilinear shell and asserts the engine CAN ship a layout in which every PRIVATE/
// SERVICE room reaches circulation (the founder's `circulation` rule == `unroutedToCirculationRoomIds`,
// the §DIAG-CIRCULATION-REACH sealed=[none] goal). BEFORE the §SPINE-CONCAVE-ARMS fix the straight (I)
// corridor stranded the perpendicular arm's rooms → they shipped sealed (the founder's red nodes).
//
// `enumerateLayouts` tiles each of its 8 strategy frames (axis × order × mirror) and ships the BEST,
// so a layout that is fully reachable in SOME frame is what the founder sees. To assert that WITHOUT
// touching the `window.__pryzmSpineTree` global (which would pollute sibling suites in the shared
// vitest worker), we drive `subdivideWithReport({ spineTree: true })` DIRECTLY over the shell AND its
// axis-mirror/transpose variants — the same frame family enumerate explores — and assert the BEST has
// zero sealed private rooms. Complements the pure-geometry `spineConcaveArmsBranching.test.ts`.

import { describe, expect, it } from 'vitest';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { subdivideWithReport } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { decomposeToRects } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

const PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: false,
    includeKitchen: true, livingRoom: true, openPlanKitchenDining: true, entranceHall: true,
};
const NEEDS = new Set(['bedroom', 'master', 'bathroom', 'wc', 'study', 'utility', 'storage']);

const L_SHELL: Pt[] = [{ x: 0, z: 0 }, { x: 16, z: 0 }, { x: 16, z: 6 }, { x: 6, z: 6 }, { x: 6, z: 14 }, { x: 0, z: 14 }];
const T_SHELL: Pt[] = [{ x: 0, z: 0 }, { x: 18, z: 0 }, { x: 18, z: 6 }, { x: 12, z: 6 }, { x: 12, z: 14 }, { x: 6, z: 14 }, { x: 6, z: 6 }, { x: 0, z: 6 }];
const U_SHELL: Pt[] = [{ x: 0, z: 0 }, { x: 18, z: 0 }, { x: 18, z: 14 }, { x: 12, z: 14 }, { x: 12, z: 6 }, { x: 6, z: 6 }, { x: 6, z: 14 }, { x: 0, z: 14 }];
const SHAPES: Array<[string, Pt[]]> = [['L', L_SHELL], ['T', T_SHELL], ['U', U_SHELL]];

const polyArea = (poly: readonly Pt[]): number => {
    let s = 0;
    for (let i = 0; i < poly.length; i++) { const a = poly[i]!, b = poly[(i + 1) % poly.length]!; s += a.x * b.z - b.x * a.z; }
    return Math.abs(s) / 2;
};
const bbox = (poly: readonly Pt[]) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    return { x0, z0, x1, z1 };
};
/** The strategy frames enumerate explores: axis-swap × mirror (order doesn't move geometry), so 4
 *  geometric variants cover the distinct layouts. Pure, deterministic. */
function frames(poly: readonly Pt[]): Pt[][] {
    const bb = bbox(poly);
    const mir = (p: Pt): Pt => ({ x: bb.x0 + bb.x1 - p.x, z: p.z });
    const swap = (p: Pt): Pt => ({ x: p.z, z: p.x });
    const out: Pt[][] = [];
    for (const doSwap of [false, true]) for (const doMir of [false, true]) {
        out.push(poly.map(p => { let q = doMir ? mir(p) : p; if (doSwap) q = swap(q); return q; }));
    }
    return out;
}

/** Drive the spine-tree subdivide + walls/doors on a concave shell; return sealed private/service rooms. */
function sealedPrivate(shell: Pt[]): { sealed: string[]; applied: boolean } {
    const graph = buildBubbleGraph(PROGRAM, polyArea(shell), shell, { envelopeFitGrowth: false });
    const rects = decomposeToRects(shell);
    const sub = subdivideWithReport(rects, graph, { spineFirst: true, spineTree: true, shellPolygon: shell });
    const subAny = sub as typeof sub & { spineFirstApplied?: boolean; cellPolygonById?: ReadonlyMap<string, readonly Pt[]> };
    const wd = buildWallsAndDoors(sub.placements, graph, {
        ...(subAny.cellPolygonById ? { cellPolygonById: subAny.cellPolygonById } : {}),
        shellPolygon: shell,
    });
    const typeById = new Map(graph.rooms.map(r => [r.id, r.type]));
    const sealed = [...wd.sealedRoomIds, ...wd.unroutedToCirculationRoomIds]
        .filter((id, i, a) => a.indexOf(id) === i)
        .filter(id => NEEDS.has(typeById.get(id) ?? ''))
        .map(id => `${id}(${typeById.get(id)})`);
    return { sealed, applied: subAny.spineFirstApplied === true };
}

describe('§SPINE-CONCAVE-ARMS — the branching corridor reaches every room on an L/T/U footprint', () => {
    for (const [name, shell] of SHAPES) {
        describe(`${name}-shaped footprint`, () => {
            it('the spine-tree (branching) path is APPLIED on some frame — not the straight legacy carve', () => {
                const anyApplied = frames(shell).some(f => sealedPrivate(f).applied);
                expect(anyApplied, `the §SPINE-TREE branching path must fire on the ${name} plate`).toBe(true);
            });

            it('the engine ships a frame with ZERO sealed/unreachable private rooms (all-blue reachability)', () => {
                // enumerate ships the BEST of the strategy frames; assert at least one is fully reachable.
                const perFrame = frames(shell).map(f => sealedPrivate(f).sealed);
                const best = perFrame.reduce((a, b) => (a.length <= b.length ? a : b));
                expect(best, `best frame still seals private rooms: ${best.join(',')} (all frames: ${JSON.stringify(perFrame)})`).toHaveLength(0);
            });
        });
    }

    it('is deterministic — the same concave shell twice gives an identical placement set', () => {
        const graph = buildBubbleGraph(PROGRAM, polyArea(L_SHELL), L_SHELL, { envelopeFitGrowth: false });
        const rects = decomposeToRects(L_SHELL);
        const a = subdivideWithReport(rects, graph, { spineFirst: true, spineTree: true, shellPolygon: L_SHELL });
        const b = subdivideWithReport(rects, graph, { spineFirst: true, spineTree: true, shellPolygon: L_SHELL });
        expect(JSON.stringify(a.placements)).toEqual(JSON.stringify(b.placements));
    });
});
