/**
 * SheetsRailPanel — Sheets section content for the left-rail system.
 *
 * Extracted from ProjectBrowserPanel — all sheet-related logic including:
 *   - Sheet list entries
 *   - Inline create-sheet form
 *   - Drawing Register panel (Phase S8)
 *
 * Contract compliance:
 *   §05 §9   — New UI file under src/ui/
 *   §05 §6   — Zero bim-* elements; pure native HTML
 *   §01 §2   — All mutations via the legacy command manager
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { sheetStore } from '@pryzm/core-app-model';

import { sheetIndexService } from '@pryzm/core-app-model';
import type { RailPanelController } from '../RailPanelController';

export class SheetsRailPanel {
    private readonly _sectionId = 'SHEETS';
    private _registerOpen  = false;
    private _createFormOpen: Map<string, boolean> = new Map();

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(private readonly _rail: RailPanelController, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        const refresh = () => this._rail.refreshIfActive(this._sectionId);
        window.addEventListener('sd:sheet-created', refresh);
        window.addEventListener('sd:sheet-updated', refresh);
        window.addEventListener('sd:sheet-deleted', refresh);
        window.addEventListener('sd:store-loaded',  refresh);
        window.addEventListener('sd:store-reset',   refresh);
    }

    build(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'pb-generic-list';

        const sheets     = sheetStore.getAll();
        const isFormOpen = this._createFormOpen.get('sheet') ?? false;

        const header = document.createElement('div');
        header.className = 'pb-list-header';

        const labelEl = document.createElement('span');
        labelEl.className   = 'pb-list-label';
        labelEl.textContent = 'Drawing Sheets';

        const addBtn = document.createElement('button');
        addBtn.className   = 'pb-view-add-btn';
        addBtn.type        = 'button';
        addBtn.title       = 'Create new sheet';
        addBtn.textContent = '+';
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._createFormOpen.set('sheet', !isFormOpen);
            this._rail.refreshIfActive(this._sectionId);
        });

        const registerBtn = document.createElement('button');
        registerBtn.className   = 'pb-register-toggle-btn' + (this._registerOpen ? ' pb-register-toggle-btn--active' : '');
        registerBtn.type        = 'button';
        registerBtn.title       = this._registerOpen ? 'Hide Drawing Register' : 'Show Drawing Register';
        registerBtn.textContent = '📋 Register';
        registerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._registerOpen = !this._registerOpen;
            this._rail.refreshIfActive(this._sectionId);
        });

        const headerBtns = document.createElement('div');
        headerBtns.style.cssText = 'display:flex;align-items:center;gap:4px;';
        headerBtns.appendChild(registerBtn);
        headerBtns.appendChild(addBtn);

        header.appendChild(labelEl);
        header.appendChild(headerBtns);
        container.appendChild(header);

        if (isFormOpen) {
            container.appendChild(this._buildCreateSheetForm());
        }

        for (const sheet of sheets) {
            const entry = document.createElement('div');
            entry.className = 'pb-view-entry';
            entry.setAttribute('role', 'button');
            entry.setAttribute('tabindex', '0');
            entry.title = [
                `Sheet: ${sheet.sheetNumber} — ${sheet.name}`,
                sheet.revision ? `Rev. ${sheet.revision}` : '',
                `Views placed: ${sheet.viewports.length}`,
                'Single-click: properties · Double-click: open editor',
            ].filter(Boolean).join('\n');

            const numEl = document.createElement('span');
            numEl.className   = 'pb-sheet-number';
            numEl.textContent = sheet.sheetNumber;

            const nameEl = document.createElement('span');
            nameEl.className   = 'pb-view-name';
            nameEl.textContent = sheet.name;

            entry.appendChild(numEl);
            entry.appendChild(nameEl);

            if (sheet.revision) {
                const revBadge = document.createElement('span');
                revBadge.className   = 'pb-sheet-on-badge';
                revBadge.textContent = `Rev. ${sheet.revision}`;
                revBadge.title       = 'Current revision';
                entry.appendChild(revBadge);
            }

            if (sheet.status) {
                const statusBadge = document.createElement('span');
                statusBadge.className   = `pb-sheet-status-badge pb-sheet-status-badge--${sheet.status}`;
                statusBadge.textContent = sheetIndexService.getStatusLabel(sheet.status);
                statusBadge.title       = `Workflow status: ${sheetIndexService.getStatusLabel(sheet.status)}`;
                entry.appendChild(statusBadge);
            }

            const handleSelect = () => this._onEntitySelect(sheet.id);
            const handleOpen   = () => this._onOpenSheetEditor(sheet.id);

            entry.addEventListener('click', handleSelect);
            entry.addEventListener('dblclick', handleOpen);
            entry.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter') { e.preventDefault(); handleOpen(); }
                if (e.key === ' ')     { e.preventDefault(); handleSelect(); }
            });

            container.appendChild(entry);
        }

        if (sheets.length === 0 && !isFormOpen) {
            const empty = document.createElement('div');
            empty.className   = 'pb-view-empty';
            empty.textContent = 'No sheets — use + to add';
            container.appendChild(empty);
        }

        if (this._registerOpen) {
            container.appendChild(this._buildSheetRegisterPanel());
        }

        return container;
    }

    private _buildCreateSheetForm(): HTMLElement {
        const form = document.createElement('div');
        form.className = 'pb-create-form';

        const numInput = document.createElement('input');
        numInput.className    = 'pb-create-form-input';
        numInput.type         = 'text';
        numInput.placeholder  = 'Sheet number (e.g. A1-001)…';
        numInput.setAttribute('aria-label', 'Sheet number');
        numInput.setAttribute('autocomplete', 'off');

        const nameInput = document.createElement('input');
        nameInput.className    = 'pb-create-form-input';
        nameInput.type         = 'text';
        nameInput.placeholder  = 'Sheet name (optional — auto-fills from number)';
        nameInput.setAttribute('aria-label', 'Sheet name');
        nameInput.setAttribute('autocomplete', 'off');
        nameInput.style.marginTop = '4px';

        const validation = document.createElement('div');
        validation.className = 'pb-create-form-validation';
        validation.style.display = 'none';

        const actions   = document.createElement('div');
        actions.className = 'pb-create-form-actions';

        const createBtn = document.createElement('button');
        createBtn.className   = 'pb-create-form-btn pb-create-form-btn--primary';
        createBtn.type        = 'button';
        createBtn.textContent = 'Create';

        const cancelBtn = document.createElement('button');
        cancelBtn.className   = 'pb-create-form-btn';
        cancelBtn.type        = 'button';
        cancelBtn.textContent = 'Cancel';

        const doCreate = () => {
            const num  = numInput.value.trim();
            // Name is optional — auto-generate from sheet number if not provided
            const name = nameInput.value.trim() || `Sheet ${num}`;
            if (!num) {
                validation.textContent = 'Sheet number is required.';
                validation.style.display = '';
                numInput.style.borderColor = '#e04040';
                numInput.focus();
                return;
            }
            validation.style.display = 'none';
            numInput.style.borderColor = '';
            this._executeCreateSheet(num, name);
            this._createFormOpen.set('sheet', false);
            this._rail.refreshIfActive(this._sectionId);
        };

        const doCancel = () => {
            this._createFormOpen.set('sheet', false);
            this._rail.refreshIfActive(this._sectionId);
        };

        numInput.addEventListener('input', () => {
            validation.style.display = 'none';
            numInput.style.borderColor = '';
        });

        createBtn.addEventListener('click', doCreate);
        cancelBtn.addEventListener('click', doCancel);
        nameInput.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter')  { e.preventDefault(); doCreate(); }
            if (e.key === 'Escape') { e.preventDefault(); doCancel(); }
        });
        numInput.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter')  { e.preventDefault(); doCreate(); }
            if (e.key === 'Escape') { e.preventDefault(); doCancel(); }
        });

        actions.appendChild(createBtn);
        actions.appendChild(cancelBtn);
        form.appendChild(numInput);
        form.appendChild(nameInput);
        form.appendChild(validation);
        form.appendChild(actions);

        // D.7.5: routed through getFrameScheduler() instead of raw rAF.
        getFrameScheduler().scheduleOnce('sheets-rail-create-focus', () => numInput.focus());
        return form;
    }

    private _executeCreateSheet(sheetNumber: string, name: string): void {
        // Phase C (Task 3.2): sheet.create is now the primary dispatch path.
        // CreateSheetHandler (plugins/sheets/src/handlers/CreateSheet.ts, type='sheet.create')
        // is a real handler — commandManager removed.
        const id = `sheet-${crypto.randomUUID()}`;
        window.runtime?.bus?.executeCommand('sheet.create', { id, sheetNumber, name })
            ?.catch(console.error)
            ?? console.warn('[SheetsRailPanel] runtime.bus not available — sheet creation skipped');
        console.log(`[SheetsRailPanel] Created Sheet: ${sheetNumber} — ${name} id=${id}`);
    }

    private _buildSheetRegisterPanel(): HTMLElement {
        const panel = document.createElement('div');
        panel.className = 'pb-register-panel';

        const toolbar = document.createElement('div');
        toolbar.className = 'pb-register-toolbar';

        const toolbarLabel = document.createElement('span');
        toolbarLabel.className   = 'pb-register-toolbar-label';
        toolbarLabel.textContent = 'Drawing Register';
        toolbar.appendChild(toolbarLabel);

        const printBtn = document.createElement('button');
        printBtn.className   = 'pb-register-print-btn';
        printBtn.type        = 'button';
        printBtn.title       = 'Print Drawing Register';
        printBtn.textContent = '🖨 Print';
        printBtn.addEventListener('click', () => {
            const projectName = window.projectStore?.getActive?.()?.name ?? ''; // TODO(C.3.x): legacy projectStore — replace with runtime.projectContext
            sheetIndexService.printRegister(projectName);
        });
        toolbar.appendChild(printBtn);
        panel.appendChild(toolbar);

        const rows = sheetIndexService.getRows();
        if (rows.length === 0) {
            const empty = document.createElement('div');
            empty.className   = 'pb-register-empty';
            empty.textContent = 'No sheets in this project yet.';
            panel.appendChild(empty);
            return panel;
        }

        const tableWrapper = document.createElement('div');
        tableWrapper.style.cssText = 'overflow-x:auto;max-height:280px;overflow-y:auto;';

        const table = document.createElement('table');
        table.className = 'pb-register-table';

        const thead = document.createElement('thead');
        thead.className = 'pb-register-thead';
        thead.innerHTML = `<tr>
            <th>No.</th>
            <th>Sheet Name</th>
            <th>Rev.</th>
            <th>Status</th>
            <th>Date</th>
            <th>By</th>
            <th title="Placed viewports">Views</th>
        </tr>`;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        for (const row of rows) {
            const tr = document.createElement('tr');
            tr.className = 'pb-register-row';
            tr.title     = 'Double-click to open sheet editor';

            const tdNum = document.createElement('td');
            const numSpan = document.createElement('span');
            numSpan.className   = 'pb-register-num';
            numSpan.textContent = row.sheetNumber;
            tdNum.appendChild(numSpan);
            tr.appendChild(tdNum);

            const tdName = document.createElement('td');
            tdName.textContent = row.name;
            tr.appendChild(tdName);

            const tdRev = document.createElement('td');
            tdRev.textContent = row.revision || '—';
            tr.appendChild(tdRev);

            const tdStatus = document.createElement('td');
            if (row.status) {
                const chip = document.createElement('span');
                chip.className   = `pb-register-status pb-register-status--${row.status}`;
                chip.textContent = sheetIndexService.getStatusLabel(row.status);
                tdStatus.appendChild(chip);
            } else {
                tdStatus.textContent = '—';
            }
            tr.appendChild(tdStatus);

            const tdDate = document.createElement('td');
            tdDate.textContent = row.issueDate || '—';
            tr.appendChild(tdDate);

            const tdBy = document.createElement('td');
            tdBy.textContent = row.issuedBy || '—';
            tr.appendChild(tdBy);

            const tdVp = document.createElement('td');
            tdVp.className   = 'pb-register-vp-count';
            tdVp.textContent = String(row.viewportCount);
            tr.appendChild(tdVp);

            tr.addEventListener('click',    () => this._onEntitySelect(row.sheetId));
            tr.addEventListener('dblclick', () => this._onOpenSheetEditor(row.sheetId));

            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        tableWrapper.appendChild(table);
        panel.appendChild(tableWrapper);
        return panel;
    }

    private _onEntitySelect(sheetId: string): void {
        const sheet = sheetStore.get(sheetId);
        if (!sheet) return;
        const viewPropertiesPanel = window.viewPropertiesPanel; // TODO(F.6.5): legacy viewPropertiesPanel — replace with runtime.panelHost.get('viewProperties')
        if (viewPropertiesPanel?.showSheet) viewPropertiesPanel.showSheet(sheet);
        console.log(`[SheetsRailPanel] Selected sheet: ${sheet.sheetNumber} — ${sheet.name}`);
    }

    private _onOpenSheetEditor(sheetId: string): void {
        const editor = window.sheetEditorPanel; // TODO(F.6.5): legacy sheetEditorPanel — replace with runtime.panelHost.get('sheetEditor')
        if (editor?.open) {
            editor.open(sheetId);
        } else {
            console.warn('[SheetsRailPanel] sheetEditorPanel not available on window');
        }
        console.log(`[SheetsRailPanel] Opened Sheet Editor for sheet: ${sheetId}`);
    }
}
