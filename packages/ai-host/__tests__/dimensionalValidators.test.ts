// G-1 (area-max) + G-2 (width-max) + G-3 (aspect-ratio) + G-5 (wall-usability)
// + G-6 (circulation-width) + G-7 (frontage) + G-8 (hierarchy) + G-10
// (lighting) dimensional validators — slices of the 10 G-classes from
// `docs/03_PRYZM3/APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md`
// §G-class table. Pin every behavioural contract as an executable assertion.

import { describe, expect, it } from 'vitest';
import {
    DIMENSIONAL_LIMITS,
    limitsFor,
    validateAreaMax,
    validateAspect,
    validateCirculationWidth,
    validateFrontage,
    validateHierarchy,
    validateLighting,
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

        it('G-6 + G-7 columns are either undefined (skip) or a positive number', () => {
            for (const [type, l] of Object.entries(DIMENSIONAL_LIMITS)) {
                // minCirculationWidthM: undefined (skip) OR a positive number.
                if (l.minCirculationWidthM !== undefined) {
                    expect(typeof l.minCirculationWidthM, `${type}.minCirculationWidthM`).toBe('number');
                    expect(l.minCirculationWidthM, `${type}.minCirculationWidthM`).toBeGreaterThan(0);
                }
                // minFrontageM: undefined (skip) OR a positive number.
                if (l.minFrontageM !== undefined) {
                    expect(typeof l.minFrontageM, `${type}.minFrontageM`).toBe('number');
                    expect(l.minFrontageM, `${type}.minFrontageM`).toBeGreaterThan(0);
                }
            }
        });

        // G-6 + G-7 pins — keep the headline spec values executable.
        it('pins spec: corridor minCirculationWidthM = 1.0 m (Part M wheelchair pass-through)', () => {
            expect(DIMENSIONAL_LIMITS.corridor!.minCirculationWidthM).toBe(1.0);
        });
        it('pins spec: entrance_hall minCirculationWidthM = 1.2 m (door swing + carrying)', () => {
            expect(DIMENSIONAL_LIMITS.entrance_hall!.minCirculationWidthM).toBe(1.2);
            expect(DIMENSIONAL_LIMITS.hall!.minCirculationWidthM).toBe(1.2);
        });
        it('pins spec: bathroom + wc + ensuite SKIP G-6 (not a circulation room)', () => {
            expect(DIMENSIONAL_LIMITS.bathroom!.minCirculationWidthM).toBeUndefined();
            expect(DIMENSIONAL_LIMITS.wc!.minCirculationWidthM).toBeUndefined();
            expect(DIMENSIONAL_LIMITS.ensuite!.minCirculationWidthM).toBeUndefined();
        });
        it('pins spec: living minFrontageM = 2.5 m / master minFrontageM = 2.0 m', () => {
            expect(DIMENSIONAL_LIMITS.living!.minFrontageM).toBe(2.5);
            expect(DIMENSIONAL_LIMITS.living_room!.minFrontageM).toBe(2.5);
            expect(DIMENSIONAL_LIMITS.master!.minFrontageM).toBe(2.0);
            expect(DIMENSIONAL_LIMITS.master_bedroom!.minFrontageM).toBe(2.0);
        });
        it('pins spec: kitchen + bedroom + study minFrontageM = 1.5 m', () => {
            expect(DIMENSIONAL_LIMITS.kitchen!.minFrontageM).toBe(1.5);
            expect(DIMENSIONAL_LIMITS.bedroom!.minFrontageM).toBe(1.5);
            expect(DIMENSIONAL_LIMITS.study!.minFrontageM).toBe(1.5);
            expect(DIMENSIONAL_LIMITS.private_office!.minFrontageM).toBe(1.5);
        });
        it('pins spec: no-daylight rooms SKIP G-7 (corridor/hall/bathroom/wc/ensuite/utility/storage/balcony)', () => {
            for (const t of ['corridor', 'hall', 'entrance_hall', 'bathroom', 'wc', 'ensuite',
                             'utility', 'utility_room', 'storage', 'balcony']) {
                expect(DIMENSIONAL_LIMITS[t]!.minFrontageM, `${t}.minFrontageM`).toBeUndefined();
            }
        });

        it('limitsFor returns undefined for an unknown type', () => {
            expect(limitsFor('not-a-real-room')).toBeUndefined();
        });

        // Pin the headline spec values so changes are deliberate.
        it('pins spec: corridor = 8 m² / 2.5 m', () => {
            // G-1 + G-2 pinned at full structural equality including the G-3 + G-5
            // sentinel columns (corridor is exempt from G-3 + G-5 — aspectRatioMax
            // = Infinity, minUsableWallM = 0) AND the G-6 + G-7 columns (corridor
            // OWNS G-6 = 1.0 m Part M; corridor SKIPS G-7 = undefined).
            expect(DIMENSIONAL_LIMITS.corridor).toEqual({
                areaMaxM2: 8, widthMaxM: 2.5, aspectRatioMax: Infinity, minUsableWallM: 0,
                minCirculationWidthM: 1.0, minFrontageM: undefined, minLightRatio: undefined,
            });
        });
        it('pins spec: bathroom = 15 m² / 3.0 m (wet-room threshold)', () => {
            // G-6 + G-7 both SKIP for bathroom (not a circulation room; no
            // daylight requirement — artificial light + extract acceptable).
            expect(DIMENSIONAL_LIMITS.bathroom).toEqual({
                areaMaxM2: 15, widthMaxM: 3.0, aspectRatioMax: 2.5, minUsableWallM: 1.5,
                minCirculationWidthM: undefined, minFrontageM: undefined, minLightRatio: undefined,
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

    // ── G-6 circulation-width ───────────────────────────────────────────────
    describe('G-6 validateCirculationWidth', () => {
        it('empty rooms list returns no violations', () => {
            expect(validateCirculationWidth([])).toEqual([]);
        });

        it('circulation rooms within their width floor return no violations', () => {
            const v = validateCirculationWidth([
                { id: 'c1', type: 'corridor',      widthM: 1.2 },   // ≥ 1.0
                { id: 'c2', type: 'corridor',      widthM: 1.0 },   // boundary
                { id: 'h1', type: 'entrance_hall', widthM: 1.5 },   // ≥ 1.2
                { id: 'h2', type: 'hall',          widthM: 1.2 },   // boundary
            ]);
            expect(v).toEqual([]);
        });

        it('flags a 0.9 m corridor (Part M wheelchair fail) with classId G-6', () => {
            const v = validateCirculationWidth([{ id: 'tight-corridor', type: 'corridor', widthM: 0.9 }]);
            expect(v.length).toBe(1);
            expect(v[0]!.classId).toBe('G-6');
            expect(v[0]!.roomId).toBe('tight-corridor');
            expect(v[0]!.roomType).toBe('corridor');
            expect(v[0]!.observed).toBe(0.9);
            expect(v[0]!.maximum).toBe(1.0);
            expect(v[0]!.severity).toBe('error');
            expect(v[0]!.message).toMatch(/G-6/);
            expect(v[0]!.message).toMatch(/corridor/);
        });

        it('flags an entrance_hall narrower than 1.2 m', () => {
            const v = validateCirculationWidth([{ id: 'h', type: 'entrance_hall', widthM: 1.0 }]);
            expect(v.length).toBe(1);
            expect(v[0]!.observed).toBe(1.0);
            expect(v[0]!.maximum).toBe(1.2);
        });

        it('boundary: a corridor exactly at 1.0 m does NOT violate (inclusive)', () => {
            const v = validateCirculationWidth([{ id: 'c', type: 'corridor', widthM: 1.0 }]);
            expect(v).toEqual([]);
        });

        it('boundary - epsilon: 1.0 minus tiny IS a violation', () => {
            const v = validateCirculationWidth([{ id: 'c', type: 'corridor', widthM: 0.999 }]);
            expect(v.length).toBe(1);
            expect(v[0]!.classId).toBe('G-6');
        });

        it('unknown room type is SKIPPED with no violation', () => {
            const v = validateCirculationWidth([{ id: 'x', type: 'mystery', widthM: 0 }]);
            expect(v).toEqual([]);
        });

        it('non-circulation rooms (bathroom / bedroom / living / kitchen) are SKIPPED even at 0 m wide', () => {
            const v = validateCirculationWidth([
                { id: 'b',  type: 'bathroom', widthM: 0 },
                { id: 'bd', type: 'bedroom',  widthM: 0.5 },
                { id: 'l',  type: 'living',   widthM: 0 },
                { id: 'k',  type: 'kitchen',  widthM: 0.1 },
                { id: 's',  type: 'storage',  widthM: 0 },
            ]);
            expect(v).toEqual([]);
        });

        it('reports multiple violations in input order (stable output)', () => {
            const v = validateCirculationWidth([
                { id: 'r1', type: 'corridor',      widthM: 0.7 },   // fail
                { id: 'r2', type: 'bedroom',       widthM: 0.5 },   // skipped (non-circulation)
                { id: 'r3', type: 'entrance_hall', widthM: 0.9 },   // fail
            ]);
            expect(v.length).toBe(2);
            expect(v[0]!.roomId).toBe('r1');
            expect(v[1]!.roomId).toBe('r3');
        });

        it('a corridor failing BOTH G-2 (width-max) AND G-6 (width-min) is impossible (max 2.5 > min 1.0) — but the two validators independently respect their direction', () => {
            // Same 3.0 m corridor — fails G-2 (wider than 2.5), passes G-6 (wider than 1.0).
            const room = { id: 'wide', type: 'corridor', widthM: 3.0 };
            const wMax = validateWidthMax([room]);
            const wMin = validateCirculationWidth([room]);
            expect(wMax.length).toBe(1);
            expect(wMin.length).toBe(0);
            expect(wMax[0]!.classId).toBe('G-2');
        });
    });

    // ── G-7 frontage ────────────────────────────────────────────────────────
    describe('G-7 validateFrontage', () => {
        it('empty rooms list returns no violations', () => {
            expect(validateFrontage([])).toEqual([]);
        });

        it('rooms with enough external frontage return no violations', () => {
            const v = validateFrontage([
                { id: 'r1', type: 'living',         externalFrontageM: 3.0 },   // ≥ 2.5
                { id: 'r2', type: 'master',         externalFrontageM: 2.0 },   // boundary
                { id: 'r3', type: 'bedroom',        externalFrontageM: 1.8 },   // ≥ 1.5
                { id: 'r4', type: 'kitchen',        externalFrontageM: 2.5 },   // ≥ 1.5
                { id: 'r5', type: 'dining',         externalFrontageM: 2.0 },   // boundary
                { id: 'r6', type: 'study',          externalFrontageM: 1.5 },   // boundary
            ]);
            expect(v).toEqual([]);
        });

        it('flags a 1.0 m-frontage living room (under 2.5 m) with classId G-7', () => {
            const v = validateFrontage([{ id: 'deep-living', type: 'living', externalFrontageM: 1.0 }]);
            expect(v.length).toBe(1);
            expect(v[0]!.classId).toBe('G-7');
            expect(v[0]!.roomId).toBe('deep-living');
            expect(v[0]!.roomType).toBe('living');
            expect(v[0]!.observed).toBe(1.0);
            expect(v[0]!.maximum).toBe(2.5);
            expect(v[0]!.severity).toBe('error');
            expect(v[0]!.message).toMatch(/G-7/);
            expect(v[0]!.message).toMatch(/living/);
        });

        it('flags a bedroom with 0.6 m external frontage (under 1.5 m)', () => {
            const v = validateFrontage([{ id: 'b', type: 'bedroom', externalFrontageM: 0.6 }]);
            expect(v.length).toBe(1);
            expect(v[0]!.observed).toBe(0.6);
            expect(v[0]!.maximum).toBe(1.5);
        });

        it('flags a master_bedroom with 1.5 m frontage (under 2.0 m)', () => {
            const v = validateFrontage([{ id: 'm', type: 'master_bedroom', externalFrontageM: 1.5 }]);
            expect(v.length).toBe(1);
            expect(v[0]!.observed).toBe(1.5);
            expect(v[0]!.maximum).toBe(2.0);
        });

        it('boundary: a living room exactly at 2.5 m does NOT violate (inclusive)', () => {
            const v = validateFrontage([{ id: 'l', type: 'living', externalFrontageM: 2.5 }]);
            expect(v).toEqual([]);
        });

        it('boundary - epsilon: 2.5 minus tiny IS a violation', () => {
            const v = validateFrontage([{ id: 'l', type: 'living', externalFrontageM: 2.499 }]);
            expect(v.length).toBe(1);
            expect(v[0]!.classId).toBe('G-7');
        });

        it('unknown room type is SKIPPED with no violation', () => {
            const v = validateFrontage([{ id: 'x', type: 'mystery', externalFrontageM: 0 }]);
            expect(v).toEqual([]);
        });

        it('no-daylight rooms are SKIPPED even at 0 m frontage', () => {
            // corridor, hall, bathroom, wc, ensuite, utility, storage, balcony.
            const v = validateFrontage([
                { id: 'c',   type: 'corridor',     externalFrontageM: 0 },
                { id: 'h',   type: 'hall',         externalFrontageM: 0 },
                { id: 'b',   type: 'bathroom',     externalFrontageM: 0 },
                { id: 'w',   type: 'wc',           externalFrontageM: 0 },
                { id: 'e',   type: 'ensuite',      externalFrontageM: 0 },
                { id: 'u',   type: 'utility',      externalFrontageM: 0 },
                { id: 's',   type: 'storage',      externalFrontageM: 0 },
                { id: 'bal', type: 'balcony',      externalFrontageM: 0 },
            ]);
            expect(v).toEqual([]);
        });

        it('reports multiple violations in input order (stable output)', () => {
            const v = validateFrontage([
                { id: 'r1', type: 'living',  externalFrontageM: 1.0 },   // fail
                { id: 'r2', type: 'bedroom', externalFrontageM: 2.0 },   // OK
                { id: 'r3', type: 'kitchen', externalFrontageM: 1.0 },   // fail
                { id: 'r4', type: 'storage', externalFrontageM: 0 },     // skipped
            ]);
            expect(v.length).toBe(2);
            expect(v[0]!.roomId).toBe('r1');
            expect(v[1]!.roomId).toBe('r3');
        });

        it('mixes daylight + no-daylight rooms cleanly', () => {
            const v = validateFrontage([
                { id: 'corr', type: 'corridor', externalFrontageM: 0   },   // skipped
                { id: 'liv',  type: 'living',   externalFrontageM: 3.0 },   // OK
                { id: 'bed',  type: 'bedroom',  externalFrontageM: 1.0 },   // fail
                { id: 'bath', type: 'bathroom', externalFrontageM: 0   },   // skipped
            ]);
            expect(v.length).toBe(1);
            expect(v[0]!.roomId).toBe('bed');
            expect(v[0]!.classId).toBe('G-7');
        });

        it('a room failing BOTH G-1 (area) AND G-7 (frontage) returns one violation per validator', () => {
            // Living 70 m² (over G-1 60) AND 1.0 m frontage (under G-7 2.5).
            const id = 'huge-deep-living';
            const aV = validateAreaMax([{ id, type: 'living', areaM2: 70 }]);
            const fV = validateFrontage([{ id, type: 'living', externalFrontageM: 1.0 }]);
            expect(aV.length).toBe(1);
            expect(fV.length).toBe(1);
            expect(aV[0]!.classId).toBe('G-1');
            expect(fV[0]!.classId).toBe('G-7');
        });
    });

    // ── G-8 hierarchy (apartment-level relational) ──────────────────────────
    describe('G-8 validateHierarchy', () => {
        it('empty rooms list returns no violations', () => {
            expect(validateHierarchy([])).toEqual([]);
        });

        it('apartment with NO social room is SKIPPED (no hierarchy to judge)', () => {
            const v = validateHierarchy([
                { id: 'b1', type: 'bedroom',        areaM2: 12 },
                { id: 'b2', type: 'master_bedroom', areaM2: 18 },
                { id: 'k',  type: 'kitchen',        areaM2: 10 },
            ]);
            expect(v).toEqual([]);
        });

        it('apartment with NO private room is SKIPPED (no hierarchy to judge)', () => {
            const v = validateHierarchy([
                { id: 'l', type: 'living',  areaM2: 25 },
                { id: 'k', type: 'kitchen', areaM2: 12 },
            ]);
            expect(v).toEqual([]);
        });

        it('hierarchy-OK plan returns no violations', () => {
            // living 30 > master 18; kitchen 12 ≥ smallest bedroom 10
            const v = validateHierarchy([
                { id: 'l',  type: 'living',         areaM2: 30 },
                { id: 'm',  type: 'master_bedroom', areaM2: 18 },
                { id: 'b1', type: 'bedroom',        areaM2: 10 },
                { id: 'k',  type: 'kitchen',        areaM2: 12 },
            ]);
            expect(v).toEqual([]);
        });

        it('flags social-too-small (master > living) with classId G-8', () => {
            // master 25 > living 20 — hierarchy inverted.
            const v = validateHierarchy([
                { id: 'l', type: 'living',         areaM2: 20 },
                { id: 'm', type: 'master_bedroom', areaM2: 25 },
            ]);
            expect(v.length).toBe(1);
            expect(v[0]!.classId).toBe('G-8');
            expect(v[0]!.roomId).toBe('l');
            expect(v[0]!.roomType).toBe('living');
            expect(v[0]!.observed).toBe(20);
            expect(v[0]!.maximum).toBe(25);
            expect(v[0]!.severity).toBe('error');
            expect(v[0]!.message).toMatch(/G-8/);
            expect(v[0]!.message).toMatch(/hierarchy/);
        });

        it('flags kitchen-too-small (kitchen < smallest bedroom)', () => {
            // living 30 > master 18 (rule a OK); kitchen 8 < smallest bedroom 10 (rule b fails).
            const v = validateHierarchy([
                { id: 'l',  type: 'living',         areaM2: 30 },
                { id: 'm',  type: 'master_bedroom', areaM2: 18 },
                { id: 'b1', type: 'bedroom',        areaM2: 10 },
                { id: 'k',  type: 'kitchen',        areaM2: 8 },
            ]);
            expect(v.length).toBe(1);
            expect(v[0]!.classId).toBe('G-8');
            expect(v[0]!.roomId).toBe('k');
            expect(v[0]!.roomType).toBe('kitchen');
            expect(v[0]!.observed).toBe(8);
            expect(v[0]!.maximum).toBe(10);
            expect(v[0]!.message).toMatch(/kitchen/);
        });

        it('boundary: living EQUAL to largest private is a violation (strict greater-than)', () => {
            const v = validateHierarchy([
                { id: 'l', type: 'living', areaM2: 20 },
                { id: 'm', type: 'master_bedroom', areaM2: 20 },
            ]);
            expect(v.length).toBe(1);
            expect(v[0]!.classId).toBe('G-8');
            expect(v[0]!.roomId).toBe('l');
        });

        it('boundary: kitchen EXACTLY equal to smallest private is OK (inclusive)', () => {
            const v = validateHierarchy([
                { id: 'l', type: 'living',         areaM2: 30 },
                { id: 'm', type: 'master_bedroom', areaM2: 18 },
                { id: 'b', type: 'bedroom',        areaM2: 10 },
                { id: 'k', type: 'kitchen',        areaM2: 10 },
            ]);
            expect(v).toEqual([]);
        });

        it('apartment with no kitchen SKIPS the kitchen rule (rule b)', () => {
            // hierarchy rule a OK; no kitchen → rule b skipped → no violations.
            const v = validateHierarchy([
                { id: 'l', type: 'living',         areaM2: 25 },
                { id: 'm', type: 'master_bedroom', areaM2: 18 },
                { id: 'b', type: 'bedroom',        areaM2: 10 },
            ]);
            expect(v).toEqual([]);
        });

        it('emits BOTH violations when both rules fail', () => {
            // master 30 > living 20 (rule a fail); kitchen 5 < smallest bedroom 10 (rule b fail).
            const v = validateHierarchy([
                { id: 'l',  type: 'living',         areaM2: 20 },
                { id: 'm',  type: 'master_bedroom', areaM2: 30 },
                { id: 'b1', type: 'bedroom',        areaM2: 10 },
                { id: 'k',  type: 'kitchen',        areaM2: 5 },
            ]);
            expect(v.length).toBe(2);
            // Rule (a) ordered before rule (b).
            expect(v[0]!.roomId).toBe('l');
            expect(v[1]!.roomId).toBe('k');
            expect(v[0]!.classId).toBe('G-8');
            expect(v[1]!.classId).toBe('G-8');
        });

        it('considers ALL social rooms (dining counts) when picking largest social', () => {
            // dining 22 > master 20 — hierarchy OK (largest social is dining, not living).
            const v = validateHierarchy([
                { id: 'l', type: 'living',         areaM2: 15 },
                { id: 'd', type: 'dining',         areaM2: 22 },
                { id: 'm', type: 'master_bedroom', areaM2: 20 },
            ]);
            expect(v).toEqual([]);
        });

        it('attributes social-too-small violation to the LARGEST social room', () => {
            // Largest social is dining (18); smallest private (bedroom 25). dining 18 < bedroom 25.
            const v = validateHierarchy([
                { id: 'l',  type: 'living',         areaM2: 10 },
                { id: 'd',  type: 'dining',         areaM2: 18 },
                { id: 'b1', type: 'bedroom',        areaM2: 25 },
            ]);
            expect(v.length).toBe(1);
            expect(v[0]!.roomId).toBe('d');
            expect(v[0]!.roomType).toBe('dining');
        });

        it('every violation severity is "error"', () => {
            const v = validateHierarchy([
                { id: 'l', type: 'living',         areaM2: 20 },
                { id: 'm', type: 'master_bedroom', areaM2: 25 },
                { id: 'b', type: 'bedroom',        areaM2: 10 },
                { id: 'k', type: 'kitchen',        areaM2: 5 },
            ]);
            for (const x of v) expect(x.severity).toBe('error');
        });
    });

    // ── G-10 lighting (window-to-floor-area ratio) ──────────────────────────
    describe('G-10 validateLighting', () => {
        it('empty rooms list returns no violations', () => {
            expect(validateLighting([])).toEqual([]);
        });

        it('rooms within their light ratio return no violations', () => {
            const v = validateLighting([
                { id: 'l', type: 'living',         areaM2: 20, glazedAreaM2: 3.0 },   // 0.15 ≥ 0.10
                { id: 'b', type: 'bedroom',        areaM2: 12, glazedAreaM2: 1.5 },   // 0.125
                { id: 'k', type: 'kitchen',        areaM2: 10, glazedAreaM2: 1.2 },   // 0.12
                { id: 'm', type: 'master_bedroom', areaM2: 18, glazedAreaM2: 2.0 },   // ~0.111
            ]);
            expect(v).toEqual([]);
        });

        it('flags a living room below the 10% ratio with classId G-10', () => {
            // 20 m² floor, 1.0 m² glazing → 0.05 < 0.10.
            const v = validateLighting([{ id: 'dark-living', type: 'living', areaM2: 20, glazedAreaM2: 1.0 }]);
            expect(v.length).toBe(1);
            expect(v[0]!.classId).toBe('G-10');
            expect(v[0]!.roomId).toBe('dark-living');
            expect(v[0]!.roomType).toBe('living');
            expect(v[0]!.observed).toBeCloseTo(0.05, 5);
            expect(v[0]!.maximum).toBe(0.10);
            expect(v[0]!.severity).toBe('error');
            expect(v[0]!.message).toMatch(/G-10/);
            expect(v[0]!.message).toMatch(/living/);
        });

        it('flags a bedroom with no glazing', () => {
            const v = validateLighting([{ id: 'b', type: 'bedroom', areaM2: 12, glazedAreaM2: 0 }]);
            expect(v.length).toBe(1);
            expect(v[0]!.observed).toBe(0);
            expect(v[0]!.maximum).toBe(0.10);
        });

        it('boundary: a kitchen exactly at 0.10 ratio does NOT violate (inclusive)', () => {
            // 10 m² floor, 1.0 m² glazing → 0.10 exactly.
            const v = validateLighting([{ id: 'k', type: 'kitchen', areaM2: 10, glazedAreaM2: 1.0 }]);
            expect(v).toEqual([]);
        });

        it('boundary - epsilon: 0.10 minus tiny IS a violation', () => {
            // 10 m² floor, 0.999 m² glazing → 0.0999 < 0.10.
            const v = validateLighting([{ id: 'k', type: 'kitchen', areaM2: 10, glazedAreaM2: 0.999 }]);
            expect(v.length).toBe(1);
            expect(v[0]!.classId).toBe('G-10');
        });

        it('unknown room type is SKIPPED with no violation', () => {
            const v = validateLighting([{ id: 'x', type: 'mystery', areaM2: 10, glazedAreaM2: 0 }]);
            expect(v).toEqual([]);
        });

        it('undefined-rule rooms (bathroom/wc/ensuite/utility/corridor/hall/storage/balcony) are SKIPPED even at 0 glazing', () => {
            const v = validateLighting([
                { id: 'b',   type: 'bathroom', areaM2: 6,  glazedAreaM2: 0 },
                { id: 'w',   type: 'wc',       areaM2: 3,  glazedAreaM2: 0 },
                { id: 'e',   type: 'ensuite',  areaM2: 5,  glazedAreaM2: 0 },
                { id: 'u',   type: 'utility',  areaM2: 4,  glazedAreaM2: 0 },
                { id: 'c',   type: 'corridor', areaM2: 5,  glazedAreaM2: 0 },
                { id: 'h',   type: 'hall',     areaM2: 6,  glazedAreaM2: 0 },
                { id: 's',   type: 'storage',  areaM2: 3,  glazedAreaM2: 0 },
                { id: 'bal', type: 'balcony',  areaM2: 8,  glazedAreaM2: 0 },
            ]);
            expect(v).toEqual([]);
        });

        it('degenerate room (areaM2 = 0) is SKIPPED (no divide-by-zero)', () => {
            const v = validateLighting([{ id: 'd', type: 'living', areaM2: 0, glazedAreaM2: 0 }]);
            expect(v).toEqual([]);
        });

        it('reports multiple violations in input order (stable output)', () => {
            const v = validateLighting([
                { id: 'r1', type: 'living',  areaM2: 20, glazedAreaM2: 1.0 },   // 0.05 fail
                { id: 'r2', type: 'bedroom', areaM2: 12, glazedAreaM2: 2.0 },   // 0.167 OK
                { id: 'r3', type: 'kitchen', areaM2: 10, glazedAreaM2: 0.5 },   // 0.05 fail
                { id: 'r4', type: 'bathroom', areaM2: 6, glazedAreaM2: 0 },     // skipped
            ]);
            expect(v.length).toBe(2);
            expect(v[0]!.roomId).toBe('r1');
            expect(v[1]!.roomId).toBe('r3');
        });

        it('mixes daylight + no-daylight rooms cleanly', () => {
            const v = validateLighting([
                { id: 'corr', type: 'corridor', areaM2: 5,  glazedAreaM2: 0 },     // skipped
                { id: 'liv',  type: 'living',   areaM2: 20, glazedAreaM2: 3.0 },   // OK
                { id: 'bed',  type: 'bedroom',  areaM2: 12, glazedAreaM2: 0.5 },   // fail (0.042)
                { id: 'bath', type: 'bathroom', areaM2: 6,  glazedAreaM2: 0 },     // skipped
            ]);
            expect(v.length).toBe(1);
            expect(v[0]!.roomId).toBe('bed');
            expect(v[0]!.classId).toBe('G-10');
        });
    });

    // ── DIMENSIONAL_LIMITS G-10 column integrity ────────────────────────────
    describe('DIMENSIONAL_LIMITS G-10 column', () => {
        it('every entry has a minLightRatio column (undefined or in (0,1])', () => {
            for (const [type, l] of Object.entries(DIMENSIONAL_LIMITS)) {
                if (l.minLightRatio !== undefined) {
                    expect(typeof l.minLightRatio, `${type}.minLightRatio`).toBe('number');
                    expect(l.minLightRatio, `${type}.minLightRatio`).toBeGreaterThan(0);
                    expect(l.minLightRatio, `${type}.minLightRatio`).toBeLessThanOrEqual(1);
                }
            }
        });

        it('pins spec: living / bedroom / master / kitchen / dining / study minLightRatio = 0.10 (Part F1)', () => {
            for (const t of ['living', 'living_room', 'bedroom', 'master', 'master_bedroom',
                             'kitchen', 'dining', 'dining_room', 'study', 'private_office']) {
                expect(DIMENSIONAL_LIMITS[t]!.minLightRatio, `${t}.minLightRatio`).toBe(0.10);
            }
        });

        it('pins spec: no-daylight rooms SKIP G-10 (undefined)', () => {
            for (const t of ['corridor', 'hall', 'entrance_hall', 'bathroom', 'wc', 'ensuite',
                             'utility', 'utility_room', 'storage', 'balcony']) {
                expect(DIMENSIONAL_LIMITS[t]!.minLightRatio, `${t}.minLightRatio`).toBeUndefined();
            }
        });

        it('alias rows still mirror canonical numerics for G-10', () => {
            expect(DIMENSIONAL_LIMITS.living!.minLightRatio).toBe(DIMENSIONAL_LIMITS.living_room!.minLightRatio);
            expect(DIMENSIONAL_LIMITS.master!.minLightRatio).toBe(DIMENSIONAL_LIMITS.master_bedroom!.minLightRatio);
            expect(DIMENSIONAL_LIMITS.dining!.minLightRatio).toBe(DIMENSIONAL_LIMITS.dining_room!.minLightRatio);
            expect(DIMENSIONAL_LIMITS.study!.minLightRatio).toBe(DIMENSIONAL_LIMITS.private_office!.minLightRatio);
            expect(DIMENSIONAL_LIMITS.utility!.minLightRatio).toBe(DIMENSIONAL_LIMITS.utility_room!.minLightRatio);
            expect(DIMENSIONAL_LIMITS.hall!.minLightRatio).toBe(DIMENSIONAL_LIMITS.entrance_hall!.minLightRatio);
        });
    });
});
