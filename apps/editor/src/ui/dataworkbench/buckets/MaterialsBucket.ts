/**
 * MaterialsBucket — MATERIALS lifecycle bucket content mounts.
 *
 * Layer Affected:    UI — Data Workbench › Materials Bucket
 * File:             src/ui/dataworkbench/buckets/MaterialsBucket.ts
 *
 * Owns:
 *   mountMaterialLibrary   — BIM Material Library panel
 *   mountRenderMaterials   — Render Material Library panel
 *   mountElementTypes      — Element Types panel (wall/door/window/other type pickers)
 *
 * Local helper: buildMaterialSelect (not exported — used only by mountElementTypes).
 */

import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';
import { RENDER_MATERIAL_LIBRARY }   from '@pryzm/core-app-model/rendering';
import { wallSystemTypeStore }       from '@pryzm/geometry-wall';
import { doorSystemTypeStore }       from '@pryzm/geometry-door';
import { windowSystemTypeStore }     from '@pryzm/geometry-window';
import { BUILT_IN_STAIR_TYPES }      from '@pryzm/geometry-stair';
import { floorSystemTypeStore }      from '@pryzm/core-app-model/stores';
import { slabSystemTypeStore }       from '@pryzm/geometry-slab';
import { ceilingSystemTypeStore }    from '@pryzm/core-app-model/stores';
import { handrailTypeStore }         from '@pryzm/core-app-model/stores';
import { SteelProfileLibrary }       from '@pryzm/plugin-structural';
import { escapeHtml, formatMaterialColor, formatMetres } from './DWHelpers';

// ── Private helper: material <select> builder ────────────────────────────────

function buildMaterialSelect(
    currentId: string | undefined,
    attrs: Record<string, string>,
    disabled = false,
): string {
    const grouped = new Map<string, typeof STANDARD_MATERIAL_LIBRARY>();
    for (const m of STANDARD_MATERIAL_LIBRARY) {
        const list = grouped.get(m.category) ?? [];
        list.push(m);
        grouped.set(m.category, list);
    }
    const dataAttrs = Object.entries(attrs).map(([k, v]) => `data-${k}="${escapeHtml(v)}"`).join(' ');
    const optgroups = Array.from(grouped.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cat, mats]) =>
            `<optgroup label="${escapeHtml(cat)}">${mats.map(m =>
                `<option value="${escapeHtml(m.id)}"${m.id === currentId ? ' selected' : ''}>${escapeHtml(m.label)}</option>`
            ).join('')}</optgroup>`
        ).join('');
    return `<select data-material-select ${dataAttrs} ${disabled ? 'disabled title="Duplicate this type to assign a library material"' : ''} style="font-size:10px;border:1px solid var(--dw-border,#e5e7eb);border-radius:6px;padding:3px 6px;background:#fff;color:var(--app-text,#1a2035);cursor:${disabled ? 'not-allowed' : 'pointer'};max-width:160px;"><option value="">— library material —</option>${optgroups}</select>`;
}

// ── BIM Material Library ──────────────────────────────────────────────────────

