// §SPINE-FIRST P2 — unit tests for packRoomsAlongSpine. Pins the two invariants that the spine-first
// rebuild exists to guarantee (and that the area-first packer violates ~half the time):
//   (I1) every placed room shares a door-width wall with the corridor (spine).
//   (I2) every window-needing room touches the shell exterior (a façade edge).

import { describe, expect, it } from 'vitest';
import { deriveCorridorSpine } from '../src/workflows/apartmentLayout/tgl/deriveCorridorSpine.js';
import { packRoomsAlongSpine, type SpineRoom } from '../src/workflows/apartmentLayout/tgl/packRoomsAlongSpine.js';
import type { Pt, Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';

const rectPoly = (w: number, d: number): Pt[] => [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
const bbox = (w: number, d: number): Rect => ({ x0: 0, z0: 0, x1: w, z1: d });

const DOOR = 0.8;
function sharedWallM(a: Rect, b: Rect): number {
    const eps = 0.05;
    if (Math.abs(a.x1 - b.x0) < eps || Math.abs(b.x1 - a.x0) < eps) {
        const ov = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0); if (ov > eps) return ov;
    }
    if (Math.abs(a.z1 - b.z0) < eps || Math.abs(b.z1 - a.z0) < eps) {
        const ov = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0); if (ov > eps) return ov;
    }
    return 0;
}
const overlaps = (a: Rect, b: Rect): boolean =>
    a.x0 < b.x1 - 0.01 && b.x0 < a.x1 - 0.01 && a.z0 < b.z1 - 0.01 && b.z0 < a.z1 - 0.01;
/** A rect touches the rectangular shell exterior iff any edge lies on the bbox boundary. */
function touchesFacade(r: Rect, shell: Rect): boolean {
    const eps = 0.05;
    return Math.abs(r.x0 - shell.x0) < eps || Math.abs(r.x1 - shell.x1) < eps ||
           Math.abs(r.z0 - shell.z0) < eps || Math.abs(r.z1 - shell.z1) < eps;
}

const room = (id: string, area: number, needsWindow: boolean, min = 2.4): SpineRoom =>
    ({ id, targetAreaM2: area, needsWindow, minShortSideM: min });

describe('§SPINE-FIRST P2 — packRoomsAlongSpine invariants', () => {
    // A 16×11 plate, 5 private-ish rooms — the double-loaded spine case.
    const W = 16, D = 11;
    const ROOMS: SpineRoom[] = [
        room('r1', 22, true), room('r2', 18, true), room('r3', 16, true),
        room('r4', 12, false), room('r5', 10, true),
    ];

    function pack() {
        const spine = deriveCorridorSpine(rectPoly(W, D))!;
        return { res: packRoomsAlongSpine(bbox(W, D), spine, ROOMS)!, spine };
    }

    it('I1 — every placed room shares a ≥0.8 m wall with the corridor', () => {
        const { res } = pack();
        const offCorridor = res.rooms.filter(p => sharedWallM(p.rect, res.corridor) < DOOR);
        expect(offCorridor.map(p => p.roomId)).toEqual([]);
    });

    it('I2 — every window-needing room touches the shell façade', () => {
        const { res } = pack();
        const shell = bbox(W, D);
        const needWin = new Set(ROOMS.filter(r => r.needsWindow).map(r => r.id));
        const buried = res.rooms.filter(p => needWin.has(p.roomId) && !touchesFacade(p.rect, shell));
        expect(buried.map(p => p.roomId)).toEqual([]);
    });

    it('no two placed rooms overlap, and none overlaps the corridor', () => {
        const { res } = pack();
        for (let i = 0; i < res.rooms.length; i++) {
            expect(overlaps(res.rooms[i]!.rect, res.corridor), `${res.rooms[i]!.roomId} ∩ corridor`).toBe(false);
            for (let j = i + 1; j < res.rooms.length; j++) {
                expect(overlaps(res.rooms[i]!.rect, res.rooms[j]!.rect),
                    `${res.rooms[i]!.roomId} ∩ ${res.rooms[j]!.roomId}`).toBe(false);
            }
        }
    });

    it('places all rooms when they fit; reports any that do not as dropped (never silently lost)', () => {
        const { res } = pack();
        const placedIds = new Set(res.rooms.map(p => p.roomId));
        for (const r of ROOMS) {
            expect(placedIds.has(r.id) || res.dropped.includes(r.id),
                `${r.id} is either placed or reported dropped`).toBe(true);
        }
        // This generous plate fits all five.
        expect(res.dropped).toEqual([]);
        expect(res.rooms).toHaveLength(ROOMS.length);
    });

    it('balances rooms across both sides of the spine (double-loaded, not all on one side)', () => {
        const { res } = pack();
        const sides = new Set(Object.values(res.side));
        expect(sides.has('A') && sides.has('B'), 'rooms use both bands').toBe(true);
    });

    it('tall plate (vertical spine) keeps the same invariants', () => {
        const spine = deriveCorridorSpine(rectPoly(10, 16))!;
        expect(spine.primaryAxis).toBe('z');
        const res = packRoomsAlongSpine(bbox(10, 16), spine, ROOMS)!;
        const shell = bbox(10, 16);
        for (const p of res.rooms) {
            expect(sharedWallM(p.rect, res.corridor)).toBeGreaterThanOrEqual(DOOR);
        }
        const needWin = new Set(ROOMS.filter(r => r.needsWindow).map(r => r.id));
        for (const p of res.rooms) if (needWin.has(p.roomId)) expect(touchesFacade(p.rect, shell)).toBe(true);
    });

    it('emits the stair LEG as a corridor cell that reaches the keep-out (the stair connects)', () => {
        // 18×12 plate, run horizontal at z=6. Stair top-right corner → a leg rises to it. The corridor
        // cells must include a leg rect that shares a door-width wall with the stair keep-out.
        const shell = rectPoly(18, 12);
        const stair: Rect = { x0: 15, z0: 9.5, x1: 18, z1: 12 };
        const spine = deriveCorridorSpine(shell, { stairKeepOut: stair })!;
        expect(spine.segments.length).toBe(2);
        const res = packRoomsAlongSpine(bbox(18, 12), spine, ROOMS)!;
        expect(res.corridorCells.length).toBe(2);            // run + leg
        const leg = res.corridorCells[1]!;
        // the leg cell abuts the stair's near (z0) edge with a door-width overlap.
        expect(sharedWallM(leg, stair)).toBeGreaterThanOrEqual(DOOR);
    });

    it('no-stair case: corridorCells is just the run', () => {
        const spine = deriveCorridorSpine(rectPoly(W, D))!;
        const res = packRoomsAlongSpine(bbox(W, D), spine, ROOMS)!;
        expect(res.corridorCells.length).toBe(1);
        expect(res.corridorCells[0]).toEqual(res.corridor);
    });

    it('is deterministic (two runs identical)', () => {
        const spine = deriveCorridorSpine(rectPoly(W, D))!;
        const a = packRoomsAlongSpine(bbox(W, D), spine, ROOMS);
        const b = packRoomsAlongSpine(bbox(W, D), spine, ROOMS);
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });
});
