/**
 * RailPanelController — manages the floating sub-panel that appears to the
 * right of the vb-panel when a section is activated in the left rail.
 *
 * Supports:
 *   - noHeader mode: hides the built-in gradient header so the builder can
 *     render its own (used by UnifiedBrowserPanel / BROWSER section).
 *   - Right-edge resize handle: users drag to any width, persisted in localStorage.
 *
 * Contract compliance:
 *   §05 §2.1 — CSS styles in AppTheme.ts RAIL_PANEL_STYLES (rp- prefix)
 *   §05 §3   — Prefix rp- claimed (Rail Panel)
 *   §05 §6   — Zero bim-* / @thatopen/ui elements; pure native HTML
 *   §05 §7.6 — No independent <style> injection
 *   §01      — Read-only UI layer; no store mutations
 */

import { panelManager } from '../PanelManager';

const PM_ID          = 'rail:left';
const LS_WIDTH_KEY   = 'rp-panel-width';
const LS_HEIGHT_KEY  = 'rp-panel-height';
const LS_PINNED_KEY  = 'rp-panel-pinned';
const DEFAULT_WIDTH  = 280;
const MIN_WIDTH      = 220;
const MAX_WIDTH      = 600;
const MIN_HEIGHT     = 180;

interface OpenOptions {
    noHeader?: boolean;
}

export class RailPanelController {
    private _panel:         HTMLElement;
    private _header:        HTMLElement;
    private _body:          HTMLElement;
    private _titleEl:       HTMLElement;
    private _pinBtn:        HTMLElement;
    private _activeId:      string | null = null;
    private _activeBuilder: (() => HTMLElement) | null = null;
    private _panelWidth:    number;
    private _panelHeight:   number | null;  // null = fill available
    private _pinned:        boolean;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._panelWidth  = this._loadWidth();
        this._panelHeight = this._loadHeight();
        this._pinned      = this._loadPinned();

        const panel = document.createElement('div');
        panel.className = 'rp-panel';
        panel.style.display = 'none';
        panel.style.width   = `${this._panelWidth}px`;

        const header = document.createElement('div');
        header.className = 'rp-header';
        this._header = header;

        const title = document.createElement('span');
        title.className = 'rp-header-title';
        this._titleEl = title;

        const headerActions = document.createElement('div');
        headerActions.className = 'rp-header-actions';

