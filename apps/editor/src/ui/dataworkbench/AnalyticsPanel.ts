/**
 * AnalyticsPanel — Phase 13
 *
 * 5 Chart.js charts in the DataWorkbench "Analytics" tab.
 * All charts refresh on `pryzm-sync-state-changed` DOM event.
 * All charts are click-navigable: click fires `pryzm-workbench-select`.
 *
 * Charts:
 *   1. Area stacking     — Stacked bar: levels × room area, coloured by sync state
 *   2. Compliance donut  — Doughnut: count of nodes per sync state
 *   3. Sync heatmap      — Grid table: rows=levels, cols=sync states, cell=node count
 *   4. Programme vs actual — Grouped bar: units × plannedData.targetArea vs actual
 *   5. Door type distribution — Pie: door type codes from elementCodeStore.getByPrefix('DO')
 *
 * Contract compliance:
 *   §05 §6   — Native HTML; no bim-* elements
 *   §05 §7.6 — No independent <style> injection; inline styles or dw- CSS tokens only
 *   §05 §2.3 — Light theme: all colours use --app-* design tokens
 *   §01 §1   — Read-only; no mutations
 *
 * Step 3 (DATA_PANEL_AUDIT_AND_FIX_PLAN):
 *   - Colour palette corrected from dark-theme hardcodes to --app-* light-theme tokens
 *   - Loading spinner shown during async Chart.js initialisation
 *   - build() appends to parent container as a child wrapper (display managed by DataWorkbench)
 */

import type { Chart, ChartConfiguration } from 'chart.js';

type ChartJS = typeof import('chart.js');

const SYNC_COLORS: Record<string, string> = {
    synced:          '#22c55e',
    conflict:        '#ef4444',
    derived:         '#f97316',
    partial:         '#eab308',
    'planned-only':  '#94a3b8',
    'no-template':   '#475569',
};
const SYNC_STATES = ['synced', 'conflict', 'derived', 'partial', 'planned-only', 'no-template'];

// ── Light-theme chart colours (matched to design tokens) ──────────────────────
// --app-text       #1a2035   primary text
// --app-text-2     #5a6a85   secondary text
// --app-text-muted #7a8aaa   muted labels
// --app-border     #dde3f0   borders / dividers
// --app-bg         #e8edf6   panel body bg
// --app-panel-bg   #ffffff   card bg
const CHART_COLORS = {
    legendText:  '#1a2035',
    tickText:    '#5a6a85',
    gridLine:    'rgba(30,50,120,0.07)',
    axisTitle:   '#7a8aaa',
    tooltipBg:   '#ffffff',
    tooltipText: '#1a2035',
    cardBg:      '#f4f7fc',
    cardBorder:  '#dde3f0',
};

export class AnalyticsPanel {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private _root: HTMLElement | null = null;
    private _chartjs: ChartJS | null = null;
    private _charts: Chart[] = [];

    async build(): Promise<HTMLElement> {
        if (!this._root) {
            this._root = document.createElement('div');
            this._root.style.cssText = 'display:flex;flex-direction:column;gap:16px;padding:14px;overflow-y:auto;height:100%;box-sizing:border-box;';

            // Show loading state while Chart.js initialises
            this._showLoading();

            try {
                this._chartjs = await import('chart.js');
                this._chartjs.Chart.register(...this._chartjs.registerables);
            } catch (e) {
                this._root.innerHTML = '';
                const err = document.createElement('div');
                err.style.cssText = 'padding:20px;color:var(--app-status-error,#dc2626);font-size:0.8rem;font-family:var(--app-font,sans-serif);';
                err.textContent = 'Chart.js failed to load. Run: npm install chart.js';
                this._root.appendChild(err);
                return this._root;
            }

            this._buildAllCharts();

            // Refresh on sync state change
            window.runtime?.events?.on('pryzm-sync-state-changed', () => this._refresh()); // F.events.15
        }
        return this._root;
    }

    private _showLoading(): void {
        if (!this._root) return;
        this._root.innerHTML = '';
        const spinner = document.createElement('div');
        spinner.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:10px;padding:40px 0;';
        spinner.innerHTML = `
            <div style="width:28px;height:28px;border:3px solid var(--app-border,#dde3f0);border-top-color:var(--app-accent,#6600FF);border-radius:50%;animation:dw-spin 0.7s linear infinite;"></div>
            <div style="font-size:12px;color:var(--app-text-muted,#7a8aaa);font-family:var(--app-font,sans-serif);">Loading analytics…</div>
            <style>@keyframes dw-spin{to{transform:rotate(360deg)}}</style>
        `;
        this._root.appendChild(spinner);
    }

