/**
 * ToolsRailController — manages the floating sub-panel that appears to the
 * LEFT of the tp-panel when a section is activated in the right tools rail.
 *
 * Mirrors RailPanelController (used by the left vb-panel rail) but anchors
 * to the LEFT edge of .tp-panel rather than the right edge of .vb-panel.
 *
 * Contract compliance:
 *   §05 §2.1 — CSS styles injected via AppTheme.ts TPR_STYLES (tpr- prefix)
 *   §05 §3   — Prefix tpr- claimed (Tools Panel Rail)
 *   §05 §6   — Zero bim-* / @thatopen/ui elements; pure native HTML
 *   §05 §7.6 — No independent <style> injection
 *   §01      — Read-only UI layer; no store mutations
 */

import { panelManager } from '../PanelManager';

const PM_ID       = 'rail:right';
const LS_WIDTH    = 'pryzm-tpr-width-v4';
const LS_PINNED   = 'pryzm-tpr-pinned';
const DEFAULT_W   = 180;
const MIN_W       = 62;
const MAX_W       = 720;

export class ToolsRailController {
    private _panel:          HTMLElement;
    private _body:           HTMLElement;
    private _titleEl:        HTMLElement;
    private _pinBtn:         HTMLElement;
    private _activeId:       string | null = null;
    private _activeBuilder:  (() => HTMLElement) | null = null;
    private _activeBtnRef:   HTMLElement | null = null;
    private _panelWidth:     number;
    private _pinned:         boolean;
    /** When set, takes priority over _panelWidth — used by sub-panels that need extra room (e.g. furniture library). */
    private _widthOverride:  number | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._panelWidth = this._loadWidth();
        this._pinned     = this._loadPinned();

        const panel = document.createElement('div');
        panel.className = 'tpr-panel';
        panel.style.display = 'none';

        const header = document.createElement('div');
        header.className = 'tpr-header';

        const title = document.createElement('span');
        title.className = 'tpr-header-title';
        this._titleEl = title;

        const headerActions = document.createElement('div');
        headerActions.className = 'tpr-header-actions';

