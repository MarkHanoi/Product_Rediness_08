/**
 * DataSchedulesBucket — DATA lifecycle bucket content mounts.
 *
 * Layer Affected:    UI — Data Workbench › Data Schedules Bucket
 * File:             src/ui/dataworkbench/buckets/DataSchedulesBucket.ts
 *
 * Owns:
 *   mountTypeSchedule        — generic table-based type schedule renderer
 *   mountMaterialSchedule    — material schedule with usage cross-reference
 *   rebuildAllDataSchedules  — rebuild every DATA panel (called from refresh())
 *   rebuildActiveDataSchedule — rebuild only the currently visible DATA panel
 *   Row-data builders × 9   — wallTypeRows, doorTypeRows, windowTypeRows,
 *                              floorTypeRows, slabTypeRows, columnTypeRows,
 *                              beamTypeRows, stairTypeRows
 *
 * Reuses sched- CSS classes from SchedulePanel for styling parity.
 */

import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';
import { wallSystemTypeStore }       from '@pryzm/geometry-wall';
import { doorSystemTypeStore }       from '@pryzm/geometry-door';
import { windowSystemTypeStore }     from '@pryzm/geometry-window';
import { BUILT_IN_STAIR_TYPES }      from '@pryzm/geometry-stair';
import { floorSystemTypeStore }      from '@pryzm/core-app-model/stores';
import { slabSystemTypeStore }       from '@pryzm/geometry-slab';
import { SteelProfileLibrary }       from '@pryzm/plugin-structural';
import { escapeHtml, formatMaterialColor, formatMetres } from './DWHelpers';

// ── Type aliases (mirrors shell-private types; duplicated to avoid import cycle) ─

type TabId = string;

// ── Generic type schedule renderer ───────────────────────────────────────────

