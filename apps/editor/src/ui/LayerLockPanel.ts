/**
 * LayerLockPanel — Wave 6 Phase B (wave-6-b-d2)
 *
 * BIM layer lock management panel: per-element-type lock/unlock toggle.
 * Locked layers cannot be selected or edited by the user.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — State mutation through Commands; this panel fires
 *   CustomEvents consumed by initUI.ts.  Direct store writes are avoided.
 * • §02-ARCHITECTURE §3.3 — UI layer (src/ui/) may not import from src/core/.
 *   Lock state is kept in `window.layerLock` for backward compatibility.
 *   Phase E.layer.S will migrate to `runtime.stores.layer`.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • P8 — OTel span emitted inside activatePanel / deactivatePanel (runtime-composer).
 *
 * Public API
 * ──────────
 *   const llp = new LayerLockPanel(runtime);
 *   document.body.appendChild(llp.element);
 *   llp.show();   // activates panel binding
 *   llp.hide();   // deactivates panel binding
 *
 * TODO(E.layer.S): migrate window.layerLock → runtime.stores.layer
 * TODO(E.layer.S): replace CustomEvent → runtime.bus.executeCommand('layer.lock.toggle', ...)
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

// ── Panel ID constant ─────────────────────────────────────────────────────────
export const LAYER_LOCK_PANEL_ID = 'layer-lock-panel' as const;

// ── Layer definitions (shared with LayerPanel) ────────────────────────────────
export interface BimLayerLockDef {
    readonly id: string;
    readonly label: string;
    readonly icon: string;
}

export const BIM_LAYER_LOCK_DEFS: readonly BimLayerLockDef[] = [
    { id: 'wall',         label: 'Walls',        icon: '▦' },
    { id: 'slab',         label: 'Slabs',        icon: '▬' },
    { id: 'roof',         label: 'Roofs',        icon: '△' },
    { id: 'door',         label: 'Doors',        icon: '🚪' },
    { id: 'window',       label: 'Windows',      icon: '⬜' },
    { id: 'stair',        label: 'Stairs',       icon: '≡' },
    { id: 'curtain-wall', label: 'Curtain Walls', icon: '⬛' },
    { id: 'furniture',    label: 'Furniture',    icon: '🛋' },
    { id: 'annotation',   label: 'Annotations',  icon: '📝' },
];

// ── Inline styles ─────────────────────────────────────────────────────────────
const LAYER_LOCK_PANEL_STYLES = `
.llp-panel {
    position: fixed;
    top: 56px;
    left: 236px;
    width: 220px;
    background: var(--app-panel-bg, #ffffff);
    color: var(--app-text, #333333);
    border: 1px solid rgba(0,0,0,0.12);
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
    font-family: var(--app-font, 'Inter', sans-serif);
    font-size: 13px;
    z-index: 950;
    display: none;
    overflow: hidden;
}
.llp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
}
.llp-title {
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-text-secondary, #666);
}
.llp-close-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    color: var(--app-text-secondary, #888);
    padding: 0 2px;
    line-height: 1;
}
.llp-close-btn:hover { color: var(--app-text, #333); }
.llp-body { padding: 6px 0; }
.llp-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    cursor: pointer;
    user-select: none;
    transition: background 0.1s;
}
.llp-row:hover { background: rgba(0,0,0,0.04); }
.llp-row.llp-locked { opacity: 0.6; }
.llp-icon { font-size: 14px; width: 18px; text-align: center; flex-shrink: 0; }
.llp-name { flex: 1; }
.llp-lock { font-size: 14px; color: var(--app-text-secondary, #888); flex-shrink: 0; }
`;

// ── Lock state helpers ────────────────────────────────────────────────────────
function getLayerLockState(): Record<string, boolean> {
    if (typeof window === 'undefined') return {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return window.layerLock ?? {};
}

function isLayerLocked(layerId: string): boolean {
    return getLayerLockState()[layerId] === true;
}

// ── LayerLockPanel class ──────────────────────────────────────────────────────

export class LayerLockPanel {
    /** Root DOM element — append to document.body or a layout container. */
    public readonly element: HTMLDivElement;

    /** Phase B (S83-WIRE wave-6-b-d2) — runtime threaded by parent. */
    public readonly runtime: PryzmRuntime | null;

    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;

        if (!runtime) {
            console.warn(
                '[LayerLockPanel] runtime is null — activatePanel/deactivatePanel binding ' +
                'will be skipped.  Wire a PryzmRuntime instance in the composition root. ' +
                '(wave-6-b-d2)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'llp-panel';
        this._injectStyles();
        this._buildDOM();
    }

    // ── Public lifecycle API ──────────────────────────────────────────────────

    /** Show the panel and register it with the runtime view registry. */
    public show(): void {
        this.element.style.display = 'block';
        this._refresh();
        if (this.runtime) {
            const spec: PanelViewSpec = {
                label: 'Layer Lock Panel',
                layerCount: BIM_LAYER_LOCK_DEFS.length,
            };
            this.runtime.viewRegistry.activatePanel(LAYER_LOCK_PANEL_ID, spec);
        }
    }

    /** Hide the panel and deregister it from the runtime view registry. */
    public hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(LAYER_LOCK_PANEL_ID);
    }

    /** Rebuild the row list (call after external lock-state changes). */
    public refresh(): void {
        this._refresh();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-llp-styles', '1');
        style.textContent = LAYER_LOCK_PANEL_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'llp-header';

        const title = document.createElement('span');
        title.className = 'llp-title';
        title.textContent = 'Layer Locks';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'llp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close layer lock panel';
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);

        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'llp-body';
        body.setAttribute('data-llp-body', '1');
        this.element.appendChild(body);
    }

    private _refresh(): void {
        const body = this.element.querySelector('[data-llp-body]') as HTMLDivElement | null;
        if (!body) return;
        body.innerHTML = '';

        for (const def of BIM_LAYER_LOCK_DEFS) {
            const locked = isLayerLocked(def.id);
            const row = document.createElement('div');
            row.className = 'llp-row' + (locked ? ' llp-locked' : '');
            row.title = `${locked ? 'Unlock' : 'Lock'} ${def.label}`;

            const icon = document.createElement('span');
            icon.className = 'llp-icon';
            icon.textContent = def.icon;

            const name = document.createElement('span');
            name.className = 'llp-name';
            name.textContent = def.label;

            const lockIcon = document.createElement('span');
            lockIcon.className = 'llp-lock';
            lockIcon.textContent = locked ? '🔒' : '🔓';

            row.appendChild(icon);
            row.appendChild(name);
            row.appendChild(lockIcon);

            row.addEventListener('click', () => this._toggleLock(def.id));
            body.appendChild(row);
        }
    }

    /**
     * Toggle a layer's locked state.
     *
     * §01 P6 compliance: actual scene selection-filter update is performed by
     * the event handler in initUI.ts, not inside this panel.
     *
     * TODO(E.layer.S): replace with runtime.bus.executeCommand('layer.lock.toggle', ...)
     */
    private _toggleLock(layerId: string): void {
        // window.layerLock typed in src/global-window.d.ts (P4-compliant).
        // TODO(E.layer.S): replace with runtime.bus.executeCommand('layer.lock.toggle', ...)
        if (!window.layerLock) window.layerLock = {};
        window.layerLock[layerId] = !window.layerLock[layerId];

        // F.events.3: no active DOM listeners for pryzm:layer:lock — dispatch removed.
        // TODO(E.layer.S): replace with runtime.bus.executeCommand('layer.set-lock', { layerId, locked: window.layerLock[layerId] })

        this._refresh();
    }
}
