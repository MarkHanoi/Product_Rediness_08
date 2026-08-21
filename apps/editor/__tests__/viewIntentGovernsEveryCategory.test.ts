// @vitest-environment happy-dom
/**
 * §VG-LAYER-IDENTITY-IS-THE-ONLY-SURVIVOR (L-1600) — DOES THE VIEW-INTENT PANEL
 * REACH THE LINE THE USER SEES, FOR EVERY CATEGORY, IN PLAN *AND* ELEVATION?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS SUITE DRIVES `PlanViewCanvas.render()` AND NOT A COMPOSITION HELPER
 * ─────────────────────────────────────────────────────────────────────────────
 * `VgCanvasStyleResolver.test.ts` already asserts on the composed stroke — but its
 * `composeStroke()` helper takes `category` and `layerTag` as INPUTS. The founder's
 * defect ("I tested windows and did not work — or furniture") is precisely that the
 * canvas cannot DERIVE those two values for a symbol-builder line: the tag composes
 * to `''` and the category to `null`. A suite that is HANDED the tag scores 1.000 on
 * the broken build. That is the [committed != reachable] trap, and it is why this
 * suite ends at `ctx.strokeStyle` and derives everything before it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MECHANISM, MEASURED — NOT ASSUMED
 * ─────────────────────────────────────────────────────────────────────────────
 * Stage 1 (`obcSurvivingUserData`) runs the REAL OBC call chain that every symbol
 * builder uses — `TechnicalDrawing.toDrawingSpace()` then `addProjectionLines(ls,
 * LAYER)` — against a REAL `OBC.TechnicalDrawing`, and REPORTS what survives it.
 * Measured against @thatopen/components 3.4.6:
 *
 *     PROJECTED userData = {"layer":"A-FURN"}     // builder's userData: GONE
 *     material is layer material? true            // builder's material: GONE
 *
 * `toDrawingSpace` returns `new THREE.LineSegments(geo)` — a fresh object with no
 * userData and a default material — and `DrawingLayers.assign()` then overwrites
 * `object.material = layer.material`. So the ONLY channel that survives a builder's
 * hand-off to OBC is the LAYER NAME, which OBC records at `userData.layer`.
 *
 * Stage 2 drives the REAL `PlanViewCanvas.render()` over a line carrying EXACTLY
 * that captured userData.
 *
 * ⚠ THE ONE SEAM THIS SUITE BRIDGES, AND WHY IT IS NOT A CHEAT.
 * `@thatopen/components` evaluates its own copy of three (it pulls `three/webgpu`,
 * which re-bundles the core classes), so under vitest `obcLine instanceof
 * THREE.LineSegments` is FALSE across the module seam — measured, with
 * `constructor.name === 'LineSegments'` on both sides and `constructor` identity
 * false. `PlanViewCanvas.render()` guards its traverse with exactly that
 * `instanceof` (PlanViewCanvas.ts:397), so an OBC-built line is rejected before any
 * styling decision is reached and NOTHING is painted — for walls too. That is a
 * HARNESS artefact: the production build carries `'@pryzm/renderer-three/three':
 * 'three'` (vite.config.ts:398) plus `optimizeDeps.exclude`, and walls demonstrably
 * paint in production, which is the proof the seam does not exist at runtime.
 *
 * So stage 2 rebuilds the line with the canvas's OWN three and stamps it with the
 * userData object CAPTURED FROM THE REAL OBC RUN in stage 1 — not a hand-typed
 * literal. If OBC ever starts preserving `role`, `lineWeight` or `elementType`, or
 * renames `userData.layer`, stage 1's capture changes and these tests move with it.
 * Nothing about the product's own decision — how the canvas turns a layer name into
 * a category, a pen and a stroke — is stubbed.
 *
 * Contracts: C06 §13.3 (one producer per surface), C25 §3, C09 §4.1/§4.3.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as OBC from '@thatopen/components';
import * as THREE from '@pryzm/renderer-three/three';
import {
    PlanViewCanvas,
    viewTechnicalDrawingCache,
    resolveVgCanvasStyle,
    vgGovernanceStore,
} from '@pryzm/core-app-model';

/** A colour no template, pen table or intent in the repo can produce by accident. */
const EXTREME_COLOUR = '#ff00ff';
const EXTREME_WEIGHT = 6;