export function mountTypeSchedule(
    panel: HTMLElement,
    title: string,
    data: { columns: string[]; rows: string[][] },
): void {
    const accentColor = '#0C7A6E';
    const emptyMsg    = `No ${title.toLowerCase()} defined in the project.`;

    panel.innerHTML = `
        <div style="height:100%;display:flex;flex-direction:column;overflow:hidden;">
            <div style="padding:12px 16px 10px;border-bottom:1px solid var(--dw-border,#e5e7eb);
                        background:linear-gradient(180deg,rgba(12,122,110,.07),transparent);flex-shrink:0;">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <span style="font-size:14px;font-weight:800;color:var(--app-text,#1a2035);">${escapeHtml(title)}</span>
                    <span style="font-size:10px;background:rgba(12,122,110,.12);color:${accentColor};border-radius:99px;
                                 padding:2px 9px;font-weight:700;">${data.rows.length} types</span>
                    <span style="margin-left:auto;font-size:10px;color:var(--app-text-muted,#7a8aaa);">
                        ${data.columns.length} properties
                    </span>
                </div>
                <input data-ds-search type="search" placeholder="Search types…"
                       style="width:100%;box-sizing:border-box;margin-top:8px;padding:7px 10px;
                              border:1px solid var(--dw-border,#e5e7eb);border-radius:8px;
                              font-size:12px;background:#fff;color:var(--app-text,#1a2035);outline:none;"/>
            </div>
            <div style="flex:1;overflow:auto;">
                ${data.rows.length === 0 ? `
                    <div style="padding:32px;text-align:center;color:var(--app-text-muted,#7a8aaa);font-size:12px;">
                        ${escapeHtml(emptyMsg)}
                    </div>
                ` : `
                    <table class="sched-table" style="width:100%;border-collapse:collapse;font-size:11px;">
                        <thead>
                            <tr>
                                ${data.columns.map(col => `
                                    <th class="sched-th-resizable" style="background:var(--app-bg,#e8edf6);
                                        color:var(--app-text,#1a2035);font-size:10px;font-weight:700;
                                        letter-spacing:.06em;text-transform:uppercase;
                                        padding:8px 10px;white-space:nowrap;border-bottom:2px solid rgba(12,122,110,.25);
                                        border-right:1px solid var(--dw-border,#e5e7eb);text-align:left;position:sticky;top:0;z-index:1;">
                                        <span class="sched-th-label">${escapeHtml(col)}</span>
                                    </th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${data.rows.map((row, ri) => `
                                <tr data-ds-row style="background:${ri % 2 === 0 ? '#fff' : 'rgba(12,122,110,.03)'};"
                                    data-search="${escapeHtml(row.join(' ').toLowerCase())}">
                                    ${row.map((cell, ci) => `
                                        <td style="padding:7px 10px;border-bottom:1px solid var(--dw-border,#e5e7eb);
                                            border-right:1px solid var(--app-border-light,#eef1f8);
                                            color:${ci === 0 ? 'var(--app-text,#1a2035)' : 'var(--app-text-2,#5a6a85)'};
                                            font-weight:${ci === 0 ? '700' : '400'};
                                            white-space:${ci === 0 ? 'nowrap' : 'normal'};
                                            max-width:${ci <= 2 ? '200px' : 'none'};
                                            overflow:${ci <= 2 ? 'hidden' : 'visible'};
                                            text-overflow:${ci <= 2 ? 'ellipsis' : 'unset'};
                                            vertical-align:top;font-size:${ci >= 3 ? '10px' : '11px'};">${escapeHtml(cell)}</td>`).join('')}
                                </tr>`).join('')}
                        </tbody>
                    </table>
                `}
            </div>
        </div>
    `;

    const search = panel.querySelector('[data-ds-search]') as HTMLInputElement | null;
    search?.addEventListener('input', () => {
        const term = search.value.trim().toLowerCase();
        panel.querySelectorAll('[data-ds-row]').forEach(row => {
            const el = row as HTMLElement;
            el.style.display = !term || (el.dataset.search ?? '').includes(term) ? '' : 'none';
        });
    });
}

// ── Material Schedule ─────────────────────────────────────────────────────────

export function mountMaterialSchedule(panel: HTMLElement): void {
    const accentColor = '#0C7A6E';

    const usageMap = new Map<string, Set<string>>();
    const mark = (matId: string | undefined, cat: string) => {
        if (!matId) return;
        if (!usageMap.has(matId)) usageMap.set(matId, new Set());
        usageMap.get(matId)!.add(cat);
    };

    wallSystemTypeStore.getAll().forEach(t => t.layers.forEach(l => mark(l.materialId, 'Wall')));
    floorSystemTypeStore.getAll().forEach(t => (t as any).layers?.forEach((l: any) => mark(l.materialId, 'Floor')));
    slabSystemTypeStore.getAll().forEach(t => t.layers.forEach(l => mark((l as any).materialId, 'Slab')));
    doorSystemTypeStore.getAll().forEach(t => {
        mark(t.frameFinish.materialId, 'Door');
        mark(t.leafFinish.materialId,  'Door');
    });
    windowSystemTypeStore.getAll().forEach(t => {
        mark(t.frameFinish.materialId, 'Window');
        mark(t.sillFinish.materialId,  'Window');
    });

    const ELEMENT_CATS = ['Wall', 'Floor', 'Slab', 'Ceiling', 'Door', 'Window'];
    const TICK = '✓';
    const DASH = '—';

    const columns = ['Name', 'Category', 'Color', 'Roughness', 'Metalness', ...ELEMENT_CATS];

    const rows = STANDARD_MATERIAL_LIBRARY.map(m => {
        const color     = formatMaterialColor(m.params.color);
        const roughness = typeof m.params.roughness === 'number' ? m.params.roughness.toFixed(2) : '—';
        const metalness = typeof m.params.metalness === 'number' ? m.params.metalness.toFixed(2) : '—';
        const usage     = usageMap.get(m.id);
        return [
            m.label, m.category, color, roughness, metalness,
            ...ELEMENT_CATS.map(cat => (usage?.has(cat) ? TICK : DASH)),
        ];
    });

    const grouped = new Map<string, typeof STANDARD_MATERIAL_LIBRARY>();
    for (const m of STANDARD_MATERIAL_LIBRARY) {
        const list = grouped.get(m.category) ?? [];
        list.push(m);
        grouped.set(m.category, list);
    }

    const buildRows = (materials: typeof STANDARD_MATERIAL_LIBRARY, riOffset: number) =>
        materials.map((m, ri) => {
            const color     = formatMaterialColor(m.params.color);
            const roughness = typeof m.params.roughness === 'number' ? m.params.roughness.toFixed(2) : '—';
            const metalness = typeof m.params.metalness === 'number' ? m.params.metalness.toFixed(2) : '—';
            const usage     = usageMap.get(m.id);
            const cells = [
                `<td style="padding:7px 10px;border-bottom:1px solid var(--dw-border,#e5e7eb);border-right:1px solid var(--app-border-light,#eef1f8);font-weight:700;color:var(--app-text,#1a2035);white-space:nowrap;">${escapeHtml(m.label)}</td>`,
                `<td style="padding:7px 10px;border-bottom:1px solid var(--dw-border,#e5e7eb);border-right:1px solid var(--app-border-light,#eef1f8);color:var(--app-text-2,#5a6a85);font-size:10px;">${escapeHtml(m.category)}</td>`,
                `<td style="padding:7px 10px;border-bottom:1px solid var(--dw-border,#e5e7eb);border-right:1px solid var(--app-border-light,#eef1f8);">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <div style="width:16px;height:16px;border-radius:3px;flex-shrink:0;border:1px solid rgba(0,0,0,.12);background:${escapeHtml(color)};"></div>
                        <span style="font-size:9px;font-family:monospace;color:var(--app-text-muted,#7a8aaa);">${escapeHtml(color)}</span>
                    </div>
                </td>`,
                `<td style="padding:7px 10px;border-bottom:1px solid var(--dw-border,#e5e7eb);border-right:1px solid var(--app-border-light,#eef1f8);color:var(--app-text-2,#5a6a85);text-align:center;">${escapeHtml(roughness)}</td>`,
                `<td style="padding:7px 10px;border-bottom:1px solid var(--dw-border,#e5e7eb);border-right:1px solid var(--app-border-light,#eef1f8);color:var(--app-text-2,#5a6a85);text-align:center;">${escapeHtml(metalness)}</td>`,
                ...ELEMENT_CATS.map(cat => {
                    const assigned = usage?.has(cat) ?? false;
                    return `<td style="padding:7px 10px;border-bottom:1px solid var(--dw-border,#e5e7eb);border-right:1px solid var(--app-border-light,#eef1f8);text-align:center;color:${assigned ? accentColor : '#c9d0dc'};font-size:13px;font-weight:${assigned ? '700' : '400'};">
                        ${assigned ? TICK : DASH}
                    </td>`;
                }),
            ];
            const searchStr = [m.label, m.category, m.id, color, ...ELEMENT_CATS.filter(c => usage?.has(c))].join(' ').toLowerCase();
            return `<tr data-ms-row data-search="${escapeHtml(searchStr)}" style="background:${(ri + riOffset) % 2 === 0 ? '#fff' : 'rgba(12,122,110,.025)'};">${cells.join('')}</tr>`;
        }).join('');

    const colHeaders = [...columns].map(col => `
        <th style="background:var(--app-bg,#e8edf6);color:var(--app-text,#1a2035);font-size:10px;font-weight:700;
            letter-spacing:.06em;text-transform:uppercase;padding:8px 10px;white-space:nowrap;
            border-bottom:2px solid rgba(12,122,110,.25);border-right:1px solid var(--dw-border,#e5e7eb);
            text-align:left;position:sticky;top:0;z-index:1;">${escapeHtml(col)}</th>`).join('');

    let rowOffset = 0;
    const groupedHtml = Array.from(grouped.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cat, mats]) => {
            const catRows = buildRows(mats, rowOffset);
            rowOffset += mats.length;
            return `<tr><td colspan="${columns.length}" style="padding:4px 10px 2px;font-size:9px;font-weight:800;
                letter-spacing:.1em;text-transform:uppercase;color:${accentColor};
                background:rgba(12,122,110,.06);border-bottom:1px solid rgba(12,122,110,.15);">
                ${escapeHtml(cat)} <span style="font-weight:400;color:var(--app-text-muted,#7a8aaa);">(${mats.length})</span>
            </td></tr>${catRows}`;
        }).join('');

    panel.innerHTML = `
        <div style="height:100%;display:flex;flex-direction:column;overflow:hidden;">
            <div style="padding:12px 16px 10px;border-bottom:1px solid var(--dw-border,#e5e7eb);
                        background:linear-gradient(180deg,rgba(12,122,110,.07),transparent);flex-shrink:0;">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <span style="font-size:14px;font-weight:800;color:var(--app-text,#1a2035);">Material Schedule</span>
                    <span style="font-size:10px;background:rgba(12,122,110,.12);color:${accentColor};border-radius:99px;
                                 padding:2px 9px;font-weight:700;">${STANDARD_MATERIAL_LIBRARY.length} materials</span>
                    <span style="font-size:10px;color:var(--app-text-muted,#7a8aaa);margin-left:auto;">
                        ✓ = used in a type &nbsp;·&nbsp; — = available but not yet used
                    </span>
                </div>
                <input data-ms-search type="search" placeholder="Search concrete, timber, glass, category…"
                       style="width:100%;box-sizing:border-box;margin-top:8px;padding:7px 10px;
                              border:1px solid var(--dw-border,#e5e7eb);border-radius:8px;
                              font-size:12px;background:#fff;color:var(--app-text,#1a2035);outline:none;"/>
            </div>
            <div style="flex:1;overflow:auto;">
                <table class="sched-table" style="width:100%;border-collapse:collapse;font-size:11px;">
                    <thead><tr>${colHeaders}</tr></thead>
                    <tbody data-ms-body>${groupedHtml}</tbody>
                </table>
            </div>
        </div>
    `;

    const search = panel.querySelector('[data-ms-search]') as HTMLInputElement | null;
    const tbody  = panel.querySelector('[data-ms-body]') as HTMLElement | null;
    search?.addEventListener('input', () => {
        const term = search.value.trim().toLowerCase();
        if (!term) {
            if (tbody) tbody.innerHTML = groupedHtml;
            return;
        }
        const filteredRows = rows
            .filter(r => r.join(' ').toLowerCase().includes(term))
            .map((r, ri) => {
                const color  = r[2];
                const usage  = usageMap.get(STANDARD_MATERIAL_LIBRARY.find(m => m.label === r[0])?.id ?? '');
                return `<tr data-ms-row style="background:${ri % 2 === 0 ? '#fff' : 'rgba(12,122,110,.025)'};">
                    <td style="padding:7px 10px;border-bottom:1px solid var(--dw-border,#e5e7eb);border-right:1px solid var(--app-border-light,#eef1f8);font-weight:700;color:var(--app-text,#1a2035);white-space:nowrap;">${escapeHtml(r[0])}</td>
                    <td style="padding:7px 10px;border-bottom:1px solid var(--dw-border,#e5e7eb);border-right:1px solid var(--app-border-light,#eef1f8);color:var(--app-text-2,#5a6a85);font-size:10px;">${escapeHtml(r[1])}</td>
                    <td style="padding:7px 10px;border-bottom:1px solid var(--dw-border,#e5e7eb);border-right:1px solid var(--app-border-light,#eef1f8);">
                        <div style="display:flex;align-items:center;gap:6px;">
                            <div style="width:16px;height:16px;border-radius:3px;flex-shrink:0;border:1px solid rgba(0,0,0,.12);background:${escapeHtml(color)};"></div>
                            <span style="font-size:9px;font-family:monospace;color:var(--app-text-muted,#7a8aaa);">${escapeHtml(color)}</span>
                        </div>
                    </td>
                    <td style="padding:7px 10px;border-bottom:1px solid var(--dw-border,#e5e7eb);border-right:1px solid var(--app-border-light,#eef1f8);color:var(--app-text-2,#5a6a85);text-align:center;">${escapeHtml(r[3])}</td>
                    <td style="padding:7px 10px;border-bottom:1px solid var(--dw-border,#e5e7eb);border-right:1px solid var(--app-border-light,#eef1f8);color:var(--app-text-2,#5a6a85);text-align:center;">${escapeHtml(r[4])}</td>
                    ${ELEMENT_CATS.map(cat => {
                        const assigned = usage?.has(cat) ?? false;
                        return `<td style="padding:7px 10px;border-bottom:1px solid var(--dw-border,#e5e7eb);border-right:1px solid var(--app-border-light,#eef1f8);text-align:center;color:${assigned ? accentColor : '#c9d0dc'};font-size:13px;font-weight:${assigned ? '700' : '400'};">${assigned ? TICK : DASH}</td>`;
                    }).join('')}
                </tr>`;
            }).join('');
        if (tbody) tbody.innerHTML = filteredRows || `<tr><td colspan="${columns.length}" style="padding:24px;text-align:center;color:var(--app-text-muted,#7a8aaa);font-size:12px;">No materials match "${escapeHtml(term)}"</td></tr>`;
    });
}

