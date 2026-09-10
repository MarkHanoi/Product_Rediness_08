/**
 * §FAR-PLANE-MUST-CLEAR-THE-LAND (L-13306) + §BRIDGE-GIVES-THE-CAMERA-BACK (L-13307)
 *
 * FOUNDER, 2026-09-10, on a 3,314,327 m² (331 ha) Delaware parcel:
 *   *"if i approach more than this distance the envelope starts to disappear — which is of course
 *    really wrong. The same happens on PRYZM 3D view — since the plot is too big the graphics
 *    don't react as I would expect — I was expecting the same level of camera behaviour but it
 *    doesn't."*
 *
 * ⭐ THE DIVERGENCE HE NAMES IS REAL AND IT IS TOTAL. Measured across both views:
 *
 *   |               | Cesium "3D Site"          | THREE "PRYZM 3D"                       |
 *   |---------------|---------------------------|----------------------------------------|
 *   | near          | 1.0 m (stock, never set)  | 0.1 m, then adaptive from standoff     |
 *   | far           | 5e8 m (stock, never set)  | 1000 m boot → 2000 m baseline          |
 *   | log depth     | scene.logarithmicDepthBuffer = true | WebGL yes / **WebGPU (live) no** |
 *   | from plot?    | **no** — nothing plot-scaled at all | no — from a FIT, not the plot  |
 *
 * NEITHER view derives its depth range from the plot. Cesium runs entirely on vendor defaults —
 * `camera.frustum.near` / `.far` / `scene.farToNearRatio` have **zero writes repo-wide**.
 *
 * ⛔ ARM A BELOW IS THE ARITHMETIC OF THE PRYZM-3D HALF, AND IT IS THE PART THAT CLIPS. These
 * cases drive the REAL `computeFitPose` and `boundsFromSiteRing` — not a fake — because a fake
 * built from the same assumption cannot falsify it ([[fake-more-capable-than-real]]).
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeFitPose, boundsFromSiteRing, GLOBE_SCALE_LIMIT_M } from './cameraFraming';

const FOUNDER_PARCEL_AREA_M2 = 3_314_327;
const FOUNDER_PARCEL_SIDE_M = Math.sqrt(FOUNDER_PARCEL_AREA_M2);   // 1 820.53…

/** One ordinary 20 m building at the origin — what `_getFramingBounds` returns once a wall exists. */
const oneBuilding = (): THREE.Box3 =>
    new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 6, 10));

const squareRing = (side: number): Array<{ x: number; z: number }> => {
    const h = side / 2;
    return [{ x: -h, z: -h }, { x: h, z: -h }, { x: h, z: h }, { x: -h, z: h }];
};

const REPO = resolve(__dirname, '../../../..');
const read = (p: string): string => readFileSync(resolve(REPO, p), 'utf8');

