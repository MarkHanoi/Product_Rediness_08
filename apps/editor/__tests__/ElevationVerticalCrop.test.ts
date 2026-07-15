// @vitest-environment happy-dom
//
// §FIX-ELEVATION-VERTICAL-CROP (L-302) — a TWO-STOREY house's elevation showed only ONE
// storey, and dragging the crop box's TOP EDGE upward revealed nothing. Two coupled defects,
// both in EdgeProjectorService.resolveSectionVolumeBox's explicit-sectionVolume branch:
//
//   (B) CLIP — the vertical extent was `origin.y .. origin.y + sectionVolume.height`, and that
//       stored height was frozen to ONE STOREY at creation. So level-2 geometry sat above the
//       section volume's maxY and was DROPPED at the mesh gate `sectionBoxIntersectsWorldAABB`
//       (EdgeProjectorService.ts:2450) — never projected into a visible line.
//   (A) LYING HANDLE — the elevation-view top-edge drag writes `crop.region[1]` (world Y;
//       PlanViewCanvas.cropFromHandleDrag), but the explicit branch never READ it, so the drag
//       moved a rect nothing clips on (L-267).
//
// The fix makes the branch (a) DEFAULT the vertical extent to the full building height from the
// LEVEL STACK (union of level bands; no baked storey literal, L-127) and (b) HONOR crop.region[1]
// as the editable override when it deviates from the frozen one-storey band. This is the C24
// SPATIAL crop (3-D section-volume extent), NOT the C24.1 paper crop.
//
// Maps C24/C24.1 (spatial vs paper crop), C09 (view scope), L-127 (no literals), L-267 (no
// lying handle). Kept in apps/editor (L5) so it can import the L5 projector internals.

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import type { ViewDefinition, ViewSectionVolume } from '@pryzm/core-app-model';
import type { BimManager } from '@pryzm/core-app-model';
import { resolveSectionVolumeBox, sectionBoxIntersectsWorldAABB } from '../src/engine/views/EdgeProjectorService';

// ── A two-storey house: ground L0 [0..3], upper L1 [3..6]. Full building height = 6 m. ──
const TWO_STOREY = [
    { elevation: 0, height: 3 },
    { elevation: 3, height: 3 },
];
const mockBim = (levels: Array<{ elevation: number; height: number }>) =>
    ({ getLevels: () => levels } as unknown as BimManager);

const DIR = new THREE.Vector3(0, 0, -1); // South elevation, looking along −Z

/**
 * A South-elevation whose section volume was FROZEN to one storey at creation:
 * origin.y = 0, height = 3 (→ legacy maxY = 3). crop.region[1] = [0, 3] mirrors that band
 * (the untouched creation artefact) unless a test overrides it (a user drag).
 */
function elevView(opts?: {
    cropVertical?: [number, number];        // [minY, maxY] override written by the top/bottom edge drag
    sv?: Partial<ViewSectionVolume>;        // depth/width override (the PLAN crop, orthogonal to Y)
    noCrop?: boolean;
}): ViewDefinition {
    const sv: ViewSectionVolume = {
        origin: [0, 0, 0], direction: [0, 0, -1], width: 6, height: 3, near: 0, far: 8, ...opts?.sv,
    };
    const region = { min: [-3, opts?.cropVertical?.[0] ?? 0], max: [3, opts?.cropVertical?.[1] ?? 3] };
    return {
        id: 'vd-elev-south', name: 'South', viewType: 'elevation',
        spatial: { sectionVolume: sv },
        crop: opts?.noCrop ? undefined : { enabled: true, region, farClip: { offset: 8 } },
    } as unknown as ViewDefinition;
}

/** A level-2 wall (world AABB) — its geometry lives wholly ABOVE the one-storey top (y=3). */
const level2WallAABB = new THREE.Box3(
    new THREE.Vector3(-1, 3.5, -2.0),
    new THREE.Vector3( 1, 5.5, -0.1),
);

