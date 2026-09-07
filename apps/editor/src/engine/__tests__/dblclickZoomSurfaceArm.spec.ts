/**
 * §PROBE-CANNOT-CONFUSE-NA-WITH-FAILURE (L-13209 · §CONTEXT-DATA-HONESTY · C59 §1.4)
 *
 * ⭐ THE DEFECT. The founder double-clicked, nothing happened, and the console printed four
 * copies of `raycast MISS and no usable fallback`. That report was not true and could not be:
 * the `dblclick` handler lives on `#container`, and the other view surfaces are DESCENDANTS of
 * `#container` — the ONE Cesium container (`#cesium-viewport-container`, re-parented into
 * whichever pane hosts 3D Site) and the MapLibre 2D site map. Neither registers a `dblclick`
 * handler of its own, so the event bubbles into a handler that raycasts the BIM three.js world
 * and frames the BIM camera. Cesium is a different camera on a different scene graph; even a HIT
 * would move a camera the user is not looking through. And over Cesium the raycast is not even
 * measured where he clicked — the OBC `Mouse` listens on the BIM canvas, which the Cesium
 * container covers as a sibling at z-index 15, so the caster still holds a STALE pointer position.
 *
 * The probe logged `{hasSelection, hasControls}` — the two facts that settle the ORIGINAL
 * L-6500 question — and nothing identifying the surface. **A diagnostic that cannot separate
 * "not applicable" from "failed" is the defect it exists to prevent.**
 *
 * These cases pin the classifier against a real DOM, and pin that the handler actually consults
 * it — a classifier nothing calls is authored-but-unwired, not a fix.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bimPickingApplies, notApplicableReason, surfaceUnderPointer } from '../pointerSurface';

describe('§PROBE-CANNOT-CONFUSE-NA-WITH-FAILURE — surfaceUnderPointer', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it("names the Cesium 3D Site surface wherever the ONE container currently lives", () => {
        // §L-412: the container is MOVED between panes, never duplicated — so the id is the
        // stable marker and the pane it sits in is not.
        document.body.innerHTML = `
            <div id="container">
                <div id="pane-right" style="position:relative">
                    <div id="cesium-viewport-container"><canvas id="cesium-canvas"></canvas></div>
                </div>
            </div>`;
        const canvas = document.getElementById('cesium-canvas')!;
        expect(surfaceUnderPointer(canvas)).toBe('cesium-3d-site');
        expect(bimPickingApplies(surfaceUnderPointer(canvas))).toBe(false);
    });

    it('names the MapLibre 2D site map by the class MapLibre itself applies', () => {
        // Library-guaranteed marker, so it does not rot when PRYZM renames its own wrapper.
        document.body.innerHTML = `
            <div id="container">
                <div id="pane-left" class="maplibregl-map">
                    <canvas class="maplibregl-canvas"></canvas>
                </div>
            </div>`;
        const canvas = document.querySelector('.maplibregl-canvas')!;
        expect(surfaceUnderPointer(canvas)).toBe('maplibre-2d-site');
    });

    it('classifies the BIM canvas as BIM — the handler keeps working where it belongs', () => {
        document.body.innerHTML = `
            <div id="container">
                <bim-viewport><canvas id="bim-canvas"></canvas></bim-viewport>
            </div>`;
        const canvas = document.getElementById('bim-canvas')!;
        expect(surfaceUnderPointer(canvas)).toBe('bim');
        expect(bimPickingApplies(surfaceUnderPointer(canvas))).toBe(true);
    });

    it('⛔ classifies a DOM OVERLAY above the BIM canvas as BIM, not as "not the canvas"', () => {
        // THE CASE A NEGATIVE TEST WOULD HAVE BROKEN. Room labels, gizmo chrome and measurement
        // overlays sit ABOVE the BIM canvas and are legitimate BIM-surface targets —
        // §ROOM-LABEL-EDIT double-clicks exactly such an element. Identification must be
        // POSITIVE ("is it inside a known non-BIM surface?"), never "is it the canvas?".
        document.body.innerHTML = `
            <div id="container">
                <canvas id="bim-canvas"></canvas>
                <div class="room-label" data-room-id="r1"><span id="label-text">Kitchen</span></div>
            </div>`;
        expect(surfaceUnderPointer(document.getElementById('label-text'))).toBe('bim');
    });

    it('defaults to BIM for an unrecognised or absent target — behaviour is only ADDED to', () => {
        expect(surfaceUnderPointer(null)).toBe('bim');
        expect(surfaceUnderPointer(undefined)).toBe('bim');
        expect(surfaceUnderPointer({} as EventTarget)).toBe('bim');
    });

    it('resolves the surface for a nested descendant, not only the surface root', () => {
        document.body.innerHTML = `
            <div id="cesium-viewport-container">
                <div class="cesium-widget"><div class="cesium-widget-credits"><a id="credit">x</a></div></div>
            </div>`;
        expect(surfaceUnderPointer(document.getElementById('credit'))).toBe('cesium-3d-site');
    });
});

describe('§PROBE-CANNOT-CONFUSE-NA-WITH-FAILURE — the sentence itself', () => {
    it('says NOT APPLICABLE, names the surface, and says it is NOT a failed pick', () => {
        const msg = notApplicableReason('cesium-3d-site');
        expect(msg).toContain('NOT APPLICABLE');
        expect(msg).toContain("'cesium-3d-site'");
        expect(msg).toContain('this is not a failed pick');
        // A missing feature is named and tracked, rather than presented as a malfunction.
        expect(msg).toContain('NOT');
        expect(msg).toContain('L-13210');
        // ⛔ It must not reuse the failure vocabulary the founder actually saw.
        expect(msg).not.toContain('MISS');
    });
});

describe('§PROBE-CANNOT-CONFUSE-NA-WITH-FAILURE — the production wiring', () => {
    const src = readFileSync(join(process.cwd(), 'apps/editor/src/engine/initUI.ts'), 'utf8');
    const handler = src.slice(
        src.indexOf("container.addEventListener('dblclick'"),
        src.indexOf("window.cameraControls = world.camera.controls"),
    );

    it('the dblclick handler resolves the surface and returns before the raycast', () => {
        expect(handler).toMatch(/const _surface = surfaceUnderPointer\(e\.target\)/);
        expect(handler).toMatch(/if \(!bimPickingApplies\(_surface\)\) \{[\s\S]{0,400}?notApplicableReason\(_surface\)/);
        // The NOT-APPLICABLE arm must precede `caster.castRay()`, or a stale-coordinate raycast
        // still runs and its result is still reported.
        const naAt = handler.indexOf('bimPickingApplies(_surface)');
        const castAt = handler.indexOf('await caster.castRay()');
        expect(naAt).toBeGreaterThan(-1);
        expect(castAt).toBeGreaterThan(naAt);
    });

    it('every remaining probe arm now carries the surface, so the others stay decidable', () => {
        // `hasSelection:false` on the BIM surface is a REAL finding (highlight and
        // `selectionManager.selectedObject` are different state). The same line on Cesium meant
        // nothing. Without the surface in the payload the two cannot be told apart.
        expect(handler).toMatch(/\{ surface: _surface, \.\.\.\(detail \?\? \{\}\) \}/);
        expect(handler).toMatch(/_probe\('raycast MISS and no usable fallback'/);
    });
});
