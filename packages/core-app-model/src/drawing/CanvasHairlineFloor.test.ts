/**
 * @vitest-environment happy-dom
 *
 * §FIX-PLAN-CANVAS-HAIRLINE-FLOOR (L-288) — C09 §4.6.4, Contract-23 §7.
 *
 * ═══ WHAT THE BUG LOOKS LIKE ON SCREEN ═══
 *
 * Before asserting anything, state the defect in the units the founder sees it in. On a 1×
 * display (most laptops; most projectors) the canvas floored every stroke at 1 CSS px, and at
 * 96 DPI the pen table's whole lower half is BELOW that floor:
 *
 *     wall    PROJECTION  0.25 mm → 0.945 px  ─┐
 *     door    PROJECTION  0.18 mm → 0.680 px   ├─ ALL clamped to exactly 1 px
 *     ceiling PROJECTION  0.13 mm → 0.491 px   │
 *     any     BEYOND      0.09 mm → 0.340 px  ─┘
 *
 * So the drawing had a hierarchy and the SCREEN DID NOT. The pens were never wrong — EXPORT is
 * and always was correct (2.95 px vs 2.07 px at EXPORT_DPI). The rasteriser was wrong.
 *
 * ═══ WHY THESE ASSERTIONS DISCRIMINATE THE BUG (the square-column lesson) ═══
 *
 * A guard that asserted the pens in MILLIMETRES would score a perfect pass **on the broken
 * product** — the millimetres were always right; that is the entire nature of L-288. Every
 * assertion below is therefore in **DEVICE PIXELS** (`ctx.lineWidth × backingScale`, measured at
 * the moment `ctx.stroke()` is called during a real `PlanViewCanvas.render()` with
 * `devicePixelRatio` pinned to 1). That is the only unit in which the bug is even expressible.
 *
 * Falsified before trusted: pinning the backing scale back to `devicePixelRatio` (i.e. restoring
 * the old floor) turns the ordering tests RED — recorded in the commit.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import { resolvePen, THINNEST_SYSTEM_PEN_MM } from './PenWeightTable';
import {
    resolveCanvasRenderScale,
    minStrokePx,
    dashScale,
    MIN_LEGIBLE_BACKING_SCALE,
    MAX_BACKING_SCALE,
} from './CanvasRenderScale';
import { SCREEN_PX_PER_MM, EXPORT_DPI, pxPerMm } from './DrawingConstants';
import { ELEMENT_FUNCTION_KEY } from './ElementFunction';
import { PlanViewCanvas } from '../views/PlanViewCanvas';
import { viewDefinitionStore } from '../views/ViewDefinitionStore';
import { viewTechnicalDrawingCache } from '../views/ViewTechnicalDrawingCache';

interface Stroke { widthCss: number; widthDevice: number; dash: number[] }

/**
 * Render a plan at a PINNED devicePixelRatio and report every stroke in DEVICE PIXELS.
 *
 * `widthDevice = ctx.lineWidth × scale` because `render()` installs `setTransform(scale, …)`:
 * lineWidth is in CSS units and the transform maps it onto the backing store. Device pixels are
 * what the eye receives, so device pixels are what this file asserts.
 */
function strokesAtDpr(
    viewId: string,
    layers: Array<{ layer: string; fn?: string }>,
    dpr: number,
    viewType: 'plan' | 'elevation' = 'plan',
): Stroke[] {
    viewDefinitionStore.reset();
    viewDefinitionStore.create({ id: viewId, name: 'V', viewType });

    const root = new THREE.Group();
    for (const { layer, fn } of layers) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0], 3));
        const ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial());
        ls.name = layer;
        ls.userData.layerName = layer;
        if (fn) ls.userData[ELEMENT_FUNCTION_KEY] = fn;
        root.add(ls);
    }
    viewTechnicalDrawingCache.set(viewId, { three: root } as never);

    const scale = resolveCanvasRenderScale(dpr);
    const strokes: Stroke[] = [];
    let dash: number[] = [];
    const ctx = {
        lineWidth: 1, strokeStyle: '#000', globalAlpha: 1, fillStyle: '#000',
        font: '', textAlign: '', textBaseline: '', lineCap: '', lineJoin: '', miterLimit: 10,
        imageSmoothingEnabled: true,
        setTransform() {}, save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
        closePath() {}, fill() {}, fillRect() {}, fillText() {}, clip() {}, rect() {}, arc() {},
        drawImage() {}, createPattern: (): null => null, translate() {}, scale() {},
        setLineDash(d: number[]) { dash = d ?? []; },
        getLineDash() { return dash; },
        stroke() {
            strokes.push({
                widthCss:    (ctx as { lineWidth: number }).lineWidth,
                widthDevice: (ctx as { lineWidth: number }).lineWidth * scale,
                dash:        [...dash],
            });
        },
    } as unknown as CanvasRenderingContext2D;

    const canvas = {
        getContext: () => ctx, width: 0, height: 0, clientWidth: 800, clientHeight: 600,
    } as unknown as HTMLCanvasElement;

    const prev = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', { value: dpr, configurable: true });
    try {
        const pvc = new PlanViewCanvas(canvas, { gridVisible: false });
        pvc.setViewType(viewType);
        if (viewType === 'elevation') pvc.setSectionAxes('x', true, 1);
        pvc.setSize(800, 600);
        pvc.render(viewDefinitionStore.get(viewId)!);
    } finally {
        Object.defineProperty(window, 'devicePixelRatio', { value: prev, configurable: true });
    }
    return strokes;
}

