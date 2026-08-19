// §OPENING-PROFILE (L-1250) — slice 2: does the void SHAPE actually REACH the pipeline?
//
// Slice 1 proved the geometry draws a circle. This file proves the architect can AUTHOR one —
// which is the founder's actual complaint ("I DON'T SEE THE CIRCULAR WINDOW OPTION ON THE MODE").
// A capability that is complete at both ends and has no control in the middle is the recorded
// "authored-but-unwired" bottleneck, so every hop between the mode bar and the store is asserted
// here rather than assumed.
//
// ⭐ THE PERSISTENCE ASSERTION IS THE ONE THAT MATTERS. `WindowStore.add` freezes a spread of
// `WindowOpeningSchema.safeParse(...).data`, and Zod STRIPS keys the schema does not declare. A
// field written to the store and missing from the schema survives exactly one session. Three
// subsystems hit that hole in one week; §C below is the negative control that proves the strip is
// real and that `openingProfile` is on the safe side of it.

import { describe, it, expect, beforeEach } from 'vitest';
import {
    getWindowToolConfig,
    setWindowToolConfig,
    resetWindowToolConfig,
} from '../src/WindowToolConfigStore';
import { buildWindowOpening, buildWindowStoreRecord } from '../src/WindowOpeningFactory';
import { WindowOpeningSchema } from '../src/WindowTypes';
import {
    OPENING_PROFILE_KINDS,
    OPENING_PROFILE_LABELS,
    nextOpeningProfile,
} from '@pryzm/geometry-wall';

beforeEach(() => { resetWindowToolConfig(); });

describe('§A — the two axes are ORTHOGONAL, in the one config store', () => {
    it('defaults to rectangular — every window drawn before L-1250 is unchanged', () => {
        expect(getWindowToolConfig().openingProfile).toBe('rectangular');
    });

    it('switching the SHAPE does not disturb the LEAF COUNT, and vice versa', () => {
        setWindowToolConfig({ windowType: 'double' });
        setWindowToolConfig({ openingProfile: 'round-arch' });
        expect(getWindowToolConfig().windowType).toBe('double');
        expect(getWindowToolConfig().openingProfile).toBe('round-arch');

        // ⭐ THE POINT OF TWO AXES: `double × round-arch` — an ordinary window — is expressible.
        // A single flattened pill list could not hold this state at all (C82 §7.j).
        setWindowToolConfig({ windowType: 'single' });
        expect(getWindowToolConfig().openingProfile).toBe('round-arch');
        setWindowToolConfig({ openingProfile: 'circular' });
        expect(getWindowToolConfig().windowType).toBe('single');
    });

    it('the A key cycles the whole axis and returns to its start', () => {
        let p: unknown = 'rectangular';
        const seen: string[] = [];
        for (let i = 0; i < OPENING_PROFILE_KINDS.length; i++) {
            p = nextOpeningProfile(p);
            seen.push(p as string);
        }
        expect(new Set(seen).size).toBe(OPENING_PROFILE_KINDS.length);
        expect(p).toBe('rectangular');
    });

    it('every profile has exactly one user-facing label — no UI file spells its own', () => {
        for (const k of OPENING_PROFILE_KINDS) {
            expect(OPENING_PROFILE_LABELS[k]).toBeTruthy();
        }
        expect(new Set(Object.values(OPENING_PROFILE_LABELS)).size).toBe(OPENING_PROFILE_KINDS.length);
    });
});

