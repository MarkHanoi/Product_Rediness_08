/**
 * §LANE-Y-FLOOR-MATERIAL-READ — the floor-finish material link.
 *
 * `FloorData.materialId` has been writeable since it was added (FloorTypes.ts:33)
 * and was read by NOTHING: `resolveFloorColor`'s chain went
 * colour → finishSpec → layers[0] → systemType → default, never consulting it.
 * Choosing a library material for a floor finish therefore changed a field and
 * left the render exactly as it was — a silent no-op, which is why a landscape
 * material could not appear on a floor.
 *
 * These controls pin the link AND the two ways it could be re-broken without
 * anyone noticing: dropping the resolver injection, and dropping materialId
 * from the cache key that guards the resolved value.
 */
import { describe, it, expect } from 'vitest';
import { resolveFloorColor, floorColorCacheKey, FLOOR_DEFAULTS } from './FloorColourSystem.js';
import { materialHexById } from '../materialLibrary.js';
import type { FloorData } from './FloorTypes.js';

/** Minimal floor shape the resolver reads. */
const floorWith = (over: Record<string, unknown>) => ({
    colour: undefined,
    finishSpec: undefined,
    layers: [],
    ...over,
} as unknown as Parameters<typeof resolveFloorColor>[0]);

describe('resolveFloorColor — master-library material link', () => {
    it('resolves a landscape material id to its master-library colour', () => {
        // The founder's actual ask, at the layer that decides what is drawn.
        const hex = resolveFloorColor(
            floorWith({ materialId: 'landscape-grass-lawn' }),
            undefined,
            materialHexById,
        );
        expect(hex).toBe(materialHexById('landscape-grass-lawn'));
        expect(hex).not.toBe(FLOOR_DEFAULTS.defaultFinishColor);
    });

    it('resolves a solid-path material too, not just planting', () => {
        const hex = resolveFloorColor(
            floorWith({ materialId: 'ground-decomposed-granite' }),
            undefined,
            materialHexById,
        );
        expect(hex).toBe(materialHexById('ground-decomposed-granite'));
    });

    it('falls through to the default on an UNKNOWN id rather than rendering black', () => {
        // A miss must degrade to the documented default. Returning '#000000'
        // here would be the classic "failure and emptiness are the same value"
        // defect this repo has paid for repeatedly.
        const hex = resolveFloorColor(
            floorWith({ materialId: 'no-such-material-id' }),
            undefined,
            materialHexById,
        );
        expect(hex).toBe(FLOOR_DEFAULTS.defaultFinishColor);
    });

    it('keeps explicit per-instance overrides ahead of the material id', () => {
        expect(resolveFloorColor(
            floorWith({ colour: '#123456', materialId: 'landscape-grass-lawn' }),
            undefined,
            materialHexById,
        )).toBe('#123456');

        expect(resolveFloorColor(
            floorWith({ finishSpec: { finishColor: '#654321' }, materialId: 'landscape-grass-lawn' }),
            undefined,
            materialHexById,
        )).toBe('#654321');
    });

    it('beats the layer and systemType defaults', () => {
        const hex = resolveFloorColor(
            floorWith({
                materialId: 'landscape-grass-lawn',
                layers: [{ function: 'finish', materialColor: '#aaaaaa' }],
            }),
            '#bbbbbb',
            materialHexById,
        );
        expect(hex).toBe(materialHexById('landscape-grass-lawn'));
    });

    it('leaves every non-injecting call site behaving exactly as before', () => {
        // The resolver argument is optional so the change cannot alter any
        // existing caller's output. Without it, materialId is inert.
        expect(resolveFloorColor(floorWith({ materialId: 'landscape-grass-lawn' })))
            .toBe(FLOOR_DEFAULTS.defaultFinishColor);
    });
});

describe('floorColorCacheKey — the invalidation gate in front of the fix', () => {
    it('changes when materialId changes', () => {
        // If this key omits materialId, the colour resolves correctly and the
        // cached panel is never rebuilt to show it — the fix would be invisible
        // for a reason unrelated to the fix.
        const base = { finishSpec: undefined, opacity: 1 } as unknown as FloorData;
        const a = floorColorCacheKey({ ...base, materialId: 'landscape-grass-lawn' } as FloorData);
        const b = floorColorCacheKey({ ...base, materialId: 'ground-concrete-path' } as FloorData);
        expect(a).not.toBe(b);
    });
});

describe('materialHexById — master-library lookup', () => {
    it('returns a #rrggbb string for a known id and undefined for a miss', () => {
        expect(materialHexById('landscape-grass-lawn')).toMatch(/^#[0-9a-f]{6}$/);
        expect(materialHexById('definitely-not-a-material')).toBeUndefined();
    });

    it('agrees with the authored value', () => {
        expect(materialHexById('ground-concrete-path')).toBe('#c2beb6');
    });
});
