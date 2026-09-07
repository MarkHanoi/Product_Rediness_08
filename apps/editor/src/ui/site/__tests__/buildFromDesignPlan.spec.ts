/**
 * §BIM-FROM-THE-DESIGN (L-13080) — the FOURTH ARM's planner.
 *
 * Founder, with 7 authored envelopes on screen (one `role:'level'` at 190.23 m² and six
 * `role:'room'` totalling ~77 m²), after clicking "Take me into BIM" and being shown
 * "Design your house — live":
 *
 *   > "WHEN WE SAY — CREATE BIM — EXCLUDE THIS — WE ALREADY HAVE THE DESIGN."
 *
 * ⭐ THE TESTS THAT CARRY THIS FILE ARE THE TWO REDUCTIONS AND THE PER-ROOM REFUSALS.
 *
 * The reductions matter because without them his six rooms emit 24 partitions — a doubled wall on
 * every shared boundary and a second wall laid over the shell — which is not the design he drew,
 * and the difference is invisible in a viewport until you section it.
 *
 * The per-room refusals matter for a harder reason: `CreateWallBatchHandler` validates EVERY wall
 * into `fresh[]` before it touches the store and THROWS `WallDimensionsError` on any baseLine
 * under 0.05 m (`CreateWallBatch.ts:152-162`). One bad edge in room 6 therefore means ZERO walls
 * created for rooms 1-5 as well, with no diagnosis. So the batch-killing cases have to be caught
 * HERE, per room, by name — and the arm that proves it is
 * `no planned wall is ever shorter than WALL_MIN_BASELINE_M`.
 */

import { describe, it, expect } from 'vitest';
import {
    planBuildFromDesign,
    readDesignEnvelopes,
    BUILD_FROM_DESIGN_WILL_NOT_CREATE,
    type BuildFromDesignInput,
    type DesignEnvelopeDatum,
    type DesignVertex,
} from '../buildFromDesignPlan';
import { WALL_MIN_BASELINE_M } from '../../house-layout/weldFootprintForWalls';

// ── The founder's site, to the numbers he was looking at ──────────────────────────────────────
// A 15.000 × 12.682 m plate = 190.23 m², and six rooms in a 3 × 2 grid, each 4.000 × 3.200 m
// = 12.8 m², 76.8 m² in all. Inset from the perimeter, so reduction (a) is NOT in play here and
// the shared-boundary reduction can be read on its own.
const PLATE: DesignVertex[] = [
    { x: 0, z: 0 }, { x: 15, z: 0 }, { x: 15, z: 12.682 }, { x: 0, z: 12.682 },
];

const rect = (x0: number, z0: number, x1: number, z1: number): DesignVertex[] =>
    [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];

const env = (over: Partial<DesignEnvelopeDatum> & { id: string }): DesignEnvelopeDatum => ({
    levelId: 'L0',
    name: null,
    role: 'room',
    withinId: null,
    baseOffset: 0,
    height: 3,
    footprint: [],
    footprintAreaM2: 0,
    occupancy: null,
    ...over,
});

const GROUND = env({
    id: 'E-ground', role: 'level', name: 'Ground envelope',
    height: 3, footprint: PLATE, footprintAreaM2: 190.23,
});

/** R1..R6 — ids chosen so the deterministic by-id walk is also the reading order. */
const SIX_ROOMS: DesignEnvelopeDatum[] = [
    ['R1', 1, 1, 5, 4.2], ['R2', 5, 1, 9, 4.2], ['R3', 9, 1, 13, 4.2],
    ['R4', 1, 4.2, 5, 7.4], ['R5', 5, 4.2, 9, 7.4], ['R6', 9, 4.2, 13, 7.4],
].map(([id, x0, z0, x1, z1]) => env({
    id: id as string, role: 'room', name: `Room ${(id as string).slice(1)}`,
    withinId: 'E-ground', height: 3,
    footprint: rect(x0 as number, z0 as number, x1 as number, z1 as number),
    footprintAreaM2: 12.8,
}));

const input = (over: Partial<BuildFromDesignInput> = {}): BuildFromDesignInput => ({
    envelopes: [GROUND, ...SIX_ROOMS],
    activeLevelId: 'L0',
    authoredWallCountOnActiveLevel: 0,
    ...over,
});

