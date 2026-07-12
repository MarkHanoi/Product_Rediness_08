// @vitest-environment happy-dom
//
// §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS (L-240) — N-WAY convergence of EVERY floor-finish
// creation path on the inner-face boundary.
//
// L-213 converged TWO paths (plan tool + batch) on `deriveRoomFinishBoundary` and shipped a
// test titled "UI↔batch convergence". It stayed green for a month while the THIRD path (the 3D
// FloorTool AUTO_FROM_ROOM branch) sent the RAW room boundary ring — which runs along the wall
// CENTRELINES — so its finish overshot into every bounding wall by half its thickness. That is
// the founder's L-240 bug, and the two-way test could never have caught it: it never enumerated
// the third path.
//
// The fix moves the derivation OFF the tools and INTO the `CreateFloorCommand` chokepoint,
// keyed off the payload's declared `boundarySource`. This suite therefore tests the CHOKEPOINT,
// not the helper — so any future tool is covered by construction:
//
//   1. 3D AUTO_FROM_ROOM  (boundarySource 'room-centreline')  → inner face
//   2. BATCH  CreateFloorsByRoomTypeCommand ('room-centreline') → inner face, identical to (1)
//   3. PLAN tool (derives in the tool, dispatches the bus)      → inner face, identical to (1)
//   4. 3D DRAW (boundarySource 'explicit-polygon')             → VERBATIM (user intent, P3)
//   5. UNDECLARED payload whose polygon IS the room centreline → inferred + inset (the safety
//      net that makes omission impossible for a future tool)
//   6. UNDECLARED payload with an already-inset polygon         → VERBATIM (never inset twice)
//
// Governing: C11 (one element type ⇒ one creation pipeline; §Floor-finish boundary).

import { describe, it, expect } from 'vitest';
import { CreateFloorCommand } from '@pryzm/command-registry';
import { resolveRoomFinishBoundary, deriveRoomFinishBoundary, ringsCoincide } from '@pryzm/room-topology';

// ── Fixture: a 4 m × 3 m room bounded by four 0.20 m walls → 0.10 m inner-face inset. ──
const ROOM_ID = 'room-1';
const LEVEL_ID = 'L0';

/** The room boundary ring, on the wall CENTRELINES (what room detection produces). */
const CENTRELINE = [
    { x: 0, z: 0 },
    { x: 4, z: 0 },
    { x: 4, z: 3 },
    { x: 0, z: 3 },
];

const WALLS: any[] = [
    { id: 'w1', baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }], thickness: 0.2 },
    { id: 'w2', baseLine: [{ x: 4, z: 0 }, { x: 4, z: 3 }], thickness: 0.2 },
    { id: 'w3', baseLine: [{ x: 4, z: 3 }, { x: 0, z: 3 }], thickness: 0.2 },
    { id: 'w4', baseLine: [{ x: 0, z: 3 }, { x: 0, z: 0 }], thickness: 0.2 },
];