// ── Row-data builders ─────────────────────────────────────────────────────────

export function wallTypeRows(): { columns: string[]; rows: string[][] } {
    const types = wallSystemTypeStore.getAll();
    return {
        columns: ['Name', 'Total Thickness', '# Layers', 'Layer Breakdown', 'Category', 'Description'],
        rows: types.map(t => {
            const layerSummary = t.layers.length === 0
                ? '—'
                : t.layers.map(l => `${l.name} (${l.function}, ${Math.round(l.thickness * 1000)}mm)`).join(' | ');
            return [
                t.name,
                formatMetres(t.totalThickness),
                String(t.layers.length),
                layerSummary,
                wallSystemTypeStore.isBuiltIn(t.id) ? 'Built-in' : 'Custom',
                t.description ?? '—',
            ];
        }),
    };
}

export function doorTypeRows(): { columns: string[]; rows: string[][] } {
    const types = doorSystemTypeStore.getAll();
    return {
        columns: ['Name', 'ID', 'Category', 'Frame Finish', 'Leaf Finish', 'Glazing', 'Type'],
        rows: types.map(t => [
            t.name, t.id, t.category,
            t.frameFinish.name, t.leafFinish.name,
            t.glazingOpacity === 1 ? 'Opaque' : t.glazingOpacity === 0 ? 'Clear glass' : `${Math.round((1 - t.glazingOpacity) * 100)}% glazed`,
            t.isBuiltIn ? 'Built-in' : 'Custom',
        ]),
    };
}

