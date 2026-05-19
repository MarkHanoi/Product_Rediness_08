/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Data Workbench: Programme Manager (Phase C-5)
 * File:             src/ui/dataworkbench/ProgrammePanel.ts
 * Contract:         docs/PRYZM_MASTER_ROADMAP_2026.md § PHASE C-5
 *
 * Brief vs Model comparison table — replaces dRofus core value proposition.
 *
 * Features:
 *   - Manual brief entry: room type, required qty, target area (m²)
 *   - Live comparison: designed qty and avg area from roomStore
 *   - Deviation column: Δ rooms and Δ area %
 *   - Total GIA row (required vs actual)
 *   - [Import CSV] and [Export CSV]
 *   - Exposes window.programmeStore for ScheduleExtractor access // TODO(TASK-08)
 *   - Auto-refreshes on 'pryzm-sync-state-changed'
 *
 * CSS prefix: dw-
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProgrammeEntry {
    id:            string;
    occupancyType: string;
    label:         string;
    requiredQty:   number;
    targetAreaM2:  number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string {
    return Math.random().toString(36).slice(2, 9);
}

function devClass(pct: number): string {
    if (Math.abs(pct) <= 5)  return '#22c55e';
    if (Math.abs(pct) <= 15) return '#f59e0b';
    return '#ef4444';
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export class ProgrammePanel {
    private _container: HTMLElement;
    private _root!: HTMLElement;
    private _entries: ProgrammeEntry[] = [];
    private _tableEl!: HTMLElement;
    private _totalEl!: HTMLElement;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._container = container;
        this._root = document.createElement('div');
        this._root.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';
        this._container.appendChild(this._root);

        // Expose store globally
        window.programmeStore = { // TODO(F.6.x): legacy programmeStore — replace with runtime.dataWorkbench.programme store
            getAll:    () => this._entries,
            getByType: (t: string) => this._entries.find(e => e.occupancyType === t),
        };

        this._build();
        this._bindEvents();
    }

    // ── Public API ───────────────────────────────────────────────────────────

    /** Refresh live comparison data (called by DataWorkbench on project load). */
    refresh(): void {
        this._renderTable();
    }

    // ── DOM ──────────────────────────────────────────────────────────────────

    private _build(): void {
        this._root.innerHTML = '';

        // ── Toolbar ─────────────────────────────────────────────────────────
        const toolbar = document.createElement('div');
        toolbar.className = 'dw-toolbar';

        const addBtn = document.createElement('button');
        addBtn.className = 'dw-toolbar-btn dw-toolbar-btn--primary';
        addBtn.textContent = '+ Add Room Type';
        addBtn.addEventListener('click', () => this._addEntry());

        const importBtn = document.createElement('button');
        importBtn.className = 'dw-toolbar-btn';
        importBtn.textContent = '↑ Import CSV';
        importBtn.title = 'Import programme from CSV (columns: occupancyType, label, requiredQty, targetAreaM2)';
        importBtn.addEventListener('click', () => this._importCSV());

        const exportBtn = document.createElement('button');
        exportBtn.className = 'dw-toolbar-btn';
        exportBtn.textContent = '↓ Export CSV';
        exportBtn.style.marginLeft = 'auto';
        exportBtn.addEventListener('click', () => this._exportCSV());

        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'dw-toolbar-btn';
        refreshBtn.title = 'Refresh live data';
        refreshBtn.textContent = '↺ Refresh';
        refreshBtn.addEventListener('click', () => this._renderTable());

        toolbar.appendChild(addBtn);
        toolbar.appendChild(importBtn);
        toolbar.appendChild(exportBtn);
        toolbar.appendChild(refreshBtn);
        this._root.appendChild(toolbar);

        // ── Table area ───────────────────────────────────────────────────────
        const scroll = document.createElement('div');
        scroll.style.cssText = 'flex:1;overflow-y:auto;';

        this._tableEl = document.createElement('div');
        scroll.appendChild(this._tableEl);
        this._root.appendChild(scroll);

        // ── Total bar ────────────────────────────────────────────────────────
        this._totalEl = document.createElement('div');
        this._totalEl.style.cssText = `
            padding:8px 12px;
            border-top:2px solid var(--app-border,#e5e7eb);
            background:var(--app-surface-2,#f8fafc);
            font-size:11px;font-weight:700;
            display:flex;gap:24px;
            color:var(--app-text,#1e293b);
        `;
        this._root.appendChild(this._totalEl);

        this._renderTable();
    }

    // ── Table render ─────────────────────────────────────────────────────────

    private _renderTable(): void {
        const roomStore = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
        this._tableEl.innerHTML = '';
        this._totalEl.innerHTML = '';

        if (this._entries.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'dw-placeholder';
            empty.innerHTML = `
                <div class="dw-placeholder-icon">📑</div>
                <div style="font-weight:700;font-size:13px;color:var(--app-text)">No programme entries</div>
                <div style="font-size:12px;color:var(--app-text-muted,#7a8aaa);max-width:220px;text-align:center;line-height:1.5">
                    Click "+ Add Room Type" to define your room brief,<br>or import from CSV.
                </div>
            `;
            this._tableEl.appendChild(empty);
            return;
        }

        const table = document.createElement('table');
        table.style.cssText = 'width:100%;border-collapse:collapse;font-size:11px;';

        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr style="background:var(--app-surface-2,#f8fafc);border-bottom:2px solid var(--app-border,#e5e7eb);">
                <th style="padding:6px 8px;text-align:left;color:var(--app-text-muted,#7a8aaa);font-weight:600;">Room Type</th>
                <th style="padding:6px 8px;text-align:center;color:var(--app-text-muted,#7a8aaa);font-weight:600;">Req. Qty</th>
                <th style="padding:6px 8px;text-align:right;color:var(--app-text-muted,#7a8aaa);font-weight:600;">Target m²</th>
                <th style="padding:6px 8px;text-align:center;color:var(--app-text-muted,#7a8aaa);font-weight:600;">Designed</th>
                <th style="padding:6px 8px;text-align:right;color:var(--app-text-muted,#7a8aaa);font-weight:600;">Avg m²</th>
                <th style="padding:6px 8px;text-align:center;color:var(--app-text-muted,#7a8aaa);font-weight:600;">Δ</th>
                <th style="padding:6px 8px;text-align:center;color:var(--app-text-muted,#7a8aaa);font-weight:600;width:32px;"></th>
            </tr>
        `;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        let totalRequired = 0;
        let totalDesigned = 0;
        let totalTargetGIA = 0;
        let totalActualGIA = 0;

        for (const entry of this._entries) {
            const rooms: any[] = roomStore
                ? (roomStore.getAll?.() ?? []).filter((r: any) => r.occupancyType === entry.occupancyType)
                : [];
            const designedQty  = rooms.length;
            const avgArea      = designedQty > 0
                ? rooms.reduce((s: number, r: any) => s + (r.computed?.area ?? 0), 0) / designedQty
                : 0;
            const areaDev      = entry.targetAreaM2 > 0
                ? ((avgArea - entry.targetAreaM2) / entry.targetAreaM2) * 100
                : 0;
            const qtyDelta     = designedQty - entry.requiredQty;

            totalRequired  += entry.requiredQty;
            totalDesigned  += designedQty;
            totalTargetGIA += entry.requiredQty * entry.targetAreaM2;
            totalActualGIA += rooms.reduce((s: number, r: any) => s + (r.computed?.area ?? 0), 0);

            const tr = document.createElement('tr');
            tr.style.cssText = 'border-bottom:1px solid var(--app-border,#e5e7eb);';

            let deltaText = '—';
            let deltaColour = '#6b7280';
            if (designedQty > 0 || entry.requiredQty > 0) {
                const qtyStr  = `${qtyDelta >= 0 ? '+' : ''}${qtyDelta} rooms`;
                const areaStr = entry.targetAreaM2 > 0
                    ? `${areaDev >= 0 ? '+' : ''}${areaDev.toFixed(1)}%`
                    : '';
                deltaText   = areaStr ? `${qtyStr}, ${areaStr}` : qtyStr;
                deltaColour = devClass(Math.max(Math.abs(qtyDelta) / Math.max(1, entry.requiredQty) * 100, Math.abs(areaDev)));
            }

            // Remove button cell
            const rmBtn = document.createElement('button');
            rmBtn.textContent = '✕';
            rmBtn.title = 'Remove entry';
            rmBtn.style.cssText = 'font-size:10px;padding:1px 5px;border:1px solid var(--app-border,#e5e7eb);border-radius:3px;background:transparent;color:var(--app-text-muted,#7a8aaa);cursor:pointer;';
            const entryId = entry.id;
            rmBtn.addEventListener('click', () => {
                this._entries = this._entries.filter(e => e.id !== entryId);
                this._renderTable();
            });

            tr.innerHTML = `
                <td style="padding:7px 8px;color:var(--app-text,#1e293b);font-weight:600;">${entry.label || entry.occupancyType.replace(/-/g, ' ')}</td>
                <td style="padding:7px 8px;text-align:center;color:var(--app-text,#1e293b);">${entry.requiredQty}</td>
                <td style="padding:7px 8px;text-align:right;color:var(--app-text,#1e293b);">${entry.targetAreaM2.toFixed(1)}</td>
                <td style="padding:7px 8px;text-align:center;color:var(--app-text,#1e293b);">${designedQty}</td>
                <td style="padding:7px 8px;text-align:right;color:var(--app-text,#1e293b);">${designedQty > 0 ? avgArea.toFixed(1) : '—'}</td>
                <td style="padding:7px 8px;text-align:center;color:${deltaColour};font-weight:600;">${deltaText}</td>
                <td style="padding:4px 8px;text-align:center;"></td>
            `;
            tr.lastElementChild!.appendChild(rmBtn);
            tbody.appendChild(tr);
        }

        table.appendChild(tbody);
        this._tableEl.appendChild(table);

        // ── Totals row ───────────────────────────────────────────────────────
        const giaDevPct = totalTargetGIA > 0
            ? ((totalActualGIA - totalTargetGIA) / totalTargetGIA) * 100
            : 0;
        const giaColour = devClass(Math.abs(giaDevPct));

        this._totalEl.innerHTML = `
            <span>Total rooms: <b>${totalRequired}</b> req. / <b>${totalDesigned}</b> designed</span>
            <span>Target GIA: <b>${totalTargetGIA.toFixed(0)} m²</b></span>
            <span>Actual GIA: <b>${totalActualGIA.toFixed(0)} m²</b></span>
            <span style="color:${giaColour};">Δ GIA: <b>${giaDevPct >= 0 ? '+' : ''}${giaDevPct.toFixed(1)}%</b></span>
        `;
    }

    // ── Add entry modal ──────────────────────────────────────────────────────

    private _addEntry(): void {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:fixed;inset:0;background:rgba(0,0,0,0.4);
            display:flex;align-items:center;justify-content:center;z-index:9999;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background:var(--app-surface,#fff);border-radius:10px;
            padding:20px 24px;min-width:320px;
            box-shadow:0 20px 40px rgba(0,0,0,0.2);
            font-size:12px;color:var(--app-text,#1e293b);
        `;

        const OCCUPANCY_TYPES = [
            'bedroom','living-room','kitchen','bathroom','dining-room','utility-room',
            'open-office','private-office','meeting-room','corridor','lift-lobby',
            'entrance-lobby','stairwell','foyer','patient-room','operating-theatre',
            'waiting-room','consultation-room','classroom','laboratory','lecture-hall',
            'library','hotel-bedroom','restaurant','wc','accessible-wc','storage-residential',
        ];

        dialog.innerHTML = `
            <div style="font-weight:700;font-size:14px;margin-bottom:16px;">Add Programme Entry</div>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <label style="display:flex;flex-direction:column;gap:4px;">
                    <span style="font-size:10px;font-weight:600;color:#7a8aaa;text-transform:uppercase;">Occupancy Type</span>
                    <select id="_pm-occ" style="font-size:12px;padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;"></select>
                </label>
                <label style="display:flex;flex-direction:column;gap:4px;">
                    <span style="font-size:10px;font-weight:600;color:#7a8aaa;text-transform:uppercase;">Display Label (optional)</span>
                    <input id="_pm-lbl" type="text" placeholder="e.g. Patient Room" style="font-size:12px;padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;outline:none;" />
                </label>
                <label style="display:flex;flex-direction:column;gap:4px;">
                    <span style="font-size:10px;font-weight:600;color:#7a8aaa;text-transform:uppercase;">Required Quantity</span>
                    <input id="_pm-qty" type="number" min="1" value="1" style="font-size:12px;padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;outline:none;" />
                </label>
                <label style="display:flex;flex-direction:column;gap:4px;">
                    <span style="font-size:10px;font-weight:600;color:#7a8aaa;text-transform:uppercase;">Target Area (m²)</span>
                    <input id="_pm-area" type="number" min="0" step="0.5" value="12" style="font-size:12px;padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;outline:none;" />
                </label>
            </div>
            <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">
                <button id="_pm-cancel" style="padding:6px 14px;border:1px solid #e5e7eb;border-radius:6px;background:transparent;cursor:pointer;font-size:12px;">Cancel</button>
                <button id="_pm-ok" style="padding:6px 14px;border:none;border-radius:6px;background:#7c3aed;color:#fff;cursor:pointer;font-size:12px;font-weight:600;">Add Entry</button>
            </div>
        `;

        // Populate occupancy select
        const occSel = dialog.querySelector('#_pm-occ') as HTMLSelectElement;
        OCCUPANCY_TYPES.forEach(t => {
            const o = document.createElement('option');
            o.value = t;
            o.textContent = t.replace(/-/g, ' ');
            occSel.appendChild(o);
        });

        dialog.querySelector('#_pm-cancel')!.addEventListener('click', () => overlay.remove());
        dialog.querySelector('#_pm-ok')!.addEventListener('click', () => {
            const qty  = parseInt((dialog.querySelector('#_pm-qty') as HTMLInputElement).value) || 1;
            const area = parseFloat((dialog.querySelector('#_pm-area') as HTMLInputElement).value) || 0;
            const lbl  = (dialog.querySelector('#_pm-lbl') as HTMLInputElement).value.trim();
            this._entries.push({
                id:            uid(),
                occupancyType: occSel.value,
                label:         lbl,
                requiredQty:   qty,
                targetAreaM2:  area,
            });
            overlay.remove();
            this._renderTable();
        });

        overlay.appendChild(dialog);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

    // ── CSV Import / Export ──────────────────────────────────────────────────

    private _exportCSV(): void {
        const roomStore = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
        const rows = [['Room Type', 'Label', 'Required Qty', 'Target Area m²', 'Designed Qty', 'Avg Area m²', 'Delta']];

        for (const entry of this._entries) {
            const rooms: any[] = roomStore
                ? (roomStore.getAll?.() ?? []).filter((r: any) => r.occupancyType === entry.occupancyType)
                : [];
            const designedQty = rooms.length;
            const avgArea = designedQty > 0
                ? (rooms.reduce((s: number, r: any) => s + (r.computed?.area ?? 0), 0) / designedQty).toFixed(2)
                : '—';
            const areaDev = entry.targetAreaM2 > 0 && designedQty > 0
                ? (((parseFloat(avgArea) - entry.targetAreaM2) / entry.targetAreaM2) * 100).toFixed(1) + '%'
                : '—';
            rows.push([
                entry.occupancyType,
                entry.label,
                String(entry.requiredQty),
                String(entry.targetAreaM2),
                String(designedQty),
                avgArea,
                areaDev,
            ]);
        }

        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'programme.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    private _importCSV(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const text = reader.result as string;
                const lines = text.split(/\r?\n/).filter(l => l.trim());
                if (lines.length < 2) return;
                // Skip header row (index 0)
                for (let i = 1; i < lines.length; i++) {
                    const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
                    const [occupancyType, label, reqQty, targetArea] = cols;
                    if (!occupancyType) continue;
                    this._entries.push({
                        id:            uid(),
                        occupancyType: occupancyType,
                        label:         label ?? '',
                        requiredQty:   parseInt(reqQty) || 1,
                        targetAreaM2:  parseFloat(targetArea) || 0,
                    });
                }
                this._renderTable();
            };
            reader.readAsText(file);
        });
        input.click();
    }

    // ── Events ───────────────────────────────────────────────────────────────

    private _bindEvents(): void {
        window.runtime?.events?.on('pryzm-sync-state-changed', () => this._renderTable()); // F.events.15
        window.addEventListener('pryzm-room-sync-state-changed', () => this._renderTable());
        window.runtime?.events?.on('pryzm-project-loaded', () => this._renderTable()); // F.events.9
    }
}
