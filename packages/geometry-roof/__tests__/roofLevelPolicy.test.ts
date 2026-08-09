// §ROOF-UPPER-LEVEL (founder ruling, 2026-08-09) — "when creating a roof it will
// always belong to the upper level", i.e. the level IMMEDIATELY ABOVE the one it
// was drawn on. These pin the pure resolver: ordering is by ELEVATION (level ids
// in production are not ordinal), the topmost/single-level cases keep the roof
// where it was drawn, and the elevation delta the caller needs to keep the
// geometry in place is reported honestly.

import { describe, it, expect } from 'vitest';
import { resolveRoofLevel, type RoofLevelRef } from '../src/pure/roofLevelPolicy';

/** Six storeys, deliberately with non-ordinal ids and out-of-order input. */
const SIX_STOREYS: RoofLevelRef[] = [
    { id: 'L-05-1786262347381-5', elevation: 15 },
    { id: 'L0', elevation: 0 },
    { id: 'lvl_3', elevation: 9 },
    { id: 'A-mezz', elevation: 3 },
    { id: 'zzz-top', elevation: 6 },
    { id: 'B4', elevation: 12 },
];

describe('resolveRoofLevel — §ROOF-UPPER-LEVEL', () => {
    it('drawn on the ground level of a 6-storey project → the NEXT level up, not the topmost', () => {
        const r = resolveRoofLevel('L0', SIX_STOREYS);
        expect(r.levelId).toBe('A-mezz');       // elevation 3 — NOT 'L-05-…' at 15
        expect(r.elevationDelta).toBe(3);
        expect(r.reHomed).toBe(true);
        expect(r.reason).toBe('upper-level');
    });

    it('orders by elevation, never by array index or id spelling', () => {
        // 'zzz-top' (6 m) must resolve to 'lvl_3' (9 m) — alphabetically it is last,
        // and by array index the next entry is 'B4' (12 m). Both would be wrong.
        expect(resolveRoofLevel('zzz-top', SIX_STOREYS).levelId).toBe('lvl_3');
        expect(resolveRoofLevel('B4', SIX_STOREYS).levelId).toBe('L-05-1786262347381-5');
    });

    it('handles non-contiguous elevations (a double-height storey)', () => {
        const levels: RoofLevelRef[] = [
            { id: 'g', elevation: 0 },
            { id: 'h', elevation: 7.4 },   // double-height below
            { id: 'i', elevation: 10.4 },
        ];
        const r = resolveRoofLevel('g', levels);
        expect(r.levelId).toBe('h');
        expect(r.elevationDelta).toBeCloseTo(7.4, 10);
    });

    it('a level at the SAME elevation is not "above"', () => {
        const levels: RoofLevelRef[] = [
            { id: 'a', elevation: 0 },
            { id: 'a-twin', elevation: 0 },
            { id: 'b', elevation: 3 },
        ];
        expect(resolveRoofLevel('a', levels).levelId).toBe('b');
    });

    it('breaks elevation ties deterministically by id (replay stability)', () => {
        const levels: RoofLevelRef[] = [
            { id: 'a', elevation: 0 },
            { id: 'zeta', elevation: 3 },
            { id: 'alpha', elevation: 3 },
        ];
        expect(resolveRoofLevel('a', levels).levelId).toBe('alpha');
        // Same set, different input order → same answer.
        expect(resolveRoofLevel('a', [levels[0], levels[2], levels[1]]).levelId).toBe('alpha');
    });

    it('topmost level → the roof stays where it was drawn, and says why', () => {
        const r = resolveRoofLevel('L-05-1786262347381-5', SIX_STOREYS);
        expect(r.levelId).toBe('L-05-1786262347381-5');
        expect(r.elevationDelta).toBe(0);
        expect(r.reHomed).toBe(false);
        expect(r.reason).toBe('no-level-above');
    });

    it('single-level project → the only level (both readings collapse)', () => {
        const r = resolveRoofLevel('L0', [{ id: 'L0', elevation: 0 }]);
        expect(r.levelId).toBe('L0');
        expect(r.reHomed).toBe(false);
        expect(r.reason).toBe('no-level-above');
    });

    it('origin level not in the set → refuses to guess, keeps the drawn-on id', () => {
        const r = resolveRoofLevel('ghost', SIX_STOREYS);
        expect(r.levelId).toBe('ghost');
        expect(r.elevationDelta).toBe(0);
        expect(r.reason).toBe('origin-unknown');
    });

    it('ignores levels with a non-finite elevation rather than ordering against NaN', () => {
        const levels: RoofLevelRef[] = [
            { id: 'a', elevation: 0 },
            { id: 'broken', elevation: Number.NaN },
            { id: 'b', elevation: 3 },
        ];
        expect(resolveRoofLevel('a', levels).levelId).toBe('b');
    });
});