export function windowTypeRows(): { columns: string[]; rows: string[][] } {
    const types = windowSystemTypeStore.getAll();
    return {
        columns: ['Name', 'ID', 'Category', 'Frame Finish', 'Sill Finish', 'Glazing', 'Type'],
        rows: types.map(t => [
            t.name, t.id, t.category,
            t.frameFinish.name, t.sillFinish.name,
            t.glazingOpacity === 0 ? 'Clear glass' : t.glazingOpacity === 1 ? 'Opaque' : `${Math.round((1 - t.glazingOpacity) * 100)}% glazed`,
            t.isBuiltIn ? 'Built-in' : 'Custom',
        ]),
    };
}

export function floorTypeRows(): { columns: string[]; rows: string[][] } {
    const types = floorSystemTypeStore.getAll();
    return {
        columns: ['Name', 'Category', 'Total Thickness', '# Layers', 'Layer Breakdown', 'Finish Material', 'Zone Types', 'Tags'],
        rows: types.map(t => {
            const finishLayer  = t.layers.find((l: any) => l.function === 'finish');
            const tags: string[] = Array.isArray((t as any).tags) ? (t as any).tags : [];
            const layerSummary = t.layers.length === 0
                ? '—'
                : t.layers.map((l: any) => `${l.name} (${l.function}, ${Math.round(l.thickness * 1000)}mm)`).join(' | ');
            return [
                (t as any).name ?? t.id,
                String((t as any).category ?? '—'),
                formatMetres(t.totalThickness),
                String(t.layers.length),
                layerSummary,
                (finishLayer as any)?.name ?? '—',
                Array.isArray((t as any).zoneTypes) ? ((t as any).zoneTypes as string[]).join(', ') : '—',
                tags.length > 0 ? tags.join(', ') : '—',
            ];
        }),
    };
}

