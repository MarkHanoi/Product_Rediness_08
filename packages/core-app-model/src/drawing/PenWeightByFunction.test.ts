/**
 * @vitest-environment happy-dom
 *
 * §FEAT-PEN-WEIGHT-BY-WALL-FUNCTION (L-285) + §FIX-WINDOW-PLAN-FRAME-THICKNESS (L-280, the
 * rendering half) — C09 §4.6.4 / §4.6.4a, Contract-23 §7.1 + §8.
 *
 * ═══ WHY THESE TWO TICKETS ARE ONE TEST FILE ═══
 *
 * They are one BUG. L-280's window symbol and L-285's wall weight both die at the same place:
 * the last mile, where a line is actually painted. `PlanViewCanvas` resolved a pen through the
 * full Contract-23 chain — and then, for door and window symbols, threw it away and stroked a
 * weight `SymbolicRuleRenderer` had re-derived from the intent tier alone at a HARD-CODED
 * `'projection'` state. Any pen axis that does not survive that last mile does not exist.
 *
 * So EVERY assertion here ends at the OUTCOME — `ctx.lineWidth` at the moment `ctx.stroke()` is
 * called during a real `PlanViewCanvas.render()` — and NOT at `resolvePen()`, which is a seam.
 * That is the discipline L-277 was nearly lost for (a correct dashed pen in the table, correct
 * occlusion geometry, and NOTHING ON SCREEN, because the intent chain overwrote the table
 * downstream of every test).
 *
 * FALSIFIABILITY (a guard that cannot fail is not a guard): every test here was run against the
 * pre-fix product and FAILS there —
 *   • `interior draws lighter` → both walls stroked at 1.89 px (no function axis existed).
 *   • `HIDDEN window is dashed` → stroked SOLID at the projection weight (the hard-coded state).
 *   • `view override reaches a window symbol` → override ignored (chain skipped entirely).
 *   • `the zone ladder survives` → passed before AND after; it is here to catch the REGRESSION,
 *     which is the entire point of it (modulating a weight is one line away from inverting a
 *     ladder).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import { resolvePen } from './PenWeightTable';
import { graphicsRulesEngine } from './GraphicsRulesEngine';
import { ELEMENT_FUNCTIONS, ELEMENT_FUNCTION_KEY, functionWeightScale } from './ElementFunction';
import { DRAWING_ZONES, penZoneOf } from './DrawingZone';
import { SCREEN_PX_PER_MM } from './DrawingConstants';
// §FIX-PLAN-CANVAS-HAIRLINE-FLOOR (L-288) — the real stroke floor, from the real resolver.
import { minStrokePx, resolveCanvasRenderScale } from './CanvasRenderScale';
import { PlanViewCanvas } from '../views/PlanViewCanvas';
import { viewDefinitionStore } from '../views/ViewDefinitionStore';
import { viewTechnicalDrawingCache } from '../views/ViewTechnicalDrawingCache';

// Every element category the pen table locks a ladder for (datums are not solids).
const SOLID_CATEGORIES = [
    'wall', 'slab', 'column', 'structural', 'beam',
    'door', 'window', 'stair', 'roof', 'ceiling',
];

// ─── A recording Canvas2D context ────────────────────────────────────────────
//
// Captures the FULL stroke state at each stroke() — which is the only thing the founder can
// actually see. Anything this file asserts, he could measure with a screenshot and a ruler.

interface Stroke {
    lineWidth:   number;
    strokeStyle: string;
    globalAlpha: number;
    dash:        number[];
}

function recordingCtx(): { ctx: CanvasRenderingContext2D; strokes: Stroke[] } {
    const strokes: Stroke[] = [];
    let dash: number[] = [];
    const ctx = {
        lineWidth: 1, strokeStyle: '#000000', globalAlpha: 1,
        fillStyle: '#000000', font: '', textAlign: '', textBaseline: '',
        lineCap: 'butt', lineJoin: 'miter', miterLimit: 10, imageSmoothingEnabled: true,
        setTransform() {}, save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
        closePath() {}, fill() {}, fillRect() {}, fillText() {}, clip() {}, rect() {},
        arc() {}, drawImage() {}, createPattern: (): null => null, translate() {}, scale() {},
        setLineDash(d: number[]) { dash = d ?? []; },
        getLineDash() { return dash; },
        stroke() {
            strokes.push({
                lineWidth:   ctx.lineWidth,
                strokeStyle: String(ctx.strokeStyle),
                globalAlpha: ctx.globalAlpha,
                dash:        [...dash],
            });
        },
    } as unknown as CanvasRenderingContext2D & { lineWidth: number; strokeStyle: string; globalAlpha: number };
    return { ctx: ctx as CanvasRenderingContext2D, strokes };
}

/**
 * A drawing carrying ONE LineSegments per (layer, function) — the shape `EdgeProjectorService`
 * emits: a per-element LineSegments whose `userData` carries the layer name and (L-285) the
 * element TYPE's function.
 */
