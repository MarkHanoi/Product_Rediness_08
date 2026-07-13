/**
 * §FEAT-WINDOW-PLAN-SYMBOL-SOUND (L-254) — the window plan symbol per LOD.
 *
 * The mirror of `DoorPlanSymbolBuilder.detailLevel.test.ts` (L-241 P7), because
 * C15 governs doors and windows as ONE hosted-element family drawn to ONE standard.
 * The same three things must BOTH hold here:
 *
 *   1. DRAUGHTING CHANGES with the detail level — coarse (LOD 100), medium (LOD 200)
 *      and fine (LOD 300) emit different numbers of lines.
 *   2. DIMENSIONS DO NOT (L-127) — the same window at all three levels has identical
 *      jamb positions, frame face width, glazing thickness and glazing span.
 *   3. DIMENSIONS COME FROM THE RECORD / SYSTEM TYPE, never from a literal in the
 *      symbol: overriding `frameThickness` / `glazingThickness` on the record, or on
 *      the selected WindowSystemType, MOVES the drawn geometry by exactly that much.
 *
 * Plus the jamb invariant shared with the door (§FIX-PLAN-DOOR-JAMB-SEAM): the frame
 * jamb ticks land on the opening VOID EDGES, so the host wall's plan face lines — which
 * are clipped to exactly that span — close onto the frame with no seam.
 */

import { describe, it, expect } from 'vitest';
import { WindowPlanSymbolBuilder } from '../src/WindowPlanSymbolBuilder';
import { DEFAULT_WINDOW_DIMENSIONS } from '../src/WindowDimensions';
import { windowSystemTypeStore, type WindowSystemType } from '../src/WindowSystemTypeStore';

type Lod = 'coarse' | 'medium' | 'fine';
const LODS: Lod[] = ['coarse', 'medium', 'fine'];

// Wall along +X from (0,0) to (4,0), 200 mm thick → left-normal = +Z, so the symbol's
// (along, across) frame maps to (x, z) directly. Window: 1.2 m void at offset 1.0 m,
// no systemTypeId and no explicit frame/glazing fields → every dimension resolves
// through `resolveWindowDimensions()` to the canonical defaults (L-127).
const WALL = { id: 'wall1', baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }], thickness: 0.2, levelId: 'L0' };
const WIN  = { id: 'win1', wallId: 'wall1', width: 1.2, offset: 1.0, height: 1.2, sillHeight: 0.9 };

const HALF_THK   = WALL.thickness / 2;                             // 0.10
const HALF_W     = WIN.width / 2;                                  // 0.60
const CENTRE_X   = WIN.offset + HALF_W;                            // 1.60
const VOID_LEFT  = WIN.offset;                                     // 1.00
const VOID_RIGHT = WIN.offset + WIN.width;                         // 2.20

const FRAME_T  = DEFAULT_WINDOW_DIMENSIONS.frameThickness;         // 0.050
const GLAZ_T   = DEFAULT_WINDOW_DIMENSIONS.glazingThickness;       // 0.024
const REBATE   = DEFAULT_WINDOW_DIMENSIONS.rebateDepth;            // 0.015
const SILL_D   = DEFAULT_WINDOW_DIMENSIONS.sillDepth;              // 0.080
const SILL_O   = DEFAULT_WINDOW_DIMENSIONS.sillOverhang;           // 0.020

const CLEAR_HALF = HALF_W - FRAME_T;              // 0.550 — frame inner face
const GLAZ_HALF  = CLEAR_HALF + REBATE;           // 0.565 — glass is captured in the rebate
const HALF_GLAZ  = GLAZ_T / 2;                    // 0.012

interface Geos {
    cut:  { getAttribute(n: string): { array: ArrayLike<number> } } | null;
    proj: { getAttribute(n: string): { array: ArrayLike<number> } } | null;
}

function build(lod: Lod, win: object = WIN, wall: object = WALL): { cut: number[]; proj: number[] } {
    const builder = new WindowPlanSymbolBuilder();
    const geos = (builder as unknown as {
        _computeSymbolGeometry(w: unknown, wall: unknown, lod: Lod): Geos | null;
    })._computeSymbolGeometry(win, wall, lod);
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
    return verts(flat).some(v => Math.abs(v.x - x) < 1e-5 && Math.abs(v.z - z) < 1e-5);
}

