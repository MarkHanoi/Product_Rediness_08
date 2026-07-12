/**
 * §FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL (L-241) P7 — door plan symbol per LOD.
 *
 * The two things that must BOTH be true:
 *
 *   1. DRAUGHTING CHANGES with the detail level — coarse (LOD 100), medium
 *      (LOD 200) and fine (LOD 300) emit different numbers of lines.
 *   2. DIMENSIONS DO NOT (the L-127 rule + the §FIX-PLAN-DOOR-JAMB-SEAM void-edge
 *      invariant). The SAME door at all three levels has the identical hinge
 *      point, leaf width, leaf thickness, frame thickness and jamb positions —
 *      the founder: "still absolutely accurate with regards to its element dims".
 */

import { describe, it, expect } from 'vitest';
import { DoorPlanSymbolBuilder } from '../src/DoorPlanSymbolBuilder';
import { DEFAULT_DOOR_DIMENSIONS } from '../src/DoorDimensions';

type Lod = 'coarse' | 'medium' | 'fine';

// Wall along +X from (0,0) to (4,0), 200 mm thick. Door: 900 mm void at offset
// 1.0 m, hinged left, swinging inward. No systemTypeId → canonical type defaults
// (frameThickness 50 mm, leafThickness 40 mm) — resolved through the SAME
// resolveDoorDimensions() the 3D builder and the tool preview use (L-127).
const WALL = { baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }], thickness: 0.2, levelId: 'L0' };
const DOOR = {
    id: 'd1', wallId: 'w1', width: 0.9, offset: 1.0,
    doorType: 'single' as const, hingesSide: 'left', swingDirection: 'inward',
};

const FRAME_T = DEFAULT_DOOR_DIMENSIONS.frameThickness;   // 0.05
const LEAF_T  = DEFAULT_DOOR_DIMENSIONS.leafThickness;    // 0.04

const HALF_WIDTH  = DOOR.width / 2;                       // 0.45
const CENTRE_X    = DOOR.offset + HALF_WIDTH;             // 1.45
const VOID_LEFT   = DOOR.offset;                          // 1.00  (= centre − halfWidth)
const VOID_RIGHT  = DOOR.offset + DOOR.width;             // 1.90  (= centre + halfWidth)
const HINGE_X     = CENTRE_X - (HALF_WIDTH - FRAME_T);    // 1.05  (inner frame corner)
const LEAF_LENGTH = DOOR.width - 2 * FRAME_T;             // 0.80  (clear leaf width)

interface Geos { cut: { getAttribute(n: string): { array: ArrayLike<number> } } | null;
                 proj: { getAttribute(n: string): { array: ArrayLike<number> } } | null; }

function build(lod: Lod): { cut: number[]; proj: number[] } {
    const builder = new DoorPlanSymbolBuilder();
    const geos = (builder as unknown as {
        _computeSwingGeometry(d: unknown, w: unknown, lod: Lod): Geos | null;
    })._computeSwingGeometry(DOOR, WALL, lod);
    expect(geos).not.toBeNull();
    return {
        cut:  Array.from(geos!.cut?.getAttribute('position').array ?? []),
        proj: Array.from(geos!.proj?.getAttribute('position').array ?? []),
    };
}

/** Flat [x,y,z,…] → [{x,z}] vertices. */
function verts(flat: number[]): Array<{ x: number; z: number }> {
    const out: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < flat.length; i += 3) out.push({ x: flat[i], z: flat[i + 2] });
    return out;
}

function segCount(flat: number[]): number { return flat.length / 6; }

function hasVertex(flat: number[], x: number, z: number): boolean {
    return verts(flat).some(v => Math.abs(v.x - x) < 1e-6 && Math.abs(v.z - z) < 1e-6);
}

const LODS: Lod[] = ['coarse', 'medium', 'fine'];

describe('DoorPlanSymbolBuilder — detail levels emit different DRAUGHTING', () => {
    it('coarse < medium < fine in total line count', () => {
        const c = build('coarse'), m = build('medium'), f = build('fine');
        const total = (g: { cut: number[]; proj: number[] }) => segCount(g.cut) + segCount(g.proj);
        expect(total(c)).toBeLessThan(total(m));
        expect(total(m)).toBeLessThan(total(f));
    });

    it('coarse draws the leaf as ONE line; medium/fine as a true double-line rectangle', () => {
        // Frame (2 jamb ticks + 2 frame face lines) = 4 cut segments at every LOD.
        expect(segCount(build('coarse').cut)).toBe(4 + 1);   // + single leaf line
        expect(segCount(build('medium').cut)).toBe(4 + 4);   // + 4-edge leaf rectangle
    });

    it('fine adds the frame reveal + rebate (cut) and the threshold + lever (projection)', () => {
        const m = build('medium'), f = build('fine');
        expect(segCount(f.cut)).toBeGreaterThan(segCount(m.cut));    // reveal ticks + rebate
        expect(segCount(f.proj)).toBe(segCount(m.proj) + 2 + 1);     // 2 lever + 1 threshold
    });

    it('every LOD draws the swing arc (32 segments)', () => {
        for (const lod of LODS) expect(segCount(build(lod).proj)).toBeGreaterThanOrEqual(32);
    });
});

