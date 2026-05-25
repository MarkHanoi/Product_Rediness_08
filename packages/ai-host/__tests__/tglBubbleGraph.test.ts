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
            if (r.type === 'bedroom') expect(r.targetAreaM2).toBeGreaterThanOrEqual(9);
            if (r.type === 'living') expect(r.targetAreaM2).toBeGreaterThanOrEqual(18);
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
});