function drawingWith(
    segments: Array<{ layer: string; fn?: string; uuid?: string }>,
): { three: THREE.Group } {
    const root = new THREE.Group();
    for (const { layer, fn, uuid } of segments) {
        const geo = new THREE.BufferGeometry();
        // One horizontal segment, well inside the 800×600 frustum.
        geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0], 3));
        const ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial());
        ls.name = layer;
        ls.userData.layerName = layer;
        if (fn) ls.userData[ELEMENT_FUNCTION_KEY] = fn;
        if (uuid) ls.userData.elementUUID = uuid;
        root.add(ls);
    }
    return { three: root };
}

/**
 * The canvas's stroke floor, in CSS px.
 *
 * §FIX-PLAN-CANVAS-HAIRLINE-FLOOR (L-288): this used to be `max(0.5, 1/dpr)` — 1.0 CSS px at
 * dpr 1 — which CLAMPED every pen below ~0.265 mm (the whole BEYOND/HIDDEN tier, and most of
 * PROJECTION) onto one width. It is now ONE DEVICE PIXEL of the backing store, and the backing
 * store is scaled so the table's thinnest pen still lands above it. Derived from the same
 * resolver the canvas uses, so this test can never drift from the product's real floor.
 */
const HAIRLINE = minStrokePx(resolveCanvasRenderScale(window.devicePixelRatio));

/** Render one plan view over the given drawing and return every stroke it painted. */
function renderPlan(viewId: string, drawing: { three: THREE.Group }): Stroke[] {
    viewDefinitionStore.reset();
    viewDefinitionStore.create({ id: viewId, name: 'Level 0', viewType: 'plan' });
    viewTechnicalDrawingCache.set(viewId, drawing as never);

    const { ctx, strokes } = recordingCtx();
    const canvas = {
        getContext: () => ctx,
        width: 0, height: 0, clientWidth: 800, clientHeight: 600,
    } as unknown as HTMLCanvasElement;

    // gridVisible: false — the background grid strokes too, and it is NOT drawing linework
    // (it is a screen-space datum). Leaving it on would put its hairline strokes in the
    // recording and every assertion below would be indexing the wrong line.
    const pvc = new PlanViewCanvas(canvas, { gridVisible: false });
    pvc.setViewType('plan');
    pvc.setSize(800, 600);
    pvc.render(viewDefinitionStore.get(viewId)!);
    return strokes;
}

/**
 * The same render, framed as an ELEVATION.
 *
 * The founder's ask is *"in plan view — but also in elevation"*, and an elevation is a DIFFERENT
 * code path through the very same `render()`: `_sectionFlipV` is on, the vertical axis is world
 * Y, and — the part that matters here — an elevation **cuts nothing** (`ViewScope.cut === false`),
 * so its walls arrive in the **PROJECTION** zone, not CUT. If the function axis modulated only
 * the CUT zone, plan would be right and elevation would be flat, and half the ticket would be
 * silently unshipped. That is exactly why PROJECTION is a modulated zone (C09 §4.6.4a(d)).
 */
function renderElevation(viewId: string, drawing: { three: THREE.Group }, dpr = 1): Stroke[] {
    viewDefinitionStore.reset();
    viewDefinitionStore.create({ id: viewId, name: 'South Elevation', viewType: 'elevation' });
    viewTechnicalDrawingCache.set(viewId, drawing as never);

    const { ctx, strokes } = recordingCtx();
    const canvas = {
        getContext: () => ctx,
        width: 0, height: 0, clientWidth: 800, clientHeight: 600,
    } as unknown as HTMLCanvasElement;

    const prevDpr = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', { value: dpr, configurable: true });
    try {
        const pvc = new PlanViewCanvas(canvas, { gridVisible: false });
        pvc.setViewType('elevation');
        pvc.setSectionAxes('x', true, 1);
        pvc.setSize(800, 600);
        pvc.render(viewDefinitionStore.get(viewId)!);
    } finally {
        Object.defineProperty(window, 'devicePixelRatio', { value: prevDpr, configurable: true });
    }
    return strokes;
}

