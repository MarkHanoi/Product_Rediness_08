// §CIRCULATION-CORRECTNESS — two founder-reported correctness bugs on the NOW-LIVE
// default path (§SPINE-TREE single-loaded corridor + §HOTEL-SUITES ensuite suites,
// both default-ON). TEST-FIRST.
//
// BUG 1 — EN-SUITE MUST CONNECT TO ITS HOST BEDROOM. The §HOTEL-SUITES carve must
//   GUARANTEE that every minted ensuite shares a ≥0.7 m wall with its `ensuiteHostId`
//   host — NEVER a free-standing banded room detached from its host. When a host band
//   is too shallow to seat bedroom+ensuite at the ideal minima the carve must keep the
//   ensuite WITH the host (split the host's combined footprint), not band it
//   separately. If genuinely impossible it is DROPPED (not placed at all), never
//   shipped detached.
//
// BUG 2 — THE ENTRANCE HALL MUST NOT DOOR ONLY TO A BATHROOM. On the GROUND floor a
//   wet room must NOT be served off the entrance hall; the hall's connection must be
//   to the CORRIDOR or a PUBLIC room (living/kitchen/dining). The §DIAG-WETROOM-PUBLIC
//   fallback must NOT place a bathroom↔hall door.

import { afterEach, describe, expect, it } from 'vitest';
import { buildBubbleGraph, type BubbleGraph, type ProgramRoom } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { subdivide, type RoomPlacement } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { subdivideViaSpine } from '../src/workflows/apartmentLayout/tgl/subdivideViaSpine.js';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { rectArea, type Pt, type Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram, RoomType } from '../src/workflows/apartmentLayout/types.js';

// ── Toggle helpers (mirror tglHotelSuites.test.ts) ───────────────────────────
const setHotelSuites = (on: boolean): void => {
    const g = globalThis as { window?: { __pryzmHotelSuites?: boolean } };
    g.window = { ...(g.window ?? {}), __pryzmHotelSuites: on };
};
const clearHotelSuites = (): void => {
    const g = globalThis as { window?: { __pryzmHotelSuites?: boolean } };
    if (g.window) delete g.window.__pryzmHotelSuites;
};
afterEach(() => clearHotelSuites());

// A house UPPER storey program (the §SUITE-WITHIN-PARENT target).
const UPPER_PROGRAM: ApartmentProgram = {
    bedrooms: 4, bathrooms: 2, masterEnSuite: true,
    openPlanKitchenDining: false, livingRoom: false, entranceHall: false,
    includeKitchen: false,
};

// ── Geometry helpers ─────────────────────────────────────────────────────────
/** Shared-wall RUN (m) between two rects: the abutting-edge overlap length, 0 if not touching. */
const sharedWallM = (a: Rect, b: Rect): number => {
    const touchX = Math.abs(a.x1 - b.x0) < 1e-3 || Math.abs(a.x0 - b.x1) < 1e-3;
    const touchZ = Math.abs(a.z1 - b.z0) < 1e-3 || Math.abs(a.z0 - b.z1) < 1e-3;
    const zOv = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    const xOv = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    let run = 0;
    if (touchX && zOv > 0) run = Math.max(run, zOv);
    if (touchZ && xOv > 0) run = Math.max(run, xOv);
    return run;
};

describe('§CIRCULATION-CORRECTNESS Bug 1 — en-suite always connects to its host bedroom', () => {
    // The founder's failure (on the NOW-LIVE §SPINE-TREE path): 4 ensuites minted but PLACED
    // as a SEPARATE ROW, detached from their host bedrooms. RULE: every minted+placed ensuite
    // shares a ≥0.7 m wall with its `ensuiteHostId` host; an ensuite is NEVER placed detached.
    const DETACH_MIN_WALL_M = 0.7;
    const rectOf = (r: Rect): Pt[] => [
        { x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 }, { x: r.x1, z: r.z1 }, { x: r.x0, z: r.z1 },
    ];

    // Assert no detached ensuite on the SPINE path (the live default), across single- AND
    // double-loaded tree modes. Returns the number of ensuites actually placed.
    const assertNoDetachedSpine = (shellRect: Rect): number => {
        const g = buildBubbleGraph(UPPER_PROGRAM, rectArea(shellRect));
        const shell = rectOf(shellRect);
        const ensuites = g.rooms.filter(r => r.type === 'ensuite');
        let totalPlaced = 0;
        for (const mode of [{ spineTree: true }, { spineTree: true, singleLoaded: true }]) {
            const res = subdivideViaSpine(shell, g, mode);
            if (!res) continue;
            const byId = new Map(res.rooms.map(p => [p.roomId, p.rect]));
            const droppedSet = new Set(res.dropped);
            for (const e of ensuites) {
                const er = byId.get(e.id);
                if (!er || droppedSet.has(e.id)) continue;     // dropped is acceptable; detached is NOT.
                totalPlaced += 1;
                const hostRect = byId.get(e.ensuiteHostId!);
                expect(hostRect, `[${JSON.stringify(mode)}] ensuite ${e.id} placed but host not placed`).toBeDefined();
                const run = sharedWallM(er, hostRect!);
                expect(
                    run,
                    `[${JSON.stringify(mode)}] ensuite ${e.id} DETACHED from host ${e.ensuiteHostId} (shared wall ${run.toFixed(2)}m)`,
                ).toBeGreaterThanOrEqual(DETACH_MIN_WALL_M);
            }
        }
        return totalPlaced;
    };

    it('on a COMPACT upper plate the SPINE path keeps every ensuite attached to its host', () => {
        setHotelSuites(true);
        const placed = assertNoDetachedSpine({ x0: 0, z0: 0, x1: 16, z1: 12 });   // 192 m²
        expect(placed).toBeGreaterThanOrEqual(1);
    });

    it('on a FRAGMENTED / shallow upper plate the SPINE path ships NO detached ensuite', () => {
        setHotelSuites(true);
        assertNoDetachedSpine({ x0: 0, z0: 0, x1: 19, z1: 8 });    // shallow + wide
        assertNoDetachedSpine({ x0: 0, z0: 0, x1: 9, z1: 16 });    // narrow + deep
        assertNoDetachedSpine({ x0: 0, z0: 0, x1: 13, z1: 9 });    // odd 5-suite shape
    });

    it('the LEGACY carve path also keeps every placed ensuite attached to its host', () => {
        setHotelSuites(true);
        for (const r of [
            { x0: 0, z0: 0, x1: 16, z1: 12 },
            { x0: 0, z0: 0, x1: 19, z1: 8 },
            { x0: 0, z0: 0, x1: 10, z1: 7 },
        ] as Rect[]) {
            const g = buildBubbleGraph(UPPER_PROGRAM, rectArea(r));
            const placements = subdivide([r], g);
            const byId = new Map(placements.map(p => [p.roomId, p.rect]));
            for (const e of g.rooms.filter(x => x.type === 'ensuite')) {
                const er = byId.get(e.id);
                if (!er) continue;
                const hostRect = byId.get(e.ensuiteHostId!);
                expect(hostRect, `ensuite ${e.id} placed but host missing`).toBeDefined();
                expect(sharedWallM(er, hostRect!)).toBeGreaterThanOrEqual(DETACH_MIN_WALL_M);
            }
        }
    });
});

