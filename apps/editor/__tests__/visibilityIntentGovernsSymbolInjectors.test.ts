// @vitest-environment happy-dom
/**
 * §SYMBOL-INJECTORS-VS-INTENT (L-3900..L-3903) — DOES A *VISIBILITY INTENT* DECISION
 * REACH A LINE PUT INTO THE DRAWING BY A **SYMBOL INJECTOR**?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS SUITE EXISTS BESIDE `viewIntentGovernsEveryCategory.test.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 * That suite is GREEN (23/23, measured 2026-08-22) and it proves a great deal — but
 * it drives the **VG governance store** (`vgGovernanceStore.setViewCategoryOverride`).
 * The founder's report is about the **Visibility Intent** panel (`promo 02` → Element
 * Rules), which writes `visibilityIntentStore` / `viewIntentInstanceStore`. Those are
 * DIFFERENT STORES reaching the canvas by DIFFERENT tiers:
 *
 *     VG      → `resolveVgCanvasStyle()` → `vgEdge`  → `ctx.strokeStyle = vgEdge ?? _pen.color`
 *     INTENT  → `graphicsRulesEngine`    → `_pen`    ──────────────────────┘  (priority 1000)
 *
 * A suite that sets VG scores 1.000 while the intent tier is dead, and vice versa. So
 * this one sets **only** the intent and never touches VG — `vgEdge` stays `null` by
 * construction (L-776: VG reports a colour only where `overriddenProps` records a real
 * human override), which is what makes `_pen.color` observable at all.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT ENDS AT `ctx.strokeStyle` AND NOT AT `resolveIntentStyle()`
 * ─────────────────────────────────────────────────────────────────────────────
 * `perCategoryViewVisibility.spec.ts` already asserts that the RESOLVER honours a
 * per-category hide. That is one layer short of the founder's complaint: he is looking
 * at a DRAWING. Between the resolver and the pixel sit `categoryFromFlags()` (regex over
 * the layer tag), `drawingZoneFromLayerName()`, the four-tier `graphicsRulesEngine`
 * merge, and the `vgEdge ?? _pen.color` composition — any of which can drop the answer.
 * [[committed-is-not-reachable]]: prove it where the user sees it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE LAYER TAG IS NOT INVENTED HERE — IT IS WHAT OBC LEAVES
 * ─────────────────────────────────────────────────────────────────────────────
 * Every symbol injector hands its `LineSegments` to
 * `OBC.TechnicalDrawing.toDrawingSpace()` + `drawing.addProjectionLines(ls, LAYER)`.
 * Measured in `viewIntentGovernsEveryCategory.test.ts`'s positive control: that chain
 * DESTROYS the builder's `userData` and REPLACES its material with the layer's shared
 * instance, leaving exactly `{ layer: 'A-FURN' }`. So a `LineBasicMaterial({ color:
 * 0x000000 })` written inside `BedPlanSymbolBuilder` is discarded and cannot be the
 * cause of anything — the layer NAME is the only surviving channel. This suite stamps
 * that same userData shape and no more.
 *
 * Contracts: C09 §4.1/§4.3/§4.5 (intent authority), C04 (rendering), C84 (element
 * integrity — furniture is an element family), C97 (Element/Furniture).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    PlanViewCanvas,
    viewTechnicalDrawingCache,
    visibilityIntentStore,
    viewIntentInstanceStore,
    viewDefinitionStore,
    vgGovernanceStore,
    registerSegmentUUID,
} from '@pryzm/core-app-model';

/** A colour no template, pen table or system intent in the repo can produce by accident. */
const EXTREME_COLOUR = '#ff00ff';
const INTENT_ID = 'vi-l3900-doc';

interface StrokeRecord { colour: string; width: number; alpha: number }

/**
 * Records what `render()` actually committed per stroke. `globalAlpha` is captured
 * because that is how the intent expresses a HIDE: `appearanceToPenStyle()` returns
 * `{ widthMm: 0, opacity: 0 }` for an invisible appearance, and `ctx.lineWidth` is
 * floored at one device pixel — so a hidden line is an ALPHA-0 stroke, not an absent
 * one. A suite that only counted strokes would call that a failure and be wrong.
 */
