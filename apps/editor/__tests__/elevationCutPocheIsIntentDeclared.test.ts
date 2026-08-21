// @vitest-environment happy-dom
/**
 * §ELEVATION-POCHE-IS-INTENT-DECLARED (L-1601) — THE FOUNDER'S OWN ELEVATION REPRO.
 *
 * > "the elevation view intent setting doesnt seems to be wired — as we have in plan
 * >  view I want the fill colour to render in cut slabs and walls on the elevation as
 * >  grey — but i dont manage to do it … i changed the CUT fill colour for slab and
 * >  walls — and nothing changed"
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY NOTHING CHANGED, MEASURED
 * ─────────────────────────────────────────────────────────────────────────────
 * The command path was never the problem — their console shows
 * `UPDATE_VISIBILITY_INTENT` executing, a full re-projection running, and
 * `applyToProjectionLayers() … styledLayers=26 … across 14 VG categories`. The intent
 * reached the layers. It had nothing to paint:
 *
 *   • `PlanViewCanvas.render()` gated the ENTIRE poché pass on
 *     `resolveViewScope(viewType).poche`, and `_ELEVATION_SCOPE.poche` was `false`.
 *   • That gate is §FIX-ELEVATION-POCHE (L-119), which disabled elevation poché because
 *     it "painted every façade cut layer solid black over the linework".
 *   • But §ELEV-LINEWEIGHT (L-182) later narrowed the elevation `:cut` band to *"only
 *     geometry the plane actually slices"* — EdgeProjectorService DOES emit `:cut` for
 *     elevations now. The gate was never revisited, so the cut band existed and could
 *     never be filled. A stale guard outliving the condition that justified it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS SUITE PINS — BOTH DIRECTIONS, BECAUSE ONLY ONE OF THEM IS THE FEATURE
 * ─────────────────────────────────────────────────────────────────────────────
 * Turning the gate off would hand L-119's black façade straight back. So elevation
 * poché is gated on `pocheRequiresExplicitIntent`: the ISO default and the VG template
 * seed are NOT fallbacks for an elevation — only a cut fill the INTENT explicitly
 * declares for (elevation × category) may paint.
 *
 *   ARM 1 (the feature)     — intent declares grey cut fill for elevation × slab/wall
 *                             ⇒ the elevation's cut regions are FILLED GREY.
 *   ARM 2 (the L-119 guard) — intent declares NO cut fill
 *                             ⇒ NOTHING is filled, exactly as before this change.
 *
 * Arm 2 is not decoration. It is the assertion that says this change cannot silently
 * repaint every existing elevation in the product, and it is what makes arm 1 safe to
 * ship. A suite with only arm 1 would pass just as well on a build that fills
 * unconditionally — i.e. on the L-119 regression.
 *
 * The assertion is on `ctx.fill()` and the `fillStyle` live at that moment — the pixels,
 * not a resolver return. Contracts: C09 §4.1/§4.3, C25 §3.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    PlanViewCanvas,
    viewTechnicalDrawingCache,
    resolveVgCanvasStyle,
    vgGovernanceStore,
} from '@pryzm/core-app-model';
import {
    visibilityIntentStore,
    viewIntentInstanceStore,
    cloneSystemIntents,
    SYSTEM_INTENT_IDS,
} from '@pryzm/core-app-model/presentation';

/** The founder's word for it. Distinctive enough that no default can produce it. */
const FOUNDER_GREY = '#9a9a9a';

interface Painted { fills: string[]; strokes: string[] }

function recordingCanvas(): { canvas: HTMLCanvasElement; painted: Painted } {
    const painted: Painted = { fills: [], strokes: [] };
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
        'moveTo', 'lineTo', 'arc', 'arcTo', 'rect', 'strokeRect', 'clearRect', 'clip',
        'setLineDash', 'fillText', 'strokeText', 'translate', 'rotate', 'scale',
        'drawImage', 'bezierCurveTo', 'quadraticCurveTo', 'ellipse',
    ]) ctx[m] = noop;
    ctx.getLineDash = () => [];
    ctx.createPattern = () => null;
    ctx.createLinearGradient = () => ({ addColorStop: noop });
    ctx.measureText = () => ({ width: 10 });
    ctx.stroke = () => { painted.strokes.push(String(ctx.strokeStyle).toLowerCase()); };
    ctx.fill = () => { painted.fills.push(String(ctx.fillStyle).toLowerCase()); };
    // `fillRect` is the opaque page wash at the top of render() — never a poché region.
    ctx.fillRect = noop;
    const canvas = {
        width: 800, height: 600, clientWidth: 800, clientHeight: 600,
        style: {}, getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
    ctx.canvas = canvas;
    return { canvas, painted };
}

/**
 * A drawing holding ONE closed rectangular cut region on `${layer}:cut`, shaped exactly
 * as EdgeProjectorService leaves an elevation cut band: `userData.layer` +
 * `userData.layerName` (it re-stamps after projection), and enough segments for
 * `PocheFillBuilder` to close a ring (`posAttr.count >= 6` is the renderer's own floor).
 */
