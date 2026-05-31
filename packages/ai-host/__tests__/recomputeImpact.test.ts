// D-α-3 P1 — pin tests for the apartment-propagation impact resolver.
// Contract: every relationship the resolver claims to detect (or NOT detect)
// is asserted here so a regression fails CI rather than the live UI.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
    recomputeImpact,
    type ApartmentParameters,
    type RoomParameters,
    type ParameterChange,
} from '../src/workflows/apartmentLayout/solver/recomputeImpact.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

const env = (value: number, min = 0, max = 100) => ({ value, min, max });

const apartment: ApartmentParameters = {
    id: 'apt-01',
    shellAreaM2: env(85, 40, 200),
    bedrooms: 2,
    bathrooms: 1,
    masterEnSuite: true,
    openPlanKitchenDining: true,
    livingRoom: true,
    entranceHall: true,
    typology: 'open-plan-mid-rise',
};

const mkRoom = (
    id: string,
    type: string,
    area: { v: number; min?: number; max?: number },
    apartmentId = 'apt-01',
): RoomParameters => ({
    id,
    apartmentId,
    type,
    name: `${type} ${id}`,
    areaM2: env(area.v, area.min ?? 6, area.max ?? 40),
    widthM:  env(3, 1.8, 8),
    depthM:  env(4, 1.8, 10),
    daylightRequired: type !== 'corridor' && type !== 'hall',
    privacyTier: 2,
});

const baseRooms: readonly RoomParameters[] = [
    mkRoom('r-master',   'master',   { v: 14 }),
    mkRoom('r-bed2',     'bedroom',  { v: 10 }),
    mkRoom('r-living',   'living',   { v: 22 }),
    mkRoom('r-kitchen',  'kitchen',  { v: 8 }),
    mkRoom('r-bath',     'bathroom', { v: 4 }),
];

const state = { apartment, rooms: baseRooms };

const change = <T,>(path: string, priorValue: T, newValue: T): ParameterChange<T> =>
    ({ apartmentId: 'apt-01', path, priorValue, newValue });

// ── Tests ───────────────────────────────────────────────────────────────────

describe('recomputeImpact — area change propagation', () => {
    it('area change → all OTHER flexible rooms in the apartment are affected', () => {
        const r = recomputeImpact(change('rooms.r-master.areaM2.value', 14, 16), state);
        expect([...r.affectedRoomIds].sort())
            .toEqual(['r-bath', 'r-bed2', 'r-kitchen', 'r-living']);
        expect(r.affectedFields).toEqual(['areaM2']);
    });

    it('the changed room itself is NOT in affectedRoomIds (it is the source)', () => {
        const r = recomputeImpact(change('rooms.r-living.areaM2.value', 22, 24), state);
        expect(r.affectedRoomIds).not.toContain('r-living');
        expect(r.affectedRoomIds.length).toBe(baseRooms.length - 1);
    });

    it('rooms pinned at their max areaM2 are EXCLUDED from the impact region', () => {
        const pinned: readonly RoomParameters[] = [
            mkRoom('r-master', 'master',  { v: 14 }),
            // r-bed2 pinned — its value already equals its max.
            mkRoom('r-bed2',   'bedroom', { v: 12, max: 12 }),
            mkRoom('r-living', 'living',  { v: 22 }),
        ];
        const r = recomputeImpact(
            change('rooms.r-master.areaM2.value', 14, 16),
            { apartment, rooms: pinned },
        );
        expect(r.affectedRoomIds).toEqual(['r-living']);
    });
});

describe('recomputeImpact — non-cascading room changes', () => {
    it('type change does NOT propagate to other rooms (renames do not rebalance area)', () => {
        const r = recomputeImpact(change('rooms.r-master.type', 'master', 'study'), state);
        expect(r.affectedRoomIds).toEqual([]);
        expect(r.affectedFields).toEqual([]);
    });

    it('name + daylightRequired changes do not cascade', () => {
        const r1 = recomputeImpact(change('rooms.r-bed2.name', 'Bedroom 2', 'Guest'), state);
        const r2 = recomputeImpact(change('rooms.r-bed2.daylightRequired', true, false), state);
        expect(r1.affectedRoomIds).toEqual([]);
        expect(r2.affectedRoomIds).toEqual([]);
    });
});

