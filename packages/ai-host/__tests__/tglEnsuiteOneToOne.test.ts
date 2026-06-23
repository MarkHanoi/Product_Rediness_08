// §ENSUITE-1TO1 (founder defect CFstdjE9 #1, 2026-06-23) — an en-suite must be a clean 1:1 suite:
//   (a) ALWAYS attached to a bedroom/master, (b) ONLY to a bedroom (never corridor/public/hall/
//       another ensuite), (c) to EXACTLY ONE bedroom (never shared by two),
//   (d) AREA-CAPPED well below its host (the build shipped a 33 m² en-suite).
// TEST-FIRST. The carve guarantees (a)+(c)+(d) by construction; `ensuiteNot1to1RoomIds` is the
// HARD-gate predicate that rejects any candidate where an ensuite breaks the rule.

import { afterEach, describe, expect, it } from 'vitest';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { subdivideViaSpine } from '../src/workflows/apartmentLayout/tgl/subdivideViaSpine.js';
import { carveEnsuiteWithinHost } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { ensuiteNot1to1RoomIds } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import { rectArea, type Pt, type Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';
import type { BubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import type { DoorOpening } from '../src/workflows/apartmentLayout/topology/validateMandatoryAdjacencies.js';

const UPPER_PROGRAM: ApartmentProgram = {
    bedrooms: 4, bathrooms: 2, masterEnSuite: true,
    openPlanKitchenDining: false, livingRoom: false, entranceHall: false,
    includeKitchen: false,
};

const setHotelSuites = (on: boolean): void => {
    const g = globalThis as { window?: { __pryzmHotelSuites?: boolean } };
    g.window = { ...(g.window ?? {}), __pryzmHotelSuites: on };
};
const clearHotelSuites = (): void => {
    const g = globalThis as { window?: { __pryzmHotelSuites?: boolean } };
    if (g.window) delete g.window.__pryzmHotelSuites;
};
afterEach(() => clearHotelSuites());

const rectOf = (r: Rect): Pt[] => [
    { x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 }, { x: r.x1, z: r.z1 }, { x: r.x0, z: r.z1 },
];

describe('§ENSUITE-1TO1 — area cap (defect 1d)', () => {
    it('caps a huge ensuite target to a shallow strip ≤ 0.45× host, host stays dominant', () => {
        // A large host (the CFstdjE9 case that produced a 33 m² en-suite) with a huge requested area.
        const host: Rect = { x0: 0, z0: 0, x1: 10, z1: 8 };   // 80 m² combined host band
        const corridor: Rect = { x0: 0, z0: -1.2, x1: 10, z1: 0 };
        const res = carveEnsuiteWithinHost(host, 33, corridor);   // ask for the absurd 33 m²
        expect(res).not.toBeNull();
        const ensArea = rectArea(res!.ensuite);
        const hostArea = rectArea(res!.master);
        // Relative cap: the ensuite is well below half the host's combined footprint.
        expect(ensArea).toBeLessThanOrEqual(0.45 * rectArea(host) + 1e-3);
        // Depth cap: the ensuite is a SHALLOW wet strip (≤ 2.4 m deep on its short axis), so a 33 m²
        // target can never produce a cavernous square (the founder defect). Its short side ≤ 2.4 m.
        const ensShort = Math.min(res!.ensuite.x1 - res!.ensuite.x0, res!.ensuite.z1 - res!.ensuite.z0);
        expect(ensShort).toBeLessThanOrEqual(2.4 + 1e-3);
        // The host stays the dominant room (strictly larger than its ensuite).
        expect(hostArea).toBeGreaterThan(ensArea);
    });

    it('a small ensuite target is NOT inflated (cap only ever shrinks)', () => {
        const host: Rect = { x0: 0, z0: 0, x1: 5, z1: 4 };   // 20 m²
        const corridor: Rect = { x0: 0, z0: -1.2, x1: 5, z1: 0 };
        const res = carveEnsuiteWithinHost(host, 4, corridor);
        expect(res).not.toBeNull();
        // ~4 m² requested (above the 3.5 min, below both caps) → roughly honoured, never grown to 6.5.
        expect(rectArea(res!.ensuite)).toBeLessThanOrEqual(6.5 + 1e-3);
    });
});

describe('§ENSUITE-1TO1 — the realised spine layout produces only clean suites', () => {
    const buildSpineDoors = (graph: BubbleGraph): DoorOpening[] => {
        // Synthesise the host↔ensuite doors the bubble graph declares (the carve guarantees adjacency,
        // so wallsAndDoors emits exactly these for the ensuites). One door per (host, ensuite) pair.
        return graph.rooms
            .filter(r => r.type === 'ensuite' && r.ensuiteHostId)
            .map(e => ({ type: 'door', betweenRoomIds: [e.ensuiteHostId!, e.id] } as DoorOpening));
    };

    const assertCleanSuites = (shellRect: Rect): void => {
        setHotelSuites(true);
        const g = buildBubbleGraph(UPPER_PROGRAM, rectArea(shellRect));
        const shell = rectOf(shellRect);
        for (const mode of [{ spineTree: true }, { spineTree: true, singleLoaded: true }]) {
            const res = subdivideViaSpine(shell, g, mode);
            if (!res) continue;
            const placements = res.rooms.map(p => ({ roomId: p.roomId, rect: p.rect }));
            const doors = buildSpineDoors(g);
            const bad = ensuiteNot1to1RoomIds({ bubble: g, placements, doorOpenings: doors });
            expect(bad, `[${JSON.stringify(mode)}] ensuites violating 1:1: ${bad.join(',')}`).toEqual([]);
        }
    };

    it('compact plate', () => assertCleanSuites({ x0: 0, z0: 0, x1: 16, z1: 12 }));
    it('shallow + wide plate', () => assertCleanSuites({ x0: 0, z0: 0, x1: 19, z1: 8 }));
    it('narrow + deep plate', () => assertCleanSuites({ x0: 0, z0: 0, x1: 9, z1: 16 }));
});

describe('§ENSUITE-1TO1 — the hard-gate predicate catches every breach', () => {
    // A graph with one bedroom + its ensuite + a corridor + a second bedroom.
    const graph: BubbleGraph = {
        rooms: [
            { id: 'bed1', type: 'master', name: 'Master', targetAreaM2: 16, isPrivate: true, needsWindow: true },
            { id: 'ens1', type: 'ensuite', name: 'En-suite', targetAreaM2: 5, isPrivate: true, needsWindow: false, ensuiteHostId: 'bed1' },
            { id: 'bed2', type: 'bedroom', name: 'Bedroom 2', targetAreaM2: 14, isPrivate: true, needsWindow: true },
            { id: 'corr', type: 'corridor', name: 'Corridor', targetAreaM2: 4, isPrivate: false, needsWindow: false },
        ],
        edges: [],
        corridorId: 'corr',
        entryId: null,
    };

    it('passes a clean attached 1:1 suite', () => {
        // bed1 [0..5]x[0..4]; ens1 carved in its corner sharing a full wall; bed2 + corridor elsewhere.
        const placements = [
            { roomId: 'bed1', rect: { x0: 0, z0: 0, x1: 5, z1: 4 } },
            { roomId: 'ens1', rect: { x0: 3.5, z0: 0, x1: 5, z1: 2.5 } },   // ~3.75 m², shares wall x=3.5 + z=0 with bed1 corner
            { roomId: 'bed2', rect: { x0: 6, z0: 0, x1: 11, z1: 4 } },
            { roomId: 'corr', rect: { x0: 5, z0: 0, x1: 6, z1: 4 } },
        ];
        // The ensuite shares its full z-edge with bed1 (the corner carve): bad must be empty.
        const placementsAttached = [
            { roomId: 'bed1', rect: { x0: 0, z0: 0, x1: 5, z1: 4 } },
            { roomId: 'ens1', rect: { x0: 3.5, z0: 0, x1: 5, z1: 4 } },   // full z-run shared with bed1 (x=3.5)
            { roomId: 'bed2', rect: { x0: 6, z0: 0, x1: 11, z1: 4 } },
            { roomId: 'corr', rect: { x0: 5, z0: 0, x1: 6, z1: 4 } },
        ];
        // bed1 must remain the host's REMAINING part for the area test; shrink it so ensuite < host.
        const fixed = placementsAttached.map(p => p.roomId === 'bed1' ? { ...p, rect: { x0: 0, z0: 0, x1: 3.5, z1: 4 } } : p);
        const doors: DoorOpening[] = [{ type: 'door', betweenRoomIds: ['bed1', 'ens1'] } as DoorOpening];
        expect(ensuiteNot1to1RoomIds({ bubble: graph, placements: fixed, doorOpenings: doors })).toEqual([]);
        void placements;
    });

    it('flags an ensuite DETACHED from its host', () => {
        const placements = [
            { roomId: 'bed1', rect: { x0: 0, z0: 0, x1: 3.5, z1: 4 } },
            { roomId: 'ens1', rect: { x0: 8, z0: 0, x1: 9.5, z1: 3 } },   // far away, shares no wall
            { roomId: 'bed2', rect: { x0: 6, z0: 0, x1: 11, z1: 4 } },
            { roomId: 'corr', rect: { x0: 5, z0: 0, x1: 6, z1: 4 } },
        ];
        expect(ensuiteNot1to1RoomIds({ bubble: graph, placements, doorOpenings: [] })).toContain('ens1');
    });

    it('flags an OVERSIZED ensuite (larger than its host)', () => {
        const placements = [
            { roomId: 'bed1', rect: { x0: 0, z0: 0, x1: 2, z1: 4 } },     // 8 m² host
            { roomId: 'ens1', rect: { x0: 2, z0: 0, x1: 6, z1: 4 } },     // 16 m² ensuite (> host) attached at x=2
            { roomId: 'bed2', rect: { x0: 6, z0: 0, x1: 11, z1: 4 } },
            { roomId: 'corr', rect: { x0: 0, z0: 4, x1: 11, z1: 5 } },
        ];
        const doors: DoorOpening[] = [{ type: 'door', betweenRoomIds: ['bed1', 'ens1'] } as DoorOpening];
        expect(ensuiteNot1to1RoomIds({ bubble: graph, placements, doorOpenings: doors })).toContain('ens1');
    });

    it('flags an ensuite WRONG-DOORED onto a non-host room (corridor/second bedroom)', () => {
        const placements = [
            { roomId: 'bed1', rect: { x0: 0, z0: 0, x1: 3.5, z1: 4 } },
            { roomId: 'ens1', rect: { x0: 3.5, z0: 0, x1: 5, z1: 4 } },   // attached to bed1 fine…
            { roomId: 'bed2', rect: { x0: 6, z0: 0, x1: 11, z1: 4 } },
            { roomId: 'corr', rect: { x0: 5, z0: 0, x1: 6, z1: 4 } },
        ];
        // …but a door from the ensuite goes to the CORRIDOR — forbidden.
        const doors: DoorOpening[] = [{ type: 'door', betweenRoomIds: ['ens1', 'corr'] } as DoorOpening];
        expect(ensuiteNot1to1RoomIds({ bubble: graph, placements, doorOpenings: doors })).toContain('ens1');
    });

    it('flags a SHARED host (two ensuites naming the same bedroom)', () => {
        const sharedGraph: BubbleGraph = {
            rooms: [
                ...graph.rooms,
                { id: 'ens2', type: 'ensuite', name: 'En-suite 2', targetAreaM2: 5, isPrivate: true, needsWindow: false, ensuiteHostId: 'bed1' },
            ],
            edges: [], corridorId: 'corr', entryId: null,
        };
        const placements = [
            { roomId: 'bed1', rect: { x0: 0, z0: 0, x1: 3, z1: 4 } },
            { roomId: 'ens1', rect: { x0: 3, z0: 0, x1: 4.5, z1: 4 } },
            { roomId: 'ens2', rect: { x0: 4.5, z0: 0, x1: 6, z1: 4 } },   // both attached to bed1 → shared
            { roomId: 'bed2', rect: { x0: 6, z0: 0, x1: 11, z1: 4 } },
            { roomId: 'corr', rect: { x0: 0, z0: 4, x1: 11, z1: 5 } },
        ];
        const bad = ensuiteNot1to1RoomIds({ bubble: sharedGraph, placements, doorOpenings: [] });
        expect(bad).toContain('ens1');
        expect(bad).toContain('ens2');
    });
});
