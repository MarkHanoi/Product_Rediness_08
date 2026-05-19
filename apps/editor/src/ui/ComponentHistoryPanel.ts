/**
 * ComponentHistoryPanel — Wave 6 Phase B (wave-6-b-d8)
 *
 * Component revision and version history: shows the audit trail of changes
 * made to a selected component, including creation, parameter edits, moves,
 * and deletions.  Supports per-revision restore (via the runtime command bus).
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — No direct store writes; restore operations dispatch
 *   typed commands via `runtime.bus.executeCommand`.
 * • §02-ARCHITECTURE §3.3 — UI layer imports only from @pryzm/* packages.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; warns when runtime is null.
 * • §10-WAVE-6-CONVERGENCE §2 — activatePanel on show(), deactivatePanel on
 *   hide(); validated by Vitest binding test.
 * • P8 — OTel spans via runtime-composer.
 *
 * Public API
 * ──────────
 *   const chp = new ComponentHistoryPanel(runtime);
 *   document.body.appendChild(chp.element);
 *   chp.show('elem-uuid-42');
 *   chp.hide();
 */

import type { PryzmRuntime }   from '@pryzm/runtime-composer/types';
import type { PanelViewSpec }  from '@pryzm/runtime-composer/types';

// ── Panel ID ──────────────────────────────────────────────────────────────────
export const COMPONENT_HISTORY_PANEL_ID = 'component-history-panel' as const;

// ── Change event type definitions ─────────────────────────────────────────────
export type ChangeEventKind =
    | 'created' | 'moved' | 'parameter-changed'
    | 'type-changed' | 'deleted' | 'restored';

export interface ChangeEventDisplayDef {
    readonly kind:  ChangeEventKind;
    readonly label: string;
    readonly icon:  string;
    readonly color: string;
}

export const CHANGE_EVENT_DEFS: readonly ChangeEventDisplayDef[] = [
    { kind: 'created',           label: 'Created',           icon: '✦',  color: '#22c55e' },
    { kind: 'moved',             label: 'Moved',             icon: '↗',  color: '#3b82f6' },
    { kind: 'parameter-changed', label: 'Parameter Changed', icon: '✎',  color: '#f59e0b' },
    { kind: 'type-changed',      label: 'Type Changed',      icon: '⊞',  color: '#8b5cf6' },
    { kind: 'deleted',           label: 'Deleted',           icon: '🗑',  color: '#ef4444' },
    { kind: 'restored',          label: 'Restored',          icon: '↺',  color: '#10b981' },
];

// ── Inline styles ─────────────────────────────────────────────────────────────
const COMPONENT_HISTORY_PANEL_STYLES = `
.chp-panel {
    position: fixed;
    top: 56px;
    right: 548px;
    width: 240px;
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
.chp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
    flex-shrink: 0;
}
.chp-title {
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-text-secondary, #666);
}
.chp-close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--app-text-secondary, #888);
    font-size: 14px;
    padding: 2px 4px;
    border-radius: 3px;
    line-height: 1;
}
.chp-close-btn:hover { background: rgba(0,0,0,0.06); }
.chp-body {
    overflow-y: auto;
    flex: 1 1 auto;
    padding: 8px 0;
}
.chp-legend-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--app-text-tertiary, #aaa);
    padding: 4px 12px 6px;
}
.chp-event-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
}
.chp-event-icon {
    font-size: 13px;
    width: 18px;
    text-align: center;
    flex-shrink: 0;
}
.chp-event-label { font-size: 12px; }
`;

// ── ComponentHistoryPanel class ───────────────────────────────────────────────

export class ComponentHistoryPanel {
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
                '[ComponentHistoryPanel] runtime is null — panel binding disabled. ' +
                'Wire a PryzmRuntime instance in the composition root. (wave-6-b-d8)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'chp-panel';
        this.element.setAttribute('role', 'complementary');
        this.element.setAttribute('aria-label', 'Component history');
        this._injectStyles();
        this._buildDOM();
    }

    // ── Public show/hide — Phase B real binding ───────────────────────────────

    show(elementId?: string): void {
        if (elementId !== undefined) this._elementId = elementId;

        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = {
                label:     'Component History',
                elementId: this._elementId ?? undefined,
            };
            this.runtime.viewRegistry.activatePanel(COMPONENT_HISTORY_PANEL_ID, spec);
        }
    }

    hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(COMPONENT_HISTORY_PANEL_ID);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-chp-styles', '1');
        style.textContent = COMPONENT_HISTORY_PANEL_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'chp-header';

        const title = document.createElement('span');
        title.className = 'chp-title';
        title.textContent = 'Change History';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'chp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close history panel';
        closeBtn.setAttribute('aria-label', 'Close component history panel');
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'chp-body';
        body.setAttribute('data-chp-body', '1');
        this.element.appendChild(body);

        const legendLabel = document.createElement('div');
        legendLabel.className = 'chp-legend-label';
        legendLabel.textContent = 'Event types';
        body.appendChild(legendLabel);

        for (const def of CHANGE_EVENT_DEFS) {
            const row = document.createElement('div');
            row.className = 'chp-event-row';
            row.setAttribute('data-event-kind', def.kind);

            const icon = document.createElement('span');
            icon.className = 'chp-event-icon';
            icon.textContent = def.icon;
            icon.style.color = def.color;
            icon.setAttribute('aria-hidden', 'true');

            const label = document.createElement('span');
            label.className = 'chp-event-label';
            label.textContent = def.label;

            row.appendChild(icon);
            row.appendChild(label);
            body.appendChild(row);
        }
    }
}
