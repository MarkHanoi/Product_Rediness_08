/**
 * @file WardrobeRunInspector.ts
 *
 * Post-placement inspector panel for editing the global properties of a
 * placed wardrobe cabinet run (all layout types).
 *
 * Shown when a wardrobe furniture item is selected in the scene.
 * Hidden when anything else is selected.
 *
 * Editable properties:
 *   - Depth, main run length, height, section count
 *   - Left / right arm length + count (L / U shapes only)
 *   - Top module height (tall layouts only)
 *
 * Changes are committed only when the "Apply Changes" button is clicked,
 * which updates wardrobeCabinetConfig on the store and triggers a geometry rebuild.
 *
 * Contract:
 *  §05 §7.6 — inline styles / CSS custom properties only.
 */

import { WardrobeLayoutType, WardrobeCabinetConfig } from '@pryzm/geometry-furniture';
import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';

type SliderSpec = {
    id:    string;
    label: string;
    key:   string;
    min:   number;
    max:   number;
    step:  number;
    unit:  string;
    show?: (layout: WardrobeLayoutType) => boolean;
};

function isArmLayout(l: WardrobeLayoutType): boolean {
    return l === 'wardrobe_l_shape' || l === 'wardrobe_u_shape'
        || l === 'wardrobe_l_shape_tall' || l === 'wardrobe_u_shape_tall';
}
function isULayout(l: WardrobeLayoutType): boolean {
    return l === 'wardrobe_u_shape' || l === 'wardrobe_u_shape_tall';
}
function isTallLayout(l: WardrobeLayoutType): boolean {
    return l === 'wardrobe_straight_tall' || l === 'wardrobe_l_shape_tall' || l === 'wardrobe_u_shape_tall';
}

const SLIDERS: SliderSpec[] = [
    { id: 'wri-depth',    label: 'Cabinet Depth',     key: 'depth',            min: 0.40, max: 0.80, step: 0.05, unit: 'm' },
    { id: 'wri-length',   label: 'Main Run Length',   key: 'length',           min: 0.60, max: 8.00, step: 0.30, unit: 'm' },
    { id: 'wri-height',   label: 'Main Height',       key: 'height',           min: 1.80, max: 2.80, step: 0.10, unit: 'm' },
    { id: 'wri-sections', label: 'Main Sections',     key: 'numSections',      min: 1,    max: 12,   step: 1,    unit: '' },
    { id: 'wri-lleft',    label: 'Left Arm Length',   key: 'lengthLeft',       min: 0.60, max: 4.00, step: 0.30, unit: 'm',
      show: isArmLayout },
    { id: 'wri-uleft',    label: 'Left Arm Sections', key: 'numSectionsLeft',  min: 1,    max: 8,    step: 1,    unit: '',
      show: isArmLayout },
    { id: 'wri-lright',   label: 'Right Arm Length',  key: 'lengthRight',      min: 0.60, max: 4.00, step: 0.30, unit: 'm',
      show: isULayout },
    { id: 'wri-uright',   label: 'Right Arm Sections',key: 'numSectionsRight', min: 1,    max: 8,    step: 1,    unit: '',
      show: isULayout },
    { id: 'wri-topmod',   label: 'Top Module Height', key: 'topModuleHeight',  min: 0.20, max: 0.80, step: 0.05, unit: 'm',
      show: isTallLayout },
];

const LAYOUT_LABELS: Record<WardrobeLayoutType, string> = {
    wardrobe_straight:      'Straight Wardrobe',
    wardrobe_l_shape:       'L-Shape',
    wardrobe_u_shape:       'Walk-In',
    wardrobe_straight_tall: 'Straight + Top Module',
    wardrobe_l_shape_tall:  'L-Shape + Top Module',
    wardrobe_u_shape_tall:  'Walk-In + Top Module',
};

// ── WardrobeRunInspector ──────────────────────────────────────────────────────

