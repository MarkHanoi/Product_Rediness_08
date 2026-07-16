// §FIX-OFFICE-MISSING-PER-STOREY-SLABS (L-322) — guard: every storey the detailed per-room finish
// pass does NOT cover gets a visible full-disc FLOOR PLATE, so the office tower is not a hollow shell.
//
// Tooth: the OLD behaviour finished floors on ONLY the first detailed level (the `…on L0` log) — the
// upper storeys had a bare structural slab and read as hollow. This asserts the fix fans a floor plate
// out to EVERY non-detailed storey (distinguishing "L0 has a floor" from "every storey has a floor").

import { describe, it, expect } from 'vitest';
import { buildStoreyFloorPlates } from '../src/ui/office-building/officeStoreyFloors.js';

// A small square disc (CCW) standing in for the office circular footprint.
const DISC = [
    { x: -10, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 10 }, { x: -10, z: 10 },
];

function levels(n: number): Map<number, string> {
    const m = new Map<number, string>();
    for (let i = 0; i < n; i++) m.set(i, `L-${i}`);
    return m;
}

describe('§FIX-OFFICE-MISSING-PER-STOREY-SLABS — full-disc floor plate on every non-detailed storey', () => {
    it('lays a plate on EVERY storey except the detailed (already-finished) ones — not just L0', () => {
        const plates = buildStoreyFloorPlates({
            disc: DISC,
            levelIdByIndex: levels(23),                 // a 23-storey tower
            detailedIndices: [0, 1],                    // ground + representative floor already finished
            stairVoidsFor: () => [],
        });
        // Tooth: 23 storeys − 2 detailed = 21 plates. The OLD vacuous state was 1 (L0 only).
        expect(plates).toHaveLength(21);
        const covered = new Set(plates.map((p) => p.levelId));
        // Every non-detailed storey is covered…
        for (let i = 2; i < 23; i++) expect(covered.has(`L-${i}`)).toBe(true);
        // …and the detailed storeys are NOT double-floored (no z-fight with the per-room finishes).
        expect(covered.has('L-0')).toBe(false);
        expect(covered.has('L-1')).toBe(false);
        // Each plate is the full disc footprint.
        expect(plates[0]!.polygon).toHaveLength(4);
    });

    it('cuts a stairwell void (CW-wound hole) when one falls inside the storey', () => {
        const voidPoly = [ { x: -2, z: -2 }, { x: 2, z: -2 }, { x: 2, z: 2 }, { x: -2, z: 2 } ]; // CCW, inside disc
        const plates = buildStoreyFloorPlates({
            disc: DISC,
            levelIdByIndex: levels(3),
            detailedIndices: [0],
            stairVoidsFor: (levelId) => (levelId === 'L-1' ? [{ polygon: voidPoly }] : []),
        });
        const l1 = plates.find((p) => p.levelId === 'L-1')!;
        expect(l1.holes).toHaveLength(1);
        // The hole must be wound OPPOSITE the CCW outer ring (CW ⇒ negative signed area).
        const area = l1.holes[0]!.reduce((s, a, i, arr) => {
            const b = arr[(i + 1) % arr.length]!; return s + a.x * b.z - b.x * a.z;
        }, 0) / 2;
        expect(area).toBeLessThan(0);
        // A void OUTSIDE the disc / on an unrelated level is not cut.
        const l2 = plates.find((p) => p.levelId === 'L-2')!;
        expect(l2.holes).toHaveLength(0);
    });

    it('returns nothing for a degenerate disc', () => {
        expect(buildStoreyFloorPlates({
            disc: [{ x: 0, z: 0 }, { x: 1, z: 1 }],
            levelIdByIndex: levels(5),
            detailedIndices: [0],
            stairVoidsFor: () => [],
        })).toHaveLength(0);
    });
});
