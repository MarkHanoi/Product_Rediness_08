// Architectural Program Rules — the normative room database.
// Contract: SPEC-ARCHITECTURAL-PROGRAM-RULES. These tests pin the user's stated
// rules as executable assertions (the single source of truth for connectivity +
// program), so a regression in the matrix fails CI rather than the live layout.

import { describe, expect, it } from 'vitest';
import {
    ROOM_RULES, ALL_ROOM_RULES, roomRule, occupancyOf, isCirculation, isPrivate,
    isOpenPlanEligible,
    doorAllowedBetween, maxDoorsFor, programForOccupancy, preferenceBetween,
    windowMandatoryFor, windowDesiredFor,
} from '../src/workflows/apartmentLayout/rules/programRules.js';
import { scaleProgramToShell } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import type { RoomType } from '../src/workflows/apartmentLayout/types.js';

const ALL_TYPES: RoomType[] = [
    'master', 'bedroom', 'living', 'kitchen', 'dining',
    'bathroom', 'ensuite', 'wc', 'hall', 'corridor', 'study', 'utility',
    // §STAIR-ROOM-TYPE (ADR-0063) — vertical-circulation first-class room type.
    'stair',
];

describe('programRules — database integrity', () => {
    it('has exactly one rule per RoomType and self-consistent keys', () => {
        for (const t of ALL_TYPES) {
            const r = ROOM_RULES[t];
            expect(r).toBeDefined();
            expect(r.type).toBe(t);
            expect(r.occupancy.length).toBeGreaterThan(0);
            expect(r.areaWeight).toBeGreaterThan(0);
            expect(r.minAreaM2).toBeGreaterThanOrEqual(0);
            expect(r.maxDoors).toBeGreaterThanOrEqual(1);
        }
        expect(ALL_ROOM_RULES.length).toBe(ALL_TYPES.length);
    });

    it('windowMandatory ⇒ needsWindow (legal requirement implies habitability)', () => {
        for (const r of ALL_ROOM_RULES) if (r.windowMandatory) expect(r.needsWindow).toBe(true);
    });

    it('roomRule falls back gracefully for an unknown type', () => {
        expect(roomRule('does-not-exist').type).toBe('utility');
    });

    it('§WINDOW-DESIRED (A.21.D61) — the founder\'s "every room a window" set is the windowable set', () => {
        // windowDesiredFor ⊇ windowMandatoryFor: the LEGAL mandatory set
        // (living/kitchen/master/bedroom) is a strict subset of the DESIRED set, which
        // additionally covers dining + study + the wet rooms (bathroom/ensuite/wc).
        for (const t of ALL_TYPES) {
            if (windowMandatoryFor(t)) expect(windowDesiredFor(t), `mandatory ⇒ desired for ${t}`).toBe(true);
        }
        // Every windowable room is desired (the founder wants a window in ALL of them).
        for (const t of ['living', 'kitchen', 'dining', 'master', 'bedroom', 'study', 'bathroom', 'ensuite', 'wc'] as RoomType[]) {
            expect(windowDesiredFor(t), `${t} should be window-desired`).toBe(true);
        }
        // The wet rooms are NEWLY desired (they were NOT mandatory).
        for (const t of ['bathroom', 'ensuite', 'wc', 'dining', 'study'] as RoomType[]) {
            expect(windowMandatoryFor(t)).toBe(false);
            expect(windowDesiredFor(t)).toBe(true);
        }
        // Circulation + service (incl. the §STAIR-ROOM-TYPE stair core) are never glazed.
        for (const t of ['corridor', 'hall', 'stair', 'utility'] as RoomType[]) {
            expect(windowDesiredFor(t), `${t} must never be window-desired`).toBe(false);
        }
    });
});