describe('DoorPlanSymbolBuilder — L-127 dimensional invariant holds at EVERY LOD', () => {
    it('the frame jamb ticks sit on the opening VOID EDGES at every LOD', () => {
        // §FIX-PLAN-DOOR-JAMB-SEAM: the ticks must coincide with where the host
        // wall's plan face lines terminate, else the doorway reads as an open gap.
        for (const lod of LODS) {
            const { cut } = build(lod);
            for (const n of [-0.1, +0.1]) {           // ± half the 200 mm wall thickness
                expect(hasVertex(cut, VOID_LEFT,  n)).toBe(true);
                expect(hasVertex(cut, VOID_RIGHT, n)).toBe(true);
            }
        }
    });

    it('the hinge sits at the inner frame corner at every LOD', () => {
        for (const lod of LODS) {
            expect(hasVertex(build(lod).cut, HINGE_X, 0)).toBe(true);
        }
    });

    it('the leaf width (= arc radius) is the CLEAR opening at every LOD', () => {
        for (const lod of LODS) {
            const { cut, proj } = build(lod);
            // Leaf tip: hinge + swingDir × leafLength (the leaf is drawn OPEN).
            expect(hasVertex(cut, HINGE_X, LEAF_LENGTH)).toBe(true);
            // Arc: the first 32 segments are the quarter-circle; every vertex is
            // exactly leafLength from the hinge.
            for (const v of verts(proj.slice(0, 32 * 6))) {
                const r = Math.hypot(v.x - HINGE_X, v.z - 0);
                expect(r).toBeCloseTo(LEAF_LENGTH, 6);
            }
        }
    });

    it('the leaf thickness is the REAL type thickness at medium and fine', () => {
        for (const lod of ['medium', 'fine'] as Lod[]) {
            const { cut } = build(lod);
            // Opposite leaf face is offset from the hinge face by exactly leafThickness
            // (along the wall, +x for a left-hung leaf).
            expect(hasVertex(cut, HINGE_X + LEAF_T, 0)).toBe(true);
            expect(hasVertex(cut, HINGE_X + LEAF_T, LEAF_LENGTH)).toBe(true);
        }
    });

    it('no symbol dimension changes when only the LOD changes', () => {
        const key = (g: { cut: number[] }) => ({
            hinge:      hasVertex(g.cut, HINGE_X, 0),
            leafTip:    hasVertex(g.cut, HINGE_X, LEAF_LENGTH),
            voidLeft:   hasVertex(g.cut, VOID_LEFT, 0.1),
            voidRight:  hasVertex(g.cut, VOID_RIGHT, 0.1),
        });
        const c = key(build('coarse')), m = key(build('medium')), f = key(build('fine'));
        expect(c).toEqual(m);
        expect(m).toEqual(f);
        expect(f).toEqual({ hinge: true, leafTip: true, voidLeft: true, voidRight: true });
    });

    it('the frame thickness is the type value — the hinge is inset by exactly frameThickness', () => {
        expect(CENTRE_X - HINGE_X).toBeCloseTo(HALF_WIDTH - FRAME_T, 9);
        expect(hasVertex(build('medium').cut, HINGE_X, 0)).toBe(true);
    });
});

describe('DoorPlanSymbolBuilder — double doors', () => {
    it('emits two leaves at every LOD, each with its own arc', () => {
        const builder = new DoorPlanSymbolBuilder();
        const dbl = { ...DOOR, doorType: 'double' as const, width: 1.8 };
        for (const lod of LODS) {
            const geos = (builder as unknown as {
                _computeSwingGeometry(d: unknown, w: unknown, lod: Lod): Geos | null;
            })._computeSwingGeometry(dbl, WALL, lod)!;
            const proj = Array.from(geos.proj!.getAttribute('position').array);
            expect(segCount(proj)).toBeGreaterThanOrEqual(64);   // two 32-segment arcs
        }
    });
});
