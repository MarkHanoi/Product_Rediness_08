/**
 * SheetEditorRendererBridge — canvas drawing and viewport-focus helpers.
 *
 * Wave 7 WS-B (S85-WIRE): extracted from SheetEditorPanel.ts.
 *
 * Pure functions (no `this` dependency) wherever possible; where the panel's
 * mutable focus-state is needed the caller passes a `FocusOpts` context bag.
 *
 * §06: No platform-layer imports.
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { sheetStore } from '@pryzm/core-app-model';
import type { SheetViewport } from '@pryzm/core-app-model';
import type { ViewDefinition } from '@pryzm/core-app-model';
import { viewportPreviewRenderer } from '@pryzm/core-app-model';
import { viewportThumbnailRenderer } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
// §SHEET-ONE-SCALE-RESOLUTION (L-10682) — the label and the geometry read the
// SAME default. They used to read 50 and 100 respectively.
import { resolveViewportScale } from '@pryzm/core-app-model';
import { UpdateViewportScaleCommand } from '@pryzm/command-registry';
// §SHEET-COMPOSITE-ON-SHEET (L-1630) — THE producer of "a view on a sheet".
// Deliberately the subpath, not the root barrel: the root drags jsPDF, jszip,
// pdfjs-dist and web-ifc, and the sheet editor is a lazily-loaded chunk.
import { composeViewportSvg, type ComposedViewportSvg } from '@pryzm/file-format/sheets';
import type { VpFocusState, FocusOpts } from './SheetEditorContracts';
import type { SheetProjectionStatus } from './SheetProjectionOrchestrator';

// ── SC-3: Grid overlay ────────────────────────────────────────────────────

export function drawGridOverlay(
    gc:        HTMLCanvasElement,
    visible:   boolean,
    snapMm:    number,
    sf:        number,
): void {
    const ctx = gc.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, gc.width, gc.height);
    if (!visible) return;
    const step = snapMm * sf;
    ctx.strokeStyle = 'rgba(103,65,217,0.18)';
    ctx.lineWidth   = 0.5;
    for (let x = 0; x < gc.width;  x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, gc.height); ctx.stroke(); }
    for (let y = 0; y < gc.height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(gc.width, y); ctx.stroke(); }
}

// ── §SHEET-COMPOSITE-ON-SHEET (L-1630): the REAL view on the sheet ────────

/** CSS class marking the composed vector drawing inside a sheet viewport. */
export const COMPOSITE_SVG_CLASS = 'sh-vp-composite';

/**
 * Compose the real drawing for `vp` — the same composition the PDF/print
 * exporters consume (C06 §13.3, one producer per surface).
 *
 * Thin, deliberate: this exists so the panel never reaches past the composer
 * into `SVGCompositeRenderer` itself. The moment a second call site starts
 * assembling its own viewBox, the sheet and the export begin to disagree again —
 * which is precisely the defect L-1630 closes.
 */
export function composeSheetViewport(
    vp: Pick<SheetViewport, 'viewId' | 'crop'> & { scale?: number },
): ComposedViewportSvg {
    return composeViewportSvg({
        viewId: vp.viewId,
        scale:  resolveViewportScale(vp, viewDefinitionStore.get(vp.viewId)),
        // §SHEET-VIEWPORT-CROP (L-1840) — the crop rides the SAME producer as the
        // drawing itself, which is the whole reason it is safe: the sheet, the PDF
        // and the print layer cannot disagree about what the crop shows, because
        // there is only one place that knows how a crop becomes a viewBox.
        ...(vp.crop ? { cropWorldM: vp.crop } : {}),
    });
}

/**
 * Mount a composed viewport SVG into `hostEl` as live vector DOM.
 *
 * ⚠ VECTOR, NOT A BIGGER BITMAP. The founder's complaint — "the view I place is
 * NOT the real view … I need the real view, not an image" — is not solved by
 * raising a thumbnail's pixel count. A 1:100 plan on A0 has to stay crisp under
 * arbitrary zoom, and only real `<line>` elements do that. So the SVG is parsed
 * and adopted into the document, never rasterised and never referenced through
 * an `<img src="data:...">` (which would re-raster at paint time and, being a
 * replaced element, would also be opaque to selection and hit-testing later).
 *
 * Returns false when there is nothing real to show, so the caller can fall back
 * to the honest placeholder rather than mounting an empty frame.
 */
