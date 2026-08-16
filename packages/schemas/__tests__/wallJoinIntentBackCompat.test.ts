// §PERSIST-JOININTENT BACK-COMPAT (L-927) — adding `joinIntent` to L0 broke no old snapshot.
//
// ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// `packages/schemas` is L0 and shared-dangerous: every element in every saved project
// parses through it. C47 §1.2 allows an ADDITIVE-OPTIONAL field without a MAJOR bump, and
// C75 §2.5 states the failure mode that discipline exists to prevent — *a new field that
// breaks old-data loading gets reverted, and the revert removes the field rather than
// fixing the migration*. For `joinIntent` a revert would be especially costly: L-923
// proved the value is UNRECOVERABLE once lost (no predicate over geometry, type, thickness
// or `createdAt` separates the founder's mitred-L-plus-newcomer from a legitimate
// collinear pass-through), so it cannot be back-filled later by a migration.
//
// ─── WHAT IS ASSERTED, AND WHY EACH ARM EXISTS ───────────────────────────────
//  0. the PRE-CHANGE record is itself valid — the FLOOR. Without it every arm below can
//     pass vacuously, which is the trap `elementProvenance.test.ts` names explicitly.
//  1. a pre-L-927 wall (no `joinIntent` key) still parses.
//  2. …and lands on ABSENT — never on a default. This one is the opposite of the
//     provenance rule and deliberately so: provenance defaults to an honest UNKNOWN
//     member, whereas `joinIntent` has no honest default, because the resolver branches on
//     PRESENCE. Defaulting would assert a gesture the author never made and would silently
//     change how every legacy corner renders.
//  3. the parse is stable across a JSON round trip — "parses existing snapshots unchanged"
//     has to survive SAVE, not just load.
//  4. a real recorded gesture survives the round trip intact — a field that defaults
//     correctly but cannot carry a value is decoration.
//  5. the vocabulary is closed: only 'butt' | 'through', and only at start/end.
//
// ⚠ NOT asserted here, stated so silence is not read as coverage: that the WRITE path
// emits the field. That is measured where it belongs — `WallCreateJoinIntentCensus`
// (serializers hard-0, all three loaders) and `WallJoinIntentChokepointPayoff` (the
// round-trip, with a negative control that shows the founder's mitre dying without it).

import { describe, it, expect } from 'vitest';
import { Wall } from '../src/elements/Wall.js';

/**
 * A wall EXACTLY as a pre-L-927 snapshot holds it — no `joinIntent` key at all.
 * These are the founder's two incumbent-L arms, at the geometry the resolver tests use.
 */
const PRE_CHANGE_WALL = {
    id: 'wall_01J0000000000000000000000A',
    type: 'wall' as const,
    levelId: 'L0',
    baseLine: [
        { x: 0, y: 0, z: 0 },
        { x: 5, y: 0, z: 0 },
    ],
    height: 3,
    thickness: 0.375,
    baseOffset: 0,
    openings: [],
    childrenIds: [],
};

describe('§PERSIST-JOININTENT BACK-COMPAT (L-927) — an old snapshot still parses', () => {

    it('FLOOR — the pre-change record is itself valid (without this, every arm below is vacuous)', () => {
        const r = Wall.safeParse(PRE_CHANGE_WALL);
        expect(r.success, r.success ? '' : JSON.stringify(r.error.issues, null, 2)).toBe(true);
    });

    it('a pre-L-927 wall — no joinIntent key — parses unchanged', () => {
        expect('joinIntent' in PRE_CHANGE_WALL).toBe(false);
        const r = Wall.safeParse(PRE_CHANGE_WALL);
        expect(r.success).toBe(true);
    });

    it('…and lands on ABSENT, never on a default — presence is what the resolver branches on', () => {
        // The compatibility promise in one assertion. `undefined` means "unknown / legacy",
        // and the resolver's behaviour for undefined is EXACTLY what it was before this
        // field existed. A default here would assert a gesture nobody made and would change
        // how every already-saved corner renders on its next load.
        const parsed = Wall.parse(PRE_CHANGE_WALL) as { joinIntent?: unknown };
        expect(parsed.joinIntent).toBeUndefined();
    });

    it('the parse is stable across a JSON round trip — save, not just load', () => {
        const once  = Wall.parse(PRE_CHANGE_WALL);
        const twice = Wall.parse(JSON.parse(JSON.stringify(once)));
        expect(twice).toEqual(once);
        expect((twice as { joinIntent?: unknown }).joinIntent).toBeUndefined();
    });

    it('a RECORDED gesture survives the round trip intact — the field is not decoration', () => {
        const stamped = { ...PRE_CHANGE_WALL, joinIntent: { start: 'butt' as const } };
        const parsed  = Wall.parse(stamped) as { joinIntent?: unknown };
        expect(parsed.joinIntent).toEqual({ start: 'butt' });

        const round = Wall.parse(JSON.parse(JSON.stringify(parsed))) as { joinIntent?: unknown };
        expect(round.joinIntent).toEqual({ start: 'butt' });

        // Both endpoints, both members of the vocabulary.
        const both = Wall.parse({
            ...PRE_CHANGE_WALL,
            joinIntent: { start: 'butt' as const, end: 'through' as const },
        }) as { joinIntent?: unknown };
        expect(both.joinIntent).toEqual({ start: 'butt', end: 'through' });
    });

    it('the vocabulary is CLOSED — an unknown intent is refused, not silently accepted', () => {
        // If this ever widens, a typo'd or invented intent reaches the resolver and decides
        // how a corner renders. `'mitre'` is the plausible wrong guess, so it is the probe.
        expect(Wall.safeParse({ ...PRE_CHANGE_WALL, joinIntent: { start: 'mitre' } }).success)
            .toBe(false);
        expect(Wall.safeParse({ ...PRE_CHANGE_WALL, joinIntent: { start: 'BUTT' } }).success)
            .toBe(false);
    });
});
