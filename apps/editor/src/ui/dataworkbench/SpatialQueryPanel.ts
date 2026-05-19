/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Data Workbench: Spatial Query Panel (Phase C-4 + Phase 5.2)
 * File:             src/ui/dataworkbench/SpatialQueryPanel.ts
 * Contract:         docs/PRYZM_MASTER_ROADMAP_2026.md § PHASE C-4
 *                   docs/00_PRZYM/00_DATA_BASE_ CONTRACT/PRYZM_BIM_DATABASE_VISION_2_0.md § Phase 5.2
 *
 * Multi-criteria room query builder.
 *
 * Features:
 *   - Rule builder: field / operator / value rows joined by AND / OR
 *   - Supported fields: name, occupancyType, department, area, level, unit, syncState, templateId
 *   - Supported operators: = ≠ < > ≤ ≥ contains starts-with is-empty
 *   - [Run Query] highlights results via 'pryzm-select-multiple' event
 *   - [Clear] resets builder
 *   - Results table with row-click → 'pryzm-workbench-select'
 *   - [Phase 5.2] 5 built-in industry presets + [Save preset] → localStorage
 *   - [Phase 5.2] User-saved presets loaded from localStorage on init
 *
 * CSS prefix: dw-
 * localStorage key: pryzm_query_presets
 */

// ── Types ─────────────────────────────────────────────────────────────────────

type QueryField = 'name' | 'occupancyType' | 'department' | 'area' | 'level' | 'unit' | 'syncState' | 'templateId';
type QueryOp = '=' | '≠' | '<' | '>' | '≤' | '≥' | 'contains' | 'starts-with' | 'is-empty';
type JoinOp = 'AND' | 'OR';

interface Criterion {
    field: QueryField;
    op:    QueryOp;
    value: string;
    join:  JoinOp;
}

interface QueryPreset {
    id:       string;
    name:     string;
    builtin:  boolean;
    criteria: Criterion[];
}

const FIELD_LABELS: Record<QueryField, string> = {
    name:         'Name',
    occupancyType:'Occupancy Type',
    department:   'Department',
    area:         'Area (m²)',
    level:        'Level',
    unit:         'Unit',
    syncState:    'Sync State',
    templateId:   'Template',
};

const NUMERIC_FIELDS = new Set<QueryField>(['area']);

const NUMERIC_OPS: QueryOp[] = ['=', '≠', '<', '>', '≤', '≥'];
const TEXT_OPS:    QueryOp[] = ['=', '≠', 'contains', 'starts-with', 'is-empty'];

// ── Built-in industry presets (Phase 5.2) ────────────────────────────────────

const BUILTIN_PRESETS: QueryPreset[] = [
    {
        id: 'builtin-healthcare-patient-below-min',
        name: 'Healthcare: patient rooms below minimum area',
        builtin: true,
        criteria: [
            { field: 'occupancyType', op: 'contains', value: 'patient', join: 'AND' },
            { field: 'area', op: '<', value: '9.6', join: 'AND' },
        ],
    },
    {
        id: 'builtin-resi-bedrooms-no-unit',
        name: 'Residential: bedrooms without assigned unit',
        builtin: true,
        criteria: [
            { field: 'occupancyType', op: 'contains', value: 'bed', join: 'AND' },
            { field: 'unit', op: 'is-empty', value: '', join: 'AND' },
        ],
    },
    {
        id: 'builtin-all-rooms-no-unit',
        name: 'All: rooms assigned to no unit',
        builtin: true,
        criteria: [
            { field: 'unit', op: 'is-empty', value: '', join: 'AND' },
        ],
    },
    {
        id: 'builtin-all-not-matching-template',
        name: 'All: rooms not matching template (conflict or partial)',
        builtin: true,
        criteria: [
            { field: 'syncState', op: '=', value: 'conflict', join: 'AND' },
            { field: 'syncState', op: '=', value: 'partial',  join: 'OR' },
        ],
    },
    {
        id: 'builtin-office-meeting-over-density',
        name: 'Office: meeting rooms above maximum occupancy density',
        builtin: true,
        criteria: [
            { field: 'occupancyType', op: 'contains', value: 'meeting', join: 'AND' },
            { field: 'area', op: '>', value: '30', join: 'AND' },
        ],
    },
];

