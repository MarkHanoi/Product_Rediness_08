/**
 * SheetEditorPanel — Phase S4 + Phase SC (Next-Gen Sheet Composition Engine)
 *
 * Wave 7 WS-B (S85-WIRE): split from 2,930 LOC monolith into 5 focused files:
 *   SheetEditorContracts.ts     — shared types / constants
 *   SheetEditorCommands.ts      — Command<T> dispatch + dialogs
 *   SheetEditorSidebar.ts       — sidebar DOM builders
 *   SheetEditorRendererBridge.ts — canvas drawing + focus-mode helpers
 *   SheetEditorPanel.ts (this)  — orchestrator class (~1,050 LOC)
 *
 * A Revit-style Sheet Editor: full-screen overlay showing the sheet canvas
 * with placed viewports, title block, and a sidebar for properties + view picker.
 *
 * Contract compliance:
 *   §01 §2     — All mutations via the legacy command manager; no direct store writes
 *   §03 §1.1   — Reads from SheetStore and ViewDefinitionStore; no schema changes here
 *   §05        — CSS prefix: sh-; styles in AppTheme.ts SHEET_EDITOR_STYLES
 *   §05 §7.8   — No bim-* elements; pure HTMLElement tree
 *   §06        — No platform-layer imports
 *   §07        — No server routes
 *
 * Phase SC features (additive, no regression on S4):
 *   SC-3: Grid overlay toggle, snap-to-grid, alignment/margin guides, multi-select,
 *         resize handles on selected viewport, Arrow-key nudge
 *   SC-4: Layout preset picker + paper size selector in sidebar
 *   SC-5: Data panel add/remove in sidebar + DataPanelRenderer integration
 *   SC-6: Export dialog (Print/PNG/SVG) via ExportSheetCommand
 *   SC-7: Composition intent + audience + document phase inspector section
 *   SC-8: Presence avatars in header; comment pin placement on canvas;
 *         SheetCommentStore subscription; socket.io sheetId extension
 *
 * Registered on window.sheetEditorPanel by EngineBootstrap.
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { sheetStore } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { titleBlockStore } from '@pryzm/core-app-model';
import type { SheetDefinition, SheetViewport } from '@pryzm/core-app-model';
import type { ViewDefinition } from '@pryzm/core-app-model';
import { viewportPreviewRenderer } from '@pryzm/core-app-model';
import { viewTechnicalDrawingCache } from '@pryzm/core-app-model';
import { sheetProjectionOrchestrator } from './SheetProjectionOrchestrator';
import { dataPanelRenderer } from '@pryzm/core-app-model';
import { sheetCommentStore } from '@pryzm/core-app-model';
import type { SheetComment } from '@pryzm/core-app-model';
import { panelManager } from '../PanelManager';
// §SHEET-NAVIGATE-INSIDE-THE-VIEWPORT (L-1865) — the authored, tested model of
// "which viewport is activated and where is its camera".
//
// Imported by its OWN SUBPATH, not through `@pryzm/plugin-sheets` and not
// through `/view-renderer`. Both of those reach `sheet-editor-host.ts`, which
// value-imports `@pryzm/plugin-plan-view` — measured: routing through
// `/view-renderer` added NINE errors in `plugins/plan-view` to
// `npx tsc --noEmit`, in files that had never been in the type program.
// `/viewport-edit-controller` reaches only `view-camera.ts`, which imports
// nothing [scc-no-barrel-access-at-module-load].
import { ViewportEditController } from '@pryzm/plugin-sheets/viewport-edit-controller';
import { activateViewForEditing } from './activateViewForEditing';

// ── Wave 7 WS-B extracted modules ─────────────────────────────────────────
import type { SidebarOpts, FocusOpts, VpFocusState, VpCameraPx } from './SheetEditorContracts';
import { VIEW_TYPE_ICONS, VIEW_DRAG_MIME } from './SheetEditorContracts';
import {
    dispatchAddViewport,
    dispatchMoveViewport,
    dispatchRemoveViewport,
    dispatchUpdateSheetField,
    showExportDialog,
    buildInlineScaleOverlay,
} from './SheetEditorCommands';
import {
    buildSidebar,
    initPresence,
    updatePresenceStrip,
    placeComment,
    buildCommentPin,
} from './SheetEditorSidebar';
import {
    drawGridOverlay,
    drawProjectingState,
    onDrawingRefreshed,
    renderThumbnail,
    renderDimAnnotations,
    buildFocusToolbar,
    attachFocusInteraction,
    drawAlignmentGuides,
    composeSheetViewport,
    mountCompositeViewport,
} from './SheetEditorRendererBridge';

// ── Panel class ────────────────────────────────────────────────────────────

export class SheetEditorPanel {
    private _overlay:       HTMLDivElement | null = null;
    private _activeSheetId: string | null = null;
    private _selectedVpId:  string | null = null;
    private _revisionFormOpen = false;

    // Canvas rendering state
    private _canvasEl:   HTMLDivElement | null = null;
    private _sidebarEl:  HTMLDivElement | null = null;
    private _scaleFactor = 1;

    // Zoom state
    private _zoomLevel = 1;
    private _zoomMin   = 0.25;
    private _zoomMax   = 4;

    // Pan state — SC-10: translate-based pan
    private _panOffset = { x: 0, y: 0 };
    private _spaceDown = false;

    // Phase SC-1: Preview canvas registry — viewportId → {viewId, canvas}
    private _previewCanvases = new Map<string, { viewId: string; canvas: HTMLCanvasElement }>();

    // Drag state (SC-1 / SC-3)
    private _dragging: {
        viewportId:  string;
        startMouseX: number;
        startMouseY: number;
        startPosX:   number;
        startPosY:   number;
    } | null = null;

    // Phase SC-3: Canvas interaction state
    private _gridVisible   = false;
    private _snapGridMm    = 5;
    private _selectedVpIds = new Set<string>();
    private _gridOverlayEl: HTMLCanvasElement | null = null;

    // Phase SC-8: Collaboration state
    private _commentPlacementMode = false;
    private _presenceStripEl: HTMLDivElement | null = null;
    private _commentUnsubscribers: Array<() => void> = [];
    private _presenceCleanup: (() => void) | null = null;

    // Sheet-view: Edit-in-Place state
    private _editingVpId: string | null = null;

    // SC-11: Edit-in-Sheet (viewport inline focus) state
    private _vpFocusState: VpFocusState | null = null;

    // SC-11: cleanup callbacks for document-level mouse listeners attached during focus mode
    private _vpFocusCleanup: (() => void) | null = null;

    /**
     * §SHEET-NAVIGATE-INSIDE-THE-VIEWPORT (L-1865) — THE owner of the
     * per-viewport navigation camera.
     *
     * The founder, 2026-08-21: *"When I select a view within the sheet I would
     * like to be able to navigate in the view like if I am in the main scene,
     * still being in the sheet / view interface — but now it brings me to the
     * main pryzm view, which is NOT what I want."*
     *
     * This controller was authored months ago with tests and a barrel export and
     * had NO construction site anywhere in the repo — the panel had instead
     * grown a private rival (`camOffset` / `camZoom` on `VpFocusState`) that was
     * thrown away on every exit. Wiring the real one, rather than blessing the
     * rival, is what makes the camera survive a rebuild, a deselect, and a jump
     * to another viewport and back.
     *
     * It stores DRAWING-SPACE METRES; the surface speaks CSS pixels. The two are
     * related by `sf × 1000 / scaleDenom` — see `_pxPerWorldM`.
     */
    private readonly _vpEditCtl = new ViewportEditController({ minZoom: 0.2, maxZoom: 20 });

    /** Removes the document-level key listeners installed by `_build()`. */
    private _keyCleanup: (() => void) | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        // F.11.3 Wave 14 — runtime.cde.structuredName wiring (sheet title-block CDE strip).
        // Phase F stub: returns empty DocumentId; Phase C.cde wires real CDE adapter.
        // The structuredName is used to auto-populate the CDE document strip on sheet open.
        if (runtime?.cde) {
            const _cdeDocId = runtime.cde.structuredName('');
            console.debug('[SheetEditorPanel] Wave 14 runtime.cde wired, structuredName stub:', _cdeDocId);
        }
        // Background projections: re-render thumbnails when a view's drawing lands.
        // F.events.10 — svp:drawing-refreshed via runtime.events; payload IS the detail object,
        // so we synthesise a CustomEvent-compatible wrapper for onDrawingRefreshed.
        window.runtime?.events?.on('svp:drawing-refreshed', (payload: unknown) => {
            // §SHEET-COMPOSITE-ON-SHEET (L-1630) — a projection landing is the
            // moment a viewport stops being a placeholder and becomes the real
            // drawing. That is a SWAP of the content node, not a repaint of one,
            // so the thumbnail path below cannot perform it: it only ever pushed
            // new pixels into an already-mounted <canvas>. Rebuild the canvas so
            // the viewport re-composes and re-sizes to its true paper footprint.
            const viewId = (payload as { viewId?: string } | undefined)?.viewId;
            if (viewId && this._activeSheetId) {
                const sheet = sheetStore.get(this._activeSheetId);
                if (sheet && sheet.viewports.some(v => v.viewId === viewId)) {
                    this._refreshCanvas(sheet);
                    return;
                }
            }
            const syntheticEvt = { detail: payload } as unknown as Event;
            onDrawingRefreshed(syntheticEvt, this._activeSheetId, this._previewCanvases, renderThumbnail);
        });

        // §SHEET-INACTIVE-VIEW-NEVER-PROJECTS (L-1841) — `svp:drawing-refreshed`
        // fires ONLY when a projection SUCCEEDS. A request that ends in
        // 'no-geometry', 'unavailable' or 'failed' emits nothing, so without
        // this subscription the viewport would keep the in-flight placeholder it
        // was painted with and the founder's frozen bar would survive the fix.
        // A terminal outcome is news, and the surface has to hear it.
        sheetProjectionOrchestrator.onStatusChanged((viewId) => {
            if (!this._activeSheetId) return;
            const sheet = sheetStore.get(this._activeSheetId);
            if (sheet && sheet.viewports.some(v => v.viewId === viewId)) {
                this._refreshCanvas(sheet);
            }
        });

        // Live refresh on store events
        window.addEventListener('sd:sheet-created', (e: Event) => {
            const id = (e as CustomEvent).detail?.sheetId;
            if (id === this._activeSheetId) this._refresh();
        });
        window.addEventListener('sd:sheet-updated', (e: Event) => {
            const id = (e as CustomEvent).detail?.sheetId;
            if (id === this._activeSheetId) this._refresh();
        });
        window.addEventListener('sd:sheet-deleted', (e: Event) => {
            const id = (e as CustomEvent).detail?.sheetId;
            if (id === this._activeSheetId) this.close();
        });
        window.addEventListener('vd:view-created', () => { if (this._activeSheetId) this._refreshSidebar(); });
        window.addEventListener('vd:view-deleted', () => { if (this._activeSheetId) this._refreshSidebar(); });
        panelManager.register('panel:sheet-editor', () => this.close());
    }

    // ── Public API ─────────────────────────────────────────────────────────

    open(sheetId: string): void {
        this._activeSheetId    = sheetId;
        this._selectedVpId     = null;
        this._editingVpId      = null;
        this._vpFocusState     = null;
        this._vpFocusCleanup   = null;
        this._revisionFormOpen = false;
        this._zoomLevel        = 1;
        this._panOffset        = { x: 0, y: 0 };
        this._spaceDown        = false;

        if (this._overlay) {
            document.body.removeChild(this._overlay);
            this._overlay = null;
        }

        this._overlay = this._build();
        document.body.appendChild(this._overlay);
        document.body.style.overflow = 'hidden';

        panelManager.notifyOpened('panel:sheet-editor');

        // Trigger on-demand projections for elevation/section viewports that
        // haven't been activated and therefore have no cached TechnicalDrawing yet.
        const sheet = sheetStore.get(sheetId);
        if (sheet) {
            sheetProjectionOrchestrator.orchestrate(sheet.viewports);
        }

        // Schedule a fresh 3D-view thumbnail capture once the renderer has rendered.
        setTimeout(() => {
            viewportPreviewRenderer.invalidate();
        }, 100);

        console.log(`[SheetEditorPanel] Opened sheet: ${sheetId}`);
    }

    close(): void {
        // Phase SC-1: detach all preview canvases to prevent leaks
        this._previewCanvases.forEach(({ viewId, canvas }) => {
            viewportPreviewRenderer.detach(viewId, canvas);
        });
        this._previewCanvases.clear();

        if (this._overlay && this._overlay.parentNode) {
            document.body.removeChild(this._overlay);
        }
        this._overlay       = null;
        this._activeSheetId = null;
        this._selectedVpId  = null;
        this._dragging      = null;
        // §SHEET-VIEWPORT-ALWAYS-REMOVABLE (L-1862) — `_build()` installs
        // document-level key listeners and used to remove them only on the
        // Escape branch, so every `_refresh()` stacked another copy and a closed
        // sheet still swallowed keystrokes. Dispose them where the panel dies.
        if (this._keyCleanup) { this._keyCleanup(); this._keyCleanup = null; }
        // SC-11: cleanup focus mode
        if (this._vpFocusCleanup) { this._vpFocusCleanup(); this._vpFocusCleanup = null; }
        this._vpFocusState = null;
        // Phase SC-3: reset canvas interaction state
        this._selectedVpIds.clear();
        this._gridOverlayEl = null;
        panelManager.notifyClosed('panel:sheet-editor');
        // Phase SC-8: unsubscribe comment store listeners + cleanup presence
        this._commentUnsubscribers.forEach(fn => fn());
        this._commentUnsubscribers = [];
        if (this._presenceCleanup) { this._presenceCleanup(); this._presenceCleanup = null; }
        this._commentPlacementMode = false;
        this._presenceStripEl      = null;
        document.body.style.overflow = '';
        console.log('[SheetEditorPanel] Closed');
    }

    isOpen(): boolean {
        return this._overlay !== null;
    }

    // ── Build overlay ──────────────────────────────────────────────────────

    private _build(): HTMLDivElement {
        const overlay = document.createElement('div');
        overlay.className = 'sh-overlay';

        const sheet = this._activeSheetId ? sheetStore.get(this._activeSheetId) : null;
        if (!sheet) {
            overlay.textContent = 'Sheet not found.';
            return overlay;
        }

        overlay.appendChild(this._buildHeader(sheet));

        const body = document.createElement('div');
        body.className = 'sh-body';

        const canvasArea = document.createElement('div');
        canvasArea.className = 'sh-canvas-area';
        Object.assign(canvasArea.style, {
            overflow: 'hidden',
            position: 'relative',
            cursor:   'default',
        });

        this._canvasEl = this._buildCanvas(sheet, canvasArea);
        canvasArea.appendChild(this._canvasEl);
        body.appendChild(canvasArea);

        this._sidebarEl = this._buildSidebar(sheet);
        body.appendChild(this._sidebarEl);

        overlay.appendChild(body);

        // Centre the canvas once layout is known.
        getFrameScheduler().scheduleOnce('sheet-editor-center-canvas', () => this._centerCanvas());

        // Click backdrop to deselect (also exits SC-11 focus mode)
        canvasArea.addEventListener('click', (e) => {
            if (e.target === canvasArea) {
                this._exitViewportFocusMode();
                this._selectedVpId = null;
                this._refreshCanvas(sheet);
                this._refreshSidebar();
            }
        });

        // Keyboard: Escape → close; Ctrl+= / Ctrl+- / Ctrl+0 → zoom; Space = pan mode
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (this._vpFocusState) {
                    this._exitViewportFocusMode();
                    return;
                }
                this.close();
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                // §SHEET-VIEWPORT-ALWAYS-REMOVABLE (L-1862) — the founder:
                // *"I was not able to remove it because I could not reach the
                // 'x' … if the user clicks delete it should go away."*
                //
                // The '✕' lives at the viewport's top-right corner, so a
                // viewport wider than the paper puts its own close control off
                // the canvas. That is fixed at source (L-1854) and again in the
                // control's own geometry, but BOTH of those are positional
                // arguments and a positional argument can be defeated by the
                // next oversized drawing. A key binding cannot: it does not
                // care where the viewport is.
                if (this._isTypingTarget(e.target)) return;
                if (this._deleteSelectedViewports()) e.preventDefault();
            } else if (e.key === ' ') {
                if (!e.repeat) {
                    e.preventDefault();
                    this._spaceDown = true;
                    canvasArea.style.cursor = 'grab';
                }
            } else if (e.ctrlKey || e.metaKey) {
                if      (e.key === '=' || e.key === '+') { e.preventDefault(); this._adjustZoom(0.25); }
                else if (e.key === '-')                  { e.preventDefault(); this._adjustZoom(-0.25); }
                else if (e.key === '0')                  { e.preventDefault(); this._setZoom(1); this._centerCanvas(); }
            }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === ' ') {
                this._spaceDown = false;
                canvasArea.style.cursor = 'default';
            }
        };
        if (this._keyCleanup) this._keyCleanup();
        document.addEventListener('keydown', onKey);
        document.addEventListener('keyup',   onKeyUp);
        this._keyCleanup = () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('keyup',   onKeyUp);
        };

        // Ctrl+wheel = mouse-position zoom; plain wheel = pan
        canvasArea.addEventListener('wheel', (e: WheelEvent) => {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) {
                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                const rect = canvasArea.getBoundingClientRect();
                this._setZoom(this._zoomLevel + delta, {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                });
            } else {
                this._panOffset.x -= e.deltaX;
                this._panOffset.y -= e.deltaY;
                this._applyTransform();
            }
        }, { passive: false });

        // Middle-mouse drag = pan
        canvasArea.addEventListener('mousedown', (e: MouseEvent) => {
            const isMiddle    = e.button === 1;
            const isSpaceDrag = e.button === 0 && this._spaceDown;
            if (!isMiddle && !isSpaceDrag) return;
            e.preventDefault();
            const startX    = e.clientX;
            const startY    = e.clientY;
            const startPanX = this._panOffset.x;
            const startPanY = this._panOffset.y;
            canvasArea.style.cursor = 'grabbing';

            const onMove = (ev: MouseEvent) => {
                this._panOffset.x = startPanX + ev.clientX - startX;
                this._panOffset.y = startPanY + ev.clientY - startY;
                this._applyTransform();
            };
            const onUp = () => {
                canvasArea.style.cursor = this._spaceDown ? 'grab' : 'default';
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup',  onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup',  onUp);
        });

        return overlay;
    }

    // ── Header ─────────────────────────────────────────────────────────────

    private _buildHeader(sheet: SheetDefinition): HTMLElement {
        const header = document.createElement('div');
        header.className = 'sh-header';

        const title = document.createElement('span');
        title.className   = 'sh-header-title';
        title.textContent = `${sheet.sheetNumber} — ${sheet.name}`;

        const sub = document.createElement('span');
        sub.className   = 'sh-header-sub';
        sub.textContent = sheet.revision ? `Rev. ${sheet.revision}` : '';

        const sep = () => { const s = document.createElement('div'); s.className = 'sh-header-sep'; return s; };

        // SC-3: Grid toggle
        const gridBtn = document.createElement('button');
        gridBtn.className   = this._gridVisible ? 'sh-grid-toggle sh-grid-toggle--active' : 'sh-grid-toggle';
        gridBtn.type        = 'button';
        gridBtn.title       = 'Toggle grid overlay (G)';
        gridBtn.textContent = '⊞ Grid';
        gridBtn.addEventListener('click', () => {
            this._gridVisible = !this._gridVisible;
            gridBtn.className = this._gridVisible ? 'sh-grid-toggle sh-grid-toggle--active' : 'sh-grid-toggle';
            this._drawGridOverlay();
        });

        // SC-6: Export dialog — delegates to Commands module
        const exportBtn = document.createElement('button');
        exportBtn.className   = 'sh-header-btn sh-header-btn--primary';
        exportBtn.type        = 'button';
        exportBtn.textContent = 'Export';
        exportBtn.title       = 'Export sheet as Print, PNG, SVG, DXF, or PDF';
        exportBtn.addEventListener('click', () => showExportDialog(sheet));

        // SC-8: Presence strip — delegates to Sidebar module
        const presenceStrip = document.createElement('div');
        presenceStrip.className = 'sh-presence-strip';
        presenceStrip.id        = 'sh-presence-strip';
        this._presenceStripEl   = presenceStrip;
        this._presenceCleanup   = initPresence(sheet.id, presenceStrip, () => this._doUpdatePresenceStrip());

        // Zoom controls
        const zoomOutBtn = document.createElement('button');
        zoomOutBtn.className   = 'sh-header-btn sh-zoom-btn';
        zoomOutBtn.type        = 'button';
        zoomOutBtn.title       = 'Zoom out (Ctrl+−)';
        zoomOutBtn.textContent = '−';
        zoomOutBtn.addEventListener('click', () => this._adjustZoom(-0.25));

        const zoomLabel = document.createElement('span');
        zoomLabel.className   = 'sh-zoom-label';
        zoomLabel.id          = 'sh-zoom-label';
        zoomLabel.textContent = '100%';

        const zoomInBtn = document.createElement('button');
        zoomInBtn.className   = 'sh-header-btn sh-zoom-btn';
        zoomInBtn.type        = 'button';
        zoomInBtn.title       = 'Zoom in (Ctrl+=)';
        zoomInBtn.textContent = '+';
        zoomInBtn.addEventListener('click', () => this._adjustZoom(0.25));

        const zoomResetBtn = document.createElement('button');
        zoomResetBtn.className   = 'sh-header-btn sh-zoom-reset-btn';
        zoomResetBtn.type        = 'button';
        zoomResetBtn.title       = 'Reset zoom (Ctrl+0)';
        zoomResetBtn.textContent = '⊙';
        zoomResetBtn.addEventListener('click', () => this._setZoom(1));

        const closeBtn = document.createElement('button');
        closeBtn.className   = 'sh-header-btn sh-header-btn--close';
        closeBtn.type        = 'button';
        closeBtn.textContent = '✕ Back';
        closeBtn.addEventListener('click', () => this.close());

        header.appendChild(title);
        header.appendChild(sub);
        header.appendChild(sep());
        header.appendChild(gridBtn);
        header.appendChild(sep());
        header.appendChild(zoomOutBtn);
        header.appendChild(zoomLabel);
        header.appendChild(zoomInBtn);
        header.appendChild(zoomResetBtn);
        header.appendChild(sep());
        header.appendChild(exportBtn);
        header.appendChild(sep());
        header.appendChild(presenceStrip);
        header.appendChild(sep());
        header.appendChild(closeBtn);

        return header;
    }

    // ── Canvas ─────────────────────────────────────────────────────────────

    private _buildCanvas(sheet: SheetDefinition, _canvasArea: HTMLElement): HTMLDivElement {
        const template = sheet.titleBlock
            ? (titleBlockStore.get(sheet.titleBlock) ?? titleBlockStore.getDefault())
            : titleBlockStore.getDefault();

        const paperW = template.paperWidth;
        const paperH = template.paperHeight;

        const availW = Math.max(600, window.innerWidth  * 0.78 - 64);
        const availH = Math.max(400, window.innerHeight * 0.85 - 80);
        const scaleX = availW / paperW;
        const scaleY = availH / paperH;
        this._scaleFactor = Math.min(scaleX, scaleY, 1.2);
        const sf = this._scaleFactor;

        const canvas = document.createElement('div');
        canvas.className = 'sh-canvas';
        canvas.style.width           = `${paperW * sf}px`;
        canvas.style.height          = `${paperH * sf}px`;
        canvas.style.position        = 'absolute';
        canvas.style.transformOrigin = '0 0';

        const border = document.createElement('div');
        border.className  = 'sh-border';
        border.style.inset = `${10 * sf}px`;
        canvas.appendChild(border);

        const tbW = template.borderWidth * sf;
        const tb  = document.createElement('div');
        tb.className = 'sh-titleblock';
        tb.style.width = `${tbW}px`;
        canvas.appendChild(tb);

        const fieldValues: Record<string, string> = {
            sheetNumber: sheet.sheetNumber,
            sheetName:   sheet.name,
            revision:    sheet.revision || '—',
            date:        sheet.issueDate || new Date().toLocaleDateString('en-GB'),
            issuedBy:    sheet.issuedBy  || '',
        };

        for (const field of template.fields) {
            const zone = document.createElement('div');
            zone.className    = 'sh-titleblock-field';
            zone.style.left   = `${(field.x - (paperW - template.borderWidth)) * sf}px`;
            zone.style.bottom = `${field.y * sf}px`;
            zone.style.width  = `${field.width * sf}px`;
            zone.style.height = `${field.height * sf}px`;

            const labelEl = document.createElement('div');
            labelEl.className   = 'sh-titleblock-field-label';
            labelEl.textContent = field.label;
            labelEl.style.fontSize = `${Math.max(5, (field.fontSize ?? 6) * 0.45 * sf)}px`;

            const valueEl = document.createElement('div');
            valueEl.className   = 'sh-titleblock-field-value';
            valueEl.textContent = fieldValues[field.key] ?? '';
            valueEl.style.fontSize = `${Math.max(6, (field.fontSize ?? 8) * 0.6 * sf)}px`;
            if (field.bold) valueEl.classList.add('sh-titleblock-field-value--bold');

            zone.appendChild(labelEl);
            zone.appendChild(valueEl);
            tb.appendChild(zone);
        }

        const usableW = (paperW - template.borderWidth - 20) * sf;

        if (sheet.viewports.length === 0) {
            const hint = document.createElement('div');
            hint.className  = 'sh-canvas-hint';
            hint.style.left = `${usableW / 2}px`;
            hint.innerHTML  = 'No views placed<br><small>Drag a view from the list on the right onto the sheet</small>';
            canvas.appendChild(hint);
        }

        // ── §SHEET-DROP-WHERE-THE-CURSOR-IS (L-1632): Mural-style placement ──
        // The drop target is the PAPER, not the scroll area, so a view can only
        // be placed somewhere that exists on the sheet.
        //
        // Paper coordinates are read from the canvas's own bounding rect rather
        // than from `sf * zoom`. The canvas carries a CSS transform for pan and
        // zoom, and `getBoundingClientRect()` already accounts for it, so this
        // stays correct at any zoom and any pan — reconstructing the same number
        // from the two state variables would be a second source of truth for the
        // same fact, and the one that goes stale first.
        canvas.addEventListener('dragover', (e: DragEvent) => {
            if (!e.dataTransfer?.types?.includes(VIEW_DRAG_MIME)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            canvas.classList.add('sh-canvas--drop-target');
        });
        canvas.addEventListener('dragleave', (e: DragEvent) => {
            if (e.target === canvas) canvas.classList.remove('sh-canvas--drop-target');
        });
        canvas.addEventListener('drop', (e: DragEvent) => {
            canvas.classList.remove('sh-canvas--drop-target');
            const viewId = e.dataTransfer?.getData(VIEW_DRAG_MIME);
            if (!viewId) return;
            e.preventDefault();

            const currentSheet = this._activeSheetId ? sheetStore.get(this._activeSheetId) : null;
            const view = viewDefinitionStore.get(viewId);
            if (!currentSheet || !view) {
                console.warn(`[SheetEditorPanel] Drop ignored — no such view '${viewId}' or no active sheet`);
                return;
            }

            const pt = this._dropPointToPaperMm(canvas, e.clientX, e.clientY, paperW, paperH);

            // Centre the drawing on the cursor rather than pinning its corner
            // there. "Drop it here" means the thing the user is looking at ends
            // up under the pointer; anchoring a corner makes a large viewport
            // land visibly away from where it was released. The size is the
            // composed paper footprint — the same number the viewport will be
            // rendered at — so the placement and the render agree.
            const probe = composeSheetViewport({ viewId, scale: view.output?.scale ?? 50 });
            const halfW = probe.resolved ? probe.widthMm  / 2 : 0;
            const halfH = probe.resolved ? probe.heightMm / 2 : 0;

            dispatchAddViewport(currentSheet, view, {
                x: Math.max(0, pt.x - halfW),
                y: Math.max(0, pt.y - halfH),
            });
        });

        for (const vp of sheet.viewports) {
            const vpEl = this._buildViewportEl(vp, sheet, sf, usableW, paperH * sf);
            canvas.appendChild(vpEl);
        }

        for (const panel of sheet.dataPanels ?? []) {
            const panelEl = dataPanelRenderer.render(panel, sf);
            dataPanelRenderer.attach(panel, panelEl, sf);
            canvas.appendChild(panelEl);
        }

        const gridCanvas = document.createElement('canvas');
        gridCanvas.className        = 'sh-grid-overlay';
        gridCanvas.width            = Math.round(paperW * sf);
        gridCanvas.height           = Math.round(paperH * sf);
        gridCanvas.style.pointerEvents = 'none';
        this._gridOverlayEl = gridCanvas;
        canvas.appendChild(gridCanvas);
        this._drawGridOverlay();

        const marginMm    = 10;
        const marginGuide = document.createElement('div');
        marginGuide.className = 'sh-margin-guide';
        marginGuide.style.cssText = `
            position: absolute;
            left:   ${marginMm * sf}px;
            top:    ${marginMm * sf}px;
            right:  ${(marginMm + template.borderWidth) * sf}px;
            bottom: ${marginMm * sf}px;
            pointer-events: none;
            z-index: 9;
        `;
        canvas.appendChild(marginGuide);

        const selectBand = document.createElement('div');
        selectBand.className     = 'sh-select-band';
        selectBand.style.display = 'none';
        canvas.appendChild(selectBand);

        // Arrow-key nudge + G-key grid toggle
        canvas.tabIndex = 0;
        canvas.addEventListener('keydown', (e: KeyboardEvent) => {
            const step    = e.shiftKey ? 10 : 1;
            const sheetId = this._activeSheetId;
            if (!sheetId) return;
            const currentSheet = sheetStore.get(sheetId);
            if (!currentSheet) return;

            if (e.key === 'g' || e.key === 'G') {
                this._gridVisible = !this._gridVisible;
                this._drawGridOverlay();
                e.preventDefault();
                return;
            }

            // §SHEET-VIEWPORT-ALWAYS-REMOVABLE (L-1862) — the canvas is
            // focusable (tabIndex 0) and receives keys directly when the user
            // has clicked it; the document-level handler in `_build()` covers
            // the case where focus sits elsewhere in the overlay. Both routes
            // funnel into one dispatcher, so there is one definition of what
            // Delete means on a sheet.
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this._isTypingTarget(e.target)) return;
                if (this._deleteSelectedViewports()) e.preventDefault();
                return;
            }

            let dx = 0, dy = 0;
            if (e.key === 'ArrowLeft')  dx = -step;
            if (e.key === 'ArrowRight') dx =  step;
            if (e.key === 'ArrowUp')    dy = -step;
            if (e.key === 'ArrowDown')  dy =  step;

            if (dx !== 0 || dy !== 0) {
                e.preventDefault();
                const ids = this._selectedVpIds.size > 0
                    ? this._selectedVpIds
                    : (this._selectedVpId ? new Set([this._selectedVpId]) : new Set<string>());
                for (const vpId of ids) {
                    const vp = currentSheet.viewports.find(v => v.id === vpId);
                    if (!vp) continue;
                    // §SHEET-MOVE-DISPATCH-IS-DEAD (L-1633) — was
                    // `(this.runtime?.bus as any)?.executeCommand(...)`, and
                    // `this.runtime` is null on the shipped construction path,
                    // so arrow-key nudge silently moved nothing.
                    dispatchMoveViewport(sheetId, vpId, {
                        x: vp.position.x + dx,
                        y: vp.position.y + dy,
                    });
                }
            }
        });

        // Phase SC-8: Comment placement button
        const addCommentBtn = document.createElement('button');
        addCommentBtn.className   = 'sh-add-comment-btn';
        addCommentBtn.type        = 'button';
        addCommentBtn.textContent = '💬 Comment';
        addCommentBtn.style.right = `${tbW + 14}px`;
        addCommentBtn.addEventListener('click', () => {
            this._commentPlacementMode = !this._commentPlacementMode;
            addCommentBtn.classList.toggle('sh-add-comment-btn--placing', this._commentPlacementMode);
            addCommentBtn.textContent = this._commentPlacementMode ? '✕ Cancel' : '💬 Comment';
            canvas.style.cursor = this._commentPlacementMode ? 'crosshair' : '';
        });
        canvas.appendChild(addCommentBtn);

        canvas.addEventListener('click', (e: MouseEvent) => {
            if (!this._commentPlacementMode || !this._activeSheetId) return;
            const rect = canvas.getBoundingClientRect();
            const xPx  = e.clientX - rect.left;
            const yPx  = e.clientY - rect.top;
            placeComment(this._activeSheetId, xPx / this._scaleFactor, yPx / this._scaleFactor, canvas);
            this._commentPlacementMode = false;
            addCommentBtn.classList.remove('sh-add-comment-btn--placing');
            addCommentBtn.textContent = '💬 Comment';
            canvas.style.cursor = '';
        }, true);

        // SC-11: Dim overlay covers everything except the focused viewport
        if (this._vpFocusState) {
            const dimOverlay = document.createElement('div');
            dimOverlay.className = 'sh-focus-dim-overlay';
            dimOverlay.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                this._exitViewportFocusMode();
            });
            canvas.appendChild(dimOverlay);
        }

        // Phase SC-8: Render existing comments from store
        if (sheet.id) {
            const existingComments = sheetCommentStore.getCommentsForSheet(sheet.id);
            for (const c of existingComments) {
                const pin = buildCommentPin(c as SheetComment, this._scaleFactor, this._activeSheetId, canvas);
                canvas.appendChild(pin);
            }
            const unsub = sheetCommentStore.on('sh:comment-added', (comment) => {
                if (comment.sheetId !== this._activeSheetId) return;
                const pin = buildCommentPin(comment as SheetComment, this._scaleFactor, this._activeSheetId, canvas);
                canvas.appendChild(pin);
            });
            this._commentUnsubscribers.push(unsub);
        }

        return canvas;
    }

    /**
     * §SHEET-DROP-WHERE-THE-CURSOR-IS (L-1632) — screen point → paper millimetres.
     *
     * ⚠ THE Y AXIS FLIPS HERE, and that is not incidental. `SheetViewport.position`
     * is measured from the paper's BOTTOM edge (the canvas builder computes
     * `top = canvasH − y·sf − height`), while every DOM coordinate is measured
     * from the top. A drop handler that forgets the flip places views mirrored
     * about the sheet's horizontal centre-line — which reads as "the drop is
     * ignored" for anything dropped in the lower half.
     */
    private _dropPointToPaperMm(
        canvasEl: HTMLElement,
        clientX:  number,
        clientY:  number,
        paperW:   number,
        paperH:   number,
    ): { x: number; y: number } {
        const rect = canvasEl.getBoundingClientRect();
        const fx = rect.width  > 0 ? (clientX - rect.left) / rect.width  : 0;
        const fy = rect.height > 0 ? (clientY - rect.top)  / rect.height : 0;
        return {
            x: Math.max(0, Math.min(paperW, fx * paperW)),
            y: Math.max(0, Math.min(paperH, (1 - fy) * paperH)),
        };
    }

    // ── Viewport element ───────────────────────────────────────────────────

    private _buildViewportEl(
        vp:      SheetViewport,
        sheet:   SheetDefinition,
        sf:      number,
        usableW: number,
        canvasH: number,
    ): HTMLElement {
        const view     = viewDefinitionStore.get(vp.viewId);
        const scale    = vp.scale ?? 50;

        // ── §SHEET-COMPOSITE-ON-SHEET (L-1630) ────────────────────────────
        // Compose the REAL drawing first, because the viewport's paper size is
        // a consequence of it. A drawing at 1:100 occupies its true millimetre
        // footprint on the sheet; deriving the box from a fraction of the paper
        // (what this did) is what made the placed view a thumbnail rather than a
        // drawing — the linework was rescaled to fit a decorative card, so the
        // stated scale was never the scale on screen.
        //
        // Composition is synchronous string work, so there is no frame to wait
        // for and no async window in which the viewport shows a placeholder it
        // does not need. That also makes the surface deterministically testable.
        const composed = composeSheetViewport(vp);

        const FOOTER_PX = 22;
        let vpWidth:  number;
        let vpHeight: number;

        if (composed.resolved) {
            vpWidth  = composed.widthMm  * sf;
            vpHeight = composed.heightMm * sf + FOOTER_PX;
            // Deliberately NOT clamped down to fit. Shrinking here would silently
            // contradict the "1:N" printed in the viewport's own footer, and a
            // drawing whose stated scale is a lie is worse than one that visibly
            // does not fit — the remedy for the latter is the scale selector,
            // which is one double-click away.
            if (vpWidth > usableW || vpHeight > canvasH) {
                console.warn(
                    `[SheetEditorPanel] Viewport ${vp.id} is ${composed.widthMm.toFixed(0)}×` +
                    `${composed.heightMm.toFixed(0)}mm at 1:${composed.scale} — larger than the ` +
                    `usable sheet area. Choose a smaller scale to fit.`,
                );
            }
        } else {
            vpWidth  = Math.max(80,  Math.min(usableW * 0.45, 200)) * sf;
            vpHeight = Math.max(60, vpWidth * 0.7);
        }

        const posX = Math.max(10 * sf, Math.min(vp.position.x * sf, usableW - vpWidth - 10));
        const posY = Math.max(10 * sf, Math.min(canvasH - vp.position.y * sf - vpHeight, canvasH - vpHeight - 10));

        const vpEl = document.createElement('div');
        vpEl.className = 'sh-viewport' +
            (this._selectedVpId === vp.id         ? ' sh-viewport--selected'       : '') +
            (this._editingVpId === vp.id           ? ' sh-viewport--editing'         : '') +
            (this._vpFocusState?.vpId === vp.id   ? ' sh-viewport--focus-editing'   : '');
        vpEl.style.left   = `${posX}px`;
        vpEl.style.top    = `${posY}px`;
        vpEl.style.width  = `${vpWidth}px`;
        vpEl.style.height = `${vpHeight}px`;
        vpEl.style.cursor = 'grab';
        vpEl.title        = 'Click to select  •  Double-click to edit view';
        vpEl.dataset['vpId'] = vp.id;

        // Detach old canvas before creating a new one
        const oldEntry = this._previewCanvases.get(vp.id);
        if (oldEntry) {
            viewportPreviewRenderer.detach(oldEntry.viewId, oldEntry.canvas);
            this._previewCanvases.delete(vp.id);
        }

        const contentEl = document.createElement('div');
        contentEl.className = 'sh-vp-content';

        const previewCanvas = document.createElement('canvas');
        previewCanvas.className = 'sh-viewport-preview';
        previewCanvas.width     = Math.round(vpWidth);
        previewCanvas.height    = Math.round(vpHeight - FOOTER_PX);

        // §SHEET-COMPOSITE-ON-SHEET (L-1630) — when the real drawing composed,
        // the raster surface is not merely hidden, it is NEVER MOUNTED. Leaving
        // an unused <canvas> behind would keep `viewportPreviewRenderer` attached
        // to it and keep repainting a blob nobody can see, and the next reader of
        // this file would reasonably conclude the raster path is still the
        // producer. Two producers is the bug; a dormant second producer is the
        // bug waiting to be re-enabled.
        const drawingHost = document.createElement('div');
        drawingHost.className = 'sh-vp-drawing';
        drawingHost.style.width  = `${Math.round(vpWidth)}px`;
        drawingHost.style.height = `${Math.round(vpHeight - FOOTER_PX)}px`;

        const hasComposite = composed.resolved
            && mountCompositeViewport(drawingHost, composed);
        const contentNode: HTMLElement = hasComposite ? drawingHost : previewCanvas;

        // SC-11: In focus mode this viewport gets a camera-transform container + SVG dim overlay
        const isFocused = this._vpFocusState?.vpId === vp.id;
        let focusCamContainer: HTMLDivElement | null = null;
        let focusSvgEl:        SVGSVGElement  | null = null;

        if (isFocused && this._vpFocusState) {
            const fstate = this._vpFocusState;
            const camContainer = document.createElement('div');
            camContainer.className   = 'sh-vp-cam-container';
            const camPx = this._cameraPx(fstate.vpId, fstate.scaleDenom);
            camContainer.style.transform =
                `translate(${camPx.panPx.x}px,${camPx.panPx.y}px) scale(${camPx.zoom})`;
            camContainer.appendChild(contentNode);

            const svgNS = 'http://www.w3.org/2000/svg';
            const svgEl = document.createElementNS(svgNS, 'svg') as SVGSVGElement;
            svgEl.classList.add('sh-vp-dim-svg');
            svgEl.setAttribute('viewBox', `0 0 ${previewCanvas.width} ${previewCanvas.height}`);
            svgEl.setAttribute('preserveAspectRatio', 'none');
            if (fstate.activeTool === 'dimension') svgEl.classList.add('sh-vp-dim-svg--dim-tool');
            camContainer.appendChild(svgEl);

            contentEl.appendChild(camContainer);
            focusCamContainer = camContainer;
            focusSvgEl        = svgEl;

            // Render any already-placed dim annotations via RendererBridge
            renderDimAnnotations(svgEl, previewCanvas.width, previewCanvas.height, fstate);
        } else {
            contentEl.appendChild(contentNode);
        }

        vpEl.appendChild(contentEl);

        // Footer
        const footerEl = document.createElement('div');
        footerEl.className = 'sh-vp-footer';

        const labelEl = document.createElement('div');
        labelEl.className   = 'sh-viewport-label';
        labelEl.textContent = view ? view.name : `View (${vp.viewId.slice(-6)})`;
        labelEl.title       = labelEl.textContent;

        const subEl = document.createElement('div');
        subEl.className   = 'sh-viewport-sublabel';
        subEl.textContent = view
            ? `${VIEW_TYPE_ICONS[view.viewType] ?? ''} 1:${scale}`
            : `1:${scale}`;

        footerEl.appendChild(labelEl);
        footerEl.appendChild(subEl);
        vpEl.appendChild(footerEl);

        // Remove button
        const removeBtn = document.createElement('button');
        removeBtn.className   = 'sh-viewport-remove';
        removeBtn.type        = 'button';
        removeBtn.title       = 'Remove this view from the sheet';
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dispatchRemoveViewport(sheet.id, vp.id);
            this._vpEditCtl.forgetViewport(vp.id);
        });

        // §SHEET-VIEWPORT-ALWAYS-REMOVABLE (L-1862) — pin the control ONTO THE
        // PAPER when the viewport overflows it.
        //
        // The CSS puts this at `right: 3px` of the viewport, which is correct
        // for a viewport that fits and catastrophic for one that does not: the
        // founder's 8020 mm elevation on an 1189 mm sheet put its own close
        // button roughly seven sheet-widths away, with no scrollbar that reaches
        // it. Growing `right` by the overflow keeps the control at the visible
        // edge of the drawing it belongs to.
        //
        // This is a SECOND line of defence, not the fix. The fix is L-1854 — a
        // viewport should not be 8020 mm wide in the first place. But a control
        // whose reachability depends on upstream numbers staying sane is a
        // control that will go missing again, so it is also made unconditionally
        // reachable here, and by the Delete key, which has no geometry at all.
        const overflowRight = Math.max(0, (posX + vpWidth) - usableW);
        if (overflowRight > 0) removeBtn.style.right = `${overflowRight + 3}px`;
        vpEl.appendChild(removeBtn);

        // §SHEET-COMPOSITE-ON-SHEET (L-1630) — the raster ladder below is now the
        // FALLBACK, entered only while the real drawing does not exist yet (no
        // cached projection, or a projection with no measurable content). It is
        // deliberately left intact: "the drawing has not been produced yet" and
        // "the drawing is empty" are different facts and must not both render as
        // a blank frame [context-data-honesty].
        if (view && hasComposite) {
            // Nothing to attach. No preview canvas is registered, so no raster
            // renderer is subscribed to this viewport's invalidation events.
        } else if (view) {
            this._previewCanvases.set(vp.id, { viewId: view.id, canvas: previewCanvas });

            if (viewTechnicalDrawingCache.has(view.id)) {
                renderThumbnail(vp, view.id, previewCanvas);
            } else {
                const isPlan       = ['plan', 'ceiling-plan', 'structural-plan'].includes(view.viewType);
                const isProjectable = ['elevation', 'section', 'detail'].includes(view.viewType);

                // §SHEET-INACTIVE-VIEW-NEVER-PROJECTS (L-1841) — REQUEST AT THE
                // POINT OF CONSUMPTION. `orchestrate()` runs only in `open()`,
                // over the viewports that existed at that instant, so a view
                // DROPPED ONTO AN ALREADY-OPEN SHEET was never asked for — the
                // founder's East Elevation, added after `Opened sheet:…`, and
                // the reason its placeholder never resolved. A viewport being
                // rendered is the honest trigger: if it is on screen, it has
                // asked. `requestFor` is idempotent and de-duplicates by
                // (viewId, cache generation), so the per-refresh call is cheap
                // and the projector is hit at most once per invalidation.
                const projStatus = isProjectable
                    ? sheetProjectionOrchestrator.requestFor(view.id)
                    : 'not-projectable';

                getFrameScheduler().scheduleOnce('sheet-editor-attach-preview', () => {
                    if (isPlan) {
                        viewportPreviewRenderer.attach(view, previewCanvas);
                    } else if (isProjectable) {
                        // Renders the REAL status — in-flight, no-geometry,
                        // unavailable or failed — never a fixed 40% bar.
                        drawProjectingState(previewCanvas, view.viewType, projStatus);
                    } else {
                        viewportPreviewRenderer.attach(view, previewCanvas);
                    }
                });
            }
        } else {
            getFrameScheduler().scheduleOnce('sheet-editor-view-not-found', () => {
                const ctx = previewCanvas.getContext('2d');
                if (!ctx) return;
                ctx.fillStyle = '#f8f0f0';
                ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
                ctx.fillStyle    = '#ef4444';
                ctx.font         = '9px sans-serif';
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('View not found', previewCanvas.width / 2, previewCanvas.height / 2);
            });
        }

        // SC-11: Focus toolbar + interaction (when focused)
        if (isFocused && this._vpFocusState && view && focusSvgEl && focusCamContainer) {
            vpEl.appendChild(
                buildFocusToolbar(vp, view, focusSvgEl, previewCanvas, focusCamContainer,
                    this._makeFocusOpts(this._vpFocusState)),
            );
            // §SHEET-NAVIGATE-INSIDE-THE-VIEWPORT (L-1865) — attached
            // SYNCHRONOUSLY. This was deferred to the frame scheduler, which
            // bought nothing: `attachFocusInteraction` only registers listeners,
            // and every measurement it makes (`getBoundingClientRect`) happens
            // inside a handler at event time, long after layout. Deferring it
            // only created a window in which an activated viewport ignored the
            // wheel — and made the behaviour unobservable to any test that does
            // not drive a frame loop.
            attachFocusInteraction(contentEl, focusCamContainer, focusSvgEl,
                previewCanvas.width, previewCanvas.height,
                this._makeFocusOpts(this._vpFocusState));
        }

        // Inline scale overlay (when selected but not focused)
        if (this._selectedVpId === vp.id && view && !isFocused) {
            vpEl.appendChild(buildInlineScaleOverlay(vp, sheet, view.viewType));
        }

        // Click → select
        vpEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this._selectedVpId = vp.id;
            const currentSheet = this._activeSheetId ? sheetStore.get(this._activeSheetId) : null;
            if (currentSheet) {
                this._refreshCanvas(currentSheet);
                this._refreshSidebar();
            }
        });

        // ── §SHEET-DBLCLICK-STAYS-ON-THE-SHEET (L-1866) ───────────────────
        // Double-click ACTIVATES the viewport for navigation. It does not leave
        // the sheet, for ANY view type.
        //
        // The founder, 2026-08-21: *"When I select a view within the sheet I
        // would like to be able to navigate in the view like if I am in the main
        // scene, still being in the sheet / view interface — but now it brings
        // me to the main pryzm view, which is NOT what I want."*
        //
        // It used to branch on view type: 2D views activated in place, 3D views
        // called `enterEditInPlace()`, which CLOSES the sheet editor and
        // switches the main viewport. That was the branch he hit. Navigation
        // needs no element identity — it is a transform on a mounted node — so
        // there is no reason for the 3D case to be the one that teleports.
        //
        // Opening the source view in the main editor is still available, but as
        // a NAMED BUTTON in the properties panel ("Open in main editor"), where
        // it is a decision rather than a side effect of a double-click.
        vpEl.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (!view) return;
            this._enterViewportFocusMode(vp, view);
        });

        // Drag to move (suppressed in SC-11 focus mode)
        vpEl.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (this._vpFocusState?.vpId === vp.id) return;
            e.preventDefault();
            this._dragging = {
                viewportId:  vp.id,
                startMouseX: e.clientX,
                startMouseY: e.clientY,
                startPosX:   vp.position.x,
                startPosY:   vp.position.y,
            };
            vpEl.style.cursor = 'grabbing';

            const onMove = (ev: MouseEvent) => {
                if (!this._dragging || !this._canvasEl) return;
                const effectiveSf = sf * this._zoomLevel;
                const dx = (ev.clientX - this._dragging.startMouseX) / effectiveSf;
                const dy = (ev.clientY - this._dragging.startMouseY) / effectiveSf;
                const newX = Math.max(0, this._dragging.startPosX + dx);
                const newY = Math.max(0, this._dragging.startPosY - dy);
                vpEl.style.left = `${Math.max(10 * sf, newX * sf)}px`;
                vpEl.style.top  = `${Math.max(10 * sf, canvasH - newY * sf - vpHeight)}px`;

                if (this._gridOverlayEl && this._canvasEl) {
                    const guideCtx = this._gridOverlayEl.getContext('2d');
                    if (guideCtx) {
                        drawAlignmentGuides(guideCtx, vpEl, this._canvasEl, this._activeSheetId);
                    }
                }
            };

            const onUp = (ev: MouseEvent) => {
                if (!this._dragging) return;
                const effectiveSf = sf * this._zoomLevel;
                const dx  = (ev.clientX - this._dragging.startMouseX) / effectiveSf;
                const dy  = (ev.clientY - this._dragging.startMouseY) / effectiveSf;
                const newX = Math.max(0, this._dragging.startPosX + dx);
                const newY = Math.max(0, this._dragging.startPosY - dy);
                // §SHEET-MOVE-DISPATCH-IS-DEAD (L-1633) — this is the line the
                // founder's "it doesn't stay in place" was made of. It read
                // `(this.runtime?.bus as any)?.executeCommand(...)`; the panel is
                // constructed with no runtime, so the whole expression evaluated
                // to `undefined` and the drag was purely cosmetic.
                dispatchMoveViewport(sheet.id, vp.id, { x: newX, y: newY });
                vpEl.style.cursor = 'grab';
                this._dragging    = null;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup',  onUp);
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup',  onUp);
        });

        return vpEl;
    }

    // ── Sidebar (thin delegate) ────────────────────────────────────────────

    private _buildSidebar(sheet: SheetDefinition): HTMLDivElement {
        return buildSidebar(sheet, this._makeSidebarCallbacks());
    }

    // ── Grid (thin delegate) ───────────────────────────────────────────────

    private _drawGridOverlay(): void {
        if (!this._gridOverlayEl) return;
        drawGridOverlay(this._gridOverlayEl, this._gridVisible, this._snapGridMm, this._scaleFactor);
    }

    /** Snaps a mm value to the current grid, if the grid is visible. */
    snapToGrid(valueMm: number): number {
        if (!this._gridVisible) return valueMm;
        return Math.round(valueMm / this._snapGridMm) * this._snapGridMm;
    }

    // ── Zoom & Pan ─────────────────────────────────────────────────────────

    private _adjustZoom(delta: number): void {
        const area  = this._canvasEl?.parentElement;
        const focal = area
            ? { x: area.clientWidth / 2, y: area.clientHeight / 2 }
            : undefined;
        this._setZoom(this._zoomLevel + delta, focal);
    }

    private _setZoom(level: number, focal?: { x: number; y: number }): void {
        const oldZoom = this._zoomLevel;
        const newZoom = Math.max(this._zoomMin, Math.min(this._zoomMax, Math.round(level * 100) / 100));
        if (focal && newZoom !== oldZoom) {
            this._panOffset.x = focal.x - (focal.x - this._panOffset.x) * (newZoom / oldZoom);
            this._panOffset.y = focal.y - (focal.y - this._panOffset.y) * (newZoom / oldZoom);
        }
        this._zoomLevel = newZoom;
        this._applyTransform();
    }

    private _applyTransform(): void {
        if (!this._canvasEl) return;
        this._canvasEl.style.transform = `translate(${this._panOffset.x}px,${this._panOffset.y}px) scale(${this._zoomLevel})`;
        const label = this._overlay?.querySelector('#sh-zoom-label');
        if (label) label.textContent = `${Math.round(this._zoomLevel * 100)}%`;
    }

    private _centerCanvas(): void {
        if (!this._canvasEl || !this._canvasEl.parentElement) return;
        const area  = this._canvasEl.parentElement;
        const areaW = area.clientWidth;
        const areaH = area.clientHeight;
        const cW    = parseFloat(this._canvasEl.style.width)  || 0;
        const cH    = parseFloat(this._canvasEl.style.height) || 0;
        this._panOffset = {
            x: Math.max(32, (areaW - cW * this._zoomLevel) / 2),
            y: Math.max(32, (areaH - cH * this._zoomLevel) / 2),
        };
        this._applyTransform();
    }

    // ── §SHEET-VIEWPORT-ALWAYS-REMOVABLE (L-1862) ──────────────────────────

    /**
     * True when the event target is a field the user is typing into, so Delete
     * means "delete a character" rather than "delete a viewport". Without this
     * the scale and position inputs in the sidebar would silently destroy the
     * viewport they are editing on the first backspace.
     */
    private _isTypingTarget(target: EventTarget | null): boolean {
        const el = target as HTMLElement | null;
        if (!el || typeof el.tagName !== 'string') return false;
        const tag = el.tagName.toUpperCase();
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
    }

    /**
     * Remove every selected viewport. Returns true when at least one removal was
     * dispatched, so the key handler can decide whether to consume the event —
     * swallowing Delete when nothing is selected would break the browser's own
     * behaviour elsewhere in the overlay.
     */
    private _deleteSelectedViewports(): boolean {
        const sheetId = this._activeSheetId;
        if (!sheetId) return false;
        const ids = this._selectedVpIds.size > 0
            ? [...this._selectedVpIds]
            : (this._selectedVpId ? [this._selectedVpId] : []);
        if (ids.length === 0) return false;

        for (const vpId of ids) {
            dispatchRemoveViewport(sheetId, vpId);
            // Drop the navigation camera with the viewport it belonged to,
            // otherwise a re-placed view inherits the deleted one's pan.
            this._vpEditCtl.forgetViewport(vpId);
        }
        this._selectedVpIds.clear();
        this._selectedVpId = null;
        if (this._vpFocusState && ids.includes(this._vpFocusState.vpId)) {
            this._exitViewportFocusMode();
        }
        return true;
    }

    // ── §SHEET-NAVIGATE-INSIDE-THE-VIEWPORT (L-1865) ───────────────────────

    /**
     * CSS pixels per drawing-space metre for a viewport at `scaleDenom`.
     *
     * EXACT, and independent of the drawing: the composer lays a viewport out at
     * `worldM × 1000 / scaleDenom` millimetres of paper, and the canvas renders
     * a paper millimetre as `_scaleFactor` pixels. So px/m = sf × 1000 / denom
     * with nothing measured and nothing to go stale. This is the whole reason
     * the camera can be stored in metres and applied in pixels without either
     * representation being an approximation of the other.
     */
    private _pxPerWorldM(scaleDenom: number): number {
        const denom = scaleDenom > 0 ? scaleDenom : 100;
        return this._scaleFactor * 1000 / denom;
    }

    /** The activated viewport's camera, projected into CSS pixels. */
    private _cameraPx(vpId: string, scaleDenom: number): VpCameraPx {
        const cam = this._vpEditCtl.getEditCamera(vpId);
        const k = this._pxPerWorldM(scaleDenom) * cam.zoom;
        // A pan of +X metres moves the VIEW toward +X, so the content moves the
        // other way on screen. The sign is stated here once rather than being
        // absorbed into the drag handler, where it would be invisible.
        return {
            panPx: { x: -cam.panWorldX * k, y: -cam.panWorldY * k },
            zoom:  cam.zoom,
        };
    }

    /** Write a pixel-space camera back to the controller. Returns what stuck. */
    private _setCameraPx(vpId: string, scaleDenom: number, cam: VpCameraPx): VpCameraPx {
        const zoom = cam.zoom > 0 && Number.isFinite(cam.zoom) ? cam.zoom : 1;
        const k = this._pxPerWorldM(scaleDenom) * zoom;
        this._vpEditCtl.setEditCamera(vpId, {
            panWorldX: k !== 0 ? -cam.panPx.x / k : 0,
            panWorldY: k !== 0 ? -cam.panPx.y / k : 0,
            zoom,
        });
        // Read BACK rather than echoing the request: the controller clamps zoom,
        // and a caller that trusts its own request will drift from the state.
        return this._cameraPx(vpId, scaleDenom);
    }

    /**
     * The drawing-space rectangle the activated viewport is currently showing.
     *
     * This is what makes "crop to what I am looking at" a one-line operation
     * rather than a fourth crop concept: the navigated frame and
     * `SheetViewport.crop` are the same four numbers in the same units.
     * Returns null when the viewport has no composed drawing to frame.
     */
    getVisibleWorldRect(vpId: string): { minX: number; minZ: number; maxX: number; maxZ: number } | null {
        const sheet = this._activeSheetId ? sheetStore.get(this._activeSheetId) : null;
        const vp = sheet?.viewports.find(v => v.id === vpId);
        if (!vp) return null;
        const composed = composeSheetViewport(vp);
        if (!composed.resolved) return null;

        const cam = this._vpEditCtl.getEditCamera(vpId);
        const fullW = composed.widthMm  * composed.scale / 1000;
        const fullH = composed.heightMm * composed.scale / 1000;
        const w = fullW / cam.zoom;
        const h = fullH / cam.zoom;
        const cx = composed.originX + fullW / 2 + cam.panWorldX;
        const cz = composed.originZ + fullH / 2 + cam.panWorldY;
        return { minX: cx - w / 2, minZ: cz - h / 2, maxX: cx + w / 2, maxZ: cz + h / 2 };
    }

    // ── SC-11: Viewport focus mode ─────────────────────────────────────────

    private _enterViewportFocusMode(vp: SheetViewport, view: ViewDefinition): void {
        const prevAnnotations =
            this._vpFocusState?.vpId === vp.id ? this._vpFocusState.annotations : [];
        if (this._vpFocusCleanup) { this._vpFocusCleanup(); this._vpFocusCleanup = null; }
        this._vpFocusState = {
            vpId:        vp.id,
            viewId:      view.id,
            scaleDenom:  vp.scale ?? 100,
            activeTool:  'select',
            dimPoints:   [],
            annotations: prevAnnotations,
        };
        // §SHEET-NAVIGATE-INSIDE-THE-VIEWPORT (L-1865) — the camera is NOT reset
        // here. Re-activating a viewport the user already navigated must return
        // them to where they were looking; zeroing it on entry is what made the
        // old private camera feel like it "forgot" every time.
        this._vpEditCtl.setActiveViewport(vp.id);
        this._selectedVpId = vp.id;
        const sheet = this._activeSheetId ? sheetStore.get(this._activeSheetId) : null;
        if (sheet) this._refreshCanvas(sheet);
        console.log(`[SC-11] Entered viewport focus mode: vpId=${vp.id} view=${view.name}`);
    }

    private _exitViewportFocusMode(): void {
        if (!this._vpFocusState) return;
        if (this._vpFocusCleanup) { this._vpFocusCleanup(); this._vpFocusCleanup = null; }
        this._vpFocusState = null;
        // Deactivate, but KEEP the camera: `setActiveViewport(null)` parks the
        // controller without discarding `cameras`, which is exactly the
        // difference between "I stopped navigating" and "my navigation was
        // thrown away".
        this._vpEditCtl.setActiveViewport(null);
        const sheet = this._activeSheetId ? sheetStore.get(this._activeSheetId) : null;
        if (sheet) this._refreshCanvas(sheet);
    }

    // ── Presence helpers ───────────────────────────────────────────────────

    private _doUpdatePresenceStrip(): void {
        if (!this._presenceStripEl || !this._activeSheetId) return;
        updatePresenceStrip(this._presenceStripEl, this._activeSheetId);
    }

    // ── Callback factory helpers ───────────────────────────────────────────

    /** Build the SidebarOpts bag passed to the Sidebar module. */
    private _makeSidebarCallbacks(): SidebarOpts {
        return {
            updateSheetField:    (sheetId, key, value) => dispatchUpdateSheetField(sheetId, key, value),
            removeViewport:      (sheetId, vpId)       => {
                dispatchRemoveViewport(sheetId, vpId);
                this._vpEditCtl.forgetViewport(vpId);
                this._selectedVpIds.delete(vpId);
                if (this._selectedVpId === vpId) this._selectedVpId = null;
                if (this._vpFocusState?.vpId === vpId) this._exitViewportFocusMode();
            },
            addViewToSheet:      (sheet, view)          => dispatchAddViewport(sheet, view),
            refreshSidebar:      ()                     => this._refreshSidebar(),
            getRevisionFormOpen: ()                     => this._revisionFormOpen,
            setRevisionFormOpen: (open)                 => { this._revisionFormOpen = open; },
            getSelectedVpId:     ()                     => this._selectedVpId,
            getActiveSheetId:    ()                     => this._activeSheetId,
            getVisibleWorldRect: (vpId)                 => this.getVisibleWorldRect(vpId),
            openViewInMainEditor: (viewId)              => this._openViewInMainEditor(viewId),
        };
    }

    /**
     * §SHEET-DBLCLICK-STAYS-ON-THE-SHEET (L-1866) — leave the sheet and open
     * `viewId` in the main editor.
     *
     * This is `activateViewForEditing`'s FIRST call site. That module was
     * written earlier today (L-1842) and shipped with none — `grep -rn
     * activateViewForEditing` found the definition and nothing else — so the
     * defective `enterEditInPlace()` path it was written to replace was still
     * the only one running. `enterEditInPlace` called
     * `viewController.activate(viewId)`, but `activate()` takes a ViewMode
     * ('3D' | 'Top' | 'Front' | …), never a ViewDefinition id, so it silently
     * did the wrong thing for every non-3D view.
     *
     * The outcome is reported rather than assumed: 'no engine yet', 'that view
     * is gone' and 'activation threw' are different facts and a surface that
     * renders them identically teaches the user nothing.
     */
    private _openViewInMainEditor(viewId: string): void {
        const sheetId = this._activeSheetId;
        const outcome = activateViewForEditing(viewId);
        if (!outcome.ok) {
            console.warn(
                `[SheetEditorPanel] could not open view ${viewId} in the main editor: ` +
                `${outcome.reason}${outcome.detail ? ` (${outcome.detail})` : ''}`,
            );
            // The sheet stays OPEN on failure. Closing it would strand the user
            // on whatever the main editor happened to be showing, having lost
            // the sheet, to accomplish nothing.
            return;
        }
        console.log(`[SheetEditorPanel] opened view ${viewId} in the main editor as mode ${outcome.mode}`);
        this.close();
        // Remember where to come back to, matching the Edit-in-Place banner's
        // contract with `window.sheetEditorPanel.open(...)`.
        window.__sheetEditorPreviousSheet = sheetId; // TODO(F.6.5): panel-host registry bridge state — Phase F.6.5
    }

    /** Build the FocusOpts bag passed to the RendererBridge module. */
    private _makeFocusOpts(focusState: VpFocusState): FocusOpts {
        return {
            focusState,
            activeSheetId: this._activeSheetId,
            scaleFactor:   this._scaleFactor,
            renderDim:     (svgEl, w, h, fs) => renderDimAnnotations(svgEl, w, h, fs),
            getCamera:     () => this._cameraPx(focusState.vpId, focusState.scaleDenom),
            setCamera:     (cam) => this._setCameraPx(focusState.vpId, focusState.scaleDenom, cam),
            resetCamera:   () => { this._vpEditCtl.setEditCamera(focusState.vpId, { panWorldX: 0, panWorldY: 0, zoom: 1 }); },
            exitFocusMode: () => this._exitViewportFocusMode(),
            setFocusCleanup: (fn) => { this._vpFocusCleanup = fn; },
        };
    }

    // ── Partial refresh ────────────────────────────────────────────────────

    private _refresh(): void {
        if (!this._overlay || !this._activeSheetId) return;
        const sheet = sheetStore.get(this._activeSheetId);
        if (!sheet) { this.close(); return; }

        this._previewCanvases.forEach(({ viewId, canvas }) => {
            viewportPreviewRenderer.detach(viewId, canvas);
        });
        this._previewCanvases.clear();

        const newOverlay = this._build();
        document.body.replaceChild(newOverlay, this._overlay);
        this._overlay = newOverlay;
    }

    private _refreshCanvas(sheet: SheetDefinition): void {
        if (!this._overlay || !this._canvasEl) return;
        const canvasArea = this._canvasEl.parentElement;
        if (!canvasArea) return;

        this._previewCanvases.forEach(({ viewId, canvas }) => {
            viewportPreviewRenderer.detach(viewId, canvas);
        });
        this._previewCanvases.clear();

        const newCanvas = this._buildCanvas(sheet, canvasArea);
        canvasArea.replaceChild(newCanvas, this._canvasEl);
        this._canvasEl = newCanvas;
        this._applyTransform();
    }

    private _refreshSidebar(): void {
        if (!this._overlay || !this._sidebarEl || !this._activeSheetId) return;
        const sheet = sheetStore.get(this._activeSheetId);
        if (!sheet) return;
        const newSidebar = this._buildSidebar(sheet);
        this._overlay.querySelector('.sh-body')?.replaceChild(newSidebar, this._sidebarEl);
        this._sidebarEl = newSidebar;
    }
}
