// @vitest-environment happy-dom
//
// §CROP-IS-THE-CLIP (L-4500..L-4504) — the ORIENTED depth box arm.
//
// The sibling file `packages/core-app-model/src/views/__tests__/elevationCropIsTheClip.test.ts`
// pins the resolver. This file pins the thing that CONSUMES it: the oriented
// `SectionVolumeBox` that actually culls and clips meshes into an elevation. Both
// halves are needed, because the defect that opened the lane was never inside one
// expression — it was TWO expressions for one quantity, and only a test that walks
// crop -> resolver -> box can see that they now agree.
//
// THE INVARIANT: `box.minDepth === clip.near` and `box.maxDepth === clip.far`, where
// `clip` is what the projector's `resolveClipRange()` returns for the same view.
// Asserted over a SWEEP, never against a fixture literal.
//
// Kept in apps/editor (L7) so it can import the projector internals, exactly as
// ElevationVerticalCrop.test.ts does.
//
// Maps C24 (spatial crop), C09 §4.6.5 (view scope), C06 §13.3 (one producer).

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as THREE from '@pryzm/renderer-three/three';
import type { ViewDefinition } from '@pryzm/core-app-model';
import type { BimManager } from '@pryzm/core-app-model';
import {
    resolveElevationClipRange,
    UNCLIPPED_ELEVATION_FAR_DEPTH_M,
} from '@pryzm/core-app-model';
import { resolveSectionVolumeBox } from '../src/engine/views/EdgeProjectorService';

const DIR = new THREE.Vector3(0, 0, -1); // South elevation, looking along -Z
const mockBim = (levels: Array<{ elevation: number; height: number }>) =>
    ({ getLevels: () => levels } as unknown as BimManager);
const ONE_STOREY = [{ elevation: 0, height: 3 }];

/** A South elevation whose crop rectangle was DRAGGED to `[near, far]` in plan —
 *  i.e. both stores written, which is what the drag does. */
function draggedElevation(near: number, far: number): ViewDefinition {
    return {
        id: 'vd-sys-elev-south', name: 'South', viewType: 'elevation',
        spatial: {
            sectionVolume: {
                origin: [0, 0, 0], direction: [0, 0, -1], width: 6, height: 3, near, far,
            },
        },
        crop: { enabled: true, region: { min: [-3, 0], max: [3, 3] }, farClip: { offset: far } },
    } as unknown as ViewDefinition;
}

/** The founder's own logged depths, plus a sub-metre and a building-scale crop. */
const DEPTH_SWEEP = [0.5, 0.939, 1.217, 2.857, 2.96, 12.5, 47.25];

describe('§CROP-IS-THE-CLIP — the oriented depth box IS the crop rectangle', () => {
    it.each(DEPTH_SWEEP)('a crop dragged to %s m produces a box clipped at exactly %s m', (far) => {
        const viewDef = draggedElevation(0, far);
        // The projector resolves the range, then hands it to the box — reproduced here
        // in the same order EdgeProjectorService.project() does it.
        const clip = resolveElevationClipRange(viewDef, UNCLIPPED_ELEVATION_FAR_DEPTH_M);
        const box = resolveSectionVolumeBox(viewDef, DIR, clip.far, mockBim(ONE_STOREY), clip.near)!;

        expect(box).not.toBeNull();
        expect(box.maxDepth).toBe(far);      // THE RULE, not a literal
        expect(box.minDepth).toBe(0);
        expect(box.far).toBe(box.maxDepth);
        expect(box.near).toBe(box.minDepth);
        // …and the depth window is exactly the crop's, with no residual term.
        expect(box.maxDepth - box.minDepth).toBe(far);
    });

    it('THE TEETH — a depth typed in ViewPropertiesPanel moves the BOX, not just the clip planes', () => {
        // The panel writes `crop.farClip.offset` only. Before this lane the box read
        // `explicit.far` off the stale section volume, so the drawing contained geometry
        // from an 8 m window while the clip planes said 3 m. One resolved range now feeds
        // both, so the box follows the typed number.
        const stale = draggedElevation(0, 8);
        const afterPanelEdit = {
            ...stale,
            crop: { ...(stale.crop as object), farClip: { offset: 3 } },
        } as unknown as ViewDefinition;

        const clip = resolveElevationClipRange(afterPanelEdit, UNCLIPPED_ELEVATION_FAR_DEPTH_M);
        expect(clip.far).toBe(3);

        const box = resolveSectionVolumeBox(afterPanelEdit, DIR, clip.far, mockBim(ONE_STOREY), clip.near)!;
        expect(box.maxDepth).toBe(3);        // RED against the old `Number(explicit.far) || farClipDepth`
        expect(box.maxDepth).not.toBe(8);
    });

    it('a non-zero near edge reaches the box (near is resolved, not hard-wired to 0)', () => {
        const viewDef = draggedElevation(1.25, 7.5);
        const clip = resolveElevationClipRange(viewDef, UNCLIPPED_ELEVATION_FAR_DEPTH_M);
        const box = resolveSectionVolumeBox(viewDef, DIR, clip.far, mockBim(ONE_STOREY), clip.near)!;
        expect(box.minDepth).toBe(1.25);
        expect(box.maxDepth).toBe(7.5);
    });

    it('REGRESSION FENCE — the depth window is still ORTHOGONAL to the vertical extent', () => {
        // L-302 owns the vertical axis; this lane must not have touched it.
        const shallow = resolveSectionVolumeBox(draggedElevation(0, 2.857), DIR, 2.857, mockBim(ONE_STOREY), 0)!;
        const deep    = resolveSectionVolumeBox(draggedElevation(0, 47.25), DIR, 47.25, mockBim(ONE_STOREY), 0)!;
        expect(deep.maxDepth).not.toBeCloseTo(shallow.maxDepth, 3);
        expect(deep.minY).toBeCloseTo(shallow.minY, 6);
        expect(deep.maxY).toBeCloseTo(shallow.maxY, 6);
    });
});

