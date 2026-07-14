/**
 * §FEAT-WALL-PLAN-LOD (L-286) — the WALL row of ADR-121's LOD conformance matrix.
 *
 * ADR-121 §3.2, wall × plan: "✗ layer lines always drawn". The dial existed; the wall did
 * not read it. Change the detail level on a wall and NOTHING happened. This suite is the
 * merge-blocking guard that the cell is now real, and it asserts at the OUTCOME — through
 * `inject()`, against the REAL `viewDefinitionStore` and the REAL
 * `resolveEffectiveDetailLevel` precedence chain — not at the seam of a pure helper. (The
 * lesson is L-246's: a fix computed a perfect wall cut-section and threw it away, because
 * the consuming branch never read the map it was written into. Correct geometry that
 * reaches nothing is not a fix.)
 *
 * What must hold (ADR-121 §4.2):
 *   1. DRAUGHTING CHANGES with the tier: coarse emits NOTHING (one poché region);
 *      medium emits the N−1 layer boundary lines; fine adds the insulation hatch.
 *   2. LOD 300 ⊇ LOD 200 ⊇ LOD 100 — STRICTLY additive. A tier may never REMOVE a line
 *      another tier draws. Asserted vertex-for-vertex, not by counting.
 *   3. NO DIMENSION MOVES with the tier (L-127): the boundary lines sit at exactly the
 *      same offsets at medium and at fine.
 *   4. EVERY LINE DERIVES FROM THE RECORD: change `layers[].thickness` and the boundary
 *      moves by exactly that much; change `layers[].function` away from 'insulation' and
 *      the hatch disappears. No literal in the builder.
 *   5. The tier is resolved through the ONE shared resolver, so a C09 per-ELEMENT override
 *      beats the view's own setting (the precedence the door and window rows rely on).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// The builder's only OBC touchpoints are `TechnicalDrawing.toDrawingSpace` (static) and
// the drawing's own `layers` / `addProjectionLines`. Stubbing the module keeps the test in
// Node (no HTMLElement) while leaving EVERY line of the builder under test — including the
// resolver call, the tier gate and the world-Y placement.
vi.mock('@thatopen/components', () => ({
    TechnicalDrawing: { toDrawingSpace: (obj: unknown) => obj },
}));

import { viewDefinitionStore, viewIntentInstanceStore } from '@pryzm/core-app-model';
import { WallLayerPlanSymbolBuilder } from '../src/WallLayerPlanSymbolBuilder';
import type { WallLayerFunction } from '../src/WallTypes';

type Lod = 'coarse' | 'medium' | 'fine';

const LEVEL = 'L0';
const VIEW  = 'vd-plan-lod-test';

/** A 4 m wall along +X. Outward normal = (−dir.z, +dir.x) = +Z, so offsets read as z. */
const layer = (thickness: number, fn: WallLayerFunction) => ({
    name: fn, function: fn, thickness,
});

/** 300 mm external assembly: 20 finish | 100 insulation | 160 structure | 20 finish. */
const WALL = {
    id: 'w1',
    levelId: LEVEL,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
    layers: [
        layer(0.02, 'finish-exterior'),
        layer(0.10, 'insulation'),
        layer(0.16, 'structure'),
        layer(0.02, 'finish-interior'),
    ],
};
const TOTAL = 0.30;
/** Internal boundaries, from the record: −0.15+0.02, +0.10, +0.16 → −0.13, −0.03, +0.13. */
const BOUNDARIES = [-TOTAL / 2 + 0.02, -TOTAL / 2 + 0.12, -TOTAL / 2 + 0.28];

interface Seg { ax: number; az: number; bx: number; bz: number }

/** Run the builder for one wall at one tier, through the real store + resolver. */
function inject(lod: Lod, wall: object = WALL): Seg[] {
    viewDefinitionStore.update(VIEW, { output: { detailLevel: lod } } as never);
    const captured: Seg[] = [];
    const drawing = {
        layers: { has: () => true, create: () => undefined },
        addProjectionLines: (obj: { geometry: { getAttribute(n: string): { array: ArrayLike<number> } } }) => {
            const arr = Array.from(obj.geometry.getAttribute('position').array);
            for (let i = 0; i + 5 < arr.length; i += 6) {
                captured.push({ ax: arr[i], az: arr[i + 2], bx: arr[i + 3], bz: arr[i + 5] });
            }
        },
    };
    const store = { getAll: () => [wall] } as never;
    new WallLayerPlanSymbolBuilder(store).inject(
        drawing as never,
        { id: VIEW, viewType: 'plan', spatial: { levelId: LEVEL } } as never,
    );
    return captured;
}

/** Is `s` present in `segs` (either orientation)? */
function has(segs: Seg[], s: Seg): boolean {
    const eq = (a: number, b: number) => Math.abs(a - b) < 1e-6;
    return segs.some(t =>
        (eq(t.ax, s.ax) && eq(t.az, s.az) && eq(t.bx, s.bx) && eq(t.bz, s.bz)) ||
        (eq(t.ax, s.bx) && eq(t.az, s.bz) && eq(t.bx, s.ax) && eq(t.bz, s.az)));
}

