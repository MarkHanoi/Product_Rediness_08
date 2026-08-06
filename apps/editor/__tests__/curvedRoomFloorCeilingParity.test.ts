// @vitest-environment happy-dom
//
// §FIX-CEILING-INNER-FACE-PARITY + §FIX-CURVED-ROOM-FINISH-BOUNDARY (2026-08-06)
//
// The founder's parity bug: a room enclosed by CURVED walls gets a SLAB that hugs the
// curve (the slab stores the traced tessellated ring verbatim), while the FLOOR finish
// and the CEILING fail to follow it. Two stacked defects:
//
//   1. The ONE inner-face derivation (`resolveRoomFinishBoundary`) matched walls by their
//      2-point `baseLine` — the CHORD of a curved wall — so the room ring's tessellated
//      arc edges inset erratically (fixed in @pryzm/room-topology, curve-aware matching).
//   2. The ceiling had NO boundary chokepoint at all: every ceiling path shipped the RAW
//      room ring (centreline overshoot), and a curve-following fix in the floor path
//      could never reach it. `CreateCeilingCommand` now mirrors `CreateFloorCommand`'s
//      `boundarySource` chokepoint (L-240) verbatim.
//
// This suite tests BOTH chokepoints against the same curved room and pins the parity:
// for one room, floor boundary === ceiling boundary, and both follow the curve at the
// walls' inner faces. Governing: C11 (one element type ⇒ one creation pipeline).

import { describe, it, expect } from 'vitest';
import { CreateFloorCommand, CreateCeilingCommand } from '@pryzm/command-registry';

// ── Fixture: 4 m × 3 m room whose RIGHT side is a Bézier arc (control (7,1.5), 16 segs) ──
const ROOM_ID = 'room-c1';
const LEVEL_ID = 'L0';
const S = { x: 4, z: 0 };
const E = { x: 4, z: 3 };
const CTRL = { x: 7, z: 1.5 };
const SEGS = 16;

function bez(t: number): { x: number; z: number } {
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t;
    return { x: a * S.x + b * CTRL.x + d * E.x, z: a * S.z + b * CTRL.z + d * E.z };
}

/** The room ring exactly as RoomDetectionEngine produces it (tessellated arc). */
const CENTRELINE: Array<{ x: number; z: number }> = (() => {
    const ring: Array<{ x: number; z: number }> = [{ x: 0, z: 0 }];
    for (let i = 0; i <= SEGS; i++) ring.push(bez(i / SEGS));
    ring.push({ x: 0, z: 3 });
    return ring;
})();

const WALLS: any[] = [
    { id: 'w1', baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }], thickness: 0.2 },
    // The curved wall — canonical schema shape: baseLine = chord + quadratic-Bézier curve.
    { id: 'w2', baseLine: [S, E], thickness: 0.2, curve: { control: { x: CTRL.x, y: 0, z: CTRL.z }, segments: SEGS } },
    { id: 'w3', baseLine: [{ x: 4, z: 3 }, { x: 0, z: 3 }], thickness: 0.2 },
    { id: 'w4', baseLine: [{ x: 0, z: 3 }, { x: 0, z: 0 }], thickness: 0.2 },
];

function makeContext() {
    const floors: any[] = [];
    const ceilings: any[] = [];
    const listLike = (arr: any[]) => ({
        add: (e: any) => { arr.push(e); },
        getAll: () => arr,
        getById: (id: string) => arr.find(e => e.id === id),
        remove: (id: string) => { const i = arr.findIndex(e => e.id === id); if (i >= 0) arr.splice(i, 1); },
    });
    return {
        ctx: {
            stores: {
                floorStore: listLike(floors),
                ceilingStore: listLike(ceilings),
                roomStore: {
                    getById: (id: string) => (id === ROOM_ID
                        ? { id: ROOM_ID, levelId: LEVEL_ID, boundary: { polygon: CENTRELINE }, boundingWallIds: ['w1', 'w2', 'w3', 'w4'] }
                        : undefined),
                },
                wallStore: {
                    getById: (id: string) => WALLS.find(w => w.id === id),
                    getByLevel: () => WALLS,
                },
            },
            projectContext: { activeLevelId: LEVEL_ID },
            bimManager: {
                getLevelById: (id: string) => (id === LEVEL_ID ? { id: LEVEL_ID, elevation: 0 } : undefined),
                registerElement: () => {},
                unregisterElement: () => {},
            },
        } as any,
        floors,
        ceilings,
    };
}

