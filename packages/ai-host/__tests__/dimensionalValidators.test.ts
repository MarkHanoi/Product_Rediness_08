// G-1 (area-max) + G-2 (width-max) + G-3 (aspect-ratio) + G-5 (wall-usability)
// dimensional validators — first slices of the 10 G-classes from
// `docs/03_PRYZM3/APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md`
// §G-class table. Pin every behavioural contract as an executable assertion.

import { describe, expect, it } from 'vitest';
import {
    DIMENSIONAL_LIMITS,
    limitsFor,
    validateAreaMax,
    validateAspect,
    validateWallUsability,
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

        it('every entry has an aspectRatioMax and minUsableWallM column (G-3 + G-5)', () => {
            for (const [type, l] of Object.entries(DIMENSIONAL_LIMITS)) {
                // aspectRatioMax: a finite positive ratio OR the corridor sentinel `Infinity`.
                expect(typeof l.aspectRatioMax, `${type}.aspectRatioMax`).toBe('number');
                expect(l.aspectRatioMax, `${type}.aspectRatioMax`).toBeGreaterThan(0);
                // minUsableWallM: 0 (sentinel) or positive.
                expect(typeof l.minUsableWallM, `${type}.minUsableWallM`).toBe('number');
                expect(l.minUsableWallM, `${type}.minUsableWallM`).toBeGreaterThanOrEqual(0);
            }
        });

        it('limitsFor returns undefined for an unknown type', () => {
            expect(limitsFor('not-a-real-room')).toBeUndefined();
        });

        // Pin the headline spec values so changes are deliberate.
        it('pins spec: corridor = 8 m² / 2.5 m', () => {
            // G-1 + G-2 pinned at full structural equality including the G-3 + G-5
            // sentinel columns (corridor is exempt from both — aspectRatioMax =
            // Infinity, minUsableWallM = 0).
            expect(DIMENSIONAL_LIMITS.corridor).toEqual({
                areaMaxM2: 8, widthMaxM: 2.5, aspectRatioMax: Infinity, minUsableWallM: 0,
            });
        });
        it('pins spec: bathroom = 15 m² / 3.0 m (wet-room threshold)', () => {
            expect(DIMENSIONAL_LIMITS.bathroom).toEqual({
                areaMaxM2: 15, widthMaxM: 3.0, aspectRatioMax: 2.5, minUsableWallM: 1.5,
            });
        });

        // G-3 + G-5 pins — keep the headline spec values executable.
        it('pins spec: corridor aspectRatioMax = Infinity (skip — corridors are elongated)', () => {
            expect(DIMENSIONAL_LIMITS.corridor!.aspectRatioMax).toBe(Infinity);
        });
        it('pins spec: bedroom aspectRatioMax = 2.5 (no tunnel bedrooms)', () => {
            expect(DIMENSIONAL_LIMITS.bedroom!.aspectRatioMax).toBe(2.5);
        });
        it('pins spec: corridor + balcony minUsableWallM = 0 (skip — no primary furniture)', () => {
            expect(DIMENSIONAL_LIMITS.corridor!.minUsableWallM).toBe(0);
            expect(DIMENSIONAL_LIMITS.balcony!.minUsableWallM).toBe(0);
        });
        it('pins spec: kitchen minUsableWallM = 2.4 (2-base-unit run)', () => {
            expect(DIMENSIONAL_LIMITS.kitchen!.minUsableWallM).toBe(2.4);
        });
        it('pins spec: master_bedroom minUsableWallM = 1.8 (double/queen bed)', () => {
            expect(DIMENSIONAL_LIMITS.master_bedroom!.minUsableWallM).toBe(1.8);
        });

        // Alias rows preserved + mirror canonical numerics across ALL columns.
        it('alias rows preserved + mirror canonical numerics for G-3 + G-5', () => {
            expect(DIMENSIONAL_LIMITS.hall).toEqual(DIMENSIONAL_LIMITS.entrance_hall);
            expect(DIMENSIONAL_LIMITS.utility).toEqual(DIMENSIONAL_LIMITS.utility_room);
            expect(DIMENSIONAL_LIMITS.dining).toEqual(DIMENSIONAL_LIMITS.dining_room);
            expect(DIMENSIONAL_LIMITS.living).toEqual(DIMENSIONAL_LIMITS.living_room);
            expect(DIMENSIONAL_LIMITS.master).toEqual(DIMENSIONAL_LIMITS.master_bedroom);
            expect(DIMENSIONAL_LIMITS.study).toEqual(DIMENSIONAL_LIMITS.private_office);
        });
    });

    // ── G-3 aspect-ratio ────────────────────────────────────────────────────
    describe('G-3 validateAspect', () => {
        it('empty rooms list returns no violations', () => {
            expect(validateAspect([])).toEqual([]);
        });

        it('rooms within their aspect-ratio limits return no violations', () => {
            const v = validateAspect([
                { id: 'r1', type: 'bedroom',  widthM: 3.0, lengthM: 4.0 },   // 1.33:1
                { id: 'r2', type: 'bathroom', widthM: 2.0, lengthM: 3.0 },   // 1.5:1
                { id: 'r3', type: 'living',   widthM: 4.0, lengthM: 6.0 },   // 1.5:1
                { id: 'r4', type: 'kitchen',  widthM: 2.5, lengthM: 8.0 },   // 3.2:1 (under kitchen 3.5)
            ]);
            expect(v).toEqual([]);
        });

        it('flags a "tunnel" bathroom (1.1 m × 5.0 m) with classId G-3', () => {
            const v = validateAspect([{ id: 'tunnel-bath', type: 'bathroom', widthM: 1.1, lengthM: 5.0 }]);
            expect(v.length).toBe(1);
            expect(v[0]!.classId).toBe('G-3');
            expect(v[0]!.roomId).toBe('tunnel-bath');
            expect(v[0]!.roomType).toBe('bathroom');
            expect(v[0]!.observed).toBeCloseTo(5.0 / 1.1, 5);
            expect(v[0]!.maximum).toBe(2.5);
            expect(v[0]!.severity).toBe('error');
            expect(v[0]!.message).toMatch(/G-3/);
            expect(v[0]!.message).toMatch(/bathroom/);
        });

        it('boundary: a bedroom exactly at 2.5:1 does NOT violate (inclusive)', () => {
            // 2.0 × 5.0 = exactly 2.5
            const v = validateAspect([{ id: 'b', type: 'bedroom', widthM: 2.0, lengthM: 5.0 }]);
            expect(v).toEqual([]);
        });

        it('boundary + epsilon: 2.5 + tiny is over the limit', () => {
            // 2.0 × 5.001 = 2.5005 — just over
            const v = validateAspect([{ id: 'b', type: 'bedroom', widthM: 2.0, lengthM: 5.001 }]);
            expect(v.length).toBe(1);
            expect(v[0]!.classId).toBe('G-3');
        });

        it('order of widthM / lengthM does not matter', () => {
            const a = validateAspect([{ id: 'a', type: 'bedroom', widthM: 1.0, lengthM: 5.0 }]);
            const b = validateAspect([{ id: 'a', type: 'bedroom', widthM: 5.0, lengthM: 1.0 }]);
            expect(a).toEqual(b);
            expect(a.length).toBe(1);
        });

        it('unknown room type is SKIPPED with no violation (degrades gracefully)', () => {
            const v = validateAspect([{ id: 'x', type: 'never-heard-of-it', widthM: 1, lengthM: 50 }]);
            expect(v).toEqual([]);
        });

        it('corridor sentinel (aspectRatioMax = Infinity) is SKIPPED even at 20:1', () => {
            const v = validateAspect([{ id: 'c', type: 'corridor', widthM: 1.0, lengthM: 20.0 }]);
            expect(v).toEqual([]);
        });

        it('degenerate room (shorter side = 0) is SKIPPED (no divide-by-zero)', () => {
            const v = validateAspect([{ id: 'd', type: 'bedroom', widthM: 0, lengthM: 5 }]);
            expect(v).toEqual([]);
        });

        it('reports multiple violations in input order (stable output)', () => {
            const v = validateAspect([
                { id: 'r1', type: 'bedroom',  widthM: 1.0, lengthM: 4.0 },  // 4.0:1 fail
                { id: 'r2', type: 'bedroom',  widthM: 2.5, lengthM: 4.0 },  // 1.6:1 OK
                { id: 'r3', type: 'bathroom', widthM: 1.0, lengthM: 3.0 },  // 3.0:1 fail
            ]);
            expect(v.length).toBe(2);
            expect(v[0]!.roomId).toBe('r1');
            expect(v[1]!.roomId).toBe('r3');
        });

        it('a room failing BOTH G-1 (area) AND G-3 (aspect) returns one violation per validator', () => {
            // Corridor 2.0 × 8.0 = 16 m² (over G-1 8 m²) — corridor skips G-3 by sentinel.
            // Use a bathroom instead: 1.1 × 14 ≈ 15.4 m² (over G-1 15) AND 12.7:1 (over G-3 2.5).
            const room = { id: 'big-tunnel-bath', type: 'bathroom', widthM: 1.1, lengthM: 14.0 };
            const aV = validateAreaMax([{ ...room, areaM2: room.widthM * room.lengthM }]);
            const sV = validateAspect([room]);
            expect(aV.length).toBe(1);
            expect(sV.length).toBe(1);
            expect(aV[0]!.classId).toBe('G-1');
            expect(sV[0]!.classId).toBe('G-3');
        });
    });

    // ── G-5 wall-usability ──────────────────────────────────────────────────
    describe('G-5 validateWallUsability', () => {
        it('empty rooms list returns no violations', () => {
            expect(validateWallUsability([])).toEqual([]);
        });

        it('rooms with enough usable wall return no violations', () => {
            const v = validateWallUsability([
                { id: 'r1', type: 'bedroom',        longestUsableWallM: 2.0 },
                { id: 'r2', type: 'master_bedroom', longestUsableWallM: 2.5 },
                { id: 'r3', type: 'kitchen',        longestUsableWallM: 3.0 },
                { id: 'r4', type: 'bathroom',       longestUsableWallM: 1.6 },
            ]);
            expect(v).toEqual([]);
        });

        it('flags a bedroom with no continuous wall ≥ 1.4 m, classId G-5', () => {
            const v = validateWallUsability([{ id: 'choppy-bed', type: 'bedroom', longestUsableWallM: 1.0 }]);
            expect(v.length).toBe(1);
            expect(v[0]!.classId).toBe('G-5');
            expect(v[0]!.roomId).toBe('choppy-bed');
            expect(v[0]!.roomType).toBe('bedroom');
            expect(v[0]!.observed).toBe(1.0);
            expect(v[0]!.maximum).toBe(1.4);
            expect(v[0]!.severity).toBe('error');
            expect(v[0]!.message).toMatch(/G-5/);
            expect(v[0]!.message).toMatch(/bedroom/);
        });

        it('flags a kitchen with no continuous wall ≥ 2.4 m (no 2-base-unit run)', () => {
            const v = validateWallUsability([{ id: 'tiny-kit', type: 'kitchen', longestUsableWallM: 1.5 }]);
            expect(v.length).toBe(1);
            expect(v[0]!.observed).toBe(1.5);
            expect(v[0]!.maximum).toBe(2.4);
        });

        it('boundary: a bedroom exactly at 1.4 m does NOT violate (inclusive)', () => {
            const v = validateWallUsability([{ id: 'b', type: 'bedroom', longestUsableWallM: 1.4 }]);
            expect(v).toEqual([]);
        });

        it('boundary - epsilon: 1.4 minus tiny is under the limit', () => {
            const v = validateWallUsability([{ id: 'b', type: 'bedroom', longestUsableWallM: 1.399 }]);
            expect(v.length).toBe(1);
            expect(v[0]!.classId).toBe('G-5');
        });

        it('unknown room type is SKIPPED with no violation', () => {
            const v = validateWallUsability([{ id: 'x', type: 'mystery', longestUsableWallM: 0 }]);
            expect(v).toEqual([]);
        });

        it('corridor sentinel (minUsableWallM = 0) is SKIPPED even at 0 m usable wall', () => {
            const v = validateWallUsability([{ id: 'c', type: 'corridor', longestUsableWallM: 0 }]);
            expect(v).toEqual([]);
        });

        it('balcony sentinel (minUsableWallM = 0) is SKIPPED even at 0 m usable wall', () => {
            const v = validateWallUsability([{ id: 'bal', type: 'balcony', longestUsableWallM: 0 }]);
            expect(v).toEqual([]);
        });

        it('reports multiple violations in input order (stable output)', () => {
            const v = validateWallUsability([
                { id: 'r1', type: 'bedroom',  longestUsableWallM: 0.5 },   // fail
                { id: 'r2', type: 'bedroom',  longestUsableWallM: 2.0 },   // OK
                { id: 'r3', type: 'bathroom', longestUsableWallM: 0.8 },   // fail
            ]);
            expect(v.length).toBe(2);
            expect(v[0]!.roomId).toBe('r1');
            expect(v[1]!.roomId).toBe('r3');
        });

        it('a room failing BOTH G-1 (area) AND G-5 (wall-usability) returns one violation per validator', () => {
            // Bathroom 18 m² (over G-1 15) AND only 1.0 m usable wall (under G-5 1.5).
            const id = 'huge-yet-unusable-bath';
            const aV = validateAreaMax([{ id, type: 'bathroom', areaM2: 18 }]);
            const wV = validateWallUsability([{ id, type: 'bathroom', longestUsableWallM: 1.0 }]);
            expect(aV.length).toBe(1);
            expect(wV.length).toBe(1);
            expect(aV[0]!.classId).toBe('G-1');
            expect(wV[0]!.classId).toBe('G-5');
        });
    });
});
