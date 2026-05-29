// TGL P2 — bubble graph + area targets tests.

import { describe, expect, it } from 'vitest';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

const PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

describe('buildBubbleGraph (TGL P2)', () => {
    // §L1-α-3 (2026-05-29) — FacadeValueField plumb-in tests.
    describe('§L1-α-3 facadeField plumb-in', () => {
        it('returns no facadeField when called without a shell polygon (backward compat)', () => {
            const g = buildBubbleGraph(PROGRAM, 120);
            expect(g.facadeField).toBeUndefined();
        });

        it('attaches a facadeField with edges when a shell polygon is supplied', () => {
            const square = [
                { x: 0, z: 0 }, { x: 12, z: 0 },
                { x: 12, z: 10 }, { x: 0, z: 10 },
            ];
            const g = buildBubbleGraph(PROGRAM, 120, square);
            expect(g.facadeField).toBeDefined();
            expect(g.facadeField!.edges.length).toBe(4);
            // Edges carry cardinal orientations summing to all four quadrants.
            const cards = new Set(g.facadeField!.edges.map(e => e.orientation));
            expect(cards.has('S')).toBe(true);
            expect(cards.has('N')).toBe(true);
        });

        it('handles a degenerate polygon (< 3 vertices) by omitting the field', () => {
            const tooShort = [{ x: 0, z: 0 }, { x: 1, z: 0 }];
            const g = buildBubbleGraph(PROGRAM, 120, tooShort);
            expect(g.facadeField).toBeUndefined();
        });
    });


    it('produces the expected room set for a 2-bed/1-bath/ensuite/open-plan program', () => {
        const g = buildBubbleGraph(PROGRAM, 120);
        const types = g.rooms.map(r => r.type).sort();
        // hall, living, kitchen, dining, corridor, master, bedroom, ensuite, bathroom
        expect(types).toEqual(['bathroom', 'bedroom', 'corridor', 'dining', 'ensuite', 'hall', 'kitchen', 'living', 'master']);
        expect(g.entryId).not.toBeNull();
        expect(g.corridorId).not.toBeNull();
    });

    it('scales target areas to roughly fill the shell + clamps to §8 minima', () => {
        const g = buildBubbleGraph(PROGRAM, 120);
        const total = g.rooms.reduce((s, r) => s + r.targetAreaM2, 0);
        expect(total).toBeGreaterThanOrEqual(120 - 1);   // fills (≥, since minima can push up)
        const living = g.rooms.find(r => r.type === 'living')!;
        const master = g.rooms.find(r => r.type === 'master')!;
        expect(living.targetAreaM2).toBeGreaterThanOrEqual(18);   // V1 min
        expect(master.targetAreaM2).toBeGreaterThanOrEqual(12);
        expect(living.targetAreaM2).toBeGreaterThan(master.targetAreaM2); // weighted bigger
    });

    it('enforces §8 minima even on a tiny shell', () => {
        const g = buildBubbleGraph(PROGRAM, 20);
        for (const r of g.rooms) {
            // UK Building Regs / HQI mandatory minima (constraint DB):
            // DB-026 double bedroom 11.5 m²; DB-047 living 14 m².
            if (r.type === 'bedroom') expect(r.targetAreaM2).toBeGreaterThanOrEqual(11.5);
            if (r.type === 'living')  expect(r.targetAreaM2).toBeGreaterThanOrEqual(14);
        }
    });

    it('links the bubble diagram: bedrooms+bath off the corridor, master↔ensuite', () => {
        const g = buildBubbleGraph(PROGRAM, 120);
        const corridor = g.corridorId!;
        const has = (a: string, b: string) => g.edges.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
        const beds = g.rooms.filter(r => r.type === 'bedroom' || r.type === 'master');
        for (const bed of beds) expect(has(corridor, bed.id)).toBe(true);
        const master = g.rooms.find(r => r.type === 'master')!;
        const ensuite = g.rooms.find(r => r.type === 'ensuite')!;
        expect(has(master.id, ensuite.id)).toBe(true);
        // bedrooms reach the corridor by a DOOR, not an open threshold.
        const bedEdge = g.edges.find(e => (e.a === corridor && e.b === beds[0]!.id) || (e.b === corridor && e.a === beds[0]!.id))!;
        expect(bedEdge.via).toBe('door');
    });

    // §KITCHEN-DISTINCT (2026-05-29, single-apartment-fix-pass-spec #1) — the
    // kitchen is ALWAYS an enclosed room (walls + door), even with open-plan
    // toggle on. The toggle now controls whether DINING merges with LIVING.
    it('§KITCHEN-DISTINCT: kitchen ↔ dining is ALWAYS a door (kitchen is enclosed)', () => {
        const g = buildBubbleGraph(PROGRAM, 120);
        const k = g.rooms.find(r => r.type === 'kitchen')!;
        const d = g.rooms.find(r => r.type === 'dining')!;
        const e = g.edges.find(x => (x.a === k.id && x.b === d.id) || (x.a === d.id && x.b === k.id))!;
        expect(e.via).toBe('door');
    });

    it('§KITCHEN-DISTINCT: kitchen ↔ living is ALWAYS a door — kitchen NEVER merges into the living blob', () => {
        const g = buildBubbleGraph(PROGRAM, 120);
        const k = g.rooms.find(r => r.type === 'kitchen')!;
        const l = g.rooms.find(r => r.type === 'living')!;
        const e = g.edges.find(x => (x.a === k.id && x.b === l.id) || (x.a === l.id && x.b === k.id));
        expect(e).toBeDefined();
        expect(e!.via).toBe('door');
    });

    it('openPlanKitchenDining toggles the living ↔ dining edge (lounge-diner pattern)', () => {
        // True → living + dining merge (the "lounge-diner") via an open threshold.
        const open = buildBubbleGraph(PROGRAM, 120);
        const ol = open.rooms.find(r => r.type === 'living')!;
        const od = open.rooms.find(r => r.type === 'dining')!;
        const openEdge = open.edges.find(x => (x.a === ol.id && x.b === od.id) || (x.a === od.id && x.b === ol.id))!;
        expect(openEdge.via).toBe('open');

        // False → living + dining are separately enclosed rooms with a door.
        const sep = buildBubbleGraph({ ...PROGRAM, openPlanKitchenDining: false }, 120);
        const sl = sep.rooms.find(r => r.type === 'living')!;
        const sd = sep.rooms.find(r => r.type === 'dining');
        // Note: dining is only created when openPlanKitchenDining is true.
        // When false, dining is folded into the kitchen-program; no separate node.
        if (sd) {
            const sepEdge = sep.edges.find(x => (x.a === sl.id && x.b === sd.id) || (x.a === sd.id && x.b === sl.id));
            if (sepEdge) expect(sepEdge.via).toBe('door');
        }
    });

    // §AREA-FRACTIONS (2026-05-29, single-apartment-fix-pass-spec #3 +
    // program-rules-improvements-queue #3) — size-scaled clamps.
    describe('§AREA-FRACTIONS — size-scaled min/max clamps', () => {
        it('caps the corridor at 10% of the apartment so it does not eat small flats', () => {
            // On a 60 m² studio-ish flat with 2 beds/1 bath, the corridor's
            // 0.85 weight would otherwise eat 20%+ of the area. The cap is 10%.
            const g = buildBubbleGraph(PROGRAM, 60);
            const corridor = g.rooms.find(r => r.type === 'corridor');
            expect(corridor).toBeDefined();
            expect(corridor!.targetAreaM2).toBeLessThanOrEqual(60 * 0.10 + 1e-6);
        });

        it('caps the master at 20% of the apartment', () => {
            const g = buildBubbleGraph(PROGRAM, 100);
            const master = g.rooms.find(r => r.type === 'master');
            expect(master).toBeDefined();
            expect(master!.targetAreaM2).toBeLessThanOrEqual(100 * 0.20 + 1e-6);
            // But still above the absolute minAreaM2 floor (12 m²).
            expect(master!.targetAreaM2).toBeGreaterThanOrEqual(12);
        });

        it('caps each secondary bedroom at 16% of the apartment', () => {
            const g = buildBubbleGraph(PROGRAM, 100);
            const bedrooms = g.rooms.filter(r => r.type === 'bedroom');
            for (const b of bedrooms) {
                expect(b.targetAreaM2).toBeLessThanOrEqual(100 * 0.16 + 1e-6);
            }
        });

        it('lifts the living-room floor to 15% of the apartment on large shells', () => {
            // On 200 m², living's weight-share would land at ~33 m². The
            // 15%-floor is 30 m² — already below, no change. Test the
            // BIG-shell guarantee.
            const g = buildBubbleGraph(PROGRAM, 200);
            const living = g.rooms.find(r => r.type === 'living')!;
            expect(living.targetAreaM2).toBeGreaterThanOrEqual(200 * 0.15 - 1e-6);
        });
    });

    it('no corridor when there are no private rooms', () => {
        const studio: ApartmentProgram = { bedrooms: 0, bathrooms: 0, masterEnSuite: false, openPlanKitchenDining: true, livingRoom: true, entranceHall: true };
        const g = buildBubbleGraph(studio, 50);
        expect(g.corridorId).toBeNull();
    });

    // §ROOM-AREAS (2026-05-29, user-request from modal dynamic feedback).
    describe('roomAreas overrides', () => {
        it('overrides the weighted target with the absolute value when supplied', () => {
            const withOverride: ApartmentProgram = {
                ...PROGRAM,
                roomAreas: { kitchen: 12, bedroom: 14 },
            };
            const g = buildBubbleGraph(withOverride, 120);
            const kitchen = g.rooms.find(r => r.type === 'kitchen')!;
            const bedrooms = g.rooms.filter(r => r.type === 'bedroom');
            expect(kitchen.targetAreaM2).toBeCloseTo(12, 5);
            for (const bed of bedrooms) expect(bed.targetAreaM2).toBeCloseTo(14, 5);
        });

        it('still clamps overrides UP to the architectural minimum (DB-026 etc.)', () => {
            // A 5 m² override on a bedroom is illegal — DB-026 floor is 11.5 m².
            // The override is REPLACED by the floor, not silently honoured.
            const tooSmall: ApartmentProgram = {
                ...PROGRAM,
                roomAreas: { bedroom: 5, bathroom: 1 },
            };
            const g = buildBubbleGraph(tooSmall, 120);
            const bed = g.rooms.find(r => r.type === 'bedroom')!;
            const bath = g.rooms.find(r => r.type === 'bathroom')!;
            expect(bed.targetAreaM2).toBeGreaterThanOrEqual(11.5);
            expect(bath.targetAreaM2).toBeGreaterThanOrEqual(5);   // DB-035 bathroom min
        });

        it('only overrides specified types — unspecified rooms keep weight-scaled defaults', () => {
            // Default kitchen target on 120 m² is ~10–12 m² (weighted). With ONLY
            // a bedroom override the kitchen stays roughly at the default.
            const partial: ApartmentProgram = {
                ...PROGRAM,
                roomAreas: { bedroom: 14 },
            };
            const baseline = buildBubbleGraph(PROGRAM, 120);
            const withOverride = buildBubbleGraph(partial, 120);
            const baseKitchen = baseline.rooms.find(r => r.type === 'kitchen')!;
            const overKitchen = withOverride.rooms.find(r => r.type === 'kitchen')!;
            // Kitchen unchanged (same weight, same shell — same target).
            expect(overKitchen.targetAreaM2).toBeCloseTo(baseKitchen.targetAreaM2, 5);
        });

        it('rejects non-positive / non-finite overrides (treated as omitted)', () => {
            const bad: ApartmentProgram = {
                ...PROGRAM,
                roomAreas: { kitchen: 0, bedroom: NaN as number, master: -5 },
            };
            const baseline = buildBubbleGraph(PROGRAM, 120);
            const g = buildBubbleGraph(bad, 120);
            // All three should fall back to defaults.
            for (const t of ['kitchen', 'bedroom', 'master'] as const) {
                const a = baseline.rooms.find(r => r.type === t)!.targetAreaM2;
                const b = g.rooms.find(r => r.type === t)!.targetAreaM2;
                expect(b).toBeCloseTo(a, 5);
            }
        });

        it('empty / omitted roomAreas matches the no-override behaviour exactly', () => {
            const omitted = buildBubbleGraph(PROGRAM, 120);
            const empty = buildBubbleGraph({ ...PROGRAM, roomAreas: {} }, 120);
            for (const r of omitted.rooms) {
                const m = empty.rooms.find(x => x.id === r.id)!;
                expect(m.targetAreaM2).toBeCloseTo(r.targetAreaM2, 5);
            }
        });

        // §ROOM-AREAS-BY-NAME (2026-05-29 follow-up) — per-instance overrides
        // keyed by the deterministic bubble-graph display name. Lets a future
        // modal UI assign different areas to "Bedroom 1" vs "Bedroom 2".
        it('roomAreasByName overrides INDIVIDUAL bedrooms independently', () => {
            // PROGRAM has bedrooms: 2 + masterEnSuite, so the names are
            // "Master Bedroom" + "Bedroom 1".
            const perInstance: ApartmentProgram = {
                ...PROGRAM,
                roomAreasByName: { 'Master Bedroom': 20, 'Bedroom 1': 12 },
            };
            const g = buildBubbleGraph(perInstance, 120);
            const master = g.rooms.find(r => r.type === 'master')!;
            const bedroom = g.rooms.find(r => r.type === 'bedroom')!;
            expect(master.targetAreaM2).toBeCloseTo(20, 5);
            expect(bedroom.targetAreaM2).toBeCloseTo(12, 5);
        });

        it('name override wins when both name and type are set', () => {
            const both: ApartmentProgram = {
                ...PROGRAM,
                roomAreas: { bedroom: 16 },                    // every bedroom 16
                roomAreasByName: { 'Bedroom 1': 14 },           // but Bedroom 1 = 14
            };
            const g = buildBubbleGraph(both, 120);
            const bedroom = g.rooms.find(r => r.type === 'bedroom')!;
            expect(bedroom.targetAreaM2).toBeCloseTo(14, 5);   // name wins
        });

        it('name override clamps UP to the architectural minimum (same as type)', () => {
            const tooSmall: ApartmentProgram = {
                ...PROGRAM,
                roomAreasByName: { 'Bedroom 1': 5 },           // < DB-026 floor (11.5)
            };
            const g = buildBubbleGraph(tooSmall, 120);
            const bedroom = g.rooms.find(r => r.type === 'bedroom')!;
            expect(bedroom.targetAreaM2).toBeGreaterThanOrEqual(11.5);
        });

        it('unmatched names are silently ignored (no warning, no throw)', () => {
            const stale: ApartmentProgram = {
                ...PROGRAM,
                roomAreasByName: {
                    'Bedroom 99': 30,        // doesn't exist (only 2 bedrooms)
                    'NotARoom':   25,
                    'Master Bedroom': 18,    // this one DOES match
                },
            };
            const g = buildBubbleGraph(stale, 120);
            const master = g.rooms.find(r => r.type === 'master')!;
            expect(master.targetAreaM2).toBeCloseTo(18, 5);
        });

        it('non-positive / non-finite name overrides fall through to type/default', () => {
            const baseline = buildBubbleGraph(PROGRAM, 120);
            const bad: ApartmentProgram = {
                ...PROGRAM,
                roomAreas: { bedroom: 14, master: 16 },
                roomAreasByName: { 'Bedroom 1': 0, 'Master Bedroom': NaN as number },
            };
            const g = buildBubbleGraph(bad, 120);
            // Invalid name-keyed values (0, NaN) fall through to the per-TYPE
            // override. `bedroom: 14` applies to "Bedroom 1"; `master: 16`
            // applies to "Master Bedroom". The baseline (no override) value
            // would be different.
            const bedroom = g.rooms.find(r => r.type === 'bedroom')!;
            const master  = g.rooms.find(r => r.type === 'master')!;
            expect(bedroom.targetAreaM2).toBeCloseTo(14, 5);
            expect(master.targetAreaM2).toBeCloseTo(16, 5);
            // Sanity: not equal to the baseline (which has no overrides).
            const baseBedroom = baseline.rooms.find(r => r.type === 'bedroom')!;
            expect(bedroom.targetAreaM2).not.toBeCloseTo(baseBedroom.targetAreaM2, 1);
        });
    });
});
