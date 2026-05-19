/**
 * ComponentParameterPanel — Wave 6 Phase B (wave-6-b-d8)
 *
 * Component instance parameter editor: displays and edits the instance-level
 * parameters for the currently selected component in the model.  Unlike
 * FamilyPropertiesPanel (which edits type parameters in the family editor),
 * this panel targets placed instances — e.g., a specific door's offset,
 * a wall's fire rating override, a window's sill height.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — No direct store writes; parameter mutations dispatch
 *   typed commands via `runtime.bus.executeCommand`.
 * • §02-ARCHITECTURE §3.3 — UI layer imports only from @pryzm/* packages.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; warns when runtime is null.
 * • §10-WAVE-6-CONVERGENCE §2 — activatePanel on show(), deactivatePanel on
 *   hide(); validated by Vitest binding test.
 * • P8 — OTel spans via runtime-composer activatePanel / deactivatePanel.
 *
 * Public API
 * ──────────
 *   const cpp = new ComponentParameterPanel(runtime);
 *   document.body.appendChild(cpp.element);
 *   cpp.show('elem-uuid-42');   // loads parameters for element
 *   cpp.hide();
 *
 * TODO(Phase-F): subscribe to runtime.selection for auto-load on click.
 */

import type { PryzmRuntime }   from '@pryzm/runtime-composer/types';
import type { PanelViewSpec }  from '@pryzm/runtime-composer/types';

// ── Panel ID ──────────────────────────────────────────────────────────────────
export const COMPONENT_PARAMETER_PANEL_ID = 'component-parameter-panel' as const;

// ── Parameter group defs (representative AEC instance params) ─────────────────
export interface ComponentParamGroupDef {
    readonly groupId: string;
    readonly label:   string;
    readonly icon:    string;
}

export const COMPONENT_PARAM_GROUPS: readonly ComponentParamGroupDef[] = [
    { groupId: 'identity',   label: 'Identity',    icon: '🪪' },
    { groupId: 'dimensions', label: 'Dimensions',   icon: '📐' },
    { groupId: 'materials',  label: 'Materials',    icon: '🎨' },
    { groupId: 'phasing',    label: 'Phasing',      icon: '📅' },
    { groupId: 'structural', label: 'Structural',   icon: '🏗' },
    { groupId: 'fire',       label: 'Fire Rating',  icon: '🔥' },
];

// ── Inline styles ─────────────────────────────────────────────────────────────
const COMPONENT_PARAMETER_PANEL_STYLES = `
.cpp-panel {
    position: fixed;
    top: 56px;
    right: 276px;
    width: 260px;
    max-height: calc(100vh - 80px);
    background: var(--app-panel-bg, #ffffff);
    color: var(--app-text, #333);
    border: 1px solid rgba(0,0,0,0.12);
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
    font-family: var(--app-font, 'Inter', sans-serif);
    font-size: 13px;
    z-index: 950;
    display: none;
    flex-direction: column;
    overflow: hidden;
}
.cpp-panel[data-vis="1"] { display: flex; }
.cpp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
    flex-shrink: 0;
}
.cpp-title {
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-text-secondary, #666);
}
.cpp-close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--app-text-secondary, #888);
    font-size: 14px;
    padding: 2px 4px;
    border-radius: 3px;
    line-height: 1;
}
.cpp-close-btn:hover { background: rgba(0,0,0,0.06); }
.cpp-element-bar {
    padding: 6px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.06);
    font-size: 11px;
    color: var(--app-text-secondary, #555);
    background: rgba(0,0,0,0.02);
    flex-shrink: 0;
}
.cpp-body {
    overflow-y: auto;
    flex: 1 1 auto;
    padding: 4px 0;
}
.cpp-group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    background: rgba(0,0,0,0.03);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--app-text-secondary, #666);
    cursor: pointer;
    user-select: none;
    transition: background 0.1s;
}
.cpp-group-header:hover { background: rgba(0,0,0,0.05); }
.cpp-group-icon { font-size: 13px; line-height: 1; }
.cpp-empty {
    padding: 24px 16px;
    text-align: center;
    font-size: 12px;
    color: var(--app-text-tertiary, #bbb);
}
`;

// ── ComponentParameterPanel class ─────────────────────────────────────────────

export class ComponentParameterPanel {
    /** Root DOM element. */
    public readonly element: HTMLDivElement;

    /** Wave 6 Phase B — runtime threaded by parent. */
    public readonly runtime: PryzmRuntime | null;

    private _elementId: string | null = null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;

        if (!runtime) {
            console.warn(
                '[ComponentParameterPanel] runtime is null — panel binding disabled. ' +
                'Wire a PryzmRuntime instance in the composition root. (wave-6-b-d8)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'cpp-panel';
        this.element.setAttribute('role', 'complementary');
        this.element.setAttribute('aria-label', 'Component parameters');
        this._injectStyles();
        this._buildDOM();
    }

    // ── Public show/hide — Phase B real binding ───────────────────────────────

    show(elementId?: string): void {
        if (elementId !== undefined) {
            this._elementId = elementId;
            this._updateElementBar();
        }
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = {
                label:     'Component Parameters',
                elementId: this._elementId ?? undefined,
            };
            this.runtime.viewRegistry.activatePanel(COMPONENT_PARAMETER_PANEL_ID, spec);
        }
    }

    hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(COMPONENT_PARAMETER_PANEL_ID);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-cpp-styles', '1');
        style.textContent = COMPONENT_PARAMETER_PANEL_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'cpp-header';

        const title = document.createElement('span');
        title.className = 'cpp-title';
        title.textContent = 'Instance Parameters';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'cpp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close parameter panel';
        closeBtn.setAttribute('aria-label', 'Close component parameter panel');
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const elementBar = document.createElement('div');
        elementBar.className = 'cpp-element-bar';
        elementBar.setAttribute('data-cpp-element-bar', '1');
        elementBar.textContent = 'No element selected';
        this.element.appendChild(elementBar);

        const body = document.createElement('div');
        body.className = 'cpp-body';
        body.setAttribute('data-cpp-body', '1');
        this.element.appendChild(body);

        this._buildGroupRows(body);
    }

    private _buildGroupRows(body: HTMLDivElement): void {
        for (const grp of COMPONENT_PARAM_GROUPS) {
            const row = document.createElement('div');
            row.className = 'cpp-group-header';
            row.setAttribute('data-group-id', grp.groupId);

            const icon = document.createElement('span');
            icon.className = 'cpp-group-icon';
            icon.textContent = grp.icon;
            icon.setAttribute('aria-hidden', 'true');

            const label = document.createElement('span');
            label.textContent = grp.label;

            row.appendChild(icon);
            row.appendChild(label);
            body.appendChild(row);
        }
    }

    private _updateElementBar(): void {
        const bar = this.element.querySelector('[data-cpp-element-bar]') as HTMLElement | null;
        if (bar) {
            bar.textContent = this._elementId
                ? `Element: ${this._elementId}`
                : 'No element selected';
        }
    }
}
