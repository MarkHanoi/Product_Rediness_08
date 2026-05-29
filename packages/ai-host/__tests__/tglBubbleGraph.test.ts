// TGL P2 — bubble graph + area targets tests.

import { describe, expect, it } from 'vitest';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

const PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

describe('buildBubbleGraph (TGL P2)', () => {
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

    it('open-plan kitchen+dining are linked OPEN (no door)', () => {
        const g = buildBubbleGraph(PROGRAM, 120);
        const k = g.rooms.find(r => r.type === 'kitchen')!;
        const d = g.rooms.find(r => r.type === 'dining')!;
        const e = g.edges.find(x => (x.a === k.id && x.b === d.id) || (x.a === d.id && x.b === k.id))!;
        expect(e.via).toBe('open');
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
    });
});