beforeEach(() => {
    // The engine caches (elementId, viewId, zone:category:…:function) → pen. A stale cache would
    // let one test's override leak into the next, so start every test from a cold engine.
    graphicsRulesEngine.getRules().forEach(r => {
        if (r.viewId) graphicsRulesEngine.removeViewOverrides(r.viewId);
        if (r.elementId) graphicsRulesEngine.removeElementOverrides(r.elementId);
    });
});

// ─── (A) THE ZONE LADDER IS SACRED — C09 §4.6.4, and L-285 must not touch it ──

describe('§FEAT-PEN-WEIGHT-BY-WALL-FUNCTION — the FUNCTION modulates WITHIN a zone; it NEVER reorders zones', () => {

    it('weight(CUT) > weight(PROJECTION) > weight(BEYOND) >= weight(HIDDEN) — for EVERY category, and for EVERY PAIR OF FUNCTIONS', () => {
        // THE TRAP THIS CATCHES: assert only "interior is lighter than exterior" and you can ship
        // an interior CUT wall that is LIGHTER THAN A PROJECTION LINE — silently undoing L-277,
        // the ladder it exists to defend, with a green test suite. The ladder must hold ACROSS
        // functions, not just within one: the LIGHTEST cut of ANY function must still outweigh
        // the HEAVIEST projection of ANY function.
        for (const category of SOLID_CATEGORIES) {
            const widths = (zone: 'CUT' | 'PROJECTION' | 'BEYOND' | 'HIDDEN') =>
                [undefined, ...ELEMENT_FUNCTIONS].map(fn => resolvePen(zone, category, fn).widthMm);

            const minCut    = Math.min(...widths('CUT'));
            const maxProj   = Math.max(...widths('PROJECTION'));
            const minProj   = Math.min(...widths('PROJECTION'));
            const maxBeyond = Math.max(...widths('BEYOND'));
            const minBeyond = Math.min(...widths('BEYOND'));
            const maxHidden = Math.max(...widths('HIDDEN'));

            expect(minCut, `${category}: the LIGHTEST cut (any function) must outweigh the HEAVIEST projection (any function)`)
                .toBeGreaterThan(maxProj);
            expect(minProj, `${category}: the LIGHTEST projection must outweigh the HEAVIEST beyond`)
                .toBeGreaterThan(maxBeyond);
            expect(minBeyond, `${category}: the LIGHTEST beyond must not be lighter than the HEAVIEST hidden`)
                .toBeGreaterThanOrEqual(maxHidden);
        }
    });

    it('an INTERIOR cut wall is lighter than an EXTERIOR cut wall — and still HEAVIER than any projection line', () => {
        const extCut = resolvePen('CUT', 'wall', 'exterior').widthMm;
        const intCut = resolvePen('CUT', 'wall', 'interior').widthMm;
        const proj   = resolvePen('PROJECTION', 'wall', 'exterior').widthMm;

        expect(intCut).toBeLessThan(extCut);          // the founder's ask
        expect(intCut).toBeGreaterThan(proj);         // …without breaking L-277
        // …and it lands on an EXISTING ISO line-group width, not an invented in-between one.
        expect(intCut).toBeCloseTo(0.35, 6);
    });

    it('the FUNCTION is not the THICKNESS: the two 300 mm walls of the founder\'s model get DIFFERENT pens', () => {
        // A 300 mm exterior brick shell and a 300 mm acoustic/party partition are the SAME
        // thickness. Keying the pen off `wall.thickness` — the obvious implementation — would
        // draw them identically and leave the envelope exactly as unreadable as it is today, in
        // precisely the buildings (flats, hotels) where finding it matters most. The pen must
        // differ, and it can ONLY differ because the axis is FUNCTION.
        expect(resolvePen('CUT', 'wall', 'exterior').widthMm)
            .not.toBeCloseTo(resolvePen('CUT', 'wall', 'interior').widthMm, 6);
    });

    it('an UNDECLARED function is UNMODULATED — every existing drawing is bit-identical to pre-L-285', () => {
        expect(functionWeightScale(null)).toBe(1);
        expect(functionWeightScale(undefined)).toBe(1);
        for (const category of SOLID_CATEGORIES) {
            for (const zone of DRAWING_ZONES) {
                const z = penZoneOf(zone);
                expect(resolvePen(z, category, null).widthMm).toBe(resolvePen(z, category).widthMm);
            }
        }
    });
});