function elevationDrawingWithCutRegion(layer: string): { three: THREE.Group } {
    const cutLayer = `${layer}:cut`;
    // A closed rectangle as LineSegments pairs, in the drawing's XZ plane.
    const r = [
        -3, 0, -1, 3, 0, -1,
        3, 0, -1, 3, 0, 1,
        3, 0, 1, -3, 0, 1,
        -3, 0, 1, -3, 0, -1,
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(r), 3));
    const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial());
    ls.userData = { layer: cutLayer, layerName: cutLayer };
    ls.name = cutLayer;

    const group = new THREE.Group();
    group.add(ls);
    group.updateWorldMatrix(true, true);
    return { three: group };
}

/**
 * Binds `viewId` to a copy of the Architectural Documentation system intent, optionally
 * carrying the founder's edit: a `viewTypeModifiers` entry declaring a grey CUT fill for
 * (elevation × elementType) — which is precisely the row the View Modifiers tab writes.
 */
function bindIntent(viewId: string, cutFillFor: string[] | null): void {
    const base = cloneSystemIntents()
        .find(i => i.id === SYSTEM_INTENT_IDS.architecturalDocumentation)!;
    const intent = JSON.parse(JSON.stringify(base)) as typeof base & {
        id: string;
        viewTypeModifiers: Array<Record<string, unknown>>;
    };
    intent.id = `intent-${viewId}`;
    // Start from a clean slate so the assertion cannot be satisfied by a seeded modifier.
    intent.viewTypeModifiers = [];
    if (cutFillFor) {
        for (const elementType of cutFillFor) {
            intent.viewTypeModifiers.push({
                viewType: 'elevation',
                elementType,
                statePatch: { cut: { fill: { style: 'solid', colour: FOUNDER_GREY, opacity: 1 } } },
            });
        }
    }
    // `restore` installs a fully-formed intent as-is (the deserialise path), which is
    // what a test wants: `create` would re-stamp ids/versions.
    visibilityIntentStore.restore(intent as never);
    viewIntentInstanceStore.assign(viewId, intent.id);
}

function renderElevation(viewId: string, layer: string): Painted {
    const { canvas, painted } = recordingCanvas();
    vgGovernanceStore.ensureModel('model-default', 'Model');
    viewTechnicalDrawingCache.set(viewId, elevationDrawingWithCutRegion(layer) as never);

    const pvc = new PlanViewCanvas(canvas, {
        gridVisible: false,
        styleResolver: (cat, layerTag) => resolveVgCanvasStyle(cat, layerTag, viewId) as never,
    });
    pvc.setViewType('elevation');
    pvc.setSize(800, 600);
    pvc.render({
        id: viewId, name: viewId, viewType: 'elevation',
        spatial: { levelId: 'L0', projectionDirection: { x: 0, y: 0, z: -1 } },
        output: {},
    } as never);
    return painted;
}

describe('§ELEVATION-POCHE-IS-INTENT-DECLARED (L-1601)', () => {
    beforeEach(() => {
        vgGovernanceStore.clear();
        viewTechnicalDrawingCache.clear();
    });

    describe('ARM 1 — the founder’s edit reaches the elevation', () => {
        for (const [category, layer] of [['slab', 'A-FLOR'], ['wall', 'A-WALL']] as const) {
            it(`CUT fill grey for elevation × ${category} fills ${layer}:cut grey`, () => {
                const viewId = `vd-elev-${category}`;
                bindIntent(viewId, [category]);
                const painted = renderElevation(viewId, layer);
                expect(
                    painted.fills.includes(FOUNDER_GREY),
                    `elevation cut region was not filled with the intent colour; filled: ` +
                    JSON.stringify(painted.fills),
                ).toBe(true);
            });
        }
    });

    describe('ARM 2 — the L-119 guard: no declared fill, no paint', () => {
        for (const [category, layer] of [['slab', 'A-FLOR'], ['wall', 'A-WALL']] as const) {
            it(`no CUT fill declared for elevation × ${category} ⇒ ${layer}:cut is NOT filled`, () => {
                const viewId = `vd-elev-bare-${category}`;
                bindIntent(viewId, null);
                const painted = renderElevation(viewId, layer);
                expect(
                    painted.fills.length,
                    'an elevation with no intent-declared cut fill must paint NO poché — ' +
                    'this is the assertion that stops L-119’s black façade returning; filled: ' +
                    JSON.stringify(painted.fills),
                ).toBe(0);
            });
        }

        it('the linework is still drawn — arm 2 proves "no FILL", never "no drawing"', () => {
            const viewId = 'vd-elev-linework';
            bindIntent(viewId, null);
            const painted = renderElevation(viewId, 'A-WALL');
            expect(painted.strokes.length).toBeGreaterThan(0);
        });
    });
});
