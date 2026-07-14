/**
 * @vitest-environment happy-dom
 *
 * §FEAT-BEYOND-DASH-IN-ELEVATION (L-290) — C09 §4.6.4d.
 *
 * THE FOUNDER'S DECISION: `beyond` draws DASHED in ELEVATION and SECTION; PLAN keeps it SOLID.
 * It is the override clause his own spec carries (*"never dashed, unless explicitly
 * overridden"*), expressed as per-view-type INTENT DATA on `ViewScope` — never an
 * `if (isElevation)` in a renderer.
 *
 * ═══ WHAT THE BUG WOULD LOOK LIKE ON SCREEN — WHICH IS WHAT THESE GUARDS MUST DISCRIMINATE ═══
 *
 * The naive implementation (`beyond.dashPx = [4,3]` when elevation) PASSES a guard that asserts
 * "beyond is dashed in elevation". And it ships a broken drawing, because:
 *
 *     *** BEYOND AND HIDDEN CARRY THE SAME WIDTH (0.09 mm). THEY DIFFER BY *DASH*. ***
 *
 * Give beyond the same dash and **a stair's lower run becomes pixel-identical to a pipe behind a
 * wall** — in exactly the views the founder asked for. The drawing would have GAINED A DASH AND
 * LOST A DISTINCTION, and a "beyond is dashed" assertion would have called that a success.
 *
 * So every test below asserts the DISTINGUISHING PROPERTY (beyond's dash ≠ hidden's dash, in the
 * device pixels that actually reach the eye), not merely the presence of a dash. That is the
 * square-column lesson: a circle's "every point equidistant from the centre" is also true of a
 * square's four corners, and the bug scores 1.000.
 *
 * Falsified before trusted: giving BEYOND_DASH_PX the value of HIDDEN_DASH_PX (the naive fix)
 * turns the distinction tests RED while a bare "is it dashed?" assertion stays green — recorded
 * in the commit.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import { resolvePen } from './PenWeightTable';
import { graphicsRulesEngine } from './GraphicsRulesEngine';
import {
    BEYOND_DASH_PX,
    HIDDEN_DASH_PX,
    beyondAndHiddenAreDistinguishable,
    zoneDashesByDefault,
    DRAWING_ZONES,
    penZoneOf,
} from './DrawingZone';
import { resolveCanvasRenderScale, dashScale } from './CanvasRenderScale';
import { resolveViewScope, resolveBeyondLineStyle } from '../views/ViewScope';
import { PlanViewCanvas } from '../views/PlanViewCanvas';
import { viewDefinitionStore } from '../views/ViewDefinitionStore';
import { viewTechnicalDrawingCache } from '../views/ViewTechnicalDrawingCache';

interface Stroke { widthCss: number; widthDevice: number; dashDevice: number[] }

/** The dash a stroke actually puts on the raster, in DEVICE pixels. */
function renderAndCapture(
    viewId: string,
    layers: string[],
    viewType: 'plan' | 'elevation' | 'section',
    output?: { beyondLineStyle?: 'solid' | 'dashed' },
): Stroke[] {
    viewDefinitionStore.reset();
    viewDefinitionStore.create({
        id: viewId, name: 'V', viewType,
        ...(output ? { output: output as never } : {}),
    });

    const root = new THREE.Group();
    for (const layer of layers) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0], 3));
        const ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial());
        ls.name = layer;
        ls.userData.layerName = layer;
        root.add(ls);
    }
    viewTechnicalDrawingCache.set(viewId, { three: root } as never);

    const scale = resolveCanvasRenderScale(window.devicePixelRatio);
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
            const lw = (ctx as { lineWidth: number }).lineWidth;
            strokes.push({
                widthCss: lw,
                widthDevice: lw * scale,
                dashDevice: dash.map(v => v * scale),
            });
        },
    } as unknown as CanvasRenderingContext2D;

    const canvas = {
        getContext: () => ctx, width: 0, height: 0, clientWidth: 800, clientHeight: 600,
    } as unknown as HTMLCanvasElement;

    const pvc = new PlanViewCanvas(canvas, { gridVisible: false });
    pvc.setViewType(viewType);
    if (viewType !== 'plan') pvc.setSectionAxes('x', true, 1);
    pvc.setSize(800, 600);
    pvc.render(viewDefinitionStore.get(viewId)!);
    return strokes;
}

/** Total dash period — the property the EYE reads to tell two dashed lines apart. */
const period = (d: number[]): number => d.reduce((a, b) => a + b, 0);

// ─── (A) SEPARATE BEYOND FROM HIDDEN — *BEFORE* DASHING BEYOND ───────────────