// ─── (B) THE PEN SURVIVES THE CHAIN — the call the CANVAS makes, not resolvePen() ──

describe('§FEAT-PEN-WEIGHT-BY-WALL-FUNCTION — the axis survives GraphicsRulesEngine (the intent chain overwrites the table)', () => {

    it('resolveStyle() — not resolvePen() — carries the function, because the intent tier ALWAYS overwrites widthMm', () => {
        // This is the exact mechanism that nearly killed L-277's hidden pen: `_intentRules()`
        // contributes a rule at priority 1000 whose widthMm is the intent's OWN seeded width, so
        // ANYTHING the table put in the base is unconditionally overwritten. If the function were
        // fed into the base (`resolvePen(zone, cat, fn)` inside the engine), it would be erased
        // here and the whole feature would be a no-op with a green unit test.
        const ext = graphicsRulesEngine.resolveStyle('CUT', 'wall', { viewType: 'plan', elementFunction: 'exterior' });
        const int = graphicsRulesEngine.resolveStyle('CUT', 'wall', { viewType: 'plan', elementFunction: 'interior' });
        expect(int.widthMm).toBeLessThan(ext.widthMm);
        expect(int.widthMm).toBeGreaterThan(
            graphicsRulesEngine.resolveStyle('PROJECTION', 'wall', { viewType: 'plan', elementFunction: 'exterior' }).widthMm,
        );
    });

    it('the modulation is applied EXACTLY ONCE — resolveStyle(z,c,{fn}) === resolvePen(z,c,fn) with no overrides in play', () => {
        // Guards the double-scale: the engine applies the scale at the END of its chain, so it
        // must NOT also pass the function into resolvePen() at the start. 0.50 × 0.70 × 0.70 =
        // 0.245 would sail past every ladder assertion above and simply be wrong.
        for (const fn of ELEMENT_FUNCTIONS) {
            for (const category of SOLID_CATEGORIES) {
                for (const zone of DRAWING_ZONES) {
                    const z = penZoneOf(zone);
                    expect(
                        graphicsRulesEngine.resolveStyle(z, category, { viewType: 'plan', elementFunction: fn }).widthMm,
                        `${z}:${category}:${fn} — resolveStyle must equal the table, scaled once`,
                    ).toBeCloseTo(resolvePen(z, category, fn).widthMm, 6);
                }
            }
        }
    });

    it('the function is part of the pen CACHE KEY — the first wall\'s pen must not be served to every wall in the view', () => {
        const a = graphicsRulesEngine.resolveStyle('CUT', 'wall', { viewId: 'v-cache', elementFunction: 'exterior' });
        const b = graphicsRulesEngine.resolveStyle('CUT', 'wall', { viewId: 'v-cache', elementFunction: 'interior' });
        const c = graphicsRulesEngine.resolveStyle('CUT', 'wall', { viewId: 'v-cache' });
        expect(b.widthMm).toBeLessThan(a.widthMm);
        expect(c.widthMm).toBe(a.widthMm);   // undeclared === exterior's unmodulated base
    });
});

// ─── (C) THE OUTCOME — what the founder actually SEES ─────────────────────────

