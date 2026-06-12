// @vitest-environment happy-dom
//
// FOUNDER FULL-HOUSE DEFECTS (build ~v183, 2026-06-12) — four LAYOUT/CIRCULATION
// invariants the founder reported on a generated multi-storey HOUSE:
//
//   #3 §ROOM-OVERLAP-NET — "NO ROOMS OVERLAPPING — extremely forbidden!!" — after every
//      placement / residual-fill / reflection pass, NO two emitted room rects may overlap
//      by more than a hairline, on ANY storey. The final `resolveRoomOverlaps` net clips
//      (or drops, only if fully covered) the lower-priority room.
//   #2 §STAIR-CIRC-FACE — the upstairs corridor MUST connect to the stair (share a wall +
//      door). The upper-storey circulation room is generated adjacent to the stair core.
//   #7 §DOOR-NO-CLASH — doors must not collide / overlap swings, esp. on a small corridor
//      hosting multiple doors: two door openings on the same room keep a min separation.
//
// happy-dom: the house orchestrator transitively imports the room-detection seam (window).

import { describe, expect, it } from 'vitest';
import { generateHouseLayout } from '../src/workflows/houseLayout/index.js';
import {
    resolveRoomOverlaps, type RoomPlacement,
} from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import type { BubbleGraph, ProgramRoom } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import type { Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type {
    ApartmentConstraints, ApartmentProgram, RoomType, ScoringWeights,
} from '../src/workflows/apartmentLayout/types.js';

const C: ApartmentConstraints = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const W: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

function plate(areaM2: number, widthM: number): ShellAnalysis {
    const depthM = areaM2 / widthM;
    return {
        netAreaM2: areaM2, widthM, depthM,
        perimeter: [{ x: 0, z: 0 }, { x: widthM, z: 0 }, { x: widthM, z: depthM }, { x: 0, z: depthM }],
        faces: [],
    };
}

const BIG: ApartmentProgram = {
    bedrooms: 6, bathrooms: 3, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

const area = (r: Rect) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.z1 - r.z0);
const overlapArea = (a: Rect, b: Rect) => {
    const dx = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const dz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    return dx > 0 && dz > 0 ? dx * dz : 0;
};

// ─────────────────────── #3 §ROOM-OVERLAP-NET (unit) ───────────────────────
describe('#3 §ROOM-OVERLAP-NET — resolveRoomOverlaps clips/drops so NO two rooms overlap', () => {
    const typeMap = (entries: Array<[string, RoomType]>) => new Map<string, RoomType>(entries);

    it('clips the LOWER-priority room out of a higher-priority overlap (master wins over a Store)', () => {
        // A master 0..6 x 0..6 and a minted "Store" (utility) 4..8 x 0..6 overlap on x 4..6.
        const placements: RoomPlacement[] = [
            { roomId: 'master0', rect: { x0: 0, z0: 0, x1: 6, z1: 6 } },
            { roomId: 'store0', rect: { x0: 4, z0: 0, x1: 8, z1: 6 } },
        ];
        const r = resolveRoomOverlaps(placements, typeMap([['master0', 'master'], ['store0', 'utility']]));
        expect(r.worstResidualM2).toBeLessThanOrEqual(1e-3);
        expect(r.dropped).toHaveLength(0);
        // The master is untouched; the store is clipped to x 6..8.
        const master = r.placements.find(p => p.roomId === 'master0')!;
        const store = r.placements.find(p => p.roomId === 'store0')!;
        expect(master.rect).toEqual(placements[0]!.rect);
        expect(store.rect.x0).toBeCloseTo(6, 6);
        expect(store.rect.x1).toBeCloseTo(8, 6);
        // And really: zero pairwise overlap remains.
        expect(overlapArea(master.rect, store.rect)).toBeLessThanOrEqual(1e-6);
    });

    it('DROPS the lower-priority room when it is fully covered (never left overlapping)', () => {
        // A store fully inside a living room → no clear sub-rect → dropped.
        const placements: RoomPlacement[] = [
            { roomId: 'living0', rect: { x0: 0, z0: 0, x1: 10, z1: 10 } },
            { roomId: 'store0', rect: { x0: 3, z0: 3, x1: 6, z1: 6 } },
        ];
        const r = resolveRoomOverlaps(placements, typeMap([['living0', 'living'], ['store0', 'utility']]));
        expect(r.dropped).toEqual(['store0']);
        expect(r.placements.map(p => p.roomId)).toEqual(['living0']);
        expect(r.worstResidualM2).toBeLessThanOrEqual(1e-3);
    });

    it('the STAIR is supreme — a room overlapping the stair is clipped, the stair is untouched', () => {
        const placements: RoomPlacement[] = [
            { roomId: 'stair0', rect: { x0: 6, z0: 0, x1: 9, z1: 3 } },
            { roomId: 'bed0', rect: { x0: 0, z0: 0, x1: 8, z1: 6 } },     // overlaps the stair on x 6..8 z 0..3
        ];
        const r = resolveRoomOverlaps(placements, typeMap([['stair0', 'stair'], ['bed0', 'bedroom']]));
        const stair = r.placements.find(p => p.roomId === 'stair0')!;
        expect(stair.rect).toEqual(placements[0]!.rect);          // stair never moves
        const bed = r.placements.find(p => p.roomId === 'bed0')!;
        expect(overlapArea(bed.rect, stair.rect)).toBeLessThanOrEqual(1e-6);
        expect(r.worstResidualM2).toBeLessThanOrEqual(1e-3);
    });

    it('a non-overlapping (tiling) set is a strict IDENTITY — byte-identical (apartment safe)', () => {
        const placements: RoomPlacement[] = [
            { roomId: 'a', rect: { x0: 0, z0: 0, x1: 5, z1: 4 } },
            { roomId: 'b', rect: { x0: 5, z0: 0, x1: 10, z1: 4 } },     // shares the x=5 wall only
            { roomId: 'c', rect: { x0: 0, z0: 4, x1: 10, z1: 8 } },
        ];
        const r = resolveRoomOverlaps(placements, typeMap([['a', 'bedroom'], ['b', 'bedroom'], ['c', 'living']]));
        expect(r.resolved).toHaveLength(0);
        expect(r.dropped).toHaveLength(0);
        expect(r.placements).toEqual(placements);
    });

    it('is deterministic (ADR-0061) — identical input → identical resolution', () => {
        const placements: RoomPlacement[] = [
            { roomId: 'r0', rect: { x0: 0, z0: 0, x1: 6, z1: 6 } },
            { roomId: 'r1', rect: { x0: 4, z0: 0, x1: 10, z1: 6 } },
            { roomId: 'r2', rect: { x0: 0, z0: 4, x1: 6, z1: 9 } },
        ];
        const m = typeMap([['r0', 'bedroom'], ['r1', 'bedroom'], ['r2', 'bedroom']]);
        const a = resolveRoomOverlaps(placements, m);
        const b = resolveRoomOverlaps(placements, m);
        expect(JSON.stringify(a.placements)).toEqual(JSON.stringify(b.placements));
        expect(a.worstResidualM2).toBeLessThanOrEqual(1e-3);
    });
});

// ──────────────── #3 §ROOM-OVERLAP-NET (house integration) ────────────────
describe('#3 §ROOM-OVERLAP-NET — generated house storeys have NO overlapping rooms', () => {
    for (const [areaM2, widthM] of [[230, 16], [250, 16], [210, 15]] as const) {
        it(`a ${areaM2} m² 2-storey plate (${widthM} m): no two rooms on any storey overlap by > 0.05 m²`, () => {
            const r = generateHouseLayout(plate(areaM2, widthM), BIG, C, W, { storeyCount: 2 });
            for (const opt of r.perStoreyLayout) {
                const rooms = opt!.rooms;
                const rects = rooms.map(rm => {
                    const poly = rm.polygon;
                    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
                    for (const p of poly ?? []) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.y); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.y); }
                    return { name: rm.name, rect: { x0, z0, x1, z1 } as Rect, ok: Number.isFinite(x0) };
                }).filter(e => e.ok);
                for (let i = 0; i < rects.length; i++) {
                    for (let j = i + 1; j < rects.length; j++) {
                        // mm polygons → m² overlap = mm²/1e6. 0.05 m² tolerance absorbs the editor's
                        // 20 mm node grid + welds; a real room-over-room collision is many m².
                        const ovM2 = overlapArea(rects[i]!.rect, rects[j]!.rect) / 1e6;
                        expect(
                            ovM2,
                            `"${rects[i]!.name}" overlaps "${rects[j]!.name}" by ${ovM2.toFixed(2)} m²`,
                        ).toBeLessThanOrEqual(0.05);
                    }
                }
            }
        });
    }
});

