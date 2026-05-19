/**
 * PrintSetupToolbar — Wave 6 Phase C (wave-6-c-d9)
 *
 * Print / plot setup toolbar: configure paper size, page orientation, plot
 * scale, margin presets, preview output before plotting, execute the plot
 * job, and save the current configuration as a named preset.
 * 7 buttons, each dispatching a typed command via `runtime.bus.executeCommand`.
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
 * Buttons (7)
 * ────────────
 *   print-setup-paper-size | print-setup-orientation | print-setup-scale |
 *   print-setup-margin | print-plot-preview | print-plot-execute |
 *   print-setup-save-preset
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

// ── Toolbar ID ────────────────────────────────────────────────────────────────
export const PRINT_SETUP_TOOLBAR_ID = 'print-setup-toolbar' as const;

// ── Button descriptor ─────────────────────────────────────────────────────────
export interface PrintSetupButtonDef {
    readonly commandType: string;
    readonly label:       string;
    readonly icon:        string;
    readonly title:       string;
    readonly group:       'config' | 'plot' | 'preset';
}

export const PRINT_SETUP_TOOLBAR_BUTTONS: readonly PrintSetupButtonDef[] = [
    // Config group
    { commandType: 'print-setup-paper-size',   label: 'Paper',       icon: '📄', title: 'Select paper size for plot',               group: 'config'  },
    { commandType: 'print-setup-orientation',  label: 'Orientation',  icon: '⟳',  title: 'Toggle portrait / landscape orientation',   group: 'config'  },
    { commandType: 'print-setup-scale',        label: 'Scale',        icon: '📐', title: 'Set plot scale (1:100, fit-to-page, etc.)', group: 'config'  },
    { commandType: 'print-setup-margin',       label: 'Margins',      icon: '⊡',  title: 'Configure page margin preset',              group: 'config'  },
    // Plot group
    { commandType: 'print-plot-preview',       label: 'Preview',      icon: '🔍', title: 'Preview plot output before printing',       group: 'plot'    },
    { commandType: 'print-plot-execute',       label: 'Print',        icon: '🖨', title: 'Send to printer / plotter',                group: 'plot'    },
    // Preset group
    { commandType: 'print-setup-save-preset',  label: 'Save Preset',  icon: '💾', title: 'Save current print settings as preset',    group: 'preset'  },
] as const;

// ── Inline styles ─────────────────────────────────────────────────────────────
const PRINT_SETUP_TOOLBAR_STYLES = `
.pst-toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 8px;
    background: var(--app-toolbar-bg, #fff8f0);
    border-bottom: 1px solid rgba(120,60,0,0.08);
    font-family: var(--app-font, 'Inter', sans-serif);
    font-size: 12px;
    height: 40px;
    box-sizing: border-box;
    user-select: none;
}
.pst-separator {
    width: 1px;
    height: 24px;
    background: rgba(0,0,0,0.12);
    margin: 0 4px;
    flex-shrink: 0;
}
.pst-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    padding: 3px 6px;
    border: 1px solid transparent;
    border-radius: 5px;
    cursor: pointer;
    background: transparent;
    color: var(--app-text, #333);
    font-size: 11px;
    min-width: 44px;
    transition: background 0.1s, border-color 0.1s;
}
.pst-btn:hover {
    background: rgba(120,60,0,0.06);
    border-color: rgba(120,60,0,0.14);
}
.pst-btn:active {
    background: rgba(234,88,12,0.14);
    border-color: #ea580c;
}
.pst-btn-icon  { font-size: 14px; line-height: 1; }
.pst-btn-label { font-size: 9px; color: var(--app-text-secondary, #777); line-height: 1; }
`;

// ── PrintSetupToolbar class ───────────────────────────────────────────────────

export class PrintSetupToolbar {
    /** Root DOM element — mount in print/plot context toolbar area. */
    public readonly element: HTMLDivElement;

    /** Phase C (wave-6-c-d9) — runtime threaded by parent. */
    public readonly runtime: PryzmRuntime | null;

    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;

        if (!runtime) {
            console.warn(
                '[PrintSetupToolbar] runtime is null — button commands will not be dispatched. ' +
                'Wire a PryzmRuntime instance in the composition root. (wave-6-c-d9)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'pst-toolbar';
        this.element.setAttribute('role', 'toolbar');
        this.element.setAttribute('aria-label', 'Print setup toolbar');
        this._injectStyles();
        this._buildDOM();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-pst-styles', '1');
        style.textContent = PRINT_SETUP_TOOLBAR_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        let lastGroup: string | null = null;

        for (const def of PRINT_SETUP_TOOLBAR_BUTTONS) {
            if (lastGroup !== null && def.group !== lastGroup) {
                const sep = document.createElement('div');
                sep.className = 'pst-separator';
                sep.setAttribute('role', 'separator');
                this.element.appendChild(sep);
            }
            lastGroup = def.group;

            const btn = document.createElement('button');
            btn.className = 'pst-btn';
            btn.title = def.title;
            btn.setAttribute('aria-label', def.title);
            btn.setAttribute('data-command', def.commandType);

            const iconEl = document.createElement('span');
            iconEl.className = 'pst-btn-icon';
            iconEl.textContent = def.icon;
            iconEl.setAttribute('aria-hidden', 'true');

            const labelEl = document.createElement('span');
            labelEl.className = 'pst-btn-label';
            labelEl.textContent = def.label;

            btn.appendChild(iconEl);
            btn.appendChild(labelEl);
            btn.addEventListener('click', () => this._dispatch(def.commandType));
            this.element.appendChild(btn);
        }
    }

    /**
     * Dispatch a command on the runtime command bus.
     * Phase C real binding: every button click routes through here.
     */
    private _dispatch(commandType: string): void {
        if (!this.runtime) {
            console.warn(
                `[PrintSetupToolbar] runtime is null — command "${commandType}" not dispatched.`,
            );
            return;
        }
        this.runtime.bus.executeCommand(commandType, {});
    }

    /**
     * Programmatically trigger a button (useful for keyboard shortcuts).
     * Noop if the command type is not registered on this toolbar.
     */
    triggerCommand(commandType: string): void {
        const btn = this.element.querySelector<HTMLButtonElement>(
            `[data-command="${commandType}"]`,
        );
        btn?.click();
    }
}