describe('programRules — connectivity matrix (the user\'s rules)', () => {
    it('a bedroom door connects to a corridor, living or dining — NEVER another bedroom, NEVER the entrance hall', () => {
        expect(doorAllowedBetween('bedroom', 'corridor')).toBe(true);
        expect(doorAllowedBetween('bedroom', 'living')).toBe(true);
        expect(doorAllowedBetween('bedroom', 'dining')).toBe(true);
        // bedroom↔hall is now FORBIDDEN: the entrance hall is a clean lobby that
        // distributes only to living/corridor; bedrooms must come off a corridor.
        expect(doorAllowedBetween('bedroom', 'hall')).toBe(false);
        // the explicit defect the user reported:
        expect(doorAllowedBetween('bedroom', 'bedroom')).toBe(false);
        expect(doorAllowedBetween('bedroom', 'master')).toBe(false);
    });

    it('§BATH-CORRIDOR-ONLY: a shared bathroom connects ONLY to a corridor — never to a bedroom/master (that\'s an en-suite), never to the entrance hall, kitchen/living/dining', () => {
        expect(doorAllowedBetween('bathroom', 'corridor')).toBe(true);
        // §BATH-CORRIDOR-ONLY (2026-05-29) — bathroom↔bedroom and
        // bathroom↔master are now forbidden (program-rules-improvements
        // queue #2). The bedroom-bathroom semantic is the en-suite, modelled
        // as the separate `ensuite` room type.
        expect(doorAllowedBetween('bathroom', 'bedroom')).toBe(false);
        expect(doorAllowedBetween('bathroom', 'master')).toBe(false);
        // The user's earlier feedback: "the entrance door is connected with a
        // bathroom — this is not possible." Hall ↔ bathroom remains forbidden.
        expect(doorAllowedBetween('bathroom', 'hall')).toBe(false);
        expect(doorAllowedBetween('bathroom', 'kitchen')).toBe(false);
        expect(doorAllowedBetween('bathroom', 'living')).toBe(false);
        expect(doorAllowedBetween('bathroom', 'dining')).toBe(false);
        expect(doorAllowedBetween('bathroom', 'bathroom')).toBe(false);
    });

    it('the entrance hall is a CLEAN lobby — only living + corridor (the user\'s rule)', () => {
        expect(doorAllowedBetween('hall', 'living')).toBe(true);
        expect(doorAllowedBetween('hall', 'corridor')).toBe(true);
        expect(doorAllowedBetween('hall', 'bathroom')).toBe(false);
        expect(doorAllowedBetween('hall', 'bedroom')).toBe(false);
        expect(doorAllowedBetween('hall', 'master')).toBe(false);
        expect(doorAllowedBetween('hall', 'kitchen')).toBe(false);
        expect(doorAllowedBetween('hall', 'dining')).toBe(false);
        expect(doorAllowedBetween('hall', 'utility')).toBe(false);
    });

    it('an en-suite is reached ONLY through its master bedroom', () => {
        expect(doorAllowedBetween('ensuite', 'master')).toBe(true);
        expect(doorAllowedBetween('ensuite', 'corridor')).toBe(false);
        expect(doorAllowedBetween('ensuite', 'hall')).toBe(false);
        expect(doorAllowedBetween('ensuite', 'bedroom')).toBe(false);
    });

    // §WC (queue #1) — separate WC / cloakroom, European F3+ pattern.
    it('a WC connects ONLY to a corridor or the entrance hall — never bedroom/kitchen/living/dining', () => {
        expect(doorAllowedBetween('wc', 'corridor')).toBe(true);
        expect(doorAllowedBetween('wc', 'hall')).toBe(true);
        // Forbidden — same architectural reasons as bathroom: a WC off a bedroom
        // or social room is wrong by convention.
        expect(doorAllowedBetween('wc', 'bedroom')).toBe(false);
        expect(doorAllowedBetween('wc', 'master')).toBe(false);
        expect(doorAllowedBetween('wc', 'kitchen')).toBe(false);
        expect(doorAllowedBetween('wc', 'living')).toBe(false);
        expect(doorAllowedBetween('wc', 'dining')).toBe(false);
        expect(doorAllowedBetween('wc', 'bathroom')).toBe(false);
        expect(doorAllowedBetween('wc', 'wc')).toBe(false);
    });

    it('the matrix is symmetric', () => {
        for (const a of ALL_TYPES) for (const b of ALL_TYPES) {
            expect(doorAllowedBetween(a, b)).toBe(doorAllowedBetween(b, a));
        }
    });

    // §ADJACENCY-PREFERENCE (queue #6) — soft per-pair weight in [0,1].
    it('preferenceBetween returns the stronger of either direction', () => {
        // kitchen.adjacencyPreference.dining = 1.0 → strongly preferred (the
        // open-plan classic). dining.adjacencyPreference.kitchen = 1.0 also.
        expect(preferenceBetween('kitchen', 'dining')).toBeCloseTo(1.0, 5);
        // §F1-2 (2026-06-08) — kitchen.adjacencyPreference.corridor raised 0.3 → 0.6 so a
        // kitchen buried in the private zone (behind the corridor) is penalised enough to
        // discourage it, while staying below kitchen↔dining (1.0).
        expect(preferenceBetween('kitchen', 'corridor')).toBeCloseTo(0.6, 5);
        // master ↔ ensuite is the defining adjacency.
        expect(preferenceBetween('master', 'ensuite')).toBeCloseTo(1.0, 5);
        // The function is symmetric — direction-independent.
        expect(preferenceBetween('dining', 'kitchen'))
            .toBe(preferenceBetween('kitchen', 'dining'));
    });

    it('preferenceBetween defaults to 1.0 when neither side declares a preference', () => {
        // study has no adjacencyPreference field; corridor has 0.8 for study.
        // Result = max(undefined, 0.8) = 0.8.
        expect(preferenceBetween('study', 'corridor')).toBeCloseTo(0.8, 5);
        // utility doesn't list kitchen in its preferences; kitchen lists utility at 0.6.
        expect(preferenceBetween('utility', 'kitchen')).toBeCloseTo(0.6, 5);
    });

    it('every room has at least one legal access path (no orphan type)', () => {
        for (const a of ALL_TYPES) {
            const reachable = ALL_TYPES.some(b => b !== a && doorAllowedBetween(a, b));
            expect(reachable).toBe(true);
        }
    });
});

