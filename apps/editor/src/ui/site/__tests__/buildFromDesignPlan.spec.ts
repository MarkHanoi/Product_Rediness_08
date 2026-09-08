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
    roomSetOutcomeSentence,
    BUILD_FROM_DESIGN_WILL_NOT_CREATE,
    type BuildFromDesignInput,
    type BuildFromDesignPlan,
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

    it('⭐ the ONE storey it builds is the plate\'s OWN level, not whichever level is active', () => {
        // ⛔ THE DEFECT, AT ITS SMALLEST. The pass used to seat everything on `activeLevelId`
        // regardless of which storey the plate named, so the geometry could land on the wrong
        // floor and the run still reported success (it was an advisory, never a refusal).
        const p = ok({ activeLevelId: 'L-SOMEWHERE-ELSE' });
        expect(p.storeys).toHaveLength(1);
        expect(p.storeys[0]!.levelId).toBe('L0');            // GROUND's own levelId
        expect(p.storeys[0]!.levelIdSource).toBe('plate');
        expect(p.walls.every((w) => w.levelId === 'L0')).toBe(true);
        expect(p.slabs.every((sl) => sl.levelId === 'L0')).toBe(true);
        expect(p.ceilings.every((c) => c.levelId === 'L0')).toBe(true);
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

    it('⛔ says the undo cost is THREE steps, and the number is COMPUTED, not asserted', () => {
        // C16 §8.6 B-6 — the honest count is printed before the click, and it is one entry per
        // batch this plan actually dispatches: walls, slabs, ceilings.
        expect(ok().undoStepCount).toBe(3);
        expect(ok().advisories.join(' ')).toContain('Undo takes 3 steps');
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
            .toContain('2 room edges lie on their level envelope\'s perimeter');
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
            .toContain('1 boundary shared between two rooms on the same storey became ONE partition');
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

    it('⭐ two plates at one height with the SAME area ALSO refuse — the silent drop is closed', () => {
        // ⛔ THIS USED TO FALL THROUGH. The rivalry test was `area differs by > 0.5 m²`, so two
        // identical plates at one elevation produced no refusal at all and only `sortedLevels[0]`
        // was built — the second authored building dropped with nothing but an advisory.
        // §CONTEXT-DATA-HONESTY: a cap that drops something says so, with numbers.
        const twin = env({
            id: 'E-twin', role: 'level', name: 'Garage', footprint: PLATE, footprintAreaM2: 190.23,
        });
        const r = refusal({ envelopes: [GROUND, twin, ...SIX_ROOMS] });
        expect(r.code).toBe('ambiguous-ground-plate');
        expect(r.text).toContain('Garage');
        expect(r.text).toContain('Ground envelope');
        expect(r.text).toContain('Nothing has been created');
    });

    it('⛔ two storeys that resolve to ONE project level refuse rather than stacking', () => {
        // Different elevations, same project level: the second would land on top of the first at
        // the same world height and the run would report success.
        const upper = env({
            id: 'E-upper', role: 'level', name: 'First floor', levelId: 'L0',
            baseOffset: 3, footprint: PLATE, footprintAreaM2: 190.23,
        });
        const r = refusal({ envelopes: [GROUND, upper, ...SIX_ROOMS] });
        expect(r.code).toBe('storeys-share-a-level');
        expect(r.text).toContain('both build on project level "L0"');
        expect(r.text).toContain('Nothing has been created');
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
// ⭐ DEFECT A — THE REFUSAL STOPPED CONTRADICTING ITSELF
//
// It opened *"None of the 7 room envelopes … can be built"* and then said, for EVERY SINGLE ONE,
// *"This room was not built; the others were."* The literal appeared FIVE times in the module and
// was concatenated into the all-fail refusal, so the founder read one true sentence followed by
// seven false ones — and was told to *"Fix or delete the named room envelopes"* while being told
// the rest had succeeded, which misdirected the repair.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const BANNED = 'the others were';

/** Every sentence this planner can put in front of a user, for one input. */
const allProse = (out: ReturnType<typeof planBuildFromDesign>): string => (
    out.ok
        ? [
            ...out.plan.advisories,
            ...out.plan.willCreate,
            ...out.plan.willNotCreate,
            ...out.plan.refusedRooms.map((r) => r.text),
            ...out.plan.refusedStoreys.map((r) => r.text),
        ].join(' ')
        : out.refusal.text
);

describe('DEFECT A — the set-level clause has ONE producer and is true in all three cases', () => {
    it('⛔ NONE-FAIL: no sentence anywhere claims anything about "the others"', () => {
        const out = planBuildFromDesign(input());
        expect(out.ok).toBe(true);
        expect(allProse(out)).not.toContain(BANNED);
        // …and nothing asserts a refusal that did not happen.
        expect(allProse(out)).not.toContain('cannot be built');
    });

    it('⛔ SOME-FAIL: the set sentence is said ONCE, and no per-room text asserts it', () => {
        const bad = env({
            id: 'R-line', role: 'room', name: 'Hall', withinId: 'E-ground',
            footprint: [{ x: 2, z: 8 }, { x: 6, z: 8 }], footprintAreaM2: 0,
        });
        const out = planBuildFromDesign(input({ envelopes: [GROUND, SIX_ROOMS[0]!, bad] }));
        if (!out.ok) throw new Error('expected a plan');
        expect(allProse(out)).not.toContain(BANNED);
        for (const r of out.plan.refusedRooms) expect(r.text).not.toContain(BANNED);
        const set = out.plan.advisories.filter((a) => a.includes('cannot be built'));
        expect(set).toHaveLength(1);
        expect(set[0]).toContain('1 of your 2 room envelopes cannot be built');
        expect(set[0]).toContain('The rest still build');
    });

    it('⛔ ALL-FAIL: it says NONE were built and never claims the others were', () => {
        const tiny = (id: string) => env({
            id, role: 'room', name: id, withinId: 'E-ground',
            footprint: rect(0, 0, 0.4, 0.4), footprintAreaM2: 0.16,
        });
        const out = planBuildFromDesign(input({ envelopes: [GROUND, tiny('R-x'), tiny('R-y')] }));
        if (out.ok) throw new Error('expected a refusal');
        expect(out.refusal.text).toContain('None of the 2 room envelopes you drew can be built');
        expect(out.refusal.text).not.toContain(BANNED);
        expect(out.refusal.text).not.toContain('The rest still build');
    });

    it('the ONE producer answers all three cases and disagrees with none of them', () => {
        expect(roomSetOutcomeSentence(0, 7)).toContain('Every one of your 7 room envelopes will be built');
        expect(roomSetOutcomeSentence(3, 7)).toContain('3 of your 7 room envelopes cannot be built');
        expect(roomSetOutcomeSentence(3, 7)).toContain('The rest still build');
        expect(roomSetOutcomeSentence(7, 7)).toBe('None of the 7 room envelopes you drew can be built.');
        // ⛔ It never claims an exception in the all-fail case, which is the whole defect.
        expect(roomSetOutcomeSentence(7, 7)).not.toContain(BANNED);
        expect(roomSetOutcomeSentence(7, 7)).not.toContain('rest');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE FOUNDER'S TWO REPRODUCTIONS — BOTH OF THEM, TO HIS NUMBERS
//
// A — 7 rooms, all on "Level envelope · Level 4 · 366 m²" at 12 m.
// B — 8 rooms, all on "Level envelope · Level 1 · 92 m²" at 3 m.
// Different design, different storey, different area, THE SAME TOTAL REFUSAL — which is what
// proved the pin was structural (`const ground = sortedLevels[0]!`) and not design-specific.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
/** Five storeys, exactly as `envelopeAuthoringPlan` mints them: one plate per project level. */
const stack = (areaRing: DesignVertex[], areaM2: number): DesignEnvelopeDatum[] =>
    [0, 1, 2, 3, 4].map((i) => env({
        id: `E-L${i}`,
        levelId: i === 0 ? 'L0' : `L${i}-abc`,
        role: 'level',
        name: `Level envelope · ${i === 0 ? 'Ground' : `Level ${i}`} · ${areaM2.toFixed(0)} m²`,
        baseOffset: i * 3,
        height: 3,
        footprint: areaRing,
        footprintAreaM2: areaM2,
    }));

describe("INSTANCE A — 7 rooms on Level 4 at 12 m, the storey he was refused on", () => {
    const RING = rect(0, 0, 20, 18.3);          // 366 m²
    const NAMES = ['Living', 'Kitchen', 'Ensuite', 'Bedroom', 'Bathroom', 'Hall', 'Stair'];
    const roomsOnL4 = NAMES.map((n, i) => env({
        id: `R-${i}`, levelId: 'L4-abc', role: 'room', name: n, withinId: 'E-L4',
        baseOffset: 12, height: 3,
        footprint: rect(1 + i * 2.5, 1, 3.4 + i * 2.5, 5), footprintAreaM2: 9.6,
    }));

    const plan = (): BuildFromDesignPlan => {
        const out = planBuildFromDesign({
            envelopes: [...stack(RING, 366), ...roomsOnL4],
            activeLevelId: 'L4-abc',
            authoredWallCountOnActiveLevel: 0,
            authoredWallCountByLevelId: { L0: 0, 'L1-abc': 0, 'L2-abc': 0, 'L3-abc': 0, 'L4-abc': 0 },
        });
        if (!out.ok) throw new Error(`expected a plan, got ${out.refusal.code}: ${out.refusal.text}`);
        return out.plan;
    };

    it('⭐ IT BUILDS. Nothing is refused, and all 7 rooms land on Level 4 — not on Ground', () => {
        const p = plan();
        expect(p.refusedRooms).toHaveLength(0);
        expect(p.refusedStoreys).toHaveLength(0);
        expect(p.rooms).toHaveLength(7);
        expect(p.rooms.every((r) => r.levelId === 'L4-abc')).toBe(true);
        expect(p.storeys).toHaveLength(5);
        expect(p.storeyCount).toBe(5);
    });

    it('⭐ every storey gets a shell and a slab, each on its OWN project level', () => {
        const p = plan();
        expect(p.shellWallCount).toBe(20);                       // 4 edges × 5 storeys
        expect(p.slabs).toHaveLength(5);
        expect(p.slabs.map((sl) => sl.levelId).sort())
            .toEqual(['L0', 'L1-abc', 'L2-abc', 'L3-abc', 'L4-abc']);
        // ⛔ Each slab sits at its own storey's datum. World Y comes from the level elevation.
        expect(p.slabs.every((sl) => sl.baseOffsetM === 0)).toBe(true);
        for (const st of p.storeys) {
            const shell = p.walls.filter((w) => w.kind === 'shell' && w.storeyIndex === st.index);
            expect(shell).toHaveLength(4);
            expect(shell.every((w) => w.levelId === st.levelId)).toBe(true);
        }
    });

    it('⛔ the partitions land on Level 4 and NOWHERE ELSE — the empty storeys stay empty', () => {
        const p = plan();
        const partitions = p.walls.filter((w) => w.kind === 'partition');
        expect(partitions.length).toBeGreaterThan(0);
        expect(partitions.every((w) => w.levelId === 'L4-abc')).toBe(true);
        expect(p.storeys.filter((st) => st.partitionWallCount > 0)).toHaveLength(1);
    });

    it('⛔ THE SENTENCE THAT WAS FALSE IS GONE — no refusal blames a missing level', () => {
        const p = plan();
        const prose = [...p.advisories, ...p.willCreate, ...p.willNotCreate].join(' ');
        expect(prose).not.toContain('need levels PRYZM does not create here');
        expect(prose).not.toContain('builds only the ground plate');
        expect(prose).not.toContain(BANNED);
        // …and it says the true thing instead.
        expect(prose).toContain('No NEW project level is created');
    });

    it('⛔ THE UNDO COST DOES NOT GROW WITH THE BUILDING — 5 storeys still cost 3 steps', () => {
        expect(plan().undoStepCount).toBe(3);
    });
});

describe('INSTANCE B — 8 rooms on Level 1 at 3 m, a different design and the same old failure', () => {
    const RING = rect(0, 0, 10, 9.2);           // 92 m²
    const NAMES = ['Corridor', 'Kitchen', 'Dining', 'Hall', 'Stair', 'Living', 'Bathroom', 'Bedroom'];
    const roomsOnL1 = NAMES.map((n, i) => env({
        id: `R-${i}`, levelId: 'L1-abc', role: 'room', name: n, withinId: 'E-L1',
        baseOffset: 3, height: 3,
        footprint: rect(0.5 + (i % 4) * 2.2, 0.5 + Math.floor(i / 4) * 4, 2.4 + (i % 4) * 2.2,
            3.9 + Math.floor(i / 4) * 4),
        footprintAreaM2: 6.46,
    }));

    it('⭐ IT BUILDS, and all 8 rooms land on Level 1', () => {
        const out = planBuildFromDesign({
            envelopes: [...stack(RING, 92), ...roomsOnL1],
            activeLevelId: 'L1-abc',
            authoredWallCountOnActiveLevel: 0,
            authoredWallCountByLevelId: { L0: 0, 'L1-abc': 0, 'L2-abc': 0, 'L3-abc': 0, 'L4-abc': 0 },
        });
        if (!out.ok) throw new Error(`expected a plan, got ${out.refusal.code}: ${out.refusal.text}`);
        expect(out.plan.refusedRooms).toHaveLength(0);
        expect(out.plan.rooms).toHaveLength(8);
        expect(out.plan.rooms.every((r) => r.levelId === 'L1-abc')).toBe(true);
        expect(out.plan.storeyCount).toBe(5);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('MULTI-STOREY — a real stacked design, and the reductions that must NOT cross floors', () => {
    const RING = rect(0, 0, 12, 10);
    const PLATES = [0, 1].map((i) => env({
        id: `E-L${i}`, levelId: `LV${i}`, role: 'level', name: `Plate ${i}`,
        baseOffset: i * 3.2, height: 3.2, footprint: RING, footprintAreaM2: 120,
    }));
    /** ⛔ IDENTICAL RINGS ON TWO FLOORS — a stacked plan is the ordinary case, not an edge case. */
    const twinRooms = [0, 1].flatMap((lvl) => (
        [['a', 1, 1, 5, 5], ['b', 5, 1, 9, 5]].map(([suffix, x0, z0, x1, z1]) => env({
            id: `R-${lvl}-${suffix as string}`, levelId: `LV${lvl}`, role: 'room',
            name: `Room ${suffix as string} L${lvl}`, withinId: `E-L${lvl}`,
            baseOffset: lvl * 3.2, height: 3.2,
            footprint: rect(x0 as number, z0 as number, x1 as number, z1 as number),
            footprintAreaM2: 16,
        }))
    ));

    const twoStorey = () => {
        const out = planBuildFromDesign({
            envelopes: [...PLATES, ...twinRooms],
            activeLevelId: 'LV0',
            authoredWallCountOnActiveLevel: 0,
            authoredWallCountByLevelId: { LV0: 0, LV1: 0 },
        });
        if (!out.ok) throw new Error(`expected a plan, got ${out.refusal.code}: ${out.refusal.text}`);
        return out.plan;
    };

    it('⛔ THE SHARED-BOUNDARY MERGE NEVER CROSSES A STOREY', () => {
        // Rooms a and b share one boundary ON EACH FLOOR. Two merges, not one — merging across
        // floors would put the upper floor's partitions on the ground floor and leave the upper
        // floor open, which is invisible in a viewport until you section it.
        const p = twoStorey();
        expect(p.dedupedPartitionCount).toBe(2);
        expect(p.partitionWallCount).toBe(14);           // (8 room edges − 1 merged) × 2 floors
        for (const st of p.storeys) {
            expect(st.partitionWallCount).toBe(7);
        }
    });

    it('⛔ THE SHELL-COINCIDENCE DROP IS ALSO PER STOREY', () => {
        const p = twoStorey();
        expect(p.droppedOnShellCount).toBe(0);           // these rooms are inset from the perimeter
        expect(p.walls.filter((w) => w.kind === 'shell')).toHaveLength(8);
    });

    it('each storey takes its OWN floor-to-floor, not the lowest plate\'s', () => {
        const tall = env({
            id: 'E-L1', levelId: 'LV1', role: 'level', name: 'Tall plate',
            baseOffset: 3.2, height: 5, footprint: RING, footprintAreaM2: 120,
        });
        const out = planBuildFromDesign({
            envelopes: [PLATES[0]!, tall, ...twinRooms],
            activeLevelId: 'LV0',
            authoredWallCountOnActiveLevel: 0,
            authoredWallCountByLevelId: { LV0: 0, LV1: 0 },
        });
        if (!out.ok) throw new Error('expected a plan');
        expect(out.plan.storeys[0]!.floorToFloorM).toBe(3.2);
        expect(out.plan.storeys[1]!.floorToFloorM).toBe(5);
        expect(out.plan.walls.filter((w) => w.storeyIndex === 0).every((w) => w.heightM === 3.2)).toBe(true);
        expect(out.plan.walls.filter((w) => w.storeyIndex === 1).every((w) => w.heightM === 5)).toBe(true);
    });

    it('⛔ C80 IS ASKED PER STOREY — a floor already built is skipped, the empty one still builds', () => {
        const out = planBuildFromDesign({
            envelopes: [...PLATES, ...twinRooms],
            activeLevelId: 'LV0',
            authoredWallCountOnActiveLevel: 0,
            authoredWallCountByLevelId: { LV0: 0, LV1: 41 },
        });
        if (!out.ok) throw new Error(`expected a plan, got ${out.refusal.code}`);
        const p = out.plan;
        expect(p.storeyCount).toBe(1);
        expect(p.storeys[0]!.levelId).toBe('LV0');
        expect(p.refusedStoreys).toHaveLength(1);
        expect(p.refusedStoreys[0]!.code).toBe('already-built');
        expect(p.refusedStoreys[0]!.text).toContain('41 authored walls');
        // ⭐ The rooms on the protected floor are refused BY NAME, carrying the PLATE'S reason —
        // never a reason of their own that is not the reason.
        expect(p.refusedRooms).toHaveLength(2);
        expect(p.refusedRooms.every((r) => r.code === 'within-not-on-the-built-plate')).toBe(true);
        expect(p.refusedRooms[0]!.text).toContain('41 authored walls');
        expect(p.refusedRooms[0]!.text).not.toContain(BANNED);
    });

    it('⛔ and when EVERY storey is already built, the whole gesture refuses', () => {
        const out = planBuildFromDesign({
            envelopes: [...PLATES, ...twinRooms],
            activeLevelId: 'LV0',
            authoredWallCountOnActiveLevel: 0,
            authoredWallCountByLevelId: { LV0: 12, LV1: 41 },
        });
        if (out.ok) throw new Error('expected a refusal');
        expect(out.refusal.code).toBe('already-built');
        expect(out.refusal.text).toContain('12 authored walls');
        expect(out.refusal.text).toContain('41 authored walls');
        expect(out.refusal.text).toContain('Nothing has been created');
    });

    it('⛔ a plate whose ring is degenerate refuses THAT STOREY, and the good one still builds', () => {
        const broken = env({
            id: 'E-L1', levelId: 'LV1', role: 'level', name: 'Broken plate',
            baseOffset: 3.2, height: 3.2, footprint: [{ x: 0, z: 0 }, { x: 1, z: 0 }], footprintAreaM2: 0,
        });
        const out = planBuildFromDesign({
            envelopes: [PLATES[0]!, broken, ...twinRooms],
            activeLevelId: 'LV0',
            authoredWallCountOnActiveLevel: 0,
            authoredWallCountByLevelId: { LV0: 0, LV1: 0 },
        });
        if (!out.ok) throw new Error(`expected a plan, got ${out.refusal.code}`);
        expect(out.plan.storeyCount).toBe(1);
        expect(out.plan.refusedStoreys[0]!.code).toBe('degenerate-plate-ring');
        expect(out.plan.refusedStoreys[0]!.text).toContain('2 vertices');
        // The rooms on it are named, carrying the plate's own reason.
        expect(out.plan.refusedRooms).toHaveLength(2);
        expect(out.plan.refusedRooms[0]!.text).toContain('2 vertices');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('CEILINGS — one per room the user drew, at its storey\'s CLEAR height', () => {
    it('⭐ one ceiling per built room, on the room\'s own storey', () => {
        const p = ok();
        expect(p.ceilings).toHaveLength(6);
        expect(p.ceilings.every((c) => c.levelId === 'L0')).toBe(true);
        expect(p.ceilings.every((c) => c.boundary.length === 4)).toBe(true);
        expect(p.ceilings.map((c) => c.derivedFrom.envelopeId).sort())
            .toEqual(['R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
    });

    it('⛔ NOT the raw floor-to-floor — the resi pipeline\'s clear-height solver decides it', () => {
        // 3.0 m ftf − 0.6 m service zone = 2.4 m. Passing the ftf verbatim is the exact defect
        // §RESI-CEILING-CLEARHEIGHT was written to remove, and this pass must not re-commit it.
        const p = ok();
        expect(p.floorToFloorM).toBe(3);
        expect(p.ceilings[0]!.ceilingHeightM).toBeCloseTo(2.4, 6);
        expect(p.ceilings.every((c) => c.ceilingHeightM < p.floorToFloorM)).toBe(true);
        // `CreateCeilingBatchHandler` throws when thickness >= ceilingHeight.
        expect(p.ceilings.every((c) => c.thicknessM < c.ceilingHeightM)).toBe(true);
    });

    it('a ceiling derives from the WHOLE room ring — edgeIndex is -1, never 0', () => {
        expect(ok().ceilings.every((c) => c.derivedFrom.edgeIndex === -1)).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('⛔ WHAT IT WILL NOT CREATE — named precisely, so the button never over-claims', () => {
    it('names the ROOF and says WHY: no envelope carries a roof form', () => {
        const joined = BUILD_FROM_DESIGN_WILL_NOT_CREATE.join(' ');
        expect(joined).toContain('a ROOF');
        expect(joined).toContain('no shape, pitch or overhang field');
    });

    it('names FLOOR FINISHES and says WHY: no batch verb, and the spec needs room records', () => {
        const joined = BUILD_FROM_DESIGN_WILL_NOT_CREATE.join(' ');
        expect(joined).toContain('FLOOR FINISHES');
        expect(joined).toContain('no `floor.batch.create`');
    });

    it('⛔ names the STAIR and the SOLID SLAB OVER IT — the failure that would look finished', () => {
        const joined = BUILD_FROM_DESIGN_WILL_NOT_CREATE.join(' ');
        expect(joined).toContain('STAIRS');
        expect(joined).toContain('solid plate above it');
    });

    it('⛔ it no longer claims it cannot reach upper storeys — that sentence was false', () => {
        expect(BUILD_FROM_DESIGN_WILL_NOT_CREATE.join(' '))
            .not.toContain('single storey needs none');
        expect(BUILD_FROM_DESIGN_WILL_NOT_CREATE.join(' ')).toContain('new project levels');
    });

    it('⭐ and CEILINGS are NOT on the will-not list, because they are now built', () => {
        const joined = BUILD_FROM_DESIGN_WILL_NOT_CREATE.join(' ').toLowerCase();
        expect(joined).not.toContain('ceilings —');
        expect(ok().ceilings.length).toBeGreaterThan(0);
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
        // ⛔ AND IT SAYS NOTHING ABOUT THE OTHER ROOMS. See the DEFECT A block.
        expect(p.refusedRooms[0]!.text).not.toContain('the others were');
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
        const upper = env({ id: 'E-upper', levelId: 'L1', role: 'level', name: 'First floor', baseOffset: 3, footprint: PLATE, footprintAreaM2: 190.23 });
        const floating = env({
            id: 'R-float', role: 'room', name: 'Bedroom', withinId: null,
            footprint: rect(2, 8, 6, 11), footprintAreaM2: 12,
        });
        const p = ok({ envelopes: [GROUND, upper, good, floating] });
        expect(p.refusedRooms[0]!.code).toBe('within-ambiguous');
        expect(p.refusedRooms[0]!.text).toContain('does not declare which level envelope');
        expect(p.rooms).toHaveLength(1);
    });

    it('⭐ A ROOM ON THE UPPER PLATE IS BUILT — this was the founder\'s defect, inverted', () => {
        // ⛔ THIS TEST USED TO ASSERT THE DEFECT. It read *"a room on the UPPER plate is refused
        // with both heights — this pass builds the ground plate"* and pinned the refusal that
        // rejected 7 of the founder's 7 rooms in instance A and 8 of 8 in instance B. It is
        // REWRITTEN to assert the new truth, not deleted: the arm still exists, and the block
        // above pins what it now means.
        const upper = env({ id: 'E-upper', levelId: 'L1', role: 'level', name: 'First floor', baseOffset: 3, height: 3, footprint: PLATE, footprintAreaM2: 190.23 });
        const above = env({
            id: 'R-above', levelId: 'L1', role: 'room', name: 'Bedroom', withinId: 'E-upper',
            baseOffset: 3, footprint: rect(2, 8, 6, 11), footprintAreaM2: 12,
        });
        const p = ok({
            envelopes: [GROUND, upper, good, above],
            authoredWallCountByLevelId: { L0: 0, L1: 0 },
        });
        expect(p.refusedRooms).toHaveLength(0);
        expect(p.storeyCount).toBe(2);
        const bedroom = p.rooms.find((r) => r.envelopeId === 'R-above');
        expect(bedroom).toBeDefined();
        expect(bedroom!.levelId).toBe('L1');
        expect(p.walls.some((w) => w.kind === 'partition' && w.levelId === 'L1')).toBe(true);
        expect(p.advisories.join(' ')).not.toContain('builds only the');
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