describe('§FAR-PLANE-MUST-CLEAR-THE-LAND — ARM A: the arithmetic that made the envelope vanish', () => {
    it('⛔ THE DEFECT, REPRODUCED: one wall on a 331 ha parcel yields far = 2000 m', () => {
        // ⭐ This is the premise of the whole lane, and it is asserted rather than asserted-about.
        // `_getFramingBounds()` returns the MODEL when the model is non-empty — correct for
        // FRAMING — so `computeFitPose` never sees the land at all.
        const pose = computeFitPose(oneBuilding(), { fovDeg: 60, aspect: 1.71 });
        expect(pose).not.toBeNull();
        expect(pose!.far, 'the baseline is what a 20 m building gets').toBe(2000);

        // …and the founder's envelope is far bigger than that frustum.
        expect(FOUNDER_PARCEL_SIDE_M).toBeGreaterThan(pose!.far / 2);
    });

    it('⭐ THE FIX'
        + ' — the UNION of model and site produces a far plane that clears the whole parcel', () => {
        const site = boundsFromSiteRing(squareRing(FOUNDER_PARCEL_SIDE_M));
        expect(site, 'the site ring must be readable for the union to mean anything').not.toBeNull();

        const union = oneBuilding().clone().union(site!);
        const pose = computeFitPose(union, { fovDeg: 60, aspect: 1.71 });
        expect(pose).not.toBeNull();

        // The far plane must clear the BACK of the parcel from wherever the fit stands.
        const radius = union.getSize(new THREE.Vector3()).length() / 2;
        expect(pose!.far).toBeGreaterThan(pose!.distance + radius);
        // …and it is decisively wider than the model-only answer that caused the report.
        expect(pose!.far).toBeGreaterThan(2000);
    });

    it('⛔ SCRAMBLE: an ORDINARY city plot is unchanged — the widening costs small sites nothing', () => {
        // ⛔ THE COLLATERAL ARM. If unioning the site changed the answer for a 30 m plot, this
        // "fix" would have widened the depth range of every project in the product to buy one.
        const modelOnly = computeFitPose(oneBuilding(), { fovDeg: 60, aspect: 1.71 })!;
        const withSite = computeFitPose(
            oneBuilding().clone().union(boundsFromSiteRing(squareRing(30))!),
            { fovDeg: 60, aspect: 1.71 },
        )!;
        expect(withSite.far, 'a 30 m plot must still land on the 2000 m baseline').toBe(modelOnly.far);
        expect(withSite.near).toBe(modelOnly.near);
    });

    it('⛔ SCRAMBLE: the near plane is NOT widened with the far plane (L-747 stays closed)', () => {
        // The founder's OTHER camera report — *"as I get closer to the element it gets
        // sectioned"* — was a near plane dragged out by a huge far. `MAX_BIM_NEAR_M` pins it, and
        // a lane that widens `far` must not undo that.
        const union = oneBuilding().clone().union(boundsFromSiteRing(squareRing(FOUNDER_PARCEL_SIDE_M))!);
        const pose = computeFitPose(union, { fovDeg: 60, aspect: 1.71 })!;
        expect(pose.near, 'a wider far must never push the near plane out').toBeLessThanOrEqual(0.1);
    });

    it('⛔ SCRAMBLE: globe/ECEF-scale bounds are still refused — this is a large PLOT, not a planet', () => {
        const globe = new THREE.Box3(
            new THREE.Vector3(-GLOBE_SCALE_LIMIT_M * 2, 0, -GLOBE_SCALE_LIMIT_M * 2),
            new THREE.Vector3(GLOBE_SCALE_LIMIT_M * 2, 0, GLOBE_SCALE_LIMIT_M * 2),
        );
        const radius = globe.getSize(new THREE.Vector3()).length() / 2;
        expect(radius, 'the premise of the guard this lane must not weaken')
            .toBeGreaterThan(GLOBE_SCALE_LIMIT_M);
    });
});

describe('§FAR-PLANE-MUST-CLEAR-THE-LAND — ARM B: both callers are wired, in the right order', () => {
    // ⛔ ARM A proves the ARITHMETIC. It cannot prove the code RUNS — that is the
    // [[committed-is-not-reachable]] gap, and it is exactly how a correct fix ships doing nothing.
    const vc = (): string => read('apps/editor/src/engine/ViewController.ts');

    it('⭐ the 3D activation widens the far plane AFTER repairing the near plane', () => {
        const src = vc();
        const repair = src.indexOf('this._repairCameraDepthRange();');
        const widen = src.indexOf("this._ensureFarPlaneClearsTheSite('3d-activation')");
        expect(repair, 'the near repair is gone').toBeGreaterThan(-1);
        expect(widen, 'the activation never widens the far plane').toBeGreaterThan(-1);
        // ⛔ ORDER IS LOAD-BEARING: the repair can itself set far = 2000, so widening first would
        // be silently undone a line later.
        expect(widen, 'the widening runs BEFORE the repair that overwrites it').toBeGreaterThan(repair);
    });

    it('⭐ the near-plane repair re-floors the far plane it just capped', () => {
        const src = vc();
        const cap = src.indexOf('cam.far = CAMERA_BIM_BASELINE_FAR_M;\n        }');
        const floor = src.indexOf("this._ensureFarPlaneClearsTheSite('near-plane-repair')");
        expect(cap).toBeGreaterThan(-1);
        expect(floor, 'repairing a poisoned camera still amputates a large site').toBeGreaterThan(cap);
    });

    it('⛔ the far widening ONLY EVER WIDENS — no assignment that could shrink it', () => {
        const src = vc();
        const start = src.indexOf('private _ensureFarPlaneClearsTheSite(');
        expect(start).toBeGreaterThan(-1);
        const body = src.slice(start, start + 4200);
        expect(body, 'the guard that makes this monotonic is gone')
            .toContain('if (needed <= cam.far) return;');
    });
});

