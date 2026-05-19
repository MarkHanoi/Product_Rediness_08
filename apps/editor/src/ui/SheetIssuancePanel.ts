/**
 * SheetIssuancePanel — Wave 6 Phase B (wave-6-b-d9)
 *
 * Sheet issuance and transmittal management: records outgoing issue events
 * for sheets — the intended recipient, purpose code (IFR, IFC, etc.),
 * issue date, and method (email, CDE upload, hard copy).  Supports
 * multi-sheet transmittal packages.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — No direct store writes; issuance records are created
 *   via typed commands on `runtime.bus.executeCommand`.
 * • §02-ARCHITECTURE §3.3 — UI layer imports only from @pryzm/* packages.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; warns when runtime is null.
 * • §10-WAVE-6-CONVERGENCE §2 — activatePanel on show(), deactivatePanel on
 *   hide(); validated by Vitest binding test (wave-6-b-d9).
 *
 * Public API
 * ──────────
 *   const sip = new SheetIssuancePanel(runtime);
 *   document.body.appendChild(sip.element);
 *   sip.show();
 *   sip.hide();
 */

import type { PryzmRuntime }   from '@pryzm/runtime-composer/types';
import type { PanelViewSpec }  from '@pryzm/runtime-composer/types';

// ── Panel ID ──────────────────────────────────────────────────────────────────
export const SHEET_ISSUANCE_PANEL_ID = 'sheet-issuance-panel' as const;

// ── Issue purpose code defs ───────────────────────────────────────────────────
export interface IssuePurposeDef {
    readonly purposeId:  string;
    readonly code:       string;
    readonly label:      string;
    readonly color:      string;
}

export const ISSUE_PURPOSES: readonly IssuePurposeDef[] = [
    { purposeId: 'ifr',         code: 'IFR',  label: 'Issued for Review',            color: '#f59e0b' },
    { purposeId: 'ifc',         code: 'IFC',  label: 'Issued for Construction',      color: '#22c55e' },
    { purposeId: 'ife',         code: 'IFE',  label: 'Issued for Estimation',        color: '#8b5cf6' },
    { purposeId: 'ifd',         code: 'IFD',  label: 'Issued for Design',            color: '#3b82f6' },
    { purposeId: 'ifp',         code: 'IFP',  label: 'Issued for Permit',            color: '#ec4899' },
    { purposeId: 'as-built',    code: 'AB',   label: 'As-Built Record',              color: '#10b981' },
    { purposeId: 'information', code: 'INFO', label: 'For Information Only',         color: '#94a3b8' },
];

// ── Delivery method defs ──────────────────────────────────────────────────────
export interface DeliveryMethodDef {
    readonly methodId: string;
    readonly label:    string;
    readonly icon:     string;
}

export const DELIVERY_METHODS: readonly DeliveryMethodDef[] = [
    { methodId: 'email',     label: 'Email',       icon: '📧' },
    { methodId: 'cde',       label: 'CDE Upload',  icon: '☁' },
    { methodId: 'hard-copy', label: 'Hard Copy',   icon: '📦' },
    { methodId: 'ftp',       label: 'FTP / SFTP',  icon: '🔗' },
];

// ── Inline styles ─────────────────────────────────────────────────────────────
const SHEET_ISSUANCE_PANEL_STYLES = `
.sip-panel {
    position: fixed;
    top: 56px;
    left: 844px;
    width: 272px;
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
.sip-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
    flex-shrink: 0;
}
.sip-title {
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-text-secondary, #666);
}
.sip-close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--app-text-secondary, #888);
    font-size: 14px;
    padding: 2px 4px;
    border-radius: 3px;
    line-height: 1;
}
.sip-close-btn:hover { background: rgba(0,0,0,0.06); }
.sip-body {
    overflow-y: auto;
    flex: 1 1 auto;
    padding: 4px 0;
}
.sip-section-label {
    padding: 6px 12px 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--app-text-tertiary, #aaa);
}
.sip-purpose-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.04);
}
.sip-purpose-badge {
    flex-shrink: 0;
    font-size: 9px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    letter-spacing: 0.04em;
    color: #fff;
    min-width: 32px;
    text-align: center;
}
.sip-purpose-label { font-size: 12px; flex: 1 1 auto; }
.sip-method-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.04);
}
.sip-method-icon { font-size: 14px; width: 18px; text-align: center; flex-shrink: 0; }
.sip-method-label { font-size: 12px; }
`;

// ── SheetIssuancePanel class ──────────────────────────────────────────────────

export class SheetIssuancePanel {
    /** Root DOM element. */
    public readonly element: HTMLDivElement;

    /** Wave 6 Phase B — runtime threaded by parent. */
    public readonly runtime: PryzmRuntime | null;

    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;

        if (!runtime) {
            console.warn(
                '[SheetIssuancePanel] runtime is null — panel binding disabled. ' +
                'Wire a PryzmRuntime instance in the composition root. (wave-6-b-d9)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'sip-panel';
        this.element.setAttribute('role', 'complementary');
        this.element.setAttribute('aria-label', 'Sheet issuance');
        this._injectStyles();
        this._buildDOM();
    }

    // ── Public show/hide — Phase B real binding ───────────────────────────────

    show(): void {
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = { label: 'Sheet Issuance' };
            this.runtime.viewRegistry.activatePanel(SHEET_ISSUANCE_PANEL_ID, spec);
        }
    }

    hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(SHEET_ISSUANCE_PANEL_ID);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-sip-styles', '1');
        style.textContent = SHEET_ISSUANCE_PANEL_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'sip-header';

        const title = document.createElement('span');
        title.className = 'sip-title';
        title.textContent = 'Issuance';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'sip-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close issuance panel';
        closeBtn.setAttribute('aria-label', 'Close sheet issuance panel');
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'sip-body';
        body.setAttribute('data-sip-body', '1');
        this.element.appendChild(body);

        // Purpose codes section
        const purposeLabel = document.createElement('div');
        purposeLabel.className = 'sip-section-label';
        purposeLabel.textContent = 'Issue Purpose';
        body.appendChild(purposeLabel);

        for (const p of ISSUE_PURPOSES) {
            const row = document.createElement('div');
            row.className = 'sip-purpose-row';
            row.setAttribute('data-purpose-id', p.purposeId);

            const badge = document.createElement('span');
            badge.className = 'sip-purpose-badge';
            badge.style.background = p.color;
            badge.textContent = p.code;

            const label = document.createElement('span');
            label.className = 'sip-purpose-label';
            label.textContent = p.label;

            row.appendChild(badge);
            row.appendChild(label);
            body.appendChild(row);
        }

        // Delivery methods section
        const methodLabel = document.createElement('div');
        methodLabel.className = 'sip-section-label';
        methodLabel.style.paddingTop = '10px';
        methodLabel.textContent = 'Delivery Method';
        body.appendChild(methodLabel);

        for (const m of DELIVERY_METHODS) {
            const row = document.createElement('div');
            row.className = 'sip-method-row';
            row.setAttribute('data-method-id', m.methodId);

            const icon = document.createElement('span');
            icon.className = 'sip-method-icon';
            icon.textContent = m.icon;
            icon.setAttribute('aria-hidden', 'true');

            const label = document.createElement('span');
            label.className = 'sip-method-label';
            label.textContent = m.label;

            row.appendChild(icon);
            row.appendChild(label);
            body.appendChild(row);
        }
    }
}
