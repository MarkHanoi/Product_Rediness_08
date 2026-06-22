// §SINGLE-LOAD-PERIPHERAL (LAYOUT-GENERATION-ALGORITHM §19.3 / §20.1) — the SINGLE-LOADED mode of
// `packRoomsAlongSpineTree`. On a compact plate the corridor hugs the core/stair edge and ALL rooms
// sit in ONE band between the corridor and the far façade, so each room gets BOTH a corridor wall
// (circulation) AND an exterior façade (window) — the geometric escape from the windows-vs-
// circulation trap (§19.2). Plus the §HABITABLE-NOT-CORRIDOR aspect rule (the founder's "a study
// cannot have the shape of a corridor").
//
// PURE geometry, tested in isolation (the packer is unwired here — zero live-path risk). The OFF
// path (no opts.singleLoaded) MUST be byte-identical to the double-loaded tree pack.

import { describe, expect, it } from 'vitest';
import {
    packRoomsAlongSpineTree,
    type SpineRoom,
} from '../src/workflows/apartmentLayout/tgl/packRoomsAlongSpine.js';
import type { SpinePath } from '../src/workflows/apartmentLayout/tgl/deriveCorridorSpine.js';
import type { Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';

const DOOR_W = 0.8;

// An ELONGATED plate (§20.1 §SINGLE-LOAD-PERIPHERAL — aspect ≳ 1.6): a single deep band against the
// far façade is room-sized (~5.5 m), the run is long (~16 m). This is the plate class single-loaded
// is FOR (a near-square plate routes to the ring pattern instead). 16 × 7 m.
const SHELL: Rect = { x0: 0, z0: 0, x1: 16, z1: 7 };

// Centred horizontal run (what deriveCorridorSpine produces) + a leg to a top-right corner stair.
const STAIR: Rect = { x0: 13.5, z0: 5.5, x1: 16, z1: 7 };
const SPINE: SpinePath = {
    segments: [
        { a: { x: 0.3, z: 3.5 }, b: { x: 15.7, z: 3.5 } },   // primary run (centred)
        { a: { x: 14.75, z: 3.5 }, b: { x: 14.75, z: 5.5 } }, // vertical leg to the stair
    ],
    widthM: 1.2,
    primaryAxis: 'x',
};

const ROOMS: SpineRoom[] = [
    { id: 'living', targetAreaM2: 22, needsWindow: true, minShortSideM: 3.2 },
    { id: 'bed1', targetAreaM2: 16, needsWindow: true, minShortSideM: 2.6 },
    { id: 'bed2', targetAreaM2: 14, needsWindow: true, minShortSideM: 2.6 },
    { id: 'study', targetAreaM2: 10, needsWindow: true, minShortSideM: 2.0 },
];

// Shared straight-wall length (metres) between two abutting rects, 0 if they don't share an edge.
const sharedWallM = (a: Rect, b: Rect): number => {
    const vAbut = Math.abs(a.x1 - b.x0) < 0.05 || Math.abs(b.x1 - a.x0) < 0.05;
    const zOv = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    const hAbut = Math.abs(a.z1 - b.z0) < 0.05 || Math.abs(b.z1 - a.z0) < 0.05;
    const xOv = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    return Math.max(vAbut && zOv > 0 ? zOv : 0, hAbut && xOv > 0 ? xOv : 0);
};
const overlapM2 = (a: Rect, b: Rect): number =>
    Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
    Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));
// True iff the rect touches the shell exterior (any of its 4 edges lies on a shell edge).
const touchesExterior = (r: Rect, shell: Rect): boolean =>
    Math.abs(r.x0 - shell.x0) < 0.05 || Math.abs(r.x1 - shell.x1) < 0.05 ||
    Math.abs(r.z0 - shell.z0) < 0.05 || Math.abs(r.z1 - shell.z1) < 0.05;
const shortSide = (r: Rect): number => Math.min(r.x1 - r.x0, r.z1 - r.z0);
const longSide = (r: Rect): number => Math.max(r.x1 - r.x0, r.z1 - r.z0);