describe('§BRIDGE-GIVES-THE-CAMERA-BACK (L-13307) — both exits restore what both copies took', () => {
    // ⛔ TWO BYTE-IDENTICAL COPIES OF THIS FILE EXIST. Fixing one does not fix the other, and the
    // live one is `plugins/geospatial` (constructed in `GISAreaLayout`). Both are asserted so a
    // future edit to one is caught by the other's case rather than by a founder.
    const COPIES = [
        'plugins/geospatial/src/CesiumThreeBridge.ts',
        'packages/renderer-three/src/geospatial/CesiumThreeBridge.ts',
    ];

    for (const path of COPIES) {
        it(`⭐ ${path} captures the BIM range before overwriting it, ONCE`, () => {
            const src = read(path);
            const overwrite = src.indexOf('this.threeCamera.near = perspectiveFrustum.near;');
            const capture = src.indexOf('if (this.bimDepthRange === null) {');
            expect(overwrite, 'the Cesium frustum write is gone — re-check this suite').toBeGreaterThan(-1);
            expect(capture, 'the BIM depth range is never captured, so it can never be given back')
                .toBeGreaterThan(-1);
            // ⛔ BEFORE, or the captured value IS Cesium's and the restore is a no-op wearing a
            // helpful name. And guarded on null, or `postRender` recaptures it every frame.
            expect(capture, 'the capture runs AFTER the overwrite it is supposed to precede')
                .toBeLessThan(overwrite);
        });

        it(`⭐ ${path} restores on BOTH exits — deactivate() and dispose()`, () => {
            const src = read(path);
            const deact = src.indexOf('public deactivate()');
            const disp = src.indexOf('public dispose()');
            expect(deact).toBeGreaterThan(-1);
            expect(disp).toBeGreaterThan(deact);
            const inDeactivate = src.slice(deact, disp);
            const inDispose = src.slice(disp);
            // ⛔ `dispose()` does NOT route through `deactivate()` in this class — a camera
            // released on that path kept Cesium's near=1.0 / far=5e8 exactly as before.
            expect(inDeactivate, 'deactivate() leaks the Cesium depth range onto the BIM camera')
                .toContain('this.threeCamera.far = this.bimDepthRange.far;');
            expect(inDispose, 'dispose() is a SECOND exit and it still leaks')
                .toContain('this.threeCamera.far = this.bimDepthRange.far;');
        });

        it(`⛔ SCRAMBLE: ${path} RESTORES, it does not re-derive a third BIM depth range`, () => {
            // Writing `near = 0.1; far = 2000` here would be a third opinion about the BIM range
            // — and on a 331 ha parcel the constant is the WRONG one, which is L-13306.
            const src = read(path);
            const deact = src.indexOf('public deactivate()');
            const body = src.slice(deact);
            expect(body).not.toMatch(/this\.threeCamera\.far\s*=\s*\d/);
            expect(body).not.toMatch(/this\.threeCamera\.near\s*=\s*0\.1/);
        });
    }
});
