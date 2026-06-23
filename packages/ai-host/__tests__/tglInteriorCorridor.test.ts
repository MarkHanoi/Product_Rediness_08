// §INTERIOR-CORRIDOR (founder defect CFstdjE9 #3, 2026-06-23) — the corridor must be an INTERIOR
// spine, never tucked against an exterior façade or in a corner. `evaluateCorridorPurity`'s
// `corridorOnPerimeter` flags a corridor whose LONG run lies on the shell perimeter; the hard gate
// 'corridor-perimeter' de-ranks such a candidate so a central interior corridor outranks it.
// TEST-FIRST.

import { describe, expect, it } from 'vitest';
import { evaluateCorridorPurity } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import type { Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';

const SHELL: Rect = { x0: 0, z0: 0, x1: 12, z1: 8 };
const rooms = [
    { id: 'corr', type: 'corridor' },
    { id: 'bed1', type: 'bedroom' },
    { id: 'bed2', type: 'bedroom' },
];

describe('§INTERIOR-CORRIDOR — corridorOnPerimeter', () => {
    it('flags a corridor whose LONG run lies on the façade (top edge)', () => {
        // A horizontal corridor strip pinned to the top façade (z1 == shell z1), spanning the plate.
        const placements = [
            { roomId: 'corr', rect: { x0: 0, z0: 6.8, x1: 12, z1: 8 } },   // long edge z1=8 on the shell
            { roomId: 'bed1', rect: { x0: 0, z0: 0, x1: 6, z1: 6.8 } },
            { roomId: 'bed2', rect: { x0: 6, z0: 0, x1: 12, z1: 6.8 } },
        ];
        const p = evaluateCorridorPurity(placements, rooms, 'corr', undefined, SHELL);
        expect(p.corridorOnPerimeter).toBe(true);
    });

    it('does NOT flag a CENTRAL interior corridor (long run off both façades)', () => {
        // A horizontal corridor in the MIDDLE of the plate (z∈[3.4,4.6]), rooms on both sides.
        const placements = [
            { roomId: 'corr', rect: { x0: 0, z0: 3.4, x1: 12, z1: 4.6 } },
            { roomId: 'bed1', rect: { x0: 0, z0: 0, x1: 12, z1: 3.4 } },
            { roomId: 'bed2', rect: { x0: 0, z0: 4.6, x1: 12, z1: 8 } },
        ];
        const p = evaluateCorridorPurity(placements, rooms, 'corr', undefined, SHELL);
        expect(p.corridorOnPerimeter).toBe(false);
    });

    it('does NOT flag a SINGLE-LOADED corridor hugging the interior core edge', () => {
        // Single-loaded: corridor on z∈[0,1.2] looks like it touches z0, BUT the rooms band is on the
        // far side. Here the corridor IS on a façade (z0) → flagged. To represent the interior-core
        // case, the corridor must NOT lie on a shell edge: put it just inside (a stair-core strip below).
        const placements = [
            { roomId: 'corr', rect: { x0: 0, z0: 2.0, x1: 12, z1: 3.2 } },   // off both façades
            { roomId: 'bed1', rect: { x0: 0, z0: 3.2, x1: 6, z1: 8 } },
            { roomId: 'bed2', rect: { x0: 6, z0: 3.2, x1: 12, z1: 8 } },
        ];
        const p = evaluateCorridorPurity(placements, rooms, 'corr', undefined, SHELL);
        expect(p.corridorOnPerimeter).toBe(false);
    });

    it('does NOT flag when no shell bbox is supplied (apartment / byte-identical path)', () => {
        const placements = [
            { roomId: 'corr', rect: { x0: 0, z0: 6.8, x1: 12, z1: 8 } },
            { roomId: 'bed1', rect: { x0: 0, z0: 0, x1: 12, z1: 6.8 } },
        ];
        const p = evaluateCorridorPurity(placements, rooms, 'corr', undefined /* no shell */);
        expect(p.corridorOnPerimeter).toBe(false);
    });

    it('does NOT flag a corridor that only END-kisses a wall (short edge on the perimeter)', () => {
        // A vertical corridor in the middle whose END touches z0 but whose LONG run is interior in x.
        const placements = [
            { roomId: 'corr', rect: { x0: 5.4, z0: 0, x1: 6.6, z1: 8 } },   // long axis = z; x edges interior (5.4, 6.6)
            { roomId: 'bed1', rect: { x0: 0, z0: 0, x1: 5.4, z1: 8 } },
            { roomId: 'bed2', rect: { x0: 6.6, z0: 0, x1: 12, z1: 8 } },
        ];
        const p = evaluateCorridorPurity(placements, rooms, 'corr', undefined, SHELL);
        // Its LONG edges (x=5.4, x=6.6) are interior; only the short ends touch z0/z1 ⇒ not on perimeter.
        expect(p.corridorOnPerimeter).toBe(false);
    });
});
