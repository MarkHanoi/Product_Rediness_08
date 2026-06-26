// §LIFT-CREATE-TOOL — characterization tests for the manual lift tool's PURE
// placement → command-input mapping (LiftToolPlacement). These pin down:
//   - level-span resolution: base = active level, top = the level ABOVE it;
//   - graceful single-level / topmost-level handling (degenerate base===top span);
//   - the CreateVerticalCirculationCommand input the tool builds from a click +
//     the active level (origin anchored to the base level datum, sensible
//     passenger-lift defaults).

import { describe, it, expect } from 'vitest';
import {
    resolveLiftSpan,
    buildLiftCommandInput,
    DEFAULT_KIND,
    DEFAULT_TYPE_ID,
    type LiftToolLevel,
} from '../LiftToolPlacement';

const LEVELS: LiftToolLevel[] = [
    { id: 'L0', elevation: 0 },
    { id: 'L1', elevation: 3 },
    { id: 'L2', elevation: 6 },
];

describe('resolveLiftSpan', () => {
    it('spans the active level → the level immediately above (by elevation)', () => {
        const span = resolveLiftSpan('L0', LEVELS);
        expect(span.baseLevelId).toBe('L0');
        expect(span.topLevelId).toBe('L1');
        expect(span.baseElevation).toBe(0);
    });

    it('uses elevation order, not array order', () => {
        const shuffled: LiftToolLevel[] = [
            { id: 'L2', elevation: 6 },
            { id: 'L0', elevation: 0 },
            { id: 'L1', elevation: 3 },
        ];
        const span = resolveLiftSpan('L1', shuffled);
        expect(span.baseLevelId).toBe('L1');
        expect(span.topLevelId).toBe('L2');
        expect(span.baseElevation).toBe(3);
    });

    it('falls back to a degenerate base===top span on the TOPMOST level', () => {
        const span = resolveLiftSpan('L2', LEVELS);
        expect(span.baseLevelId).toBe('L2');
        expect(span.topLevelId).toBe('L2');
        expect(span.baseElevation).toBe(6);
    });

    it('handles a single-level project gracefully (degenerate span)', () => {
        const span = resolveLiftSpan('L0', [{ id: 'L0', elevation: 0 }]);
        expect(span.baseLevelId).toBe('L0');
        expect(span.topLevelId).toBe('L0');
    });

    it('handles an active level missing from the table (degenerate span)', () => {
        const span = resolveLiftSpan('GHOST', LEVELS);
        expect(span.baseLevelId).toBe('GHOST');
        expect(span.topLevelId).toBe('GHOST');
        expect(span.baseElevation).toBe(0);
    });
});

describe('buildLiftCommandInput', () => {
    it('builds a CreateVerticalCirculationCommand payload from a click + active level', () => {
        const input = buildLiftCommandInput({ x: 5, y: 0, z: -2 }, 'L0', LEVELS);
        expect(input.baseLevelId).toBe('L0');
        expect(input.topLevelId).toBe('L1');
        // Origin XZ comes from the click; Y is anchored to the BASE level datum.
        expect(input.origin).toEqual({ x: 5, y: 0, z: -2 });
        // Sensible defaults for a hand-placed lift.
        expect(input.kind).toBe(DEFAULT_KIND);
        expect(input.typeId).toBe(DEFAULT_TYPE_ID);
        expect(input.rotation).toBe(0);
    });

    it('anchors origin.y to the base level elevation (not the click Y)', () => {
        const input = buildLiftCommandInput({ x: 1, y: 999, z: 1 }, 'L1', LEVELS);
        expect(input.baseLevelId).toBe('L1');
        expect(input.topLevelId).toBe('L2');
        expect(input.origin.y).toBe(3); // L1 elevation, NOT the bogus click Y.
    });

    it('honours kind / typeId / rotation / id overrides and forwards shaft dims', () => {
        const input = buildLiftCommandInput({ x: 0, y: 0, z: 0 }, 'L0', LEVELS, {
            kind: 'goods',
            typeId: 'goods',
            rotation: Math.PI / 2,
            id: 'lift_fixed_1',
            shaftWidth: 2.0,
            shaftDepth: 2.4,
        });
        expect(input.kind).toBe('goods');
        expect(input.typeId).toBe('goods');
        expect(input.rotation).toBeCloseTo(Math.PI / 2);
        expect(input.id).toBe('lift_fixed_1');
        expect(input.shaftWidth).toBe(2.0);
        expect(input.shaftDepth).toBe(2.4);
    });

    it('omits id / shaft dims when not provided (command resolves type defaults)', () => {
        const input = buildLiftCommandInput({ x: 0, y: 0, z: 0 }, 'L0', LEVELS);
        expect('id' in input).toBe(false);
        expect(input.shaftWidth).toBeUndefined();
        expect(input.shaftDepth).toBeUndefined();
    });
});