const ok = (over: Partial<BuildFromDesignInput> = {}) => {
    const out = planBuildFromDesign(input(over));
    if (!out.ok) throw new Error(`expected a plan, got refusal ${out.refusal.code}: ${out.refusal.text}`);
    return out.plan;
};

const refusal = (over: Partial<BuildFromDesignInput>) => {
    const out = planBuildFromDesign(input(over));
    if (out.ok) throw new Error('expected a refusal, got a plan');
    return out.refusal;
};

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("THE FOUNDER'S CASE — his 7 envelopes become his design, not a generated one", () => {
    it('⭐ one storey, one shell wall per plate edge, the deduped partitions, and one slab', () => {
        const p = ok();
        expect(p.storeyCount).toBe(1);
        expect(p.levelId).toBe('L0');
        expect(p.sourceEnvelopeId).toBe('E-ground');
        expect(p.sourceEnvelopeName).toBe('Ground envelope');
        expect(p.footprintAreaM2).toBe(190.23);
        expect(p.shellWallCount).toBe(4);            // one per edge of the plate
        expect(p.slabs).toHaveLength(1);
        expect(p.slabs[0]!.boundary).toHaveLength(4);
        expect(p.rooms).toHaveLength(6);
        expect(p.roomsAreaM2).toBe(76.8);
    });

    it('⭐ 24 room edges become 17 partitions — the shared-boundary reduction, NOT a doubled wall', () => {
        const p = ok();
        // 6 rooms × 4 edges = 24. Seven boundaries are shared (2 verticals per row × 2 rows,
        // plus 3 horizontals between the rows), and each becomes ONE wall.
        expect(p.dedupedPartitionCount).toBe(7);
        expect(p.partitionWallCount).toBe(17);
        expect(p.walls).toHaveLength(21);
        expect(p.walls.filter((w) => w.kind === 'shell')).toHaveLength(4);
        expect(p.walls.filter((w) => w.kind === 'partition')).toHaveLength(17);
    });

    it('⛔ NO PLANNED WALL IS SHORTER THAN THE 0.05 m THAT THROWS THE WHOLE BATCH', () => {
        const p = ok();
        for (const w of p.walls) {
            expect(w.lengthM, `wall ${w.kind} ${JSON.stringify(w.a)}→${JSON.stringify(w.b)}`)
                .toBeGreaterThanOrEqual(WALL_MIN_BASELINE_M);
        }
    });

    it('the sentence before the click names the storey, both wall counts and the slab', () => {
        const p = ok();
        const said = p.willCreate.join(' | ');
        expect(said).toContain('1 storey');
        expect(said).toContain('4 exterior shell walls');
        expect(said).toContain('17 interior partitions');
        expect(said).toContain('1 floor slab');
        expect(said).toContain('190.23 m²');
    });

    it('⛔ and names what it will NOT create — above all, a generated layout', () => {
        const p = ok();
        expect(p.willNotCreate).toBe(BUILD_FROM_DESIGN_WILL_NOT_CREATE);
        const not = p.willNotCreate.join(' | ');
        expect(not).toContain('generated layout');
        expect(not).toContain('roof');
        expect(not).toContain('stairs');
        expect(not).toContain('doors or windows');
        expect(not).toContain('columns or beams');
        // The whole objection, in one clause.
        expect(not).toContain('you drew one');
    });

    it('⛔ says the undo cost is TWO steps, because there is no verb that commits both', () => {
        expect(ok().advisories.join(' ')).toContain('Undo takes TWO steps');
    });

    it('leaves the envelopes alone, and says so — the panel still compares intent with built', () => {
        expect(ok().advisories.join(' ')).toContain('envelopes are left exactly where they are');
    });

    it('⭐ DETERMINISTIC — the same envelopes in a different store order plan the same walls', () => {
        const forward = ok();
        const shuffled = ok({ envelopes: [...SIX_ROOMS].reverse().concat([GROUND]) });
        expect(shuffled.walls).toEqual(forward.walls);
        expect(shuffled.rooms).toEqual(forward.rooms);
        expect(shuffled.dedupedPartitionCount).toBe(forward.dedupedPartitionCount);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('REDUCTION (a) — a room edge lying on the perimeter is NOT a second wall', () => {
    /** A room flush against the plate's south edge (z = 0) and its west edge (x = 0). */
    const FLUSH = env({
        id: 'R-flush', role: 'room', name: 'Garage', withinId: 'E-ground',
        footprint: rect(0, 0, 6, 5), footprintAreaM2: 30,
    });

    it('⭐ drops the coincident edges and records BOTH rooms\' claims on the shell wall', () => {
        const p = ok({ envelopes: [GROUND, FLUSH] });
        expect(p.rooms[0]!.edgesOnShellCount).toBe(2);      // south and west
        expect(p.droppedOnShellCount).toBe(2);
        expect(p.partitionWallCount).toBe(2);               // only the two interior edges
        expect(p.walls).toHaveLength(6);                    // 4 shell + 2 partitions, not 8

        // The claim is not lost — it lands on the shell wall that already carries that line.
        const claimed = p.walls.filter((w) => w.kind === 'shell' && w.alsoBounds.length > 0);
        expect(claimed).toHaveLength(2);
        expect(claimed[0]!.alsoBounds[0]!.envelopeId).toBe('R-flush');
        expect(claimed[0]!.alsoBounds[0]!.envelopeRole).toBe('room');
    });

    it('says so in the advisory, with the number', () => {
        expect(ok({ envelopes: [GROUND, FLUSH] }).advisories.join(' '))
            .toContain('2 room edges lie on the level envelope\'s perimeter');
    });

    it('⛔ does NOT drop a chord whose two ENDS touch the perimeter but which cuts open space', () => {
        // A re-entrant plate; the room's diagonal edge has both endpoints on the boundary while
        // the edge itself crosses the interior. Dropping it would delete a wall the user drew.
        const L_PLATE = env({
            id: 'E-L', role: 'level', name: 'L plate',
            footprint: [
                { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 4 },
                { x: 4, z: 4 }, { x: 4, z: 10 }, { x: 0, z: 10 },
            ],
            footprintAreaM2: 64,
        });
        const NOTCH = env({
            id: 'R-notch', role: 'room', name: 'Corner room', withinId: 'E-L',
            // (10,4) and (4,10) both sit on the plate's boundary; the edge between them does not.
            footprint: [{ x: 4, z: 4 }, { x: 10, z: 4 }, { x: 4, z: 10 }],
            footprintAreaM2: 18,
        });
        const p = ok({ envelopes: [L_PLATE, NOTCH], activeLevelId: 'L0' });
        const chord = p.walls.find((w) => w.kind === 'partition'
            && Math.hypot(w.a.x - w.b.x, w.a.z - w.b.z) > 8);
        expect(chord, 'the diagonal the user drew must survive as a partition').toBeDefined();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('REDUCTION (b) — a boundary shared by two rooms is ONE wall, with both claims', () => {
    const A = env({ id: 'R-a', role: 'room', name: 'Kitchen', withinId: 'E-ground', footprint: rect(2, 2, 6, 6), footprintAreaM2: 16 });
    const B = env({ id: 'R-b', role: 'room', name: 'Dining', withinId: 'E-ground', footprint: rect(6, 2, 10, 6), footprintAreaM2: 16 });

    it('⭐ 8 room edges become 7 walls, and the shared one carries the second room in alsoBounds', () => {
        const p = ok({ envelopes: [GROUND, A, B] });
        expect(p.dedupedPartitionCount).toBe(1);
        expect(p.partitionWallCount).toBe(7);
        const shared = p.walls.filter((w) => w.kind === 'partition' && w.alsoBounds.length === 1);
        expect(shared).toHaveLength(1);
        expect(shared[0]!.derivedFrom.envelopeId).toBe('R-a');   // first by id owns the primary claim
        expect(shared[0]!.alsoBounds[0]!.envelopeId).toBe('R-b');
    });

    it('⛔ two rooms drawn 3 mm apart are NOT merged — and the advisory says a merge means EXACT', () => {
        const B_OFF = env({ ...B, footprint: rect(6.003, 2, 10, 6) });
        const p = ok({ envelopes: [GROUND, A, B_OFF] });
        expect(p.dedupedPartitionCount).toBe(0);
        expect(p.partitionWallCount).toBe(8);   // two parallel partitions, 3 mm apart, both kept
    });

    it('the advisory reports the merge as a number rather than leaving it to be discovered', () => {
        expect(ok({ envelopes: [GROUND, A, B] }).advisories.join(' '))
            .toContain('1 boundary shared between two rooms became ONE partition');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('THE REFUSALS — every one names its numbers, and none is a silent fall-through', () => {
    it('⛔ an unreadable store is NOT "you drew nothing" (§CONTEXT-DATA-HONESTY)', () => {
        const r = refusal({ envelopes: null });
        expect(r.code).toBe('envelope-store-unreadable');
        expect(r.text).toContain('gap in PRYZM');
        // ⭐ It says the two apart IN THE SENTENCE — "NOT a finding that you have drawn nothing" —
        // rather than leaving the reader to infer which of the two values he is looking at.
        expect(r.text).toContain('NOT a finding that you have drawn nothing');
    });

    it('an empty site refuses for the OTHER reason — no level envelope', () => {
        expect(refusal({ envelopes: [] }).code).toBe('no-level-envelope');
    });

    it('no active level refuses rather than inventing one', () => {
        expect(refusal({ activeLevelId: null }).code).toBe('no-active-level');
    });

    it('⭐ a plate with NO rooms refuses with `no-room-envelopes` — the code the host falls through to the generator on', () => {
        const r = refusal({ envelopes: [GROUND] });
        expect(r.code).toBe('no-room-envelopes');
        expect(r.text).toContain('generator');
    });

    it('⛔ C80 — a level already carrying walls refuses, and the sentence names the COUNT', () => {
        const r = refusal({ authoredWallCountOnActiveLevel: 28 });
        expect(r.code).toBe('already-built');
        expect(r.text).toContain('28 authored walls');
        expect(r.text).toContain('Nothing has been created');
    });

    it('two plates at one height with different footprints refuse with BOTH areas', () => {
        const rival = env({ id: 'E-rival', role: 'level', footprint: rect(0, 0, 20, 20), footprintAreaM2: 400 });
        const r = refusal({ envelopes: [GROUND, rival, ...SIX_ROOMS] });
        expect(r.code).toBe('ambiguous-ground-plate');
        expect(r.text).toContain('190.2 m²');
        expect(r.text).toContain('400 m²');
    });

    it('a degenerate plate ring refuses with its vertex count and its area', () => {
        const bad = env({ id: 'E-bad', role: 'level', footprint: [{ x: 0, z: 0 }, { x: 1, z: 0 }], footprintAreaM2: 0 });
        const r = refusal({ envelopes: [bad, ...SIX_ROOMS] });
        expect(r.code).toBe('degenerate-footprint');
        expect(r.text).toContain('2 vertices');
    });

    it('⛔ if EVERY room refuses, the whole gesture refuses — a bare shell is not his design', () => {
        const tiny = (id: string) => env({
            id, role: 'room', name: id, withinId: 'E-ground',
            footprint: rect(0, 0, 0.4, 0.4), footprintAreaM2: 0.16,
        });
        const r = refusal({ envelopes: [GROUND, tiny('R-x'), tiny('R-y')] });
        expect(r.code).toBe('every-room-refused');
        expect(r.text).toContain('will not build the shell on its own');
        expect(r.text).toContain('R-x');           // named, not counted away
        expect(r.text).toContain('R-y');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('PER-ROOM REFUSALS — one bad room is named with its numbers, and the REST STILL BUILD', () => {
    const good = SIX_ROOMS[0]!;

    const withBadRoom = (bad: DesignEnvelopeDatum, over: Partial<BuildFromDesignInput> = {}) =>
        ok({ envelopes: [GROUND, good, bad], ...over });

    it('a ring with 2 vertices is refused BY NAME, and room 1 still builds', () => {
        const p = withBadRoom(env({
            id: 'R-line', role: 'room', name: 'Hall', withinId: 'E-ground',
            footprint: [{ x: 2, z: 8 }, { x: 6, z: 8 }], footprintAreaM2: 0,
        }));
        expect(p.refusedRooms).toHaveLength(1);
        expect(p.refusedRooms[0]!.code).toBe('ring-too-few-vertices');
        expect(p.refusedRooms[0]!.text).toContain('"Hall" has 2 vertices');
        expect(p.refusedRooms[0]!.text).toContain('the others were');
        expect(p.rooms).toHaveLength(1);            // ⭐ room 1 still builds
        expect(p.partitionWallCount).toBe(4);
    });

    it('a room under the area floor is refused with its own area', () => {
        const p = withBadRoom(env({
            id: 'R-dot', role: 'room', name: 'Nook', withinId: 'E-ground',
            footprint: rect(2, 8, 2.5, 8.5), footprintAreaM2: 0.25,
        }));
        expect(p.refusedRooms[0]!.code).toBe('area-below-floor');
        expect(p.refusedRooms[0]!.text).toContain('0.25 m²');
        expect(p.rooms).toHaveLength(1);
    });

    it("a room seated on an envelope that does not exist is refused, never re-seated by guess", () => {
        const p = withBadRoom(env({
            id: 'R-orphan', role: 'room', name: 'Study', withinId: 'E-deleted',
            footprint: rect(2, 8, 6, 11), footprintAreaM2: 12,
        }));
        expect(p.refusedRooms[0]!.code).toBe('within-unresolved');
        expect(p.refusedRooms[0]!.text).toContain('E-deleted');
    });

    it('⛔ with TWO plates, an undeclared room is refused rather than seated on a guess', () => {
        const upper = env({ id: 'E-upper', role: 'level', name: 'First floor', baseOffset: 3, footprint: PLATE, footprintAreaM2: 190.23 });
        const floating = env({
            id: 'R-float', role: 'room', name: 'Bedroom', withinId: null,
            footprint: rect(2, 8, 6, 11), footprintAreaM2: 12,
        });
        const p = ok({ envelopes: [GROUND, upper, good, floating] });
        expect(p.refusedRooms[0]!.code).toBe('within-ambiguous');
        expect(p.refusedRooms[0]!.text).toContain('does not declare which level envelope');
        expect(p.rooms).toHaveLength(1);
    });

    it('a room on the UPPER plate is refused with both heights — this pass builds the ground plate', () => {
        const upper = env({ id: 'E-upper', role: 'level', name: 'First floor', baseOffset: 3, footprint: PLATE, footprintAreaM2: 190.23 });
        const above = env({
            id: 'R-above', role: 'room', name: 'Bedroom', withinId: 'E-upper',
            footprint: rect(2, 8, 6, 11), footprintAreaM2: 12,
        });
        const p = ok({ envelopes: [GROUND, upper, good, above] });
        expect(p.refusedRooms[0]!.code).toBe('within-not-on-the-built-plate');
        expect(p.refusedRooms[0]!.text).toContain('3 m');
        expect(p.advisories.join(' ')).toContain('builds only the');
    });

    it('the advisory counts the refused rooms against the total the user drew', () => {
        const p = withBadRoom(env({
            id: 'R-line', role: 'room', name: 'Hall', withinId: 'E-ground',
            footprint: [{ x: 2, z: 8 }, { x: 6, z: 8 }], footprintAreaM2: 0,
        }));
        expect(p.advisories.join(' ')).toContain('1 of your 2 room envelopes cannot be built');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('⚠ THE BATCH-KILLER — a sub-0.05 m edge never reaches `wall.batch.create`', () => {
    /**
     * A room whose ring carries a 1 mm step. Dispatched raw this throws `WallDimensionsError` and
     * takes every other room's walls down with it. The weld reconciles it instead, and SAYS so.
     */
    const SPIKE = env({
        id: 'R-spike', role: 'room', name: 'Utility', withinId: 'E-ground',
        footprint: [
            { x: 2, z: 8 }, { x: 6, z: 8 }, { x: 6, z: 8.001 }, { x: 2, z: 10 },
        ],
        footprintAreaM2: 4,
    });

    it('⭐ the 1 mm edge is welded away and EVERY planned wall clears the wall-domain minimum', () => {
        const p = ok({ envelopes: [GROUND, SPIKE] });
        expect(p.rooms).toHaveLength(1);
        for (const w of p.walls) expect(w.lengthM).toBeGreaterThanOrEqual(WALL_MIN_BASELINE_M);
    });

    it('⛔ and the simplification is REPORTED — the user is told the perimeter moved', () => {
        const p = ok({ envelopes: [GROUND, SPIKE] });
        expect(p.advisories.join(' ')).toContain('simplified');
        expect(p.advisories.join(' ')).toContain('Utility');
    });

    it('a welded wall says its provenance is from a welded ring, never a silent index', () => {
        const p = ok({ envelopes: [GROUND, SPIKE] });
        const partition = p.walls.find((w) => w.kind === 'partition')!;
        expect(partition.derivedFrom.ringWelded).toBe(true);
        expect(partition.derivedFrom.envelopeId).toBe('R-spike');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('THE LINK, at plan time — every wall knows which envelope edge it came from', () => {
    it('shell walls index the plate ring, partitions index their own room ring', () => {
        const p = ok();
        const shell = p.walls.filter((w) => w.kind === 'shell');
        expect(shell.map((w) => w.derivedFrom.edgeIndex)).toEqual([0, 1, 2, 3]);
        for (const w of shell) {
            expect(w.derivedFrom.envelopeId).toBe('E-ground');
            expect(w.derivedFrom.envelopeRole).toBe('level');
            expect(w.derivedFrom.ringWelded).toBe(false);
        }
        for (const w of p.walls.filter((x) => x.kind === 'partition')) {
            expect(w.derivedFrom.envelopeRole).toBe('room');
            expect(w.derivedFrom.edgeIndex).toBeGreaterThanOrEqual(0);
        }
    });

    it('the slab records the WHOLE ring, not one edge — edgeIndex is -1, never 0', () => {
        const p = ok();
        expect(p.slabs[0]!.derivedFrom.envelopeId).toBe('E-ground');
        expect(p.slabs[0]!.derivedFrom.edgeIndex).toBe(-1);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('readDesignEnvelopes — THE ONE LINE THAT WAS THE DEFECT', () => {
    const state = new Map<string, unknown>([
        ['a', { id: 'a', role: 'level', levelId: 'L0', name: 'Ground', baseOffset: 0, height: 3, footprintAreaM2: 120, footprint: PLATE.map((p) => ({ ...p, y: 0 })) }],
        ['b', { id: 'b', role: 'room', levelId: 'L0', name: 'Kitchen', withinId: 'a', baseOffset: 0, height: 2.7, footprintAreaM2: 20, footprint: rect(1, 1, 5, 6).map((p) => ({ ...p, y: 0 })) }],
        ['c', { id: 'c', role: 'maximumBuildable', levelId: 'L0', baseOffset: 0, height: 12, footprintAreaM2: 190, footprint: PLATE.map((p) => ({ ...p, y: 0 })) }],
        ['d', { id: 'd', notAnEnvelope: true }],
    ]);

    it('⭐ KEEPS `role:"room"` — this is exactly what `readLevelEnvelopes` drops at createHousePlan.ts:314', () => {
        const out = readDesignEnvelopes({ getState: () => state })!;
        expect(out.map((e) => e.id).sort()).toEqual(['a', 'b', 'c']);
        const room = out.find((e) => e.id === 'b')!;
        expect(room.role).toBe('room');
        expect(room.name).toBe('Kitchen');
        expect(room.withinId).toBe('a');
    });

    it('carries `maximumBuildable` through with its role intact, so a study can never be built as a plate', () => {
        const out = readDesignEnvelopes({ getState: () => state })!;
        expect(out.find((e) => e.id === 'c')!.role).toBe('maximumBuildable');
        // And the planner refuses it as a plate: a site with ONLY a study has no level envelope.
        const study = out.filter((e) => e.id === 'c');
        const r = planBuildFromDesign({ envelopes: study, activeLevelId: 'L0', authoredWallCountOnActiveLevel: 0 });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.refusal.code).toBe('no-level-envelope');
    });

    it('⛔ an absent or throwing store is NULL, never [] — the two get different refusals', () => {
        expect(readDesignEnvelopes(null)).toBeNull();
        expect(readDesignEnvelopes({} as never)).toBeNull();
        expect(readDesignEnvelopes({ getState: () => { throw new Error('boom'); } })).toBeNull();
        expect(readDesignEnvelopes({ getState: () => new Map() })).toEqual([]);
    });
});
