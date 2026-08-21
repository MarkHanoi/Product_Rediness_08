/**
 * §SHEET-VIEWPORT-IS-A-RASTER-THUMBNAIL (L-1630) — the on-sheet viewport must
 * carry THE REAL VIEW, not a picture of it.
 *
 * THE FOUNDER'S REPORT (2026-08-21):
 *   "the most important is the view I place is NOT the real view — I need the
 *    real view, not an image. PDF creation works perfectly and actually renders
 *    the true view. elevation views struggle to even render."
 *
 * WHY THIS SPEC MOUNTS THE PANEL INSTEAD OF CALLING A FUNCTION
 *   [committed ≠ reachable]. Every previous sheet finding in this repo was
 *   provable at a function return and still wrong at the surface. So this spec
 *   opens the real SheetEditorPanel against real stores, places a real view on a
 *   real sheet, and reads the DOM the founder is looking at.
 *
 * THE REFERENCE IS THE KNOWN-GOOD PRODUCER
 *   The founder's own PDF is correct, and the PDF path composes its viewport
 *   through `SVGCompositeRenderer`. So the reference here is that same class,
 *   fed the same drawing at the same scale. The assertion is an EQUALITY between
 *   two surfaces, not a hand-written expectation:
 *
 *      on-sheet linework  ==  export linework
 *
 *   which is exactly C06 §13.3 (one producer per surface) stated as a test. A
 *   third renderer, or a bitmap, fails it by construction.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import { sheetStore } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { viewTechnicalDrawingCache } from '@pryzm/core-app-model';
import type { SheetDefinition } from '@pryzm/core-app-model';

import { SVGCompositeRenderer } from '@pryzm/file-format/sheets';

import { SheetEditorPanel } from '../SheetEditor/SheetEditorPanel';

// ── Fixture ────────────────────────────────────────────────────────────────

const SHEET_ID = 'sheet-l1630';
const PLAN_VIEW_ID = 'view-l1630-plan';
const ELEV_VIEW_ID = 'view-l1630-elev';
const SCALE = 100;

/**
 * Build a duck-typed OBC TechnicalDrawing whose linework lives in the OBC
 * drawing-space convention: X horizontal, **Z vertical**, Y ≡ 0 (the drawing
 * plane). This is the convention `TechnicalDrawingBounds` documents and
 * `SVGCompositeRenderer` reads, and it is the one the founder's correct PDF
 * is produced from.
 */