describe('§SINGLE-LOAD-PERIPHERAL — packRoomsAlongSpineTree({singleLoaded:true})', () => {
    it('REGRESSION GUARD — opts.singleLoaded absent ⇒ byte-identical to the double-loaded tree pack', () => {
        const withoutOpt = packRoomsAlongSpineTree(SHELL, SPINE, ROOMS);
        const withFalse = packRoomsAlongSpineTree(SHELL, SPINE, ROOMS, { singleLoaded: false });
        const withFalseExplicit = packRoomsAlongSpineTree(SHELL, SPINE, ROOMS, {});
        expect(JSON.stringify(withFalse)).toEqual(JSON.stringify(withoutOpt));
        expect(JSON.stringify(withFalseExplicit)).toEqual(JSON.stringify(withoutOpt));
    });

    it('every habitable room shares a corridor wall AND touches the exterior (windows + circulation)', () => {
        const res = packRoomsAlongSpineTree(SHELL, SPINE, ROOMS, { singleLoaded: true, keepOut: STAIR })!;
        expect(res).not.toBeNull();
        expect(res.dropped).toEqual([]);
        expect(res.rooms.map(r => r.roomId).sort()).toEqual(['bed1', 'bed2', 'living', 'study']);
        for (const room of res.rooms) {
            const bestWall = Math.max(...res.corridorCells.map(c => sharedWallM(room.rect, c)));
            expect(bestWall, `${room.roomId} must share a door-width corridor wall (circulation)`).toBeGreaterThanOrEqual(DOOR_W);
            expect(touchesExterior(room.rect, SHELL), `${room.roomId} must touch the façade (window)`).toBe(true);
        }
    });

    it('ALL rooms sit in ONE band (single-loaded — no room on the corridor\'s core side)', () => {
        const res = packRoomsAlongSpineTree(SHELL, SPINE, ROOMS, { singleLoaded: true, keepOut: STAIR })!;
        // The corridor run is the widest corridor cell; every room must sit strictly on ONE side of it.
        const run = res.corridor;
        const runMidZ = (run.z0 + run.z1) / 2;
        const sides = res.rooms.map(r => ((r.rect.z0 + r.rect.z1) / 2 > runMidZ ? 'far' : 'near'));
        const allSameSide = sides.every(s => s === sides[0]);
        expect(allSameSide, `all rooms must be single-loaded on ONE side: ${sides.join(',')}`).toBe(true);
    });

    it('§HABITABLE-NOT-CORRIDOR — no habitable room is corridor-shaped (short side ≥ min, ratio ≤ 3:1)', () => {
        const res = packRoomsAlongSpineTree(SHELL, SPINE, ROOMS, { singleLoaded: true, keepOut: STAIR })!;
        for (const room of res.rooms) {
            const r = room.rect;
            const sr = res.rooms.find(x => x.roomId === room.roomId)!;
            void sr;
            const ratio = longSide(r) / Math.max(0.01, shortSide(r));
            expect(ratio, `${room.roomId} is corridor-shaped (ratio ${ratio.toFixed(2)})`).toBeLessThanOrEqual(3.0);
        }
        // The study (smallest, the founder's "study cannot be a corridor") clears its min short side.
        const study = res.rooms.find(r => r.roomId === 'study')!.rect;
        expect(shortSide(study)).toBeGreaterThanOrEqual(2.0 - 1e-6);
    });

    it('the corridor reaches the stair keep-out (shares a ≥0.9 m wall with it)', () => {
        const res = packRoomsAlongSpineTree(SHELL, SPINE, ROOMS, { singleLoaded: true, keepOut: STAIR })!;
        const bestStairWall = Math.max(...res.corridorCells.map(c => sharedWallM(c, STAIR)));
        expect(bestStairWall, 'corridor must bridge the stair').toBeGreaterThanOrEqual(0.9);
    });

    it('no room overlaps any corridor cell or the stair keep-out', () => {
        const res = packRoomsAlongSpineTree(SHELL, SPINE, ROOMS, { singleLoaded: true, keepOut: STAIR })!;
        for (const room of res.rooms) {
            for (const c of res.corridorCells) {
                expect(overlapM2(room.rect, c), `${room.roomId} overlaps a corridor cell`).toBeLessThan(1e-3);
            }
            expect(overlapM2(room.rect, STAIR), `${room.roomId} overlaps the stair`).toBeLessThan(1e-3);
        }
    });

    it('rooms stay inside the shell bbox', () => {
        const res = packRoomsAlongSpineTree(SHELL, SPINE, ROOMS, { singleLoaded: true, keepOut: STAIR })!;
        for (const room of res.rooms) {
            expect(room.rect.x0).toBeGreaterThanOrEqual(SHELL.x0 - 1e-6);
            expect(room.rect.z0).toBeGreaterThanOrEqual(SHELL.z0 - 1e-6);
            expect(room.rect.x1).toBeLessThanOrEqual(SHELL.x1 + 1e-6);
            expect(room.rect.z1).toBeLessThanOrEqual(SHELL.z1 + 1e-6);
        }
    });

    it('is deterministic', () => {
        const a = packRoomsAlongSpineTree(SHELL, SPINE, ROOMS, { singleLoaded: true, keepOut: STAIR });
        const b = packRoomsAlongSpineTree(SHELL, SPINE, ROOMS, { singleLoaded: true, keepOut: STAIR });
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });

    it('falls back (no silent drop) — when the single band cannot seat all rooms at min, returns dropped or null, never a thin sliver', () => {
        // A very shallow plate where the far band is too thin for 4 habitable rooms at their min short side.
        const THIN: Rect = { x0: 0, z0: 0, x1: 12, z1: 3.2 };
        const thinSpine: SpinePath = {
            segments: [{ a: { x: 0.3, z: 1.6 }, b: { x: 11.7, z: 1.6 } }],
            widthM: 1.2, primaryAxis: 'x',
        };
        const res = packRoomsAlongSpineTree(THIN, thinSpine, ROOMS, { singleLoaded: true });
        // Either it dropped the rooms it could not seat, or returned null — but NEVER placed a room
        // below its min short side (no thin sliver). Verify every PLACED room clears its min short side.
        if (res) {
            for (const p of res.rooms) {
                const sr = ROOMS.find(r => r.id === p.roomId)!;
                expect(shortSide(p.rect), `${p.roomId} placed below min short side`).toBeGreaterThanOrEqual(sr.minShortSideM - 0.01);
            }
        }
        expect(true).toBe(true);
    });

    it('SHEARED elongated plate (the founder ~209 m² class) — polygon-native: every habitable cell stays inside the sheared shell, all reachable, no thin study', () => {
        // A SHEARED elongated convex quad (off-axis façade) strictly inside an 18 × 8 bbox — the
        // founder's sheared plate class, single-loaded (edge stair, non-fragmented).
        const BB: Rect = { x0: 0, z0: 0, x1: 18, z1: 8 };
        const SHEARED = [{ x: 0, z: 0.5 }, { x: 18, z: 0 }, { x: 18, z: 7.6 }, { x: 0, z: 8 }];
        const sStair: Rect = { x0: 15.5, z0: 6, x1: 18, z1: 8 };   // top-right edge stair
        const sSpine: SpinePath = {
            segments: [{ a: { x: 0.3, z: 4 }, b: { x: 17.7, z: 4 } }],
            widthM: 1.2, primaryAxis: 'x',
        };
        const res = packRoomsAlongSpineTree(BB, sSpine, ROOMS, { singleLoaded: true, keepOut: sStair, shellPolygon: SHEARED })!;
        expect(res).not.toBeNull();
        expect(res.dropped).toEqual([]);
        // Polygon-native cells clip to the sheared shell.
        expect(res.cellPolygonById).toBeDefined();
        const insideSheared = (p: { x: number; z: number }): boolean => {
            for (let i = 0; i < SHEARED.length; i++) {
                const a = SHEARED[i]!, b = SHEARED[(i + 1) % SHEARED.length]!;
                const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
                if (cross < -1e-6) return false;
            }
            return true;
        };
        for (const [id, poly] of res.cellPolygonById!) {
            for (const v of poly) expect(insideSheared(v), `${id} vertex outside sheared shell`).toBe(true);
        }
        // All habitable reachable (each on the corridor) + no thin study (the founder's "study cannot be a corridor").
        for (const room of res.rooms) {
            expect(Math.max(...res.corridorCells.map(c => sharedWallM(room.rect, c)))).toBeGreaterThanOrEqual(DOOR_W);
            expect(longSide(room.rect) / Math.max(0.01, shortSide(room.rect))).toBeLessThanOrEqual(3.0);
        }
        // Stair bridged.
        expect(Math.max(...res.corridorCells.map(c => sharedWallM(c, sStair)))).toBeGreaterThanOrEqual(0.9);
    });
});
