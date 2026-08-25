// §GEN-FACADE-OPENINGS (L-11080 · C108 Milestone 2, L-11006) — the IR's opening
// LATTICE becomes real windows, asserted against the corpus's KNOWN GROUND TRUTH.
//
// ⛔ THE RULE THIS FILE OBEYS (C108 §6.2): "no error thrown", "the array is
// non-empty" and "a plan was produced" are NOT assertions. Every `expect` below
// compares a computed value to a number the corpus generator DREW, or to a
// proportion this module derives from PRYZM's own opening geometry.
//
// ⚠ L-11001 STANDS. Case L is the founder's image CLASS — seven zones (six
// storeys + a five-arch arcade) x five bays — and it is SYNTHETIC. A green run
// here says what the algorithm does on a facade of that shape with known truth;
// it says nothing about his phone camera.

import { describe, expect, it } from 'vitest';

import { reconstructFacade } from '@pryzm/facade-reconstruction';
import { CASE_L_TRUTH, caseA, caseC, caseL } from '@pryzm/facade-reconstruction/testing';
import { SEGMENTAL_RISE_RATIO } from '@pryzm/geometry-wall';

import { mapFacadeIRToPhotoBrief } from '../src/intents/FacadePhotoBrief.js';
import { resolveUtterance, type ResolverContext, type ZeroTokenResolution } from '../src/intents/ZeroTokenResolver.js';
import {
    PROFILE_CANONICAL_ARCHNESS,
    extractFacadeOpeningProgram,
    mapStoreyToBand,
    planFacadeOpenings,
    resolveOpeningProfileFromArchness,
    type FacadeOpeningProgram,
} from '../src/intents/FacadeOpeningProgram.js';