        const pinBtn = document.createElement('button');
        pinBtn.className = 'rp-pin-btn' + (this._pinned ? ' rp-pin-btn--active' : '');
        pinBtn.type = 'button';
        pinBtn.title = this._pinned ? 'Unpin panel (keep open)' : 'Pin panel (keep open)';
        pinBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/></svg>`;
        pinBtn.addEventListener('click', () => this._togglePin());
        this._pinBtn = pinBtn;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'rp-close-btn';
        closeBtn.type = 'button';
        closeBtn.title = 'Close panel';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => this.close());

        headerActions.appendChild(pinBtn);
        headerActions.appendChild(closeBtn);
        header.appendChild(title);
        header.appendChild(headerActions);

        const body = document.createElement('div');
        body.className = 'rp-body';
        this._body = body;

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'rp-resize-handle';
        resizeHandle.title     = 'Drag to resize width';
        this._attachResizeDrag(resizeHandle, panel);

        const resizeHandleBottom = document.createElement('div');
        resizeHandleBottom.className = 'rp-resize-handle-bottom';
        resizeHandleBottom.title     = 'Drag to resize height';
        this._attachHeightResizeDrag(resizeHandleBottom, panel);

        panel.appendChild(header);
        panel.appendChild(body);
        panel.appendChild(resizeHandle);
        panel.appendChild(resizeHandleBottom);

        document.body.appendChild(panel);
        this._panel = panel;

        panelManager.register(PM_ID, () => { if (!this._pinned) this.close(); });

        // Recalculate position whenever the viewport or panel layout changes
        // (e.g. when the vb-panel is pinned/unpinned to the dock zone).
        window.addEventListener('resize', () => {
            if (this._activeId !== null) this._updatePosition();
        });
    }

    get activeId(): string | null {
        return this._activeId;
    }

    get isPinned(): boolean {
        return this._pinned;
    }

    togglePinned(): void {
        this._togglePin();
    }

    open(id: string, label: string, builder: () => HTMLElement, opts: OpenOptions = {}): void {
        panelManager.notifyOpened(PM_ID);
        this._activeId      = id;
        this._activeBuilder = builder;
        this._titleEl.textContent = label;

        // noHeader: hide rp-header; builder renders its own full-height content.
        // overflow-y must be 'auto' (not 'hidden') so the body can scroll when
        // the panel content overflows — required for the Views & Sheets panel.
        if (opts.noHeader) {
            this._header.style.display     = 'none';
            this._body.style.padding       = '0';
            this._body.style.overflowY     = 'auto';
            this._body.style.display       = 'flex';
            this._body.style.flexDirection = 'column';
            this._body.style.minHeight     = '0';
        } else {
            this._header.style.display     = '';
            this._body.style.padding       = '';
            this._body.style.overflowY     = '';
            this._body.style.display       = '';
            this._body.style.flexDirection = '';
            this._body.style.minHeight     = '';
        }

        this._body.innerHTML = '';
        this._body.appendChild(builder());
        this._updatePosition();
        this._panel.style.display       = 'flex';
        this._panel.style.flexDirection = 'column';
        this._panel.classList.remove('rp-panel--animating');
        void this._panel.offsetWidth;
        this._panel.classList.add('rp-panel--animating');
        window.runtime?.events?.emit('pryzm-rail-panel-state-changed', { activeId: this._activeId, pinned: this._pinned }); // F.events.12
    }

    close(): void {
        this._activeId      = null;
        this._activeBuilder = null;
        this._panel.style.display = 'none';
        this._body.innerHTML = '';
        this._panel.classList.remove('rp-panel--animating');
        this._header.style.display = '';
        this._body.style.paddingTop = '';
        panelManager.notifyClosed(PM_ID);
        window.runtime?.events?.emit('pryzm-rail-panel-state-changed', { activeId: this._activeId, pinned: this._pinned }); // F.events.12
    }

    toggle(id: string, label: string, builder: () => HTMLElement, opts: OpenOptions = {}): void {
        if (this._activeId === id) {
            this.close();
        } else {
            this.open(id, label, builder, opts);
        }
    }

    refreshIfActive(id: string): void {
        if (this._activeId !== id || !this._activeBuilder) return;
        const builder = this._activeBuilder;
        this._body.innerHTML = '';
        this._body.appendChild(builder());
    }

    private _updatePosition(): void {
        const vbPanel = document.querySelector('.vb-panel');
        if (!vbPanel) return;
        const rect       = vbPanel.getBoundingClientRect();
        const availableH = window.innerHeight - rect.top - 12;
        const panelH     = this._panelHeight !== null
            ? Math.min(Math.max(MIN_HEIGHT, this._panelHeight), availableH)
            : availableH;
        this._panel.style.position  = 'fixed';
        this._panel.style.left      = `${rect.right + 4}px`;
        this._panel.style.top       = `${rect.top}px`;
        this._panel.style.maxHeight = `${availableH}px`;
        this._panel.style.height    = `${panelH}px`;
    }

    // ── Width resize handle ────────────────────────────────────────────────────

    private _attachResizeDrag(handle: HTMLElement, panel: HTMLElement): void {
        let startX   = 0;
        let startW   = 0;
        let dragging = false;

        const onMouseMove = (e: MouseEvent) => {
            if (!dragging) return;
            const delta    = e.clientX - startX;
            const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW + delta));
            panel.style.width   = `${newWidth}px`;
            this._panelWidth    = newWidth;
        };

        const onMouseUp = () => {
            if (!dragging) return;
            dragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup',   onMouseUp);
            document.body.style.cursor     = '';
            document.body.style.userSelect = '';
            this._saveWidth(this._panelWidth);
        };

        handle.addEventListener('mousedown', (e: MouseEvent) => {
            e.preventDefault();
            startX   = e.clientX;
            startW   = panel.offsetWidth || this._panelWidth;
            dragging = true;
            document.body.style.cursor     = 'col-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup',   onMouseUp);
        });
    }

    private _loadWidth(): number {
        try {
            const stored = localStorage.getItem(LS_WIDTH_KEY);
            if (stored) {
                const n = parseInt(stored, 10);
                if (!isNaN(n) && n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
            }
        } catch { /* ignore */ }
        return DEFAULT_WIDTH;
    }

    private _saveWidth(width: number): void {
        try {
            localStorage.setItem(LS_WIDTH_KEY, String(Math.round(width)));
        } catch { /* ignore */ }
    }

    // ── Height resize handle ───────────────────────────────────────────────────

    private _attachHeightResizeDrag(handle: HTMLElement, panel: HTMLElement): void {
        let startY   = 0;
        let startH   = 0;
        let dragging = false;

        const onMouseMove = (e: MouseEvent) => {
            if (!dragging) return;
            const vbPanel    = document.querySelector('.vb-panel');
            const availableH = vbPanel
                ? window.innerHeight - vbPanel.getBoundingClientRect().top - 12
                : window.innerHeight - 12;
            const delta    = e.clientY - startY;
            const newH     = Math.min(availableH, Math.max(MIN_HEIGHT, startH + delta));
            panel.style.height  = `${newH}px`;
            this._panelHeight   = newH;
        };

        const onMouseUp = () => {
            if (!dragging) return;
            dragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup',   onMouseUp);
            document.body.style.cursor     = '';
            document.body.style.userSelect = '';
            if (this._panelHeight !== null) this._saveHeight(this._panelHeight);
        };

        handle.addEventListener('mousedown', (e: MouseEvent) => {
            e.preventDefault();
            startY   = e.clientY;
            startH   = panel.offsetHeight || (this._panelHeight ?? window.innerHeight);
            dragging = true;
            document.body.style.cursor     = 'row-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup',   onMouseUp);
        });
    }

    private _loadHeight(): number | null {
        try {
            const stored = localStorage.getItem(LS_HEIGHT_KEY);
            if (stored) {
                const n = parseInt(stored, 10);
                if (!isNaN(n) && n >= MIN_HEIGHT) return n;
            }
        } catch { /* ignore */ }
        return null;  // null = fill all available height (default)
    }

    private _saveHeight(height: number): void {
        try {
            localStorage.setItem(LS_HEIGHT_KEY, String(Math.round(height)));
        } catch { /* ignore */ }
    }

    // ── Pin / unpin ────────────────────────────────────────────────────────────

    private _togglePin(): void {
        this._pinned = !this._pinned;
        this._savePinned(this._pinned);
        this._pinBtn.classList.toggle('rp-pin-btn--active', this._pinned);
        this._pinBtn.title = this._pinned ? 'Unpin panel' : 'Pin panel (keep open)';
        window.runtime?.events?.emit('pryzm-rail-panel-state-changed', { activeId: this._activeId, pinned: this._pinned }); // F.events.12
    }

    private _loadPinned(): boolean {
        try {
            return localStorage.getItem(LS_PINNED_KEY) === 'true';
        } catch { return false; }
    }

    private _savePinned(value: boolean): void {
        try {
            localStorage.setItem(LS_PINNED_KEY, String(value));
        } catch { /* ignore */ }
    }
}
