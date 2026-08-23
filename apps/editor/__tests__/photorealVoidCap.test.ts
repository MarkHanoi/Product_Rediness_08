// §FIX-PHOTOREAL-VOID-CAP + §PROBE-GLOBE-BUILDING-IN-VOID (L-10180, founder 2026-08-23) —
// "cut the buildings properly in 3D globe? and ideally mask the cut area with white surfaces?
//  my building is not visible because probably the parcel is smaller than the 3D globe tiles".
//
// THREE complaints, and they are NOT one defect. This suite pins what was MEASURED about each,
// and pins the honest limits, so the next reader cannot re-derive the wrong story from a
// screenshot:
//
//   1. JAGGED EDGE — measured NOT to be clip precision. Cesium's ClippingPolygonCollection
//      resolves the cut against a signed-distance field sized
//      `min(maximumTextureSize, max(128, ceil(4096 * quality)))` with `quality` defaulting to 1,
//      LINEAR-filtered, over the parcel's own extent. That is already the API ceiling, so no
//      clipping parameter can smooth the edge. Asserted against the shipped Cesium bundle, not
//      restated from documentation.
//   2. EXPOSED INTERIOR — a vertical cut through captured 3-D mesh exposes a SECTION and its
//      back faces. Fixed by masking, which is what the founder asked for.
//   3. "BUILDING NOT VISIBLE" — has at least four causes that look identical on screen and are
//      distinguished only by runtime state. ⛔ NOT fixed here, and deliberately not guessed: a
//      probe prints the discriminator instead. This suite pins that the probe reports every one
//      of the four, because a probe that omits a candidate silently rules it out.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const VIEWPORT_SRC = resolve(__dirname, '../src/ui/geospatial/CesiumViewport.ts');
const CESIUM_BUNDLE = resolve(
    __dirname, '../../../node_modules/cesium/Build/CesiumUnminified/index.js',
);
const src = (): string => readFileSync(VIEWPORT_SRC, 'utf8');