// ─────────────────────────────────────────────────────────────────────────────
describe('§GEN-FACADE-OPENINGS — the lattice is EXTRACTED, not assumed', () => {
    it('case L recovers the DRAWN bay and band counts (5 bays, 7 zones)', async () => {
        const program = extractFacadeOpeningProgram((await reconstructFacade(caseL().image)).ir);
        expect(program).not.toBeNull();
        // ⭐ The two numbers the founder's photograph lost entirely: his run came
        // back 2 zones x 2 bays. These are the numbers the generator DREW.
        expect(program!.bays).toBe(CASE_L_TRUTH.bays);
        expect(program!.bands).toBe(CASE_L_TRUTH.zones);
    });

    it('case L carries an opening for MOST drawn openings, not four', async () => {
        const program = extractFacadeOpeningProgram((await reconstructFacade(caseL().image)).ir);
        // The drawn total is 35 (6 upper storeys x 5 bays + 5 arcade arches). The
        // engine is not asserted to find every one — it is asserted to find the
        // overwhelming majority, which is the difference between a facade and the
        // four cells his real run produced.
        expect(program!.cells.length).toBeGreaterThanOrEqual(Math.floor(CASE_L_TRUTH.totalOpenings * 0.8));
        expect(program!.cells.length).toBeLessThanOrEqual(CASE_L_TRUTH.totalOpenings);
    });

    it('band 0 is the GROUND band — C108 §2.1 has facade Y counting UP', async () => {
        const program = extractFacadeOpeningProgram((await reconstructFacade(caseL().image)).ir);
        const band0 = program!.cells.filter((c) => c.bandIndex === 0);
        const upper = program!.cells.filter((c) => c.bandIndex > 0);
        expect(band0.length).toBeGreaterThan(0);
        // ⭐⭐ THE ARCADE IS AT THE BOTTOM. Case L draws semicircular heads in the
        // arcade only, so the ground band's mean archness must exceed the upper
        // bands' by a wide margin. If Y were read top-down this inverts.
        const mean = (xs: readonly { archness: number }[]): number =>
            xs.reduce((a, c) => a + c.archness, 0) / xs.length;
        expect(mean(band0)).toBeGreaterThan(0.5);
        expect(mean(upper)).toBeLessThan(0.5);
    });

    it('every fraction is a RATIO in (0,1] — no length ever enters the program', async () => {
        const program = extractFacadeOpeningProgram((await reconstructFacade(caseL().image)).ir);
        for (const c of program!.cells) {
            expect(c.widthFraction).toBeGreaterThan(0);
            expect(c.widthFraction).toBeLessThanOrEqual(1);
            expect(c.heightFraction).toBeGreaterThan(0);
            expect(c.heightFraction).toBeLessThanOrEqual(1);
        }
        // The band heights are fractions of the facade height and together span it.
        const total = program!.bandHeightFractions.reduce((a, b) => a + b, 0);
        expect(total).toBeGreaterThan(0.8);
        expect(total).toBeLessThanOrEqual(1.0001);
    });

    it('refuses an image that does not read as a facade rather than inventing a lattice', async () => {
        // Case A is a facade, so invert the test: hand it an IR with one band.
        const ir = (await reconstructFacade(caseA().image)).ir;
        const oneBand = { ...ir, facade: { ...ir.facade, zones: ir.facade.zones.slice(0, 1) } };
        expect(extractFacadeOpeningProgram(oneBand)).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§GEN-FACADE-OPENINGS — archness maps to the EXISTING profile axis', () => {
    it("the segmental canonical archness IS PRYZM's own rise ratio, not a copy", () => {
        // ⭐ The whole anti-overfit argument in one assertion: re-proportion the
        // segmental arch in geometry-wall and this mapping follows it.
        expect(PROFILE_CANONICAL_ARCHNESS['segmental-arch']).toBeCloseTo(2 * SEGMENTAL_RISE_RATIO, 12);
        expect(PROFILE_CANONICAL_ARCHNESS['rectangular']).toBe(0);
        expect(PROFILE_CANONICAL_ARCHNESS['round-arch']).toBe(1);
    });

    it('a flat head (archness 0) stays rectangular', () => {
        expect(resolveOpeningProfileFromArchness(0, 1.4, 1.6, 0.9).kind).toBe('rectangular');
    });

    it('a semicircular head (archness ~1) becomes a round arch', () => {
        // The number the fixed engine reports on case L's arcade is 0.972.
        const r = resolveOpeningProfileFromArchness(0.972, 1.4, 2.6, 0.0);
        expect(r.kind).toBe('round-arch');
        expect(r.downgradedFrom).toBeUndefined();
    });

    it('a shallow head lands on the segmental arch', () => {
        const r = resolveOpeningProfileFromArchness(2 * SEGMENTAL_RISE_RATIO, 1.4, 2.0, 0.9);
        expect(r.kind).toBe('segmental-arch');
    });

    it('⛔ NEVER emits `circular` — that would require overwriting a measured width', () => {
        // A square opening with a fully arched head is the ONE case where a circle
        // is geometrically available; the mapping still refuses it, because
        // `openingProfileShapeRefusal` needs width === height to 1e-6 and the IR's
        // width and height are independent fits.
        for (const a of [0, 0.2, 0.33, 0.5, 0.8, 0.972, 1]) {
            expect(resolveOpeningProfileFromArchness(a, 1.5, 1.5, 0.9).kind).not.toBe('circular');
        }
    });

    it('⭐ steps DOWN through the profile gate rather than cutting a refused shape', () => {
        // A round arch needs at least half its width in height. 2.0 m wide and
        // 0.6 m tall cannot carry one — `openingProfileShapeRefusal` says so — so
        // the mapping must fall back AND say what it did.
        const r = resolveOpeningProfileFromArchness(1, 2.0, 0.6, 1.2);
        expect(r.kind).not.toBe('round-arch');
        expect(r.downgradedFrom).toBe('round-arch');
        expect(r.downgradeReason).toContain('half its width');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§GEN-FACADE-OPENINGS — the sentence sets the COUNT, the photo the RHYTHM', () => {
    it('anchors the ground band on the ground storey', () => {
        // His sentence said 5; his photograph shows 7. Storey 0 always reads band 0.
        expect(mapStoreyToBand(0, 5, 7)).toBe(0);
    });

    it('spreads 7 measured bands across 5 built storeys, monotonically', () => {
        const bands = [0, 1, 2, 3, 4].map((s) => mapStoreyToBand(s, 5, 7));
        expect(bands[0]).toBe(0);
        for (let i = 1; i < bands.length; i++) expect(bands[i]!).toBeGreaterThanOrEqual(bands[i - 1]!);
        expect(bands[bands.length - 1]).toBe(6);      // the top storey reads the top band
        expect(new Set(bands).size).toBeGreaterThan(1);
    });

    it('never indexes past the measured bands when MORE storeys are built than photographed', () => {
        for (let s = 0; s < 12; s++) {
            const b = mapStoreyToBand(s, 12, 3);
            expect(b).toBeGreaterThanOrEqual(0);
            expect(b).toBeLessThanOrEqual(2);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§GEN-FACADE-OPENINGS — metres come from the WALL, never from the image', () => {
    const program: FacadeOpeningProgram = {
        bays: 5,
        bands: 2,
        bandHeightFractions: [0.5, 0.5],
        cells: [0, 1, 2, 3, 4].map((bayIndex) => ({
            bayIndex, bandIndex: 0,
            widthFraction: 0.6, heightFraction: 0.8,
            archness: 0.972, confidence: 0.8,
        })),
        confidence: 0.8,
    };

    it('lays the DRAWN bay count on the principal (longest) run', () => {
        const plan = planFacadeOpenings({
            program,
            runs: [{ wallId: 'w-front', lengthM: 20 }],
            bandIndex: 0, storeyHeightM: 3.4, sillM: 0.01, cornerMarginM: 0.9,
        });
        expect(plan.baysPerRun.find((b) => b.wallId === 'w-front')!.bays).toBe(5);
        expect(plan.openings.filter((o) => o.wallId === 'w-front')).toHaveLength(5);
    });

    it('⭐ preserves the measured PITCH on a shorter return wall instead of squeezing 5 bays into it', () => {
        const plan = planFacadeOpenings({
            program,
            runs: [{ wallId: 'w-front', lengthM: 20 }, { wallId: 'w-side', lengthM: 9 }],
            bandIndex: 0, storeyHeightM: 3.4, sillM: 0.01, cornerMarginM: 0.9,
        });
        // usable front = 20 − 1.8 = 18.2 ⇒ pitch 3.64. usable side = 9 − 1.8 = 7.2
        // ⇒ floor(7.2 / 3.64) = 1 whole bay at the SAME pitch.
        expect(plan.baysPerRun.find((b) => b.wallId === 'w-side')!.bays).toBe(1);
    });

    it('sizes every opening from the wall length and the storey height, at the measured fractions', () => {
        const plan = planFacadeOpenings({
            program,
            runs: [{ wallId: 'w', lengthM: 20 }],
            bandIndex: 0, storeyHeightM: 3.4, sillM: 0.01, cornerMarginM: 0.9,
        });
        const bayW = (20 - 1.8) / 5;
        for (const o of plan.openings) {
            expect(o.width).toBeCloseTo(bayW * 0.6, 6);           // widthFraction x bay width
            expect(o.height).toBeCloseTo(3.4 * 0.8, 6);           // heightFraction x storey height
            expect(o.sillHeight).toBe(0.01);                       // the GENERATOR's sill, not the photo's
        }
    });

    it('⛔ never runs an opening past a corner, at either end', () => {
        const plan = planFacadeOpenings({
            program,
            runs: [{ wallId: 'w', lengthM: 20 }],
            bandIndex: 0, storeyHeightM: 3.4, sillM: 0.01, cornerMarginM: 0.9,
        });
        for (const o of plan.openings) {
            expect(o.offset).toBeGreaterThanOrEqual(0.9 - 1e-9);
            expect(o.offset + o.width).toBeLessThanOrEqual(20 - 0.9 + 1e-9);
        }
    });

    it('⭐ the arcade band comes out ARCHED — the profile reaches the buildable spec', () => {
        const plan = planFacadeOpenings({
            program,
            runs: [{ wallId: 'w', lengthM: 20 }],
            bandIndex: 0, storeyHeightM: 3.4, sillM: 0.01, cornerMarginM: 0.9,
        });
        expect(plan.openings.every((o) => o.openingProfile === 'round-arch')).toBe(true);
    });

    it('NAMES a run it left solid instead of dropping it silently', () => {
        const plan = planFacadeOpenings({
            program,
            runs: [{ wallId: 'w-front', lengthM: 20 }, { wallId: 'w-stub', lengthM: 2.4 }],
            bandIndex: 0, storeyHeightM: 3.4, sillM: 0.01, cornerMarginM: 0.9,
        });
        expect(plan.baysPerRun.find((b) => b.wallId === 'w-stub')!.bays).toBe(0);
        expect(plan.notBuilt.join(' ')).toContain('left solid');
    });

    it('is DETERMINISTIC — the same input yields byte-identical output (C108 §5.2)', () => {
        const input = {
            program,
            runs: [{ wallId: 'b', lengthM: 12 }, { wallId: 'a', lengthM: 12 }],
            bandIndex: 0, storeyHeightM: 3.4, sillM: 0.01, cornerMarginM: 0.9,
        };
        expect(JSON.stringify(planFacadeOpenings(input))).toBe(JSON.stringify(planFacadeOpenings(input)));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§GEN-FACADE-OPENINGS — end to end on the founder\'s image CLASS', () => {
    it('⭐⭐ case L: the arcade band plans FIVE ARCHED openings on a real footprint', async () => {
        const program = extractFacadeOpeningProgram((await reconstructFacade(caseL().image)).ir);
        expect(program).not.toBeNull();
        const plan = planFacadeOpenings({
            program: program!,
            // A 24 m frontage — a metre value from a FOOTPRINT, which is the only
            // place a metre may come from (C108 §2.2, L-11009).
            runs: [{ wallId: 'ground-front', lengthM: 24 }],
            bandIndex: mapStoreyToBand(0, 5, program!.bands),
            storeyHeightM: 4.0, sillM: 0.01, cornerMarginM: 0.9,
        });
        expect(plan.openings).toHaveLength(CASE_L_TRUTH.bays);
        // ⭐⭐ THE FOUNDER'S ARCADE. Zero arches survived his run; five arrive here.
        expect(plan.openings.filter((o) => o.openingProfile === 'round-arch')).toHaveLength(CASE_L_TRUTH.arcadeOpenings);
    });

    it('an UPPER band plans FLAT heads on the same building — the arcade is not smeared upward', async () => {
        const program = extractFacadeOpeningProgram((await reconstructFacade(caseL().image)).ir);
        const plan = planFacadeOpenings({
            program: program!,
            runs: [{ wallId: 'l3-front', lengthM: 24 }],
            bandIndex: mapStoreyToBand(3, 5, program!.bands),
            storeyHeightM: 3.0, sillM: 0.9, cornerMarginM: 0.9,
        });
        expect(plan.openings.length).toBeGreaterThan(0);
        expect(plan.openings.every((o) => o.openingProfile === 'rectangular')).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⭐⭐ REACHABILITY. [[committed-is-not-reachable]] — a pure function that returns
// the right object proves NOTHING if no payload ever carries it. The founder's
// building came out a plain white box while `mapFacadeIRToPhotoBrief` was already
// green, because the CHANNEL stopped at four booleans. These assertions are about
// the channel.
describe('§GEN-FACADE-OPENINGS — the lattice REACHES the generation payload', () => {
    let seq = 0;
    const ctxWithPhoto = (photoFacade: ReturnType<typeof mapFacadeIRToPhotoBrief>): ResolverContext => ({
        selection: [],
        levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }],
        activeLevelId: 'L0',
        mintId: () => `m2-${++seq}`,
        photoFacade,
    });
    const payloadOf = (r: ZeroTokenResolution): Record<string, unknown> => {
        if (r.kind !== 'commands') throw new Error(`expected commands, got "${r.kind}"`);
        const cmd = r.commands.find((c) => c.type === 'generation.building');
        if (cmd === undefined) throw new Error('no generation.building command');
        return cmd.payload as Record<string, unknown>;
    };
    /** The founder's sentence, verbatim from the brief that opened this lane. */
    const SENTENCE = 'GENERATE 5-STOREY RESIDENTIAL BUILDING WITH THE FACADE AS PER THE ATTACHED PHOTO';

    it('⭐⭐ carries `facadeOpeningProgram` on the generation.building payload', async () => {
        const brief = mapFacadeIRToPhotoBrief(await reconstructFacade(caseL().image));
        const payload = payloadOf(resolveUtterance(SENTENCE, ctxWithPhoto(brief)));
        const program = payload['facadeOpeningProgram'] as FacadeOpeningProgram | undefined;
        expect(program).toBeDefined();
        // The numbers the corpus generator DREW, arriving at the executor's door.
        expect(program!.bays).toBe(CASE_L_TRUTH.bays);
        expect(program!.bands).toBe(CASE_L_TRUTH.zones);
        expect(program!.cells.length).toBeGreaterThan(4);
    });

    it('⭐ THE SENTENCE STILL WINS ON COUNT — 5 storeys asked, 7 bands measured', async () => {
        const brief = mapFacadeIRToPhotoBrief(await reconstructFacade(caseL().image));
        const payload = payloadOf(resolveUtterance(SENTENCE, ctxWithPhoto(brief)));
        // He typed FIVE. The photograph shows SEVEN. The existing precedence is
        // reused, not re-decided: the payload's storey count is the sentence's, and
        // the lattice rides alongside it as RHYTHM.
        expect(payload['floors']).toBe(5);
        expect((payload['facadeOpeningProgram'] as FacadeOpeningProgram).bands).toBe(CASE_L_TRUTH.zones);
    });

    it('⛔ omits the lattice entirely when no photograph was attached', () => {
        const ctx: ResolverContext = {
            selection: [], levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }],
            activeLevelId: 'L0', mintId: () => `m2-${++seq}`,
        };
        const payload = payloadOf(resolveUtterance(SENTENCE, ctx));
        expect(payload['facadeOpeningProgram']).toBeUndefined();
    });

    it('⛔ NAMES the upper floors as NOT built from the photo, before he confirms', async () => {
        const brief = mapFacadeIRToPhotoBrief(await reconstructFacade(caseL().image));
        expect(brief.openings).not.toBeNull();
        // Only the GROUND storey is laid out from the measured lattice today. Claiming
        // the whole elevation while building one storey of it is the silent-half-success
        // C108 §0.3 exists to stop.
        expect(brief.notUsed.join(' ')).toContain('UPPER-floor window rhythm');
        // And the sill, which the IR cannot supply at all (C108 §1.1 — no x/y).
        expect(brief.notUsed.join(' ')).toContain('sill height');
    });
});
