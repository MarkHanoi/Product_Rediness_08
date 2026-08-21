/**
 * §SHEET-VIEWPORT-INTERACTION (L-1854, L-1862..L-1866, L-1874, L-1875) — the sheet viewport as an
 * INTERACTIVE object: reachable, removable, scalable, croppable, navigable.
 *
 * THE FOUNDER'S REPORT (2026-08-21, production build 071a7b2c):
 *   "I placed a large east elevation that I was not able to remove because I
 *    could not reach the 'x' to close it — if the user clicks delete it should
 *    go away. […] I am not able to change the scale. […] When I select a view
 *    within the sheet I would like to be able to navigate in the view like if I
 *    am in the main scene, still being in the sheet / view interface […] also
 *    crop the view on demand as I do with the elevations in floor plan."
 *
 * WHY THIS SPEC MOUNTS THE PANEL
 *   [committed ≠ reachable]. Every sheet finding in this repo has been provable
 *   at a function return and still wrong at the surface. So this spec opens the
 *   real SheetEditorPanel against real stores and reads the DOM the founder
 *   clicks on — the geometry of the remove control, the key handler, the
 *   composed viewport size.
 *
 * THE FIXTURE IS THE FOUNDER'S OWN NUMBERS
 *   `ELEV_WITH_DATUM` reproduces the exact shape that produced
 *   `Viewport … is 8020×415mm at 1:50`: a 7 m façade PLUS the ±200 m level
 *   datum lines `LevelDatumLineBuilder` injects on `A-ANNO-LEVL`. 400 m of datum
 *   at 1:50 is 8000 mm of paper, and 8000 + 2×(0.5 m padding → 20 mm) = 8040 mm.
 *   That is the whole defect, expressed as a fixture.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import { sheetStore } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { viewTechnicalDrawingCache } from '@pryzm/core-app-model';
import { TechnicalDrawingBounds } from '@pryzm/core-app-model';
import type { SheetDefinition } from '@pryzm/core-app-model';

import { composeViewportSvg, composeForPlacement, viewportPaperRect } from '@pryzm/file-format/sheets';

import { SheetEditorPanel } from '../SheetEditor/SheetEditorPanel';

// ── Fixture ────────────────────────────────────────────────────────────────

const SHEET_ID = 'sheet-l1854';
const ELEV_VIEW_ID = 'view-l1854-elev';
const SCALE = 50;

interface Seg { x1: number; z1: number; x2: number; z2: number; layer: string }

/** Duck-typed OBC TechnicalDrawing: X horizontal, Z vertical, Y ≡ 0. */
function makeDrawing(segments: Seg[]): unknown {
    const group = new THREE.Group();
    // One LineSegments per layer — exactly how `addProjectionLines` deposits
    // them, and the only reason `userData.layer` can be read per-object.
    const byLayer = new Map<string, Seg[]>();
    for (const s of segments) {
        const arr = byLayer.get(s.layer) ?? [];
        arr.push(s);
        byLayer.set(s.layer, arr);
    }
    for (const [layer, segs] of byLayer) {
        const positions: number[] = [];
        for (const s of segs) positions.push(s.x1, 0, s.z1, s.x2, 0, s.z2);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x1a1a1a }));
        ls.userData['layer'] = layer;
        group.add(ls);
    }
    return {
        three: group,
        layers: new Map<string, unknown>(),
        viewports: new Map<string, unknown>(),
    };
}

/** A 7 m × 9 m façade on A-WALL. This is the CONTENT. */
const FACADE: Seg[] = [
    { x1: 0, z1: 0, x2: 7, z2: 0, layer: 'A-WALL' },
    { x1: 7, z1: 0, x2: 7, z2: -9, layer: 'A-WALL' },
    { x1: 7, z1: -9, x2: 0, z2: -9, layer: 'A-WALL' },
    { x1: 0, z1: -9, x2: 0, z2: 0, layer: 'A-WALL' },
];

/**
 * The founder's shape: façade + the ±200 m datum lines the builder injects.
 * `LevelDatumLineBuilder.HALF_EXTENT` is 200 and its own comment claims
 * "toDrawingSpace naturally clips to the drawing extent" — it does not.
 */