describe('§FIX-PHOTOREAL-VOID-CAP — the cut is masked, and the mask cannot outlive its void', () => {
    it('masks the void with an opaque WHITE plug seated on the building’s own datum', () => {
        const body = src();
        expect(body).toContain("name: 'pryzm-photoreal-void-cap'");
        // White = the SAME near-white the Forma study paints the model with, so the cleared plot
        // reads as part of one visual language rather than as a new material.
        expect(body).toMatch(/applyPhotorealVoidCap[\s\S]{0,2000}FORMA_PALETTE\.proposedFill/);
        // A SOLID plug (top + sides + bottom closed), not a cap or a skirt: a skirt's walls face
        // outward, so a camera in or above the pit sees their back faces — the artefact being fixed.
        expect(body).toMatch(/applyPhotorealVoidCap[\s\S]{0,2000}closeTop: true/);
        expect(body).toMatch(/applyPhotorealVoidCap[\s\S]{0,2000}closeBottom: true/);
        expect(body).toMatch(/applyPhotorealVoidCap[\s\S]{0,2000}extrudedHeight: top/);
    });

    it('seats the plug BELOW the building so the design’s own slab wins the depth test', () => {
        const body = src();
        expect(body).toMatch(/const PHOTOREAL_VOID_CAP_SEAT_EPSILON_M = 0\.05;/);
        expect(body).toMatch(/const PHOTOREAL_VOID_CAP_DEPTH_M = 60;/);
        expect(body).toMatch(/const top = this\.formaTerrainBaseHeight - PHOTOREAL_VOID_CAP_SEAT_EPSILON_M;/);
        // The plug extends DOWNWARD from that top — it must never rise above the building's seat.
        expect(body).toMatch(/height: top - PHOTOREAL_VOID_CAP_DEPTH_M/);
    });

    it('is created ONLY where a void was cut, and removed everywhere the void is', () => {
        const body = src();
        // One chokepoint owns both: the clip and its mask are applied and dropped together.
        expect(body).toMatch(/tileset\.clippingPolygons = new Cesium\.ClippingPolygonCollection[\s\S]{0,900}this\.applyPhotorealVoidCap\(parcel\)/);
        // Every branch that drops or skips the clip drops the mask too — opt-out, no tileset,
        // no parcel, and the failure path.
        const clipMethod = body.slice(body.indexOf('private applyParcelClipToPhotorealTiles('));
        const clipBody = clipMethod.slice(0, clipMethod.indexOf('\n  /**'));
        expect((clipBody.match(/this\.clearPhotorealVoidCap\(\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
    });

    it('never renders in the FORMA study, where there are no tiles and no hole', () => {
        const body = src();
        // Two independent guards, because the tileset can finish loading while the user is
        // already in Forma (the clip is still applied to the hidden tiles, correctly).
        expect(body).toMatch(/applyPhotorealVoidCap[\s\S]{0,1200}if \(this\.formaMode\) return;/);
        // …and entering Forma drops any existing plug, in the same block that resets the base to 0
        // (a surviving plug would hang at the ellipsoid under the flat Forma ground).
        expect(body).toMatch(/this\.globeBuildingHiddenForGround = false;[\s\S]{0,900}this\.clearPhotorealVoidCap\(\);/);
    });

    it('rides the SAME ground re-seat as the building it stands under', () => {
        const body = src();
        // The plug is created when the void is cut, which can precede the tile-height clamp by
        // seconds. Without this it stays at ellipsoid 0 while the building rises to real ground.
        expect(body).toContain('private reseatPhotorealVoidCap(): void');
        expect(body).toMatch(/this\.reseatRealModelOnGlobe\(\);[\s\S]{0,1200}this\.reseatPhotorealVoidCap\(\)/);
        // …and it is dropped on project switch / dispose, where the base resets to 0.
        expect(body).toMatch(/this\.clearContextSea\(\);[\s\S]{0,600}this\.clearPhotorealVoidCap\(\);/);
    });
});

describe('§PROBE-GLOBE-BUILDING-IN-VOID — the third complaint is measured, not guessed', () => {
    it('reports all FOUR causes of "my building is not visible"', () => {
        const body = src();
        const i = body.indexOf('private logPhotorealVoidVsBuilding(');
        expect(i).toBeGreaterThan(0);
        const probe = body.slice(i, body.indexOf('\n  /**', i) + 1);
        // 1. anchored OUTSIDE the void (the design stands under un-clipped tiles — buried — while
        //    the void reads fine elsewhere). The ONLY cause invisible in a screenshot.
        expect(probe).toContain('anchor-in-void=');
        expect(probe).toContain('pointInRingEvenOdd');
        // 2. held hidden for an unresolved ground datum (L-259).
        expect(probe).toContain('held-hidden-for-ground=');
        expect(probe).toMatch(/ground=\$\{this\.globeGroundResolved/);
        // 3. no real model at all — the GLB export refused over the triangle budget.
        expect(probe).toContain('real-model=');
        expect(probe).toContain('REAL GLB declined');
        // 4. seated below the visible ground — the number and its source, never a verdict.
        expect(probe).toContain('seat=');
        expect(probe).toContain('this.globeGroundSource');
        // …and the massing fallback's own visibility, so "nothing at all" is separable from
        // "the real model specifically".
        expect(probe).toContain('massing-visible=');
    });

    it('fires at the moment the void is cut, and can never break the globe', () => {
        const body = src();
        expect(body).toMatch(/this\.applyPhotorealVoidCap\(parcel\);[\s\S]{0,600}this\.logPhotorealVoidVsBuilding\(parcel\)/);
        const i = body.indexOf('private logPhotorealVoidVsBuilding(');
        const probe = body.slice(i, body.indexOf('\n  /**', i) + 1);
        expect(probe).toMatch(/try \{[\s\S]*\} catch \(e\) \{/);
        // Read-only: a probe that mutates is not a probe.
        expect(probe).not.toMatch(/\.show = /);
        expect(probe).not.toMatch(/this\.\w+ = /);
    });
});

describe('§FIX-PHOTOREAL-VOID-CAP — the JAGGED EDGE is a named limit, measured against Cesium', () => {
    it('the clip’s signed-distance resolution is ALREADY at the API ceiling', () => {
        // Measured against the SHIPPED bundle, not restated from docs. If a Cesium upgrade
        // changes this formula, the L-452 retirement note above it is no longer supported and
        // this test must be re-read rather than re-baselined.
        const cesium = readFileSync(CESIUM_BUNDLE, 'utf8');
        expect(cesium).toContain('ClippingPolygonCollection.getClippingDistanceTextureResolution');
        expect(cesium).toMatch(/const baseSize = Math\.max\(128, Math\.ceil\(4096 \* quality\)\);/);
        expect(cesium).toMatch(/this\.quality = options\.quality \?\? 1;/);
        // …and it is LINEAR-filtered, so the cut is anti-aliased rather than texel-stepped.
        expect(cesium).toMatch(/magnificationFilter: TextureMagnificationFilter_default\.LINEAR/);
    });

    it('L-452 is RETIRED, not restated — the fix it called untried is what runs', () => {
        const body = src();
        const i = body.indexOf('private applyParcelClipToPhotorealTiles(');
        const clip = body.slice(i, body.indexOf('\n  /**', i) + 1);
        // The old sentence is still PRESENT — deliberately, quoted verbatim — but only INSIDE
        // the notice that retires it. Deleting it would leave the next reader unable to tell
        // that the claim was ever made, which is how the same wrong remedy gets re-proposed.
        // What must be true is the ORDER: the retirement comes first, and the quote follows it.
        const retired = clip.indexOf('§L-452 IS SPENT');
        const oldClaim = clip.indexOf('is the first thing to try');
        expect(retired, 'the L-452 retirement notice must be present').toBeGreaterThan(-1);
        expect(oldClaim, 'the retired sentence must be quoted, not deleted').toBeGreaterThan(retired);
        // …and it must be quoted as SPENT rather than restated as guidance.
        expect(clip).toMatch(/HAS been tried and IS what runs below/);
        // …and the code must actually be using the polygon clip, not the plane-volume it replaced.
        expect(clip).toContain('new Cesium.ClippingPolygonCollection(');
        expect(clip).not.toContain('new Cesium.ClippingPlaneCollection(');
    });
});
