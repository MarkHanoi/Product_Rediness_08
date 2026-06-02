// A.39.a — corridor-width perceptual evaluator tests.

import { describe, expect, it } from 'vitest';
import { validateCorridorWidth } from '../src/workflows/apartmentLayout/dimensions/validateCorridorWidth.js';
import type { RoomShape } from '../src/workflows/apartmentLayout/dimensions/validateRoomShape.js';
import type { RoomType } from '../src/workflows/apartmentLayout/types.js';

function room(
    type: RoomType,
    width: number,
    length: number,
    id?: string,
): RoomShape {
    return {
        id: id ?? `r_${type}_${width}x${length}`,
        type,
        rect: { x0: 0, z0: 0, x1: width, z1: length },
    };
}

describe('validateCorridorWidth — comfort band', () => {
    it('a 1.20 m × 6 m corridor is in the comfort band (no findings)', () => {
        const v = validateCorridorWidth([room('corridor', 1.2, 6)]);
        expect(v.admissible).toBe(true);
        expect(v.hardFindings.length).toBe(0);
        expect(v.softFindings.length).toBe(0);
    });

    it('1.00 m exactly is the lower comfort edge (no finding)', () => {
        const v = validateCorridorWidth([room('corridor', 1.0, 4)]);
        expect(v.softFindings.length).toBe(0);
    });

    it('1.40 m exactly is the upper comfort edge (no finding)', () => {
        const v = validateCorridorWidth([room('corridor', 1.4, 4)]);
        expect(v.softFindings.length).toBe(0);
    });
});

describe('validateCorridorWidth — HARD floor (< 0.80 m)', () => {
    it('HARD-rejects a 0.70 m corridor (below UK ADM minimum)', () => {
        const v = validateCorridorWidth([room('corridor', 0.7, 4, 'c1')]);
        expect(v.admissible).toBe(false);
        expect(v.hardFindings[0]?.metric).toBe('corridorTooNarrow');
        expect(v.hardFindings[0]?.roomId).toBe('c1');
    });

    it('HARD-rejects a 0.50 m corridor', () => {
        const v = validateCorridorWidth([room('corridor', 0.5, 4)]);
        expect(v.admissible).toBe(false);
    });
});

describe('validateCorridorWidth — HARD ceiling (> 2.50 m)', () => {
    it('HARD-rejects a 3.00 m corridor (no longer a corridor)', () => {
        const v = validateCorridorWidth([room('corridor', 3.0, 5, 'c1')]);
        expect(v.admissible).toBe(false);
        expect(v.hardFindings[0]?.metric).toBe('corridorTooWide');
    });

    it('2.50 m exactly is acceptable', () => {
        const v = validateCorridorWidth([room('corridor', 2.5, 5)]);
        expect(v.admissible).toBe(true);
    });
});

describe('validateCorridorWidth — SOFT cramped (0.80–1.00 m)', () => {
    it('a 0.85 m corridor is SOFT cramped', () => {
        const v = validateCorridorWidth([room('corridor', 0.85, 4, 'c1')]);
        expect(v.admissible).toBe(true);
        expect(v.softFindings[0]?.metric).toBe('corridorCramped');
        expect(v.softFindings[0]?.roomId).toBe('c1');
        expect(v.softFindings[0]?.delta).toBeGreaterThan(0);
        expect(v.softFindings[0]?.delta).toBeLessThan(1);
    });

    it('a 0.80 m corridor (exactly the hard floor) is SOFT, not HARD', () => {
        // 0.80 exactly should pass the hard check; soft penalty
        // applies at the edge but the delta is 1.0.
        const v = validateCorridorWidth([room('corridor', 0.8, 4)]);
        expect(v.admissible).toBe(true);
        expect(v.softFindings[0]?.delta).toBeCloseTo(1.0);
    });

    it('penalty scales with shortfall', () => {
        const less = validateCorridorWidth([room('corridor', 0.85, 4)]);
        const more = validateCorridorWidth([room('corridor', 0.95, 4)]);
        expect(less.softFindings[0]!.delta).toBeGreaterThan(
            more.softFindings[0]!.delta,
        );
    });
});

describe('validateCorridorWidth — SOFT wide (1.40–2.50 m)', () => {
    it('a 1.80 m corridor is SOFT wide', () => {
        const v = validateCorridorWidth([room('corridor', 1.8, 5, 'c1')]);
        expect(v.admissible).toBe(true);
        expect(v.softFindings[0]?.metric).toBe('corridorWide');
        expect(v.softFindings[0]?.delta).toBeGreaterThan(0);
    });

    it('penalty scales toward the hard ceiling', () => {
        const less = validateCorridorWidth([room('corridor', 1.6, 5)]);
        const more = validateCorridorWidth([room('corridor', 2.3, 5)]);
        expect(less.softFindings[0]!.delta).toBeLessThan(
            more.softFindings[0]!.delta,
        );
    });
});

describe('validateCorridorWidth — non-corridor rooms ignored', () => {
    it('does not evaluate non-corridor rooms', () => {
        const v = validateCorridorWidth([
            room('bedroom', 4, 5),
            room('living', 5, 6),
            room('bathroom', 2, 2.5),
        ]);
        expect(v.admissible).toBe(true);
        expect(v.softFindings.length).toBe(0);
        expect(v.hardFindings.length).toBe(0);
    });

    it('aggregates findings across multiple corridors', () => {
        const v = validateCorridorWidth([
            room('corridor', 0.7, 4, 'c1'),     // HARD narrow
            room('corridor', 1.2, 5, 'c2'),     // comfort
            room('corridor', 1.7, 5, 'c3'),     // SOFT wide
        ]);
        expect(v.admissible).toBe(false);
        expect(v.hardFindings.length).toBe(1);
        expect(v.softFindings.length).toBe(1);
    });

    it('handles degenerate (zero-area) corridors gracefully', () => {
        const v = validateCorridorWidth([
            {
                id: 'c1',
                type: 'corridor',
                rect: { x0: 0, z0: 0, x1: 0, z1: 4 },
            },
        ]);
        expect(v.admissible).toBe(true);
        expect(v.softFindings.length).toBe(0);
        expect(v.hardFindings.length).toBe(0);
    });
});
