/**
 * CDETransmittalPanel — Wave 6 Phase B (wave-6-b-d10)
 *
 * Document transmittal creation and management panel.  Allows users to assemble
 * transmittal packages: add/remove documents, set recipients, purpose, due date,
 * and dispatch the transmittal.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — No direct store writes.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks.
 * • §10-WAVE-6-CONVERGENCE §2 — activatePanel/deactivatePanel.
 */

import type { PryzmRuntime }  from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

export const CDE_TRANSMITTAL_PANEL_ID = 'cde-transmittal-panel' as const;

export type TransmittalPurpose =
    | 'for-information'
    | 'for-review'
    | 'for-approval'
    | 'for-construction'
    | 'for-record';

export const TRANSMITTAL_PURPOSES: readonly { purposeId: TransmittalPurpose; label: string }[] = [
    { purposeId: 'for-information',  label: 'For Information' },
    { purposeId: 'for-review',       label: 'For Review' },
    { purposeId: 'for-approval',     label: 'For Approval' },
    { purposeId: 'for-construction', label: 'For Construction' },
    { purposeId: 'for-record',       label: 'For Record' },
];

const CDE_TRANSMITTAL_PANEL_STYLES = `
.ctp-panel {
    position: fixed; top: 56px; left: 4px;
    width: 300px; max-height: calc(100vh - 80px);
    background: var(--app-panel-bg, #ffffff); color: var(--app-text, #333);
    border: 1px solid rgba(0,0,0,0.12); border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
    font-family: var(--app-font, 'Inter', sans-serif); font-size: 13px;
    z-index: 950; display: none; flex-direction: column; overflow: hidden;
}
.ctp-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid rgba(0,0,0,0.08); background: var(--app-panel-header-bg, #f7f7f7); flex-shrink: 0; }
.ctp-title { font-weight: 600; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--app-text-secondary, #666); }
.ctp-close-btn { background: none; border: none; cursor: pointer; color: var(--app-text-secondary, #888); font-size: 14px; padding: 2px 4px; border-radius: 3px; line-height: 1; }
.ctp-close-btn:hover { background: rgba(0,0,0,0.06); }
.ctp-body { overflow-y: auto; flex: 1 1 auto; padding: 10px 12px; }
.ctp-field { margin-bottom: 10px; }
.ctp-field-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--app-text-tertiary, #999); margin-bottom: 4px; }
.ctp-input { width: 100%; padding: 5px 8px; border: 1px solid rgba(0,0,0,0.14); border-radius: 5px; font-size: 12px; font-family: inherit; box-sizing: border-box; background: var(--app-input-bg, #fff); color: inherit; }
.ctp-select { width: 100%; padding: 5px 8px; border: 1px solid rgba(0,0,0,0.14); border-radius: 5px; font-size: 12px; font-family: inherit; box-sizing: border-box; background: var(--app-input-bg, #fff); color: inherit; }
.ctp-textarea { width: 100%; padding: 5px 8px; border: 1px solid rgba(0,0,0,0.14); border-radius: 5px; font-size: 12px; font-family: inherit; box-sizing: border-box; background: var(--app-input-bg, #fff); color: inherit; min-height: 60px; resize: vertical; }
.ctp-doc-list { border: 1px solid rgba(0,0,0,0.1); border-radius: 5px; min-height: 48px; padding: 4px; }
.ctp-doc-empty { font-size: 11px; color: var(--app-text-tertiary, #bbb); padding: 8px; text-align: center; }
.ctp-actions { display: flex; gap: 6px; padding: 10px 12px; border-top: 1px solid rgba(0,0,0,0.07); flex-shrink: 0; }
.ctp-btn { flex: 1; padding: 6px 10px; border: 1px solid rgba(0,0,0,0.14); border-radius: 5px; font-size: 12px; font-family: inherit; cursor: pointer; background: transparent; color: var(--app-text, #333); }
.ctp-btn-primary { background: var(--app-accent, #6600FF); color: #fff; border-color: var(--app-accent, #6600FF); }
.ctp-btn:hover { background: rgba(0,0,0,0.05); }
.ctp-btn-primary:hover { opacity: 0.9; background: var(--app-accent, #6600FF); }
`;

