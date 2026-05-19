/**
 * SheetIndexService — Phase S8 (Sheet Integration, GAP-09)
 *
 * Pure read-only utility that builds a live Drawing Register (Sheet Index)
 * from the SheetStore. Follows the Revit "Drawing Register" concept: a
 * project-level table listing every sheet with its current revision, status,
 * issue date, and issued-by metadata.
 *
 * Contract compliance:
 *   §01 §2     — Read-only; no store mutations, no Command routing
 *   §03 §1.1   — No schema changes; reads only published SheetDefinition fields
 *   §05        — No DOM except in printRegister() utility helper
 *   §06        — No platform-layer imports
 *   §07        — No server routes; client-side only
 *
 * Registered on window.sheetIndexService by EngineBootstrap.
 *
 * Usage:
 *   const rows = sheetIndexService.getRows();
 *   sheetIndexService.printRegister('My Project Name');
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { sheetStore } from './views/SheetStore';

// ── Public types ───────────────────────────────────────────────────────────────

export interface SheetIndexRow {
    /** Stable SheetDefinition ID */
    sheetId:       string;
    /** Sheet number (e.g. "A101") */
    sheetNumber:   string;
    /** Descriptive name */
    name:          string;
    /** Latest revision code (e.g. "B") — empty string if none */
    revision:      string;
    /** Workflow status — empty string if not set */
    status:        string;
    /** ISO date string or formatted date — empty string if not set */
    issueDate:     string;
    /** Issued-by person / team — empty string if not set */
    issuedBy:      string;
    /** Number of viewports placed on this sheet */
    viewportCount: number;
    /** Unix ms — for recency sorting */
    modifiedAt:    number;
}

// Map from status key to human-readable label
const STATUS_LABELS: Record<string, string> = {
    'draft':            'Draft',
    'for-review':       'For Review',
    'for-construction': 'For Construction',
    'issued':           'Issued',
    'superseded':       'Superseded',
};

// ── Service class ──────────────────────────────────────────────────────────────

class SheetIndexServiceImpl {

    /**
     * Returns all sheets as SheetIndexRow[], sorted by sheet number
     * using a natural (alphanumeric) sort so "A101" < "A102" < "A201" < "B001".
     */
    getRows(): SheetIndexRow[] {
        return sheetStore.getAll()
            .map(s => ({
                sheetId:       s.id,
                sheetNumber:   s.sheetNumber,
                name:          s.name,
                revision:      s.revision ?? '',
                status:        s.status ?? '',
                issueDate:     s.issueDate ?? '',
                issuedBy:      s.issuedBy  ?? '',
                viewportCount: s.viewports?.length ?? 0,
                modifiedAt:    s.metadata?.modifiedAt ?? 0,
            }))
            .sort((a, b) => a.sheetNumber.localeCompare(b.sheetNumber, undefined, { numeric: true, sensitivity: 'base' }));
    }

    /**
     * Returns a human-readable label for a status key.
     * Falls back to the raw key for unknown values, and '—' for empty string.
     */
    getStatusLabel(statusKey: string): string {
        if (!statusKey) return '—';
        return STATUS_LABELS[statusKey] ?? statusKey;
    }

    /**
     * Returns a CSS-safe class suffix for the given status key.
     * Maps to the sh-status-badge--* variants defined in AppTheme.ts.
     */
    getStatusClass(statusKey: string): string {
        if (!statusKey) return '';
        return `sh-status-badge--${statusKey}`;
    }

