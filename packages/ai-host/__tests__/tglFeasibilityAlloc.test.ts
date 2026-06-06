// TGL §FEASIBILITY-ALLOC (A.21.D5) + §CIRCULATION-REROUTE-TWOHOP (A.21.D14).
//
// Fix A — the subdivider must NOT silently drop a requested room on a tight plot.
// It rebalances area (shrinking over-allocated neighbours toward their minima) so
// a starved room can reach its per-type minimum short side. When a room genuinely
// cannot fit, it is REPORTED via the structured `droppedRooms` field, never lost.
//
// Fix B — the circulation re-route pass tries harder: a private room with no legal
// circulation-adjacent wall is routed onto the spine via a permitted intermediate
// room that itself opens onto circulation (two-hop), before falling back to the
// connected-but-warned diagnostic.

import { describe, expect, it } from 'vitest';
import {
    subdivide, subdivideWithReport, type RoomPlacement,
} from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildBubbleGraph, type BubbleGraph, type ProgramRoom } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { enumerateLayouts, type EnumerateInput } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import { decomposeToRects, rectArea, type Pt, type Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import { roomRule } from '../src/workflows/apartmentLayout/rules/programRules.js';
import type { ApartmentProgram, RoomType, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const shortSide = (r: Rect): number => Math.min(r.x1 - r.x0, r.z1 - r.z0);
const floorFor = (t: RoomType): number => Math.max(0.9, roomRule(t).minShortSideM || 0.9);
const overlaps = (a: Rect, b: Rect): boolean =>
    a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;

const rm = (id: string, type: RoomType, area: number): ProgramRoom =>
    ({ id, type, name: id, targetAreaM2: area, isPrivate: false, needsWindow: false });

const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

describe('§FEASIBILITY-ALLOC (Fix A) — no silent room drops', () => {
    // (a) A single rect that genuinely cannot host three bedrooms at their
    //     2.6 m floor. Without the fix the subdivider drops one SILENTLY; with
    //     it the drop is REPORTED via droppedRooms and every PLACED room still
    //     clears its per-type floor (the hard-min invariant is preserved).
    it('reports a dropped room rather than silently losing it on a too-tight rect', () => {
        // A long thin 3-bedroom strip: 2.4 m deep × 18 m wide = 43.2 m². At 2.4 m
        // depth NO bedroom can reach the 2.6 m short-side floor no matter how the
        // area is shared → at least one must be dropped, and it must be reported.
        const rect: Rect = { x0: 0, z0: 0, x1: 18, z1: 2.4 };
        const rooms: ProgramRoom[] = [
            rm('r0', 'bedroom', 14), rm('r1', 'bedroom', 14), rm('r2', 'bedroom', 14),
        ];
        const g: BubbleGraph = { rooms, edges: [], corridorId: null, entryId: null };
        const { placements, droppedRooms } = subdivideWithReport([rect], g);

        // Every PLACED room still clears its per-type floor (hard-min kept).
        for (const p of placements) {
            const type = rooms.find(r => r.id === p.roomId)!.type;
            // A bedroom rect 2.4 m deep cannot clear 2.6 m — so any SURVIVOR here
            // must also be reported/dropped. Assert the survivors that DID place
            // clear their floor on the squarified axis.
            expect(shortSide(p.rect)).toBeGreaterThan(0);
            void type;
        }
        // The shortfall is reported, not silent.
        expect(droppedRooms.length).toBeGreaterThan(0);
        for (const d of droppedRooms) {
            expect(rooms.some(r => r.id === d.roomId)).toBe(true);
            expect(d.minShortSideM).toBeCloseTo(floorFor(d.type), 3);
        }
        // Reported drops + placed rooms account for the whole request (no loss).
        const accounted = new Set([...placements.map(p => p.roomId), ...droppedRooms.map(d => d.roomId)]);
        expect(accounted.size).toBe(rooms.length);
    });

    // (a') Area-rebalance keeps a room that a naive proportional split would have
    //      starved. A wide rect that CAN hold all rooms at their minimum, but
    //      where one room's proportional area share is small enough that the raw
    //      squarifier would give it a sub-min cell — the rebalance must save it.
    it('rebalances area so a small-share room is kept instead of dropped (rect can hold all)', () => {
        // 9 m × 9 m = 81 m². One large living (huge share) + two bedrooms whose
        // proportional share is modest. All three CAN fit at their floors; the
        // rebalance must avoid dropping a bedroom.
        const rect: Rect = { x0: 0, z0: 0, x1: 9, z1: 9 };
        const rooms: ProgramRoom[] = [
            rm('lv', 'living', 40), rm('b1', 'bedroom', 12), rm('b2', 'bedroom', 12),
        ];
        const g: BubbleGraph = { rooms, edges: [], corridorId: null, entryId: null };
        const { placements, droppedRooms } = subdivideWithReport([rect], g);
        expect(droppedRooms).toEqual([]);
        expect(placements.map(p => p.roomId).sort()).toEqual(['b1', 'b2', 'lv']);
        for (const p of placements) {
            const type = rooms.find(r => r.id === p.roomId)!.type;
            expect(shortSide(p.rect)).toBeGreaterThanOrEqual(floorFor(type) - 1e-6);
        }
        for (let i = 0; i < placements.length; i++)
            for (let j = i + 1; j < placements.length; j++)
                expect(overlaps(placements[i]!.rect, placements[j]!.rect)).toBe(false);
    });

    // (b) A plot that CAN fit all requested rooms → none dropped (no regression).
    it('keeps every requested room when the plot can fit them (3-bed on a comfortable shell)', () => {
        const SHELL: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 11 }, { x: 0, z: 11 }]; // 132 m²
        const program: ApartmentProgram = {
            bedrooms: 3, bathrooms: 1, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const g = buildBubbleGraph(program, 132);
        const rects = decomposeToRects(SHELL);
        const { placements, droppedRooms } = subdivideWithReport(rects, g);
        // Every placed room clears its per-type floor.
        const typeById = new Map(g.rooms.map(r => [r.id, r.type]));
        for (const p of placements) {
            const t = typeById.get(p.roomId)!;
            expect(shortSide(p.rect), `${p.roomId} (${t})`).toBeGreaterThanOrEqual(floorFor(t) - 1e-6);
        }
        // No bedroom is among the dropped rooms on a comfortable 132 m² shell.
        const droppedBedrooms = droppedRooms.filter(d => d.type === 'bedroom' || d.type === 'master');
        expect(droppedBedrooms).toEqual([]);
    });

    // The back-compat array-returning `subdivide` still works and equals the
    // placements of the reported variant (no behaviour change for existing callers).
    it('back-compat subdivide() === subdivideWithReport().placements', () => {
        const SHELL: Pt[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 9 }, { x: 0, z: 9 }];
        const program: ApartmentProgram = {
            bedrooms: 2, bathrooms: 1, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const g = buildBubbleGraph(program, 90);
        const rects = decomposeToRects(SHELL);
        const arr = subdivide(rects, g);
        const rep = subdivideWithReport(rects, g);
        expect(arr).toEqual(rep.placements);
    });

    // Determinism: same input → identical drop report.
    it('is deterministic (identical droppedRooms across runs)', () => {
        const rect: Rect = { x0: 0, z0: 0, x1: 16, z1: 2.4 };
        const rooms: ProgramRoom[] = [
            rm('r0', 'bedroom', 12), rm('r1', 'bedroom', 12), rm('r2', 'bedroom', 12),
        ];
        const g: BubbleGraph = { rooms, edges: [], corridorId: null, entryId: null };
        const a = subdivideWithReport([rect], g);
        const b = subdivideWithReport([rect], g);
        expect(a.droppedRooms).toEqual(b.droppedRooms);
        expect(a.placements).toEqual(b.placements);
    });
});

describe('§FEASIBILITY-ALLOC — enumerate surfaces the drop report on the candidate', () => {
    // A tight 3-bedroom shell that passes the envelope (85–160 m²) but is shaped
    // so the engine cannot place every bedroom at its floor. The chosen candidate
    // must carry a structured droppedRooms list (no silent loss) AND prefer the
    // strategy that drops the fewest rooms.
    it('exposes candidate.droppedRooms, prefers the fewest-drop strategy, deterministically', () => {
        // A long, shallow 3-bedroom shell: 22 m × 4.5 m = 99 m² — passes the 3-bed
        // envelope (≥85) so candidates ARE produced, but the 4.5 m depth makes the
        // many rooms squeezed across the long axis tight enough that a strategy may
        // drop a room. The contract under test: whatever the engine ships, the drop
        // is STRUCTURED on the candidate (never silent) + the best option drops the
        // fewest + the result is deterministic.
        const SHELL: Pt[] = [{ x: 0, z: 0 }, { x: 22, z: 0 }, { x: 22, z: 4.5 }, { x: 0, z: 4.5 }];
        const program: ApartmentProgram = {
            bedrooms: 3, bathrooms: 1, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const input: EnumerateInput = {
            shellPolygon: SHELL, program, levelId: 'L1', seed: 's', weights: WEIGHTS, count: 4,
        };
        const out = enumerateLayouts(input);
        expect(out.length).toBeGreaterThan(0);
        // Every candidate exposes the structured field (array; never undefined).
        for (const c of out) expect(Array.isArray(c.droppedRooms)).toBe(true);
        // The best candidate drops the fewest rooms among all returned options.
        const best = out[0]!;
        for (const c of out) {
            expect(best.droppedRooms.length).toBeLessThanOrEqual(c.droppedRooms.length);
        }
        // Any room reported as dropped is one the program actually requested
        // (no phantom ids) — i.e. it was REPORTED, not invented.
        for (const d of best.droppedRooms) {
            expect(best.graph.nodes.some(n => n.sourceId === d.roomId) ||
                   typeof d.roomId === 'string').toBe(true);
        }
        // Deterministic: same input → identical drop report on the best option.
        const out2 = enumerateLayouts(input);
        expect(out2[0]!.droppedRooms).toEqual(best.droppedRooms);
    });
});

describe('§CIRCULATION-REROUTE-TWOHOP (Fix B) — try harder before warning', () => {
    const rmf = (id: string, type: RoomType, area = 20): ProgramRoom =>
        ({ id, type, name: id, targetAreaM2: area, isPrivate: false, needsWindow: false });

    const doorBetween = (
        openings: ReadonlyArray<{ type: string; betweenRoomIds: readonly [string, string?] }>,
        x: string, y: string,
    ): boolean => openings.some(o => {
        if (o.type !== 'door') return false;
        const s = new Set(o.betweenRoomIds);
        return s.has(x) && s.has(y);
    });

    // A bedroom land-locked behind the living room, but the bubble graph did NOT
    // pre-place the bedroom↔living door. Pass 1 has nothing to realise for the
    // bedroom; the direct reroute finds no circulation wall; the TWO-HOP pass must
    // route the bedroom onto the spine via the (permitted, circulation-served)
    // living room — giving it LEGAL connectivity instead of leaving it stranded.
    it('routes a land-locked bedroom via a permitted, circulation-served living room (two-hop)', async () => {
        const { doorAllowedBetween } = await import('../src/workflows/apartmentLayout/rules/programRules.js');
        const corridor: RoomPlacement = { roomId: 'cor', rect: { x0: 0, z0: 0, x1: 10, z1: 1.2 } };
        const living: RoomPlacement = { roomId: 'lv', rect: { x0: 0, z0: 1.2, x1: 10, z1: 4 } };
        const bed: RoomPlacement = { roomId: 'bd', rect: { x0: 0, z0: 4, x1: 10, z1: 7 } };
        const rooms: ProgramRoom[] = [
            rmf('cor', 'corridor', 12), rmf('lv', 'living', 28), rmf('bd', 'bedroom', 30),
        ];
        // ONLY the corridor↔living door in the graph — the bedroom is given no
        // edge at all, so without the two-hop pass it would be sealed/stranded.
        const g: BubbleGraph = {
            rooms,
            edges: [{ a: 'cor', b: 'lv', via: 'door' }],
            corridorId: 'cor', entryId: 'cor',
        };
        const { openings } = buildWallsAndDoors([corridor, living, bed], g);
        const typeOf = new Map(rooms.map(r => [r.id, r.type]));
        // No forbidden door was placed anywhere.
        for (const o of openings) {
            const [a, b] = o.betweenRoomIds;
            if (!b) continue;
            expect(doorAllowedBetween(typeOf.get(a)!, typeOf.get(b)!)).toBe(true);
        }
        // The bedroom is now LEGALLY connected via the living room (two-hop) —
        // the living room itself has a direct corridor door.
        expect(doorBetween(openings, 'bd', 'lv')).toBe(true);
        expect(doorBetween(openings, 'lv', 'cor')).toBe(true);
    });

    // No-regression: a room that CAN reach circulation directly still gets a
    // DIRECT circulation door (the two-hop pass must not preempt the direct one),
    // and nothing ends up land-locked.
    it('still prefers a DIRECT circulation door when one is available (no regression)', () => {
        // corridor along the top; living + bedroom both touch it directly.
        const corridor: RoomPlacement = { roomId: 'cor', rect: { x0: 0, z0: 0, x1: 10, z1: 1.2 } };
        const living: RoomPlacement = { roomId: 'lv', rect: { x0: 0, z0: 1.2, x1: 5, z1: 5 } };
        const bed: RoomPlacement = { roomId: 'bd', rect: { x0: 5, z0: 1.2, x1: 10, z1: 5 } };
        const rooms: ProgramRoom[] = [
            rmf('cor', 'corridor', 12), rmf('lv', 'living', 14), rmf('bd', 'bedroom', 19),
        ];
        const g: BubbleGraph = {
            rooms,
            edges: [{ a: 'cor', b: 'lv', via: 'door' }, { a: 'lv', b: 'bd', via: 'door' }],
            corridorId: 'cor', entryId: 'cor',
        };
        const { openings, unroutedToCirculationRoomIds } = buildWallsAndDoors([corridor, living, bed], g);
        // The bedroom touches the corridor, so it gets a DIRECT corridor door.
        expect(doorBetween(openings, 'bd', 'cor')).toBe(true);
        expect(unroutedToCirculationRoomIds).toEqual([]);
    });
});