// ── Bug 2 helpers ────────────────────────────────────────────────────────────
const room = (
    id: string, type: RoomType, rect: Rect,
): { program: ProgramRoom; placement: RoomPlacement } => ({
    program: { id, type, name: id, targetAreaM2: rectArea(rect), isPrivate: false, needsWindow: false },
    placement: { roomId: id, rect },
});

describe('§CIRCULATION-CORRECTNESS Bug 2 — the entrance hall must not door ONLY to a bathroom', () => {
    // The founder's failure: on the ground floor the entrance hall's only door is to the
    // bathroom. RULE: a wet room must NOT be served off the entrance hall; the hall must
    // door onto the corridor or a public room.
    //
    // Layout (ground floor): hall in the corner, bathroom + living both abut it. With the
    // §WETROOM-PUBLIC-DOOR fallback ON the OLD behaviour doored the sealed bathroom onto
    // the hall (priority hall ≫ living). The fix routes the bathroom to the LIVING room
    // (or corridor) and never to the hall.
    //
    //  z
    //  6 +--------+--------+
    //    |  hall  | living |
    //  3 +--------+--------+
    //    |  bath  | living |    (living spans z 0..6 on the right; bath bottom-left)
    //  0 +--------+--------+
    //    0        4        9
    const hall    = room('hall',    'hall',     { x0: 0, z0: 3, x1: 4, z1: 6 });
    const bath    = room('bath',    'bathroom', { x0: 0, z0: 0, x1: 4, z1: 3 });
    const living  = room('living',  'living',   { x0: 4, z0: 0, x1: 9, z1: 6 });

    const buildGround = (): { graph: BubbleGraph; placements: RoomPlacement[] } => {
        const rooms: ProgramRoom[] = [hall.program, bath.program, living.program];
        // hall ↔ living open threshold (the architectural entry transition); the bathroom
        // is SEALED in the bubble (its corridor accessFrom can't be satisfied — no corridor),
        // so the §WETROOM-PUBLIC-DOOR fallback is what places its door.
        const edges: BubbleGraph['edges'] = [{ a: 'hall', b: 'living', via: 'door' }];
        return {
            graph: { rooms, edges, corridorId: null, entryId: 'hall' },
            placements: [hall.placement, bath.placement, living.placement],
        };
    };

    it('the §WETROOM-PUBLIC fallback never doors a bathroom onto the entrance hall', () => {
        const { graph, placements } = buildGround();
        const { openings } = buildWallsAndDoors(placements, graph, {
            groundFloorWetRoomPublicFallback: true,
        });
        const doorBetween = (x: string, y: string): boolean =>
            openings.some(o => {
                if (o.type !== 'door') return false;
                const [a, b] = o.betweenRoomIds as readonly [string, string?];
                return (a === x && b === y) || (a === y && b === x);
            });
        // The bathroom must NOT door onto the hall …
        expect(doorBetween('bath', 'hall'), 'bathroom doored onto the entrance hall (founder-forbidden)').toBe(false);
        // … it should be routed to the living room instead (corridor absent here).
        expect(doorBetween('bath', 'living'), 'bathroom should be served off the living room, not the hall').toBe(true);
    });

    it('the hall keeps a door to a PUBLIC room (living), not solely to the bathroom', () => {
        const { graph, placements } = buildGround();
        const { openings } = buildWallsAndDoors(placements, graph, {
            groundFloorWetRoomPublicFallback: true,
        });
        const hallDoorTargets = openings
            .filter(o => o.type === 'door')
            .map(o => o.betweenRoomIds as readonly [string, string?])
            .filter(([a, b]) => a === 'hall' || b === 'hall')
            .map(([a, b]) => (a === 'hall' ? b : a));
        // The hall must reach a corridor-or-public room and NOT only a bathroom.
        expect(hallDoorTargets.length).toBeGreaterThan(0);
        expect(hallDoorTargets).toContain('living');
        expect(hallDoorTargets).not.toContain('bath');
    });
});