describe('WindowPlanSymbolBuilder — detail levels emit different DRAUGHTING', () => {
    it('coarse < medium < fine in total line count', () => {
        const total = (g: { cut: number[]; proj: number[] }) => segCount(g.cut) + segCount(g.proj);
        expect(total(build('coarse'))).toBeLessThan(total(build('medium')));
        expect(total(build('medium'))).toBeLessThan(total(build('fine')));
    });

    it('every LOD draws the framed opening: 2 jamb ticks + 2 frame face lines', () => {
        for (const lod of LODS) expect(segCount(build(lod).cut)).toBeGreaterThanOrEqual(4);
        expect(segCount(build('coarse').cut)).toBe(4);
    });

    it('coarse draws ONE glazing line; medium and fine draw a TRUE DOUBLE line', () => {
        expect(segCount(build('coarse').proj)).toBe(1);
        // Coarse: a single centreline (n = 0).
        expect(hasVertex(build('coarse').proj, CENTRE_X - GLAZ_HALF, 0)).toBe(true);
        // Medium: two faces at ∓ glazingThickness / 2 — the real sealed-unit thickness.
        const m = build('medium').proj;
        expect(segCount(m)).toBe(2);
        for (const n of [-HALF_GLAZ, +HALF_GLAZ]) {
            expect(hasVertex(m, CENTRE_X - GLAZ_HALF, n)).toBe(true);
            expect(hasVertex(m, CENTRE_X + GLAZ_HALF, n)).toBe(true);
        }
    });

    it('medium closes the FRAME BLOCK with an inner reveal tick at each jamb', () => {
        const m = build('medium').cut;
        expect(segCount(m)).toBe(4 + 2);
        for (const n of [-HALF_THK, +HALF_THK]) {
            expect(hasVertex(m, CENTRE_X - CLEAR_HALF, n)).toBe(true);
            expect(hasVertex(m, CENTRE_X + CLEAR_HALF, n)).toBe(true);
        }
    });

    it('fine adds the jamb REBATE step (cut) and the SILL board (projection)', () => {
        const m = build('medium'), f = build('fine');
        // Rebate: the flat inner face is replaced by a 5-segment stepped profile per jamb.
        expect(segCount(f.cut)).toBe(4 + 2 * 5);
        expect(segCount(f.cut)).toBeGreaterThan(segCount(m.cut));
        // The pocket end — where the glass seats — sits `rebateDepth` back inside the frame.
        for (const sign of [-1, 1]) {
            for (const n of [-HALF_GLAZ, +HALF_GLAZ]) {
                expect(hasVertex(f.cut, CENTRE_X + sign * GLAZ_HALF, n)).toBe(true);
            }
        }
        // Sill: the board line + its two returns to the wall face — 3 thin segments.
        expect(segCount(f.proj)).toBe(segCount(m.proj) + 3);
        const boardEdge = HALF_THK + SILL_D;      // 0.18 — projects sillDepth past the wall face
        const boardEnd  = HALF_W + SILL_O;        // 0.62 — overhangs each jamb
        expect(hasVertex(f.proj, CENTRE_X - boardEnd, boardEdge)).toBe(true);
        expect(hasVertex(f.proj, CENTRE_X + boardEnd, boardEdge)).toBe(true);
        expect(hasVertex(f.proj, CENTRE_X + boardEnd, HALF_THK)).toBe(true);
    });

    it('no sill line is drawn when the window record says it has no sill', () => {
        const noSill = { ...WIN, sill: false };
        expect(segCount(build('fine', noSill).proj)).toBe(2);   // glazing only
    });
});

describe('WindowPlanSymbolBuilder — the JAMB INVARIANT (wall lines close on the frame)', () => {
    it('the frame jamb ticks sit on the opening VOID EDGES at every LOD', () => {
        for (const lod of LODS) {
            const { cut } = build(lod);
            for (const n of [-HALF_THK, +HALF_THK]) {
                expect(hasVertex(cut, VOID_LEFT,  n)).toBe(true);
                expect(hasVertex(cut, VOID_RIGHT, n)).toBe(true);
            }
        }
    });

    it('the two frame face lines span the void at both wall faces', () => {
        for (const lod of LODS) {
            const segs = build(lod).cut;
            const spansVoid = (n: number) => {
                for (let i = 0; i < segs.length; i += 6) {
                    const [ax, , az, bx, , bz] = segs.slice(i, i + 6);
                    if (Math.abs(az - n) < 1e-5 && Math.abs(bz - n) < 1e-5 &&
                        Math.abs(Math.min(ax, bx) - VOID_LEFT) < 1e-5 &&
                        Math.abs(Math.max(ax, bx) - VOID_RIGHT) < 1e-5) return true;
                }
                return false;
            };
            expect(spansVoid(-HALF_THK)).toBe(true);
            expect(spansVoid(+HALF_THK)).toBe(true);
        }
    });
});