/**
 * EVERY category the view-intent panel offers, paired with the ISO layer its REAL
 * producer writes to. The layer strings were measured from the producers themselves
 * (grep `addProjectionLines` across the geometry packages' SymbolBuilder files, plus
 * `EdgeProjectorService.ELEMENT_TYPE_TO_PROJECTION_LAYER`); a rename on either side
 * must break this table loudly rather than silently un-governing a category.
 */
interface Case {
    category: string;
    layer: string;
    producer: string;
    /**
     * Does this producer ALSO stamp `userData.layerName` / `.name` on the projected
     * line, on top of the `userData.layer` OBC sets? MEASURED, per producer:
     *   • `EdgeProjectorService`            — YES (`projected.userData.layerName = targetLayerName`,
     *                                        EdgeProjectorService.ts:2897 / :3401 / :3834).
     *   • `OpeningElevationSymbolBuilder`   — YES (`projected.name` AND `.userData.layerName`,
     *                                        OpeningElevationSymbolBuilder.ts:570-571).
     *   • all 14 PLAN symbol builders       — NO. Measured with
     *     `grep -c layerName` over every `*SymbolBuilder*.ts` in `packages/geometry-*`: zero.
     *
     * This field is the SUITE'S OWN CONTROL. `PlanViewCanvas` composes its layerTag
     * from `layerName`/`name` only, so at HEAD the `true` rows are GREEN and the
     * `false` rows are RED — which is exactly the founder's report ("works relatively
     * good for walls — but not other elements"). A suite where everything fails cannot
     * tell a real defect from a broken harness; this one can.
     */
    stampsLayerName: boolean;
}

const PLAN_CASES: ReadonlyArray<Case> = [
    { category: 'wall',      layer: 'A-WALL',        stampsLayerName: false, producer: 'WallLayerPlanSymbolBuilder' },
    { category: 'wall',      layer: 'A-WALL:cut',    stampsLayerName: true,  producer: 'EdgeProjectorService' },
    { category: 'slab',      layer: 'A-FLOR:cut',    stampsLayerName: true,  producer: 'EdgeProjectorService' },
    { category: 'column',    layer: 'S-COLS',        stampsLayerName: false, producer: 'ColumnPlanSymbolBuilder' },
    { category: 'beam',      layer: 'A-BEAM:proj',   stampsLayerName: true,  producer: 'EdgeProjectorService' },
    { category: 'door',      layer: 'A-DOOR-CUT',    stampsLayerName: false, producer: 'DoorPlanSymbolBuilder' },
    { category: 'door',      layer: 'A-DOOR-PROJ',   stampsLayerName: false, producer: 'DoorPlanSymbolBuilder' },
    { category: 'window',    layer: 'A-GLAZ-CUT',    stampsLayerName: false, producer: 'WindowPlanSymbolBuilder' },
    { category: 'window',    layer: 'A-GLAZ-PROJ',   stampsLayerName: false, producer: 'WindowPlanSymbolBuilder' },
    { category: 'roof',      layer: 'A-ROOF',        stampsLayerName: false, producer: 'RoofSlopeSymbolBuilder' },
    { category: 'stair',     layer: 'A-STRS',        stampsLayerName: false, producer: 'StairSymbolTechnicalDrawingBridge' },
    { category: 'furniture', layer: 'A-FURN',        stampsLayerName: false, producer: 'Bed/Chair/Sofa/Kitchen/Wardrobe PlanSymbolBuilder' },
    { category: 'furniture', layer: 'A-FURN-SHADOW', stampsLayerName: false, producer: 'TreePlanSymbolBuilder' },
    { category: 'ceiling',   layer: 'A-CEIL:proj',   stampsLayerName: true,  producer: 'EdgeProjectorService' },
    { category: 'plumbing',  layer: 'A-PLMB',        stampsLayerName: false, producer: 'PlumbingPlanSymbolBuilder' },
];

/** Elevation producers — the founder asked explicitly for "all view types, elevation etc." */
const ELEVATION_CASES: ReadonlyArray<Case> = [
    { category: 'window',    layer: 'A-GLAZ-SYM',  stampsLayerName: true,  producer: 'OpeningElevationSymbolBuilder' },
    { category: 'door',      layer: 'A-DOOR-SYM',  stampsLayerName: true,  producer: 'OpeningElevationSymbolBuilder' },
    { category: 'wall',      layer: 'A-WALL-SYM',  stampsLayerName: true,  producer: 'OpeningElevationSymbolBuilder' },
    { category: 'plumbing',  layer: 'A-PLMB',      stampsLayerName: false, producer: 'PlumbingElevationSymbolBuilder' },
    { category: 'window',    layer: 'A-GLAZ:proj', stampsLayerName: true,  producer: 'EdgeProjectorService (elevation)' },
    { category: 'furniture', layer: 'A-FURN',      stampsLayerName: false, producer: 'furniture linework in elevation' },
];

