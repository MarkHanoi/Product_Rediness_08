/**
 * §CROP-IS-THE-CLIP (L-4500..L-4504)
 *
 * The founder, 2026-08-21:
 *   *"I want Elevation & Section absolutely accurate — super maximum accurate ...
 *    the elevation line I believe really defines accurately the place of cut of the
 *    view, which is sound — however the extension of it is not aligned with the
 *    further line of the square crop in plan view ... The user should be able to
 *    absolutely and super accurately define the crop view, and this would/should
 *    define precisely what the elevation shows."*
 *
 * THE INVARIANT THIS FILE PINS:
 *
 *     far  plane of an elevation/section == far  edge of its crop rectangle
 *     near plane of an elevation/section == near edge of its crop rectangle
 *
 * ⭐ Asserted as a RULE over a SWEEP of depths, never against a fixture literal.
 * A test that pinned `2.857` would go green on the day the term changed and tell
 * nobody anything; the claim is not "the far is 2.857", it is "the far is whatever
 * the crop says and nothing else."
 *
 * WHY IT COULD BREAK — one quantity, three stores, and only the drag wrote all of
 * them (see the block comment on `resolveElevationClipRange`). Everything here
 * exercises the resolver that is now the ONE expression both the projector
 * (`EdgeProjectorService.resolveClipRange`) and the drawn plan rectangle
 * (`PlanViewAnnotationRenderer._scopeWorld`) call.
 *
 * Maps C24 (spatial crop vs C24.1 paper crop), C09 §4.6.5 (view scope),
 * C06 §13.3 (one producer per surface), L-127 (no baked literals).
 */

import { describe, it, expect } from 'vitest';
import {
    resolveElevationClipRange,
    resolveElevationFarDepth,
    UNCLIPPED_ELEVATION_FAR_DEPTH_M,
    DEFAULT_ELEVATION_SCOPE_DEPTH_M,
    MIN_ELEVATION_CLIP_DEPTH_M,
    CROP_REGION_CULL_MARGIN_M,
    type ElevationClipSource,
} from '../ViewDefinitionTypes';

/**
 * A crop rectangle as the user drew it in plan: near edge at `near` metres along
 * the view direction from the mark, far edge at `far`. Both writers that produce a
 * dragged crop write BOTH stores, which is the state this models.
 */
const draggedCrop = (near: number, far: number): ElevationClipSource => ({
    crop: { farClip: { offset: far } },
    spatial: { sectionVolume: { near, far } },
});

/** The depths swept by every property test below. Deliberately spans the founder's
 *  own logged range (~0.9 - 3.0 m), a sub-metre crop, and a building-scale one. */
const DEPTH_SWEEP = [0.5, 0.939, 1.217, 2.5, 2.857, 4.0, 12.5, 47.25, 180];

describe('§CROP-IS-THE-CLIP A — the far plane IS the crop far edge, at every depth', () => {
    it.each(DEPTH_SWEEP)('a crop drawn %s m deep clips at exactly %s m', (depth) => {
        const clip = resolveElevationClipRange(draggedCrop(0, depth), UNCLIPPED_ELEVATION_FAR_DEPTH_M);
        // THE RULE: far == the crop's far edge. Not "close to", not "minus an epsilon".
        expect(clip.far).toBe(depth);
        expect(clip.near).toBe(0);
    });

    it('THE TEETH — no hidden term: far MINUS the crop depth is exactly 0 across the sweep', () => {
        // The reading that opened this lane was a consistent ~0.10 m gap between a
        // logged crop depth and the logged `far`. If any epsilon, half-thickness or
        // margin ever re-enters the clip path, this is the line that goes red.
        const residuals = DEPTH_SWEEP.map(d =>
            resolveElevationClipRange(draggedCrop(0, d), UNCLIPPED_ELEVATION_FAR_DEPTH_M).far - d);
        expect(residuals.every(r => r === 0)).toBe(true);
        expect(Math.max(...residuals.map(Math.abs))).toBe(0);
    });

    it('the near plane IS the crop near edge — it is not hard-wired to 0', () => {
        // `near` read 0.000 on every one of the founder's passes because every writer
        // stores 0 (the cut-plane handle moves the ORIGIN, not `near`). That made a
        // hard-wired 0 indistinguishable from a resolved 0 — the "failure and empty
        // are the same value" shape. A non-zero near proves it is resolved.
        for (const near of [0, 0.25, 1.2, 3]) {
            const clip = resolveElevationClipRange(draggedCrop(near, near + 6), UNCLIPPED_ELEVATION_FAR_DEPTH_M);
            expect(clip.near).toBe(near);
            expect(clip.far).toBe(near + 6);
            expect(clip.far - clip.near).toBe(6);
        }
    });

    it('crop depth is preserved under translation of the near edge (a pure window, not an anchor)', () => {
        for (const shift of [0, 1.5, 9]) {
            const clip = resolveElevationClipRange(draggedCrop(shift, shift + 2.857), UNCLIPPED_ELEVATION_FAR_DEPTH_M);
            expect(clip.far - clip.near).toBeCloseTo(2.857, 12);
        }
    });
});

