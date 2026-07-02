/**
 * §FIX-FLOORFINISH-DEFAULT-THICKNESS — the interactive Floor Finish creation modal must
 * initialise the default ASSEMBLY THICKNESS equal to the default BASE OFFSET, so the finish
 * fills its recess flush with the slab top and does not overlap the slab/level. The thickness
 * default must DERIVE from the base-offset default (coupled by construction), not be an
 * independent magic number.
 *
 * Imports the pure defaults module (no THREE / no @thatopen) so this runs in a node env.
 */
import { describe, it, expect } from 'vitest';
import {
    DEFAULT_FLOOR_FINISH_BASE_OFFSET_M,
    DEFAULT_FLOOR_FINISH_THICKNESS_M,
} from '../src/floor/floorFinishDefaults';

describe('§FIX-FLOORFINISH-DEFAULT-THICKNESS floor finish creation defaults', () => {
    it('default assembly thickness equals the default base offset (no overlap, no gap)', () => {
        expect(DEFAULT_FLOOR_FINISH_THICKNESS_M).toBe(DEFAULT_FLOOR_FINISH_BASE_OFFSET_M);
    });

    it('the coupled default is a positive, valid finish thickness (> 0)', () => {
        // CreateFloorCommand.canExecute rejects thickness <= 0; the recess default must pass it.
        expect(DEFAULT_FLOOR_FINISH_BASE_OFFSET_M).toBeGreaterThan(0);
        expect(DEFAULT_FLOOR_FINISH_THICKNESS_M).toBeGreaterThan(0);
    });
});