export function mountMaterialLibrary(panel: HTMLElement): void {
    const grouped = new Map<string, typeof STANDARD_MATERIAL_LIBRARY>();
    for (const material of STANDARD_MATERIAL_LIBRARY) {
        const list = grouped.get(material.category) ?? [];
        list.push(material);
        grouped.set(material.category, list);
    }

    const categoryMarkup = Array.from(grouped.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, materials]) => `
            <section style="margin-bottom:20px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin:0 0 10px;">
                    <h4 style="margin:0;font-size:11px;letter-spacing:.09em;text-transform:uppercase;font-weight:800;color:var(--app-text,#1a2035);">${escapeHtml(category)}</h4>
                    <span style="font-size:10px;color:var(--app-text-muted,#7a8aaa);">${materials.length}</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;">
                    ${materials.map(material => {
                        const color = formatMaterialColor(material.params.color);
                        const roughness = typeof material.params.roughness === 'number' ? material.params.roughness.toFixed(2) : '—';
                        const metalness = typeof material.params.metalness === 'number' ? material.params.metalness.toFixed(2) : '—';
                        const isTransparent = (material.params.transparent && typeof material.params.opacity === 'number' && material.params.opacity < 1);
                        const opacityStr = isTransparent ? (material.params.opacity as number).toFixed(2) : null;
                        return `
                            <article
                                data-material-card
                                data-material-id="${escapeHtml(material.id)}"
                                data-material-color="${escapeHtml(color)}"
                                data-search="${escapeHtml(`${material.label} ${material.category} ${material.id}`.toLowerCase())}"
                                title="Click to select · ${escapeHtml(material.id)}"
                                style="border:1.5px solid var(--dw-border,#e5e7eb);border-radius:10px;background:var(--app-panel,#fff);overflow:hidden;cursor:pointer;transition:border-color .12s,box-shadow .12s;"
                            >
                                <div style="height:44px;background:${color};${isTransparent ? `opacity:${opacityStr};` : ''}position:relative;">
                                    ${parseFloat(metalness) >= 0.7 ? '<div style="position:absolute;top:4px;right:5px;font-size:9px;background:rgba(0,0,0,.35);color:#fff;border-radius:4px;padding:1px 5px;font-weight:700;">M</div>' : ''}
                                    ${isTransparent ? '<div style="position:absolute;top:4px;right:5px;font-size:9px;background:rgba(0,0,0,.35);color:#fff;border-radius:4px;padding:1px 5px;font-weight:700;">T</div>' : ''}
                                </div>
                                <div style="padding:8px 9px;">
                                    <div style="font-size:11px;font-weight:700;color:var(--app-text,#1a2035);line-height:1.3;margin-bottom:3px;">${escapeHtml(material.label)}</div>
                                    <div style="display:flex;gap:6px;font-size:9px;color:var(--app-text-muted,#7a8aaa);">
                                        <span>R ${roughness}</span>
                                        <span>·</span>
                                        <span>M ${metalness}</span>
                                    </div>
                                </div>
                            </article>
                        `;
                    }).join('')}
                </div>
            </section>
        `).join('');

    panel.innerHTML = `
        <div style="height:100%;display:flex;flex-direction:column;overflow:hidden;">
            <div style="padding:12px 14px 10px;border-bottom:1px solid var(--dw-border,#e5e7eb);background:linear-gradient(180deg,rgba(212,88,10,.06),transparent);">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                    <span style="font-size:15px;font-weight:800;color:var(--app-text,#1a2035);">BIM Material Library</span>
                    <span style="font-size:10px;background:rgba(212,88,10,.12);color:#D4580A;border-radius:99px;padding:2px 8px;font-weight:700;">${STANDARD_MATERIAL_LIBRARY.length} materials</span>
                </div>
                <div style="font-size:11px;color:var(--app-text-muted,#7a8aaa);margin-bottom:8px;line-height:1.5;">
                    PBR materials for BIM authoring. Click any card to select it — the material ID can be assigned to wall layers, door finishes, and window finishes in the Element Types tab.
                </div>
                <div data-selected-material-bar style="display:none;align-items:center;gap:8px;padding:7px 10px;background:rgba(212,88,10,.08);border:1px solid rgba(212,88,10,.25);border-radius:8px;margin-bottom:8px;">
                    <div data-selected-swatch style="width:20px;height:20px;border-radius:4px;flex-shrink:0;border:1px solid rgba(0,0,0,.12);"></div>
                    <div style="flex:1;min-width:0;">
                        <div data-selected-label style="font-size:11px;font-weight:700;color:#D4580A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
                        <div data-selected-id style="font-size:9px;color:var(--app-text-muted,#7a8aaa);font-family:monospace;"></div>
                    </div>
                    <button data-clear-selection style="background:none;border:none;cursor:pointer;color:var(--app-text-muted,#7a8aaa);font-size:14px;line-height:1;padding:2px;" title="Clear selection">×</button>
                </div>
                <input data-material-search type="search" placeholder="Search concrete, oak, marble, steel, glass..." style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--dw-border,#e5e7eb);border-radius:8px;font-size:12px;background:#fff;color:var(--app-text,#1a2035);outline:none;" />
            </div>
            <div style="flex:1;overflow:auto;padding:12px 14px;">
                ${categoryMarkup}
            </div>
        </div>
    `;

    const search       = panel.querySelector('[data-material-search]') as HTMLInputElement | null;
    const selectionBar = panel.querySelector('[data-selected-material-bar]') as HTMLElement | null;
    const selSwatch    = panel.querySelector('[data-selected-swatch]') as HTMLElement | null;
    const selLabel     = panel.querySelector('[data-selected-label]') as HTMLElement | null;
    const selId        = panel.querySelector('[data-selected-id]') as HTMLElement | null;
    const clearBtn     = panel.querySelector('[data-clear-selection]') as HTMLElement | null;

    search?.addEventListener('input', () => {
        const term = search.value.trim().toLowerCase();
        panel.querySelectorAll('[data-material-card]').forEach(card => {
            const el = card as HTMLElement;
            el.style.display = !term || (el.dataset.search ?? '').includes(term) ? '' : 'none';
        });
    });

    panel.addEventListener('click', (e) => {
        const card = (e.target as HTMLElement).closest('[data-material-card]') as HTMLElement | null;
        if (!card) return;

        const id    = card.dataset.materialId ?? '';
        const color = card.dataset.materialColor ?? '#d8d8d8';
        const labelEl = card.querySelector('div[style*="font-weight:700"]') as HTMLElement | null;
        const label   = labelEl?.textContent?.trim() ?? id;

        panel.querySelectorAll('[data-material-card]').forEach(c => {
            (c as HTMLElement).style.borderColor = '';
            (c as HTMLElement).style.boxShadow   = '';
        });
        card.style.borderColor = '#D4580A';
        card.style.boxShadow   = '0 0 0 2px rgba(212,88,10,.20)';

        if (selectionBar && selSwatch && selLabel && selId) {
            selectionBar.style.display = 'flex';
            selSwatch.style.background = color;
            selLabel.textContent = label;
            selId.textContent    = id;
        }

        window.runtime?.events?.emit('pryzm-material-selected', { id, color, label, source: 'bim-library' }); // F.events.14
    });

    clearBtn?.addEventListener('click', () => {
        panel.querySelectorAll('[data-material-card]').forEach(c => {
            (c as HTMLElement).style.borderColor = '';
            (c as HTMLElement).style.boxShadow   = '';
        });
        if (selectionBar) selectionBar.style.display = 'none';
        window.runtime?.events?.emit('pryzm-material-selected', null); // F.events.14
    });
}