beforeEach(() => {
    viewIntentInstanceStore.delete(VIEW);
    if (!viewDefinitionStore.get(VIEW)) {
        viewDefinitionStore.create({
            id: VIEW, name: 'LOD test plan', viewType: 'plan',
            spatial: { levelId: LEVEL },
        });
    }
});

describe('wall × plan — the DIAL IS WIRED (ADR-121 §3.2, wall row)', () => {
    it('coarse emits NOTHING: the layered wall reads as ONE region', () => {
        expect(inject('coarse')).toHaveLength(0);
    });

    it('medium emits exactly the N−1 internal layer boundaries — the drawing that ships today', () => {
        const segs = inject('medium');
        expect(segs).toHaveLength(BOUNDARIES.length);
        for (const off of BOUNDARIES) {
            expect(has(segs, { ax: 0, az: off, bx: 4, bz: off })).toBe(true);
        }
    });

    it('fine ADDS the insulation hatch and REMOVES nothing (LOD 300 ⊇ LOD 200)', () => {
        const medium = inject('medium');
        const fine   = inject('fine');
        for (const s of medium) expect(has(fine, s)).toBe(true);   // strict superset
        expect(fine.length).toBeGreaterThan(medium.length);
    });

    it('the hatch lies INSIDE the insulation band, and nowhere else', () => {
        const medium = inject('medium');
        const hatch  = inject('fine').filter(s => !has(medium, s));
        // The insulation band spans [−0.13, −0.03] (record: 20 mm finish, then 100 mm).
        const near = -TOTAL / 2 + 0.02, far = -TOTAL / 2 + 0.12;
        expect(hatch.length).toBeGreaterThan(0);
        for (const s of hatch) {
            expect(Math.min(s.az, s.bz)).toBeCloseTo(near, 6);
            expect(Math.max(s.az, s.bz)).toBeCloseTo(far, 6);
            expect(Math.min(s.ax, s.bx)).toBeGreaterThanOrEqual(-1e-6);
            expect(Math.max(s.ax, s.bx)).toBeLessThanOrEqual(4 + 1e-6);
        }
    });

    it('NO DIMENSION MOVES with the tier (L-127): the boundaries are identical at medium and fine', () => {
        const fine = inject('fine');
        for (const off of BOUNDARIES) {
            expect(has(fine, { ax: 0, az: off, bx: 4, bz: off })).toBe(true);
        }
    });
});

describe('wall × plan — EVERY LINE DERIVES FROM THE RECORD', () => {
    it('thickening a layer MOVES the boundary by exactly that much', () => {
        const thicker = { ...WALL, layers: [layer(0.05, 'finish-exterior'), ...WALL.layers.slice(1)] };
        const segs = inject('medium', thicker);
        const total = 0.33;
        expect(has(segs, { ax: 0, az: -total / 2 + 0.05, bx: 4, bz: -total / 2 + 0.05 })).toBe(true);
    });

    it('a wall with NO insulation layer draws NO hatch — fine === medium', () => {
        const noIns = {
            ...WALL,
            layers: [layer(0.02, 'finish-exterior'), layer(0.26, 'structure'), layer(0.02, 'finish-interior')],
        };
        expect(inject('fine', noIns)).toHaveLength(inject('medium', noIns).length);
    });

    it('the hatch pitch is the BAND THICKNESS — halve the insulation, double the strokes', () => {
        const count = (t: number) => {
            const w = { ...WALL, layers: [layer(0.02, 'finish-exterior'), layer(t, 'insulation'), layer(0.16, 'structure'), layer(0.02, 'finish-interior')] };
            return inject('fine', w).length - inject('medium', w).length;
        };
        expect(count(0.05)).toBe(2 * count(0.10));
    });

    it('an opening that straddles the cut plane BREAKS the hatch, not just the boundary', () => {
        const withDoor = {
            ...WALL,
            openings: [{ offset: 1.0, width: 1.0, sillHeight: 0, height: 2.1 }],
        };
        const medium = inject('medium', withDoor);
        const hatch  = inject('fine', withDoor).filter(s => !has(medium, s));
        for (const s of hatch) {
            const lo = Math.min(s.ax, s.bx), hi = Math.max(s.ax, s.bx);
            expect(hi <= 1.0 + 1e-6 || lo >= 2.0 - 1e-6).toBe(true);   // never inside the void
        }
    });
});

describe('wall × plan — ONE resolver, the C09 precedence (ADR-121 §4.3)', () => {
    it('a per-ELEMENT graphic override BEATS the view’s own detail level', () => {
        viewIntentInstanceStore.assign(VIEW);
        viewIntentInstanceStore.updateOverrides(VIEW, {
            graphicOverrides: [{ targetKind: 'element', targetId: 'w1', patch: { detailLevel: 'coarse' } }],
        } as never);
        // The view says FINE; the element override says COARSE — coarse must win.
        expect(inject('fine')).toHaveLength(0);
    });
});
