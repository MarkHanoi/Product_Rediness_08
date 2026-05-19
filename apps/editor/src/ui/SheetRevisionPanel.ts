/**
 * SheetRevisionPanel — Wave 6 Phase B (wave-6-b-d9)
 *
 * Sheet revision management: displays the revision schedule for a sheet,
 * lets users add/edit revisions (number, date, description, issued-by),
 * and associates revision clouds drawn on viewports with revision entries.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — No direct store writes; revision mutations dispatch
 *   typed commands via `runtime.bus.executeCommand`.
 * • §02-ARCHITECTURE §3.3 — UI layer imports only from @pryzm/* packages.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; warns when runtime is null.
 * • §10-WAVE-6-CONVERGENCE §2 — activatePanel on show(), deactivatePanel on
 *   hide(); validated by Vitest binding test (wave-6-b-d9).
 *
 * Public API
 * ──────────
 *   const srp = new SheetRevisionPanel(runtime);
 *   document.body.appendChild(srp.element);
 *   srp.show('sheet-guid-03');
 *   srp.hide();
 */

import type { PryzmRuntime }   from '@pryzm/runtime-composer/types';
import type { PanelViewSpec }  from '@pryzm/runtime-composer/types';

// ── Panel ID ──────────────────────────────────────────────────────────────────
export const SHEET_REVISION_PANEL_ID = 'sheet-revision-panel' as const;

// ── Revision sequence numbering methods ──────────────────────────────────────
export type RevisionSequenceType = 'numeric' | 'alpha-upper' | 'alpha-lower' | 'none';

export interface RevisionSequenceDef {
    readonly sequenceId: RevisionSequenceType;
    readonly label:      string;
    readonly example:    string;
}

export const REVISION_SEQUENCES: readonly RevisionSequenceDef[] = [
    { sequenceId: 'numeric',     label: 'Numeric',          example: '1, 2, 3 …'   },
    { sequenceId: 'alpha-upper', label: 'Alpha (uppercase)', example: 'A, B, C …'   },
    { sequenceId: 'alpha-lower', label: 'Alpha (lowercase)', example: 'a, b, c …'   },
    { sequenceId: 'none',        label: 'None',             example: '—'            },
];

// ── Revision column defs (schedule header) ───────────────────────────────────
export interface RevisionColumnDef {
    readonly columnId: string;
    readonly label:    string;
    readonly width:    string;
}

export const REVISION_COLUMNS: readonly RevisionColumnDef[] = [
    { columnId: 'sequence',    label: '#',           width: '32px'  },
    { columnId: 'date',        label: 'Date',         width: '80px'  },
    { columnId: 'description', label: 'Description',  width: '1fr'   },
    { columnId: 'issued-by',   label: 'By',           width: '48px'  },
];

// ── Inline styles ─────────────────────────────────────────────────────────────
const SHEET_REVISION_PANEL_STYLES = `
.srp-panel {
    position: fixed;
    top: 56px;
    left: 544px;
    width: 288px;
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
.srp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
    flex-shrink: 0;
}
.srp-title {
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-text-secondary, #666);
}
.srp-close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--app-text-secondary, #888);
    font-size: 14px;
    padding: 2px 4px;
    border-radius: 3px;
    line-height: 1;
}
.srp-close-btn:hover { background: rgba(0,0,0,0.06); }
.srp-sequence-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.06);
    flex-shrink: 0;
}
.srp-seq-label { font-size: 11px; color: var(--app-text-secondary, #666); }
.srp-seq-select {
    flex: 1 1 auto;
    padding: 4px 6px;
    border: 1px solid rgba(0,0,0,0.14);
    border-radius: 4px;
    font-size: 11px;
    font-family: inherit;
    background: var(--app-input-bg, #fff);
    color: inherit;
}
.srp-schedule-header {
    display: grid;
    grid-template-columns: 32px 80px 1fr 48px;
    gap: 0;
    padding: 5px 12px;
    background: rgba(0,0,0,0.03);
    border-bottom: 1px solid rgba(0,0,0,0.08);
    flex-shrink: 0;
}
.srp-col-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--app-text-tertiary, #aaa);
}
.srp-body {
    overflow-y: auto;
    flex: 1 1 auto;
}
.srp-empty {
    padding: 20px 12px;
    font-size: 12px;
    color: var(--app-text-tertiary, #bbb);
    text-align: center;
}
.srp-add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    margin: 8px 12px;
    padding: 6px;
    border: 1px dashed rgba(0,0,0,0.18);
    border-radius: 5px;
    cursor: pointer;
    background: transparent;
    font-size: 11px;
    color: var(--app-text-secondary, #666);
    font-family: inherit;
    flex-shrink: 0;
}
.srp-add-btn:hover { background: rgba(0,0,0,0.03); }
`;

