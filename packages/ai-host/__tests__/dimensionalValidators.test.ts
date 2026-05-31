// G-1 (area-max) + G-2 (width-max) dimensional validators — first slice of the
// 10 G-classes from `docs/03_PRYZM3/APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md`
// §G-class table. Pin every behavioural contract as an executable assertion.

import { describe, expect, it } from 'vitest';
import {
    DIMENSIONAL_LIMITS,
    limitsFor,
    validateAreaMax,
    validateWidthMax,
} from '../src/workflows/apartmentLayout/validators/dimensional/index.js';

describe('dimensional validators — G-1 areaMax + G-2 widthMax', () => {

    // ── G-1 area-max ────────────────────────────────────────────────────────
    describe('G-1 validateAreaMax', () => {
        it('empty rooms list returns no violations', () => {
            expect(validateAreaMax([])).toEqual([]);
        });

        it('rooms within their limits return no violations', () => {
            const rooms = [
                { id: 'r1', type: 'corridor', areaM2: 5 },
                { id: 'r2', type: 'bathroom', areaM2: 6 },
                { id: 'r3', type: 'bedroom',  areaM2: 12 },
                { id: 'r4', type: 'living',   areaM2: 28 },
            ];
            expect(validateAreaMax(rooms)).toEqual([]);
        });

        it('flags a corridor exceeding the 8 m² cap with classId G-1', () => {
            const rooms = [{ id: 'corridor-1', type: 'corridor', areaM2: 12 }];
            const v = validateAreaMax(rooms);
            expect(v.length).toBe(1);
            expect(v[0]!.classId).toBe('G-1');
            expect(v[0]!.roomId).toBe('corridor-1');
            expect(v[0]!.roomType).toBe('corridor');
            expect(v[0]!.observed).toBe(12);
            expect(v[0]!.maximum).toBe(8);
            expect(v[0]!.severity).toBe('error');
            expect(v[0]!.message).toMatch(/G-1/);
            expect(v[0]!.message).toMatch(/corridor/);
        });

        it('flags a bathroom exceeding the 15 m² cap (wet-room threshold)', () => {
            const v = validateAreaMax([{ id: 'b1', type: 'bathroom', areaM2: 18 }]);
            expect(v.length).toBe(1);
            expect(v[0]!.observed).toBe(18);
            expect(v[0]!.maximum).toBe(15);
        });

        it('boundary: a corridor exactly at 8.0 m² does NOT violate', () => {
            const v = validateAreaMax([{ id: 'c', type: 'corridor', areaM2: 8.0 }]);
            expect(v).toEqual([]);
        });

        it('different room types use different limits in a single batch', () => {
            // corridor cap 8, living cap 60 — both at 30 m² have only the corridor fail.
            const v = validateAreaMax([
                { id: 'c', type: 'corridor', areaM2: 30 },
                { id: 'l', type: 'living',   areaM2: 30 },
            ]);
            expect(v.length).toBe(1);
            expect(v[0]!.roomId).toBe('c');
            expect(v[0]!.roomType).toBe('corridor');
        });

        it('unknown room type is SKIPPED with no violation (degrades gracefully)', () => {
            const v = validateAreaMax([
                { id: 'x', type: 'never-heard-of-it', areaM2: 9999 },
            ]);
            expect(v).toEqual([]);
        });

        it('reports multiple violations in input order (stable output)', () => {
            const v = validateAreaMax([
                { id: 'r1', type: 'corridor', areaM2: 20 },
                { id: 'r2', type: 'bedroom',  areaM2: 10 },  // OK
                { id: 'r3', type: 'wc',       areaM2: 10 },
            ]);
            expect(v.length).toBe(2);
            expect(v[0]!.roomId).toBe('r1');
            expect(v[1]!.roomId).toBe('r3');
        });
    });

    // ── G-2 width-max ───────────────────────────────────────────────────────
    describe('G-2 validateWidthMax', () => {
        it('empty rooms list returns no violations', () => {
            expect(validateWidthMax([])).toEqual([]);
        });

        it('rooms within their width limits return no violations', () => {
            const v = validateWidthMax([
                { id: 'c', type: 'corridor', widthM: 1.2 },
                { id: 'b', type: 'bathroom', widthM: 2.0 },
                { id: 'l', type: 'living',   widthM: 5.0 },
            ]);
            expect(v).toEqual([]);
        });

        it('flags a corridor wider than 2.5 m (hall threshold) with classId G-2', () => {
            const v = validateWidthMax([{ id: 'corridor-wide', type: 'corridor', widthM: 3.0 }]);
            expect(v.length).toBe(1);
            expect(v[0]!.classId).toBe('G-2');
            expect(v[0]!.roomId).toBe('corridor-wide');
            expect(v[0]!.roomType).toBe('corridor');
            expect(v[0]!.observed).toBe(3.0);
            expect(v[0]!.maximum).toBe(2.5);
            expect(v[0]!.severity).toBe('error');
            expect(v[0]!.message).toMatch(/G-2/);
        });

        it('flags a bathroom wider than 3.0 m (wet-room threshold)', () => {
            const v = validateWidthMax([{ id: 'b', type: 'bathroom', widthM: 3.5 }]);
            expect(v.length).toBe(1);
            expect(v[0]!.observed).toBe(3.5);
            expect(v[0]!.maximum).toBe(3.0);
        });

        it('boundary: a corridor exactly at 2.5 m wide does NOT violate', () => {
            const v = validateWidthMax([{ id: 'c', type: 'corridor', widthM: 2.5 }]);
            expect(v).toEqual([]);
        });

        it('unknown room type is SKIPPED with no violation', () => {
            const v = validateWidthMax([{ id: 'x', type: 'mystery', widthM: 999 }]);
            expect(v).toEqual([]);
        });
    });

    // ── G-1 + G-2 composed ──────────────────────────────────────────────────
    describe('G-1 + G-2 composed', () => {
        it('a room exceeding BOTH the area cap AND the width cap returns one violation per validator', () => {
            // Corridor at 12 m² and 3 m wide — both limits breached.
            const room = { id: 'big-corridor', type: 'corridor', areaM2: 12, widthM: 3 };
            const aV = validateAreaMax([room]);
            const wV = validateWidthMax([room]);
            expect(aV.length).toBe(1);
            expect(wV.length).toBe(1);
            expect(aV[0]!.classId).toBe('G-1');
            expect(wV[0]!.classId).toBe('G-2');
            // The two together is the row the legality gate would surface.
            expect([...aV, ...wV].length).toBe(2);
        });

        it('every violation severity is "error" (G-1 + G-2 are HARD)', () => {
            const aV = validateAreaMax([{ id: 'c', type: 'corridor', areaM2: 20 }]);
            const wV = validateWidthMax([{ id: 'c', type: 'corridor', widthM: 4 }]);
            for (const v of [...aV, ...wV]) expect(v.severity).toBe('error');
        });
    });

    // ── DIMENSIONAL_LIMITS table integrity ─────────────────────────────────
    describe('DIMENSIONAL_LIMITS table', () => {
        it('contains the canonical residential room types from the spec', () => {
            // Spec table — at minimum these must be present.
            for (const t of [
                'corridor', 'entrance_hall', 'bathroom', 'wc', 'ensuite',
                'utility_room', 'kitchen', 'dining_room', 'living_room',
                'bedroom', 'master_bedroom', 'private_office', 'storage', 'balcony',
            ]) {
                expect(DIMENSIONAL_LIMITS[t], `missing limit row for '${t}'`).toBeDefined();
            }
        });

        it('every entry has positive area + width', () => {
            for (const [type, l] of Object.entries(DIMENSIONAL_LIMITS)) {
                expect(l.areaMaxM2, `${type}.areaMaxM2`).toBeGreaterThan(0);
                expect(l.widthMaxM, `${type}.widthMaxM`).toBeGreaterThan(0);
            }
        });

        it('limitsFor returns undefined for an unknown type', () => {
            expect(limitsFor('not-a-real-room')).toBeUndefined();
        });

        // Pin the headline spec values so changes are deliberate.
        it('pins spec: corridor = 8 m² / 2.5 m', () => {
            expect(DIMENSIONAL_LIMITS.corridor).toEqual({ areaMaxM2: 8, widthMaxM: 2.5 });
        });
        it('pins spec: bathroom = 15 m² / 3.0 m (wet-room threshold)', () => {
            expect(DIMENSIONAL_LIMITS.bathroom).toEqual({ areaMaxM2: 15, widthMaxM: 3.0 });
        });
    });
});
