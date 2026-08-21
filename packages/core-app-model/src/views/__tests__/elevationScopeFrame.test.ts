/**
 * §ELEV-SCOPE-FRAME / §ELEV-SCOPE-DEPTH (L-1854 … L-1857)
 *
 * The founder, testing production build `071a7b2c` (2026-08-21):
 *   1.1 "there is a line staying static pointing to the wrong place"
 *   1.2 "East and west however dont work as expected: i am opening east elevation
 *        and it is showing me the wrong side? … the sides are off - and the
 *        'crop' is not present."
 *
 * These are THREE defects, and this file pins each one to a NUMBER rather than a
 * narrative — because the same subject already had three rival producers quietly
 * disagreeing, and prose is exactly what let them.
 *
 *   A. EAST/WEST SWAPPED in `DEFAULT_ELEVATION_VIEWS` (1.2, "wrong side").
 *   B. TWO magic far-clip fallbacks for ONE quantity — 200 in the projector, 8 in
 *      the plan scope handle (1.2, "sides are off" / "crop is not present").
 *   C. `crop.region[0]` read with the OFFSET meaning by the cut-line renderer while
 *      the writer used the ABSOLUTE meaning (1.1, "static … wrong place").
 *
 * ⚠ These assertions are DIRECTIONAL, not cosmetic. If one fails, do not "fix" it
 * by flipping the expectation — re-derive the frame from the block comment in
 * `ViewDefinitionTypes.ts`, which starts from `PlanViewService.getViewConfig('top')`
 * and is the only non-circular authority here.
 */

import { describe, it, expect } from 'vitest';
import {
    VIEW_PROJECTION_DIRECTIONS,
    UNCLIPPED_ELEVATION_FAR_DEPTH_M,
    DEFAULT_ELEVATION_SCOPE_DEPTH_M,
    resolveElevationFarDepth,
} from '../ViewDefinitionTypes';
import { DEFAULT_ELEVATION_VIEWS } from '../DefaultViewsManager';

/** Normalise -0 to 0 — negating an axis-aligned component yields -0, which
 *  `toEqual` distinguishes from 0 and which means nothing geometrically. */
const nz = (n: number) => (n === 0 ? 0 : n);

/** The mark/camera sits at `-direction * radius` — see `_elevationMarkPlacement`. */
const viewerSideOf = (d: { x: number; z: number }) => ({ x: nz(-d.x), z: nz(-d.z) });

const byName = (name: string) => {
    const row = DEFAULT_ELEVATION_VIEWS.find(v => v.name === name);
    if (!row) throw new Error(`no default elevation named ${name}`);
    return row;
};

describe('§ELEV-SCOPE-FRAME A — the four default elevations name the façade they SHOW', () => {
    // THE FRAME, derived once (see ViewDefinitionTypes): plan screen-up = -Z = NORTH,
    // plan screen-right = +X = EAST. An elevation is named for the façade nearest the
    // viewer, and the viewer stands at `-direction`.
    const NORTH = { x: 0, z: -1 };
    const SOUTH = { x: 0, z: 1 };
    const EAST = { x: 1, z: 0 };
    const WEST = { x: -1, z: 0 };

    it('North Elevation is viewed FROM the north (-Z)', () => {
        expect(viewerSideOf(byName('North Elevation').dir)).toEqual(NORTH);
    });

    it('South Elevation is viewed FROM the south (+Z) — the row the founder confirms works', () => {
        expect(viewerSideOf(byName('South Elevation').dir)).toEqual(SOUTH);
    });

    it('East Elevation is viewed FROM the east (+X) — REGRESSION: it was viewed from the WEST', () => {
        expect(viewerSideOf(byName('East Elevation').dir)).toEqual(EAST);
        // The precise defect: East used to be `elevationRight` (+1,0,0).
        expect(byName('East Elevation').dir).toEqual(VIEW_PROJECTION_DIRECTIONS.elevationLeft);
        expect(byName('East Elevation').dir).not.toEqual(VIEW_PROJECTION_DIRECTIONS.elevationRight);
    });

    it('West Elevation is viewed FROM the west (-X) — REGRESSION: it was viewed from the EAST', () => {
        expect(viewerSideOf(byName('West Elevation').dir)).toEqual(WEST);
        expect(byName('West Elevation').dir).toEqual(VIEW_PROJECTION_DIRECTIONS.elevationRight);
    });

    it('all four are distinct, opposite in pairs, and axis-aligned', () => {
        const dirs = DEFAULT_ELEVATION_VIEWS.map(v => `${v.dir.x},${v.dir.z}`);
        expect(new Set(dirs).size).toBe(4);
        expect(viewerSideOf(byName('East Elevation').dir).x)
            .toBe(-viewerSideOf(byName('West Elevation').dir).x);
        expect(viewerSideOf(byName('North Elevation').dir).z)
            .toBe(-viewerSideOf(byName('South Elevation').dir).z);
    });

    it('agrees with ai-host buildingElevations, the independent producer that was already right', () => {
        // packages/ai-host/src/workflows/houseLayout/buildingElevations.ts:
        //   { direction: 'E', anchor: { x: maxX + offset }, facing: { x: -1, z: 0 } }
        // and apps/editor/src/engine/initUI.ts generateElevations:
        //   'East Elevation' -> THREE.Vector3(-1, 0, 0), camera at +distance on X.
        expect(byName('East Elevation').dir.x).toBe(-1);
        expect(byName('West Elevation').dir.x).toBe(1);
    });
});

