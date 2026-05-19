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

// ── Wave 7 WS-B extracted modules ─────────────────────────────────────────
import type { SidebarOpts, FocusOpts, VpFocusState } from './SheetEditorContracts';
import { VIEW_TYPE_ICONS } from './SheetEditorContracts';
import {
    dispatchAddViewport,
    dispatchRemoveViewport,
    dispatchUpdateSheetField,
    showExportDialog,
    buildInlineScaleOverlay,
    enterEditInPlace,
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
            const syntheticEvt = { detail: payload } as unknown as Event;
            onDrawingRefreshed(syntheticEvt, this._activeSheetId, this._previewCanvases, renderThumbnail);
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
                document.removeEventListener('keydown', onKey);
                document.removeEventListener('keyup',  onKeyUp);
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
        document.addEventListener('keydown', onKey);
        document.addEventListener('keyup',   onKeyUp);

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
            hint.innerHTML  = 'No views placed<br><small>Use the view list on the right to add a view</small>';
            canvas.appendChild(hint);
        }

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
                    (this.runtime?.bus as any)?.executeCommand('sheet.moveViewport', {
                        sheetId, viewportId: vpId,
                        newPosition: { x: vp.position.x + dx, y: vp.position.y + dy },
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
        const vpWidth  = Math.max(80,  Math.min(usableW * 0.45, 200)) * sf;
        const vpHeight = Math.max(60, vpWidth * 0.7);

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
        previewCanvas.height    = Math.round(vpHeight - 22);

        // SC-11: In focus mode this viewport gets a camera-transform container + SVG dim overlay
        const isFocused = this._vpFocusState?.vpId === vp.id;
        let focusCamContainer: HTMLDivElement | null = null;
        let focusSvgEl:        SVGSVGElement  | null = null;

        if (isFocused && this._vpFocusState) {
            const fstate = this._vpFocusState;
            const camContainer = document.createElement('div');
            camContainer.className   = 'sh-vp-cam-container';
            camContainer.style.transform =
                `translate(${fstate.camOffset.x}px,${fstate.camOffset.y}px) scale(${fstate.camZoom})`;
            camContainer.appendChild(previewCanvas);

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
            contentEl.appendChild(previewCanvas);
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
        });
        vpEl.appendChild(removeBtn);

        // Attach preview renderer (TechnicalDrawing cache → thumbnail; else conventional)
        if (view) {
            this._previewCanvases.set(vp.id, { viewId: view.id, canvas: previewCanvas });

            if (viewTechnicalDrawingCache.has(view.id)) {
                renderThumbnail(vp, view.id, previewCanvas);
            } else {
                const isPlan       = ['plan', 'ceiling-plan', 'structural-plan'].includes(view.viewType);
                const isProjectable = ['elevation', 'section', 'detail'].includes(view.viewType);
                getFrameScheduler().scheduleOnce('sheet-editor-attach-preview', () => {
                    if (isPlan) {
                        viewportPreviewRenderer.attach(view, previewCanvas);
                    } else if (isProjectable) {
                        drawProjectingState(previewCanvas, view.viewType);
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
            const svgRef   = focusSvgEl;
            const camRef   = focusCamContainer;
            const pcanvasW = previewCanvas.width;
            const pcanvasH = previewCanvas.height;
            getFrameScheduler().scheduleOnce('sheet-editor-attach-focus', () => {
                if (this._vpFocusState) {
                    attachFocusInteraction(contentEl, camRef, svgRef, pcanvasW, pcanvasH,
                        this._makeFocusOpts(this._vpFocusState));
                }
            });
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

        // Double-click → SC-11 inline focus for 2D views; Edit-in-Place for 3D
        vpEl.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (!view) return;
            const is3d = ['3d', 'walkthrough', 'render'].includes(view.viewType);
            if (is3d) {
                enterEditInPlace(vp.id, view.id, () => this.close(), this._activeSheetId);
            } else {
                this._enterViewportFocusMode(vp, view);
            }
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
                (this.runtime?.bus as any)?.executeCommand('sheet.moveViewport', {
                    sheetId: sheet.id, viewportId: vp.id,
                    newPosition: { x: newX, y: newY },
                });
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

    // ── SC-11: Viewport focus mode ─────────────────────────────────────────

    private _enterViewportFocusMode(vp: SheetViewport, view: ViewDefinition): void {
        const prevAnnotations =
            this._vpFocusState?.vpId === vp.id ? this._vpFocusState.annotations : [];
        if (this._vpFocusCleanup) { this._vpFocusCleanup(); this._vpFocusCleanup = null; }
        this._vpFocusState = {
            vpId:        vp.id,
            viewId:      view.id,
            scaleDenom:  vp.scale ?? 100,
            camOffset:   { x: 0, y: 0 },
            camZoom:     1,
            activeTool:  'select',
            dimPoints:   [],
            annotations: prevAnnotations,
        };
        this._selectedVpId = vp.id;
        const sheet = this._activeSheetId ? sheetStore.get(this._activeSheetId) : null;
        if (sheet) this._refreshCanvas(sheet);
        console.log(`[SC-11] Entered viewport focus mode: vpId=${vp.id} view=${view.name}`);
    }

    private _exitViewportFocusMode(): void {
        if (!this._vpFocusState) return;
        if (this._vpFocusCleanup) { this._vpFocusCleanup(); this._vpFocusCleanup = null; }
        this._vpFocusState = null;
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
            removeViewport:      (sheetId, vpId)       => dispatchRemoveViewport(sheetId, vpId),
            addViewToSheet:      (sheet, view)          => dispatchAddViewport(sheet, view),
            refreshSidebar:      ()                     => this._refreshSidebar(),
            getRevisionFormOpen: ()                     => this._revisionFormOpen,
            setRevisionFormOpen: (open)                 => { this._revisionFormOpen = open; },
            getSelectedVpId:     ()                     => this._selectedVpId,
            getActiveSheetId:    ()                     => this._activeSheetId,
        };
    }

    /** Build the FocusOpts bag passed to the RendererBridge module. */
    private _makeFocusOpts(focusState: VpFocusState): FocusOpts {
        return {
            focusState,
            activeSheetId: this._activeSheetId,
            scaleFactor:   this._scaleFactor,
            renderDim:     (svgEl, w, h, fs) => renderDimAnnotations(svgEl, w, h, fs),
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