export class CDETransmittalPanel {
    public readonly element: HTMLDivElement;
    public readonly runtime: PryzmRuntime | null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        if (!runtime) {
            console.warn(
                '[CDETransmittalPanel] runtime is null — panel binding disabled. (wave-6-b-d10)',
            );
        }
        this.element = document.createElement('div');
        this.element.className = 'ctp-panel';
        this.element.setAttribute('role', 'dialog');
        this.element.setAttribute('aria-label', 'CDE transmittal');
        this._injectStyles();
        this._buildDOM();
    }

    show(transmittalId?: string): void {
        this.element.style.display = 'flex';
        if (this.runtime) {
            const spec: PanelViewSpec = { label: 'CDE Transmittal', transmittalId };
            this.runtime.viewRegistry.activatePanel(CDE_TRANSMITTAL_PANEL_ID, spec);
        }
    }

    hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(CDE_TRANSMITTAL_PANEL_ID);
    }

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-ctp-styles', '1');
        style.textContent = CDE_TRANSMITTAL_PANEL_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'ctp-header';
        const title = document.createElement('span');
        title.className = 'ctp-title';
        title.textContent = 'New Transmittal';
        header.appendChild(title);
        const closeBtn = document.createElement('button');
        closeBtn.className = 'ctp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.setAttribute('aria-label', 'Close transmittal panel');
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'ctp-body';

        const fields: Array<{ label: string; attr: string; type: 'input' | 'select' | 'textarea' }> = [
            { label: 'Subject',   attr: 'data-ctp-subject',    type: 'input' },
            { label: 'To',        attr: 'data-ctp-recipients', type: 'input' },
            { label: 'Purpose',   attr: 'data-ctp-purpose',    type: 'select' },
            { label: 'Due Date',  attr: 'data-ctp-due-date',   type: 'input' },
            { label: 'Notes',     attr: 'data-ctp-notes',      type: 'textarea' },
        ];

        for (const f of fields) {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'ctp-field';
            const lbl = document.createElement('div');
            lbl.className = 'ctp-field-label';
            lbl.textContent = f.label;
            fieldDiv.appendChild(lbl);

            if (f.type === 'select') {
                const sel = document.createElement('select');
                sel.className = 'ctp-select';
                sel.setAttribute(f.attr, '1');
                for (const p of TRANSMITTAL_PURPOSES) {
                    const opt = document.createElement('option');
                    opt.value = p.purposeId;
                    opt.textContent = p.label;
                    sel.appendChild(opt);
                }
                fieldDiv.appendChild(sel);
            } else if (f.type === 'textarea') {
                const ta = document.createElement('textarea');
                ta.className = 'ctp-textarea';
                ta.setAttribute(f.attr, '1');
                ta.placeholder = f.label;
                fieldDiv.appendChild(ta);
            } else {
                const inp = document.createElement('input');
                inp.type = 'text';
                inp.className = 'ctp-input';
                inp.setAttribute(f.attr, '1');
                inp.placeholder = f.label;
                fieldDiv.appendChild(inp);
            }
            body.appendChild(fieldDiv);
        }

        const docField = document.createElement('div');
        docField.className = 'ctp-field';
        const docLabel = document.createElement('div');
        docLabel.className = 'ctp-field-label';
        docLabel.textContent = 'Documents';
        docField.appendChild(docLabel);
        const docList = document.createElement('div');
        docList.className = 'ctp-doc-list';
        docList.setAttribute('data-ctp-doc-list', '1');
        const docEmpty = document.createElement('div');
        docEmpty.className = 'ctp-doc-empty';
        docEmpty.textContent = 'No documents attached';
        docList.appendChild(docEmpty);
        docField.appendChild(docList);
        body.appendChild(docField);

        this.element.appendChild(body);

        const actions = document.createElement('div');
        actions.className = 'ctp-actions';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'ctp-btn';
        cancelBtn.setAttribute('data-ctp-cancel', '1');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => this.hide());
        const sendBtn = document.createElement('button');
        sendBtn.className = 'ctp-btn ctp-btn-primary';
        sendBtn.setAttribute('data-ctp-send', '1');
        sendBtn.textContent = 'Send';
        actions.appendChild(cancelBtn);
        actions.appendChild(sendBtn);
        this.element.appendChild(actions);
    }
}