describe('§CROP-IS-THE-CLIP — NO RIVAL EXPRESSION (structural ratchet)', () => {
    // ⚠ This is the arm that a browser cannot replace and a value assertion cannot
    // catch. The defect was never a wrong NUMBER — every individual expression was
    // defensible. It was that FOUR call sites each computed the depth window their
    // own way. These assertions fail the moment a fifth appears, or an existing one
    // is re-pointed at a raw field. Do not "fix" a failure here by relaxing the
    // pattern; route the new caller through `resolveElevationClipRange`.
    const REPO = path.resolve(__dirname, '..', '..', '..');
    const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

    const PROJECTOR = 'apps/editor/src/engine/views/EdgeProjectorService.ts';
    const PLAN_SYMBOL = 'packages/core-app-model/src/views/PlanViewAnnotationRenderer.ts';
    const PLAN_DRAG = 'apps/editor/src/engine/views/PlanViewInteraction.ts';

    it.each([PROJECTOR, PLAN_SYMBOL, PLAN_DRAG])(
        '%s resolves its depth window through the shared resolver',
        (rel) => {
            expect(read(rel)).toContain('resolveElevationClipRange');
        },
    );

    it('the projector no longer reads viewRange.nearOffset as an elevation near plane', () => {
        const src = read(PROJECTOR);
        // The plan-view branch legitimately still uses nearOffset (DOC-1.5d, cut height
        // above floor). What must not return is the ELEVATION branch's `?? 0` form.
        expect(src).not.toContain('const nearDepth = viewDef.spatial.viewRange?.nearOffset ?? 0;');
    });

    it('the plan scope symbol no longer reads sectionVolume.far ahead of the resolver', () => {
        const src = read(PLAN_SYMBOL);
        // Two rival forms lived here: the rectangle's `Math.max(near + 0.1, volume.far)`
        // and the caption's `sectionVolume?.far ?? resolveElevationFarDepth(...)`, whose
        // precedence was the INVERSE of the projector's.
        expect(src).not.toContain('Math.max(near + 0.1, volume.far)');
        expect(src).not.toContain('viewDef.spatial.sectionVolume?.far ?? resolveElevationFarDepth');
    });

    it('the scope drag seeds from the resolved range, not from the raw stored volume', () => {
        // A raw `return viewDef.spatial.sectionVolume;` let a width drag re-commit a
        // stale far and silently revert a depth typed in the panel.
        expect(read(PLAN_DRAG)).not.toContain('if (viewDef.spatial.sectionVolume) return viewDef.spatial.sectionVolume;');
    });

    it('the cull margin is named, not an anonymous literal, in the crop-AABB builder', () => {
        const src = read(PLAN_DRAG);
        expect(src).toContain('CROP_REGION_CULL_MARGIN_M');
        expect(src).not.toContain('const padding = 0.05;');
    });
});
