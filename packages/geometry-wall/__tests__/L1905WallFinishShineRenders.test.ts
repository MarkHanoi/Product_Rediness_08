// §WALL-FINISH-SHINE-RENDERS (L-1905, lane MAT2, 2026-08-21).
//
// ═══ THE BRIEF SAID SHINE ALREADY RENDERED. IT DID NOT. ═══
//
// The lane brief carried a render table asserting, as settled, that on a wall
// finish **colour** renders and **shine / roughness / metalness** also renders —
// *"✅ yes — also scalars, no textures needed"*. Measured at 9d3b16b3, both
// halves of the wall's finish path constructed their material like this:
//
//   instanced arm   new THREE.MeshStandardMaterial({ color })
//                   -> THREE defaults: roughness 1.0, metalness 0
//   layered band    new THREE.MeshStandardMaterial({ color: matColor,
//                                                    roughness: 0.85, ... })
//                   -> a HARD-CODED 0.85 for every material in the master
//
// and they could not have done otherwise: `resolveWholeBodyFinishColor` returns
// a `string`, so the material's own PBR scalars had nowhere to travel. The
// `materialId` was on `WallSideFinish` the whole time and was dropped one call
// before the pixel — C100 §9.1's shape, inside the one family §9.1 records as
// working.
//
// ⭐ THIS FILE IS THE MEASUREMENT, KEPT. It asserts the values that reach a
// material rather than that a function returns something, because a test that
// asserted "shine is non-null" would have passed against the hard-coded 0.85.
//
// ⛔ WHAT IT DELIBERATELY DOES **NOT** CLAIM: that a wall can draw a PATTERN.
// It cannot, and the last describe() pins that too — `WallFragmentBuilder` calls
// `applyMaterialMaps(params, matDef, uvSpaceOfGeometry(null))`, literally `null`,
// so every wall resolves UV_NONE. Proving sheen while leaving the map gap
// unstated is how a half-fix gets reported as a whole one.

import { describe, it, expect } from 'vitest';
import {
    resolveWholeBodyFinishColor,
    resolveWholeBodyFinishShine,
    resolveLayerRenderFinishColor,
    resolveLayerRenderFinishShine,
    type SideFinishBearingWall,
} from '../src/WallSideFinishResolver';
import { findMaterialRecord } from '@pryzm/schemas/materials';
import {
    applyMaterialMaps,
    uvSpaceOfGeometry,
    UV_METRES,
    type MaterialMapParams,
} from '@pryzm/core-app-model/material-resolver';

/** A wall carrying one authored interior finish, exactly as the batch command writes it. */
function wallWithInterior(materialId: string): SideFinishBearingWall {
    const rec = findMaterialRecord(materialId);
    if (!rec) throw new Error(`fixture names a material the master does not have: ${materialId}`);
    return {
        sideFinishes: {
            interior: { materialId, materialColor: rec.color, materialName: rec.label },
        },
    } as SideFinishBearingWall;
}

describe('THE MASTER\'S SHEEN REACHES THE FINISH — the two products that used to be one', () => {
    // Near the same hue, opposite sheen, genuinely different products. Before
    // L-1905 these rendered identically on a wall.
    const GLOSS = 'tile-gloss-navy';   // Ceramic Tile · Navy Gloss
    const MATT = 'paint-deep-navy';    // Paint · Deep Navy

    it('a gloss tile and a matt paint no longer resolve to the same material state', () => {
        const g = resolveWholeBodyFinishShine(wallWithInterior(GLOSS));
        const m = resolveWholeBodyFinishShine(wallWithInterior(MATT));
        expect(g).not.toBeNull();
        expect(m).not.toBeNull();
        expect(g!.roughness).not.toBe(m!.roughness);
        // ⭐ AND THE VALUES, not merely their inequality: a test asserting only
        //    "different" would pass on two wrong numbers.
        expect(g!.roughness).toBe(findMaterialRecord(GLOSS)!.roughness);
        expect(m!.roughness).toBe(findMaterialRecord(MATT)!.roughness);
        expect(g!.roughness).toBeLessThan(0.2);   // glazed
        expect(m!.roughness).toBeGreaterThan(0.6); // chalky
    });

    it('metalness travels too, and comes from the master', () => {
        const steel = resolveWholeBodyFinishShine(wallWithInterior('steel-stainless-polished'));
        expect(steel).not.toBeNull();
        expect(steel!.metalness).toBe(findMaterialRecord('steel-stainless-polished')!.metalness);
        expect(steel!.metalness).toBe(1);
    });

    it('COLOUR AND SHEEN ARE READ OFF THE SAME ROW — not two independent picks', () => {
        // The colour rule picks a SIDE (exterior wins, then interior). If sheen
        // repeated that test independently, a wall could render one material's
        // colour with another material's sheen. `pickWholeBodyFinish` answers it
        // once; this asserts the consequence.
        const wall = {
            sideFinishes: {
                exterior: { materialId: 'tile-gloss-navy', materialColor: findMaterialRecord('tile-gloss-navy')!.color },
                interior: { materialId: 'paint-deep-navy', materialColor: findMaterialRecord('paint-deep-navy')!.color },
            },
        } as SideFinishBearingWall;
        // exterior wins the single surface, so BOTH must come from the exterior row.
        expect(resolveWholeBodyFinishColor(wall)).toBe(findMaterialRecord('tile-gloss-navy')!.color);
        expect(resolveWholeBodyFinishShine(wall)!.roughness).toBe(findMaterialRecord('tile-gloss-navy')!.roughness);
    });
});