export function mountCompositeViewport(
    hostEl:   HTMLElement,
    composed: ComposedViewportSvg,
): boolean {
    if (!composed.resolved || !composed.svg) return false;

    let svgEl: SVGSVGElement | null = null;
    try {
        const doc = new DOMParser().parseFromString(composed.svg, 'image/svg+xml');
        if (doc.getElementsByTagName('parsererror').length > 0) return false;
        const root = doc.documentElement;
        if (!root || root.nodeName.toLowerCase() !== 'svg') return false;
        svgEl = document.importNode(root, true) as unknown as SVGSVGElement;
    } catch (err) {
        console.warn('[SheetEditorRendererBridge] composite SVG parse failed:', err);
        return false;
    }

    if (!svgEl) return false;

    svgEl.classList.add(COMPOSITE_SVG_CLASS);
    // The composer sizes in paper millimetres and the host box is already the
    // millimetre box scaled to screen, so the SVG fills it 1:1. `meet` is kept
    // as the safety net: if the two ever disagree the drawing letterboxes
    // rather than silently distorting, and a distorted drawing is a wrong
    // drawing, not a cosmetic defect.
    svgEl.setAttribute('width',  '100%');
    svgEl.setAttribute('height', '100%');
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svgEl.style.display = 'block';

    hostEl.querySelectorAll(`.${COMPOSITE_SVG_CLASS}`).forEach(el => el.remove());
    hostEl.appendChild(svgEl);
    return true;
}

// ── Background-projection helpers ─────────────────────────────────────────

/**
 * Handles 'svp:drawing-refreshed' events fired by ViewController after a
 * background projection completes.
 */
export function onDrawingRefreshed(
    e:              Event,
    activeSheetId:  string | null,
    previewCanvases: Map<string, { viewId: string; canvas: HTMLCanvasElement }>,
    renderFn:       typeof renderThumbnail,
): void {
    const viewId = (e as CustomEvent).detail?.viewId as string | undefined;
    if (!viewId || !activeSheetId) return;

    const sheet = sheetStore.get(activeSheetId);
    if (!sheet) return;

    for (const [vpId, { viewId: cachedViewId, canvas }] of previewCanvases) {
        if (cachedViewId !== viewId) continue;
        const vp = sheet.viewports.find(v => v.id === vpId);
        if (!vp) continue;
        console.log(`[SheetEditorRendererBridge] Drawing refreshed for viewId=${viewId} — updating thumbnail`);
        renderFn(vp, viewId, canvas);
    }
}

/**
 * Renders a TechnicalDrawing thumbnail for `vp` into `canvas`.
 * Falls back to viewportPreviewRenderer if capture fails.
 */
export function renderThumbnail(
    vp:     SheetViewport,
    viewId: string,
    canvas: HTMLCanvasElement,
): void {
    const view = viewDefinitionStore.get(viewId);

    // D.7.5 batch #2: routed through getFrameScheduler() instead of raw rAF.
    getFrameScheduler().scheduleOnce('sheet-editor-thumbnail-capture', () => {
        viewportThumbnailRenderer.captureThumbnail(
            vp,
            canvas.width,
            canvas.height,
        ).then((bitmap) => {
            if (!bitmap) {
                if (view) viewportPreviewRenderer.attach(view, canvas);
                return;
            }
            const ctx = canvas.getContext('2d');
            if (!ctx) { bitmap.close(); return; }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            bitmap.close();
            console.log(`[SheetEditorRendererBridge] Thumbnail rendered viewId=${viewId}`);
        }).catch((err) => {
            console.warn('[SheetEditorRendererBridge] Thumbnail capture failed:', err);
            if (view) viewportPreviewRenderer.attach(view, canvas);
        });
    });
}