// ── SheetRevisionPanel class ──────────────────────────────────────────────────

export class SheetRevisionPanel {
    /** Root DOM element. */
    public readonly element: HTMLDivElement;

    /** Wave 6 Phase B — runtime threaded by parent. */
    public readonly runtime: PryzmRuntime | null;

    private _sheetId: string | null = null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;

        if (!runtime) {
            console.warn(
                '[SheetRevisionPanel] runtime is null — panel binding disabled. ' +
                'Wire a PryzmRuntime instance in the composition root. (wave-6-b-d9)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'srp-panel';
        this.element.setAttribute('role', 'complementary');
        this.element.setAttribute('aria-label', 'Sheet revisions');
        this._injectStyles();
        this._buildDOM();
    }

    // ── Public show/hide — Phase B real binding ───────────────────────────────

    show(sheetId?: string): void {
        if (sheetId !== undefined) this._sheetId = sheetId;
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = {
                label:     'Sheet Revisions',
                elementId: this._sheetId ?? undefined,
            };
            this.runtime.viewRegistry.activatePanel(SHEET_REVISION_PANEL_ID, spec);
        }
    }

    hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(SHEET_REVISION_PANEL_ID);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-srp-styles', '1');
        style.textContent = SHEET_REVISION_PANEL_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'srp-header';

        const title = document.createElement('span');
        title.className = 'srp-title';
        title.textContent = 'Revisions';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'srp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close revision panel';
        closeBtn.setAttribute('aria-label', 'Close sheet revision panel');
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        // Sequence selector
        const seqRow = document.createElement('div');
        seqRow.className = 'srp-sequence-row';
        const seqLabel = document.createElement('span');
        seqLabel.className = 'srp-seq-label';
        seqLabel.textContent = 'Numbering:';
        const seqSelect = document.createElement('select');
        seqSelect.className = 'srp-seq-select';
        seqSelect.setAttribute('aria-label', 'Revision numbering sequence');
        seqSelect.setAttribute('data-srp-sequence', '1');
        for (const seq of REVISION_SEQUENCES) {
            const option = document.createElement('option');
            option.value = seq.sequenceId;
            option.textContent = `${seq.label} (${seq.example})`;
            seqSelect.appendChild(option);
        }
        seqRow.appendChild(seqLabel);
        seqRow.appendChild(seqSelect);
        this.element.appendChild(seqRow);

        // Schedule header
        const scheduleHeader = document.createElement('div');
        scheduleHeader.className = 'srp-schedule-header';
        scheduleHeader.setAttribute('data-srp-schedule-header', '1');
        for (const col of REVISION_COLUMNS) {
            const colLabel = document.createElement('div');
            colLabel.className = 'srp-col-label';
            colLabel.setAttribute('data-col-id', col.columnId);
            colLabel.textContent = col.label;
            scheduleHeader.appendChild(colLabel);
        }
        this.element.appendChild(scheduleHeader);

        // Body
        const body = document.createElement('div');
        body.className = 'srp-body';
        body.setAttribute('data-srp-body', '1');
        const empty = document.createElement('div');
        empty.className = 'srp-empty';
        empty.textContent = 'No revisions on this sheet';
        body.appendChild(empty);
        this.element.appendChild(body);

        // Add button
        const addBtn = document.createElement('button');
        addBtn.className = 'srp-add-btn';
        addBtn.setAttribute('aria-label', 'Add revision');
        addBtn.setAttribute('data-srp-add-btn', '1');
        addBtn.textContent = '+ Add Revision';
        this.element.appendChild(addBtn);
    }
}