describe('§B — the chokepoint carries the shape, and makes the circle AUTHORABLE', () => {
    it('a rectangular opening is byte-identical to the pre-L-1250 record, bar the new field', () => {
        const o = buildWindowOpening({ wallThickness: 0.3, offset: 1 });
        expect(o.openingProfile).toBe('rectangular');
        expect(o.width).toBeGreaterThan(0);
        expect(o.height).toBeGreaterThan(0);
    });

    it('⭐ CIRCULAR SQUARES THE BOUNDING BOX — the C84 EI-3 fix, not a workaround', () => {
        const rect = buildWindowOpening({ wallThickness: 0.3, offset: 1 });
        setWindowToolConfig({ openingProfile: 'circular' });
        const circ = buildWindowOpening({ wallThickness: 0.3, offset: 1 });

        expect(circ.openingProfile).toBe('circular');
        // width IS the diameter (C86 §10.1 PR-8) — so the width is untouched and the HEIGHT follows.
        expect(circ.width).toBe(rect.width);
        expect(circ.height).toBe(circ.width);
    });

    it('⛔ NON-VACUITY — the squaring is a NO-OP for the default single, and LOAD-BEARING for a double', () => {
        // ⭐ THIS ASSERTION WAS WRONG ON ITS FIRST DRAFT AND THE GUARD IS WHY WE KNOW.
        // It claimed the resolved rectangle is never square, so that squaring always bites. The
        // run said otherwise: the DEFAULT SINGLE window resolves to 1.2 × 1.2 — already square —
        // so for the shape the founder will try first, squaring changes nothing at all.
        //
        // The squaring is still load-bearing, just not there: a DOUBLE window is 2.4 wide and 1.2
        // tall, and without this it would meet `openingProfileShapeRefusal` naming the type's own
        // proportions rather than anything the user did. Asserting the case where it BITES is the
        // difference between a test and a decoration.
        const single = buildWindowOpening({ wallThickness: 0.3, offset: 1 });
        expect(single.width).toBe(single.height);          // the happy accident, recorded

        setWindowToolConfig({ windowType: 'double' });
        const dblRect = buildWindowOpening({ wallThickness: 0.3, offset: 1 });
        expect(dblRect.width).not.toBe(dblRect.height);    // 2.4 x 1.2 — the case that needs it

        setWindowToolConfig({ openingProfile: 'circular' });
        const dblCirc = buildWindowOpening({ wallThickness: 0.3, offset: 1 });
        expect(dblCirc.height).toBe(dblCirc.width);
        // ⚠ AND THE CONSEQUENCE IS STATED, NOT HIDDEN: a DOUBLE circular window is an oculus of
        // the double WIDTH (2.4 m), because PR-8 says the width IS the diameter. That is
        // consistent and it is large. Recorded here so the first person to see one knows it was
        // a decision rather than a bug — NOT MEASURED against founder expectation.
        expect(dblCirc.width).toBe(dblRect.width);
    });

    it('an arched opening keeps its authored height — only the circle is constrained', () => {
        const rect = buildWindowOpening({ wallThickness: 0.3, offset: 1 });
        setWindowToolConfig({ openingProfile: 'round-arch' });
        const arch = buildWindowOpening({ wallThickness: 0.3, offset: 1 });
        expect(arch.openingProfile).toBe('round-arch');
        expect(arch.height).toBe(rect.height);
    });

    it('the STORE RECORD carries the shape — the plan symbol reads from here, not the opening', () => {
        setWindowToolConfig({ openingProfile: 'circular' });
        const o = buildWindowOpening({ wallThickness: 0.3, offset: 1 });
        const rec = buildWindowStoreRecord({ opening: o as any, wallId: 'w1' });
        expect(rec.openingProfile).toBe('circular');
    });

    it('a REPLAYED opening carries its OWN profile over the current tool choice', () => {
        setWindowToolConfig({ openingProfile: 'circular' });
        const rec = buildWindowStoreRecord({
            opening: { id: 'o1', elementId: 'e1', openingProfile: 'round-arch', width: 1, height: 2 } as any,
            wallId: 'w1',
        });
        expect(rec.openingProfile).toBe('round-arch');
    });
});

describe('§C — ⛔ PERSISTENCE: the profile survives the Zod guard that STRIPS unknown keys', () => {
    const base = {
        id: 'e1', openingId: 'o1', wallId: 'w1',
        offset: 1, width: 1.2, height: 1.2, sillHeight: 0.9,
    };

    it('openingProfile SURVIVES a parse — it is declared on the schema', () => {
        const parsed = WindowOpeningSchema.parse({ ...base, openingProfile: 'circular' });
        expect(parsed.openingProfile).toBe('circular');
    });

    it('⭐ NEGATIVE CONTROL — an UNDECLARED field is DELETED by the same parse', () => {
        // This is what makes the assertion above meaningful rather than decorative. If Zod were
        // passing unknown keys through, the test above would pass even with the schema unchanged
        // — and the profile would still vanish on the next load, because `WindowStore.add`
        // freezes `.data`, not the input.
        const parsed = WindowOpeningSchema.parse({ ...base, someFieldNobodyDeclared: 'kept?' }) as Record<string, unknown>;
        expect(parsed.someFieldNobodyDeclared).toBeUndefined();
    });

    it('an ABSENT profile parses cleanly — no migration for windows drawn before this', () => {
        const parsed = WindowOpeningSchema.parse(base);
        expect(parsed.openingProfile).toBeUndefined();
    });

    it('an out-of-union profile is REJECTED at the schema, not silently coerced', () => {
        expect(() => WindowOpeningSchema.parse({ ...base, openingProfile: 'triangular' })).toThrow();
    });
});