// ── Render Material Library ───────────────────────────────────────────────────

export function mountRenderMaterials(panel: HTMLElement): void {
    const grouped = new Map<string, typeof RENDER_MATERIAL_LIBRARY>();
    for (const material of RENDER_MATERIAL_LIBRARY) {
        const list = grouped.get(material.category) ?? [];
        list.push(material);
        grouped.set(material.category, list);
    }

    const categoryMarkup = Array.from(grouped.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, materials]) => `
            <section style="margin-bottom:20px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin:0 0 10px;">
                    <h4 style="margin:0;font-size:11px;letter-spacing:.09em;text-transform:uppercase;font-weight:800;color:var(--app-text,#1a2035);">${escapeHtml(category)}</h4>
                    <span style="font-size:10px;color:var(--app-text-muted,#7a8aaa);">${materials.length}</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;">
                    ${materials.map(material => {
                        const color    = formatMaterialColor(material.params.color);
                        const roughness = typeof material.params.roughness === 'number' ? material.params.roughness.toFixed(2) : '—';
                        const metalness = typeof material.params.metalness === 'number' ? material.params.metalness.toFixed(2) : '—';
                        const envMap   = typeof (material.params as any).envMapIntensity === 'number' ? (material.params as any).envMapIntensity.toFixed(1) : '—';
                        return `
                            <article
                                data-render-card
                                data-search="${escapeHtml(`${material.label} ${material.category} ${material.id}`.toLowerCase())}"
                                title="${escapeHtml(material.id)}"
                                style="border:1.5px solid var(--dw-border,#e5e7eb);border-radius:10px;background:var(--app-panel,#fff);overflow:hidden;"
                            >
                                <div style="height:44px;background:${color};background:linear-gradient(135deg,${color},color-mix(in srgb,${color} 70%,#fff));position:relative;">
                                    <div style="position:absolute;bottom:4px;right:5px;font-size:9px;background:rgba(0,0,0,.4);color:#fff;border-radius:4px;padding:1px 5px;font-weight:700;">HDR</div>
                                </div>
                                <div style="padding:8px 9px;">
                                    <div style="font-size:11px;font-weight:700;color:var(--app-text,#1a2035);line-height:1.3;margin-bottom:3px;">${escapeHtml(material.label)}</div>
                                    <div style="display:flex;gap:4px;font-size:9px;color:var(--app-text-muted,#7a8aaa);">
                                        <span>R ${roughness}</span>
                                        <span>·</span>
                                        <span>M ${metalness}</span>
                                        <span>·</span>
                                        <span>E ${envMap}</span>
                                    </div>
                                    <div style="font-size:9px;color:var(--app-text-muted,#7a8aaa);margin-top:2px;font-family:monospace;">${escapeHtml(material.id)}</div>
                                </div>
                            </article>
                        `;
                    }).join('')}
                </div>
            </section>
        `).join('');

    panel.innerHTML = `
        <div style="height:100%;display:flex;flex-direction:column;overflow:hidden;">
            <div style="padding:12px 14px 10px;border-bottom:1px solid var(--dw-border,#e5e7eb);background:linear-gradient(180deg,rgba(212,88,10,.06),transparent);">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                    <span style="font-size:15px;font-weight:800;color:var(--app-text,#1a2035);">Render Material Library</span>
                    <span style="font-size:10px;background:rgba(212,88,10,.12);color:#D4580A;border-radius:99px;padding:2px 8px;font-weight:700;">${RENDER_MATERIAL_LIBRARY.length} materials</span>
                </div>
                <div style="font-size:11px;color:var(--app-text-muted,#7a8aaa);margin-bottom:8px;line-height:1.5;">
                    High-fidelity PBR materials for WebGPU path-traced renders. These definitions use enhanced envMapIntensity and tighter roughness/metalness values for physically accurate light response.
                </div>
                <input data-render-search type="search" placeholder="Search concrete, steel, glass, wood..." style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--dw-border,#e5e7eb);border-radius:8px;font-size:12px;background:#fff;color:var(--app-text,#1a2035);outline:none;" />
            </div>
            <div style="flex:1;overflow:auto;padding:12px 14px;">
                ${categoryMarkup}
            </div>
        </div>
    `;

    const search = panel.querySelector('[data-render-search]') as HTMLInputElement | null;
    search?.addEventListener('input', () => {
        const term = search.value.trim().toLowerCase();
        panel.querySelectorAll('[data-render-card]').forEach(card => {
            const el = card as HTMLElement;
            el.style.display = !term || (el.dataset.search ?? '').includes(term) ? '' : 'none';
        });
    });
}