// ──────────────── #2 §STAIR-CIRC-FACE (house integration) ────────────────
describe('#2 §STAIR-CIRC-FACE — the upstairs corridor connects to the stair', () => {
    const SHELL: ShellAnalysis = {
        netAreaM2: 130, widthM: 13, depthM: 10,
        perimeter: [{ x: 0, z: 0 }, { x: 13, z: 0 }, { x: 13, z: 10 }, { x: 0, z: 10 }], faces: [],
    };
    const r = generateHouseLayout(SHELL, {
        bedrooms: 3, bathrooms: 2, masterEnSuite: true,
        openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
    }, C, W, { storeyCount: 2 });

    it('the upper storey has a circulation room (corridor/hall) adjacent to the stair', () => {
        const upper = r.perStoreyLayout[1]!;
        const stairs = upper.rooms.filter(rm => rm.type === 'stair');
        expect(stairs.length).toBeGreaterThanOrEqual(1);
        // The stair's neighbours include a circulation room (corridor/hall) OR the stair shares a
        // wall with one across the stack — the landing/vertical-core access the founder requires.
        const circNames = new Set(
            upper.rooms.filter(rm => rm.type === 'corridor' || rm.type === 'hall').map(rm => rm.name),
        );
        const stairTouchesCirc = stairs.some(s => s.adjacentTo.some(n => circNames.has(n)));
        // The stair is at minimum sealed by a neighbour on every storey (never an open flood cell).
        for (const s of stairs) expect(s.adjacentTo.length).toBeGreaterThan(0);
        expect(stairTouchesCirc, 'no upstairs corridor/hall is adjacent to the stair').toBe(true);
    });
});

