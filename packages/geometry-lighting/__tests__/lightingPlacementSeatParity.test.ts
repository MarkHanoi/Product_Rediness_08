/**
 * §OUTDOOR112 — the placement base-point convention, pinned as a RELATION over
 * EVERY catalogue family, not as a hand-list.
 *
 * THE FOUNDER'S TWO REPORTS THIS SUITE PINS:
 *
 *  1. *"some of them go off — their base point might not be correct: terracotta
 *     is an example — on placement. After placement they behave better."*
 *     Preview Y came from the RAW raycast hit (any 'slab' mesh — usually the
 *     FLOOR slab; a tabletop for the terracotta lamp) while the commit
 *     re-derived Y through the seating authority — so the fixture JUMPED at
 *     the click. The fix: both consume `placementSeatFor`. The pin: for every
 *     family, the seat the preview stands on IS the seat the command's own
 *     split (`FLOOR_MOUNTED_FIXTURES.has ? floor : ceiling`, C11 §5.4 'auto')
 *     derives — at the same cursor point, from the same stores.
 *
 *  2. *"lightings should adapt to the level height — at the moment they are
 *     set to default 3 meters — but if the level is 5 meters they should
 *     always adapt to it."* The ceiling anchor must be LEVEL-DERIVED
 *     (`elevation + height`), with the 2.7 m constant reachable ONLY when the
 *     level declares no height — and floor fixtures (the §OUTDOOR112 site
 *     five included) must be provably UNAFFECTED by the height, so the fix
 *     cannot overcorrect them.
 *
 * Run against the REAL registry (`BUILT_IN_LIGHTING_TYPES`) and the REAL datum
 * authority — a fake built from the header cannot falsify the header.
 */
import { describe, it, expect } from 'vitest';
import {
    FLOOR_MOUNTED_FIXTURES,
    resolveFloorSeatingDatumFrom,
    resolveCeilingSeatingDatumFrom,
    photometryForFixture,
    type FloorData,
    type CeilingData,
} from '@pryzm/core-app-model';
import { BUILT_IN_LIGHTING_TYPES } from '../src/LightingTypeDefinitions';
import { placementSeatFor } from '../src/placementSeat';

/** The founder's storey: a 5 m level — NOT the historical 3 m default. */
const LEVEL_5M = { elevation: 0, height: 5 };
/** His other console line: a high storey at real elevation. */
const LEVEL_HIGH = { elevation: 15, height: 5 };

const PT = { x: 2, z: 3 };

/** A ceiling finish covering PT, authored when the storey was 3 m. */
const CEILING_3M = [{
    boundary: {
        polygon: [{ x: -10, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 10 }, { x: -10, z: 10 }],
        height: 3.0, thickness: 0.05, baseOffset: 0,
    },
}] as unknown as CeilingData[];

/** A 20 mm tile finish covering PT. */
const FLOOR_TILE = [{
    boundary: {
        polygon: [{ x: -10, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 10 }, { x: -10, z: 10 }],
        baseOffset: 0.02,
    },
}] as unknown as FloorData[];

/**
 * The COMMAND's own derivation, replicated exactly as `CreateLightingCommand`
 * states it for `seating: 'auto'` (its :113-120): the `FLOOR_MOUNTED_FIXTURES`
 * split over the two datum resolvers. This is the other half of the relation —
 * if either side drifts, the founder's jump-at-click returns.
 */
function commandAutoSeatY(
    type: string,
    level: { elevation: number; height?: number },
    floors: readonly FloorData[] | null,
    ceilings: readonly CeilingData[] | null,
): number {
    return FLOOR_MOUNTED_FIXTURES.has(type as never)
        ? resolveFloorSeatingDatumFrom(level, floors, PT).y
        : resolveCeilingSeatingDatumFrom(level, ceilings, PT).y;
}