    /**
     * Triggers a browser print of the Drawing Register.
     * Builds a temporary hidden print layer with a clean A4-style table layout
     * and calls window.print(). The print layer is removed after the dialog.
     *
     * @param projectName  Optional project name shown as the document heading.
     */
    printRegister(projectName?: string): void {
        const rows = this.getRows();

        // Remove any existing print layer
        const existing = document.getElementById('pryzm-register-print-layer');
        if (existing) existing.remove();

        // Inject print-only CSS once
        const PRINT_STYLE_ID = 'pryzm-register-print-style';
        if (!document.getElementById(PRINT_STYLE_ID)) {
            const style = document.createElement('style');
            style.id = PRINT_STYLE_ID;
            style.textContent = `
                @media print {
                    body > *:not(#pryzm-register-print-layer) { display: none !important; }
                    #pryzm-register-print-layer {
                        display: block !important;
                        position: fixed;
                        inset: 0;
                        background: #fff;
                        z-index: 99999;
                        padding: 24px 32px;
                        font-family: Arial, sans-serif;
                        color: #111;
                        box-sizing: border-box;
                    }
                    #pryzm-register-print-layer h1 {
                        font-size: 14px;
                        font-weight: 700;
                        margin: 0 0 4px;
                        letter-spacing: 0.02em;
                    }
                    #pryzm-register-print-layer .reg-meta {
                        font-size: 8px;
                        color: #666;
                        margin-bottom: 12px;
                    }
                    #pryzm-register-print-layer table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 9px;
                    }
                    #pryzm-register-print-layer th {
                        background: #f0f0f0;
                        border: 1px solid #ccc;
                        padding: 4px 6px;
                        text-align: left;
                        font-weight: 600;
                        white-space: nowrap;
                    }
                    #pryzm-register-print-layer td {
                        border: 1px solid #ddd;
                        padding: 3px 6px;
                        vertical-align: middle;
                    }
                    #pryzm-register-print-layer tr:nth-child(even) td {
                        background: #f9f9f9;
                    }
                    #pryzm-register-print-layer .status-chip {
                        display: inline-block;
                        padding: 1px 5px;
                        border-radius: 2px;
                        font-size: 7px;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.04em;
                        background: #eee;
                        color: #444;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        // Build the print layer
        const layer = document.createElement('div');
        layer.id = 'pryzm-register-print-layer';
        layer.style.cssText = 'display:none;';

        const heading = document.createElement('h1');
        heading.textContent = projectName ? `${projectName} — Drawing Register` : 'Drawing Register';
        layer.appendChild(heading);

        const meta = document.createElement('div');
        meta.className = 'reg-meta';
        meta.textContent = `Printed: ${new Date().toLocaleDateString('en-GB')}  ·  Total sheets: ${rows.length}`;
        layer.appendChild(meta);

        const table = document.createElement('table');

        const thead = document.createElement('thead');
        thead.innerHTML = `<tr>
            <th>#</th>
            <th>Sheet No.</th>
            <th>Sheet Name</th>
            <th>Rev.</th>
            <th>Status</th>
            <th>Issue Date</th>
            <th>Issued By</th>
            <th>Views</th>
        </tr>`;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        rows.forEach((row, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${i + 1}</td>
                <td><strong>${this._escHtml(row.sheetNumber)}</strong></td>
                <td>${this._escHtml(row.name)}</td>
                <td>${this._escHtml(row.revision) || '—'}</td>
                <td><span class="status-chip">${this._escHtml(this.getStatusLabel(row.status))}</span></td>
                <td>${this._escHtml(row.issueDate) || '—'}</td>
                <td>${this._escHtml(row.issuedBy)  || '—'}</td>
                <td>${row.viewportCount}</td>
            `;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        layer.appendChild(table);

        document.body.appendChild(layer);
        layer.style.display = 'block';

        // D.7.5: routed through getFrameScheduler() instead of raw rAF.
        getFrameScheduler().scheduleOnce('sheet-index-print-register', () => {
            window.print();
            setTimeout(() => layer.remove(), 1000);
        });

        console.log(`[SheetIndexService] Print register triggered — ${rows.length} sheets`);
    }

    // ── Private helpers ─────────────────────────────────────────────────────────

    private _escHtml(str: string): string {
        return str
            .replace(/&/g,  '&amp;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/"/g,  '&quot;');
    }
}

export const sheetIndexService = new SheetIndexServiceImpl();
export type { SheetIndexServiceImpl };