        const pinBtn = document.createElement('button');
        pinBtn.className = 'tpr-pin-btn' + (this._pinned ? ' tpr-pin-btn--active' : '');
        pinBtn.type = 'button';
        pinBtn.title = this._pinned ? 'Unpin panel' : 'Pin panel (keep open)';
        pinBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/></svg>`;
        pinBtn.addEventListener('click', () => this._togglePin());
        this._pinBtn = pinBtn;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'tpr-close-btn';
        closeBtn.type = 'button';
        closeBtn.title = 'Close panel';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => this.close());

        headerActions.appendChild(pinBtn);
        headerActions.appendChild(closeBtn);
        header.appendChild(title);
        header.appendChild(headerActions);

        const body = document.createElement('div');
        body.className = 'tpr-body';
        this._body = body;

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'tpr-resize-handle';
        resizeHandle.title = 'Drag to resize width';
        this._attachResizeDrag(resizeHandle, panel);

        panel.appendChild(resizeHandle);
        panel.appendChild(header);
        panel.appendChild(body);

        document.body.appendChild(panel);
        this._panel = panel;

        panelManager.register(PM_ID, () => { if (!this._pinned) this.close(); });
    }

    get activeId(): string | null {
        return this._activeId;
    }

    open(id: string, label: string, builder: () => HTMLElement, triggerBtn?: HTMLElement): void {
        panelManager.notifyOpened(PM_ID);
        this._activeBtnRef?.classList.remove('tp-section-btn--active');

        this._activeId      = id;
        this._activeBuilder = builder;
        this._activeBtnRef  = triggerBtn ?? null;

        this._titleEl.textContent = label;
        this._body.innerHTML = '';
        this._body.appendChild(builder());
        this._updatePosition();

        this._panel.style.display       = 'flex';
        this._panel.style.flexDirection = 'column';
        this._panel.classList.remove('tpr-panel--animating');
        void this._panel.offsetWidth;
        this._panel.classList.add('tpr-panel--animating');

        triggerBtn?.classList.add('tp-section-btn--active');
        // F.events.3: no active DOM listeners for tpr-rail-toggled — dispatch removed (TASK-12)
    }

    close(): void {
        this._activeBtnRef?.classList.remove('tp-section-btn--active');
        this._activeId      = null;
        this._activeBuilder = null;
        this._activeBtnRef  = null;
        this._panel.style.display = 'none';
        this._body.innerHTML = '';
        this._panel.classList.remove('tpr-panel--animating');
        panelManager.notifyClosed(PM_ID);
        // F.events.3: no active DOM listeners for tpr-rail-toggled — dispatch removed (TASK-12)
    }

    toggle(id: string, label: string, builder: () => HTMLElement, triggerBtn?: HTMLElement): void {
        if (this._activeId === id) {
            this.close();
        } else {
            this.open(id, label, builder, triggerBtn);
        }
    }

    /**
     * Re-renders the panel content if the given sectionId is currently active.
     * Called by section panel classes when their store data changes.
     */
    refreshIfActive(id: string): void {
        if (this._activeId !== id || !this._activeBuilder) return;
        const builder = this._activeBuilder;
        this._body.innerHTML = '';
        this._body.appendChild(builder());
    }

    /**
     * Positions the floating panel immediately to the LEFT of .tp-panel,
     * using getBoundingClientRect() so it always tracks the actual DOM position.
     */
    private _updatePosition(): void {
        const tpPanel = document.querySelector('.tp-panel');
        if (!tpPanel) return;
        const rect = tpPanel.getBoundingClientRect();
        this._panel.style.position  = 'fixed';
        this._panel.style.right     = `${window.innerWidth - rect.left + 7}px`;
        this._panel.style.left      = 'auto';
        this._panel.style.top       = `${rect.top}px`;
        this._panel.style.width     = `${this._widthOverride ?? this._panelWidth}px`;
        this._panel.style.maxHeight = `${window.innerHeight - rect.top - 11}px`;
    }

    /**
     * Temporarily override the panel width (e.g. when a sub-panel like the
     * furniture library needs more room). Pass `null` to restore the
     * user-resized width.  Persists nothing — purely transient.
     */
    setWidthOverride(width: number | null): void {
        this._widthOverride = width;
        if (this._panel.style.display !== 'none') this._updatePosition();
    }

    // ── Left-edge drag-to-resize ───────────────────────────────────────────────

    private _attachResizeDrag(handle: HTMLElement, panel: HTMLElement): void {
        let startX   = 0;
        let startW   = 0;
        let dragging = false;

        const onMouseMove = (e: MouseEvent) => {
            if (!dragging) return;
            const delta    = startX - e.clientX;
            const newWidth = Math.min(MAX_W, Math.max(MIN_W, startW + delta));
            panel.style.width    = `${newWidth}px`;
            this._panelWidth     = newWidth;
            // User dragged — clear any temporary override so manual resize wins.
            this._widthOverride  = null;
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
            const stored = localStorage.getItem(LS_WIDTH);
            if (stored) {
                const n = parseInt(stored, 10);
                if (!isNaN(n) && n >= MIN_W && n <= MAX_W) return n;
            }
        } catch { /* ignore */ }
        return DEFAULT_W;
    }

    private _saveWidth(width: number): void {
        try {
            localStorage.setItem(LS_WIDTH, String(Math.round(width)));
        } catch { /* ignore */ }
    }

    // ── Pin / unpin ────────────────────────────────────────────────────────────

    private _togglePin(): void {
        this._pinned = !this._pinned;
        this._savePinned(this._pinned);
        this._pinBtn.classList.toggle('tpr-pin-btn--active', this._pinned);
        this._pinBtn.title = this._pinned ? 'Unpin panel' : 'Pin panel (keep open)';
    }

    private _loadPinned(): boolean {
        try {
            return localStorage.getItem(LS_PINNED) === 'true';
        } catch { return false; }
    }

    private _savePinned(value: boolean): void {
        try {
            localStorage.setItem(LS_PINNED, String(value));
        } catch { /* ignore */ }
    }
}
