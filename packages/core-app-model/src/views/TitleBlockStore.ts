/**
 * TitleBlockStore — Phase S3 (Sheet Integration)
 *
 * Read-only store of TitleBlock templates.
 * Pre-seeded with standard A0, A1, A3 templates.
 * No mutations needed in Phase S3 — templates are read-only library entries.
 *
 * Contract compliance:
 *   §01 §3.3 — Read-only ElementStore pattern (no write API in Phase S3)
 *   §03 §1.1 — Schema-stable
 *   §05      — Pure data module; no DOM, no Three.js
 *   §07      — No server routes; client-side only
 */

import type { TitleBlockTemplate } from './TitleBlockTypes';

// ── Pre-seeded templates ───────────────────────────────────────────────────────

const A0_TEMPLATE: TitleBlockTemplate = {
    id:          'a0-standard',
    name:        'A0 Standard',
    paperWidth:  1189,
    paperHeight: 841,
    borderWidth: 180,
    fields: [
        { key: 'projectName',    label: 'Project',        x: 1015, y: 220, width: 160, height: 20, fontSize: 10, bold: true },
        { key: 'projectAddress', label: 'Address',        x: 1015, y: 196, width: 160, height: 20, fontSize:  7 },
        { key: 'sheetNumber',    label: 'Sheet No.',      x: 1015, y: 100, width:  80, height: 20, fontSize: 11, bold: true },
        { key: 'sheetName',      label: 'Sheet Title',    x: 1015, y: 76,  width: 160, height: 20, fontSize:  9, bold: true },
        { key: 'scale',          label: 'Scale',          x: 1015, y: 52,  width:  80, height: 16, fontSize:  8 },
        { key: 'date',           label: 'Date',           x: 1100, y: 52,  width:  75, height: 16, fontSize:  8 },
        { key: 'drawnBy',        label: 'Drawn',          x: 1015, y: 36,  width:  50, height: 14, fontSize:  7 },
        { key: 'checkedBy',      label: 'Checked',        x: 1070, y: 36,  width:  50, height: 14, fontSize:  7 },
        { key: 'approvedBy',     label: 'Approved',       x: 1125, y: 36,  width:  50, height: 14, fontSize:  7 },
        { key: 'contractNo',     label: 'Contract No.',   x: 1015, y: 20,  width: 160, height: 14, fontSize:  7 },
        { key: 'revision',       label: 'Rev.',           x: 1155, y: 100, width:  20, height: 20, fontSize: 11, bold: true },
    ],
    revisionZone: { x: 1015, y: 260, width: 160, rowHeight: 14, maxRows: 8 },
};

const A1_TEMPLATE: TitleBlockTemplate = {
    id:          'a1-standard',
    name:        'A1 Standard',
    paperWidth:  841,
    paperHeight: 594,
    borderWidth: 160,
    fields: [
        { key: 'projectName',    label: 'Project',        x: 687, y: 160, width: 140, height: 18, fontSize: 9, bold: true },
        { key: 'projectAddress', label: 'Address',        x: 687, y: 138, width: 140, height: 18, fontSize: 6 },
        { key: 'sheetNumber',    label: 'Sheet No.',      x: 687, y: 80,  width:  70, height: 18, fontSize: 10, bold: true },
        { key: 'sheetName',      label: 'Sheet Title',    x: 687, y: 58,  width: 140, height: 18, fontSize:  8, bold: true },
        { key: 'scale',          label: 'Scale',          x: 687, y: 40,  width:  70, height: 14, fontSize:  7 },
        { key: 'date',           label: 'Date',           x: 757, y: 40,  width:  70, height: 14, fontSize:  7 },
        { key: 'drawnBy',        label: 'Drawn',          x: 687, y: 26,  width:  46, height: 12, fontSize:  6 },
        { key: 'checkedBy',      label: 'Checked',        x: 734, y: 26,  width:  46, height: 12, fontSize:  6 },
        { key: 'approvedBy',     label: 'Approved',       x: 781, y: 26,  width:  46, height: 12, fontSize:  6 },
        { key: 'contractNo',     label: 'Contract No.',   x: 687, y: 12,  width: 140, height: 12, fontSize:  6 },
        { key: 'revision',       label: 'Rev.',           x: 807, y: 80,  width:  20, height: 18, fontSize: 10, bold: true },
    ],
    revisionZone: { x: 687, y: 185, width: 140, rowHeight: 12, maxRows: 6 },
};

const A3_TEMPLATE: TitleBlockTemplate = {
    id:          'a3-standard',
    name:        'A3 Standard',
    paperWidth:  420,
    paperHeight: 297,
    borderWidth: 120,
    fields: [
        { key: 'projectName',    label: 'Project',        x: 305, y: 100, width: 100, height: 14, fontSize: 7, bold: true },
        { key: 'projectAddress', label: 'Address',        x: 305, y: 84,  width: 100, height: 14, fontSize: 5 },
        { key: 'sheetNumber',    label: 'Sheet No.',      x: 305, y: 50,  width:  55, height: 14, fontSize: 8, bold: true },
        { key: 'sheetName',      label: 'Sheet Title',    x: 305, y: 36,  width: 100, height: 14, fontSize: 6, bold: true },
        { key: 'scale',          label: 'Scale',          x: 305, y: 22,  width:  50, height: 12, fontSize: 6 },
        { key: 'date',           label: 'Date',           x: 355, y: 22,  width:  50, height: 12, fontSize: 6 },
        { key: 'drawnBy',        label: 'Drawn',          x: 305, y: 10,  width:  33, height: 10, fontSize: 5 },
        { key: 'checkedBy',      label: 'Checked',        x: 338, y: 10,  width:  33, height: 10, fontSize: 5 },
        { key: 'approvedBy',     label: 'Approved',       x: 372, y: 10,  width:  33, height: 10, fontSize: 5 },
        { key: 'revision',       label: 'Rev.',           x: 361, y: 50,  width:  44, height: 14, fontSize: 8, bold: true },
    ],
    revisionZone: { x: 305, y: 120, width: 100, rowHeight: 10, maxRows: 5 },
};

// ── TitleBlockStore ────────────────────────────────────────────────────────────

class TitleBlockStoreImpl {
    private _templates: Map<string, TitleBlockTemplate> = new Map([
        ['a0-standard', A0_TEMPLATE],
        ['a1-standard', A1_TEMPLATE],
        ['a3-standard', A3_TEMPLATE],
    ]);

    getAll(): TitleBlockTemplate[] {
        return [...this._templates.values()].map(t => JSON.parse(JSON.stringify(t)));
    }

    get(templateId: string): TitleBlockTemplate | undefined {
        const t = this._templates.get(templateId);
        return t ? JSON.parse(JSON.stringify(t)) : undefined;
    }

    has(templateId: string): boolean {
        return this._templates.has(templateId);
    }

    /**
     * Returns the default template (A1 Standard).
     * Used when a sheet has no explicit titleBlock set.
     */
    getDefault(): TitleBlockTemplate {
        return JSON.parse(JSON.stringify(A1_TEMPLATE));
    }
}

export const titleBlockStore = new TitleBlockStoreImpl();
export type { TitleBlockStoreImpl };

// VIEW-SYSTEM-AUDIT-2026 F5.5 — register with StoreRegistry (read-only library).
import { storeRegistry } from '../StoreRegistry';
storeRegistry.register('title-block', titleBlockStore as unknown as import('../StoreRegistry').BimStore);