const LS_KEY = 'pryzm_query_presets';

// ── Panel ─────────────────────────────────────────────────────────────────────

export class SpatialQueryPanel {
    private _container: HTMLElement;
    private _root!: HTMLElement;
    private _criteria: Criterion[] = [];
    private _results:  any[] = [];

    private _criteriaEl!: HTMLElement;
    private _resultsEl!:  HTMLElement;
    private _statusEl!:   HTMLElement;
    private _presetSel!:  HTMLSelectElement;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._container = container;
        this._root = document.createElement('div');
        this._root.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';
        this._container.appendChild(this._root);
        this._build();
    }

    // ── Public API ───────────────────────────────────────────────────────────

    /** Clear query results when a new project loads. */
    refresh(): void {
        this._results = [];
        this._resultsEl.innerHTML = '';
        this._statusEl.textContent = 'Add conditions above and click Run Query.';
    }

    // ── Preset persistence ───────────────────────────────────────────────────

    private _loadSavedPresets(): QueryPreset[] {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return [];
            return JSON.parse(raw) as QueryPreset[];
        } catch {
            return [];
        }
    }

    private _saveSavedPresets(presets: QueryPreset[]): void {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(presets));
        } catch { /* quota exceeded — silently ignore */ }
    }

    private _allPresets(): QueryPreset[] {
        return [...BUILTIN_PRESETS, ...this._loadSavedPresets()];
    }

    private _rebuildPresetOptions(): void {
        this._presetSel.innerHTML = '';

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '— Load a preset —';
        placeholder.disabled = true;
        placeholder.selected = true;
        this._presetSel.appendChild(placeholder);

        const builtinGroup = document.createElement('optgroup');
        builtinGroup.label = 'Industry Presets';
        BUILTIN_PRESETS.forEach(p => {
            const o = document.createElement('option');
            o.value = p.id;
            o.textContent = p.name;
            builtinGroup.appendChild(o);
        });
        this._presetSel.appendChild(builtinGroup);

        const saved = this._loadSavedPresets();
        if (saved.length > 0) {
            const savedGroup = document.createElement('optgroup');
            savedGroup.label = 'My Saved Presets';
            saved.forEach(p => {
                const o = document.createElement('option');
                o.value = p.id;
                o.textContent = p.name;
                savedGroup.appendChild(o);
            });
            this._presetSel.appendChild(savedGroup);
        }
    }

    private _applyPreset(presetId: string): void {
        const preset = this._allPresets().find(p => p.id === presetId);
        if (!preset) return;

        this._criteria = [];
        this._criteriaEl.innerHTML = '';

        for (const c of preset.criteria) {
            this._addCriterion(c.join, c);
        }

        // Reset selector to placeholder after loading
        this._presetSel.value = '';
    }

    private _saveCurrentAsPreset(): void {
        if (this._criteria.length === 0) {
            alert('Add at least one condition before saving a preset.');
            return;
        }

        const name = window.prompt('Name for this preset:');
        if (!name || !name.trim()) return;

        const saved = this._loadSavedPresets();
        const newPreset: QueryPreset = {
            id:       `user-${Date.now()}`,
            name:     name.trim(),
            builtin:  false,
            criteria: this._criteria.map(c => ({ ...c })),
        };
        saved.push(newPreset);
        this._saveSavedPresets(saved);
        this._rebuildPresetOptions();
    }

    // ── DOM ──────────────────────────────────────────────────────────────────

    private _build(): void {
        this._root.innerHTML = '';

        // ── Preset bar (Phase 5.2) ───────────────────────────────────────────
        const presetBar = document.createElement('div');
        presetBar.style.cssText = `
            display:flex;align-items:center;gap:6px;
            padding:8px 12px;
            border-bottom:1px solid var(--app-border,#e5e7eb);
            background:var(--app-surface,#fff);
            flex-shrink:0;
        `;

        const presetLabel = document.createElement('span');
        presetLabel.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:.06em;color:var(--app-text-muted,#7a8aaa);text-transform:uppercase;white-space:nowrap;';
        presetLabel.textContent = 'Presets';
        presetBar.appendChild(presetLabel);

        this._presetSel = document.createElement('select');
        this._presetSel.style.cssText = `
            flex:1;font-size:11px;padding:4px 6px;
            border:1px solid var(--app-border,#e5e7eb);border-radius:4px;
            background:var(--app-surface,#fff);color:var(--app-text,#1e293b);
            cursor:pointer;
        `;
        this._rebuildPresetOptions();
        this._presetSel.addEventListener('change', () => {
            if (this._presetSel.value) {
                this._applyPreset(this._presetSel.value);
            }
        });
        presetBar.appendChild(this._presetSel);

        const savePresetBtn = document.createElement('button');
        savePresetBtn.className = 'dw-toolbar-btn';
        savePresetBtn.style.cssText = 'font-size:11px;white-space:nowrap;flex-shrink:0;padding:4px 8px;';
        savePresetBtn.title = 'Save current query as a named preset';
        savePresetBtn.textContent = '＋ Save';
        savePresetBtn.addEventListener('click', () => this._saveCurrentAsPreset());
        presetBar.appendChild(savePresetBtn);

        this._root.appendChild(presetBar);

        // ── Header toolbar ──────────────────────────────────────────────────
        const toolbar = document.createElement('div');
        toolbar.className = 'dw-toolbar';

        const runBtn = document.createElement('button');
        runBtn.className = 'dw-toolbar-btn dw-toolbar-btn--primary';
        runBtn.textContent = '▶ Run Query';
        runBtn.addEventListener('click', () => this._runQuery());

        const clearBtn = document.createElement('button');
        clearBtn.className = 'dw-toolbar-btn';
        clearBtn.textContent = '✕ Clear';
        clearBtn.addEventListener('click', () => this._clear());

        const highlightBtn = document.createElement('button');
        highlightBtn.className = 'dw-toolbar-btn';
        highlightBtn.title = 'Highlight all results in viewport';
        highlightBtn.textContent = '🔆 Highlight All';
        highlightBtn.style.marginLeft = 'auto';
        highlightBtn.addEventListener('click', () => this._highlightAll());

        toolbar.appendChild(runBtn);
        toolbar.appendChild(clearBtn);
        toolbar.appendChild(highlightBtn);
        this._root.appendChild(toolbar);

        // ── Criteria builder ────────────────────────────────────────────────
        const builderWrap = document.createElement('div');
        builderWrap.style.cssText = `
            padding:10px 12px;
            border-bottom:1px solid var(--app-border,#e5e7eb);
            background:var(--app-surface-2,#f8fafc);
        `;

        const hdr = document.createElement('div');
        hdr.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:.06em;color:var(--app-text-muted,#7a8aaa);text-transform:uppercase;margin-bottom:8px;';
        hdr.textContent = 'Query Builder';
        builderWrap.appendChild(hdr);

        this._criteriaEl = document.createElement('div');
        this._criteriaEl.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
        builderWrap.appendChild(this._criteriaEl);

        const addBtn = document.createElement('button');
        addBtn.className = 'dw-toolbar-btn';
        addBtn.style.cssText = 'margin-top:8px;font-size:11px;';
        addBtn.textContent = '+ Add Condition';
        addBtn.addEventListener('click', () => this._addCriterion());
        builderWrap.appendChild(addBtn);

        this._root.appendChild(builderWrap);

        // ── Status bar ──────────────────────────────────────────────────────
        this._statusEl = document.createElement('div');
        this._statusEl.style.cssText = `
            padding:6px 12px;font-size:11px;
            background:var(--app-surface-2,#f8fafc);
            border-bottom:1px solid var(--app-border,#e5e7eb);
            color:var(--app-text-muted,#7a8aaa);
        `;
        this._statusEl.textContent = 'Add conditions above and click Run Query.';
        this._root.appendChild(this._statusEl);

        // ── Results ─────────────────────────────────────────────────────────
        const scroll = document.createElement('div');
        scroll.style.cssText = 'flex:1;overflow-y:auto;';
        this._resultsEl = document.createElement('div');
        this._resultsEl.style.cssText = 'height:100%;';
        scroll.appendChild(this._resultsEl);
        this._root.appendChild(scroll);

        // Seed one empty criterion
        this._addCriterion();
    }

    // ── Criterion row ────────────────────────────────────────────────────────

    private _addCriterion(join: JoinOp = 'AND', preset?: Criterion): void {
        const criterion: Criterion = {
            field: preset?.field ?? 'occupancyType',
            op:    preset?.op    ?? '=',
            value: preset?.value ?? '',
            join:  preset?.join  ?? join,
        };
        this._criteria.push(criterion);
        const index = this._criteria.length - 1;

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;';

        // Join selector (hidden for first row)
        const joinSel = document.createElement('select');
        joinSel.style.cssText = 'font-size:11px;padding:3px 4px;border:1px solid var(--app-border,#e5e7eb);border-radius:4px;background:var(--app-surface,#fff);color:var(--app-text,#1e293b);width:52px;';
        if (index === 0) {
            joinSel.style.visibility = 'hidden';
        }
        ['AND', 'OR'].forEach(j => {
            const o = document.createElement('option');
            o.value = j; o.textContent = j;
            joinSel.appendChild(o);
        });
        joinSel.value = criterion.join;
        joinSel.addEventListener('change', () => { criterion.join = joinSel.value as JoinOp; });
        row.appendChild(joinSel);

        // Field selector
        const fieldSel = document.createElement('select');
        fieldSel.style.cssText = 'font-size:11px;padding:3px 4px;border:1px solid var(--app-border,#e5e7eb);border-radius:4px;background:var(--app-surface,#fff);color:var(--app-text,#1e293b);flex:1;';
        (Object.keys(FIELD_LABELS) as QueryField[]).forEach(f => {
            const o = document.createElement('option');
            o.value = f; o.textContent = FIELD_LABELS[f];
            fieldSel.appendChild(o);
        });
        fieldSel.value = criterion.field;
        row.appendChild(fieldSel);

        // Op selector
        const opSel = document.createElement('select');
        opSel.style.cssText = 'font-size:11px;padding:3px 4px;border:1px solid var(--app-border,#e5e7eb);border-radius:4px;background:var(--app-surface,#fff);color:var(--app-text,#1e293b);width:92px;';
        const refreshOps = () => {
            const isNum = NUMERIC_FIELDS.has(criterion.field);
            const allowed = isNum ? NUMERIC_OPS : TEXT_OPS;
            opSel.innerHTML = '';
            allowed.forEach(op => {
                const o = document.createElement('option');
                o.value = op; o.textContent = op;
                opSel.appendChild(o);
            });
            if (!allowed.includes(criterion.op)) {
                criterion.op = allowed[0];
            }
            opSel.value = criterion.op;
        };
        refreshOps();
        row.appendChild(opSel);

        // Value input
        const valInput = document.createElement('input');
        valInput.type = 'text';
        valInput.placeholder = 'value…';
        valInput.style.cssText = 'font-size:11px;padding:3px 6px;border:1px solid var(--app-border,#e5e7eb);border-radius:4px;background:var(--app-surface,#fff);color:var(--app-text,#1e293b);flex:1;outline:none;';
        valInput.value = criterion.value;
        row.appendChild(valInput);

        // Remove button
        const rmBtn = document.createElement('button');
        rmBtn.textContent = '✕';
        rmBtn.title = 'Remove condition';
        rmBtn.style.cssText = 'font-size:11px;padding:2px 6px;border:1px solid var(--app-border,#e5e7eb);border-radius:4px;background:transparent;color:var(--app-text-muted,#7a8aaa);cursor:pointer;';
        rmBtn.addEventListener('click', () => {
            const i = this._criteria.indexOf(criterion);
            if (i >= 0) this._criteria.splice(i, 1);
            row.remove();
            // Make first row's join hidden
            const firstJoin = this._criteriaEl.querySelector('select') as HTMLSelectElement | null;
            if (firstJoin) firstJoin.style.visibility = 'hidden';
        });
        row.appendChild(rmBtn);

        // Wire up events
        fieldSel.addEventListener('change', () => {
            criterion.field = fieldSel.value as QueryField;
            refreshOps();
        });
        opSel.addEventListener('change', () => { criterion.op = opSel.value as QueryOp; });
        valInput.addEventListener('input', () => { criterion.value = valInput.value; });

        this._criteriaEl.appendChild(row);
    }

    // ── Query execution ──────────────────────────────────────────────────────

    private _runQuery(): void {
        const roomStore = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
        const bimManager = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
        const hierarchyStore = window.hierarchyStore; // TODO(F.6.x): legacy hierarchyStore — replace with runtime.dataWorkbench.hierarchy store
        if (!roomStore) {
            this._statusEl.textContent = 'Room store not available.';
            return;
        }

        const allRooms: any[] = roomStore.getAll();
        if (this._criteria.length === 0) {
            this._results = [...allRooms];
        } else {
            this._results = allRooms.filter(room => this._evalRoom(room, bimManager, hierarchyStore));
        }

        this._statusEl.textContent = `${this._results.length} room${this._results.length !== 1 ? 's' : ''} matched.`;
        this._renderResults(bimManager, hierarchyStore);
    }

    private _evalRoom(room: any, bimManager: any, hierarchyStore: any): boolean {
        let result = true;
        for (let i = 0; i < this._criteria.length; i++) {
            const c = this._criteria[i];
            const matches = this._testCriterion(room, c, bimManager, hierarchyStore);
            if (i === 0) {
                result = matches;
            } else if (c.join === 'AND') {
                result = result && matches;
            } else {
                result = result || matches;
            }
        }
        return result;
    }

    private _testCriterion(room: any, c: Criterion, bimManager: any, hierarchyStore: any): boolean {
        const rawValue = this._getRoomFieldValue(room, c.field, bimManager, hierarchyStore);
        const val = String(rawValue ?? '').toLowerCase();
        const target = c.value.toLowerCase().trim();

        if (c.op === 'is-empty') return val === '' || val === '—';

        const num = parseFloat(val);
        const targetNum = parseFloat(c.value);

        switch (c.op) {
            case '=':           return NUMERIC_FIELDS.has(c.field) ? num === targetNum : val === target;
            case '≠':           return NUMERIC_FIELDS.has(c.field) ? num !== targetNum : val !== target;
            case '<':           return num < targetNum;
            case '>':           return num > targetNum;
            case '≤':           return num <= targetNum;
            case '≥':           return num >= targetNum;
            case 'contains':    return val.includes(target);
            case 'starts-with': return val.startsWith(target);
            default:            return false;
        }
    }

    private _getRoomFieldValue(room: any, field: QueryField, bimManager: any, hierarchyStore: any): string | number {
        switch (field) {
            case 'name':         return room.name ?? '';
            case 'occupancyType':return room.occupancyType ?? '';
            case 'department':   return room.department ?? '';
            case 'area':         return room.computed?.area ?? 0;
            case 'level':        return bimManager?.getLevelById?.(room.levelId)?.name ?? room.levelId ?? '';
            case 'unit':         return hierarchyStore?.getById?.(room.unitId)?.name ?? '';
            case 'syncState':    return room.syncState ?? '';
            case 'templateId':   return room.templateId ?? '';
            default:             return '';
        }
    }

    // ── Results render ───────────────────────────────────────────────────────

    private _renderResults(bimManager: any, _hierarchyStore: any): void {
        this._resultsEl.innerHTML = '';

        if (this._results.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'dw-placeholder';
            empty.innerHTML = `
                <div class="dw-placeholder-icon">🔍</div>
                <div style="font-weight:700;font-size:13px;color:var(--app-text)">No results</div>
                <div style="font-size:12px;color:var(--app-text-muted,#7a8aaa)">Try different criteria.</div>
            `;
            this._resultsEl.appendChild(empty);
            return;
        }

        const table = document.createElement('table');
        table.style.cssText = 'width:100%;border-collapse:collapse;font-size:11px;';

        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr style="background:var(--app-surface-2,#f8fafc);border-bottom:2px solid var(--app-border,#e5e7eb);">
                <th style="padding:6px 8px;text-align:left;color:var(--app-text-muted,#7a8aaa);font-weight:600;">Name</th>
                <th style="padding:6px 8px;text-align:left;color:var(--app-text-muted,#7a8aaa);font-weight:600;">Occupancy</th>
                <th style="padding:6px 8px;text-align:left;color:var(--app-text-muted,#7a8aaa);font-weight:600;">Level</th>
                <th style="padding:6px 8px;text-align:right;color:var(--app-text-muted,#7a8aaa);font-weight:600;">Area (m²)</th>
                <th style="padding:6px 8px;text-align:center;color:var(--app-text-muted,#7a8aaa);font-weight:600;width:54px;"></th>
            </tr>
        `;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        for (const room of this._results) {
            const levelName = bimManager?.getLevelById?.(room.levelId)?.name ?? '—';
            const area = (room.computed?.area ?? 0).toFixed(2);

            const tr = document.createElement('tr');
            tr.style.cssText = 'border-bottom:1px solid var(--app-border,#e5e7eb);cursor:pointer;transition:background 0.1s;';
            tr.addEventListener('mouseenter', () => { tr.style.background = 'var(--app-surface-hover,rgba(102,0,255,0.04))'; });
            tr.addEventListener('mouseleave', () => { tr.style.background = ''; });
            // F.events.7 — pryzm-workbench-select migrated to runtime.events typed bus.
            tr.addEventListener('click', () => {
                window.runtime?.events?.emit('pryzm-workbench-select', { nodeId: room.id, nodeType: 'room' });
            });

            const selectBtn = document.createElement('button');
            selectBtn.textContent = '→';
            selectBtn.title = 'Select in viewport';
            selectBtn.style.cssText = 'font-size:10px;padding:2px 6px;border:1px solid var(--app-border,#e5e7eb);border-radius:3px;background:transparent;color:var(--dw-purple,#7c3aed);cursor:pointer;';
            selectBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.runtime?.events?.emit('pryzm-workbench-select', { nodeId: room.id, nodeType: 'room' });
            });

            tr.innerHTML = `
                <td style="padding:7px 8px;color:var(--app-text,#1e293b);font-weight:600;">${room.name || '—'}</td>
                <td style="padding:7px 8px;color:var(--app-text-muted,#7a8aaa);">${(room.occupancyType ?? '—').replace(/-/g, ' ')}</td>
                <td style="padding:7px 8px;color:var(--app-text-muted,#7a8aaa);">${levelName}</td>
                <td style="padding:7px 8px;text-align:right;color:var(--app-text,#1e293b);">${area}</td>
                <td style="padding:4px 8px;text-align:center;"></td>
            `;
            tr.lastElementChild!.appendChild(selectBtn);
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        this._resultsEl.appendChild(table);
    }

    // ── Actions ──────────────────────────────────────────────────────────────

    private _highlightAll(): void {
        if (this._results.length === 0) return;
        window.runtime?.events?.emit('pryzm-select-multiple', { ids: this._results.map(r => r.id), elementType: 'room' }); // F.events.16
    }

    private _clear(): void {
        this._criteria = [];
        this._results = [];
        this._criteriaEl.innerHTML = '';
        this._resultsEl.innerHTML = '';
        this._statusEl.textContent = 'Add conditions above and click Run Query.';
        this._addCriterion();
    }
}