describe('§FEAT-PEN-WEIGHT-BY-WALL-FUNCTION — THE OUTCOME: the weight reaches the canvas', () => {

    it('THE FOUNDER\'S ASK: in a real render, the interior wall is stroked THINNER than the exterior wall', () => {
        const strokes = renderPlan('v-fn-plan', drawingWith([
            { layer: 'A-WALL:cut', fn: 'exterior' },
            { layer: 'A-WALL:cut', fn: 'interior' },
        ]));

        expect(strokes).toHaveLength(2);
        const [ext, int] = strokes;
        expect(int!.lineWidth, 'the partition must draw lighter than the shell').toBeLessThan(ext!.lineWidth);

        // And the widths are the pen table's, in pixels — not a hairline clamp that happens to
        // differ, and not a THREE material default (the L-241 defect: every line at `1 × hairline`).
        expect(ext!.lineWidth).toBeCloseTo(0.50 * SCREEN_PX_PER_MM, 4);
        expect(int!.lineWidth).toBeCloseTo(0.35 * SCREEN_PX_PER_MM, 4);
    });

    it('…and the LADDER still holds ON SCREEN: the interior CUT wall still outweighs the exterior PROJECTION wall', () => {
        const strokes = renderPlan('v-fn-ladder', drawingWith([
            { layer: 'A-WALL:cut',  fn: 'interior' },
            { layer: 'A-WALL:proj', fn: 'exterior' },
        ]));
        const [intCut, extProj] = strokes;
        expect(intCut!.lineWidth).toBeGreaterThan(extProj!.lineWidth);
    });

    it('"…BUT ALSO IN ELEVATION": an elevation CUTS NOTHING, so its walls are PROJECTION — and the axis still reaches them', () => {
        // The other half of the founder's sentence, and a genuinely different code path: an
        // elevation's walls never enter the CUT zone at all (ViewScope.cut === false). Modulate
        // only CUT and this test is the one that tells you — which is why PROJECTION is a
        // modulated zone and BEYOND/HIDDEN are not (C09 §4.6.4a(d)).
        const strokes = renderElevation('v-fn-elev', drawingWith([
            { layer: 'A-WALL:proj', fn: 'exterior' },
            { layer: 'A-WALL:proj', fn: 'interior' },
        ]), 2);

        expect(strokes).toHaveLength(2);
        const [ext, int] = strokes;
        expect(int!.lineWidth, 'the partition must draw lighter than the shell IN ELEVATION TOO')
            .toBeLessThan(ext!.lineWidth);
        expect(ext!.lineWidth).toBeCloseTo(0.25 * SCREEN_PX_PER_MM, 4);
        expect(int!.lineWidth).toBeCloseTo(0.25 * 0.70 * SCREEN_PX_PER_MM, 4);
    });

    it('…and at devicePixelRatio 1 TOO — the raster floor that used to flatten this is FIXED (L-288)', () => {
        // ═══ THIS TEST USED TO ASSERT THE OPPOSITE, AND THAT IS WHY L-288 EXISTS. ═══
        //
        // When L-285 landed, this test RECORDED A DEFECT rather than hiding it: at dpr 1 the
        // canvas floored every stroke at 1 CSS px, so wall PROJECTION (0.25 mm → 0.945 px), door
        // PROJECTION (0.18 → 0.680) and ceiling PROJECTION (0.13 → 0.491) ALL clamped to exactly
        // 1 px — and with them the entire interior/exterior modulation, in elevation, on most
        // laptops and most projectors. The pens were right; the RASTERISER was wrong.
        //
        // §FIX-PLAN-CANVAS-HAIRLINE-FLOOR (L-288) fixed the rasteriser (NOT the pens — the export
        // was always correct). This test now asserts the fix from the other side: the modulation
        // that was measurably invisible at 1× is measurably VISIBLE at 1×. The full device-pixel
        // ladder lives in `CanvasHairlineFloor.test.ts`.
        const at1x = renderElevation('v-fn-elev-1x', drawingWith([
            { layer: 'A-WALL:proj', fn: 'exterior' },
            { layer: 'A-WALL:proj', fn: 'interior' },
        ]), 1);
        expect(at1x[1]!.lineWidth, 'the interior wall must be thinner ON A 1x SCREEN')
            .toBeLessThan(at1x[0]!.lineWidth);
        expect(at1x[0]!.lineWidth).toBeCloseTo(0.25 * SCREEN_PX_PER_MM, 4);
        expect(at1x[1]!.lineWidth).toBeCloseTo(0.175 * SCREEN_PX_PER_MM, 4);

        // …and the pen the canvas RESOLVED was always correctly modulated — the loss had been
        // purely in the screen-space floor, never in the pen. Pinned, so the two can never be
        // confused again.
        expect(
            graphicsRulesEngine.resolveStyle('PROJECTION', 'wall', { viewType: 'elevation', elementFunction: 'interior' }).widthMm,
        ).toBeLessThan(
            graphicsRulesEngine.resolveStyle('PROJECTION', 'wall', { viewType: 'elevation', elementFunction: 'exterior' }).widthMm,
        );
    });

    it('an UNSTAMPED wall renders at EXACTLY the pre-L-285 weight — no silent re-weighting of existing drawings', () => {
        const strokes = renderPlan('v-fn-none', drawingWith([{ layer: 'A-WALL:cut' }]));
        expect(strokes[0]!.lineWidth).toBeCloseTo(resolvePen('CUT', 'wall').widthMm * SCREEN_PX_PER_MM, 4);
    });
});

// ─── (D) L-280 — THE PEN-TABLE BYPASS AT THE SYMBOL RENDERER ──────────────────