describe('§FEAT-BEYOND-DASH-IN-ELEVATION — beyond and hidden are TELLABLE APART (they share a width)', () => {

    it('THE TRAP: beyond and hidden carry the SAME WEIGHT — so WEIGHT cannot be the distinguishing axis', () => {
        // Recorded as the premise of the whole ticket. If a future edit makes these differ, the
        // reasoning below (dash, not weight) should be revisited — so this pins the premise.
        for (const cat of ['wall', 'slab', 'stair', 'plumbing']) {
            expect(resolvePen('BEYOND', cat).widthMm).toBe(resolvePen('HIDDEN', cat).widthMm);
        }
        // …and that shared width sits ON the raster floor: ≈1 device px at the canvas's backing
        // scale (L-288 measured this). A width difference between them is SUB-PIXEL BY
        // CONSTRUCTION — the eye cannot receive it. That is why the axis is the DASH.
        expect(0.09 * (96 / 25.4) * resolveCanvasRenderScale(1)).toBeLessThan(1.5);
    });

    it('THE AXIS: the two dashes DIFFER — in pattern AND in period', () => {
        expect(beyondAndHiddenAreDistinguishable()).toBe(true);
        expect([...BEYOND_DASH_PX]).not.toEqual([...HIDDEN_DASH_PX]);
        // The LONG dash for a member behind the plane; the fine SHORT dash for hidden detail
        // (ISO 128-24). The period difference is what the eye actually reads:
        expect(period([...BEYOND_DASH_PX])).toBeGreaterThan(period([...HIDDEN_DASH_PX]));
    });

    it('THE OUTCOME: in an ELEVATION, a BEYOND line and a HIDDEN line are VISIBLY different on the raster', () => {
        // *** THE TEST THE NAIVE FIX FAILS. *** `beyond.dashPx = HIDDEN_DASH_PX` would satisfy
        // "beyond is dashed" and produce two lines the founder cannot tell apart. This asserts
        // the DISTINCTION, in device pixels, at the stroke.
        const s = renderAndCapture('v-290-distinct', ['A-WALL:beyond', 'A-WALL:hidden'], 'elevation');
        expect(s).toHaveLength(2);
        const [beyond, hidden] = s;

        expect(beyond!.dashDevice.length, 'beyond must be dashed in elevation').toBeGreaterThan(0);
        expect(hidden!.dashDevice.length, 'hidden is dashed, as always').toBeGreaterThan(0);

        // …AND THEY ARE NOT THE SAME LINE:
        expect(beyond!.dashDevice).not.toEqual(hidden!.dashDevice);
        expect(period(beyond!.dashDevice)).toBeGreaterThan(period(hidden!.dashDevice));
        // The difference is multi-pixel — it survives a 1× projector, which a width difference
        // between two 0.09 mm pens provably would not.
        expect(period(beyond!.dashDevice) - period(hidden!.dashDevice)).toBeGreaterThanOrEqual(3);
    });
});

// ─── (B) PER-VIEW-TYPE DEFAULT, IN THE DATA (the L-279 precedent) ────────────

describe('§FEAT-BEYOND-DASH-IN-ELEVATION — the default is per-VIEW-TYPE DATA on ViewScope', () => {

    it('elevation and section dash; plan and the non-technical views do not', () => {
        expect(resolveViewScope('elevation').beyondLineStyle).toBe('dashed');
        expect(resolveViewScope('section').beyondLineStyle).toBe('dashed');
        expect(resolveViewScope('plan').beyondLineStyle).toBe('solid');
        expect(resolveViewScope('ceiling-plan').beyondLineStyle).toBe('solid');
        expect(resolveViewScope('3d').beyondLineStyle).toBe('solid');
    });

    it('a view with NO opinion inherits its TYPE — and an explicit view override WINS (P7)', () => {
        // The L-279 channel, reused. `undefined` means "I have no opinion", and the only correct
        // reading of that is the type default.
        expect(resolveBeyondLineStyle(undefined, resolveViewScope('elevation'))).toBe('dashed');
        expect(resolveBeyondLineStyle({}, resolveViewScope('elevation'))).toBe('dashed');
        // …and the user's explicit choice beats the type, in BOTH directions.
        expect(resolveBeyondLineStyle({ beyondLineStyle: 'solid' }, resolveViewScope('elevation'))).toBe('solid');
        expect(resolveBeyondLineStyle({ beyondLineStyle: 'dashed' }, resolveViewScope('plan'))).toBe('dashed');
    });

    it('THE PEN TABLE STILL SAYS BEYOND IS SOLID — the dash arrives from INTENT, never from the table', () => {
        // C09 §4.6.4 remains literally true, and this is the line that keeps it honest: no dash
        // arrives BY DEFAULT from a code branch. It arrives from view intent (P7). If someone
        // "simplifies" this by dashing the table entry, plan dashes too — and L-277 re-opens.
        expect(resolvePen('BEYOND', 'wall').dashPx).toBeNull();
        expect(zoneDashesByDefault('beyond')).toBe(false);
        expect(zoneDashesByDefault('hidden')).toBe(true);
    });
});