// ─── (A) THE SCALE IS DERIVED FROM THE PEN TABLE, NOT CHOSEN ─────────────────

describe('§FIX-PLAN-CANVAS-HAIRLINE-FLOOR — the backing scale is DERIVED from the thinnest pen', () => {

    it('is exactly big enough to render the table\'s lightest pen as a real mark', () => {
        // The thinnest pen (0.09 mm ≈ 0.340 CSS px) needs ceil(1/0.340) = 3 device px per CSS px
        // before it stops being clamped. Derived — so adding a finer pen tomorrow raises the
        // scale automatically instead of silently re-introducing L-288 for that exact pen.
        expect(THINNEST_SYSTEM_PEN_MM).toBeCloseTo(0.09, 6);
        expect(MIN_LEGIBLE_BACKING_SCALE).toBe(3);
        expect(THINNEST_SYSTEM_PEN_MM * SCREEN_PX_PER_MM * MIN_LEGIBLE_BACKING_SCALE)
            .toBeGreaterThanOrEqual(1);   // ≥ 1 DEVICE pixel: it can be drawn at all
    });

    it('never exceeds the backing budget the product ALREADY spends on high-DPI machines', () => {
        // The cost of L-288 is fill-rate, quadratic in the scale. It is bounded by the SAME cap
        // (4) that `MAX_PLAN_VIEW_CANVAS_DPR` has always imposed — so a 1× machine now rasterises
        // at 9×, which is strictly inside the 16× envelope a dpr-4 machine has always used.
        expect(MAX_BACKING_SCALE).toBe(4);
        for (const dpr of [0.5, 1, 1.5, 2, 3, 4, 8]) {
            const s = resolveCanvasRenderScale(dpr);
            expect(s).toBeGreaterThanOrEqual(MIN_LEGIBLE_BACKING_SCALE);
            expect(s).toBeLessThanOrEqual(MAX_BACKING_SCALE);
            expect(s).toBeGreaterThanOrEqual(Math.min(dpr, MAX_BACKING_SCALE)); // never DOWNsamples
        }
        expect(resolveCanvasRenderScale(1)).toBe(3);
        expect(resolveCanvasRenderScale(2)).toBe(3);   // dpr 2 was ALSO clamping BEYOND
        expect(resolveCanvasRenderScale(4)).toBe(4);
    });

    it('the stroke floor is ONE DEVICE PIXEL — not "half a CSS pixel, whichever is coarser"', () => {
        expect(minStrokePx(3)).toBeCloseTo(1 / 3, 9);
        expect(minStrokePx(3) * 3).toBe(1);            // exactly one device pixel
        // …and the DASH scale is untouched: still a function of the DISPLAY, so no dash in the
        // product changes width as a side-effect of a line-WIDTH fix.
        expect(dashScale(1)).toBe(1);
        expect(dashScale(2)).toBe(0.5);
    });
});

// ─── (B) THE OUTCOME AT dpr 1 — IN DEVICE PIXELS ─────────────────────────────