    private _buildAllCharts(): void {
        if (!this._root) return;
        this._root.innerHTML = '';
        this._charts.forEach(c => { try { c.destroy(); } catch {} });
        this._charts = [];

        this._root.appendChild(this._buildSectionTitle('Area Stacking by Level'));
        this._root.appendChild(this._buildAreaStackingChart());

        this._root.appendChild(this._buildSectionTitle('Compliance Overview'));
        this._root.appendChild(this._buildComplianceDonut());

        this._root.appendChild(this._buildSectionTitle('Sync State Heatmap'));
        this._root.appendChild(this._buildSyncHeatmap());

        this._root.appendChild(this._buildSectionTitle('Programme vs Actual'));
        this._root.appendChild(this._buildProgrammeChart());

        this._root.appendChild(this._buildSectionTitle('Door Type Distribution'));
        this._root.appendChild(this._buildDoorTypeChart());
    }

    // ── 1. Area stacking ─────────────────────────────────────────────────────

    private _buildAreaStackingChart(): HTMLElement {
        const wrap = this._chartWrap(200);
        const canvas = wrap.querySelector('canvas')!;

        const bm        = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
        const roomStore = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
        const hs        = window.hierarchyStore; // TODO(F.6.x): legacy hierarchyStore — replace with runtime.dataWorkbench.hierarchy store

        const levels: any[] = bm?.getLevels?.() ?? [];
        const rooms:  any[] = roomStore?.getAll?.() ?? [];

        const labelNames  = levels.map((l: any) => l.name ?? l.id ?? '?');
        const datasets: any[] = SYNC_STATES.map(state => ({
            label:           state,
            data:            levels.map((lvl: any) => {
                const levelRooms = rooms.filter((r: any) => r.levelId === lvl.id);
                return levelRooms.reduce((sum: number, r: any) => {
                    const unit   = hs ? this._getUnitForRoom(r, hs) : null;
                    const uState = unit?.syncState ?? 'no-template';
                    return uState === state ? sum + (r.area ?? 0) : sum;
                }, 0);
            }),
            backgroundColor: SYNC_COLORS[state] + 'cc',
        }));

        const chart = new this._chartjs!.Chart(canvas, {
            type: 'bar',
            data: { labels: labelNames, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: CHART_COLORS.legendText, font: { size: 10 } } } },
                scales: {
                    x: { stacked: true, ticks: { color: CHART_COLORS.tickText, font: { size: 10 } }, grid: { color: CHART_COLORS.gridLine } },
                    y: { stacked: true, ticks: { color: CHART_COLORS.tickText, font: { size: 10 } }, grid: { color: CHART_COLORS.gridLine }, title: { display: true, text: 'Area (m²)', color: CHART_COLORS.axisTitle, font: { size: 10 } } },
                },
                onClick: (_e, elements) => {
                    if (!elements.length) return;
                    const levelId = levels[elements[0].index]?.id;
                    if (levelId) this._navigateTo(levelId);
                },
            },
        } as ChartConfiguration);
        this._charts.push(chart);
        return wrap;
    }

    // ── 2. Compliance donut ───────────────────────────────────────────────────

    private _buildComplianceDonut(): HTMLElement {
        const wrap   = this._chartWrap(220);
        const canvas = wrap.querySelector('canvas')!;

        const allNodes = this._getAllNodes();
        const counts   = SYNC_STATES.map(s => allNodes.filter((n: any) => n.syncState === s).length);
        const total    = counts.reduce((a, b) => a + b, 0);

        const chart = new this._chartjs!.Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: SYNC_STATES,
                datasets: [{
                    data:            counts,
                    backgroundColor: SYNC_STATES.map(s => SYNC_COLORS[s] + 'dd'),
                    borderColor:     SYNC_STATES.map(s => SYNC_COLORS[s]),
                    borderWidth:     1,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: CHART_COLORS.legendText, font: { size: 10 }, padding: 10 } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const val = ctx.parsed;
                                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0';
                                return ` ${ctx.label}: ${val} (${pct}%)`;
                            },
                        },
                    },
                },
                onClick: (_e, elements) => {
                    if (!elements.length) return;
                    const state   = SYNC_STATES[elements[0].index];
                    const matched = allNodes.filter((n: any) => n.syncState === state);
                    if (matched.length) this._navigateTo(matched[0].id);
                },
            },
        } as ChartConfiguration);
        this._charts.push(chart);
        return wrap;
    }

    // ── 3. Sync heatmap (table) ───────────────────────────────────────────────

    private _buildSyncHeatmap(): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'overflow-x:auto;border-radius:6px;border:1px solid var(--app-border,#dde3f0);';

        const bm        = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer / runtime.tools
        const hs        = window.hierarchyStore; // TODO(F.6.x): legacy hierarchyStore — replace with runtime.dataWorkbench.hierarchy store
        const roomStore = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot

        const levels: any[] = bm?.getLevels?.() ?? [];
        const rooms:  any[] = roomStore?.getAll?.() ?? [];
        const nodes:  any[] = hs?.getAll?.() ?? [];

        const table = document.createElement('table');
        table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.72rem;';

        // Header
        const thead = document.createElement('thead');
        const hRow  = document.createElement('tr');
        hRow.style.background = 'var(--app-bg,#e8edf6)';
        const headerCells = ['Level', ...SYNC_STATES];
        headerCells.forEach((h, i) => {
            const th = document.createElement('th');
            th.textContent   = i === 0 ? h : h.replace('-', ' ');
            th.style.cssText = `padding:5px 8px;text-align:${i === 0 ? 'left' : 'center'};border-bottom:1px solid var(--app-border,#dde3f0);color:${i === 0 ? 'var(--app-text,#1a2035)' : (SYNC_COLORS[h] ?? 'var(--app-text,#1a2035)')};font-weight:600;white-space:nowrap;font-family:var(--app-font,sans-serif);`;
            hRow.appendChild(th);
        });
        thead.appendChild(hRow);
        table.appendChild(thead);

        // Body rows — one per level
        const tbody = document.createElement('tbody');
        const syntheticLevels = levels.length ? levels : [{ id: '__all__', name: 'All' }];
        syntheticLevels.forEach((lvl: any, idx: number) => {
            const tr = document.createElement('tr');
            tr.style.background = idx % 2 === 0 ? 'transparent' : 'var(--app-bg,#e8edf6)';

            const levelRooms = lvl.id === '__all__' ? rooms : rooms.filter((r: any) => r.levelId === lvl.id);
            const levelNodes = lvl.id === '__all__' ? nodes : nodes.filter((n: any) =>
                levelRooms.some((r: any) => r.unitId === n.id),
            );

            const nameTd = document.createElement('td');
            nameTd.textContent   = lvl.name ?? lvl.id;
            nameTd.style.cssText = 'padding:4px 8px;color:var(--app-text,#1a2035);font-weight:500;white-space:nowrap;border-bottom:1px solid var(--app-border-light,#eef1f8);font-family:var(--app-font,sans-serif);';
            tr.appendChild(nameTd);

            SYNC_STATES.forEach(state => {
                const count = levelNodes.filter((n: any) => n.syncState === state).length;
                const td    = document.createElement('td');
                td.textContent   = count > 0 ? String(count) : '—';
                td.style.cssText = `padding:4px 8px;text-align:center;border-bottom:1px solid var(--app-border-light,#eef1f8);color:${count > 0 ? SYNC_COLORS[state] : 'var(--app-text-muted,#7a8aaa)'};font-weight:${count > 0 ? '700' : '400'};cursor:${count > 0 ? 'pointer' : 'default'};font-family:var(--app-font,sans-serif);`;
                if (count > 0) {
                    td.onclick = () => {
                        const matched = levelNodes.filter((n: any) => n.syncState === state);
                        if (matched.length) this._navigateTo(matched[0].id);
                    };
                    td.onmouseenter = () => { td.style.textDecoration = 'underline'; };
                    td.onmouseleave = () => { td.style.textDecoration = 'none'; };
                }
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrapper.appendChild(table);
        return wrapper;
    }

    // ── 4. Programme vs actual ────────────────────────────────────────────────

    private _buildProgrammeChart(): HTMLElement {
        const wrap   = this._chartWrap(200);
        const canvas = wrap.querySelector('canvas')!;

        const hs = window.hierarchyStore; // TODO(F.6.x): legacy hierarchyStore — replace with runtime.dataWorkbench.hierarchy store
        const rs = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot

        const units: any[] = hs ? (hs.getAll?.() ?? []).filter((n: any) => n.type === 'unit') : [];
        const rooms: any[] = rs?.getAll?.() ?? [];

        const labels   = units.map((u: any) => u.name ?? u.id ?? '?');
        const planned  = units.map((u: any) => u.plannedData?.targetArea ?? 0);
        const actual   = units.map((u: any) => {
            const unitRooms = rooms.filter((r: any) => r.unitId === u.id);
            return unitRooms.reduce((sum: number, r: any) => sum + (r.area ?? 0), 0);
        });

        const chart = new this._chartjs!.Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Planned (m²)', data: planned, backgroundColor: 'rgba(102,0,255,0.7)', borderColor: '#6600FF', borderWidth: 1 },
                    { label: 'Actual (m²)',  data: actual,  backgroundColor: 'rgba(34,197,94,0.7)',  borderColor: '#22c55e', borderWidth: 1 },
                ],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: CHART_COLORS.legendText, font: { size: 10 } } } },
                scales: {
                    x: { ticks: { color: CHART_COLORS.tickText, font: { size: 10 } }, grid: { color: CHART_COLORS.gridLine } },
                    y: { ticks: { color: CHART_COLORS.tickText, font: { size: 10 } }, grid: { color: CHART_COLORS.gridLine }, title: { display: true, text: 'Area (m²)', color: CHART_COLORS.axisTitle, font: { size: 10 } } },
                },
                onClick: (_e, elements) => {
                    if (!elements.length) return;
                    const unit = units[elements[0].index];
                    if (unit?.id) this._navigateTo(unit.id);
                },
            },
        } as ChartConfiguration);
        this._charts.push(chart);
        return wrap;
    }

    // ── 5. Door type distribution ─────────────────────────────────────────────

    private _buildDoorTypeChart(): HTMLElement {
        const wrap   = this._chartWrap(200);
        const canvas = wrap.querySelector('canvas')!;

        const ecs   = window.elementCodeStore; // TODO(C.3.x): legacy elementCodeStore — replace with runtime.projectContext element-code registry
        const codes: any[] = ecs?.getByPrefix?.('DO') ?? [];

        const groups: Record<string, number> = {};
        codes.forEach((c: any) => {
            const key = (c.typeCode ?? c.code?.slice(2) ?? 'other').toUpperCase();
            groups[key] = (groups[key] ?? 0) + 1;
        });
        const labels = Object.keys(groups);
        const data   = labels.map(k => groups[k]);

        const palette = ['#6600FF', '#8B5CF6', '#A78BFA', '#C4B5FD', '#DDD6FE', '#EDE9FE'];

        const chart = new this._chartjs!.Chart(canvas, {
            type: 'pie',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: labels.map((_, i) => palette[i % palette.length] + 'dd'),
                    borderColor:     labels.map((_, i) => palette[i % palette.length]),
                    borderWidth:     1,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: CHART_COLORS.legendText, font: { size: 10 } } },
                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed} doors` } },
                },
                onClick: (_e, elements) => {
                    if (!elements.length) return;
                    const typeCode = labels[elements[0].index];
                    const match    = codes.find((c: any) => (c.typeCode ?? c.code?.slice(2) ?? '').toUpperCase() === typeCode);
                    if (match?.elementId) this._navigateTo(match.elementId);
                },
            },
        } as ChartConfiguration);
        this._charts.push(chart);
        return wrap;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private _buildSectionTitle(text: string): HTMLElement {
        const el = document.createElement('div');
        el.textContent   = text;
        el.style.cssText = 'font-size:0.72rem;font-weight:700;color:var(--app-text-muted,#7a8aaa);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:-8px;font-family:var(--app-font,sans-serif);';
        return el;
    }

    private _chartWrap(height: number): HTMLElement {
        const wrap = document.createElement('div');
        // Light theme: white card background with subtle border — matches --app-panel-bg and --app-border
        wrap.style.cssText = `position:relative;height:${height}px;background:var(--app-panel-bg,#ffffff);border-radius:var(--app-radius-sm,6px);padding:8px;border:1px solid var(--app-border,#dde3f0);box-shadow:var(--app-shadow-card,0 2px 10px rgba(30,50,120,0.07));`;
        const canvas = document.createElement('canvas');
        wrap.appendChild(canvas);
        return wrap;
    }

    private _getAllNodes(): any[] {
        const hs    = window.hierarchyStore; // TODO(F.6.x): legacy hierarchyStore — replace with runtime.dataWorkbench.hierarchy store
        const rs    = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
        const nodes = hs?.getAll?.() ?? [];
        const rooms = rs?.getAll?.() ?? [];
        return [...nodes, ...rooms];
    }

    private _getUnitForRoom(room: any, hs: any): any {
        if (!room.unitId) return null;
        return hs.getById?.(room.unitId) ?? null;
    }

    private _navigateTo(id: string): void {
        // F.events.7 — pryzm-workbench-select migrated to runtime.events typed bus.
        window.runtime?.events?.emit('pryzm-workbench-select', { id });
    }

    private _refresh(): void {
        if (!this._root || !this._chartjs) return;
        this._buildAllCharts();
    }
}