describe('§CROP-IS-THE-CLIP B — the THREE stores, and which one wins', () => {
    it('THE DEFECT: a depth typed into ViewPropertiesPanel moves the clip, and the rectangle FOLLOWS', () => {
        // The panel writes `crop.farClip.offset` ONLY — it never touches
        // `spatial.sectionVolume.far`. Before this lane the projector read the first
        // and the plan rectangle read the second, so typing 3 m clipped the drawing at
        // 3 m while the plan kept drawing the old 8 m box. ONE resolver, so the two
        // callers cannot answer differently — that is what this asserts.
        const afterPanelEdit: ElevationClipSource = {
            crop: { farClip: { offset: 3 } },
            spatial: { sectionVolume: { near: 0, far: 8 } },   // the STALE mirror
        };
        expect(resolveElevationClipRange(afterPanelEdit, UNCLIPPED_ELEVATION_FAR_DEPTH_M).far).toBe(3);
        // …and the scope-handle caller, asking the same question with its own fallback,
        // gets the SAME answer. Two fallbacks, one resolution (§ELEV-SCOPE-DEPTH L-1855).
        expect(resolveElevationClipRange(afterPanelEdit, DEFAULT_ELEVATION_SCOPE_DEPTH_M).far).toBe(3);
    });

    it('sectionVolume.far is honoured when no farClip is stored — ahead of the plan-era viewRange', () => {
        const volumeOnly: ElevationClipSource = {
            spatial: { sectionVolume: { near: 0, far: 6.4 }, viewRange: { farOffset: 99 } },
        };
        expect(resolveElevationClipRange(volumeOnly, UNCLIPPED_ELEVATION_FAR_DEPTH_M).far).toBe(6.4);
    });

    it('sectionVolume.near beats viewRange.nearOffset — the latter is a PLAN concept (DOC-1.5d)', () => {
        // `viewRange.nearOffset` means "cut height above the FLOOR". In depth space it
        // means nothing, and it is written on elevation views by `roomInteriorElevations`.
        const both: ElevationClipSource = {
            spatial: { sectionVolume: { near: 0, far: 5 }, viewRange: { nearOffset: 1.2, farOffset: 5 } },
        };
        expect(resolveElevationClipRange(both, UNCLIPPED_ELEVATION_FAR_DEPTH_M).near).toBe(0);
        // …but with NO section volume it is the only near there is, and it is honoured.
        const roomInterior: ElevationClipSource = { spatial: { viewRange: { nearOffset: 1.2, farOffset: 5 } } };
        expect(resolveElevationClipRange(roomInterior, UNCLIPPED_ELEVATION_FAR_DEPTH_M).near).toBe(1.2);
        expect(resolveElevationClipRange(roomInterior, UNCLIPPED_ELEVATION_FAR_DEPTH_M).far).toBe(5);
    });

    it('an untouched elevation is UNCLIPPED, not a slab (the L-1855 regression fence)', () => {
        expect(resolveElevationClipRange({ spatial: {} }, UNCLIPPED_ELEVATION_FAR_DEPTH_M).far)
            .toBe(UNCLIPPED_ELEVATION_FAR_DEPTH_M);
        expect(UNCLIPPED_ELEVATION_FAR_DEPTH_M).toBeGreaterThanOrEqual(200);
    });

    it('rejects non-finite stores at BOTH ends rather than propagating NaN into the clip planes', () => {
        expect(resolveElevationClipRange({ crop: { farClip: { offset: NaN } }, spatial: {} }, 40).far).toBe(40);
        expect(resolveElevationClipRange(
            { spatial: { sectionVolume: { near: NaN, far: Number.POSITIVE_INFINITY } } }, 40,
        )).toEqual({ near: 0, far: 40 });
    });

    it('never returns an inverted window', () => {
        const inverted = resolveElevationClipRange(draggedCrop(9, 2), UNCLIPPED_ELEVATION_FAR_DEPTH_M);
        expect(inverted.far).toBeGreaterThanOrEqual(inverted.near);
    });

    it('a negative near is clamped to the cut plane, not propagated', () => {
        expect(resolveElevationClipRange(draggedCrop(-4, 6), UNCLIPPED_ELEVATION_FAR_DEPTH_M).near).toBe(0);
    });
});