/**
 * Draws the projection state of a sheet viewport that has no drawing yet.
 *
 * ⚠ §SHEET-INACTIVE-VIEW-NEVER-PROJECTS (L-1841) — this function used to take
 * no state at all. It unconditionally painted *"Generating projection…"* over a
 * progress bar hard-coded to **40%** (`fillRect(…, w * 0.7 * 0.4, 3)`) — a
 * number that came from nowhere, tracked nothing, and could never advance. It
 * was called for EVERY projectable viewport without a cached drawing, including
 * the overwhelmingly common case where no projection had been requested and
 * none ever would be. That is the founder's frozen bar, and it is
 * [context-data-honesty] exactly: "not requested", "in flight" and "failed"
 * rendered as the same pixels.
 *
 * The progress bar is now drawn ONLY for `'in-flight'`, and even then as an
 * INDETERMINATE track rather than a fake percentage — nothing here can measure
 * projection progress, so nothing here may imply it. Every terminal state gets
 * its own words and its own colour, and no bar at all.
 */
export function drawProjectingState(
    canvas:   HTMLCanvasElement,
    viewType: string,
    status:   SheetProjectionStatus,
): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Terminal-negative states get a distinct wash so they do not read as
    // "nearly done" at a glance on a busy sheet.
    const isProblem = status === 'failed' || status === 'unavailable';
    ctx.fillStyle = isProblem ? '#fdf6f6' : '#f4f7fb';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = isProblem ? '#eccfcf' : '#d5dce8';
    ctx.lineWidth   = 0.5;
    const step = 16;
    for (let x = -h; x < w + h; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + h, h);
        ctx.stroke();
    }

    const iconText = viewType === 'elevation' ? '↕' : viewType === 'section' ? '✂' : '⊞';
    ctx.font          = `${Math.round(h * 0.28)}px sans-serif`;
    ctx.fillStyle     = isProblem ? '#e0b4b4' : '#b0bdc8';
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';
    ctx.fillText(iconText, w / 2, h * 0.42);

    let label: string;
    let labelColor: string;
    switch (status) {
        case 'in-flight':
            label = 'Generating projection…'; labelColor = '#8898aa'; break;
        case 'no-geometry':
            label = 'Nothing visible in this view'; labelColor = '#8898aa'; break;
        case 'unavailable':
            label = 'Projection unavailable'; labelColor = '#b4564f'; break;
        case 'failed':
            label = 'Projection failed'; labelColor = '#b4564f'; break;
        case 'ready':
            // The drawing landed between the request and this paint. The next
            // canvas rebuild composes it; say nothing misleading meanwhile.
            label = 'Loading drawing…'; labelColor = '#8898aa'; break;
        default:
            label = 'No drawing for this view'; labelColor = '#8898aa'; break;
    }

    ctx.font      = `${Math.max(9, Math.round(h * 0.1))}px sans-serif`;
    ctx.fillStyle = labelColor;
    ctx.fillText(label, w / 2, h * 0.64);

    // A bar ONLY while work is genuinely in flight, and indeterminate: a track
    // with a fixed-width shuttle whose position is derived from the clock, so
    // it never claims a completion fraction it cannot know.
    if (status === 'in-flight') {
        const trackX = w * 0.15;
        const trackW = w * 0.7;
        ctx.fillStyle = '#c4d4e8';
        ctx.fillRect(trackX, h - 6, trackW, 3);

        const shuttleW = trackW * 0.25;
        const phase    = (Date.now() % 1800) / 1800;              // 0‥1
        const travel   = (trackW - shuttleW) * (phase < 0.5 ? phase * 2 : (1 - phase) * 2);
        ctx.fillStyle  = '#4b7cf3';
        ctx.fillRect(trackX + travel, h - 6, shuttleW, 3);
    }
}

// ── SC-11: Dimension annotations ──────────────────────────────────────────

/**
 * Render dimension annotations onto the SVG overlay.
 * Fully replaces the SVG content on each call.
 */