describe('§FIX-PLAN-CANVAS-HAIRLINE-FLOOR — THE LADDER IS VISIBLE ON A 1× SCREEN', () => {

    it('THE DEMO CASE: CUT > PROJECTION > BEYOND, strictly, in DEVICE PIXELS, at devicePixelRatio 1', () => {
        // *** THIS IS THE TEST THE OLD PRODUCT FAILS. *** On the pre-L-288 canvas these three
        // stroked at 1.89 / 1.00 / 1.00 CSS px — the bottom two IDENTICAL. In mm they were
        // always 0.50 / 0.25 / 0.09 and always "passed"; that is why this asserts device px.
        const s = strokesAtDpr('v-288-ladder', [
            { layer: 'A-WALL:cut' },
            { layer: 'A-WALL:proj' },
            { layer: 'A-WALL:beyond' },
        ], 1);
        expect(s).toHaveLength(3);
        const [cut, proj, beyond] = s;

        expect(cut!.widthDevice).toBeGreaterThan(proj!.widthDevice);
        expect(proj!.widthDevice).toBeGreaterThan(beyond!.widthDevice);

        // …and every one of them is a mark the rasteriser can actually make.
        for (const st of s) expect(st.widthDevice).toBeGreaterThanOrEqual(1);

        // The exact device widths, so a regression cannot hide behind ">".
        expect(cut!.widthDevice).toBeCloseTo(0.50 * SCREEN_PX_PER_MM * 3, 4);   // ≈ 5.67
        expect(proj!.widthDevice).toBeCloseTo(0.25 * SCREEN_PX_PER_MM * 3, 4);  // ≈ 2.83
        expect(beyond!.widthDevice).toBeCloseTo(0.09 * SCREEN_PX_PER_MM * 3, 4);// ≈ 1.02
    });

    it('THE L-285 AXIS SURVIVES THE RASTER: exterior > interior, in device pixels, at 1× — in PLAN and in ELEVATION', () => {
        // The founder's ask, on the founder's screen. In elevation the walls are PROJECTION
        // (0.25 / 0.175 mm) — BOTH of which the old floor crushed to exactly 1 CSS px, so the
        // whole of L-285 was invisible in elevation on a 1× display.
        const plan = strokesAtDpr('v-288-fn-plan', [
            { layer: 'A-WALL:cut', fn: 'exterior' },
            { layer: 'A-WALL:cut', fn: 'interior' },
        ], 1);
        expect(plan[1]!.widthDevice).toBeLessThan(plan[0]!.widthDevice);
        expect(plan[1]!.widthDevice).toBeGreaterThanOrEqual(1);

        const elev = strokesAtDpr('v-288-fn-elev', [
            { layer: 'A-WALL:proj', fn: 'exterior' },
            { layer: 'A-WALL:proj', fn: 'interior' },
        ], 1, 'elevation');
        expect(elev[1]!.widthDevice, 'interior wall in ELEVATION at 1× must be thinner ON SCREEN')
            .toBeLessThan(elev[0]!.widthDevice);
        expect(elev[1]!.widthDevice).toBeGreaterThanOrEqual(1);
        expect(elev[0]!.widthDevice).toBeCloseTo(0.25 * SCREEN_PX_PER_MM * 3, 4);
        expect(elev[1]!.widthDevice).toBeCloseTo(0.175 * SCREEN_PX_PER_MM * 3, 4);
    });

    it('the whole PROJECTION tier is separable again — wall > door > ceiling, in device pixels, at 1×', () => {
        // The three pens the old floor merged into one. This is the assertion that would have
        // told us about L-288 two days ago.
        const s = strokesAtDpr('v-288-tier', [
            { layer: 'A-WALL:proj' },
            { layer: 'A-DOOR-PROJ' },
            { layer: 'A-CEIL:proj' },
        ], 1);
        const [wall, door, ceiling] = s;
        expect(wall!.widthDevice).toBeGreaterThan(door!.widthDevice);
        expect(door!.widthDevice).toBeGreaterThan(ceiling!.widthDevice);
        expect(ceiling!.widthDevice).toBeGreaterThanOrEqual(1);
        // On the broken canvas all three were 1.0 CSS px. Refuted explicitly:
        expect(new Set(s.map(x => x.widthCss)).size).toBe(3);
    });
});

// ─── (C) THE EXPORT PATH IS UNTOUCHED ────────────────────────────────────────

describe('§FIX-PLAN-CANVAS-HAIRLINE-FLOOR — the EXPORT is byte-identical (we fixed the screen, not the pens)', () => {

    it('the PEN TABLE is not inflated — every locked Contract-23 §8 width is exactly what it was', () => {
        // The tempting "fix" was to fatten the pens until they cleared the 1-px floor. That
        // would have CORRUPTED THE EXPORT, where the hierarchy was already correct. Pinned:
        expect(resolvePen('CUT', 'wall').widthMm).toBe(0.50);
        expect(resolvePen('PROJECTION', 'wall').widthMm).toBe(0.25);
        expect(resolvePen('PROJECTION', 'door').widthMm).toBe(0.18);
        expect(resolvePen('PROJECTION', 'ceiling').widthMm).toBe(0.13);
        expect(resolvePen('BEYOND', 'wall').widthMm).toBe(0.09);
        expect(resolvePen('HIDDEN', 'wall').widthMm).toBe(0.09);
        expect(resolvePen('CUT', 'column').widthMm).toBe(0.70);
    });

    it('at EXPORT_DPI the hierarchy was ALWAYS legible — which is the proof the pens were never the bug', () => {
        const px = (mm: number) => mm * pxPerMm(EXPORT_DPI);
        expect(px(0.25)).toBeCloseTo(2.953, 3);   // wall projection
        expect(px(0.175)).toBeCloseTo(2.067, 3);  // interior wall projection (L-285)
        expect(px(0.09)).toBeCloseTo(1.063, 3);   // beyond
        // Every one clears a 1-device-pixel floor on its own at 300 DPI — no backing scale needed.
        for (const mm of [0.09, 0.13, 0.175, 0.18, 0.25, 0.35, 0.50, 0.70]) {
            expect(px(mm)).toBeGreaterThanOrEqual(1);
        }
    });

    it('the export conversion does not consult devicePixelRatio — it CANNOT be moved by the screen fix', () => {
        // Structural, not numeric: `pxPerMm(EXPORT_DPI)` is a pure function of two constants.
        // If a future "screen fix" reached into it, this fails.
        const before = pxPerMm(EXPORT_DPI);
        const prev = window.devicePixelRatio;
        Object.defineProperty(window, 'devicePixelRatio', { value: 4, configurable: true });
        const after = pxPerMm(EXPORT_DPI);
        Object.defineProperty(window, 'devicePixelRatio', { value: prev, configurable: true });
        expect(after).toBe(before);
    });
});