const ELEV_WITH_DATUM: Seg[] = [
    ...FACADE,
    { x1: -200, z1: 0, x2: 200, z2: 0, layer: 'A-ANNO-LEVL' },
    { x1: -200, z1: -3, x2: 200, z2: -3, layer: 'A-ANNO-LEVL' },
    { x1: -200, z1: -6, x2: 200, z2: -6, layer: 'A-ANNO-LEVL' },
];

/** Grid lines span ±100 m VERTICALLY (SectionGridLineBuilder.HALF_HEIGHT). */
const ELEV_WITH_GRID: Seg[] = [
    ...FACADE,
    { x1: 2, z1: -100, x2: 2, z2: 100, layer: 'S-GRID' },
];

function seedSheet(viewports: SheetDefinition['viewports']): void {
    sheetStore.delete(SHEET_ID);
    sheetStore.restore({
        id: SHEET_ID,
        sheetNumber: 'A201',
        name: 'Elevations',
        revision: 'A',
        viewports,
        titleBlock: undefined,
        dataPanels: [],
        metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 'test', version: 1 },
    } as unknown as SheetDefinition);
}

interface ExecutableCommand {
    canExecute?: (ctx: unknown) => { ok: boolean; reason?: string };
    execute: (ctx: unknown) => unknown;
}

let panel: SheetEditorPanel | null = null;

beforeEach(() => {
    document.body.innerHTML = '';
    viewTechnicalDrawingCache.clear();
    window.__pryzmInitComplete = true;
    window.commandManager = {
        execute: (cmd: unknown) => {
            const c = cmd as ExecutableCommand;
            const check = c.canExecute?.({});
            if (check && !check.ok) return { success: false, error: check.reason };
            return c.execute({});
        },
    } as unknown as typeof window.commandManager;

    viewDefinitionStore.create({
        id: ELEV_VIEW_ID,
        name: 'East Elevation',
        viewType: 'elevation',
    });
});

afterEach(() => {
    try { panel?.close(); } catch { /* already closed */ }
    panel = null;
    document.body.innerHTML = '';
});

function openWith(drawing: Seg[], vpPatch: Record<string, unknown> = {}): HTMLElement {
    viewTechnicalDrawingCache.set(ELEV_VIEW_ID, makeDrawing(drawing) as never);
    seedSheet([
        { id: 'vp-1', viewId: ELEV_VIEW_ID, position: { x: 40, y: 120 }, scale: SCALE, ...vpPatch } as never,
    ]);
    panel = new SheetEditorPanel();
    panel.open(SHEET_ID);
    const vpEl = document.querySelector('.sh-viewport');
    expect(vpEl, 'the sheet editor rendered no .sh-viewport at all').toBeTruthy();
    return vpEl as HTMLElement;
}

// ── A. Drawing furniture must not define content bounds ────────────────────

describe('§SHEET-BOUNDS-EXCLUDE-FURNITURE (L-1854)', () => {
    it('level datum lines on A-ANNO-LEVL do not inflate the content bounds', () => {
        viewTechnicalDrawingCache.set(ELEV_VIEW_ID, makeDrawing(ELEV_WITH_DATUM) as never);
        const bounds = TechnicalDrawingBounds.compute(
            viewTechnicalDrawingCache.get(ELEV_VIEW_ID) as never,
        );
        expect(bounds, 'a façade plus datum lines must still have bounds').toBeTruthy();
        // The façade is 7 m wide. The datum lines are 400 m wide. If the bounds
        // report anything near 400 the furniture is being measured as content.
        expect(bounds!.widthM).toBeCloseTo(7, 3);
        expect(bounds!.heightM).toBeCloseTo(9, 3);
    });

    it('vertical grid lines on S-GRID do not inflate the content bounds', () => {
        viewTechnicalDrawingCache.set(ELEV_VIEW_ID, makeDrawing(ELEV_WITH_GRID) as never);
        const bounds = TechnicalDrawingBounds.compute(
            viewTechnicalDrawingCache.get(ELEV_VIEW_ID) as never,
        );
        expect(bounds!.heightM).toBeCloseTo(9, 3);
    });

    it('a drawing that is ONLY furniture reports no content bounds, not a 400 m frame', () => {
        viewTechnicalDrawingCache.set(
            ELEV_VIEW_ID,
            makeDrawing(ELEV_WITH_DATUM.filter(s => s.layer === 'A-ANNO-LEVL')) as never,
        );
        expect(
            TechnicalDrawingBounds.compute(viewTechnicalDrawingCache.get(ELEV_VIEW_ID) as never),
            'furniture alone is not content — "no drawing yet" and "a 400 m drawing" are different facts',
        ).toBeNull();
    });

    it('the composed viewport fits an A0 sheet at 1:50 (the founder read 8020mm)', () => {
        viewTechnicalDrawingCache.set(ELEV_VIEW_ID, makeDrawing(ELEV_WITH_DATUM) as never);
        const composed = composeViewportSvg({ viewId: ELEV_VIEW_ID, scale: SCALE });
        expect(composed.resolved).toBe(true);
        // (7 m + 2×0.5 m padding) × 1000 / 50 = 160 mm.
        expect(composed.widthMm).toBeLessThan(1189);
        expect(composed.widthMm).toBeCloseTo(160, 1);
    });
});

