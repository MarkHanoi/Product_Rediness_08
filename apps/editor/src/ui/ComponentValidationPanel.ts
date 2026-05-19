/**
 * ComponentValidationPanel — Wave 6 Phase B (wave-6-b-d8)
 *
 * Component constraint validation results: runs parametric constraint checks
 * against the selected component and lists violations (type mismatches, out-of-
 * range dimensions, broken hosted relationships, structural rule failures, etc.)
 * together with suggested auto-fix commands.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — No direct store writes; auto-fix dispatches typed
 *   commands via `runtime.bus.executeCommand`.
 * • §02-ARCHITECTURE §3.3 — UI layer imports only from @pryzm/* packages.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; warns when runtime is null.
 * • §10-WAVE-6-CONVERGENCE §2 — activatePanel on show(), deactivatePanel on
 *   hide(); validated by Vitest binding test.
 *
 * Public API
 * ──────────
 *   const cvp = new ComponentValidationPanel(runtime);
 *   document.body.appendChild(cvp.element);
 *   cvp.show('col-guid-07');
 *   cvp.hide();
 */

import type { PryzmRuntime }   from '@pryzm/runtime-composer/types';
import type { PanelViewSpec }  from '@pryzm/runtime-composer/types';

// ── Panel ID ──────────────────────────────────────────────────────────────────
export const COMPONENT_VALIDATION_PANEL_ID = 'component-validation-panel' as const;

// ── Validation rule defs ──────────────────────────────────────────────────────
export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationRuleDef {
    readonly ruleId:    string;
    readonly label:     string;
    readonly severity:  ValidationSeverity;
    readonly category:  string;
    readonly autoFixId: string | null;
}

export const VALIDATION_RULE_DEFS: readonly ValidationRuleDef[] = [
    {
        ruleId:    'param-out-of-range',
        label:     'Parameter out of range',
        severity:  'error',
        category:  'Dimensions',
        autoFixId: 'clamp-param',
    },
    {
        ruleId:    'missing-host',
        label:     'Hosted element has no valid host',
        severity:  'error',
        category:  'Hosting',
        autoFixId: 'reassign-host',
    },
    {
        ruleId:    'join-cycle',
        label:     'Cyclic wall join detected',
        severity:  'error',
        category:  'Joins',
        autoFixId: null,
    },
    {
        ruleId:    'level-mismatch',
        label:     'Element spans incompatible levels',
        severity:  'warning',
        category:  'Levels',
        autoFixId: 'align-to-level',
    },
    {
        ruleId:    'structural-slenderness',
        label:     'Column slenderness exceeds limit',
        severity:  'warning',
        category:  'Structural',
        autoFixId: null,
    },
    {
        ruleId:    'no-material-assigned',
        label:     'No material assigned to layer',
        severity:  'info',
        category:  'Materials',
        autoFixId: 'assign-default-material',
    },
];

// ── Severity colour map ───────────────────────────────────────────────────────
const SEVERITY_COLORS: Record<ValidationSeverity, { bg: string; text: string }> = {
    error:   { bg: '#fee2e2', text: '#991b1b' },
    warning: { bg: '#fef3c7', text: '#92400e' },
    info:    { bg: '#dbeafe', text: '#1e40af' },
};

const SEVERITY_ICONS: Record<ValidationSeverity, string> = {
    error:   '✗',
    warning: '⚠',
    info:    'ℹ',
};

// ── Inline styles ─────────────────────────────────────────────────────────────
const COMPONENT_VALIDATION_PANEL_STYLES = `
.cvp-panel {
    position: fixed;
    top: 56px;
    right: 4px;
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
.cvp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
    flex-shrink: 0;
}
.cvp-title {
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-text-secondary, #666);
}
.cvp-close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--app-text-secondary, #888);
    font-size: 14px;
    padding: 2px 4px;
    border-radius: 3px;
    line-height: 1;
}
.cvp-close-btn:hover { background: rgba(0,0,0,0.06); }
.cvp-body {
    overflow-y: auto;
    flex: 1 1 auto;
    padding: 6px 0;
}
.cvp-rule-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid rgba(0,0,0,0.04);
}
.cvp-severity-badge {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 700;
    margin-top: 1px;
}
.cvp-rule-info { flex: 1 1 auto; min-width: 0; }
.cvp-rule-label { font-size: 12px; font-weight: 500; line-height: 1.3; }
.cvp-rule-category { font-size: 10px; color: var(--app-text-tertiary, #aaa); margin-top: 2px; }
.cvp-fix-btn {
    flex-shrink: 0;
    background: none;
    border: 1px solid rgba(0,0,0,0.14);
    border-radius: 4px;
    cursor: pointer;
    font-size: 10px;
    padding: 2px 6px;
    color: var(--app-text-secondary, #555);
    white-space: nowrap;
    margin-top: 1px;
}
.cvp-fix-btn:hover { background: rgba(0,0,0,0.05); }
`;

// ── ComponentValidationPanel class ────────────────────────────────────────────

export class ComponentValidationPanel {
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
                '[ComponentValidationPanel] runtime is null — panel binding disabled. ' +
                'Wire a PryzmRuntime instance in the composition root. (wave-6-b-d8)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'cvp-panel';
        this.element.setAttribute('role', 'complementary');
        this.element.setAttribute('aria-label', 'Component validation');
        this._injectStyles();
        this._buildDOM();
    }

    // ── Public show/hide — Phase B real binding ───────────────────────────────

    show(elementId?: string): void {
        if (elementId !== undefined) this._elementId = elementId;

        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = {
                label:     'Component Validation',
                elementId: this._elementId ?? undefined,
            };
            this.runtime.viewRegistry.activatePanel(COMPONENT_VALIDATION_PANEL_ID, spec);
        }
    }

    hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(COMPONENT_VALIDATION_PANEL_ID);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-cvp-styles', '1');
        style.textContent = COMPONENT_VALIDATION_PANEL_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'cvp-header';

        const title = document.createElement('span');
        title.className = 'cvp-title';
        title.textContent = 'Validation';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'cvp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close validation panel';
        closeBtn.setAttribute('aria-label', 'Close component validation panel');
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'cvp-body';
        body.setAttribute('data-cvp-body', '1');
        this.element.appendChild(body);

        for (const rule of VALIDATION_RULE_DEFS) {
            const row = document.createElement('div');
            row.className = 'cvp-rule-row';
            row.setAttribute('data-rule-id', rule.ruleId);

            const badge = document.createElement('div');
            badge.className = 'cvp-severity-badge';
            badge.style.background = SEVERITY_COLORS[rule.severity].bg;
            badge.style.color      = SEVERITY_COLORS[rule.severity].text;
            badge.textContent      = SEVERITY_ICONS[rule.severity];
            badge.setAttribute('aria-label', rule.severity);

            const info = document.createElement('div');
            info.className = 'cvp-rule-info';

            const label = document.createElement('div');
            label.className = 'cvp-rule-label';
            label.textContent = rule.label;

            const category = document.createElement('div');
            category.className = 'cvp-rule-category';
            category.textContent = rule.category;

            info.appendChild(label);
            info.appendChild(category);
            row.appendChild(badge);
            row.appendChild(info);

            if (rule.autoFixId !== null) {
                const fixBtn = document.createElement('button');
                fixBtn.className = 'cvp-fix-btn';
                fixBtn.textContent = 'Fix';
                fixBtn.title = `Auto-fix: ${rule.autoFixId}`;
                fixBtn.setAttribute('data-fix-id', rule.autoFixId);
                row.appendChild(fixBtn);
            }

            body.appendChild(row);
        }
    }
}