describe('§FIX-ELEVATION-VERTICAL-CROP (L-302) — default full-height + editable vertical crop', () => {
    it('THE TEETH: a 2-level elevation projects level 2 — its wall survives the mesh drop gate', () => {
        const box = resolveSectionVolumeBox(elevView(), DIR, 8, mockBim(TWO_STOREY))!;
        expect(box).not.toBeNull();

        // Default vertical extent spans the FULL building height, not one storey.
        expect(box.maxY).toBeGreaterThanOrEqual(6 - 1e-6);   // RED against old code (maxY = 3)
        expect(box.minY).toBeLessThanOrEqual(0 + 1e-6);

        // The discriminating assertion — "level 2 is NOW PROJECTED", not "the crop merely got
        // bigger": the level-2 wall (wholly at y∈[3.5,5.5]) survives the exact predicate that
        // drops meshes at EdgeProjectorService.ts:2450. Under the old one-storey box its base
        // (y=3.5) is above maxY=3 → rejected → never projected. This is CASE B proven.
        expect(sectionBoxIntersectsWorldAABB(box, level2WallAABB)).toBe(true);
    });

    it('supersede: the frozen one-storey crop.region[1] is REPLACED by the level-stack default', () => {
        // crop.region[1] = [0,3] equals the one-storey band → untouched → full height wins.
        const box = resolveSectionVolumeBox(elevView({ cropVertical: [0, 3] }), DIR, 8, mockBim(TWO_STOREY))!;
        expect(box.maxY).toBeCloseTo(6, 6);
    });

    it('THE LYING-HANDLE TOOTH: dragging crop.region[1].max up is now READ (grows the visible set)', () => {
        // The founder drags the top edge to y=10 (above even the full-height default). The OLD
        // explicit branch ignored crop.region[1] entirely and clipped at maxY=3 — the handle was
        // a lie. The fix reads the same field the drag writes.
        const box = resolveSectionVolumeBox(elevView({ cropVertical: [0, 10] }), DIR, 8, mockBim(TWO_STOREY))!;
        expect(box.maxY).toBeCloseTo(10, 6);   // RED against old code (would be 3)

        // A smaller crop excludes what a larger crop includes: shrink the top to y=2 → level 2
        // (and most of level 1) is cropped out; the level-2 wall no longer intersects.
        const shrunk = resolveSectionVolumeBox(elevView({ cropVertical: [0, 2] }), DIR, 8, mockBim(TWO_STOREY))!;
        expect(shrunk.maxY).toBeCloseTo(2, 6);
        expect(sectionBoxIntersectsWorldAABB(shrunk, level2WallAABB)).toBe(false);
    });

    it('REGRESSION FENCE: the PLAN depth/width crop is ORTHOGONAL to the vertical extent', () => {
        const shallow = resolveSectionVolumeBox(elevView({ sv: { far: 8, width: 6 } }), DIR, 8, mockBim(TWO_STOREY))!;
        const deep    = resolveSectionVolumeBox(elevView({ sv: { far: 20, width: 12 } }), DIR, 20, mockBim(TWO_STOREY))!;
        // Depth/width changed…
        expect(deep.maxDepth).not.toBeCloseTo(shallow.maxDepth, 3);
        expect(deep.maxRight).not.toBeCloseTo(shallow.maxRight, 3);
        // …but which levels show did NOT.
        expect(deep.minY).toBeCloseTo(shallow.minY, 6);
        expect(deep.maxY).toBeCloseTo(shallow.maxY, 6);
        expect(deep.maxY).toBeCloseTo(6, 6);
    });

    it('NO BAKED LITERAL: the vertical bound tracks a changed level stack', () => {
        // Raise the upper level to elevation 5 (top = 8). The bound must follow — not a frozen 6.
        const raised = resolveSectionVolumeBox(elevView(), DIR, 8, mockBim([
            { elevation: 0, height: 3 },
            { elevation: 5, height: 3 },
        ]))!;
        expect(raised.maxY).toBeCloseTo(8, 6);

        // A single-storey model collapses the default to that one band (no phantom upper storey).
        const oneStorey = resolveSectionVolumeBox(elevView(), DIR, 8, mockBim([{ elevation: 0, height: 3 }]))!;
        expect(oneStorey.maxY).toBeCloseTo(3, 6);
    });

    it('no BimManager / empty stack → falls back to the legacy per-volume band (no crash)', () => {
        const noBim = resolveSectionVolumeBox(elevView({ noCrop: true }), DIR, 8, undefined)!;
        expect(noBim.minY).toBeCloseTo(0, 6);
        expect(noBim.maxY).toBeCloseTo(3, 6);   // origin.y + sectionVolume.height (legacy)
    });
});
