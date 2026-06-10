// T1.3 + T1.6 (2026-05-29) — Per-room acousticRole + frontage data tables.
//
// Closes the Tier 2 topology-data-table promise of having ONE source of truth
// per room type. Previously the topology validators reached into inline Set
// constants in `topology/adjacencyRules.ts`; now they derive from RoomRule
// fields on the ROOM_RULES database. These pin tests ensure the derived sets
// match the architectural classification and stay stable across future edits.

import { describe, expect, it } from 'vitest';
import { ROOM_RULES } from '../src/workflows/apartmentLayout/rules/programRules.js';
import {
    ACOUSTIC_SOURCE_TYPES, ACOUSTIC_RECEIVER_TYPES,
    FRONTAGE_REQUIRED_TYPES, FRONTAGE_PREFERRED_TYPES,
} from '../src/workflows/apartmentLayout/topology/adjacencyRules.js';
import type { RoomType } from '../src/workflows/apartmentLayout/types.js';

describe('T1.3 — acousticRole field on RoomRule', () => {
    it('every RoomType declares an acousticRole', () => {
        for (const [name, rule] of Object.entries(ROOM_RULES)) {
            expect(rule.acousticRole, `room "${name}" missing acousticRole`)
                .toMatch(/^(source|receiver|neutral)$/);
        }
    });

    it('canonical noise sources: living / kitchen / dining / utility', () => {
        const sources = new Set(ACOUSTIC_SOURCE_TYPES);
        const expected: RoomType[] = ['living', 'kitchen', 'dining', 'utility'];
        for (const t of expected) expect(sources.has(t), `${t} should be a source`).toBe(true);
        expect(sources.size).toBe(expected.length);
    });

    it('canonical noise receivers: master / bedroom / study', () => {
        const receivers = new Set(ACOUSTIC_RECEIVER_TYPES);
        const expected: RoomType[] = ['master', 'bedroom', 'study'];
        for (const t of expected) expect(receivers.has(t), `${t} should be a receiver`).toBe(true);
        expect(receivers.size).toBe(expected.length);
    });

    it('neutral: hall / corridor / bathroom / ensuite / wc', () => {
        const neutral: RoomType[] = ['hall', 'corridor', 'bathroom', 'ensuite', 'wc'];
        for (const t of neutral) {
            expect(ROOM_RULES[t].acousticRole).toBe('neutral');
        }
    });

    it('source ∩ receiver = ∅ (no room is both)', () => {
        for (const s of ACOUSTIC_SOURCE_TYPES) {
            expect(ACOUSTIC_RECEIVER_TYPES.has(s)).toBe(false);
        }
    });
});

describe('T1.6 — frontage field on RoomRule', () => {
    it('every RoomType declares a frontage preference', () => {
        for (const [name, rule] of Object.entries(ROOM_RULES)) {
            expect(rule.frontage, `room "${name}" missing frontage`)
                .toMatch(/^(required|preferred|none)$/);
        }
    });

    // §HALL-PERIMETER (ADR-0063, founder rule #2) — the entrance hall is now
    // frontage REQUIRED: it hosts the main entrance door so it must abut the
    // perimeter shell. (It is NOT windowMandatory — never a hard window reject.)
    it('frontage REQUIRED: living / kitchen / master / bedroom + hall', () => {
        const required = new Set(FRONTAGE_REQUIRED_TYPES);
        const expected: RoomType[] = ['living', 'kitchen', 'master', 'bedroom', 'hall'];
        for (const t of expected) expect(required.has(t), `${t} should require frontage`).toBe(true);
        expect(required.size).toBe(expected.length);
    });

    // §A.21.D55 (DAYLIGHT IN EVERY ROOM) — the wet rooms (bathroom / ensuite / wc)
    // were promoted 'none' → 'preferred' so a window in them is desirable (SOFT)
    // where the plate allows, never forbidden.
    it('frontage PREFERRED: dining / study + wet rooms (bathroom / ensuite / wc)', () => {
        const preferred = new Set(FRONTAGE_PREFERRED_TYPES);
        const expected: RoomType[] = ['dining', 'study', 'bathroom', 'ensuite', 'wc'];
        for (const t of expected) expect(preferred.has(t), `${t} should prefer frontage`).toBe(true);
        expect(preferred.size).toBe(expected.length);
    });

    // §HALL-PERIMETER (ADR-0063) — hall left the 'none' set (now 'required').
    // §STAIR-ROOM-TYPE (ADR-0063) — the new `stair` core is interior-acceptable ('none').
    it('frontage NONE: corridor / stair / utility only (hall promoted by ADR-0063; wet rooms by A.21.D55)', () => {
        const none: RoomType[] = ['corridor', 'stair', 'utility'];
        for (const t of none) {
            expect(ROOM_RULES[t].frontage).toBe('none');
        }
        // The hall must NO LONGER be 'none' (it hosts the entrance door on the perimeter).
        expect(ROOM_RULES.hall.frontage).toBe('required');
        // The wet rooms must NO LONGER be 'none'.
        for (const t of ['bathroom', 'ensuite', 'wc'] as RoomType[]) {
            expect(ROOM_RULES[t].frontage).not.toBe('none');
        }
    });

    it('every windowMandatory room is at least PREFERRED frontage (consistency)', () => {
        // If a room MUST have a window when on the perimeter, its frontage value
        // can't be 'none' — that would be contradictory.
        for (const [name, rule] of Object.entries(ROOM_RULES)) {
            if (rule.windowMandatory) {
                expect(rule.frontage, `${name} is windowMandatory; frontage must not be 'none'`)
                    .not.toBe('none');
            }
        }
    });
});