describe('NULL MEANS "LEAVE IT ALONE" — never a substituted scalar (C100 §5)', () => {
    it('a wall with no finish resolves no shine, so the builder keeps its own default', () => {
        expect(resolveWholeBodyFinishShine({} as SideFinishBearingWall)).toBeNull();
        expect(resolveWholeBodyFinishShine({ sideFinishes: {} } as SideFinishBearingWall)).toBeNull();
    });

    it('an UNRESOLVABLE materialId resolves no shine — it does not become roughness 1', () => {
        // A drifted id must stay distinguishable from a real matt material.
        const wall = {
            sideFinishes: { interior: { materialId: 'no.such.material', materialColor: '#ff00ff' } },
        } as SideFinishBearingWall;
        expect(resolveWholeBodyFinishShine(wall)).toBeNull();
        // and the colour leg is untouched by the miss
        expect(resolveWholeBodyFinishColor(wall)).toBe('#ff00ff');
    });

    it('the COLOUR leg is behaviour-preserved by the refactor that introduced the shine leg', () => {
        // `resolveWholeBodyFinishColor` was `sf.exterior?.materialColor ??
        // sf.interior?.materialColor ?? null` and now delegates. Same answers.
        expect(resolveWholeBodyFinishColor({} as SideFinishBearingWall)).toBeNull();
        expect(resolveWholeBodyFinishColor({ sideFinishes: { interior: { materialId: 'x' } } } as SideFinishBearingWall)).toBeNull();
        expect(resolveWholeBodyFinishColor(wallWithInterior('paint-pastel-blue')))
            .toBe(findMaterialRecord('paint-pastel-blue')!.color);
    });
});

describe('THE LAYERED BAND ARM mirrors the whole-body arm, guard for guard', () => {
    const wall = wallWithInterior('tile-gloss-emerald');

    it('a one-layer wall delegates to the whole-body rule on BOTH legs', () => {
        expect(resolveLayerRenderFinishColor(wall, 0, 1)).toBe(resolveWholeBodyFinishColor(wall));
        expect(resolveLayerRenderFinishShine(wall, 0, 1)).toEqual(resolveWholeBodyFinishShine(wall));
        expect(resolveLayerRenderFinishShine(wall, 1, 1)).toBeNull();
    });

    it('on a multi-band wall the INTERIOR-most band carries the interior finish, on both legs', () => {
        expect(resolveLayerRenderFinishColor(wall, 2, 3)).toBe(findMaterialRecord('tile-gloss-emerald')!.color);
        expect(resolveLayerRenderFinishShine(wall, 2, 3)!.roughness)
            .toBe(findMaterialRecord('tile-gloss-emerald')!.roughness);
        // a middle band carries neither
        expect(resolveLayerRenderFinishColor(wall, 1, 3)).toBeNull();
        expect(resolveLayerRenderFinishShine(wall, 1, 3)).toBeNull();
    });

    it('layerCount 0 is refused on both legs', () => {
        expect(resolveLayerRenderFinishShine(wall, 0, 0)).toBeNull();
        expect(resolveLayerRenderFinishColor(wall, 0, 0)).toBeNull();
    });
});

describe('⛔ THE PART THAT IS STILL NOT TRUE — a wall cannot draw a PATTERN', () => {
    // Pinned so the shine fix is never read as "walls render materials fully".
    it('the uv space a wall declares is NONE, which is what refuses every map', () => {
        // This is the exact expression `WallFragmentBuilder.ts` evaluates.
        expect(uvSpaceOfGeometry(null)).toEqual({ kind: 'none' });
    });

    it('a map-bearing material attaches NOTHING on a wall, and says why', () => {
        const patterned = findMaterialRecord('tile-porcelain-600-stack');
        expect(patterned, 'fixture row went missing').toBeDefined();
        expect(patterned!.maps).toBeDefined();

        const params: MaterialMapParams = {};
        const res = applyMaterialMaps(params, patterned as never, uvSpaceOfGeometry(null));

        // A NAMED state, not a silent nothing.
        expect(res.state).toBe('no-uvs');
        // and not one texture slot was written — the wall paints its flat colour.
        expect(params.map ?? null).toBeNull();
        expect(params.normalMap ?? null).toBeNull();
        expect(params.roughnessMap ?? null).toBeNull();
    });

    it('the SAME material on a metre-UV surface is not refused — so the gap is the WALL, not the row', () => {
        // ⭐ The negative result is only meaningful next to this one. A slab passes
        //    UV_METRES and gets a repeat; the wall's refusal is therefore about the
        //    wall's geometry, not about the material being unusable.
        const patterned = findMaterialRecord('tile-porcelain-600-stack')!;
        const res = applyMaterialMaps({}, patterned as never, UV_METRES);
        expect(res.state).not.toBe('no-uvs');
    });
});