// ── A2. Deletion must always be reachable ──────────────────────────────────

describe('§SHEET-VIEWPORT-ALWAYS-REMOVABLE (L-1862)', () => {
    it('the remove control stays inside the sheet canvas even for an oversized viewport', () => {
        // Force the oversize case regardless of the bounds fix, by cropping to a
        // 400 m frame explicitly. A crop is an exact statement, so this viewport
        // is genuinely 8000 mm wide and its × would sit ~7 sheet-widths away.
        const vpEl = openWith(ELEV_WITH_DATUM, {
            crop: { minX: -200, minZ: -9, maxX: 200, maxZ: 0 },
        });
        const canvasEl = document.querySelector('.sh-canvas') as HTMLElement;
        expect(canvasEl).toBeTruthy();

        const canvasW = parseFloat(canvasEl.style.width);
        const vpLeft = parseFloat(vpEl.style.left);
        const vpWidth = parseFloat(vpEl.style.width);
        expect(vpWidth, 'fixture must actually overflow, or this test proves nothing')
            .toBeGreaterThan(canvasW);

        const removeBtn = vpEl.querySelector('.sh-viewport-remove') as HTMLElement;
        expect(removeBtn, 'no remove control at all').toBeTruthy();
        // `right` is measured from the viewport's right edge, so the control's
        // absolute x is vpLeft + vpWidth − right. It must land on the paper.
        const rightOffset = parseFloat(removeBtn.style.right || '3');
        const absX = vpLeft + vpWidth - rightOffset;
        expect(absX, `remove control sits at x=${absX}px on a ${canvasW}px canvas — unreachable`)
            .toBeLessThanOrEqual(canvasW);
        expect(absX).toBeGreaterThanOrEqual(0);
    });

    it('Delete removes the selected viewport', () => {
        const vpEl = openWith(FACADE);
        vpEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(sheetStore.get(SHEET_ID)!.viewports).toHaveLength(1);

        const canvasEl = document.querySelector('.sh-canvas') as HTMLElement;
        canvasEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

        expect(
            sheetStore.get(SHEET_ID)!.viewports,
            'Delete on a selected viewport left it on the sheet',
        ).toHaveLength(0);
    });

    it('Backspace removes the selected viewport too', () => {
        const vpEl = openWith(FACADE);
        vpEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const canvasEl = document.querySelector('.sh-canvas') as HTMLElement;
        canvasEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
        expect(sheetStore.get(SHEET_ID)!.viewports).toHaveLength(0);
    });
});

// ── B. Scale is changeable from the properties panel ───────────────────────