describe('§CROP-IS-THE-CLIP C — resolveElevationFarDepth is now a projection of the range', () => {
    it.each(DEPTH_SWEEP)('the legacy far-only helper agrees with the range at %s m', (depth) => {
        const src = draggedCrop(0, depth);
        expect(resolveElevationFarDepth(src, UNCLIPPED_ELEVATION_FAR_DEPTH_M))
            .toBe(resolveElevationClipRange(src, UNCLIPPED_ELEVATION_FAR_DEPTH_M).far);
    });

    it('the two NAMED fallbacks still differ, and still mean different questions (L-1855)', () => {
        expect(UNCLIPPED_ELEVATION_FAR_DEPTH_M).not.toBe(DEFAULT_ELEVATION_SCOPE_DEPTH_M);
        const ELEV_MARK_RADIUS_M = 24;
        expect(DEFAULT_ELEVATION_SCOPE_DEPTH_M).toBeGreaterThan(ELEV_MARK_RADIUS_M);
    });
});

describe('§CROP-IS-THE-CLIP D — the degeneracy floor must be UNREACHABLE from any writer', () => {
    // ⚠ C01 §6 Rule 6 — "cannot happen" is a MEASUREMENT. The clamps quoted here were
    // read on 2026-08-22 from:
    //   PlanViewInteraction._applyScopeDragFromPointer  -> Math.max(nextVolume.near + 0.25, …)
    //   CreateElevationMarkCommand                      -> Math.max(0.5, …) / DEFAULT_RADIUS = 15
    //   ViewPropertiesPanel depth input                 -> Math.max(0.25, …), min="0.25"
    const WRITER_MIN_DEPTHS = [0.25, 0.5, 15];

    it('every writer clamps ABOVE the floor, so the floor changes no stored value', () => {
        for (const d of WRITER_MIN_DEPTHS) {
            expect(d).toBeGreaterThan(MIN_ELEVATION_CLIP_DEPTH_M);
            expect(resolveElevationClipRange(draggedCrop(0, d), UNCLIPPED_ELEVATION_FAR_DEPTH_M).far).toBe(d);
        }
    });

    it('it still refuses a zero-depth window, which would show nothing and be ungrabbable', () => {
        expect(resolveElevationClipRange(draggedCrop(0, 0), UNCLIPPED_ELEVATION_FAR_DEPTH_M).far)
            .toBe(MIN_ELEVATION_CLIP_DEPTH_M);
    });
});

describe('§CROP-IS-THE-CLIP E — spatial.cropRegion is a CULL box, and its margin explains the 0.10 m', () => {
    it('reproduces the founder-log arithmetic exactly: cropRegion depth = far + 2 x margin', () => {
        // The four samples that opened this lane, from ONE session on vd-sys-elev-south.
        // Each `loggedCropDepth` is the cropRegion Z-extent as printed (2 d.p.); each
        // `far` is the clip far as printed (3 d.p.). The gap is NOT a clip defect — it is
        // this margin, applied to all four sides of the axis-aligned plan-family CULL box
        // in PlanViewInteraction._cropRegionFromSectionVolume.
        const SAMPLES: Array<{ far: number; loggedCropDepth: number }> = [
            { far: 2.857, loggedCropDepth: 2.96 },
            { far: 1.217, loggedCropDepth: 1.32 },
            { far: 0.939, loggedCropDepth: 1.04 },
            { far: 2.857, loggedCropDepth: 2.95 },
        ];
        for (const s of SAMPLES) {
            const predicted = s.far + 2 * CROP_REGION_CULL_MARGIN_M;
            // ±0.011 is the printing tolerance: the log rounds BOTH cropRegion endpoints
            // to 2 d.p. before a reader subtracts them.
            expect(Math.abs(predicted - s.loggedCropDepth)).toBeLessThanOrEqual(0.011);
        }
    });

    it('the margin is not, and must never become, part of the clip range', () => {
        // The corrected claim: the ~0.10 m never reached a clip plane. If someone ever
        // wires the cull margin into the depth window, THIS is the assertion that fails.
        for (const d of DEPTH_SWEEP) {
            const clip = resolveElevationClipRange(draggedCrop(0, d), UNCLIPPED_ELEVATION_FAR_DEPTH_M);
            expect(clip.far).not.toBe(d + 2 * CROP_REGION_CULL_MARGIN_M);
            expect(clip.far).toBe(d);
        }
    });
});
