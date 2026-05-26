// Architectural Program Rules — the normative room database.
// Contract: SPEC-ARCHITECTURAL-PROGRAM-RULES. These tests pin the user's stated
// rules as executable assertions (the single source of truth for connectivity +
// program), so a regression in the matrix fails CI rather than the live layout.

import { describe, expect, it } from 'vitest';
import {
    ROOM_RULES, ALL_ROOM_RULES, roomRule, occupancyOf, isCirculation, isPrivate,
    doorAllowedBetween, maxDoorsFor, programForOccupancy,
} from '../src/workflows/apartmentLayout/rules/programRules.js';
import { scaleProgramToShell } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import type { RoomType } from '../src/workflows/apartmentLayout/types.js';

const ALL_TYPES: RoomType[] = [
    'master', 'bedroom', 'living', 'kitchen', 'dining',
    'bathroom', 'ensuite', 'hall', 'corridor', 'study', 'utility',
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

    it('a bathroom connects only to a corridor or a bedroom — NEVER the entrance hall, never kitchen/living/dining', () => {
        expect(doorAllowedBetween('bathroom', 'corridor')).toBe(true);
        expect(doorAllowedBetween('bathroom', 'bedroom')).toBe(true);
        // The user's explicit feedback: "the entrance door is connected with a
        // bathroom — this is not possible." Hall ↔ bathroom is now forbidden.
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

    it('the matrix is symmetric', () => {
        for (const a of ALL_TYPES) for (const b of ALL_TYPES) {
            expect(doorAllowedBetween(a, b)).toBe(doorAllowedBetween(b, a));
        }
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
        // 800/80 = 10 → capped at 8 bedrooms; ⌈8/2⌉ = 4 bathrooms.
        expect(out.bedrooms).toBe(8);
        expect(out.bathrooms).toBe(4);
        expect(out.masterEnSuite).toBe(true);
    });

    it('never downscales the user\'s stated count', () => {
        const out = scaleProgramToShell({ ...base, bedrooms: 5, bathrooms: 3 }, 80);
        expect(out.bedrooms).toBeGreaterThanOrEqual(5);
        expect(out.bathrooms).toBeGreaterThanOrEqual(3);
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