describe('§OUTDOOR112 — preview seat == commit seat, for EVERY family', () => {
    it('parity holds across the whole registry, with and without finishes, on a 5 m storey', () => {
        expect(BUILT_IN_LIGHTING_TYPES.length).toBeGreaterThan(30); // the registry, not a sample
        for (const def of BUILT_IN_LIGHTING_TYPES) {
            for (const [floors, ceilings] of [
                [null, null],
                [FLOOR_TILE, CEILING_3M],
            ] as const) {
                const seat = placementSeatFor(def.id, LEVEL_5M, floors, ceilings, PT);
                // No picked surface ⇒ every family commits 'auto'.
                expect(seat.seating, def.id).toBe('auto');
                expect(seat.y, `${def.id} preview-vs-commit`).toBe(
                    commandAutoSeatY(def.id, LEVEL_5M, floors, ceilings),
                );
            }
        }
    });

    it("the terracotta case — a picked tabletop seats ON the table, committed 'explicit'", () => {
        const seat = placementSeatFor('table_terracotta', LEVEL_5M, FLOOR_TILE, null, PT, 0.75);
        expect(seat.y).toBe(0.75);
        expect(seat.seating).toBe('explicit');
        // Away from furniture it falls back to the command's own floor datum.
        const bare = placementSeatFor('table_terracotta', LEVEL_5M, FLOOR_TILE, null, PT);
        expect(bare.seating).toBe('auto');
        expect(bare.y).toBe(commandAutoSeatY('table_terracotta', LEVEL_5M, FLOOR_TILE, null));
    });

    it('a picked surface is IGNORED for non-table fixtures — a bollard cannot seat on a chair', () => {
        const seat = placementSeatFor('bollard_light', LEVEL_5M, null, null, PT, 0.45);
        expect(seat.seating).toBe('auto');
        expect(seat.y).toBe(0); // the floor datum, not the chair
    });
});

describe("§OUTDOOR112 — the founder's 5 m storey: ceiling anchor is LEVEL-DERIVED", () => {
    it('a pendant on a 5 m level anchors at 5 m — never the 3 m default', () => {
        const seat = placementSeatFor('pendant', LEVEL_5M, null, null, PT);
        expect(seat.y).toBe(5);
    });

    it('elevation 15 + height 5 anchors at 20 (his high-storey console case)', () => {
        expect(placementSeatFor('downlight', LEVEL_HIGH, null, null, PT).y).toBe(20);
    });

    it('the 2.7 m constant is reachable ONLY when the level declares no height', () => {
        expect(placementSeatFor('pendant', { elevation: 0 }, null, null, PT).y).toBe(2.7);
        expect(placementSeatFor('pendant', { elevation: 0, height: 5 }, null, null, PT).y).toBe(5);
    });

    it('a CEILING FINISH pins the anchor — the fixture hangs from the actual ceiling, and the ceiling not following the level height is the NAMED separate defect', () => {
        // On the 5 m storey a ceiling authored at 3.0 wins: soffit = 3.0 − 0.05.
        // This is CORRECT for the fixture (it must hang from the ceiling the
        // room sees) — the stale ceiling itself is the defect, and it is a
        // level-machinery row, not a lighting one (SetLevelHeightCommand's
        // follow table carries no ceiling row).
        const seat = placementSeatFor('pendant', LEVEL_5M, null, CEILING_3M, PT);
        expect(seat.y).toBeCloseTo(2.95, 9);
    });

    it('floor-standing fixtures — the §OUTDOOR112 site five included — are UNAFFECTED by level height', () => {
        const outdoorFive = [
            'bollard_globe_mini', 'bollard_louvred', 'bollard_diffuser',
            'globe_post_light', 'street_area_luminaire',
        ];
        // The five are in the registry AND floor-mounted (derived, not hand-kept).
        for (const id of outdoorFive) {
            expect(BUILT_IN_LIGHTING_TYPES.some(d => d.id === id), id).toBe(true);
            expect(FLOOR_MOUNTED_FIXTURES.has(id as never), id).toBe(true);
        }
        for (const id of [...outdoorFive, 'floor_wood_post']) {
            const at5 = placementSeatFor(id, { elevation: 0, height: 5 }, null, null, PT);
            const at3 = placementSeatFor(id, { elevation: 0, height: 3 }, null, null, PT);
            expect(at5.y, `${id} must seat on the FLOOR whatever the storey height`).toBe(0);
            expect(at3.y, id).toBe(0);
        }
    });

    it('the founder\'s five group under "Outdoor & Site" material: exterior + floor in the registry', () => {
        const exteriorFloor = BUILT_IN_LIGHTING_TYPES
            .filter(d => d.mount === 'floor' && d.location === 'exterior')
            .map(d => d.id);
        for (const id of [
            'bollard_globe_mini', 'bollard_louvred', 'bollard_diffuser',
            'globe_post_light', 'street_area_luminaire', 'bollard_light',
        ]) {
            expect(exteriorFloor, 'derived outdoor section').toContain(id);
        }
        // No interior floor lamp leaks into the outdoor slice.
        expect(exteriorFloor).not.toContain('floor_wood_post');
    });
});

describe('§OUTDOOR112 — wall-mount parity is honest, not pretty', () => {
    it("mirror_light previews where the command's 'auto' arm will land it (the ceiling datum — the missing wall arm is a NAMED limitation)", () => {
        const seat = placementSeatFor('mirror_light', LEVEL_5M, null, null, PT);
        expect(seat.y).toBe(commandAutoSeatY('mirror_light', LEVEL_5M, null, null));
        expect(photometryForFixture('mirror_light').mount).toBe('wall');
    });
});