// ──────────────────────── #7 §DOOR-NO-CLASH (unit) ────────────────────────
describe('#7 §DOOR-NO-CLASH — multiple doors on a small corridor do not collide / overlap swings', () => {
    const room = (id: string, type: RoomType, area = 14): ProgramRoom =>
        ({ id, type, name: id, targetAreaM2: area, isPrivate: false, needsWindow: false });

    // A 1.2 m × 9 m corridor down the middle, with FOUR bedrooms combed off its long (z) face on
    // BOTH sides — the canonical "rooms off a corridor" plan that produced the founder's clash.
    //   corridor: x 0..1.2, z 0..9
    //   bedrooms on the +x face share the corridor's x=1.2 wall over their own z-bands.
    const corridor: RoomPlacement = { roomId: 'cor', rect: { x0: 0, z0: 0, x1: 1.2, z1: 9 } };
    const beds: RoomPlacement[] = [
        { roomId: 'b0', rect: { x0: 1.2, z0: 0, x1: 5, z1: 3 } },
        { roomId: 'b1', rect: { x0: 1.2, z0: 3, x1: 5, z1: 6 } },
        { roomId: 'b2', rect: { x0: 1.2, z0: 6, x1: 5, z1: 9 } },
    ];
    const placements = [corridor, ...beds];
    const graph: BubbleGraph = {
        rooms: [room('cor', 'corridor'), room('b0', 'bedroom'), room('b1', 'bedroom'), room('b2', 'bedroom')],
        edges: [
            { a: 'cor', b: 'b0', via: 'door' },
            { a: 'cor', b: 'b1', via: 'door' },
            { a: 'cor', b: 'b2', via: 'door' },
        ],
        corridorId: 'cor', entryId: null,
    };

    const built = buildWallsAndDoors(placements, graph);

    // Reconstruct each door's world footprint [start, end] along its host wall.
    const doorSpans = built.openings
        .filter(o => o.type === 'door')
        .map(o => {
            const wall = built.segments.find(s => s.id === o.wallId)!;
            const dx = wall.b.x - wall.a.x, dz = wall.b.z - wall.a.z;
            const len = Math.hypot(dx, dz) || 1;
            const ux = dx / len, uz = dz / len;
            return {
                wallId: o.wallId,
                rooms: o.betweenRoomIds,
                p0: { x: wall.a.x + ux * o.offsetM, z: wall.a.z + uz * o.offsetM },
                p1: { x: wall.a.x + ux * (o.offsetM + o.widthM), z: wall.a.z + uz * (o.offsetM + o.widthM) },
            };
        });

    it('places a door for each corridor↔bedroom edge', () => {
        expect(doorSpans.length).toBeGreaterThanOrEqual(3);
    });

    it('no two doors that share the corridor are closer than the swing clearance (no clash)', () => {
        const SWING = 0.5;     // DOOR_SWING_CLEAR_M
        // Distance between two segments' nearest endpoints (the door leaves). For doors on the SAME
        // corridor (every door here serves the corridor), their leaves must keep ≥ SWING apart.
        const nearest = (a: typeof doorSpans[number], b: typeof doorSpans[number]) => {
            let best = Infinity;
            for (const pa of [a.p0, a.p1]) for (const pb of [b.p0, b.p1]) {
                best = Math.min(best, Math.hypot(pa.x - pb.x, pa.z - pb.z));
            }
            return best;
        };
        for (let i = 0; i < doorSpans.length; i++) {
            for (let j = i + 1; j < doorSpans.length; j++) {
                const a = doorSpans[i]!, b = doorSpans[j]!;
                const shareCorridor = a.rooms.includes('cor') && b.rooms.includes('cor');
                if (!shareCorridor) continue;
                // Two doors on DIFFERENT walls of the same corridor: their leaves must not abut.
                if (a.wallId === b.wallId) continue;            // one-per-wall already enforced
                const d = nearest(a, b);
                expect(
                    d,
                    `corridor doors on walls ${a.wallId}/${b.wallId} clash (leaves ${d.toFixed(2)} m apart)`,
                ).toBeGreaterThanOrEqual(SWING - 1e-3);
            }
        }
    });

    it('every door still fits its host wall (offset + width ≤ wall length, clearance kept)', () => {
        for (const o of built.openings) {
            const wall = built.segments.find(s => s.id === o.wallId)!;
            const len = Math.hypot(wall.b.x - wall.a.x, wall.b.z - wall.a.z);
            expect(o.offsetM).toBeGreaterThanOrEqual(0);
            expect(o.offsetM + o.widthM).toBeLessThanOrEqual(len + 1e-6);
        }
    });

    it('is deterministic — identical input → identical door offsets', () => {
        const again = buildWallsAndDoors(placements, graph);
        const sig = (b: typeof built) => b.openings.map(o => `${o.wallId}:${o.offsetM}:${o.widthM}`).join(',');
        expect(sig(built)).toEqual(sig(again));
    });
});