describe('§ELEV-SCOPE-DEPTH B — one far-clip expression, two NAMED fallbacks', () => {
    const stored = (offset: number) => ({ crop: { farClip: { offset } }, spatial: {} });

    it('a stored farClip wins for BOTH callers — projector and scope handle agree', () => {
        expect(resolveElevationFarDepth(stored(12.5), UNCLIPPED_ELEVATION_FAR_DEPTH_M)).toBe(12.5);
        expect(resolveElevationFarDepth(stored(12.5), DEFAULT_ELEVATION_SCOPE_DEPTH_M)).toBe(12.5);
    });

    it('falls back to viewRange.farOffset before the caller default', () => {
        expect(resolveElevationFarDepth({ spatial: { viewRange: { farOffset: 7 } } }, 999)).toBe(7);
    });

    it('an untouched elevation projects UNCLIPPED, not a slab', () => {
        expect(resolveElevationFarDepth({ spatial: {} }, UNCLIPPED_ELEVATION_FAR_DEPTH_M))
            .toBe(UNCLIPPED_ELEVATION_FAR_DEPTH_M);
        expect(UNCLIPPED_ELEVATION_FAR_DEPTH_M).toBeGreaterThanOrEqual(200);
    });

    it('THE DEFECT: the scope handle default must REACH a mark seeded 24 m out', () => {
        // ELEV_MARK_RADIUS_M = 24. The old literal was 8, so the handle sat 16 m SHORT
        // of the origin and could never touch the building — and dragging it committed
        // 8 m into crop.farClip, collapsing the projector's far from 200 to 8.
        const ELEV_MARK_RADIUS_M = 24;
        expect(DEFAULT_ELEVATION_SCOPE_DEPTH_M).toBeGreaterThan(ELEV_MARK_RADIUS_M);
        expect(DEFAULT_ELEVATION_SCOPE_DEPTH_M).not.toBe(8);
    });

    it('rejects a non-finite stored value rather than propagating NaN into the clip range', () => {
        expect(resolveElevationFarDepth({ crop: { farClip: { offset: NaN } }, spatial: {} }, 40)).toBe(40);
    });
});

describe('§ELEV-SCOPE-FRAME C — the two rival encodings of crop.region[0]', () => {
    /**
     * This is the arithmetic of the founder's static line, reproduced from his own
     * console numbers. It does not need the renderer: the displacement is a property
     * of the two encodings, and that is the point — the bug is in the ENCODING, not
     * in any one call site.
     *
     * South elevation, from his log:
     *   cropRegion = [-15.69,-5.84 -> 0.15,-2.89]   (absolute world XZ)
     * so `crop.region` = [minH, minY] = [-15.69, ...], written ABSOLUTE by the drag.
     */
    const ABS_MIN_H = -15.69;
    const ABS_MAX_H = 0.15;
    /** The mark's own H coordinate — the centre of that window after his move. */
    const ANCHOR_H = (ABS_MIN_H + ABS_MAX_H) / 2;

    it('reading an ABSOLUTE region as an OFFSET displaces the line by the anchor itself', () => {
        // The OFFSET reading (`_computeElevationScope`): a = anchor + perp * region[0].
        // For a South elevation dir=(0,0,-1), perp = (-dir.z, dir.x) = (1, 0), so the
        // perpendicular axis IS world X and the arithmetic is scalar.
        const offsetReadingMinH = ANCHOR_H + ABS_MIN_H;
        const offsetReadingMaxH = ANCHOR_H + ABS_MAX_H;

        // The ABSOLUTE reading (`_scopeWorld` via sectionVolume) — what the crop
        // rectangle and the projector both use.
        const absoluteReadingMinH = ABS_MIN_H;
        const absoluteReadingMaxH = ABS_MAX_H;

        const displacement = offsetReadingMinH - absoluteReadingMinH;
        expect(displacement).toBeCloseTo(ANCHOR_H, 6);
        expect(displacement).toBeCloseTo(-7.77, 2);

        // Same WIDTH, wrong PLACE — which is why it looked like a correct line that
        // simply refused to move, rather than like corrupt geometry.
        expect(offsetReadingMaxH - offsetReadingMinH)
            .toBeCloseTo(absoluteReadingMaxH - absoluteReadingMinH, 6);
        expect(offsetReadingMinH).not.toBeCloseTo(absoluteReadingMinH, 1);
    });

    it('the two readings coincide ONLY when the anchor sits at H = 0 — why it hid so long', () => {
        const anchorAtOrigin = 0;
        expect(anchorAtOrigin + ABS_MIN_H).toBeCloseTo(ABS_MIN_H, 6);
        // Default marks are seeded at ±24 m on one axis and 0 on the other, so two of
        // the four default elevations DO have anchor H = 0 and looked perfectly fine.
    });
});
