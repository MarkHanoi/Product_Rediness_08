/**
 * §RESI-CORRIDOR-FINISH-SHAPE — the public-corridor floor finish must be the CLEAN
 * RESIDUAL region (shell interior − apartment cells − core), a tidy H/cross hugging the
 * apartment walls / shell / core — NOT the old comb of thin per-band strips.
 *
 * These cases pin the residual helper: the residual = shell − apartments − core, it is
 * one connected ring for a centre-core plate, its area equals the arithmetic leftover,
 * and degenerate inputs (fully tiled, no core) behave.
 */
import { describe, it, expect } from 'vitest';
import {
    computeCorridorResidualRings,
    ringArea,
    type Pt,
    type Rect,
} from '../src/ui/residential-building/residentialCorridorResidual.js';

const rect = (x0: number, z0: number, x1: number, z1: number): Rect => ({ x0, z0, x1, z1 });
// A 20×14 shell interior rectangle (LOCAL plan-XZ).
const SHELL: Pt[] = [
    { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 14 }, { x: 0, z: 14 },
];

describe('computeCorridorresidualRings — §RESI-CORRIDOR-FINISH-SHAPE', () => {
    it('4 apartment cells + a centre core → clean residual cross arms, total area = shell − cells − core', () => {
        // Layout: a 2×2 core at the plate centre; a 2m corridor cross around it.
        // Four corner apartment blocks fill the rest, leaving a clean cross residual.
        //   x bands: [0..9] apt | [9..11] corridor | [11..20] apt
        //   z bands: [0..6] apt | [6..8] corridor | [8..14] apt
        const cells: Rect[] = [
            rect(0, 0, 9, 6),    // bottom-left
            rect(11, 0, 20, 6),  // bottom-right
            rect(0, 8, 9, 14),   // top-left
            rect(11, 8, 20, 14), // top-right
        ];
        const core = rect(9, 6, 11, 8); // 2×2 core in the cross intersection

        const rings = computeCorridorResidualRings(SHELL, cells, core);

        // The core sits exactly at the cross intersection, so removing it splits the cross
        // into FOUR clean arms (NOT thin per-band strips — each arm is a single rectangle
        // hugging the apartment walls + the shell + the core). All four are OUTER (CCW)
        // rings; no hole rings survive the winding filter.
        expect(rings.length).toBe(4);

        const shellArea = 20 * 14;                 // 280
        const cellsArea = 9 * 6 * 4;               // 216
        const coreArea = 2 * 2;                    // 4
        const expectedResidual = shellArea - cellsArea - coreArea;  // 60
        const total = rings.reduce((s, r) => s + ringArea(r), 0);
        expect(Math.round(total)).toBe(expectedResidual);
    });

    it('an H residual (two facing apartment rows + a transverse corridor) traces as one connected ring', () => {
        // x: [0..9] apt | [9..20] (right apt leaves a left-edge corridor strip)
        // Build a real H: left + right apartment columns with a gap, joined by a z-corridor.
        //   left col x[0..9] split into two cells with a horizontal corridor z[6..8]
        //   right col x[11..20] same; central x[9..11] is a vertical corridor joining them.
        const cells: Rect[] = [
            rect(0, 0, 9, 6), rect(0, 8, 9, 14),     // left column, two cells (corridor z[6..8])
            rect(11, 0, 20, 6), rect(11, 8, 20, 14), // right column, two cells
        ];
        const rings = computeCorridorResidualRings(SHELL, cells, null);
        // With NO core, the H (two horizontal arms joined by the vertical spine) is one
        // connected region → exactly one outer ring (a clean H, not parallel strips).
        expect(rings.length).toBe(1);
        // Area = full cross: vertical x[9..11]×z[0..14]=28 + horizontal x[0..20]×z[6..8]=40 − overlap 4 = 64.
        expect(Math.round(ringArea(rings[0]!))).toBe(64);
    });

    it('produces a clean axis-aligned ring (rectilinear corners only — no strips)', () => {
        const cells: Rect[] = [
            rect(0, 0, 9, 6), rect(11, 0, 20, 6), rect(0, 8, 9, 14), rect(11, 8, 20, 14),
        ];
        const rings = computeCorridorResidualRings(SHELL, cells, rect(9, 6, 11, 8));
        for (const ring of rings) {
            for (const p of ring) {
                // Every vertex sits on a breakpoint line (0/9/11/20 in x, 0/6/8/14 in z).
                expect([0, 9, 11, 20]).toContain(p.x);
                expect([0, 6, 8, 14]).toContain(p.z);
            }
        }
    });

    it('a single central core, no apartments → ONE outer frame ring (the centre hole is dropped, cut downstream)', () => {
        // A donut residual (interior with a central hole). The helper returns only the OUTER
        // CCW ring; the inner CW hole boundary is filtered out (a filled finish can't carry a
        // hole — the real core/stairwell void is cut by the executor's cutVoids pass).
        const core = rect(8, 5, 12, 9);
        const rings = computeCorridorResidualRings(SHELL, [], core);
        expect(rings.length).toBe(1);
        // Only the outer boundary survives → full interior area (the hole is cut later).
        expect(Math.round(ringArea(rings[0]!))).toBe(20 * 14);
    });

    it('two apartment rows with a single corridor band between → residual is ONE rectangle strip (the band)', () => {
        // x full width; z: [0..6] apt | [6..8] corridor | [8..14] apt. No core.
        const cells: Rect[] = [rect(0, 0, 20, 6), rect(0, 8, 20, 14)];
        const rings = computeCorridorResidualRings(SHELL, cells, null);
        expect(rings.length).toBe(1);
        // The residual is exactly the 20×2 band.
        expect(Math.round(ringArea(rings[0]!))).toBe(20 * 2);
    });

    it('fully-tiled interior (apartments cover everything, no core) → no residual rings', () => {
        const cells: Rect[] = [rect(0, 0, 20, 14)];
        const rings = computeCorridorResidualRings(SHELL, cells, null);
        expect(rings).toEqual([]);
    });

    it('empty / degenerate interior → no rings (never throws)', () => {
        expect(computeCorridorResidualRings([], [rect(0, 0, 1, 1)], null)).toEqual([]);
        expect(computeCorridorResidualRings([{ x: 0, z: 0 }, { x: 1, z: 0 }], [], null)).toEqual([]);
    });

    it('subtracted rects protruding past the interior are clamped to the shell (no phantom area)', () => {
        // A cell that overhangs the shell on +x must not create residual outside the shell.
        const cells: Rect[] = [rect(0, 0, 25, 6)]; // overhangs x=20 by 5m
        const rings = computeCorridorResidualRings(SHELL, cells, null);
        const total = rings.reduce((s, r) => s + ringArea(r), 0);
        // Residual = shell (280) − the part of the cell INSIDE the shell (20×6 = 120) = 160.
        expect(Math.round(total)).toBe(160);
    });
});