export function renderDimAnnotations(
    svgEl:      SVGSVGElement,
    _canvasW:   number,
    _canvasH:   number,
    focusState: VpFocusState | null,
): void {
    if (!focusState) return;
    const svgNS = 'http://www.w3.org/2000/svg';

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

    const defs   = document.createElementNS(svgNS, 'defs');
    const marker = document.createElementNS(svgNS, 'marker');
    marker.setAttribute('id',           'sc11-dim-arrow');
    marker.setAttribute('markerWidth',  '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('refX',         '3');
    marker.setAttribute('refY',         '3');
    marker.setAttribute('orient',       'auto');
    const arrowPoly = document.createElementNS(svgNS, 'polygon');
    arrowPoly.setAttribute('points', '0,0 6,3 0,6');
    arrowPoly.setAttribute('fill',   '#ef4444');
    marker.appendChild(arrowPoly);
    defs.appendChild(marker);
    svgEl.appendChild(defs);

    for (const ann of focusState.annotations) {
        const g    = document.createElementNS(svgNS, 'g');
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', String(ann.x1)); line.setAttribute('y1', String(ann.y1));
        line.setAttribute('x2', String(ann.x2)); line.setAttribute('y2', String(ann.y2));
        line.setAttribute('stroke', '#ef4444'); line.setAttribute('stroke-width', '1.5');
        line.setAttribute('marker-start', 'url(#sc11-dim-arrow)');
        line.setAttribute('marker-end',   'url(#sc11-dim-arrow)');
        g.appendChild(line);

        const dx = ann.x2 - ann.x1; const dy = ann.y2 - ann.y1;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = -dy / len; const ny = dx / len;
        const tick = 5;
        [[ann.x1, ann.y1], [ann.x2, ann.y2]].forEach(([cx, cy]) => {
            const t = document.createElementNS(svgNS, 'line');
            t.setAttribute('x1', String(cx + nx * tick)); t.setAttribute('y1', String(cy + ny * tick));
            t.setAttribute('x2', String(cx - nx * tick)); t.setAttribute('y2', String(cy - ny * tick));
            t.setAttribute('stroke', '#ef4444'); t.setAttribute('stroke-width', '1.5');
            g.appendChild(t);
        });

        const mx = (ann.x1 + ann.x2) / 2; const my = (ann.y1 + ann.y2) / 2;
        const labelW = Math.max(30, ann.label.length * 5.5 + 8);

        const bg = document.createElementNS(svgNS, 'rect');
        bg.setAttribute('x', String(mx - labelW / 2)); bg.setAttribute('y', String(my - 9));
        bg.setAttribute('width', String(labelW));       bg.setAttribute('height', '14');
        bg.setAttribute('fill', 'rgba(255,255,255,0.92)'); bg.setAttribute('rx', '3');
        g.appendChild(bg);

        const txt = document.createElementNS(svgNS, 'text');
        txt.setAttribute('x', String(mx)); txt.setAttribute('y', String(my + 4));
        txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('font-size', '9');
        txt.setAttribute('fill', '#b91c1c'); txt.setAttribute('font-weight', '700');
        txt.setAttribute('font-family', 'monospace, sans-serif');
        txt.textContent = ann.label;
        g.appendChild(txt);

        svgEl.appendChild(g);
    }

    if (focusState.dimPoints.length === 1) {
        const pt  = focusState.dimPoints[0];
        const dot = document.createElementNS(svgNS, 'circle');
        dot.setAttribute('cx', String(pt.x)); dot.setAttribute('cy', String(pt.y));
        dot.setAttribute('r', '5');
        dot.setAttribute('fill', '#ef4444'); dot.setAttribute('stroke', '#fff');
        dot.setAttribute('stroke-width', '2');
        svgEl.appendChild(dot);
    }
}

// ── SC-11: Focus toolbar ──────────────────────────────────────────────────

export function buildFocusToolbar(
    vp:           SheetViewport,
    view:         ViewDefinition,
    svgEl:        SVGSVGElement,
    previewCanvas: HTMLCanvasElement,
    camContainer: HTMLDivElement,
    opts:         FocusOpts,
): HTMLElement {
    const fstate = opts.focusState;
    const pW = previewCanvas.width;
    const pH = previewCanvas.height;

    const toolbar = document.createElement('div');
    toolbar.className = 'sh-focus-toolbar';

    const lbl = document.createElement('span');
    lbl.className   = 'sh-focus-toolbar-label';
    lbl.textContent = `✏ ${view.name}`;
    toolbar.appendChild(lbl);

    // Pan tool
    const panBtn = document.createElement('button');
    panBtn.type      = 'button';
    panBtn.className = 'sh-focus-toolbar-btn' +
        (fstate.activeTool === 'select' ? ' sh-focus-toolbar-btn--active' : '');
    panBtn.textContent = '🖐 Pan';
    panBtn.title = 'Drag inside the viewport to pan  •  Scroll to zoom';
    panBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fstate.activeTool = 'select';
        fstate.dimPoints  = [];
        panBtn.classList.add   ('sh-focus-toolbar-btn--active');
        dimBtn.classList.remove('sh-focus-toolbar-btn--active');
        svgEl.classList.remove ('sh-vp-dim-svg--dim-tool');
        opts.renderDim(svgEl, pW, pH, fstate);
    });
    toolbar.appendChild(panBtn);

    // Dimension tool
    const dimBtn = document.createElement('button');
    dimBtn.type      = 'button';
    dimBtn.className = 'sh-focus-toolbar-btn' +
        (fstate.activeTool === 'dimension' ? ' sh-focus-toolbar-btn--active' : '');
    dimBtn.textContent = '📏 Dim';
    dimBtn.title = 'Click two points to place a dimension annotation';
    dimBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fstate.activeTool = 'dimension';
        fstate.dimPoints  = [];
        dimBtn.classList.add   ('sh-focus-toolbar-btn--active');
        panBtn.classList.remove('sh-focus-toolbar-btn--active');
        svgEl.classList.add    ('sh-vp-dim-svg--dim-tool');
    });
    toolbar.appendChild(dimBtn);

    // Fit / reset camera
    const fitBtn = document.createElement('button');
    fitBtn.type      = 'button';
    fitBtn.className = 'sh-focus-toolbar-btn';
    fitBtn.textContent = '⊙ Fit';
    fitBtn.title = 'Reset pan and zoom to fit the viewport';
    fitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // §SHEET-NAVIGATE-INSIDE-THE-VIEWPORT (L-1865) — reset through the
        // controller, never by writing the CSS back to identity. The transform
        // is a RENDERING of the camera; zeroing the rendering while the camera
        // still holds a pan is how a "Fit" button starts lying on the next
        // rebuild.
        opts.resetCamera();
        camContainer.style.transform = 'translate(0px,0px) scale(1)';
    });
    toolbar.appendChild(fitBtn);

    // Clear annotations
    const clearBtn = document.createElement('button');
    clearBtn.type      = 'button';
    clearBtn.className = 'sh-focus-toolbar-btn';
    clearBtn.textContent = '🗑 Clear';
    clearBtn.title = 'Remove all dimension annotations from this viewport';
    clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fstate.annotations = [];
        fstate.dimPoints   = [];
        opts.renderDim(svgEl, pW, pH, fstate);
    });
    toolbar.appendChild(clearBtn);

    // Scale selector
    const sheet = opts.activeSheetId ? sheetStore.get(opts.activeSheetId) : null;
    if (sheet) {
        const SCALES = [5, 10, 20, 25, 50, 100, 200, 500, 1000] as const;
        const scaleSel = document.createElement('select');
        scaleSel.className = 'sh-focus-toolbar-scale';
        scaleSel.title     = 'Change viewport scale';
        for (const s of SCALES) {
            const opt = document.createElement('option');
            opt.value       = String(s);
            opt.textContent = `1:${s}`;
            if (s === vp.scale) opt.selected = true;
            scaleSel.appendChild(opt);
        }
        scaleSel.addEventListener('change', (e) => {
            e.stopPropagation();
            const newScale = parseInt((e.target as HTMLSelectElement).value, 10);
            if (!isNaN(newScale)) {
                const cmd = new UpdateViewportScaleCommand(sheet.id, vp.id, newScale);
                const mgr = window.commandManager; // TODO(E.5.x): replace with runtime.bus.executeCommand — Phase E.5.x
                if (mgr) mgr.execute(cmd, { source: 'HUMAN_DIRECT' });
                fstate.scaleDenom = newScale;
            }
        });
        toolbar.appendChild(scaleSel);
    }

    // Done
    const doneBtn = document.createElement('button');
    doneBtn.type      = 'button';
    doneBtn.className = 'sh-focus-toolbar-btn sh-focus-toolbar-btn--done';
    doneBtn.textContent = '✓ Done';
    doneBtn.title = 'Exit viewport editing mode  (Esc)';
    doneBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.exitFocusMode();
    });
    toolbar.appendChild(doneBtn);

    return toolbar;
}