function recordingCanvas(): { canvas: HTMLCanvasElement; strokes: StrokeRecord[] } {
    const strokes: StrokeRecord[] = [];
    const ctx: Record<string, unknown> = {
        strokeStyle: '#000000', fillStyle: '#000000', lineWidth: 1,
        globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
        lineCap: 'butt', lineJoin: 'miter', miterLimit: 10,
        shadowBlur: 0, shadowColor: 'transparent',
        imageSmoothingEnabled: true, imageSmoothingQuality: 'high',
        canvas: null,
    };
    const noop = () => { /* geometry sink */ };
    for (const m of [
        'setTransform', 'transform', 'save', 'restore', 'beginPath', 'closePath',
        'moveTo', 'lineTo', 'arc', 'arcTo', 'rect', 'fill', 'fillRect', 'strokeRect',
        'clearRect', 'clip', 'setLineDash', 'fillText', 'strokeText', 'translate',
        'rotate', 'scale', 'drawImage', 'bezierCurveTo', 'quadraticCurveTo', 'ellipse',
    ]) ctx[m] = noop;
    ctx.getLineDash = () => [];
    ctx.createPattern = () => null;
    ctx.createLinearGradient = () => ({ addColorStop: noop });
    ctx.measureText = () => ({ width: 10 });
    ctx.stroke = () => {
        strokes.push({
            colour: String(ctx.strokeStyle).toLowerCase(),
            width: Number(ctx.lineWidth),
            alpha: Number(ctx.globalAlpha),
        });
    };
    const canvas = {
        width: 800, height: 600, clientWidth: 800, clientHeight: 600,
        style: {}, getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
    ctx.canvas = canvas;
    return { canvas, strokes };
}

/** A drawing holding ONE line stamped exactly as OBC leaves an injector's output. */
function drawingOnLayer(layer: string): { three: THREE.Group } {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(
        new Float32Array([-4, 0, 0, 4, 0, 0]), 3,
    ));
    const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial());
    // The ONLY key OBC leaves behind (measured — see this file's header).
    ls.userData = { layer };
    const group = new THREE.Group();
    group.add(ls);
    group.updateWorldMatrix(true, true);
    return { three: group };
}

/** Drives the REAL `PlanViewCanvas.render()`; no VG override is ever set. */
function renderAndCollect(viewId: string, layer: string, viewType: string): StrokeRecord[] {
    viewTechnicalDrawingCache.set(viewId, drawingOnLayer(layer) as never);
    const { canvas, strokes } = recordingCanvas();
    const pvc = new PlanViewCanvas(canvas, { gridVisible: false });
    pvc.setViewType(viewType);
    pvc.setLevelId('L0');
    pvc.setSize(800, 600);
    pvc.render({
        id: viewId, name: viewId, viewType,
        spatial: { levelId: 'L0', projectionDirection: { x: 0, y: 0, z: -1 } },
        output: {},
    } as never);
    return strokes;
}

/** Is anything actually VISIBLE on screen for this line? */
function painted(strokes: StrokeRecord[]): boolean {
    return strokes.some(s => s.alpha > 0 && s.width > 0);
}

function makeIntent(rules: Record<string, unknown>): void {
    visibilityIntentStore.create({
        id: INTENT_ID,
        name: 'Doc (test)',
        isSystem: false,
        version: 1,
        viewTypeModifiers: [],
        purposeModifiers: [],
        elementRules: rules,
    } as never);
}

const VISIBLE_BLACK = {
    visible: true,
    line: { colour: '#000000', opacity: 1, weight: 0.35, style: 'solid' },
    fill: { style: 'none', colour: '#000000', opacity: 1 },
};

/** All four states, so `isElementTypeFullyHidden()` and every zone resolve. */
function rule(patch: Record<string, unknown> = {}): Record<string, unknown> {
    const base = () => JSON.parse(JSON.stringify(VISIBLE_BLACK));
    return {
        cut: { ...base(), ...patch },
        projection: { ...base(), ...patch },
        beyond: { ...base(), ...patch },
        hidden: { ...base(), ...patch },
    };
}