describe('WindowPlanSymbolBuilder — L-127: dimensions come from the RECORD, not literals', () => {
    it('no symbol DIMENSION changes when only the LOD changes', () => {
        const key = (g: { cut: number[]; proj: number[] }) => ({
            voidLeft:   hasVertex(g.cut, VOID_LEFT,  HALF_THK),
            voidRight:  hasVertex(g.cut, VOID_RIGHT, HALF_THK),
            glazLeft:   verts(g.proj).some(v => Math.abs(v.x - (CENTRE_X - GLAZ_HALF)) < 1e-5),
            glazRight:  verts(g.proj).some(v => Math.abs(v.x - (CENTRE_X + GLAZ_HALF)) < 1e-5),
        });
        const c = key(build('coarse')), m = key(build('medium')), f = key(build('fine'));
        expect(c).toEqual(m);
        expect(m).toEqual(f);
        expect(f).toEqual({ glazLeft: true, glazRight: true, voidLeft: true, voidRight: true });
    });

    it('a record frameThickness override MOVES the frame inner face by exactly that much', () => {
        const fat = { ...WIN, frameThickness: 0.09 };
        const clearHalf = HALF_W - 0.09;                       // 0.51, not the 0.05 default
        const cut = build('medium', fat).cut;
        expect(hasVertex(cut, CENTRE_X - clearHalf, HALF_THK)).toBe(true);
        expect(hasVertex(cut, CENTRE_X + clearHalf, HALF_THK)).toBe(true);
        // …and the DEFAULT position is no longer drawn — proving it was never a literal.
        expect(hasVertex(cut, CENTRE_X - CLEAR_HALF, HALF_THK)).toBe(false);
    });

    it('a record glazingThickness override sets the double-line separation exactly', () => {
        const triple = { ...WIN, glazingThickness: 0.044 };
        const proj = build('medium', triple).proj;
        for (const n of [-0.022, +0.022]) {
            expect(verts(proj).some(v => Math.abs(v.z - n) < 1e-5)).toBe(true);
        }
        expect(verts(proj).some(v => Math.abs(Math.abs(v.z) - HALF_GLAZ) < 1e-5)).toBe(false);
    });

    it('when the record is silent the SYSTEM TYPE supplies the dimension', () => {
        const type: WindowSystemType = {
            id: 'wt-test-slim-steel',
            name: 'Test Slim Steel',
            category: 'steel',
            isBuiltIn: false,
            frameFinish: { name: 'Steel', materialColor: '#444444' },
            sillFinish:  { name: 'Steel', materialColor: '#3a3a3a' },
            glazingOpacity: 0.2,
            dimensions: { frameThickness: 0.02, glazingThickness: 0.006, rebateDepth: 0.004 },
            metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'test', version: 1 },
        };
        windowSystemTypeStore.add(type);

        const typed = { ...WIN, systemTypeId: type.id };
        const clearHalf = HALF_W - 0.02;                       // slim steel frame
        const cut = build('medium', typed).cut;
        expect(hasVertex(cut, CENTRE_X - clearHalf, HALF_THK)).toBe(true);
        // Glazing at the TYPE's 6 mm pane, not the 24 mm sealed-unit default.
        const proj = build('medium', typed).proj;
        expect(verts(proj).some(v => Math.abs(v.z - 0.003) < 1e-5)).toBe(true);
    });

    it('the rebate can never exceed the frame member that contains it', () => {
        // A 10 mm frame with an absurd 100 mm rebate: the pocket is clamped to the
        // frame face width, so the glazing can never overrun the void edge.
        const absurd = { ...WIN, frameThickness: 0.01, rebateDepth: 0.1 };
        const cut = build('fine', absurd).cut;
        const maxX = Math.max(...verts(cut).map(v => v.x));
        // 1e-5 tolerance: positions round-trip through a Float32BufferAttribute.
        expect(maxX).toBeLessThanOrEqual(VOID_RIGHT + 1e-5);
    });

    it('refuses to draw a symbol on a wall with no usable thickness (never guesses)', () => {
        const builder = new WindowPlanSymbolBuilder();
        const geos = (builder as unknown as {
            _computeSymbolGeometry(w: unknown, wall: unknown, lod: Lod): Geos | null;
        })._computeSymbolGeometry(WIN, { ...WALL, thickness: undefined }, 'fine');
        expect(geos).toBeNull();
    });
});