export function slabTypeRows(): { columns: string[]; rows: string[][] } {
    const types = slabSystemTypeStore.getAll();
    return {
        columns: ['Name', 'Total Thickness', '# Layers', 'Layer Breakdown', 'Category', 'Description'],
        rows: types.map(t => {
            const layerSummary = t.layers.length === 0
                ? '—'
                : t.layers.map((l: any) => `${l.name} (${l.function}, ${Math.round(l.thickness * 1000)}mm)`).join(' | ');
            return [
                (t as any).name ?? t.id,
                formatMetres(t.totalThickness),
                String(t.layers.length),
                layerSummary,
                (t as any).category ?? '—',
                (t as any).description ?? '—',
            ];
        }),
    };
}

export function columnTypeRows(): { columns: string[]; rows: string[][] } {
    return {
        columns: ['Section', 'Series', 'Depth D (mm)', 'Width B (mm)', 'Web t (mm)', 'Flange T (mm)', 'Root r (mm)', 'Mass (kg/m)'],
        rows: SteelProfileLibrary.UC.map(p => [
            p.name, p.series,
            String(p.D), String(p.B), String(p.t), String(p.T), String(p.r), String(p.mass),
        ]),
    };
}

export function beamTypeRows(): { columns: string[]; rows: string[][] } {
    return {
        columns: ['Section', 'Series', 'Depth D (mm)', 'Width B (mm)', 'Web t (mm)', 'Flange T (mm)', 'Root r (mm)', 'Mass (kg/m)'],
        rows: SteelProfileLibrary.UB.map(p => [
            p.name, p.series,
            String(p.D), String(p.B), String(p.t), String(p.T), String(p.r), String(p.mass),
        ]),
    };
}