function makeContext() {
    const floors: any[] = [];
    return {
        ctx: {
            stores: {
                floorStore: {
                    add: (f: any) => { floors.push(f); },
                    getAll: () => floors,
                    getById: (id: string) => floors.find(f => f.id === id),
                    remove: (id: string) => { const i = floors.findIndex(f => f.id === id); if (i >= 0) floors.splice(i, 1); },
                },
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
    };
}

/** Create a floor through the REAL chokepoint and return its stored boundary polygon. */
function createFloorVia(payload: Record<string, unknown>): Array<{ x: number; z: number }> {
    const { ctx, floors } = makeContext();
    const cmd = new CreateFloorCommand({
        floorId: 'floor-1',
        ifcGuid: 'guid-1',
        levelId: LEVEL_ID,
        ...payload,
    } as any);
    const v = cmd.canExecute(ctx);
    expect(v.ok).toBe(true);
    const r = cmd.execute(ctx);
    expect(r.success).toBe(true);
    return floors[0].boundary.polygon;
}

/** Shoelace area (m²). */
function area(poly: ReadonlyArray<{ x: number; z: number }>): number {
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        s += a.x * b.z - b.x * a.z;
    }
    return Math.abs(s) / 2;
}

const CENTRELINE_AREA = 4 * 3;        // 12.00 m² — the wall-centreline overshoot
const INNER_FACE_AREA = 3.8 * 2.8;    // 10.64 m² — the correct finish area

describe('§FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS (L-240) — the floor.create chokepoint', () => {
    it('PATH 1 — 3D FloorTool AUTO_FROM_ROOM: the raw room ring is inset to the inner faces', () => {
        // This is the founder's bug. Before L-240 the tool shipped CENTRELINE verbatim.
        const poly = createFloorVia({
            polygon: CENTRELINE.map(v => ({ ...v })),
            hostRoomId: ROOM_ID,
            boundarySource: 'room-centreline',
        });
        expect(area(poly)).toBeCloseTo(INNER_FACE_AREA, 6);
        expect(area(poly)).toBeLessThan(CENTRELINE_AREA);
        // Every vertex pulled 0.10 m inward — the finish stops at the inner wall face.
        expect(Math.min(...poly.map(p => p.x))).toBeCloseTo(0.1, 6);
        expect(Math.max(...poly.map(p => p.x))).toBeCloseTo(3.9, 6);
        expect(Math.min(...poly.map(p => p.z))).toBeCloseTo(0.1, 6);
        expect(Math.max(...poly.map(p => p.z))).toBeCloseTo(2.9, 6);
    });

    it('PATH 2 — BATCH (CreateFloorsByRoomTypeCommand payload) is IDENTICAL to 3D AUTO', () => {
        // The batch generator now hands the chokepoint the same centreline + declaration.
        // The founder confirms the batch result is the CORRECT one — it must not move.
        const auto = createFloorVia({
            polygon: CENTRELINE.map(v => ({ ...v })), hostRoomId: ROOM_ID, boundarySource: 'room-centreline',
        });
        const batch = createFloorVia({
            polygon: CENTRELINE.map(v => ({ ...v })), hostRoomId: ROOM_ID, boundarySource: 'room-centreline',
            label: 'Kitchen Floor', systemTypeId: 'floor-tile',
        });
        expect(batch).toEqual(auto);
        expect(area(batch)).toBeCloseTo(area(auto), 12);
    });

    it('PATH 3 — PLAN tool (derives in-tool, dispatches the bus) is IDENTICAL to 3D AUTO', () => {
        // FloorPlanToolHandler must derive in the tool: its bus handler (an L7 plugin handler)
        // sees only the `floor` store, so it cannot reach rooms/walls. It calls the SAME
        // canonical resolver, so its boundary must match the chokepoint's byte-for-byte.
        const planPoly = resolveRoomFinishBoundary(CENTRELINE.map(v => ({ ...v })), {
            roomId: ROOM_ID,
            levelId: LEVEL_ID,
            lookup: {
                getRoomById: () => ({ boundingWallIds: ['w1', 'w2', 'w3', 'w4'] }),
                getWallById: (id) => WALLS.find(w => w.id === id),
                getWallsByLevel: () => WALLS,
            },
        });
        const auto = createFloorVia({
            polygon: CENTRELINE.map(v => ({ ...v })), hostRoomId: ROOM_ID, boundarySource: 'room-centreline',
        });
        expect(planPoly).toEqual(auto);
        expect(area(planPoly)).toBeCloseTo(INNER_FACE_AREA, 6);
    });

    it('PATH 4 — 3D DRAW: a hand-drawn polygon is the USER\'S intent and is stored VERBATIM', () => {
        // Hosting a drawn floor in a room (FloorTool\'s centroid autodetect) is a LINK,
        // not a licence to re-derive the geometry the user actually drew. (L-240 P3)
        const drawn = [{ x: 1, z: 1 }, { x: 3, z: 1 }, { x: 3, z: 2 }, { x: 1, z: 2 }];
        const poly = createFloorVia({
            polygon: drawn.map(v => ({ ...v })),
            hostRoomId: ROOM_ID,               // hosted — but NOT room-derived
            boundarySource: 'explicit-polygon',
        });
        expect(area(poly)).toBeCloseTo(2 * 1, 6);
        expect(poly).toHaveLength(4);
        expect(Math.min(...poly.map(p => p.x))).toBeCloseTo(1, 6);
        expect(Math.max(...poly.map(p => p.x))).toBeCloseTo(3, 6);
    });

    it('PATH 5 — SAFETY NET: an UNDECLARED payload whose polygon IS the room ring is still inset', () => {
        // This is the L-240 defect shape itself: a tool passes hostRoomId + the raw room ring
        // and says nothing. It MUST NOT be able to ship a centreline floor. This is what makes
        // the rule impossible for a future tool to bypass by omission.
        const poly = createFloorVia({
            polygon: CENTRELINE.map(v => ({ ...v })),
            hostRoomId: ROOM_ID,
            // boundarySource deliberately omitted
        });
        expect(area(poly)).toBeCloseTo(INNER_FACE_AREA, 6);
    });

    it('PATH 6 — NEVER inset twice: an already-inner-face polygon passes through VERBATIM', () => {
        // Project load / IFC import / paste replay a STORED (already inset) boundary with a
        // hostRoomId and no declaration. "Converge, don\'t compensate": a second offset here
        // would shrink every floor on every reopen.
        const inner = deriveRoomFinishBoundary(CENTRELINE.map(v => ({ ...v })), WALLS);
        expect(ringsCoincide(inner, CENTRELINE)).toBe(false);   // it is NOT the centreline…
        const poly = createFloorVia({
            polygon: inner.map(v => ({ ...v })),
            hostRoomId: ROOM_ID,
        });
        expect(area(poly)).toBeCloseTo(INNER_FACE_AREA, 6);     // …so it is stored unchanged.
        // Idempotence: re-creating from the stored polygon N times never shrinks it.
        const again = createFloorVia({ polygon: poly.map(v => ({ ...v })), hostRoomId: ROOM_ID });
        expect(area(again)).toBeCloseTo(INNER_FACE_AREA, 6);
    });

    it('ROOM-INDEPENDENT finishes (roof deck, lobby disc, IFC slab) are untouched — no hostRoomId', () => {
        const deck = [{ x: 10, z: 10 }, { x: 20, z: 10 }, { x: 20, z: 20 }, { x: 10, z: 20 }];
        const poly = createFloorVia({ polygon: deck.map(v => ({ ...v })) });
        expect(area(poly)).toBeCloseTo(100, 6);
    });

    it('FAIL-SAFE — a room with no resolvable walls still produces a floor (centreline)', () => {
        const { ctx, floors } = makeContext();
        (ctx.stores.wallStore as any).getById = () => undefined;
        (ctx.stores.wallStore as any).getByLevel = () => [];
        const cmd = new CreateFloorCommand({
            floorId: 'floor-x', ifcGuid: 'g', levelId: LEVEL_ID,
            polygon: CENTRELINE.map(v => ({ ...v })),
            hostRoomId: ROOM_ID, boundarySource: 'room-centreline',
        } as any);
        expect(cmd.execute(ctx).success).toBe(true);
        expect(area(floors[0].boundary.polygon)).toBeCloseTo(CENTRELINE_AREA, 6);
    });

    it('AREAS / SCHEDULES / TAKE-OFF inherit the corrected boundary (P5)', () => {
        // Downstream consumers (room schedule, material take-off, IFC export) all read
        // FloorData.boundary.polygon. Proving the STORED boundary is the inner face proves
        // they inherit it — there is no second geometry anywhere.
        const { ctx, floors } = makeContext();
        new CreateFloorCommand({
            floorId: 'floor-s', ifcGuid: 'g', levelId: LEVEL_ID,
            polygon: CENTRELINE.map(v => ({ ...v })),
            hostRoomId: ROOM_ID, boundarySource: 'room-centreline',
        } as any).execute(ctx);
        const f = floors[0];
        expect(area(f.boundary.polygon)).toBeCloseTo(INNER_FACE_AREA, 6);
        expect(f.hostRoomId).toBe(ROOM_ID);
        expect(f.coveredRoomIds).toEqual([ROOM_ID]);            // schedule join floor→room
        expect(f.ifcData.ifcClass).toBe('IfcCovering');          // IFC export reads the same ring
    });
});