// ─── (C) PLAN IS UNCHANGED — or this re-opens the bug we just closed ─────────

describe('§FEAT-BEYOND-DASH-IN-ELEVATION — PLAN KEEPS BEYOND SOLID (L-277 is not re-opened)', () => {

    it('THE FOUNDER\'S STAIR: in PLAN, the lower run is SOLID and lighter — exactly as L-277 made it', () => {
        // This is the assertion that stops L-290 from silently undoing L-277. The stair's lower
        // run is DELIBERATELY SHOWN and is not behind anything; dashing it would say "something
        // is in front of this", which is the lie L-277 spent itself deleting.
        const s = renderAndCapture('v-290-plan', ['A-STRS:beyond'], 'plan');
        expect(s).toHaveLength(1);
        expect(s[0]!.dashDevice, 'BEYOND in PLAN must be SOLID').toEqual([]);
    });

    it('a PLAN that explicitly asks for a dashed beyond gets one — intent still wins (P7)', () => {
        const s = renderAndCapture('v-290-plan-override', ['A-STRS:beyond'], 'plan', { beyondLineStyle: 'dashed' });
        expect(s[0]!.dashDevice.length).toBeGreaterThan(0);
    });

    it('an ELEVATION that explicitly asks for a solid beyond gets one — the override cuts BOTH ways', () => {
        const s = renderAndCapture('v-290-elev-override', ['A-WALL:beyond'], 'elevation', { beyondLineStyle: 'solid' });
        expect(s[0]!.dashDevice).toEqual([]);
    });
});

// ─── (D) THE LADDER IS STILL SACRED — dash changes STYLE, never RANK ─────────

describe('§FEAT-BEYOND-DASH-IN-ELEVATION — the WEIGHT ladder is untouched in every view type', () => {

    it('CUT > PROJECTION > BEYOND in WEIGHT, in plan AND elevation AND section — dashing changes style, not rank', () => {
        for (const viewType of ['plan', 'elevation', 'section'] as const) {
            const style = resolveBeyondLineStyle(undefined, resolveViewScope(viewType));
            const w = (zone: 'CUT' | 'PROJECTION' | 'BEYOND') =>
                graphicsRulesEngine.resolveStyle(zone, 'wall', { viewType, beyondLineStyle: style }).widthMm;
            expect(w('CUT'), `${viewType}: CUT must outweigh PROJECTION`).toBeGreaterThan(w('PROJECTION'));
            expect(w('PROJECTION'), `${viewType}: PROJECTION must outweigh BEYOND`).toBeGreaterThan(w('BEYOND'));
        }
    });

    it('ONLY the BEYOND zone gains a dash — cut and projection stay solid in elevation', () => {
        // The blast radius, pinned. A view-type rule that leaked onto another zone would dash the
        // façade itself.
        for (const zone of DRAWING_ZONES) {
            const pen = graphicsRulesEngine.resolveStyle(penZoneOf(zone), 'wall', {
                viewType: 'elevation', beyondLineStyle: 'dashed',
            });
            const dashes = (pen.dashPx?.length ?? 0) > 0;
            expect(dashes, `${zone} in elevation`).toBe(zone === 'beyond' || zone === 'hidden');
        }
    });

    it('…and in PLAN only HIDDEN dashes, exactly as L-277 left it', () => {
        for (const zone of DRAWING_ZONES) {
            const pen = graphicsRulesEngine.resolveStyle(penZoneOf(zone), 'wall', {
                viewType: 'plan', beyondLineStyle: 'solid',
            });
            const dashes = (pen.dashPx?.length ?? 0) > 0;
            expect(dashes, `${zone} in plan`).toBe(zoneDashesByDefault(zone));
        }
    });

    it('the dash scale that reaches the raster is the DISPLAY\'s, not the backing store\'s (L-288 kept these separate)', () => {
        expect(dashScale(1)).toBe(1);
        const s = renderAndCapture('v-290-dashscale', ['A-WALL:beyond'], 'elevation');
        expect(s[0]!.dashDevice).toEqual(
            [...BEYOND_DASH_PX].map(v => v * dashScale(window.devicePixelRatio) * resolveCanvasRenderScale(window.devicePixelRatio)),
        );
    });
});
