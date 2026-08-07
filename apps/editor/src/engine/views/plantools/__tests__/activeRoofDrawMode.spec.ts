/**
 * §FIX-ROOF-MODE-SURFACE-INDEPENDENT (L-699) — pins the roof mode store and, more
 * importantly, pins the SHAPE of the bug it replaces so it cannot come back.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    setActiveRoofDrawMode,
    resolveActiveRoofDrawMode,
    isRoofDrawMode,
    roofTypeForMode,
    __resetActiveRoofDrawModeForTests,
    type RoofDrawMode,
} from '../activeRoofDrawMode';

const ALL_MODES: RoofDrawMode[] = ['2point', 'polyline', 'region', 'single_slope', 'hip_roof'];

beforeEach(() => __resetActiveRoofDrawModeForTests());

describe('activeRoofDrawMode', () => {
    it('defaults to 2point — a user who never picks a mode gets the historic behaviour', () => {
        expect(resolveActiveRoofDrawMode()).toBe('2point');
    });

    it('EVERY declared mode survives a set/resolve round-trip', () => {
        // ⚠ THE REGRESSION THIS EXISTS FOR. The old plan handler narrowed with
        //     (at === 'POLYLINE') ? 'POLYLINE' : 'RECTANGLE'
        // so region, single_slope and hip_roof were ALL silently rewritten to
        // RECTANGLE. Asserting the full set — not just the two that used to work —
        // is the whole point: an audit that only checks the modes already handled
        // cannot discover the ones that are missing (L-692's lesson).
        for (const mode of ALL_MODES) {
            setActiveRoofDrawMode(mode);
            expect(resolveActiveRoofDrawMode(), `mode "${mode}" did not survive`).toBe(mode);
        }
    });

    it('rejects a value that is not a mode, keeping the last valid one', () => {
        setActiveRoofDrawMode('region');
        setActiveRoofDrawMode('RECTANGLE');   // the OLD vocabulary — not a mode
        setActiveRoofDrawMode(undefined);
        setActiveRoofDrawMode(42);
        expect(resolveActiveRoofDrawMode()).toBe('region');
    });

    it('isRoofDrawMode accepts exactly the five declared modes', () => {
        for (const m of ALL_MODES) expect(isRoofDrawMode(m)).toBe(true);
        for (const m of ['RECTANGLE', 'POLYLINE', 'REGION', 'auto', '', null]) {
            expect(isRoofDrawMode(m)).toBe(false);
        }
    });

    it('every mode maps to a REAL roof form — never to by_region', () => {
        // `by_region` describes how the footprint was PICKED, not what the roof IS,
        // and `RoofGeometryBuilder.generateByRegion` can only emit a flat or
        // mono-pitch plane from it. That conflation is why the founder chose
        // "By Region" and was shown a flat plane.
        for (const mode of ALL_MODES) {
            const t = roofTypeForMode(mode);
            expect(t).not.toBe('by_region');
            expect(['flat', 'shed', 'gable', 'hip', 'dutch', 'gambrel', 'mansard', 'barrel']).toContain(t);
        }
        expect(roofTypeForMode('single_slope')).toBe('shed');
        expect(roofTypeForMode('hip_roof')).toBe('hip');
        expect(roofTypeForMode('region')).toBe('gable');
    });
});