describe('§FIX-WINDOW-PLAN-FRAME-THICKNESS — the door/window symbol no longer bypasses the pen table', () => {

    it('THE BYPASS: an OCCLUDED window (A-GLAZ-HIDDEN) is DASHED and thin — it used to paint SOLID at projection weight', () => {
        // `applyOcclusion()` demotes occluded linework onto the element's `-HIDDEN` sub-layer
        // (siblingZoneLayer). `symbolicRuleForLayer()` declines `-CUT` and `-BEYOND` but NOT
        // `-HIDDEN`, so this layer reached the symbolic renderer — which resolved its appearance
        // with the state HARD-CODED to 'projection'. Result: an occluded window frame painted
        // SOLID, at the projection weight, on the projection colour. L-277 named the `hidden`
        // zone, produced it and gave it a dashed pen; the symbol renderer then discarded all
        // three, for the only two element types that HAVE symbols.
        const strokes = renderPlan('v-glaz-hidden', drawingWith([{ layer: 'A-GLAZ-HIDDEN' }]));
        expect(strokes).toHaveLength(1);

        const hidden = resolvePen('HIDDEN', 'window');
        expect(strokes[0]!.dash.length, 'the HIDDEN zone is the ONLY zone that dashes — C09 §4.6.4').toBeGreaterThan(0);
        expect(strokes[0]!.globalAlpha).toBeCloseTo(hidden.opacity, 4);
        expect(strokes[0]!.lineWidth).toBeCloseTo(
            Math.max(HAIRLINE, hidden.widthMm * SCREEN_PX_PER_MM), 4,
        );
        // The pre-fix product painted this SOLID at the PROJECTION weight. Both are refuted:
        expect(strokes[0]!.dash).not.toEqual([]);
        expect(strokes[0]!.lineWidth).not.toBeCloseTo(resolvePen('PROJECTION', 'window').widthMm * SCREEN_PX_PER_MM, 4);
    });

    it('THE RULE CHAIN: an ELEMENT-LEVEL pen override now reaches a window symbol (the chain was skipped entirely)', () => {
        // `resolveIntentStyle()` is the INTENT tier ALONE (priority 1000). The symbol renderer
        // called it directly, so the VIEW (9000) and ELEMENT (10000) override tiers — and the VG
        // governance weight factor — applied to every line in the drawing EXCEPT door and window
        // symbols. The founder could re-weight his windows and watch nothing happen.
        //
        // NOTE the tier this asserts through, and why it is not the VIEW tier: `PlanViewCanvas.
        // render()` opens with `_syncVGViewOverrides()`, which calls
        // `graphicsRulesEngine.removeViewOverrides(viewId)` and re-seeds the view tier from the
        // VGGovernanceStore. **The 9000 tier is OWNED by VG governance and cannot be written to
        // by hand across a render** — a fact this test discovered by failing. Asserting through
        // it would have guarded a mechanism that does not exist. The ELEMENT tier (10000) is not
        // flushed, so it is the honest proof that the chain reaches the symbol.
        const viewId = 'v-glaz-override';
        const uuid   = 'win-0001';
        graphicsRulesEngine.addElementOverride(uuid, 'PROJECTION', 'window', { widthMm: 1.4 });

        const strokes = renderPlan(viewId, drawingWith([{ layer: 'A-GLAZ-PROJ', uuid }]));
        expect(strokes).toHaveLength(1);
        expect(strokes[0]!.lineWidth).toBeCloseTo(1.4 * SCREEN_PX_PER_MM, 4);

        graphicsRulesEngine.removeElementOverrides(uuid);
    });

    it('the window\'s CUT/PROJECTION hierarchy reaches the screen — cut frame HEAVIER than projected glazing', () => {
        // The records agent's L-280 hypothesis was that these two were painted at the SAME
        // weight. They are not, and they were not before this fix either (symbolicRuleForLayer
        // declines `-CUT`, so the frame always took the generic CUT pen). Recorded here so the
        // real invariant is guarded and the refuted one cannot be re-asserted from memory.
        const strokes = renderPlan('v-glaz-hier', drawingWith([
            { layer: 'A-GLAZ-CUT' },
            { layer: 'A-GLAZ-PROJ' },
        ]));
        const [cut, proj] = strokes;
        expect(cut!.lineWidth).toBeGreaterThan(proj!.lineWidth);
        expect(cut!.lineWidth).toBeCloseTo(resolvePen('CUT', 'window').widthMm * SCREEN_PX_PER_MM, 4);
    });
});
