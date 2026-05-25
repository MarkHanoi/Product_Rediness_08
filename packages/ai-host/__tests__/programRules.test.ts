// Architectural Program Rules — the normative room database.
// Contract: SPEC-ARCHITECTURAL-PROGRAM-RULES. These tests pin the user's stated
// rules as executable assertions (the single source of truth for connectivity +
// program), so a regression in the matrix fails CI rather than the live layout.

import { describe, expect, it } from 'vitest';
import {
    ROOM_RULES, ALL_ROOM_RULES, roomRule, occupancyOf, isCirculation, isPrivate,
    doorAllowedBetween, maxDoorsFor, programForOccupancy,
} from '../src/workflows/apartmentLayout/rules/programRules.js';
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
    it('a bedroom door connects to a corridor, living or dining — NEVER another bedroom', () => {
        expect(doorAllowedBetween('bedroom', 'corridor')).toBe(true);
        expect(doorAllowedBetween('bedroom', 'living')).toBe(true);
        expect(doorAllowedBetween('bedroom', 'dining')).toBe(true);
        expect(doorAllowedBetween('bedroom', 'hall')).toBe(true);
        // the explicit defect the user reported:
        expect(doorAllowedBetween('bedroom', 'bedroom')).toBe(false);
        expect(doorAllowedBetween('bedroom', 'master')).toBe(false);
    });

    it('a bathroom connects only to a corridor/hall or a bedroom — never kitchen/living/dining', () => {
        expect(doorAllowedBetween('bathroom', 'corridor')).toBe(true);
        expect(doorAllowedBetween('bathroom', 'hall')).toBe(true);
        expect(doorAllowedBetween('bathroom', 'bedroom')).toBe(true);
        expect(doorAllowedBetween('bathroom', 'kitchen')).toBe(false);
        expect(doorAllowedBetween('bathroom', 'living')).toBe(false);
        expect(doorAllowedBetween('bathroom', 'dining')).toBe(false);
        expect(doorAllowedBetween('bathroom', 'bathroom')).toBe(false);
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