// ── SC-11: Focus interaction ───────────────────────────────────────────────

/**
 * Attach pan/zoom/dimension mouse handlers to the focused viewport's content element.
 * Stores a cleanup function via `opts.setFocusCleanup()` so `_exitViewportFocusMode`
 * can remove the document-level listeners.
 */
export function attachFocusInteraction(
    contentEl:    HTMLElement,
    camContainer: HTMLDivElement,
    svgEl:        SVGSVGElement,
    canvasW:      number,
    canvasH:      number,
    opts:         FocusOpts,
): void {
    const fstate = opts.focusState;

    const applyTransform = () => {
        const { panPx, zoom } = opts.getCamera();
        camContainer.style.transform =
            `translate(${panPx.x}px,${panPx.y}px) scale(${zoom})`;
    };

    let panStart: { mx: number; my: number; ox: number; oy: number } | null = null;

    const onMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return;
        if (fstate.activeTool !== 'select') return;
        e.stopPropagation();
        const cam = opts.getCamera();
        panStart = { mx: e.clientX, my: e.clientY, ox: cam.panPx.x, oy: cam.panPx.y };
        contentEl.style.cursor = 'grabbing';
    };

    const onMouseMove = (e: MouseEvent) => {
        if (!panStart) return;
        opts.setCamera({
            panPx: {
                x: panStart.ox + (e.clientX - panStart.mx),
                y: panStart.oy + (e.clientY - panStart.my),
            },
            zoom: opts.getCamera().zoom,
        });
        applyTransform();
    };

    const onMouseUp = () => {
        if (!panStart) return;
        panStart = null;
        if (fstate.activeTool === 'select') contentEl.style.cursor = 'grab';
    };

    const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const rect  = contentEl.getBoundingClientRect();
        // happy-dom (and any headless host) reports a zero-size rect, which
        // would make the focal point NaN-free but meaningless. Falling back to
        // the container's own centre keeps the gesture well-defined instead of
        // silently pinning every zoom to the top-left corner.
        const fx = rect.width  > 0 ? e.clientX - rect.left : contentEl.clientWidth  / 2;
        const fy = rect.height > 0 ? e.clientY - rect.top  : contentEl.clientHeight / 2;
        const delta = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const cur   = opts.getCamera();

        // ⚠ ASK FIRST, THEN COMPUTE THE PAN FROM WHAT WAS GRANTED.
        // The controller CLAMPS zoom to its min/max rails, so the requested
        // ratio and the applied ratio are not always the same number. Deriving
        // the focal-point pan from `delta` — the request — makes the drawing
        // crawl sideways on every wheel tick once the user is parked at a rail,
        // because the pan keeps moving for a zoom that never happened.
        const applied = opts.setCamera({ panPx: cur.panPx, zoom: cur.zoom * delta });
        const ratio   = cur.zoom > 0 ? applied.zoom / cur.zoom : 1;
        opts.setCamera({
            panPx: {
                x: fx - (fx - cur.panPx.x) * ratio,
                y: fy - (fy - cur.panPx.y) * ratio,
            },
            zoom: applied.zoom,
        });
        applyTransform();
    };

    const onSvgClick = (e: MouseEvent) => {
        if (fstate.activeTool !== 'dimension') return;
        e.stopPropagation();
        const svgRect = svgEl.getBoundingClientRect();
        const px = (e.clientX - svgRect.left) * (canvasW / (svgRect.width  || 1));
        const py = (e.clientY - svgRect.top)  * (canvasH / (svgRect.height || 1));

        if (fstate.dimPoints.length === 0) {
            fstate.dimPoints.push({ x: px, y: py });
            opts.renderDim(svgEl, canvasW, canvasH, fstate);
        } else {
            const p1 = fstate.dimPoints[0];
            const pixelDist = Math.sqrt((px - p1.x) ** 2 + (py - p1.y) ** 2);
            const mmDist    = (pixelDist / opts.scaleFactor) * fstate.scaleDenom;
            const label     = mmDist >= 1000
                ? `${(mmDist / 1000).toFixed(2)} m`
                : `${Math.round(mmDist)} mm`;
            fstate.annotations.push({ x1: p1.x, y1: p1.y, x2: px, y2: py, label });
            fstate.dimPoints = [];
            opts.renderDim(svgEl, canvasW, canvasH, fstate);
            console.log(`[SC-11] Dimension placed: ${label}`);
        }
    };

    if (fstate.activeTool === 'select') contentEl.style.cursor = 'grab';

    contentEl.addEventListener('mousedown', onMouseDown);
    contentEl.addEventListener('wheel',     onWheel, { passive: false });
    svgEl.addEventListener    ('click',     onSvgClick);
    document.addEventListener ('mousemove', onMouseMove);
    document.addEventListener ('mouseup',   onMouseUp);

    opts.setFocusCleanup(() => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup',   onMouseUp);
    });
}