describe('§SYMBOL-INJECTORS-VS-INTENT — does the Visibility Intent panel reach an injected symbol?', () => {
    beforeEach(() => {
        visibilityIntentStore.reset();
        viewIntentInstanceStore.reset();
        viewDefinitionStore.reset();
        vgGovernanceStore.clear();
        viewTechnicalDrawingCache.clear();
    });

    afterEach(() => {
        visibilityIntentStore.reset();
        viewIntentInstanceStore.reset();
        viewDefinitionStore.reset();
        vgGovernanceStore.clear();
        viewTechnicalDrawingCache.clear();
    });

    /**
     * A-FURN is where Bed/Chair/Sofa/Kitchen/Wardrobe PlanSymbolBuilder write.
     * A-WALL:cut is EdgeProjectorService's own output — the control the founder
     * describes as working ("works relatively good for walls").
     */
    const CASES = [
        { name: 'furniture symbol (A-FURN — Bed/Chair/Kitchen/Wardrobe injectors)', cat: 'furniture', layer: 'A-FURN' },
        { name: 'wall projection (A-WALL:cut — EdgeProjectorService)', cat: 'wall', layer: 'A-WALL:cut' },
    ];

    for (const c of CASES) {
        describe(c.name, () => {
            const viewId = `v-l3900-${c.cat}`;

            beforeEach(() => {
                viewDefinitionStore.create({ id: viewId, name: viewId, viewType: 'plan' } as never);
            });

            it('POSITIVE CONTROL — the line is painted when the intent says visible', () => {
                makeIntent({ __default__: rule(), [c.cat]: rule() });
                viewIntentInstanceStore.assign(viewId, INTENT_ID);
                const strokes = renderAndCollect(viewId, c.layer, 'plan');
                expect(painted(strokes), `nothing painted at all; got ${JSON.stringify(strokes.slice(0, 3))}`).toBe(true);
            });

            it('LINE COLOUR — the intent colour reaches ctx.strokeStyle (founder report 3)', () => {
                makeIntent({
                    __default__: rule(),
                    [c.cat]: rule({ line: { colour: EXTREME_COLOUR, opacity: 1, weight: 0.35, style: 'solid' } }),
                });
                viewIntentInstanceStore.assign(viewId, INTENT_ID);
                const strokes = renderAndCollect(viewId, c.layer, 'plan');
                expect(
                    strokes.some(s => s.colour === EXTREME_COLOUR),
                    `no stroke used the intent colour ${EXTREME_COLOUR}; painted: ${JSON.stringify(strokes.slice(0, 4))}`,
                ).toBe(true);
            });

            it('HIDE — an intent that hides the category paints nothing (founder report 2)', () => {
                makeIntent({
                    __default__: rule(),
                    [c.cat]: rule({ visible: false, line: { colour: '#000000', opacity: 0, weight: 0, style: 'solid' } }),
                });
                viewIntentInstanceStore.assign(viewId, INTENT_ID);
                const strokes = renderAndCollect(viewId, c.layer, 'plan');
                expect(
                    painted(strokes),
                    `the category is hidden but something was still painted: ${JSON.stringify(strokes.slice(0, 4))}`,
                ).toBe(false);
            });

            /**
             * §HIDDEN-IS-NOT-PICKABLE (L-3902) — the residue the stroke tests cannot see.
             *
             * `render()` filters twice (VG `resolved.visible`, then the intent's alpha-0
             * pen). `hitTest()` filtered NEITHER: it traversed every `LineSegments` in the
             * drawing, took the first `DrawingSelectionIndex` id within the threshold and
             * returned it. So a category the user switched OFF stayed fully CLICKABLE —
             * click empty paper, select the bed that is not drawn. That is the same
             * "invisible but still there" complaint from the other side of the pointer.
             */
            it('HIDDEN IS NOT PICKABLE — a hidden category cannot be clicked (L-3902)', () => {
                makeIntent({
                    __default__: rule(),
                    [c.cat]: rule({ visible: false, line: { colour: '#000000', opacity: 0, weight: 0, style: 'solid' } }),
                });
                viewIntentInstanceStore.assign(viewId, INTENT_ID);

                const drawing = drawingOnLayer(c.layer);
                const ls = drawing.three.children[0] as THREE.LineSegments;
                registerSegmentUUID(drawing as object, ls, 'elem-hidden-1');
                viewTechnicalDrawingCache.set(viewId, drawing as never);

                const { canvas } = recordingCanvas();
                const pvc = new PlanViewCanvas(canvas, { gridVisible: false });
                pvc.setViewType('plan');
                pvc.setLevelId('L0');
                pvc.setSize(800, 600);
                pvc.render({
                    id: viewId, name: viewId, viewType: 'plan',
                    spatial: { levelId: 'L0', projectionDirection: { x: 0, y: 0, z: -1 } },
                    output: {},
                } as never);

                // The line spans x -4..4 at the world origin — screen centre.
                expect(
                    pvc.hitTest(400, 300, 40),
                    'a category hidden by the bound intent must not be selectable',
                ).toBeNull();
            });

            it('PICK CONTROL — the same line IS selectable while the category is visible', () => {
                makeIntent({ __default__: rule(), [c.cat]: rule() });
                viewIntentInstanceStore.assign(viewId, INTENT_ID);

                const drawing = drawingOnLayer(c.layer);
                const ls = drawing.three.children[0] as THREE.LineSegments;
                registerSegmentUUID(drawing as object, ls, 'elem-visible-1');
                viewTechnicalDrawingCache.set(viewId, drawing as never);

                const { canvas } = recordingCanvas();
                const pvc = new PlanViewCanvas(canvas, { gridVisible: false });
                pvc.setViewType('plan');
                pvc.setLevelId('L0');
                pvc.setSize(800, 600);
                pvc.render({
                    id: viewId, name: viewId, viewType: 'plan',
                    spatial: { levelId: 'L0', projectionDirection: { x: 0, y: 0, z: -1 } },
                    output: {},
                } as never);

                expect(pvc.hitTest(400, 300, 40)).toBe('elem-visible-1');
            });
        });
    }
});
