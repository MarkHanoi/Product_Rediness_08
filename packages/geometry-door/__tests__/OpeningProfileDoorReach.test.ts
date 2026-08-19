// §OPENING-PROFILE (L-1251) — the DOOR half of the shape axis.
//
// The founder asked for the arched door in the same breath as the circular window, and the whole
// point of one `openingProfile` on the WALL OPENING is that both nouns read ONE axis. This file
// asserts that they do — and, more importantly, asserts the ONE place where the two families must
// legitimately differ.
//
// ⭐ THE DIFFERENCE IS NOT COSMETIC AND IT IS THE REASON THIS FILE EXISTS. A door is a
// FLOOR-REACHING opening: `sillHeight` is 0, and `WallHoleBodyBuilder.normaliseWallHoles`
// classifies it as a NOTCH cut into the wall's outer profile rather than a closed hole. A circle
// has no jamb feet to notch between — its outline begins at the springing, not on the floor — so
// `circular` is not a value a door can hold. Offering it on the door bar and refusing it at the
// click would be C84 EI-3 in its purest form; not offering it is the honest shape, and
// `openingProfilesFor('door')` is the ONE declaration of that so no surface can disagree.

import { describe, it, expect, beforeEach } from 'vitest';
import {
    getDoorToolConfig,
    setDoorToolConfig,
    resetDoorToolConfig,
} from '../src/DoorToolConfigStore';
import { buildDoorOpening, buildDoorStoreRecord } from '../src/DoorOpeningFactory';
import {
    openingProfilesFor,
    nextOpeningProfileFor,
    openingProfileShapeRefusal,
    OPENING_PROFILE_KINDS,
} from '@pryzm/geometry-wall';

beforeEach(() => { resetDoorToolConfig(); });

describe('§A — one axis, two nouns', () => {
    it('a door defaults to rectangular — every door drawn before L-1251 is unchanged', () => {
        expect(getDoorToolConfig().openingProfile).toBe('rectangular');
    });

    it('leaf count and head shape patch INDEPENDENTLY', () => {
        setDoorToolConfig({ doorType: 'double' });
        setDoorToolConfig({ openingProfile: 'round-arch' });
        expect(getDoorToolConfig().doorType).toBe('double');
        expect(getDoorToolConfig().openingProfile).toBe('round-arch');

        // ⭐ `double × round-arch` — a perfectly ordinary pair of arched doors — is expressible.
        // A single flattened pill list could not hold this state (C82 §7.j).
        setDoorToolConfig({ doorType: 'single' });
        expect(getDoorToolConfig().openingProfile).toBe('round-arch');
    });
});

describe('§B — ⛔ a door may not be CIRCULAR, and the rule is declared once', () => {
    it('the door family offers three profiles; the window family offers four', () => {
        const doorList = openingProfilesFor('door');
        expect(doorList).not.toContain('circular');
        expect(doorList).toContain('round-arch');
        expect(doorList).toContain('segmental-arch');
        expect(doorList).toContain('rectangular');
        expect(openingProfilesFor('window')).toEqual(OPENING_PROFILE_KINDS);
    });

    it('the A key cycles the DOOR axis through three and never lands on circular', () => {
        let p: unknown = 'rectangular';
        for (let i = 0; i < 12; i++) {
            p = nextOpeningProfileFor('door', p);
            expect(p).not.toBe('circular');
        }
        // three values ⇒ twelve steps returns to the start
        expect(p).toBe('rectangular');
    });

    it('a door somehow HOLDING circular restarts the cycle rather than throwing', () => {
        // A keypress must always end somewhere buildable, even from a state the UI cannot author.
        expect(nextOpeningProfileFor('door', 'circular')).toBe('rectangular');
    });

    it('⭐ and the GEOMETRY gate refuses it too — the bar is not the only thing standing there', () => {
        // The bar not offering `circular` is an affordance decision. This is the pipeline half:
        // if some other route (chat, a batch generator, a hand-edited file) produced a circular
        // opening at sill 0, it is refused BY NAME rather than drawn as nonsense.
        const msg = openingProfileShapeRefusal('circular', 1.0, 1.0, 0);
        expect(msg).toBeTruthy();
        expect(msg!.toLowerCase()).toContain('floor');
        expect(msg!.toLowerCase()).toContain('arched');   // names the live alternative (C16 CA-18)
    });

    it('a WINDOW at a raised sill is untouched by that rule — non-vacuity', () => {
        // Without this the assertion above could pass for the wrong reason (a blanket ban on
        // circles), and the circular window the founder actually asked for would be dead.
        expect(openingProfileShapeRefusal('circular', 1.0, 1.0, 1.2)).toBeNull();
    });
});

describe('§C — the arched head reaches both records', () => {
    it('the wall-opening record carries the shape', () => {
        setDoorToolConfig({ openingProfile: 'round-arch' });
        const o = buildDoorOpening({ wallThickness: 0.3, offset: 1 });
        expect(o.openingProfile).toBe('round-arch');
        expect(o.sillHeight).toBe(0);          // still a floor-reaching notch
    });

    it('the STORE record carries it too — the plan symbol reads from here', () => {
        setDoorToolConfig({ openingProfile: 'segmental-arch' });
        const o = buildDoorOpening({ wallThickness: 0.3, offset: 1 });
        const rec = buildDoorStoreRecord({ opening: o as any, wallId: 'w1' });
        expect(rec.openingProfile).toBe('segmental-arch');
    });

    it("a REPLAYED opening's own profile wins over the tool's current choice", () => {
        setDoorToolConfig({ openingProfile: 'segmental-arch' });
        const rec = buildDoorStoreRecord({
            opening: { id: 'o1', elementId: 'e1', openingProfile: 'round-arch' } as any,
            wallId: 'w1',
        });
        expect(rec.openingProfile).toBe('round-arch');
    });

    it('a rectangular door is unchanged — no migration', () => {
        const o = buildDoorOpening({ wallThickness: 0.3, offset: 1 });
        expect(o.openingProfile).toBe('rectangular');
    });
});
