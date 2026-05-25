// buildGetWall — pure wall-store → ShellWallRecord mapper (SPEC §16, A5.3-wire-b).
//
// The integration `ensureApartmentLayoutRegistered` is editor glue (dynamic
// import + real globals) verified by the editor typecheck; the pure mapper it
// uses is unit-tested here.

import { describe, expect, it } from 'vitest';
import { buildGetWall } from '../src/engine/apartmentLayoutWallMapper.js';

const STORE = {
    getAll: () => [
        {
            id: 'w1', levelId: 'L0',
            baseLine: [{ x: 0, y: 3, z: 0 }, { x: 5, y: 3, z: 2 }],   // WallData carries y; we read x/z
            openings: [{ type: 'window' as const }, { type: 'door' as const, elementId: 'd0' }],
        },
        { id: 'w2', levelId: 'L1', baseLine: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] }, // no openings
        { id: 'wBad', levelId: 'L0', baseLine: [{ x: 0, y: 0, z: 0 }] },                     // degenerate (1 pt)
    ],
};

describe('buildGetWall (A5.3-wire-b)', () => {
    it('maps a wall to a ShellWallRecord (baseLine x/z, openings)', () => {
        const rec = buildGetWall(STORE)('w1');
        expect(rec).toBeDefined();
        expect(rec!.id).toBe('w1');
        expect(rec!.levelId).toBe('L0');
        expect(rec!.baseLine).toEqual([{ x: 0, z: 0 }, { x: 5, z: 2 }]);   // y dropped
        expect(rec!.openings).toEqual([{ type: 'window', elementId: undefined }, { type: 'door', elementId: 'd0' }]);
    });

    it('defaults openings to [] when the wall has none', () => {
        const rec = buildGetWall(STORE)('w2');
        expect(rec!.openings).toEqual([]);
    });

    it('returns undefined for a missing id', () => {
        expect(buildGetWall(STORE)('nope')).toBeUndefined();
    });

    it('returns undefined for a degenerate baseLine (< 2 points)', () => {
        expect(buildGetWall(STORE)('wBad')).toBeUndefined();
    });

    it('returns undefined when the store / getAll is absent', () => {
        expect(buildGetWall(undefined)('w1')).toBeUndefined();
        expect(buildGetWall({})('w1')).toBeUndefined();
    });
});