describe('§SHEET-VIEWPORT-SCALE-IS-LIVE (L-1863)', () => {
    it('choosing a preset scale in the sidebar re-composes the viewport at that scale', () => {
        const vpEl = openWith(FACADE);
        vpEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        const widthBefore = parseFloat(
            (document.querySelector('.sh-viewport') as HTMLElement).style.width,
        );

        const select = Array.from(document.querySelectorAll('.sh-sidebar select'))
            .find(s => Array.from((s as HTMLSelectElement).options)
                .some(o => o.textContent === '1:100')) as HTMLSelectElement | undefined;
        expect(select, 'no scale <select> in the Selected Viewport section').toBeTruthy();

        select!.value = '100';
        select!.dispatchEvent(new Event('change', { bubbles: true }));

        expect(sheetStore.get(SHEET_ID)!.viewports[0]!.scale).toBe(100);

        const widthAfter = parseFloat(
            (document.querySelector('.sh-viewport') as HTMLElement).style.width,
        );
        // 1:100 is half the paper size of 1:50. If the DOM did not follow the
        // store, the founder's "I am not able to change the scale" is what he
        // sees even though the command landed.
        expect(widthAfter, `viewport width unchanged (${widthBefore} → ${widthAfter})`)
            .toBeLessThan(widthBefore);
    });

    it('the properties panel reports the VIEW, not just the placement', () => {
        const vpEl = openWith(FACADE);
        vpEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const sidebarText = (document.querySelector('.sh-sidebar') as HTMLElement).textContent ?? '';
        expect(sidebarText).toContain('East Elevation');
        expect(sidebarText).toContain('elevation');
    });
});

// ── C. Crop is dispatchable from the sheet ─────────────────────────────────

describe('§SHEET-VIEWPORT-CROP-UI (L-1864)', () => {
    it('the sidebar exposes crop fields that dispatch SetViewportCropCommand', () => {
        const vpEl = openWith(ELEV_WITH_DATUM);
        vpEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        const cropInputs = Array.from(
            document.querySelectorAll('.sh-sidebar input[data-crop-field]'),
        ) as HTMLInputElement[];
        expect(cropInputs.length, 'no crop fields in the Selected Viewport section').toBe(4);

        const byField = (f: string) =>
            cropInputs.find(i => i.dataset['cropField'] === f)!;
        byField('minX').value = '0';
        byField('maxX').value = '5';
        byField('minZ').value = '-9';
        byField('maxZ').value = '0';
        byField('maxZ').dispatchEvent(new Event('change', { bubbles: true }));

        const crop = sheetStore.get(SHEET_ID)!.viewports[0]!.crop;
        expect(crop, 'crop fields did not reach the store').toBeTruthy();
        expect(crop!.maxX - crop!.minX).toBeCloseTo(5, 3);
    });

    it('a crop set on the sheet frames the composed drawing exactly', () => {
        openWith(ELEV_WITH_DATUM, { crop: { minX: 1, minZ: -8, maxX: 6, maxZ: -1 } });
        const composed = composeViewportSvg({
            viewId: ELEV_VIEW_ID,
            scale: SCALE,
            cropWorldM: { minX: 1, minZ: -8, maxX: 6, maxZ: -1 },
        });
        expect(composed.cropped).toBe(true);
        expect(composed.widthMm).toBeCloseTo(5 * 1000 / SCALE, 3);
        expect(composed.heightMm).toBeCloseTo(7 * 1000 / SCALE, 3);
    });
});

// ── Navigation inside an activated viewport ────────────────────────────────

describe('§SHEET-NAVIGATE-INSIDE-THE-VIEWPORT (L-1865)', () => {
    it('double-clicking a 2D viewport keeps the sheet open', () => {
        const vpEl = openWith(FACADE);
        vpEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        expect(
            document.querySelector('.sh-overlay'),
            'double-click left the sheet editor — the founder explicitly rejected that',
        ).toBeTruthy();
    });

    it('wheel inside an activated viewport zooms the drawing, not the sheet', () => {
        const vpEl = openWith(FACADE);
        vpEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

        const cam = document.querySelector('.sh-vp-cam-container') as HTMLElement;
        expect(cam, 'no per-viewport camera container after activation').toBeTruthy();
        const before = cam.style.transform;

        const content = document.querySelector('.sh-vp-content') as HTMLElement;
        content.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));

        const after = (document.querySelector('.sh-vp-cam-container') as HTMLElement).style.transform;
        expect(after, `viewport camera did not change (${before})`).not.toBe(before);
    });
});