describe('programRules — privacy door caps', () => {
    it('private rooms are NOT thoroughfares (capped doors); circulation is uncapped', () => {
        expect(maxDoorsFor('bedroom')).toBe(1);
        expect(maxDoorsFor('bathroom')).toBe(1);
        expect(maxDoorsFor('ensuite')).toBe(1);
        expect(maxDoorsFor('master')).toBe(2);            // circulation + en-suite
        expect(maxDoorsFor('corridor')).toBe(Number.POSITIVE_INFINITY);
        expect(maxDoorsFor('hall')).toBe(Number.POSITIVE_INFINITY);
        expect(maxDoorsFor('living')).toBe(Number.POSITIVE_INFINITY);
    });

    it('classifies the privacy gradient', () => {
        expect(isCirculation('corridor')).toBe(true);
        expect(isCirculation('hall')).toBe(true);
        expect(isCirculation('living')).toBe(false);
        expect(isPrivate('bedroom')).toBe(true);
        expect(isPrivate('master')).toBe(true);
        expect(isPrivate('living')).toBe(false);
    });

    it('§OPEN-PLAN-ELIGIBLE: only the social cluster (living/kitchen/dining) may be open-plan', () => {
        // Eligible — these MAY merge into a shared wall-less open zone.
        expect(isOpenPlanEligible('living')).toBe(true);
        expect(isOpenPlanEligible('kitchen')).toBe(true);
        expect(isOpenPlanEligible('dining')).toBe(true);
        // NOT eligible — sleeping / wet / circulation rooms (incl. the §STAIR-ROOM-TYPE
        // stair core) are ALWAYS walled.
        for (const t of ['bedroom', 'master', 'study', 'bathroom', 'ensuite', 'wc', 'corridor', 'hall', 'stair', 'utility'] as RoomType[]) {
            expect(isOpenPlanEligible(t)).toBe(false);
        }
    });
});

