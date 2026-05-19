/**
 * @file src/ui/import-manager/ImportManagerPanel.ts
 *
 * Import Manager Panel — Contract 32
 *
 * Central registry and control panel for all active imports in PRYZM:
 *   • IFC models        (event: pryzm-ifc-imported)
 *   • DXF/DWG overlays  (event: pryzm-dxf-overlay-added)
 *   • PDF/Image underlays (event: pryzm-floor-plan-underlay-placed)
 *   • Rhino .3dm models (event: pryzm-rhino-imported)
 *
 * Per-import actions:
 *   1. Delete          — removes the import from the scene
 *   2. Pin             — locks position (cannot be moved)
 *   3. Pin + No Select — locks position AND blocks pointer selection
 *   4. Hide all views  — hides the import across every view type
 *   5. Show all views  — makes the import visible in every view type
 *
 * CSS prefix: im-
 * CONTRACT §05 §3 — prefix im- registered.
 * CONTRACT §05 §6 — zero bim-* elements; pure native HTML.
 * CONTRACT §01 §2 — all mutations via dispatched window events.
 */

import { injectAppTheme } from '../styles/AppTheme';

export type ImportType = 'ifc' | 'dxf' | 'floor-plan' | 'rhino';

export interface ImportEntry {
    id: string;
    type: ImportType;
    name: string;
    fileName: string;
    visible: boolean;
    pinned: boolean;
    noSelect: boolean;
}

const TYPE_LABELS: Record<ImportType, string> = {
    ifc:          'IFC',
    dxf:          'DXF/DWG',
    'floor-plan': 'PDF/Image',
    rhino:        'Rhino',
};

const TYPE_ICONS: Record<ImportType, string> = {
    ifc: `<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>`,
    dxf: `<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="8" x2="12" y2="16"/>`,
    'floor-plan': `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>`,
    rhino: `<circle cx="12" cy="12" r="9"/><path d="M9 12c0-1.7 1.3-3 3-3s3 1.3 3 3-1.3 3-3 3"/>`,
};