// ── SC-3: Smart alignment guides ──────────────────────────────────────────

export function drawAlignmentGuides(
    ctx:       CanvasRenderingContext2D,
    movingEl:  HTMLElement,
    canvasEl:  HTMLElement,
    sheetId:   string | null,
    threshold: number = 6,
): void {
    void sheetId;

    const movingRect = movingEl.getBoundingClientRect();
    const canvasRect = canvasEl.getBoundingClientRect();

    const toCanvasY = (clientY: number) => clientY - canvasRect.top;
    const toCanvasX = (clientX: number) => clientX - canvasRect.left;

    const mLeft   = toCanvasX(movingRect.left);
    const mRight  = toCanvasX(movingRect.right);
    const mTop    = toCanvasY(movingRect.top);
    const mBottom = toCanvasY(movingRect.bottom);
    const mCX     = (mLeft + mRight) / 2;
    const mCY     = (mTop + mBottom) / 2;

    ctx.save();
    ctx.strokeStyle = '#4b7cf3';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 4]);
    ctx.font      = '9px sans-serif';
    ctx.fillStyle = '#4b7cf3';

    const vpEls = Array.from(canvasEl.querySelectorAll<HTMLElement>('.sh-viewport'))
        .filter(el => el !== movingEl);

    for (const el of vpEls) {
        const r = el.getBoundingClientRect();
        const eLeft = toCanvasX(r.left);   const eRight  = toCanvasX(r.right);
        const eTop  = toCanvasY(r.top);    const eBottom = toCanvasY(r.bottom);
        const eCX   = (eLeft + eRight) / 2;
        const eCY   = (eTop + eBottom) / 2;

        const hSnaps = [
            [mTop, eTop],    [mTop, eBottom],    [mTop, eCY],
            [mBottom, eTop], [mBottom, eBottom],  [mBottom, eCY],
            [mCY, eTop],     [mCY, eBottom],      [mCY, eCY],
        ];
        for (const [my, ey] of hSnaps) {
            if (Math.abs(my - ey) < threshold) {
                ctx.beginPath(); ctx.moveTo(0, ey); ctx.lineTo(ctx.canvas.width, ey); ctx.stroke();
            }
        }

        const vSnaps = [
            [mLeft, eLeft],   [mLeft, eRight],   [mLeft, eCX],
            [mRight, eLeft],  [mRight, eRight],  [mRight, eCX],
            [mCX, eLeft],     [mCX, eRight],     [mCX, eCX],
        ];
        for (const [mx, ex] of vSnaps) {
            if (Math.abs(mx - ex) < threshold) {
                ctx.beginPath(); ctx.moveTo(ex, 0); ctx.lineTo(ex, ctx.canvas.height); ctx.stroke();
            }
        }
    }

    ctx.restore();
}
