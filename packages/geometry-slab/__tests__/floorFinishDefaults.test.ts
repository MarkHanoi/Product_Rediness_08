/**
 * §FIX-FLOOR-FINISH-DEFAULT-THICKNESS (L-14) — the interactive Floor Finish creation defaults
 * must treat the applied-finish THICKNESS and the base-offset (FFL build-up height) as TWO
 * INDEPENDENT values. A finish has a real, thin thickness (~10–20 mm) distinct from WHERE it
 * sits (the FFL offset above the level datum). The old behaviour coupled `thickness := baseOffset`
 * (75 mm), producing an unrealistic 75 mm-thick "finish"; that is the bug this fix removes.
 *
 * FFL stays consistent with L-87 (`resolveFflOffset` reads `boundary.baseOffset`): the base
 * offset default is the value that drives the finished floor level, unchanged by this fix.
 *
 * Imports the pure defaults module (no THREE / no @thatopen) so this runs in a node env.
 */
import { describe, it, expect } from 'vitest';
import {
    DEFAULT_FLOOR_FINISH_BASE_OFFSET_M,
    DEFAULT_FLOOR_FINISH_THICKNESS_M,
} from '../src/floor/floorFinishDefaults';

describe('§FIX-FLOOR-FINISH-DEFAULT-THICKNESS floor finish creation defaults', () => {
    it('default thickness is INDEPENDENT of the base offset (not thickness === offset)', () => {
        // The L-14 regression guard: a new floor finish must NOT default its thickness to its
        // base offset. The two are distinct dimensions and must carry distinct defaults.
        expect(DEFAULT_FLOOR_FINISH_THICKNESS_M).not.toBe(DEFAULT_FLOOR_FINISH_BASE_OFFSET_M);
    });

    it('default thickness is a realistic applied-finish thickness (~10–20 mm)', () => {
        // A tile / engineered-timber finish layer is thin; the old 75 mm coupled value was wrong.
        expect(DEFAULT_FLOOR_FINISH_THICKNESS_M).toBeGreaterThanOrEqual(0.010);
        expect(DEFAULT_FLOOR_FINISH_THICKNESS_M).toBeLessThanOrEqual(0.020);
    });

    it('both defaults are positive and valid (CreateFloorCommand.canExecute rejects thickness <= 0)', () => {
        expect(DEFAULT_FLOOR_FINISH_BASE_OFFSET_M).toBeGreaterThan(0);
        expect(DEFAULT_FLOOR_FINISH_THICKNESS_M).toBeGreaterThan(0);
    });

    it('base offset (FFL build-up height) is unchanged — keeps resolveFflOffset / L-87 consistent', () => {
        // FFL = level.elevation + baseOffset; the finish thickness change must not move the FFL.
        expect(DEFAULT_FLOOR_FINISH_BASE_OFFSET_M).toBe(0.075);
    });
});
