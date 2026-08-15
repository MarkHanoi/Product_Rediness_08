/**
 * §FIX-ROOM-FACETS-UNDETERMINED (GR-10, the []-means-unknown drain) —
 * DIFFERENTIATING suite for `roomContentsFacets.ts`, the pure half of
 * HierarchyTreePanel's room contents.
 *
 * The defect these pin: `room.boundingSlabIds ?? []` / `boundingColumnIds ?? []`
 * counted a room whose facet was NEVER RECORDED exactly like a room examined
 * and found to bound none; `getByWallId(wid) ?? []` rendered a broken hosted
 * index as a wall with no doors. Every "unknown" case below FAILS against the
 * old `?? []` shape, and every pair asserts the two inputs are IDENTICAL on
 * the field that made the defect invisible before differing on the new one.
 */
import { describe, it, expect } from 'vitest';
import {
    buildRoomElementGroups,
    countRoomElements,
    facetIdsOrUnknown,
    facetRefusal,
    facetRefusalText,
    hostedOnWall,
    type HostedByWallStore,
} from '../roomContentsFacets';

const doorStoreWith = (byWall: Record<string, unknown[]>): HostedByWallStore<unknown> => ({
    getByWallId: (wid: string) => (byWall[wid] ?? []) as readonly unknown[],
});

describe('facetIdsOrUnknown — absent is unknown, present-empty is an answer', () => {
    it('ABSENT boundingSlabIds -> null (undetermined), never []', () => {
        // Old shape: `room.boundingSlabIds ?? []` -> [] — this assertion fails against it.
        expect(facetIdsOrUnknown({ id: 'r1' }, 'boundingSlabIds')).toBeNull();
    });

    it('PRESENT-EMPTY boundingSlabIds -> determined empty (a real answer)', () => {
        expect(facetIdsOrUnknown({ id: 'r1', boundingSlabIds: [] }, 'boundingSlabIds')).toEqual([]);
    });

    it('the two cases are DIFFERENT values (the collapse the ledger exists to end)', () => {
        const unknown = facetIdsOrUnknown({ id: 'r' }, 'boundingColumnIds');
        const empty = facetIdsOrUnknown({ id: 'r', boundingColumnIds: [] }, 'boundingColumnIds');
        expect(unknown).not.toEqual(empty);
    });
});

describe('facetRefusalText — the rendered refusal CARRIES its identity (§REFUSAL-IDENTITY, C58 §1.13 arm B)', () => {
    it('the visible text contains the closed reason token verbatim, not just prose', () => {
        const text = facetRefusalText(facetRefusal('r1', 'boundingSlabIds'));
        // DIFFERENTIATING: a generic "cannot determine" sentence without the
        // token would pass a prose check but is unattributable — the exact
        // defect check-refusal-identity arm B names. The token is the identity.
        expect(text).toContain('RELATIONSHIP_NOT_RECORDED');
        expect(text).toContain('Bounding slabs');
    });

    it('the two facets render DISTINGUISHABLE refusals (identity is per-facet, not one shrug)', () => {
        const slabs = facetRefusalText(facetRefusal('r1', 'boundingSlabIds'));
        const cols = facetRefusalText(facetRefusal('r1', 'boundingColumnIds'));
        expect(slabs).not.toEqual(cols);
    });
});

describe('countRoomElements — an unrecorded facet makes the count a FLOOR, not smaller', () => {
    const walls = ['w1', 'w2'];
    const doors = doorStoreWith({ w1: [{ id: 'd1' }] });

    it('recorded-empty facets -> exact count', () => {
        const c = countRoomElements(
            { id: 'rA', boundingSlabIds: [], boundingColumnIds: [] },
            walls, doors, null,
        );
        expect(c).toEqual({ total: 3, exact: true, undeterminedFields: [] });
    });

    it('ABSENT slab facet -> same total, INEXACT, the field named', () => {
        const c = countRoomElements(
            { id: 'rB', boundingColumnIds: [] },
            walls, doors, null,
        );
        // IDENTICAL on total — which is exactly what made the defect invisible —
        // and different on exactness. Both assertions fail against `?? []`
        // (which produced { total: 3, exact-by-omission } with no named field).
        expect(c.total).toBe(3);
        expect(c.exact).toBe(false);
        expect(c.undeterminedFields).toEqual(['boundingSlabIds']);
    });

    it('recorded slabs still count (negative control)', () => {
        const c = countRoomElements(
            { id: 'rC', boundingSlabIds: ['s1', 's2'], boundingColumnIds: [] },
            walls, doors, null,
        );
        expect(c).toEqual({ total: 5, exact: true, undeterminedFields: [] });
    });
});

describe('buildRoomElementGroups — refusals BESIDE the groups, never absorbed', () => {
    const stores = {
        slabStore: { getById: (id: string) => ({ id, slabType: 'Floor', area: 10 }) },
        columnStore: { getById: (id: string) => ({ id, profileType: 'HEB', height: 3 }) },
    };

    it('ABSENT facet -> a named refusal and NO forged group', () => {
        const r = buildRoomElementGroups({ id: 'r1', boundingColumnIds: [] }, [], stores);
        expect(r.groups).toEqual([]);
        expect(r.undetermined.map((u) => u.field)).toEqual(['boundingSlabIds']);
        expect(r.undetermined[0]!.reason).toBe('RELATIONSHIP_NOT_RECORDED');
    });

    it('PRESENT-EMPTY facet -> no refusal and no group; the pair differs ONLY on `undetermined`', () => {
        const empty = buildRoomElementGroups(
            { id: 'r1', boundingSlabIds: [], boundingColumnIds: [] }, [], stores,
        );
        const unknown = buildRoomElementGroups(
            { id: 'r1', boundingColumnIds: [] }, [], stores,
        );
        // Identical groups — the pre-fix panel rendered these two rooms as the
        // same pixels, which is the defect...
        expect(empty.groups).toEqual(unknown.groups);
        // ...and the refusal is now the observable difference.
        expect(empty.undetermined).toEqual([]);
        expect(unknown.undetermined).toHaveLength(1);
    });

    it('recorded slabs render a Slabs group (negative control)', () => {
        const r = buildRoomElementGroups(
            { id: 'r1', boundingSlabIds: ['s1'], boundingColumnIds: [] }, [], stores,
        );
        expect(r.groups.map((g) => g.groupLabel)).toEqual(['Slabs (1)']);
        expect(r.undetermined).toEqual([]);
    });
});

describe('hostedOnWall — the getByWallId contract is ENFORCED, not defaulted', () => {
    it('a broken index (non-array answer) THROWS a named error, never "no doors"', () => {
        const broken = { getByWallId: () => undefined as unknown as readonly unknown[] };
        // Old shape: `getByWallId(wid) ?? []` -> silently zero. This fails against it.
        expect(() => hostedOnWall(broken, 'w1', 'doors')).toThrowError(/failure must not impersonate emptiness/);
    });

    it('an absent bucket answering [] is the DETERMINED "hosts none" (negative control)', () => {
        expect(hostedOnWall(doorStoreWith({}), 'w9', 'windows')).toEqual([]);
    });

    it('hosted elements pass through untouched', () => {
        const d = [{ id: 'd1' }];
        expect(hostedOnWall(doorStoreWith({ w1: d }), 'w1', 'doors')).toEqual(d);
    });
});
