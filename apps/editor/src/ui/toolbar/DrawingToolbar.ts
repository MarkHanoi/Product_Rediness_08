/**
 * DrawingToolbar — Wave 6 Phase C (wave-6-c-d1)
 *
 * Drawing / placement toolbar for BIM element creation: walls, slabs, roofs,
 * doors, windows, stairs, curtain walls, furniture, annotations, rooms, areas,
 * structural members, grids, levels, cameras, and elevation marks.
 * 18 buttons, all dispatching typed commands via `runtime.bus.executeCommand`.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — Each button dispatches a typed Command<T> on the
 *   runtime command bus (no direct store writes).
 * • §02-ARCHITECTURE §3.3 — UI layer may not import from src/core/ directly.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • §10-WAVE-6-CONVERGENCE §3 — "real binding" means button click dispatches
 *   a typed Command<T>; a Vitest test asserts the round-trip.
 * • P8 — Commands carry OTel spans via the bus (runtime-composer).
 *
 * Command naming convention: <verb>-<noun> in kebab-case (per §8).
 *
 * Buttons (18)
 * ────────────
 *   draw-wall | draw-slab | draw-roof | draw-door | draw-window |
 *   draw-stair | draw-curtain-wall | place-furniture | add-annotation |
 *   draw-room | draw-area | add-column | add-beam | draw-ramp |
 *   place-grid | place-level | place-camera | add-elevation-mark
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

// ── Toolbar ID ────────────────────────────────────────────────────────────────
export const DRAWING_TOOLBAR_ID = 'drawing-toolbar' as const;

// ── Button descriptor ─────────────────────────────────────────────────────────
export interface DrawingToolbarButtonDef {
    readonly commandType: string;
    readonly label: string;
    readonly icon: string;
    readonly title: string;
    readonly group: 'structure' | 'opening' | 'vertical' | 'annotation' | 'space' | 'structure-2' | 'circulation' | 'datum' | 'view';
}

export const DRAWING_TOOLBAR_BUTTONS: readonly DrawingToolbarButtonDef[] = [
    // Structure group
    { commandType: 'draw-wall',          label: 'Wall',       icon: '▦', title: 'Draw wall',            group: 'structure' },
    { commandType: 'draw-slab',          label: 'Slab',       icon: '▬', title: 'Draw floor/slab',      group: 'structure' },
    { commandType: 'draw-roof',          label: 'Roof',       icon: '△', title: 'Draw roof',             group: 'structure' },
    // Openings group
    { commandType: 'draw-door',          label: 'Door',       icon: '🚪', title: 'Place door',           group: 'opening' },
    { commandType: 'draw-window',        label: 'Window',     icon: '⬜', title: 'Place window',         group: 'opening' },
    { commandType: 'draw-curtain-wall',  label: 'Curtain',    icon: '⬛', title: 'Draw curtain wall',    group: 'opening' },
    // Vertical circulation group
    { commandType: 'draw-stair',         label: 'Stair',      icon: '≡', title: 'Draw stair',            group: 'vertical' },
    { commandType: 'draw-ramp',          label: 'Ramp',       icon: '⊿', title: 'Draw ramp',             group: 'vertical' },
    // Furniture / content
    { commandType: 'place-furniture',    label: 'Furniture',  icon: '🛋', title: 'Place furniture',      group: 'annotation' },
    // Annotation
    { commandType: 'add-annotation',     label: 'Annotate',   icon: '📝', title: 'Add annotation',       group: 'annotation' },
    // Space group
    { commandType: 'draw-room',          label: 'Room',       icon: '⬡', title: 'Draw room',             group: 'space' },
    { commandType: 'draw-area',          label: 'Area',       icon: '⬢', title: 'Draw area boundary',    group: 'space' },
    // Structural members group
    { commandType: 'add-column',         label: 'Column',     icon: '|', title: 'Place structural column', group: 'structure-2' },
    { commandType: 'add-beam',           label: 'Beam',       icon: '—', title: 'Place structural beam',   group: 'structure-2' },
    // Datum group
    { commandType: 'place-grid',         label: 'Grid',       icon: '⊞', title: 'Place grid line',       group: 'datum' },
    { commandType: 'place-level',        label: 'Level',      icon: '⊟', title: 'Place level',            group: 'datum' },
    // View group
    { commandType: 'place-camera',       label: 'Camera',     icon: '📷', title: 'Place 3D camera',      group: 'view' },
    { commandType: 'add-elevation-mark', label: 'Elevation',  icon: '🔭', title: 'Add elevation mark',   group: 'view' },
] as const;

// ── Inline styles ─────────────────────────────────────────────────────────────
const DRAWING_TOOLBAR_STYLES = `
.dt-toolbar {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    padding: 8px 4px;
    background: var(--app-toolbar-bg, #f7f7f7);
    border-right: 1px solid rgba(0,0,0,0.1);
    font-family: var(--app-font, 'Inter', sans-serif);
    font-size: 11px;
    width: 52px;
    box-sizing: border-box;
    user-select: none;
    overflow-y: auto;
}
.dt-separator {
    height: 1px;
    background: rgba(0,0,0,0.12);
    margin: 4px 4px;
    flex-shrink: 0;
}
.dt-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 5px 4px;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    background: transparent;
    color: var(--app-text, #333);
    transition: background 0.1s, border-color 0.1s;
    width: 100%;
    box-sizing: border-box;
}
.dt-btn:hover {
    background: rgba(0,0,0,0.06);
    border-color: rgba(0,0,0,0.12);
}
.dt-btn:active {
    background: rgba(37,99,235,0.12);
    border-color: var(--app-accent, #2563eb);
}
.dt-btn-icon { font-size: 16px; line-height: 1; }
.dt-btn-label { font-size: 8px; color: var(--app-text-secondary, #777); line-height: 1; text-align: center; }
`;

// ── DrawingToolbar class ──────────────────────────────────────────────────────

export class DrawingToolbar {
    /** Root DOM element — mount as a vertical left-side toolbar. */
    public readonly element: HTMLDivElement;

    /** Phase C (S83-WIRE wave-6-c-d1) — runtime threaded by parent. */
    public readonly runtime: PryzmRuntime | null;

    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;

        if (!runtime) {
            console.warn(
                '[DrawingToolbar] runtime is null — button commands will not be dispatched. ' +
                'Wire a PryzmRuntime instance in the composition root. (wave-6-c-d1)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'dt-toolbar';
        this.element.setAttribute('role', 'toolbar');
        this.element.setAttribute('aria-label', 'Drawing toolbar');
        this.element.setAttribute('aria-orientation', 'vertical');
        this._injectStyles();
        this._buildDOM();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-dt-styles', '1');
        style.textContent = DRAWING_TOOLBAR_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        let lastGroup: string | null = null;

        for (const def of DRAWING_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && def.group !== lastGroup) {
                const sep = document.createElement('div');
                sep.className = 'dt-separator';
                sep.setAttribute('role', 'separator');
                this.element.appendChild(sep);
            }
            lastGroup = def.group;

            const btn = document.createElement('button');
            btn.className = 'dt-btn';
            btn.title = def.title;
            btn.setAttribute('aria-label', def.title);
            btn.setAttribute('data-command', def.commandType);

            const iconEl = document.createElement('span');
            iconEl.className = 'dt-btn-icon';
            iconEl.textContent = def.icon;
            iconEl.setAttribute('aria-hidden', 'true');

            const labelEl = document.createElement('span');
            labelEl.className = 'dt-btn-label';
            labelEl.textContent = def.label;

            btn.appendChild(iconEl);
            btn.appendChild(labelEl);

            btn.addEventListener('click', () => this._dispatch(def.commandType));

            this.element.appendChild(btn);
        }
    }

    /**
     * Dispatch a drawing command on the runtime command bus.
     *
     * Phase C real binding: every button click routes through here.
     * Drawing commands begin a tool interaction; the tools slot
     * (runtime.tools) is activated separately by the registered handler.
     *
     * Command naming: <verb>-<noun> kebab-case per §8 of WAVE-6-CONVERGENCE.
     */
    private _dispatch(commandType: string): void {
        if (!this.runtime) {
            console.warn(
                `[DrawingToolbar] runtime is null — command "${commandType}" not dispatched.`,
            );
            return;
        }
        this.runtime.bus.executeCommand(commandType, {});
    }

    /**
     * Programmatically trigger a toolbar button (useful for keyboard shortcuts
     * wired at a higher level).
     */
    public triggerCommand(commandType: string): void {
        this._dispatch(commandType);
    }
}
