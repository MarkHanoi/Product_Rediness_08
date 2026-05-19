/**
 * LayerPanel — Wave 6 Phase B (wave-6-b-d1)
 *
 * BIM layer management panel: per-element-type visibility toggle.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — All state mutation through Commands; this panel only
 *   reads the current element-type visibility map and dispatches CustomEvents
 *   (same pattern as PropertyPanel §3.5).  Direct Object3D mutations are
 *   avoided — the existing scene-layer mechanism (camera.layers / traverse)
 *   is triggered externally by the event handlers in initUI.ts.
 * • §02-ARCHITECTURE §3.3 — Layer rule: UI layer (src/ui/) may not import from
 *   src/core/ directly.  Layer state is kept in `window.layerVisibility` (a
 *   plain Record<string,boolean>) for backward compatibility.  Phase E.layer.S
 *   will migrate this to `runtime.stores.layer`.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is loudly
 *   warned at construction time.
 * • P8 — OTel span emitted inside `activatePanel` / `deactivatePanel`
 *   (runtime-composer).
 *
 * Public API
 * ──────────
 *   const lp = new LayerPanel(runtime);
 *   document.body.appendChild(lp.element);
 *   lp.show();   // activates panel binding
 *   lp.hide();   // deactivates panel binding
 *
 * TODO(E.layer.S): migrate window.layerVisibility → runtime.stores.layer
 * TODO(E.layer.S): replace CustomEvent dispatch → runtime.bus.executeCommand
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

// ── Layer definitions ─────────────────────────────────────────────────────────
// These map directly to the `userData.type` values written by element creators.
// Kept as a const array so Phase E.layer.S can replace with runtime-provided
// layer descriptors without a contract change.

export interface BimLayerDef {
    readonly id: string;
    readonly label: string;
    readonly icon: string;
}

export const BIM_LAYER_DEFS: readonly BimLayerDef[] = [
    { id: 'wall',         label: 'Walls',        icon: '▦' },
    { id: 'slab',         label: 'Slabs',         icon: '▬' },
    { id: 'roof',         label: 'Roofs',         icon: '△' },
    { id: 'door',         label: 'Doors',         icon: '🚪' },
    { id: 'window',       label: 'Windows',       icon: '⬜' },
    { id: 'stair',        label: 'Stairs',        icon: '≡' },
    { id: 'curtain-wall', label: 'Curtain Walls', icon: '⬛' },
    { id: 'furniture',    label: 'Furniture',     icon: '🛋' },
    { id: 'annotation',   label: 'Annotations',   icon: '📝' },
];

// ── Panel ID constant ─────────────────────────────────────────────────────────
// Used as the canonical panelId in ViewRegistry — consistent string across
// activatePanel / deactivatePanel calls and test assertions.
export const LAYER_PANEL_ID = 'layer-panel' as const;

// ── Inline styles (same pattern as PropertyPanel PANEL_STYLES) ────────────────
const LAYER_PANEL_STYLES = `
.lp-panel {
    position: fixed;
    top: 56px;
    left: 8px;
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
.lp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
}
.lp-title {
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-text-secondary, #666);
}
.lp-close-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    color: var(--app-text-secondary, #888);
    padding: 0 2px;
    line-height: 1;
}
.lp-close-btn:hover { color: var(--app-text, #333); }
.lp-body { padding: 6px 0; }
.lp-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    cursor: pointer;
    user-select: none;
    transition: background 0.1s;
}
.lp-row:hover { background: rgba(0,0,0,0.04); }
.lp-row.lp-hidden { opacity: 0.45; }
.lp-icon { font-size: 14px; width: 18px; text-align: center; flex-shrink: 0; }
.lp-name { flex: 1; }
.lp-eye {
    font-size: 14px;
    color: var(--app-text-secondary, #888);
    flex-shrink: 0;
}
`;

// ── Visibility state helpers ──────────────────────────────────────────────────
// TODO(E.layer.S): migrate to runtime.stores.layer
function getLayerVisibility(): Record<string, boolean> {
    if (typeof window === 'undefined') return {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return window.layerVisibility ?? {};
}

function isLayerVisible(layerId: string): boolean {
    const vis = getLayerVisibility();
    // Default visible when not explicitly set.
    return vis[layerId] !== false;
}

// ── LayerPanel class ──────────────────────────────────────────────────────────

export class LayerPanel {
    /** Root DOM element — append to document.body or a layout container. */
    public readonly element: HTMLDivElement;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: PryzmRuntime | null;

    private styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;

        if (!runtime) {
            // §02-ARCHITECTURE §3.5: No silent fallbacks — warn loudly so the
            // composition root is prompted to wire the runtime.
            console.warn(
                '[LayerPanel] runtime is null — activatePanel/deactivatePanel binding ' +
                'will be skipped.  Wire a PryzmRuntime instance in the composition root ' +
                '(src/ui/Layout.ts) to enable Phase B binding.  (wave-6-b-d1)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'lp-panel';
        this._injectStyles();
        this._buildDOM();
    }

    // ── Public lifecycle API ──────────────────────────────────────────────────

    /** Show the panel and register it with the runtime view registry.
     *  Idempotent — safe to call multiple times. */
    public show(): void {
        this.element.style.display = 'block';
        this._refresh();
        // Wave 6 Phase B real binding — panel mount activation.
        // OTel span emitted inside activatePanel (runtime-composer, P8).
        if (this.runtime) {
            const spec: PanelViewSpec = {
                label: 'Layer Panel',
                layerCount: BIM_LAYER_DEFS.length,
            };
            this.runtime.viewRegistry.activatePanel(LAYER_PANEL_ID, spec);
        }
    }

    /** Hide the panel and deregister it from the runtime view registry.
     *  Idempotent — safe to call even when already hidden. */
    public hide(): void {
        this.element.style.display = 'none';
        // Wave 6 Phase B real binding — panel unmount deactivation.
        // Symmetric to the activatePanel call in show(). Idempotent.
        this.runtime?.viewRegistry.deactivatePanel(LAYER_PANEL_ID);
    }

    /** Rebuild the layer row list (call after external visibility changes). */
    public refresh(): void {
        this._refresh();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this.styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-lp-styles', '1');
        style.textContent = LAYER_PANEL_STYLES;
        document.head.appendChild(style);
        this.styleInjected = true;
    }

    private _buildDOM(): void {
        // ── Header ────────────────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'lp-header';

        const title = document.createElement('span');
        title.className = 'lp-title';
        title.textContent = 'Layers';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'lp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close layer panel';
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);

        this.element.appendChild(header);

        // ── Body (populated by _refresh) ──────────────────────────────────────
        const body = document.createElement('div');
        body.className = 'lp-body';
        body.setAttribute('data-lp-body', '1');
        this.element.appendChild(body);
    }

    /** Rebuild layer rows from current visibility state. */
    private _refresh(): void {
        const body = this.element.querySelector('[data-lp-body]') as HTMLDivElement | null;
        if (!body) return;
        body.innerHTML = '';

        for (const def of BIM_LAYER_DEFS) {
            const visible = isLayerVisible(def.id);
            const row = document.createElement('div');
            row.className = 'lp-row' + (visible ? '' : ' lp-hidden');
            row.title = `Toggle ${def.label} visibility`;

            const icon = document.createElement('span');
            icon.className = 'lp-icon';
            icon.textContent = def.icon;

            const name = document.createElement('span');
            name.className = 'lp-name';
            name.textContent = def.label;

            const eye = document.createElement('span');
            eye.className = 'lp-eye';
            eye.textContent = visible ? '👁' : '🚫';

            row.appendChild(icon);
            row.appendChild(name);
            row.appendChild(eye);

            row.addEventListener('click', () => this._toggleLayer(def.id, body));

            body.appendChild(row);
        }
    }

    /** Toggle a layer's visibility and dispatch a CustomEvent for scene update.
     *
     *  §01 P6 compliance: scene Object3D traversal is performed by the event
     *  handler in initUI.ts (the tool layer), NOT inside this panel.  This panel
     *  only writes the intent to `window.layerVisibility` and fires the event.
     *
     *  TODO(E.layer.S): replace window.layerVisibility write + CustomEvent with
     *      `this.runtime.bus.executeCommand('layer.visibility.toggle', { layerId })`
     */
    private _toggleLayer(layerId: string, body: HTMLDivElement): void {
        // Read-modify-write the visibility map.
        // window.layerVisibility typed in src/global-window.d.ts (P4-compliant).
        // TODO(E.layer.S): replace with runtime.bus.executeCommand('layer.visibility.toggle', ...)
        if (!window.layerVisibility) window.layerVisibility = {};
        const current: boolean = window.layerVisibility[layerId] !== false;
        window.layerVisibility[layerId] = !current;

        // F.events.3: no active DOM listeners found for pryzm:layer:visibility — dispatch removed.
        // TODO(E.layer.S): replace with runtime.bus.executeCommand('layer.set-visibility', { layerId, visible: !current })

        // Rebuild the row list to reflect the new state.
        this._refresh();
        if (body) {/* already refreshed via this._refresh() above */}
    }
}