interface StrokeRecord { colour: string; width: number }

/** Records the two expressions `render()` evaluates per line. */
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
        });
    };
    const canvas = {
        width: 800, height: 600, clientWidth: 800, clientHeight: 600,
        style: {}, getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
    ctx.canvas = canvas;
    return { canvas, strokes };
}

/**
 * STAGE 1 — run the REAL OBC chain a symbol builder runs, and return the userData
 * OBC leaves on the projected line, plus the two facts about what it destroyed.
 */
function obcSurvivingUserData(layer: string): {
    userData: Record<string, unknown>;
    materialIsLayerMaterial: boolean;
    builderStampsSurvived: boolean;
} {
    const components = new OBC.Components();
    const drawing = new OBC.TechnicalDrawing(components);
    drawing.layers.create(layer);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(
        new Float32Array([-4, 0, 0, 4, 0, 0]), 3,
    ));
    const seg = new THREE.LineSegments(
        g, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }),
    );
    // Exactly what the symbol builders stamp — and exactly what OBC discards.
    seg.userData = { lineWeight: 2, role: 'cut', elementType: 'Window' };
    seg.updateWorldMatrix(true, false);

    const projected = OBC.TechnicalDrawing.toDrawingSpace(seg as never, drawing);
    drawing.addProjectionLines(projected, layer);

    const ud = { ...(projected.userData as Record<string, unknown>) };
    return {
        userData: ud,
        materialIsLayerMaterial:
            (projected as { material: unknown }).material === drawing.layers.get(layer)!.material,
        builderStampsSurvived:
            ud.role !== undefined || ud.lineWeight !== undefined || ud.elementType !== undefined,
    };
}

/**
 * STAGE 2 — a drawing the canvas's own three can traverse, carrying the userData
 * CAPTURED from the real OBC run (see the header for why this seam is bridged).
 */
function drawingAsObcLeavesIt(layer: string, stampsLayerName: boolean): { three: THREE.Group } {
    const surviving = obcSurvivingUserData(layer);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(
        new Float32Array([-4, 0, 0, 4, 0, 0]), 3,
    ));
    const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial());
    ls.userData = { ...surviving.userData };
    // Producers that re-stamp the layer AFTER projection (EdgeProjectorService,
    // OpeningElevationSymbolBuilder) — see `Case.stampsLayerName`.
    if (stampsLayerName) {
        ls.userData.layerName = layer;
        ls.name = layer;
    }

    const group = new THREE.Group();
    group.add(ls);
    group.updateWorldMatrix(true, true);
    return { three: group };
}

function viewDefFor(id: string, viewType: string): never {
    return {
        id, name: id, viewType,
        spatial: { levelId: 'L0', projectionDirection: { x: 0, y: 0, z: -1 } },
        output: {},
    } as never;
}

/**
 * Drives the REAL render and returns the strokes painted for the drawing's one line.
 * The grid is disabled so every recorded stroke belongs to model linework.
 */
function renderAndCollect(c: Case, viewType: string): StrokeRecord[] {
    const { layer, category } = c;
    const viewId = `v-${category}-${layer}-${viewType}`.replace(/[^a-z0-9-]/gi, '_');
    const viewDef = viewDefFor(viewId, viewType);

    // The user's decision, made at the tier the panel writes to.
    // `setViewCategoryOverride` is what `SetVGViewCategoryStyleCommand` calls, and it
    // is what stamps `overriddenProps` — so `resolveVgCanvasStyle` reports a genuine
    // OVERRIDE rather than a template seed (see VgCanvasStyleResolver's header).
    vgGovernanceStore.ensureModel('model-default', 'Model');
    vgGovernanceStore.ensureView(viewId, viewId, 'model-default');
    vgGovernanceStore.setViewCategoryOverride(viewId, category, {
        edgeColor: EXTREME_COLOUR,
        lineWeight: EXTREME_WEIGHT,
        visible: true,
    } as never);

    viewTechnicalDrawingCache.set(viewId, drawingAsObcLeavesIt(layer, c.stampsLayerName) as never);

    const { canvas, strokes } = recordingCanvas();
    const pvc = new PlanViewCanvas(canvas, {
        gridVisible: false,
        // EXACTLY how PlanViewManager wires it (PlanViewManager.ts:727).
        styleResolver: (cat, layerTag) => resolveVgCanvasStyle(cat, layerTag, viewId) as never,
    });
    pvc.setViewType(viewType);
    pvc.setLevelId('L0');
    pvc.setSize(800, 600);
    pvc.render(viewDef);
    return strokes;
}