export function stairTypeRows(): { columns: string[]; rows: string[][] } {
    return {
        columns: ['Name', 'ID', 'Material', 'Stringer Type', 'Riser Visible', 'Nosing Type', 'Nosing Depth', 'Target Riser', 'Max Riser', 'Min Tread'],
        rows: BUILT_IN_STAIR_TYPES.map(t => [
            t.name, t.id,
            t.defaults.material,
            t.defaults.stringerType,
            t.defaults.riserVisible ? 'Yes' : 'No',
            t.defaults.nosingType,
            t.defaults.nosingDepth > 0 ? `${Math.round(t.defaults.nosingDepth * 1000)}mm` : '—',
            formatMetres(t.rules.targetRiserHeight),
            formatMetres(t.rules.maxRiserHeight),
            formatMetres(t.rules.minTreadDepth),
        ]),
    };
}

// ── Orchestration helpers (called from DataWorkbench shell) ──────────────────

/**
 * Rebuild every DATA bucket schedule panel.
 * Called from DataWorkbench.refresh() after a project load.
 */
export function rebuildAllDataSchedules(panels: Map<TabId, HTMLElement>): void {
    const get = (id: TabId) => panels.get(id);
    if (!get('data-materials')) return;
    mountMaterialSchedule(get('data-materials')!);
    mountTypeSchedule(get('data-wall-types')!,   'Wall Types',        wallTypeRows());
    mountTypeSchedule(get('data-door-types')!,   'Door Types',        doorTypeRows());
    mountTypeSchedule(get('data-window-types')!, 'Window Types',      windowTypeRows());
    mountTypeSchedule(get('data-floor-types')!,  'Floor Types',       floorTypeRows());
    mountTypeSchedule(get('data-slab-types')!,   'Slab Types',        slabTypeRows());
    mountTypeSchedule(get('data-column-types')!, 'Column Types (UC)', columnTypeRows());
    mountTypeSchedule(get('data-beam-types')!,   'Beam Types (UB)',   beamTypeRows());
    mountTypeSchedule(get('data-stair-types')!,  'Stair Types',       stairTypeRows());
}

/**
 * Rebuild only the currently active DATA schedule panel.
 * Called from DataWorkbench._showActiveContent() on every bucket activation.
 */
export function rebuildActiveDataSchedule(panels: Map<TabId, HTMLElement>, activeTab: TabId): void {
    const get = (id: TabId) => panels.get(id)!;
    switch (activeTab) {
        case 'data-materials':    mountMaterialSchedule(get('data-materials'));   break;
        case 'data-wall-types':   mountTypeSchedule(get('data-wall-types'),   'Wall Types',        wallTypeRows());   break;
        case 'data-door-types':   mountTypeSchedule(get('data-door-types'),   'Door Types',        doorTypeRows());   break;
        case 'data-window-types': mountTypeSchedule(get('data-window-types'), 'Window Types',      windowTypeRows()); break;
        case 'data-floor-types':  mountTypeSchedule(get('data-floor-types'),  'Floor Types',       floorTypeRows());  break;
        case 'data-slab-types':   mountTypeSchedule(get('data-slab-types'),   'Slab Types',        slabTypeRows());   break;
        case 'data-column-types': mountTypeSchedule(get('data-column-types'), 'Column Types (UC)', columnTypeRows()); break;
        case 'data-beam-types':   mountTypeSchedule(get('data-beam-types'),   'Beam Types (UB)',   beamTypeRows());   break;
        case 'data-stair-types':  mountTypeSchedule(get('data-stair-types'),  'Stair Types',       stairTypeRows());  break;
        default: break;
    }
}
