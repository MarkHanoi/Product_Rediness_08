// T2.3 — `validateAcousticZoning` tests
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29 §19.2 T2.3).

import { describe, expect, it } from 'vitest';
import {
    validateAcousticZoning,
    type AcousticPlacement,
} from '../src/workflows/apartmentLayout/topology/validateAcousticZoning.js';
import type { BubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import type { RoomType } from '../src/workflows/apartmentLayout/types.js';

const bubbleOf = (rooms: readonly { id: string; type: RoomType }[]): BubbleGraph => ({
    rooms: rooms.map(r => ({ id: r.id, type: r.type, name: r.id, targetAreaM2: 10, isPrivate: false, needsWindow: false })),
    edges: [], corridorId: null, entryId: null,
});

const rect = (x0: number, z0: number, x1: number, z1: number) => ({ x0, z0, x1, z1 });
const place = (id: string, r: ReturnType<typeof rect>): AcousticPlacement => ({ id, rect: r });

describe('validateAcousticZoning (T2.3)', () => {
    it('admits cleanly when there are no acoustic sources OR no receivers', () => {
        const bubble = bubbleOf([
            { id: 'K', type: 'kitchen' },
            { id: 'BA', type: 'bathroom' },   // neither source nor receiver
        ]);
        const v = validateAcousticZoning(bubble, [
            place('K', rect(0, 0, 3, 4)),
            place('BA', rect(3, 0, 5, 4)),
        ]);
        expect(v.admissible).toBe(true);
        expect(v.softFindings.length).toBe(0);
    });

    it('admits cleanly when source + receiver are separated by another room', () => {
        const bubble = bubbleOf([
            { id: 'L', type: 'living' },
            { id: 'C', type: 'corridor' },
            { id: 'B', type: 'bedroom' },
        ]);
        const v = validateAcousticZoning(bubble, [
            place('L', rect(0, 0, 4, 4)),
            place('C', rect(4, 0, 5, 4)),
            place('B', rect(5, 0, 9, 4)),
        ]);
        expect(v.softFindings.length).toBe(0);
    });

    it('SOFT-penalises a living room directly abutting a master bedroom', () => {
        const bubble = bubbleOf([
            { id: 'L', type: 'living' },
            { id: 'M', type: 'master' },
        ]);
        const v = validateAcousticZoning(bubble, [
            place('L', rect(0, 0, 4, 4)),
            place('M', rect(4, 0, 8, 4)),   // shared vertical wall at x=4
        ]);
        expect(v.softFindings.length).toBe(1);
        expect(v.softFindings[0]!.category).toBe('acoustic');
        expect(v.softFindings[0]!.reason).toMatch(/living.*master/);
    });

    it('SOFT-penalises a kitchen abutting a bedroom (different pair)', () => {
        const bubble = bubbleOf([
            { id: 'K', type: 'kitchen' },
            { id: 'B', type: 'bedroom' },
        ]);
        const v = validateAcousticZoning(bubble, [
            place('K', rect(0, 0, 3, 4)),
            place('B', rect(0, 4, 3, 8)),    // shared horizontal wall at z=4
        ]);
        expect(v.softFindings.length).toBe(1);
        expect(v.softFindings[0]!.reason).toMatch(/kitchen.*bedroom/);
    });

    it('accumulates findings across multiple source ↔ receiver adjacencies', () => {
        const bubble = bubbleOf([
            { id: 'L', type: 'living' },
            { id: 'K', type: 'kitchen' },
            { id: 'M', type: 'master' },
        ]);
        // Master shares walls with BOTH living + kitchen.
        const v = validateAcousticZoning(bubble, [
            place('L', rect(0, 0, 4, 4)),
            place('K', rect(4, 0, 8, 4)),
            place('M', rect(0, 4, 8, 8)),   // shared horizontal wall with both
        ]);
        expect(v.softFindings.length).toBe(2);
    });

    it('always admissible — acoustic is SOFT only', () => {
        const bubble = bubbleOf([
            { id: 'L', type: 'living' },
            { id: 'M', type: 'master' },
        ]);
        const v = validateAcousticZoning(bubble, [
            place('L', rect(0, 0, 4, 4)),
            place('M', rect(4, 0, 8, 4)),
        ]);
        expect(v.admissible).toBe(true);
        expect(v.hardFindings.length).toBe(0);
    });

    it('per-finding delta is bounded so multi-pair flats stay in [0, 1]', () => {
        const bubble = bubbleOf([
            { id: 'L', type: 'living' },
            { id: 'K', type: 'kitchen' },
            { id: 'U', type: 'utility' },
            { id: 'M', type: 'master' },
            { id: 'B', type: 'bedroom' },
            { id: 'S', type: 'study' },
        ]);
        // All 3 receivers abut all 3 sources (worst case).
        const v = validateAcousticZoning(bubble, [
            place('L', rect(0, 0, 3, 3)),
            place('K', rect(3, 0, 6, 3)),
            place('U', rect(6, 0, 9, 3)),
            place('M', rect(0, 3, 3, 6)),
            place('B', rect(3, 3, 6, 6)),
            place('S', rect(6, 3, 9, 6)),
        ]);
        // 3 × 3 = 9 possible pairs; only same-column abuts apply ⇒ 3 findings.
        for (const f of v.softFindings) expect(f.delta).toBeLessThanOrEqual(1);
        const total = v.softFindings.reduce((s, f) => s + f.delta, 0);
        expect(total).toBeLessThanOrEqual(1);
    });
});