// ── D. The PDF must place the viewport where the sheet put it ──────────────

describe('§SHEET-PDF-PLACES-THE-VIEWPORT (L-1874)', () => {
    it('SheetViewport.position is the BOTTOM-LEFT CORNER, and the panel renders it there', () => {
        const vpEl = openWith(FACADE);
        const canvasEl = document.querySelector('.sh-canvas') as HTMLElement;
        const canvasH = parseFloat(canvasEl.style.height);

        // The panel's scale factor is not exposed, so recover it from the paper:
        // the canvas is `paperW × sf` px wide for an A0-family title block.
        const composed = composeViewportSvg({ viewId: ELEV_VIEW_ID, scale: SCALE });
        const rect = viewportPaperRect({ position: { x: 40, y: 120 } }, composed);
        expect(rect.leftMm).toBe(40);
        expect(rect.bottomMm).toBe(120);

        const leftPx = parseFloat(vpEl.style.left);
        const topPx = parseFloat(vpEl.style.top);
        const heightPx = parseFloat(vpEl.style.height);
        const sf = leftPx / rect.leftMm;

        // Bottom edge in paper millimetres, recovered from the DOM. The footer
        // strip is in pixels and cancels out of this difference, which is why
        // the comparison is done on the bottom edge rather than the top.
        const bottomMmFromDom = (canvasH - topPx - heightPx) / sf;
        expect(
            bottomMmFromDom,
            'the panel does not render position.y as the bottom-left corner',
        ).toBeCloseTo(rect.bottomMm, 4);
    });

    it('composeForPlacement honours the viewport crop that PdfExportService used to drop', () => {
        viewTechnicalDrawingCache.set(ELEV_VIEW_ID, makeDrawing(ELEV_WITH_DATUM) as never);
        const crop = { minX: 1, minZ: -8, maxX: 6, maxZ: -1 };
        const withCrop = composeForPlacement({ viewId: ELEV_VIEW_ID, scale: SCALE, crop });
        const withoutCrop = composeForPlacement({ viewId: ELEV_VIEW_ID, scale: SCALE });

        expect(withCrop.cropped, 'the crop was silently dropped').toBe(true);
        expect(withoutCrop.cropped).toBe(false);
        // 5 m at 1:50 = 100 mm. If the export composed without the crop it would
        // lay the viewport out at the full content width instead — a different
        // size AND different content from what the sheet shows.
        expect(withCrop.widthMm).toBeCloseTo(100, 3);
        expect(withCrop.widthMm).not.toBeCloseTo(withoutCrop.widthMm, 3);
    });

    it('a viewport composed for the sheet and for the page has ONE size', () => {
        viewTechnicalDrawingCache.set(ELEV_VIEW_ID, makeDrawing(ELEV_WITH_DATUM) as never);
        const vp = { viewId: ELEV_VIEW_ID, scale: SCALE, crop: { minX: 0, minZ: -9, maxX: 7, maxZ: 0 } };
        // Guard against a vacuous pass: with no cached drawing BOTH sides return
        // the same unresolved default and the equality proves nothing.
        expect(composeForPlacement(vp).resolved).toBe(true);
        const onSheet = composeSheetViewportEquivalent(vp);
        const onPage = composeForPlacement(vp);
        expect(onPage.widthMm).toBeCloseTo(onSheet.widthMm, 4);
        expect(onPage.heightMm).toBeCloseTo(onSheet.heightMm, 4);
        expect(onPage.lineCount).toBe(onSheet.lineCount);
    });
});

/**
 * What `SheetEditorRendererBridge.composeSheetViewport` does, restated here so
 * the equality above is between two INDEPENDENT expressions of the rule rather
 * than a function compared with itself.
 */
function composeSheetViewportEquivalent(
    vp: { viewId: string; scale?: number; crop?: { minX: number; minZ: number; maxX: number; maxZ: number } },
) {
    return composeViewportSvg({
        viewId: vp.viewId,
        scale: vp.scale ?? 100,
        ...(vp.crop ? { cropWorldM: vp.crop } : {}),
    });
}