function svgIcon(path: string, size = 14): string {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

const EYE_ON  = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
const EYE_OFF = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;
const PIN_ICON = `<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/>`;
const BLOCK_ICON = `<circle cx="12" cy="12" r="9"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>`;
const TRASH_ICON = `<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>`;

export class ImportManagerPanel {
    private readonly _el: HTMLElement;
    private _body!: HTMLElement;
    private _badge!: HTMLElement;
    private _isOpen = false;
    private _entries = new Map<string, ImportEntry>();

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        injectAppTheme();
        this._el = this._buildShell();
        document.body.appendChild(this._el);
        this._el.style.display = 'none';
        this._wireEvents();
        this._wireDrag();
        // Self-heal: pick up imports that were registered BEFORE the panel
        // mounted (e.g. UnderlayPersistence restores the underlay during
        // engine init, before initUI runs the panel constructor — its
        // 'pryzm-floor-plan-underlay-placed' event fires into a dead
        // listener, so we have to scan the live state on mount and after
        // every project switch).
        this._reconcileFromLiveState();
        window.runtime?.events?.on('pryzm-project-loaded', () => this._reconcileFromLiveState()); // F.events.9
        window.addEventListener('pryzm-project-switch', () => {
            // Project changed → drop stale entries; the new project's
            // restore + IFC re-import events will repopulate.
            this._entries.clear();
            this._render();
            // Defer the rescan so async restores have time to recreate the tools.
            setTimeout(() => this._reconcileFromLiveState(), 500);
        });
    }

    /**
     * Inspect window-exposed live import state and register anything not
     * already in our entry map. Idempotent — safe to call repeatedly.
     * Currently covers: PDF/Image underlay (via floorPlanUnderlayTool).
     * IFC, DXF, and Rhino still rely on their own load events because
     * they don't yet expose a queryable singleton.
     */
    private _reconcileFromLiveState(): void {
        try {
            const tool = window.floorPlanUnderlayTool; // TODO(E.floor.X): legacy floorPlanUnderlayTool — replace with runtime.tools.activate('underlay') after plugins/floor lands
            const state = tool?.getState?.();
            const mesh  = state?.mesh;
            if (tool && mesh) {
                // Reuse persisted fileName when available; fall back to mesh userData.
                const fileName =
                    (mesh.userData && (mesh.userData as any).fileName) ||
                    'Floor Plan';
                // Drop any stale floor-plan entries first to avoid ID drift
                for (const [k, v] of this._entries) {
                    if (v.type === 'floor-plan') this._entries.delete(k);
                }
                this._register({
                    id:       `floor-plan-${(mesh.uuid || Date.now()).toString()}`,
                    type:     'floor-plan',
                    name:     fileName,
                    fileName,
                    visible:  mesh.visible !== false,
                    pinned:   !!state.locked,
                    noSelect: false,
                });
            }
        } catch (err) {
            console.warn('[ImportManagerPanel] reconcileFromLiveState failed:', err);
        }
    }

    open(): void {
        this._isOpen = true;
        this._el.style.display = 'flex';
    }

    close(): void {
        this._isOpen = false;
        this._el.style.display = 'none';
    }

    toggle(): void {
        if (this._isOpen) this.close(); else this.open();
    }

    get isOpen(): boolean { return this._isOpen; }

    get count(): number { return this._entries.size; }

    private _buildShell(): HTMLElement {
        const el = document.createElement('div');
        el.className = 'im-panel';
        el.id = 'import-manager-panel';
        el.innerHTML = `
            <div class="im-header">
                <div class="im-header-left">
                    ${svgIcon(`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>`, 15)}
                    <span class="im-title">Import Manager</span>
                    <span class="im-badge" id="im-count-badge">0</span>
                </div>
                <button class="im-close" type="button" aria-label="Close panel">\u00d7</button>
            </div>
            <div class="im-body" id="im-panel-body"></div>
        `;
        this._body  = el.querySelector('#im-panel-body') as HTMLElement;
        this._badge = el.querySelector('#im-count-badge') as HTMLElement;
        el.querySelector('.im-close')!.addEventListener('click', () => this.close());
        this._renderEmpty();
        return el;
    }

    /**
     * Make the panel draggable by its purple header.
     * Pointer-down on .im-header (excluding the close button) starts a drag;
     * pointer-move repositions the panel via top/left; pointer-up ends it.
     * Position is clamped to keep the header on-screen.
     */
    private _wireDrag(): void {
        const header = this._el.querySelector('.im-header') as HTMLElement | null;
        if (!header) return;

        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        const onPointerDown = (ev: PointerEvent) => {
            // Ignore drags that start on interactive controls in the header
            if ((ev.target as HTMLElement).closest('.im-close')) return;
            const rect = this._el.getBoundingClientRect();
            offsetX = ev.clientX - rect.left;
            offsetY = ev.clientY - rect.top;
            dragging = true;
            header.classList.add('im-header--dragging');
            // Switch from right-anchored to left-anchored once the user grabs it
            this._el.style.right = 'auto';
            this._el.style.left  = `${rect.left}px`;
            this._el.style.top   = `${rect.top}px`;
            header.setPointerCapture(ev.pointerId);
            ev.preventDefault();
        };

        const onPointerMove = (ev: PointerEvent) => {
            if (!dragging) return;
            const w = this._el.offsetWidth;
            const headerH = header.offsetHeight;
            const maxX = window.innerWidth - 40;   // keep at least 40px on screen
            const maxY = window.innerHeight - headerH;
            const nextX = Math.min(maxX, Math.max(40 - w, ev.clientX - offsetX));
            const nextY = Math.min(maxY, Math.max(0, ev.clientY - offsetY));
            this._el.style.left = `${nextX}px`;
            this._el.style.top  = `${nextY}px`;
        };

        const onPointerUp = (ev: PointerEvent) => {
            if (!dragging) return;
            dragging = false;
            header.classList.remove('im-header--dragging');
            try { header.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
        };

        header.addEventListener('pointerdown', onPointerDown);
        header.addEventListener('pointermove', onPointerMove);
        header.addEventListener('pointerup', onPointerUp);
        header.addEventListener('pointercancel', onPointerUp);
    }

    private _wireEvents(): void {
        window.runtime?.events?.on('pryzm-ifc-imported', (d: { modelId: string; modelName?: string; fileName?: string }) => { // F.events.13
            if (!d?.modelId) return;
            this._register({
                id:       d.modelId,
                type:     'ifc',
                name:     d.modelName ?? d.fileName ?? 'IFC Model',
                fileName: d.fileName ?? d.modelId,
                visible:  true,
                pinned:   false,
                noSelect: false,
            });
        });

        window.runtime?.events?.on('pryzm-dxf-overlay-added', (d: { overlayId: string; fileName: string; group?: unknown }) => { // F.events.13
            const id = d?.overlayId;
            if (!id) return;
            this._register({
                id,
                type:     'dxf',
                name:     d?.fileName ?? id,
                fileName: d?.fileName ?? id,
                visible:  true,
                pinned:   false,
                noSelect: false,
            });
        });

        window.runtime?.events?.on('pryzm-floor-plan-underlay-placed', (d: { underlayId: string; fileName: string; restored?: boolean }) => { // F.events.13
            const id = d?.underlayId ?? 'floor-plan-underlay';
            this._entries.delete('floor-plan-underlay');
            this._register({
                id,
                type:     'floor-plan',
                name:     d?.fileName ?? 'Floor Plan',
                fileName: d?.fileName ?? 'Floor Plan',
                visible:  true,
                pinned:   true,
                noSelect: false,
            });
        });

        // F.events.2d — runtime.events subscription (dispatch migrated to runtime.events.emit below).
        window.runtime?.events?.on('pryzm-rhino-imported', (payload: unknown) => {
            const d = payload as { modelId?: string; fileName?: string } | undefined;
            if (!d?.modelId) return;
            this._register({
                id:       d.modelId,
                type:     'rhino',
                name:     d.fileName ?? 'Rhino Model',
                fileName: d.fileName ?? d.modelId,
                visible:  true,
                pinned:   false,
                noSelect: false,
            });
        });

        window.runtime?.events?.on('pryzm-import-model-remove', (p: { modelId: string }) => { // F.events.13
            if (p.modelId && this._entries.has(p.modelId)) {
                this._entries.delete(p.modelId);
                this._render();
            }
        });

        window.runtime?.events?.on('pryzm-dxf-overlay-removed', () => { // F.events.13
            for (const [k, v] of this._entries) {
                if (v.type === 'dxf') this._entries.delete(k);
            }
            this._render();
        });

        window.runtime?.events?.on('pryzm-floor-plan-underlay-removed', () => { // F.events.13
            for (const [k, v] of this._entries) {
                if (v.type === 'floor-plan') this._entries.delete(k);
            }
            this._render();
        });

        window.runtime?.events?.on('pryzm-rhino-remove', (p: { modelId: string }) => { // F.events.15
            const id = p.modelId;
            if (id && this._entries.has(id)) {
                this._entries.delete(id);
                this._render();
            }
        });
    }

    private _register(entry: ImportEntry): void {
        this._entries.set(entry.id, entry);
        this._render();
        if (!this._isOpen) this.open();
    }

    private _render(): void {
        this._badge.textContent = String(this._entries.size);
        this._body.innerHTML = '';

        if (this._entries.size === 0) {
            this._renderEmpty();
            return;
        }

        for (const entry of this._entries.values()) {
            this._body.appendChild(this._buildRow(entry));
        }
    }

    private _renderEmpty(): void {
        this._body.innerHTML = `
            <div class="im-empty">
                <div class="im-empty-icon">${svgIcon(`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>`, 32)}</div>
                <div class="im-empty-title">No active imports</div>
                <div class="im-empty-text">Import an IFC, DXF/DWG, PDF/Image, or Rhino file from the Export &amp; Print panel. All active imports will appear here for management.</div>
            </div>
        `;
    }

    private _buildRow(entry: ImportEntry): HTMLElement {
        const row = document.createElement('div');
        row.className = 'im-row';
        row.dataset.importId = entry.id;

        row.innerHTML = `
            <div class="im-row-info">
                <span class="im-type-badge im-type--${entry.type}">${svgIcon(TYPE_ICONS[entry.type], 10)} ${TYPE_LABELS[entry.type]}</span>
                <span class="im-row-name" title="${this._esc(entry.fileName)}">${this._esc(entry.name)}</span>
            </div>
            <div class="im-row-actions">
                <button class="im-btn im-btn--icon${entry.visible ? ' im-btn--active' : ''}"
                    data-action="toggle-visibility"
                    title="${entry.visible ? 'Visible — click to hide from all views' : 'Hidden — click to show in all views'}">
                    ${svgIcon(entry.visible ? EYE_ON : EYE_OFF)}
                </button>
                <button class="im-btn im-btn--icon${entry.pinned && !entry.noSelect ? ' im-btn--pinned' : ''}"
                    data-action="pin"
                    title="${entry.pinned && !entry.noSelect ? 'Pinned (locked) — click to unpin' : 'Pin: lock position'}">
                    ${svgIcon(PIN_ICON)}
                </button>
                <button class="im-btn im-btn--icon${entry.noSelect ? ' im-btn--noselect' : ''}"
                    data-action="no-select"
                    title="${entry.noSelect ? 'Selection blocked — click to allow selection' : 'Pin + block selection'}">
                    ${svgIcon(BLOCK_ICON)}
                </button>
                <button class="im-btn im-btn--delete"
                    data-action="delete"
                    title="Remove import from scene">
                    ${svgIcon(TRASH_ICON)}
                </button>
            </div>
        `;

        row.querySelector('[data-action="toggle-visibility"]')!.addEventListener('click', () => {
            entry.visible = !entry.visible;
            this._dispatchVisibility(entry);
            this._render();
        });

        row.querySelector('[data-action="pin"]')!.addEventListener('click', () => {
            if (entry.pinned && !entry.noSelect) {
                entry.pinned   = false;
                entry.noSelect = false;
            } else {
                entry.pinned   = true;
                entry.noSelect = false;
            }
            this._dispatchLock(entry);
            this._render();
        });

        row.querySelector('[data-action="no-select"]')!.addEventListener('click', () => {
            entry.noSelect = !entry.noSelect;
            if (entry.noSelect) entry.pinned = true;
            this._dispatchLock(entry);
            this._render();
        });

        row.querySelector('[data-action="delete"]')!.addEventListener('click', () => {
            this._dispatchDelete(entry);
            this._entries.delete(entry.id);
            this._render();
        });

        return row;
    }

    private _dispatchVisibility(entry: ImportEntry): void {
        const detail = { visible: entry.visible };
        switch (entry.type) {
            case 'ifc':
                window.runtime?.events?.emit('pryzm-import-model-visibility', { modelId: entry.id, visible: entry.visible }); // F.events.13
                break;
            case 'dxf':
                window.runtime?.events?.emit('pryzm-dxf-overlay-set-visibility', { overlayId: entry.id, visible: entry.visible }); // F.events.13
                break;
            case 'floor-plan':
                window.runtime?.events?.emit('pryzm-floor-plan-underlay-set-visibility', detail); // F.events.13
                break;
            case 'rhino':
                window.runtime?.events?.emit('pryzm-rhino-set-visibility', { modelId: entry.id, visible: entry.visible }); // F.events.15
                break;
        }
        console.log(`[ImportManager] visibility → ${entry.type}/${entry.id} visible=${entry.visible}`);
    }

    private _dispatchLock(entry: ImportEntry): void {
        const detail = { locked: entry.pinned, noSelect: entry.noSelect };
        switch (entry.type) {
            case 'ifc':
                window.runtime?.events?.emit('pryzm-import-model-set-locked', { modelId: entry.id, ...detail }); // F.events.13
                break;
            case 'dxf':
                window.runtime?.events?.emit('pryzm-dxf-overlay-set-locked', { overlayId: entry.id, ...detail }); // F.events.13
                break;
            case 'floor-plan':
                window.runtime?.events?.emit('pryzm-floor-plan-underlay-set-locked', detail); // F.events.13
                break;
            case 'rhino':
                window.runtime?.events?.emit('pryzm-rhino-set-locked', { modelId: entry.id, ...detail }); // F.events.15
                break;
        }
        console.log(`[ImportManager] lock → ${entry.type}/${entry.id} pinned=${entry.pinned} noSelect=${entry.noSelect}`);
    }

    private _dispatchDelete(entry: ImportEntry): void {
        switch (entry.type) {
            case 'ifc':
                window.runtime?.events?.emit('pryzm-import-model-remove', { modelId: entry.id }); // F.events.13
                break;
            case 'dxf':
                window.runtime?.events?.emit('pryzm-dxf-overlay-remove', { overlayId: entry.id }); // F.events.13
                break;
            case 'floor-plan':
                window.runtime?.events?.emit('pryzm-floor-plan-underlay-remove', {}); // F.events.13
                break;
            case 'rhino':
                window.runtime?.events?.emit('pryzm-rhino-remove', { modelId: entry.id }); // F.events.15
                break;
        }
        console.log(`[ImportManager] delete → ${entry.type}/${entry.id}`);
    }

    private _esc(s: string): string {
        return s.replace(/[&<>"']/g, c => (
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c] ?? c
        ));
    }
}