export class WardrobeRunInspector {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }


    private _panel:       HTMLElement | null = null;
    private _furnitureId: string | null      = null;
    private _pending:     Record<string, number> = {};
    private _pendingMat:  Record<string, string> = {};

    mount(container: HTMLElement): void {
        if (this._panel) return;
        this._panel = this._build();
        container.appendChild(this._panel);
        this.hide();
    }

    show(furnitureId: string): void {
        this._furnitureId = furnitureId;
        this._pending = {};
        this._pendingMat = {};
        if (!this._panel) return;
        this._refresh();
        this._panel.style.display = 'flex';
    }

    hide(): void {
        this._furnitureId = null;
        this._pending = {};
        this._pendingMat = {};
        if (this._panel) this._panel.style.display = 'none';
    }

    isVisible(): boolean {
        return this._panel?.style.display !== 'none' && this._furnitureId !== null;
    }

    // ── DOM ───────────────────────────────────────────────────────────────────

    private _build(): HTMLElement {
        const panel = document.createElement('div');
        panel.id = 'wardrobe-run-inspector';
        panel.style.cssText = `
            position: fixed;
            top: 50%;
            right: 16px;
            transform: translateY(-50%);
            background: var(--app-bg, #ffffff);
            border: 1px solid var(--app-border, #e0e0e0);
            border-radius: 12px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.15);
            padding: 14px 16px;
            z-index: 850;
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-width: 240px;
            font-family: var(--app-font, system-ui);
            pointer-events: auto;
        `;

        // Header
        const hdr = document.createElement('div');
        hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';

        const title = document.createElement('div');
        title.id = 'wri-title';
        title.style.cssText = 'font-size:12px;font-weight:700;color:var(--app-text,#1a1a1a);';
        hdr.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '×';
        closeBtn.style.cssText = 'background:none;border:none;font-size:18px;cursor:pointer;color:var(--app-text-muted,#999);line-height:1;padding:0 4px;';
        closeBtn.addEventListener('click', () => this.hide());
        hdr.appendChild(closeBtn);
        panel.appendChild(hdr);

        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:9px;color:var(--app-text-muted,#888);line-height:1.4;';
        hint.textContent = 'Adjust values then click Apply. Click a section to configure its interior.';
        panel.appendChild(hint);

        const div1 = document.createElement('div');
        div1.style.cssText = 'border-top:1px solid var(--app-border,#eee);margin:2px 0;';
        panel.appendChild(div1);

        for (const spec of SLIDERS) {
            const row = this._buildSlider(spec);
            row.id = `${spec.id}-row`;
            panel.appendChild(row);
        }

        // Apply button
        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.textContent = 'Apply Changes';
        applyBtn.style.cssText = `
            margin-top: 4px;
            padding: 8px 12px;
            background: var(--app-accent, #6600ff);
            color: #fff;
            border: none;
            border-radius: 8px;
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
            width: 100%;
            letter-spacing: 0.03em;
        `;
        applyBtn.addEventListener('mouseenter', () => { applyBtn.style.opacity = '0.85'; });
        applyBtn.addEventListener('mouseleave', () => { applyBtn.style.opacity = '1'; });
        applyBtn.addEventListener('click', () => this._applyAll());
        panel.appendChild(applyBtn);

        const div2 = document.createElement('div');
        div2.style.cssText = 'border-top:1px solid var(--app-border,#eee);margin:2px 0;';
        panel.appendChild(div2);

        const matLbl = document.createElement('div');
        matLbl.style.cssText = 'font-size:9px;font-weight:700;color:var(--app-text-muted,#888);text-transform:uppercase;letter-spacing:0.06em;';
        matLbl.textContent = 'Materials';
        panel.appendChild(matLbl);

        panel.appendChild(this._buildMaterialSelect('wri-carcass-material', 'Carcass Body',
            ['Wood', 'Timber Engineered', 'Paint & Coating', 'Metal', 'Specialty Surfaces'],
            v => { this._pendingMat['carcassMaterialId'] = v; },
        ));
        panel.appendChild(this._buildMaterialSelect('wri-front-material', 'Door / Front',
            ['Wood', 'Timber Engineered', 'Paint & Coating', 'Metal', 'Glass', 'Specialty Surfaces'],
            v => { this._pendingMat['frontMaterialId'] = v; },
        ));

        const applyMatBtn = document.createElement('button');
        applyMatBtn.type = 'button';
        applyMatBtn.textContent = 'Apply Materials';
        applyMatBtn.style.cssText = `
            padding: 6px 12px;
            background: var(--app-surface, #f3f0ff);
            color: var(--app-accent, #6600ff);
            border: 1px solid var(--app-accent, #6600ff);
            border-radius: 8px;
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
            width: 100%;
            letter-spacing: 0.03em;
        `;
        applyMatBtn.addEventListener('click', () => this._applyAll());
        panel.appendChild(applyMatBtn);

        return panel;
    }

    private _buildMaterialSelect(
        selectId:   string,
        labelText:  string,
        categories: string[],
        onChange:   (val: string) => void,
    ): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-direction:column;gap:3px;';

        const label = document.createElement('label');
        label.htmlFor = selectId;
        label.textContent = labelText;
        label.style.cssText = 'font-size:9px;font-weight:600;color:var(--app-text-muted,#888);text-transform:uppercase;letter-spacing:0.04em;';
        row.appendChild(label);

        const select = document.createElement('select');
        select.id = selectId;
        select.style.cssText = 'font-size:10px;padding:5px 6px;border:1px solid var(--app-border,#ddd);border-radius:6px;background:var(--app-surface,#f8f8f8);color:var(--app-text,#1a1a1a);';

        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '– default –';
        select.appendChild(defaultOpt);

        for (const m of STANDARD_MATERIAL_LIBRARY.filter(m => categories.includes(m.category))) {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.label;
            select.appendChild(opt);
        }

        select.addEventListener('change', () => onChange(select.value));
        row.appendChild(select);
        return row;
    }

    private _buildSlider(spec: SliderSpec): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-direction:column;gap:2px;';

        const labelEl = document.createElement('label');
        labelEl.htmlFor = spec.id;
        labelEl.style.cssText = 'font-size:9px;font-weight:600;color:var(--app-text-muted,#888);text-transform:uppercase;letter-spacing:0.04em;';
        labelEl.textContent = spec.label;
        row.appendChild(labelEl);

        const inputRow = document.createElement('div');
        inputRow.style.cssText = 'display:flex;align-items:center;gap:6px;';

        const input = document.createElement('input');
        input.type = 'range';
        input.id   = spec.id;
        input.min  = String(spec.min);
        input.max  = String(spec.max);
        input.step = String(spec.step);
        input.style.cssText = 'flex:1;accent-color:var(--app-accent,#6600ff);cursor:pointer;';

        const badge = document.createElement('span');
        badge.id = `${spec.id}-badge`;
        badge.style.cssText = 'font-size:10px;font-weight:600;color:var(--app-text,#333);white-space:nowrap;min-width:40px;text-align:right;';

        input.addEventListener('input', () => {
            const val = parseFloat(input.value);
            badge.textContent = spec.unit === '' ? String(Math.round(val)) : `${val.toFixed(2)}${spec.unit}`;
            this._pending[spec.key] = spec.unit === '' ? Math.round(val) : val;
        });

        inputRow.appendChild(input);
        inputRow.appendChild(badge);
        row.appendChild(inputRow);
        return row;
    }

    // ── Refresh ───────────────────────────────────────────────────────────────

    private _refresh(): void {
        if (!this._panel || !this._furnitureId) return;
        const store = window.furnitureStore; // TODO(E.furniture.S): legacy furnitureStore — replace with runtime.stores.furniture
        const fd: any = store?.get(this._furnitureId);
        if (!fd?.wardrobeCabinetConfig) return;

        const cfg: WardrobeCabinetConfig = fd.wardrobeCabinetConfig;
        const layout = cfg.layoutType;

        const title = this._panel.querySelector('#wri-title') as HTMLElement | null;
        if (title) title.textContent = LAYOUT_LABELS[layout] ?? 'Wardrobe';

        for (const spec of SLIDERS) {
            if (!spec.show) continue;
            const row = this._panel.querySelector(`#${spec.id}-row`) as HTMLElement | null;
            if (row) row.style.display = spec.show(layout) ? 'flex' : 'none';
        }

        for (const spec of SLIDERS) {
            const input = this._panel.querySelector(`#${spec.id}`) as HTMLInputElement | null;
            const badge = this._panel.querySelector(`#${spec.id}-badge`) as HTMLElement | null;
            if (!input || !badge) continue;
            const raw = (cfg as any)[spec.key] ?? null;
            if (raw === null) continue;
            const val = Number(raw);
            input.value = String(val);
            badge.textContent = spec.unit === '' ? String(Math.round(val)) : `${val.toFixed(2)}${spec.unit}`;
            this._pending[spec.key] = spec.unit === '' ? Math.round(val) : val;
        }

        // Sync material selects
        const selects: [string, keyof WardrobeCabinetConfig][] = [
            ['wri-carcass-material', 'carcassMaterialId'],
            ['wri-front-material',   'frontMaterialId'],
        ];
        for (const [selId, cfgKey] of selects) {
            const sel = this._panel.querySelector(`#${selId}`) as HTMLSelectElement | null;
            if (sel) {
                const val = (cfg as any)[cfgKey] ?? '';
                sel.value = val;
                this._pendingMat[cfgKey as string] = val;
            }
        }
    }

    // ── Apply ─────────────────────────────────────────────────────────────────

    private _applyAll(): void {
        if (!this._furnitureId) return;
        const store = window.furnitureStore; // TODO(E.furniture.S): legacy furnitureStore — replace with runtime.stores.furniture
        if (!store) return;
        const fd: any = store.get(this._furnitureId);
        if (!fd?.wardrobeCabinetConfig) return;

        const base: WardrobeCabinetConfig = fd.wardrobeCabinetConfig;

        const rawCarcass = this._pendingMat['carcassMaterialId'] ?? base.carcassMaterialId ?? '';
        const rawFront   = this._pendingMat['frontMaterialId']   ?? base.frontMaterialId   ?? '';

        const newCfg: WardrobeCabinetConfig = {
            ...base,
            depth:            Number(this._pending['depth']           ?? base.depth),
            length:           Number(this._pending['length']          ?? base.length),
            height:           Number(this._pending['height']          ?? base.height),
            numSections:      Math.round(Number(this._pending['numSections'] ?? base.numSections)),
            lengthLeft:       this._pending['lengthLeft']       !== undefined ? Number(this._pending['lengthLeft'])       : base.lengthLeft,
            numSectionsLeft:  this._pending['numSectionsLeft']  !== undefined ? Math.round(Number(this._pending['numSectionsLeft']))  : base.numSectionsLeft,
            lengthRight:      this._pending['lengthRight']      !== undefined ? Number(this._pending['lengthRight'])      : base.lengthRight,
            numSectionsRight: this._pending['numSectionsRight'] !== undefined ? Math.round(Number(this._pending['numSectionsRight'])) : base.numSectionsRight,
            topModuleHeight:  this._pending['topModuleHeight']  !== undefined ? Number(this._pending['topModuleHeight'])  : base.topModuleHeight,
            carcassMaterialId: rawCarcass || base.carcassMaterialId,
            frontMaterialId:   rawFront   || base.frontMaterialId,
        };

        // P6 E.5.3: bus-primary — window.commandManager removed.
        if ((window.runtime?.bus as any)?.executeCommand) {
            (window.runtime!.bus as any).executeCommand('furniture.updateParameters', {
                id:     this._furnitureId,
                width:  newCfg.length,
                length: newCfg.depth,
                height: newCfg.height,
                wardrobeCabinetConfig: newCfg,
            })?.catch((e: Error) => console.error('[WardrobeRunInspector] furniture.updateParameters failed:', e));
        } else {
            const newFd = { ...fd, wardrobeCabinetConfig: newCfg };
            store.update(this._furnitureId, newFd);
            const builder = window.furnitureFragmentBuilder; // TODO(E.furniture.S): legacy furnitureFragmentBuilder — replace with runtime.stores.furniture fragment builder
            if (builder?.updateFurniture) builder.updateFurniture(newFd);
        }

        setTimeout(() => this._refresh(), 120);
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
export const wardrobeRunInspector = new WardrobeRunInspector();
