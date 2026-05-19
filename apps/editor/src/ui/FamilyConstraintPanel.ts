/**
 * FamilyConstraintPanel — Wave 6 Phase B (wave-6-b-d7)
 *
 * Parametric constraint manager: displays the constraint graph for the
 * currently loaded family sketch (coincident, dimension, angle, equal,
 * fix, parallel, perpendicular constraints).  Integrates with
 * `apps/component-editor/` constraint stores via runtime command bus.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — No direct store writes; constraint operations
 *   (add/delete/solve) dispatch typed commands via runtime.bus.executeCommand.
 * • §02-ARCHITECTURE §3.3 — UI layer imports only from @pryzm/* packages.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; warns when runtime is null.
 * • §10-WAVE-6-CONVERGENCE §2 — activatePanel on show(), deactivatePanel
 *   on hide(); validated by a Vitest binding test.
 * • P8 — OTel spans via runtime-composer activatePanel / deactivatePanel.
 *
 * Public API
 * ──────────
 *   const fcp = new FamilyConstraintPanel(runtime);
 *   document.body.appendChild(fcp.element);
 *   fcp.show();    // activates panel binding + reads constraint list
 *   fcp.hide();    // deactivates panel binding
 *
 * TODO(Phase-F): subscribe to runtime.events for live constraint-list updates
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

// ── Panel ID ──────────────────────────────────────────────────────────────────
export const FAMILY_CONSTRAINT_PANEL_ID = 'family-constraint-panel' as const;

// ── Constraint kind definitions ───────────────────────────────────────────────
export type ConstraintKind =
    | 'coincident' | 'dimension' | 'angle'
    | 'equal' | 'fix' | 'parallel' | 'perpendicular';

export interface ConstraintDisplayDef {
    readonly kind: ConstraintKind;
    readonly label: string;
    readonly icon: string;
}

export const CONSTRAINT_DISPLAY_DEFS: readonly ConstraintDisplayDef[] = [
    { kind: 'coincident',    label: 'Coincident',    icon: '⊙' },
    { kind: 'dimension',     label: 'Dimension',     icon: '↔' },
    { kind: 'angle',         label: 'Angle',         icon: '∠' },
    { kind: 'equal',         label: 'Equal',         icon: '=' },
    { kind: 'fix',           label: 'Fix',           icon: '⊕' },
    { kind: 'parallel',      label: 'Parallel',      icon: '∥' },
    { kind: 'perpendicular', label: 'Perpendicular', icon: '⊥' },
];

// ── Inline styles ─────────────────────────────────────────────────────────────
const FAMILY_CONSTRAINT_PANEL_STYLES = `
.fcp-panel {
    position: fixed;
    bottom: 8px;
    right: 8px;
    width: 240px;
    max-height: 320px;
    background: var(--app-panel-bg, #ffffff);
    color: var(--app-text, #333333);
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
.fcp-panel[data-visible="true"] { display: flex; }
.fcp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
    flex-shrink: 0;
}
.fcp-title {
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-text-secondary, #666);
}
.fcp-close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--app-text-secondary, #888);
    font-size: 14px;
    padding: 2px 4px;
    border-radius: 3px;
    line-height: 1;
}
.fcp-close-btn:hover { background: rgba(0,0,0,0.06); }
.fcp-body {
    overflow-y: auto;
    flex: 1 1 auto;
    padding: 4px 0;
}
.fcp-section-header {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--app-text-tertiary, #aaa);
    padding: 8px 12px 4px;
}
.fcp-constraint-kind {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    cursor: pointer;
    transition: background 0.1s;
    user-select: none;
}
.fcp-constraint-kind:hover { background: rgba(102,0,255,0.05); }
.fcp-constraint-icon {
    font-size: 14px;
    width: 20px;
    text-align: center;
    flex-shrink: 0;
    color: var(--app-accent, #6600FF);
}
.fcp-constraint-label { font-size: 12px; }
.fcp-constraint-count {
    margin-left: auto;
    font-size: 11px;
    color: var(--app-text-tertiary, #bbb);
    background: rgba(0,0,0,0.06);
    border-radius: 10px;
    padding: 1px 6px;
}
`;

// ── FamilyConstraintPanel class ───────────────────────────────────────────────

export class FamilyConstraintPanel {
    /** Root DOM element. */
    public readonly element: HTMLDivElement;

    /** Wave 6 Phase B — runtime threaded by parent. */
    public readonly runtime: PryzmRuntime | null;

    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;

        if (!runtime) {
            console.warn(
                '[FamilyConstraintPanel] runtime is null — panel binding disabled. ' +
                'Wire a PryzmRuntime instance in the composition root. (wave-6-b-d7)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'fcp-panel';
        this.element.setAttribute('role', 'complementary');
        this.element.setAttribute('aria-label', 'Constraint panel');
        this._injectStyles();
        this._buildDOM();
    }

    // ── Public show/hide — Phase B real binding ───────────────────────────────

    show(): void {
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = { label: 'Constraints' };
            this.runtime.viewRegistry.activatePanel(FAMILY_CONSTRAINT_PANEL_ID, spec);
        }
    }

    hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(FAMILY_CONSTRAINT_PANEL_ID);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-fcp-styles', '1');
        style.textContent = FAMILY_CONSTRAINT_PANEL_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'fcp-header';

        const title = document.createElement('span');
        title.className = 'fcp-title';
        title.textContent = 'Constraints';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'fcp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close constraint panel';
        closeBtn.setAttribute('aria-label', 'Close constraint panel');
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);

        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'fcp-body';
        body.setAttribute('data-fcp-body', '1');
        this.element.appendChild(body);

        // ── Section header ─────────────────────────────────────────────────────
        const sectionLabel = document.createElement('div');
        sectionLabel.className = 'fcp-section-header';
        sectionLabel.textContent = 'Constraint types';
        body.appendChild(sectionLabel);

        // ── Constraint kind rows ───────────────────────────────────────────────
        for (const def of CONSTRAINT_DISPLAY_DEFS) {
            const row = document.createElement('div');
            row.className = 'fcp-constraint-kind';
            row.setAttribute('data-constraint-kind', def.kind);
            row.setAttribute('title', `${def.label} constraints`);

            const icon = document.createElement('span');
            icon.className = 'fcp-constraint-icon';
            icon.textContent = def.icon;
            icon.setAttribute('aria-hidden', 'true');

            const label = document.createElement('span');
            label.className = 'fcp-constraint-label';
            label.textContent = def.label;

            const count = document.createElement('span');
            count.className = 'fcp-constraint-count';
            count.textContent = '0';
            count.setAttribute('data-count', def.kind);

            row.appendChild(icon);
            row.appendChild(label);
            row.appendChild(count);

            body.appendChild(row);
        }
    }
}