// ── Element Types panel ───────────────────────────────────────────────────────

export function mountElementTypes(panel: HTMLElement): void {
    const wallTypes = wallSystemTypeStore.getAll();
    const doorTypes = doorSystemTypeStore.getAll();
    const winTypes  = windowSystemTypeStore.getAll();

    const wallSection = `
        <section data-group="Wall Types" style="margin-bottom:18px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <h4 style="margin:0;font-size:11px;letter-spacing:.09em;text-transform:uppercase;font-weight:800;color:var(--app-text,#1a2035);">Wall Types</h4>
                <span style="font-size:10px;color:var(--app-text-muted,#7a8aaa);">${wallTypes.length} types</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
                ${wallTypes.map(t => {
                    const isBuiltIn = wallSystemTypeStore.isBuiltIn(t.id);
                    return `
                    <article data-type-row data-search="${escapeHtml(`wall types ${t.name} ${t.id} wall assembly`.toLowerCase())}"
                        style="border:1px solid var(--dw-border,#e5e7eb);border-radius:10px;background:var(--app-panel,#fff);overflow:hidden;">
                        <div style="display:flex;align-items:center;gap:8px;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--dw-border,#e5e7eb);">
                            <div>
                                <div style="font-size:12px;font-weight:700;color:var(--app-text,#1a2035);">${escapeHtml(t.name)}</div>
                                <div style="font-size:10px;color:var(--app-text-muted,#7a8aaa);">${escapeHtml(t.id)} · ${t.layers.length} layers · ${formatMetres(t.totalThickness)}</div>
                            </div>
                            <span style="font-size:10px;border:1px solid var(--dw-border,#e5e7eb);border-radius:999px;padding:2px 7px;color:var(--app-text-muted,#7a8aaa);white-space:nowrap;flex-shrink:0;">${isBuiltIn ? 'built-in' : 'custom'}</span>
                        </div>
                        <div style="padding:8px 12px;display:flex;flex-direction:column;gap:6px;">
                            ${t.layers.map((layer, li) => `
                                <div style="display:flex;align-items:center;gap:8px;">
                                    <div style="width:14px;height:14px;border-radius:3px;flex-shrink:0;border:1px solid rgba(0,0,0,.1);background:${escapeHtml(layer.materialColor ?? '#d8d8d8')};" data-layer-swatch="${escapeHtml(t.id)}-${li}"></div>
                                    <div style="flex:1;min-width:0;">
                                        <div style="font-size:11px;font-weight:600;color:var(--app-text,#1a2035);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(layer.name)}</div>
                                        <div style="font-size:9px;color:var(--app-text-muted,#7a8aaa);">${escapeHtml(layer.function)} · ${formatMetres(layer.thickness)}</div>
                                    </div>
                                    ${buildMaterialSelect(layer.materialId, { 'wall-type': t.id, 'layer-index': String(li) }, isBuiltIn)}
                                </div>
                            `).join('')}
                        </div>
                    </article>`;
                }).join('')}
            </div>
        </section>
    `;

    const doorSection = `
        <section data-group="Door Types" style="margin-bottom:18px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <h4 style="margin:0;font-size:11px;letter-spacing:.09em;text-transform:uppercase;font-weight:800;color:var(--app-text,#1a2035);">Door Types</h4>
                <span style="font-size:10px;color:var(--app-text-muted,#7a8aaa);">${doorTypes.length} types</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
                ${doorTypes.map(t => `
                    <article data-type-row data-search="${escapeHtml(`door types ${t.name} ${t.id} ${t.category}`.toLowerCase())}"
                        style="border:1px solid var(--dw-border,#e5e7eb);border-radius:10px;background:var(--app-panel,#fff);overflow:hidden;">
                        <div style="display:flex;align-items:center;gap:8px;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--dw-border,#e5e7eb);">
                            <div>
                                <div style="font-size:12px;font-weight:700;color:var(--app-text,#1a2035);">${escapeHtml(t.name)}</div>
                                <div style="font-size:10px;color:var(--app-text-muted,#7a8aaa);">${escapeHtml(t.id)} · ${escapeHtml(t.category)} · glazing ${t.glazingOpacity === 1 ? 'solid' : t.glazingOpacity.toFixed(1)}</div>
                            </div>
                            <span style="font-size:10px;border:1px solid var(--dw-border,#e5e7eb);border-radius:999px;padding:2px 7px;color:var(--app-text-muted,#7a8aaa);white-space:nowrap;flex-shrink:0;">${t.isBuiltIn ? 'built-in' : 'custom'}</span>
                        </div>
                        <div style="padding:8px 12px;display:flex;flex-direction:column;gap:6px;">
                            <div style="display:flex;align-items:center;gap:8px;">
                                <div style="width:14px;height:14px;border-radius:3px;flex-shrink:0;border:1px solid rgba(0,0,0,.1);background:${escapeHtml(t.frameFinish.materialColor)};" data-door-frame-swatch="${escapeHtml(t.id)}"></div>
                                <div style="flex:1;min-width:0;">
                                    <div style="font-size:11px;font-weight:600;color:var(--app-text,#1a2035);">Frame Finish</div>
                                    <div style="font-size:9px;color:var(--app-text-muted,#7a8aaa);">${escapeHtml(t.frameFinish.name)}</div>
                                </div>
                                ${buildMaterialSelect(t.frameFinish.materialId, { 'door-type': t.id, 'finish': 'frame' })}
                            </div>
                            <div style="display:flex;align-items:center;gap:8px;">
                                <div style="width:14px;height:14px;border-radius:3px;flex-shrink:0;border:1px solid rgba(0,0,0,.1);background:${escapeHtml(t.leafFinish.materialColor)};" data-door-leaf-swatch="${escapeHtml(t.id)}"></div>
                                <div style="flex:1;min-width:0;">
                                    <div style="font-size:11px;font-weight:600;color:var(--app-text,#1a2035);">Leaf Finish</div>
                                    <div style="font-size:9px;color:var(--app-text-muted,#7a8aaa);">${escapeHtml(t.leafFinish.name)}</div>
                                </div>
                                ${buildMaterialSelect(t.leafFinish.materialId, { 'door-type': t.id, 'finish': 'leaf' })}
                            </div>
                        </div>
                    </article>
                `).join('')}
            </div>
        </section>
    `;

    const winSection = `
        <section data-group="Window Types" style="margin-bottom:18px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <h4 style="margin:0;font-size:11px;letter-spacing:.09em;text-transform:uppercase;font-weight:800;color:var(--app-text,#1a2035);">Window Types</h4>
                <span style="font-size:10px;color:var(--app-text-muted,#7a8aaa);">${winTypes.length} types</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
                ${winTypes.map(t => `
                    <article data-type-row data-search="${escapeHtml(`window types ${t.name} ${t.id} ${t.category}`.toLowerCase())}"
                        style="border:1px solid var(--dw-border,#e5e7eb);border-radius:10px;background:var(--app-panel,#fff);overflow:hidden;">
                        <div style="display:flex;align-items:center;gap:8px;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--dw-border,#e5e7eb);">
                            <div>
                                <div style="font-size:12px;font-weight:700;color:var(--app-text,#1a2035);">${escapeHtml(t.name)}</div>
                                <div style="font-size:10px;color:var(--app-text-muted,#7a8aaa);">${escapeHtml(t.id)} · ${escapeHtml(t.category)}</div>
                            </div>
                            <span style="font-size:10px;border:1px solid var(--dw-border,#e5e7eb);border-radius:999px;padding:2px 7px;color:var(--app-text-muted,#7a8aaa);white-space:nowrap;flex-shrink:0;">${t.isBuiltIn ? 'built-in' : 'custom'}</span>
                        </div>
                        <div style="padding:8px 12px;display:flex;flex-direction:column;gap:6px;">
                            <div style="display:flex;align-items:center;gap:8px;">
                                <div style="width:14px;height:14px;border-radius:3px;flex-shrink:0;border:1px solid rgba(0,0,0,.1);background:${escapeHtml(t.frameFinish.materialColor)};" data-win-frame-swatch="${escapeHtml(t.id)}"></div>
                                <div style="flex:1;min-width:0;">
                                    <div style="font-size:11px;font-weight:600;color:var(--app-text,#1a2035);">Frame Finish</div>
                                    <div style="font-size:9px;color:var(--app-text-muted,#7a8aaa);">${escapeHtml(t.frameFinish.name)}</div>
                                </div>
                                ${buildMaterialSelect(t.frameFinish.materialId, { 'win-type': t.id, 'finish': 'frame' })}
                            </div>
                            <div style="display:flex;align-items:center;gap:8px;">
                                <div style="width:14px;height:14px;border-radius:3px;flex-shrink:0;border:1px solid rgba(0,0,0,.1);background:${escapeHtml(t.sillFinish.materialColor)};" data-win-sill-swatch="${escapeHtml(t.id)}"></div>
                                <div style="flex:1;min-width:0;">
                                    <div style="font-size:11px;font-weight:600;color:var(--app-text,#1a2035);">Sill Finish</div>
                                    <div style="font-size:9px;color:var(--app-text-muted,#7a8aaa);">${escapeHtml(t.sillFinish.name)}</div>
                                </div>
                                ${buildMaterialSelect(t.sillFinish.materialId, { 'win-type': t.id, 'finish': 'sill' })}
                            </div>
                        </div>
                    </article>
                `).join('')}
            </div>
        </section>
    `;

    const otherRows: Array<{ group: string; name: string; id: string; category: string; details: string }> = [];
    BUILT_IN_STAIR_TYPES.forEach(t => otherRows.push({ group: 'Stair Types', name: t.id, id: t.id, category: 'stair assembly', details: `${t.defaults.material} · ${t.defaults.stringerType} stringer · target riser ${formatMetres(t.rules.targetRiserHeight)}` }));
    floorSystemTypeStore.getAll().forEach(t => otherRows.push({ group: 'Floor Types', name: (t as any).name ?? t.id, id: t.id, category: String((t as any).category ?? 'floor finish'), details: `${t.layers.length} layers · ${formatMetres(t.totalThickness)} total` }));
    slabSystemTypeStore.getAll().forEach(t => otherRows.push({ group: 'Slab Types', name: (t as any).name ?? t.id, id: t.id, category: 'structural slab', details: `${t.layers.length} layers · ${formatMetres(t.totalThickness)} total` }));
    ceilingSystemTypeStore.getAll().forEach(t => otherRows.push({ group: 'Ceiling Types', name: (t as any).name ?? t.id, id: t.id, category: String(t.category), details: `${t.layers.length} layers · ${formatMetres(t.totalThickness)} total` }));
    handrailTypeStore.getAll().forEach(t => otherRows.push({ group: 'Handrail Types', name: (t as any).name ?? t.id, id: t.id, category: t.fillType, details: `${formatMetres(t.height)} high · ${t.railProfile} rail` }));
    SteelProfileLibrary.UC.forEach(t => otherRows.push({ group: 'Column Types', name: `UC ${t.name}`, id: `UC-${t.name}`, category: 'universal column', details: `${t.D}×${t.B}mm · ${t.mass} kg/m` }));
    SteelProfileLibrary.UB.forEach(t => otherRows.push({ group: 'Beam Types', name: `UB ${t.name}`, id: `UB-${t.name}`, category: 'universal beam', details: `${t.D}×${t.B}mm · ${t.mass} kg/m` }));
    ([
        ['roof-flat-warm',      'Flat Roof · Warm Deck',   'insulated flat roof', 'Single-ply membrane over insulation'],
        ['roof-flat-inverted',  'Flat Roof · Inverted',    'inverted roof',       'Ballast / paving over insulation'],
        ['roof-pitched-gable',  'Pitched Roof · Gable',   'pitched roof',        'Two-slope roof with ridge'],
        ['roof-pitched-hip',    'Pitched Roof · Hip',     'pitched roof',        'Four-slope roof with hips'],
        ['roof-shed-mono',      'Shed Roof · Mono Pitch', 'mono-pitch roof',     'Single sloping roof plane'],
        ['roof-mansard',        'Mansard Roof',           'complex roof',        'Dual-pitch roof with steep lower slopes'],
        ['roof-butterfly',      'Butterfly Roof',         'complex roof',        'Inverted V roof with central valley'],
        ['roof-barrel-vault',   'Barrel Vault Roof',      'curved roof',         'Arched roof profile'],
        ['roof-green-sedum',    'Green Roof · Sedum',     'planted roof',        'Extensive sedum build-up'],
    ] as [string, string, string, string][]).forEach(([id, name, category, details]) =>
        otherRows.push({ group: 'Roof Types', id, name, category, details })
    );

    const otherGroups   = Array.from(new Set(otherRows.map(r => r.group)));
    const otherSections = otherGroups.map(group => {
        const groupRows = otherRows.filter(r => r.group === group);
        return `
            <section data-group="${escapeHtml(group)}" style="margin-bottom:18px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                    <h4 style="margin:0;font-size:11px;letter-spacing:.09em;text-transform:uppercase;font-weight:800;color:var(--app-text,#1a2035);">${escapeHtml(group)}</h4>
                    <span style="font-size:10px;color:var(--app-text-muted,#7a8aaa);">${groupRows.length}</span>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                    ${groupRows.map(row => `
                        <article data-type-row data-search="${escapeHtml(`${row.group} ${row.name} ${row.id} ${row.category}`.toLowerCase())}"
                            style="padding:9px 12px;border:1px solid var(--dw-border,#e5e7eb);border-radius:8px;background:var(--app-panel,#fff);">
                            <div style="font-size:11px;font-weight:700;color:var(--app-text,#1a2035);">${escapeHtml(row.name)}</div>
                            <div style="font-size:10px;color:var(--app-text-muted,#7a8aaa);margin-top:2px;">${escapeHtml(row.category)} · ${escapeHtml(row.details)}</div>
                        </article>
                    `).join('')}
                </div>
            </section>
        `;
    }).join('');

    const totalCount = wallTypes.length + doorTypes.length + winTypes.length + otherRows.length;

    panel.innerHTML = `
        <div style="height:100%;display:flex;flex-direction:column;overflow:hidden;">
            <div style="padding:12px 14px 10px;border-bottom:1px solid var(--dw-border,#e5e7eb);background:linear-gradient(180deg,rgba(212,88,10,.06),transparent);">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                    <span style="font-size:15px;font-weight:800;color:var(--app-text,#1a2035);">Element Types</span>
                    <span style="font-size:10px;background:rgba(212,88,10,.12);color:#D4580A;border-radius:99px;padding:2px 8px;font-weight:700;">${totalCount} types</span>
                </div>
                <div style="font-size:11px;color:var(--app-text-muted,#7a8aaa);margin-bottom:8px;line-height:1.5;">
                    Wall layers, door finishes, and window finishes have material pickers linked to the BIM Material Library. Custom types are editable; built-in types are read-only.
                </div>
                <input data-type-search type="search" placeholder="Search wall, door, window, stair, UC, roof..." style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--dw-border,#e5e7eb);border-radius:8px;font-size:12px;background:#fff;color:var(--app-text,#1a2035);outline:none;" />
            </div>
            <div style="flex:1;overflow:auto;padding:12px 14px;">
                ${wallSection}
                ${doorSection}
                ${winSection}
                ${otherSections}
            </div>
        </div>
    `;

    const search = panel.querySelector('[data-type-search]') as HTMLInputElement | null;
    search?.addEventListener('input', () => {
        const term = search.value.trim().toLowerCase();
        panel.querySelectorAll('section[data-group]').forEach(sec => {
            const el   = sec as HTMLElement;
            const rows = el.querySelectorAll('[data-type-row]');
            let anyVisible = false;
            rows.forEach(row => {
                const r    = row as HTMLElement;
                const show = !term || (r.dataset.search ?? '').includes(term);
                r.style.display = show ? '' : 'none';
                if (show) anyVisible = true;
            });
            el.style.display = anyVisible ? '' : 'none';
        });
    });

    panel.addEventListener('change', (e) => {
        const sel = (e.target as HTMLElement);
        if (!sel.matches('[data-material-select]')) return;
        const el         = sel as HTMLSelectElement;
        const materialId = el.value;
        const libEntry   = STANDARD_MATERIAL_LIBRARY.find(m => m.id === materialId);
        const newColor   = libEntry ? formatMaterialColor(libEntry.params.color) : null;

        if (el.dataset.wallType && el.dataset.layerIndex !== undefined) {
            const typeId   = el.dataset.wallType;
            const layerIdx = parseInt(el.dataset.layerIndex, 10);
            const wType    = wallSystemTypeStore.getAll().find(t => t.id === typeId);
            if (wType && !wallSystemTypeStore.isBuiltIn(typeId)) {
                const newLayers = wType.layers.map((l, i) => i === layerIdx
                    ? { ...l, materialId: materialId || undefined, ...(newColor ? { materialColor: newColor } : {}) }
                    : l
                );
                wallSystemTypeStore.update(typeId, { layers: newLayers });
                if (newColor) {
                    const swatch = panel.querySelector(`[data-layer-swatch="${CSS.escape(typeId)}-${layerIdx}"]`) as HTMLElement | null;
                    if (swatch) swatch.style.background = newColor;
                }
                console.log(`[ElementTypes] Wall ${typeId} layer ${layerIdx} → ${materialId}`);
            }
        }

        if (el.dataset.doorType && el.dataset.finish) {
            const typeId  = el.dataset.doorType;
            const finish  = el.dataset.finish as 'frame' | 'leaf';
            const dType   = doorSystemTypeStore.getAll().find(t => t.id === typeId);
            if (dType) {
                const finishKey = finish === 'frame' ? 'frameFinish' : 'leafFinish';
                const current   = dType[finishKey];
                doorSystemTypeStore.update(typeId, {
                    [finishKey]: { ...current, materialId: materialId || undefined, ...(newColor ? { materialColor: newColor } : {}) }
                });
                if (newColor) {
                    const swatchAttr = finish === 'frame' ? `[data-door-frame-swatch="${CSS.escape(typeId)}"]` : `[data-door-leaf-swatch="${CSS.escape(typeId)}"]`;
                    const swatch = panel.querySelector(swatchAttr) as HTMLElement | null;
                    if (swatch) swatch.style.background = newColor;
                }
                console.log(`[ElementTypes] Door ${typeId} ${finish}Finish → ${materialId}`);
            }
        }

        if (el.dataset.winType && el.dataset.finish) {
            const typeId  = el.dataset.winType;
            const finish  = el.dataset.finish as 'frame' | 'sill';
            const wType   = windowSystemTypeStore.getAll().find(t => t.id === typeId);
            if (wType) {
                const finishKey = finish === 'frame' ? 'frameFinish' : 'sillFinish';
                const current   = wType[finishKey];
                windowSystemTypeStore.update(typeId, {
                    [finishKey]: { ...current, materialId: materialId || undefined, ...(newColor ? { materialColor: newColor } : {}) }
                });
                if (newColor) {
                    const swatchAttr = finish === 'frame' ? `[data-win-frame-swatch="${CSS.escape(typeId)}"]` : `[data-win-sill-swatch="${CSS.escape(typeId)}"]`;
                    const swatch = panel.querySelector(swatchAttr) as HTMLElement | null;
                    if (swatch) swatch.style.background = newColor;
                }
                console.log(`[ElementTypes] Window ${typeId} ${finish}Finish → ${materialId}`);
            }
        }
    });

    // F.events.14 — pryzm-material-selected migrated from DOM CustomEvent to runtime.events.
    window.runtime?.events?.on('pryzm-material-selected', (detail: { id: string; color: string; label: string; source: string } | null) => {
        if (!detail) return;
        panel.querySelectorAll('[data-material-select]').forEach(el => {
            const s = el as HTMLSelectElement;
            if (!s.value) {
                s.style.borderColor = '#D4580A';
                s.title = `Material "${detail.id}" ready to apply — select this dropdown to assign`;
            }
        });
    });
}