function makeDrawing(segments: Array<[number, number, number, number]>): unknown {
    const positions: number[] = [];
    for (const [x1, z1, x2, z2] of segments) {
        positions.push(x1, 0, z1, x2, 0, z2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const seg = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({ color: 0x1a1a1a }),
    );
    seg.userData['layer'] = 'A-WALL';

    const group = new THREE.Group();
    group.add(seg);

    return {
        three: group,
        // Empty layer map — poche is exercised by the export suite; this spec
        // pins the projection linework, which is the content the founder's
        // screenshot is missing.
        layers: new Map<string, unknown>(),
        viewports: new Map<string, unknown>(),
    };
}

/** A closed rectangle plus an interior partition — recognisably "a plan". */
const PLAN_SEGMENTS: Array<[number, number, number, number]> = [
    [0, 0, 10, 0],
    [10, 0, 10, 8],
    [10, 8, 0, 8],
    [0, 8, 0, 0],
    [4, 0, 4, 8],
];

/** A façade outline with a storey datum — recognisably "an elevation". */
const ELEV_SEGMENTS: Array<[number, number, number, number]> = [
    [0, 0, 12, 0],
    [12, 0, 12, -9],
    [12, -9, 0, -9],
    [0, -9, 0, 0],
    [0, -3, 12, -3],
    [0, -6, 12, -6],
];

function seedSheet(viewports: SheetDefinition['viewports']): void {
    // `restore()` is idempotent-by-id and returns early when the sheet already
    // exists. Without this delete, every case after the first silently re-reads
    // the FIRST case's sheet — which is how this spec initially "proved" that an
    // elevation viewport rendered a plan's linework. Delete, then restore.
    sheetStore.delete(SHEET_ID);
    sheetStore.restore({
        id: SHEET_ID,
        sheetNumber: 'A101',
        name: 'Ground Floor Plan',
        revision: 'A',
        viewports,
        titleBlock: undefined,
        dataPanels: [],
        metadata: {
            createdAt: Date.now(),
            modifiedAt: Date.now(),
            createdBy: 'test',
            version: 1,
        },
    } as unknown as SheetDefinition);
}

/** Reference: the linework the EXPORT surface produces for the same view. */
function exportLineCount(viewId: string, scale: number): number {
    const drawing = viewTechnicalDrawingCache.get(viewId);
    const renderer = new SVGCompositeRenderer({
        originX: 0,
        originZ: 0,
        widthMm: 120,
        heightMm: 90,
        scale,
    });
    renderer.setTechnicalDrawing(drawing as never);
    const svg = renderer.renderToSVGString();
    return (svg.match(/<line /g) ?? []).length;
}

let panel: SheetEditorPanel | null = null;

beforeEach(() => {
    document.body.innerHTML = '';
    viewTechnicalDrawingCache.clear();

    viewDefinitionStore.create({
        id: PLAN_VIEW_ID,
        name: 'Ground Floor',
        viewType: 'plan',
    });
    viewDefinitionStore.create({
        id: ELEV_VIEW_ID,
        name: 'North Elevation',
        viewType: 'elevation',
    });

    viewTechnicalDrawingCache.set(PLAN_VIEW_ID, makeDrawing(PLAN_SEGMENTS) as never);
    viewTechnicalDrawingCache.set(ELEV_VIEW_ID, makeDrawing(ELEV_SEGMENTS) as never);
});

afterEach(() => {
    try { panel?.close(); } catch { /* panel may already be closed */ }
    panel = null;
    document.body.innerHTML = '';
});

function openWith(viewId: string): HTMLElement {
    seedSheet([
        { id: 'vp-1', viewId, position: { x: 60, y: 200 }, scale: SCALE } as never,
    ]);
    panel = new SheetEditorPanel();
    panel.open(SHEET_ID);
    const vpEl = document.querySelector('.sh-viewport');
    expect(vpEl, 'the sheet editor rendered no .sh-viewport at all').toBeTruthy();
    return vpEl as HTMLElement;
}

// ── The assertions ─────────────────────────────────────────────────────────

describe('§SHEET-VIEWPORT-IS-A-RASTER-THUMBNAIL (L-1630) — plan views', () => {

    it('the on-sheet viewport carries VECTOR projection linework, not a raster surface', () => {
        const vpEl = openWith(PLAN_VIEW_ID);

        const svg = vpEl.querySelector('svg.sh-vp-composite');
        expect(
            svg,
            'the on-sheet viewport has no composite <svg> — the founder is looking at ' +
            'a bitmap thumbnail, which is exactly the reported defect',
        ).toBeTruthy();

        const lines = svg!.querySelectorAll('line');
        expect(lines.length, 'composite <svg> contains no <line> linework').toBeGreaterThan(0);
    });

    it('the on-sheet linework is THE SAME linework the export produces (one producer)', () => {
        const vpEl = openWith(PLAN_VIEW_ID);

        const onSheet = vpEl.querySelectorAll('svg.sh-vp-composite line').length;
        const onExport = exportLineCount(PLAN_VIEW_ID, SCALE);

        expect(onExport, 'reference (export) produced no linework — fixture is wrong').toBe(
            PLAN_SEGMENTS.length,
        );
        expect(
            onSheet,
            'the sheet and the export disagree about the same view at the same scale — ' +
            'that disagreement IS the founder\'s bug (C06 §13.3, one producer per surface)',
        ).toBe(onExport);
    });

    it('the viewport content is not a bitmap canvas once real linework is available', () => {
        const vpEl = openWith(PLAN_VIEW_ID);
        const canvas = vpEl.querySelector('canvas.sh-viewport-preview');
        expect(
            canvas,
            'a raster preview canvas is still mounted — the raster path was not replaced',
        ).toBeNull();
    });
});

describe('§SHEET-ELEVATION-NEVER-RENDERS (L-1631) — elevation views', () => {

    it('an elevation with a cached drawing renders its real linework on the sheet', () => {
        const vpEl = openWith(ELEV_VIEW_ID);

        const onSheet = vpEl.querySelectorAll('svg.sh-vp-composite line').length;
        const onExport = exportLineCount(ELEV_VIEW_ID, SCALE);

        expect(onExport, 'reference (export) produced no elevation linework').toBe(
            ELEV_SEGMENTS.length,
        );
        expect(
            onSheet,
            'the elevation renders nothing on the sheet while the export renders it fine',
        ).toBe(onExport);
    });

    it('the elevation is NOT reduced to a view-type badge placeholder', () => {
        const vpEl = openWith(ELEV_VIEW_ID);
        const canvas = vpEl.querySelector('canvas.sh-viewport-preview');
        expect(
            canvas,
            'the elevation fell back to the raster placeholder path (view-type badge)',
        ).toBeNull();
    });
});