function createFloor(payload: Record<string, unknown> = {}): Array<{ x: number; z: number }> {
    const { ctx, floors } = makeContext();
    const r = new CreateFloorCommand({
        floorId: 'floor-1', ifcGuid: 'g1', levelId: LEVEL_ID,
        polygon: CENTRELINE.map(v => ({ ...v })), hostRoomId: ROOM_ID,
        boundarySource: 'room-centreline',
        ...payload,
    } as any).execute(ctx);
    expect(r.success).toBe(true);
    return floors[0].boundary.polygon;
}

function createCeiling(payload: Record<string, unknown> = {}): Array<{ x: number; z: number }> {
    const { ctx, ceilings } = makeContext();
    const r = new CreateCeilingCommand({
        ceilingId: 'ceiling-1', ifcGuid: 'g2', levelId: LEVEL_ID, height: 2.7,
        polygon: CENTRELINE.map(v => ({ ...v })), hostRoomId: ROOM_ID,
        boundarySource: 'room-centreline',
        ...payload,
    } as any).execute(ctx);
    expect(r.success).toBe(true);
    return ceilings[0].boundary.polygon;
}

/** Min distance from a point to the finely-sampled source arc centreline. */
function distToArc(p: { x: number; z: number }): number {
    let best = Infinity;
    for (let i = 0; i <= 512; i++) {
        const q = bez(i / 512);
        const d = Math.hypot(p.x - q.x, p.z - q.z);
        if (d < best) best = d;
    }
    return best;
}

function area(poly: ReadonlyArray<{ x: number; z: number }>): number {
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        s += a.x * b.z - b.x * a.z;
    }
    return Math.abs(s) / 2;
}

describe('curved room — floor + ceiling follow the curve at the inner face (founder parity bug)', () => {
    it('FLOOR: the stored boundary follows the arc, pulled to the inner face', () => {
        const poly = createFloor();
        const bulge = poly.filter(v => v.x > 4.05);
        // Curve preserved — not collapsed to a chord.
        expect(bulge.length).toBeGreaterThanOrEqual(SEGS - 3);
        for (const v of bulge) {
            const d = distToArc(v);
            expect(d).toBeGreaterThan(0.09);
            expect(d).toBeLessThan(0.11);
        }
        expect(area(poly)).toBeLessThan(area(CENTRELINE)); // never the centreline overshoot
    });

    it('CEILING: identical boundary to the FLOOR for the same room — parity by construction', () => {
        const floor = createFloor();
        const ceiling = createCeiling();
        expect(ceiling).toEqual(floor);
    });

    it('CEILING safety net: an UNDECLARED payload whose polygon IS the room ring is inset', () => {
        // The pre-fix defect shape for every ceiling path (3D AUTO, plan AUTO, batch):
        // hostRoomId + the raw ring, no declaration. Must not ship a centreline ceiling.
        const poly = createCeiling({ boundarySource: undefined });
        expect(area(poly)).toBeLessThan(area(CENTRELINE));
        for (const v of poly.filter(p => p.x > 4.05)) {
            expect(distToArc(v)).toBeGreaterThan(0.09);
        }
    });

    it('CEILING: a hand-drawn explicit polygon is stored VERBATIM (user intent, L-240 P3)', () => {
        const drawn = [{ x: 1, z: 1 }, { x: 3, z: 1 }, { x: 3, z: 2 }, { x: 1, z: 2 }];
        const poly = createCeiling({ polygon: drawn.map(v => ({ ...v })), boundarySource: 'explicit-polygon' });
        expect(poly).toHaveLength(4);
        expect(area(poly)).toBeCloseTo(2, 6);
    });

    it('CEILING: never inset twice — an already-inset boundary passes through verbatim', () => {
        const inner = createCeiling();                 // inner-face ring
        const replay = createCeiling({ polygon: inner.map(v => ({ ...v })), boundarySource: undefined });
        expect(area(replay)).toBeCloseTo(area(inner), 9);
    });

    it('CEILING fail-safe: no resolvable walls → centreline ring, a ceiling is always created', () => {
        const { ctx, ceilings } = makeContext();
        (ctx.stores.wallStore as any).getById = () => undefined;
        (ctx.stores.wallStore as any).getByLevel = () => [];
        const r = new CreateCeilingCommand({
            ceilingId: 'c-x', ifcGuid: 'g', levelId: LEVEL_ID, height: 2.7,
            polygon: CENTRELINE.map(v => ({ ...v })), hostRoomId: ROOM_ID,
            boundarySource: 'room-centreline',
        } as any).execute(ctx);
        expect(r.success).toBe(true);
        expect(area(ceilings[0].boundary.polygon)).toBeCloseTo(area(CENTRELINE), 6);
    });
});