describe('§VG-LAYER-IDENTITY-IS-THE-ONLY-SURVIVOR (L-1600)', () => {
    beforeEach(() => {
        vgGovernanceStore.clear();
        viewTechnicalDrawingCache.clear();
    });

    it('POSITIVE CONTROL — the real OBC chain destroys every identity except the layer name', () => {
        const s = obcSurvivingUserData('A-FURN');
        // The builder's own stamps are gone …
        expect(s.builderStampsSurvived).toBe(false);
        // … its material was replaced by the layer's shared instance …
        expect(s.materialIsLayerMaterial).toBe(true);
        // … and the ONE thing that survived is the layer name OBC stamped.
        expect(s.userData).toEqual({ layer: 'A-FURN' });
    });

    describe('PLAN — the panel must paint every category', () => {
        for (const c of PLAN_CASES) {
            it(`${c.category} on ${c.layer} (${c.producer})`, () => {
                const strokes = renderAndCollect(c, 'plan');
                expect(strokes.length, 'the line must actually be painted').toBeGreaterThan(0);
                expect(
                    strokes.some(s => s.colour === EXTREME_COLOUR),
                    `no stroke used the panel colour ${EXTREME_COLOUR}; painted: ` +
                    JSON.stringify(strokes.slice(0, 4)),
                ).toBe(true);
            });
        }
    });

    /**
     * ⚠ HONEST GAP, PINNED — `handrail` is a category the view-intent panel OFFERS and
     * that nothing can ever address.
     *
     * `EdgeProjectorService.ELEMENT_TYPE_TO_PROJECTION_LAYER` routes `Handrail`,
     * `HandrailPart`, `stair-railing` and `stairRailing` ALL to `A-STRS` — the STAIR
     * layer — and `VGSceneApplicator.CATEGORY_TO_DXF_LAYER` independently maps both
     * `stair` AND `handrail` to `A-STRS` as well. The layer name is the only channel
     * that survives OBC (see the header), so at the point of painting a handrail is
     * indistinguishable from a stair: it resolves to `stair` and takes the stair
     * style. Setting the panel's `handrail` row changes nothing on screen, and
     * `applyToProjectionLayers` styles `A-STRS` twice per pass, last-write-wins.
     *
     * This is NOT fixed here. The fix is a three-line routing change (give railings the
     * ISO sub-layer `A-STRS-HRAL`, which `vgCategoryForLayer`'s longest-prefix-wins rule
     * already resolves correctly), but it changes the DXF/SVG layer name emitted for
     * every railing — an EXPORT-visible change that must be taken deliberately, not
     * slipped in behind a styling fix. So the collision is PINNED instead: this test
     * fails the moment anyone changes the routing, forcing the decision into the open.
     */
    it('KNOWN GAP — handrail is indistinguishable from stair, and takes the STAIR style', () => {
        const strokes = renderAndCollect(
            { category: 'handrail', layer: 'A-STRS:proj', stampsLayerName: true, producer: 'EdgeProjectorService' },
            'plan',
        );
        expect(strokes.length).toBeGreaterThan(0);
        // The panel's handrail decision does NOT reach the line …
        expect(strokes.some(s => s.colour === EXTREME_COLOUR)).toBe(false);

        // … and the reason is that the same layer resolves to `stair`, which DOES govern.
        const asStair = renderAndCollect(
            { category: 'stair', layer: 'A-STRS:proj', stampsLayerName: true, producer: 'EdgeProjectorService' },
            'plan',
        );
        expect(asStair.some(s => s.colour === EXTREME_COLOUR)).toBe(true);
    });

    describe('ELEVATION — the panel must paint every category', () => {
        for (const c of ELEVATION_CASES) {
            it(`${c.category} on ${c.layer} (${c.producer})`, () => {
                const strokes = renderAndCollect(c, 'elevation');
                expect(strokes.length, 'the line must actually be painted').toBeGreaterThan(0);
                expect(
                    strokes.some(s => s.colour === EXTREME_COLOUR),
                    `no stroke used the panel colour ${EXTREME_COLOUR}; painted: ` +
                    JSON.stringify(strokes.slice(0, 4)),
                ).toBe(true);
            });
        }
    });
});