describe('recomputeImpact — apartment-scope changes', () => {
    it('apartment.bedrooms change → ALL rooms in the apartment affected', () => {
        const r = recomputeImpact(change('apartment.bedrooms', 2, 3), state);
        expect([...r.affectedRoomIds].sort())
            .toEqual(['r-bath', 'r-bed2', 'r-kitchen', 'r-living', 'r-master']);
        expect([...r.affectedFields].sort()).toEqual(['areaM2', 'depthM', 'widthM']);
    });

    it('bare apartment-level field path (no "apartment." prefix) is also accepted', () => {
        const r = recomputeImpact(change('typology', 'open-plan-mid-rise', 'compact-studio'), state);
        expect(r.affectedRoomIds.length).toBe(baseRooms.length);
    });

    it('apartment-scope change scoped only to rooms in THIS apartment', () => {
        const mixed: readonly RoomParameters[] = [
            ...baseRooms,
            mkRoom('r-other-a', 'living', { v: 18 }, 'apt-02'),
            mkRoom('r-other-b', 'bedroom', { v: 9 }, 'apt-02'),
        ];
        const r = recomputeImpact(
            change('apartment.bathrooms', 1, 2),
            { apartment, rooms: mixed },
        );
        expect(r.affectedRoomIds).not.toContain('r-other-a');
        expect(r.affectedRoomIds).not.toContain('r-other-b');
        expect(r.affectedRoomIds.length).toBe(baseRooms.length);
    });
});

describe('recomputeImpact — guards + edge cases', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
    afterEach(() => { warnSpy.mockRestore(); });

    it('change for a DIFFERENT apartment id → empty (no warn — legitimate mismatch)', () => {
        const r = recomputeImpact(
            { apartmentId: 'apt-99', path: 'rooms.r-master.areaM2.value', priorValue: 14, newValue: 16 },
            state,
        );
        expect(r.affectedRoomIds).toEqual([]);
        expect(r.affectedFields).toEqual([]);
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('empty room list → empty result', () => {
        const r = recomputeImpact(
            change('rooms.r-master.areaM2.value', 14, 16),
            { apartment, rooms: [] },
        );
        expect(r.affectedRoomIds).toEqual([]);
        expect(r.affectedFields).toEqual([]);
    });

    it('invalid path → empty result + soft warn', () => {
        const r = recomputeImpact(change('', 1, 2), state);
        expect(r.affectedRoomIds).toEqual([]);
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('unknown room id → empty result + soft warn', () => {
        const r = recomputeImpact(change('rooms.r-does-not-exist.areaM2.value', 1, 2), state);
        expect(r.affectedRoomIds).toEqual([]);
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('NaN values handled — NaN → NaN is a no-op, NaN → number cascades', () => {
        const noop = recomputeImpact(change('rooms.r-master.areaM2.value', NaN, NaN), state);
        expect(noop.affectedRoomIds).toEqual([]);

        const real = recomputeImpact(change('rooms.r-master.areaM2.value', NaN, 16), state);
        expect(real.affectedRoomIds.length).toBeGreaterThan(0);
    });

    it('no-op change (prior === new) → empty result', () => {
        const r = recomputeImpact(change('rooms.r-master.areaM2.value', 14, 14), state);
        expect(r.affectedRoomIds).toEqual([]);
        expect(r.affectedFields).toEqual([]);
    });

    it('result is deterministic and immutable (frozen arrays)', () => {
        const a = recomputeImpact(change('rooms.r-master.areaM2.value', 14, 16), state);
        const b = recomputeImpact(change('rooms.r-master.areaM2.value', 14, 16), state);
        expect(a.affectedRoomIds).toEqual(b.affectedRoomIds);
        expect(Object.isFrozen(a.affectedRoomIds)).toBe(true);
        expect(Object.isFrozen(a.affectedFields)).toBe(true);
    });
});