describe('programRules — auto-scale bedrooms/baths from shell area (the user\'s rule)', () => {
    const base = { bedrooms: 2, bathrooms: 1, masterEnSuite: false, openPlanKitchenDining: true, livingRoom: true, entranceHall: true };

    it('small shell preserves the user\'s stated program', () => {
        const out = scaleProgramToShell(base, 120);
        expect(out.bedrooms).toBe(2);
        expect(out.bathrooms).toBe(1);
    });

    it('large shell scales bedrooms up and enables masterEnSuite at ≥3 bedrooms', () => {
        const out = scaleProgramToShell(base, 800);
        // 800/130 ≈ 6.15 → capped at 5 bedrooms; ⌊5/2⌋ = 2 bathrooms; ensuite on.
        expect(out.bedrooms).toBe(5);
        expect(out.bathrooms).toBe(2);
        expect(out.masterEnSuite).toBe(true);
    });

    it('never downscales the user\'s stated count', () => {
        const out = scaleProgramToShell({ ...base, bedrooms: 5, bathrooms: 3 }, 80);
        expect(out.bedrooms).toBeGreaterThanOrEqual(5);
        expect(out.bathrooms).toBeGreaterThanOrEqual(3);
    });

    // §ENVELOPE-FIT-GROWTH (founder bug #1, 2026-06-10) — the #1 recurring residential
    // defect: an OVER-CAPACITY shell (≫ the program's max area) inflated a fixed small
    // program to fill the plate → rooms collide/merge + every strategy §TOPO-HARD-REJECTs.
    // The cure: grow the bedroom COUNT until the shell fits inside that count's §3.1
    // envelope band, so a big shell yields MORE rooms of normal size, not fewer giants.
    describe('§ENVELOPE-FIT-GROWTH — an over-capacity shell grows the bedroom count', () => {
        it('the founder 206.7 m² 2-bed shell grows to 4 bedrooms (was stuck at 2 → over-capacity)', () => {
            // 2-bed grossMax is 120 m²; the 130-rule rounds 206.7 → 2 (the BUG). Growth lifts
            // it to 4-bed (grossMax 220 ≥ 206.7), so the program fills the shell in-band.
            const out = scaleProgramToShell(base, 206.7);
            expect(out.bedrooms).toBe(4);
            expect(out.bathrooms).toBe(2);     // ⌊4/2⌋
            expect(out.masterEnSuite).toBe(true);   // auto at ≥3 beds
        });

        it('an in-band / small shell is UNCHANGED (the byte-identical regression guard)', () => {
            // 90 m² and 120 m² both fit the 2-bed envelope (grossMax 120) → no growth.
            expect(scaleProgramToShell(base, 90).bedrooms).toBe(2);
            expect(scaleProgramToShell(base, 120).bedrooms).toBe(2);
        });

        it('growth never exceeds the §3.1 envelope cap (a huge shell stops at 5 beds)', () => {
            expect(scaleProgramToShell(base, 800).bedrooms).toBe(5);
        });
    });
});

describe('programRules — occupancy + program', () => {
    it('maps room types to editor RoomOccupancyType', () => {
        expect(occupancyOf('master')).toBe('bedroom');
        expect(occupancyOf('bedroom')).toBe('bedroom');
        expect(occupancyOf('living')).toBe('living-room');
        expect(occupancyOf('bathroom')).toBe('bathroom');
        expect(occupancyOf('ensuite')).toBe('bathroom');
        expect(occupancyOf('corridor')).toBe('corridor');
    });

    it('a bedroom requires bed + 2 bedside tables + lighting + wardrobe', () => {
        const p = programForOccupancy('bedroom');
        expect(p.required).toContain('bed');
        expect(p.required).toContain('bedside_table');
        expect(p.required).toContain('wardrobe');
        expect(p.required).toContain('lamp');
    });

    it('a bathroom requires toilet + washbasin + shower fixtures', () => {
        const p = programForOccupancy('bathroom');
        expect(p.fixtures).toContain('toilet');
        expect(p.fixtures).toContain('washbasin');
        expect(p.fixtures).toContain('shower');
    });
});
