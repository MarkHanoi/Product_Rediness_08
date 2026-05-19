/**
 * @file KitchenRunInspector.ts
 *
 * Post-placement inspector panel for editing the global properties of a
 * placed kitchen cabinet run (all layout types including island).
 *
 * Shown when a kitchen furniture item is selected in the scene.
 * Hidden when anything else is selected.
 *
 * Editable properties:
 *   - Cabinet depth, main arm length, total height, unit count
 *   - Left / right arm length + count (L / U shapes only)
 *   - Upper cabinet height + gap (tall layouts only)
 *   - Carcass material, door/front material, countertop material
 *
 * Changes are committed only when the "Apply Changes" button is clicked,
 * which fires a single UpdateFurnitureParametersCommand with all pending values.
 *
 * Contract:
 *  §01 §2  — writes via commands only.
 *  §05 §7.6 — inline styles / CSS custom properties only.
 */

import { KitchenLayoutType, KitchenCabinetConfig, mergeUnits } from '@pryzm/geometry-furniture';
import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';

type SliderSpec = {
    id:    string;
    label: string;
    key:   string;
    min:   number;
    max:   number;
    step:  number;
    unit:  string;
    show?: (layout: KitchenLayoutType) => boolean;
};

function isArmLayout(l: KitchenLayoutType): boolean {
    return l === 'kitchen_l_shape' || l === 'kitchen_u_shape'
        || l === 'kitchen_l_shape_tall' || l === 'kitchen_u_shape_tall';
}
function isULayout(l: KitchenLayoutType): boolean {
    return l === 'kitchen_u_shape' || l === 'kitchen_u_shape_tall';
}
function isTallLayout(l: KitchenLayoutType): boolean {
    return l === 'kitchen_straight_tall' || l === 'kitchen_l_shape_tall' || l === 'kitchen_u_shape_tall';
}

const SLIDERS: SliderSpec[] = [
    { id: 'kri-depth',     label: 'Cabinet Depth',    key: 'depth',              min: 0.30, max: 1.00, step: 0.05, unit: 'm' },
    { id: 'kri-length',    label: 'Main Arm Length',  key: 'length',             min: 0.60, max: 12.0, step: 0.30, unit: 'm' },
    { id: 'kri-height',    label: 'Base Height',      key: 'height',             min: 0.60, max: 1.20, step: 0.05, unit: 'm' },
    { id: 'kri-units',     label: 'Main Units',       key: 'numUnits',           min: 1,    max: 20,   step: 1,    unit: '' },
    { id: 'kri-lleft',     label: 'Left Arm Length',  key: 'lengthLeft',         min: 0.60, max: 6.0,  step: 0.30, unit: 'm',
      show: isArmLayout },
    { id: 'kri-uleft',     label: 'Left Arm Units',   key: 'numUnitsLeft',       min: 1,    max: 10,   step: 1,    unit: '',
      show: isArmLayout },
    { id: 'kri-lright',    label: 'Right Arm Length', key: 'lengthRight',        min: 0.60, max: 6.0,  step: 0.30, unit: 'm',
      show: isULayout },
    { id: 'kri-uright',    label: 'Right Arm Units',  key: 'numUnitsRight',      min: 1,    max: 10,   step: 1,    unit: '',
      show: isULayout },
    { id: 'kri-upper-h',   label: 'Upper Cabinet H',     key: 'upperCabinetHeight', min: 0.40, max: 1.00, step: 0.05, unit: 'm',
      show: isTallLayout },
    { id: 'kri-upper-d',   label: 'Upper Cabinet Depth', key: 'upperCabinetDepth',  min: 0.20, max: 0.60, step: 0.05, unit: 'm',
      show: isTallLayout },
    { id: 'kri-upper-gap', label: 'Upper Start Gap',     key: 'upperCabinetGap',    min: 0.20, max: 0.80, step: 0.05, unit: 'm',
      show: isTallLayout },
];

const LAYOUT_LABELS: Record<KitchenLayoutType, string> = {
    kitchen_straight:      'Straight Run',
    kitchen_l_shape:       'L-Shape',
    kitchen_u_shape:       'U-Shape',
    kitchen_island:        'Island',
    kitchen_straight_tall: 'Straight + Wall Cabinets',
    kitchen_l_shape_tall:  'L-Shape + Wall Cabinets',
    kitchen_u_shape_tall:  'U-Shape + Wall Cabinets',
};

// ── KitchenRunInspector ───────────────────────────────────────────────────────

export class KitchenRunInspector {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }


    private _panel:       HTMLElement | null = null;
    private _furnitureId: string | null      = null;
    private _pending:     Record<string, number | string> = {};

    mount(container: HTMLElement): void {
        if (this._panel) return;
        this._panel = this._build();
        container.appendChild(this._panel);
        this.hide();
    }

    show(furnitureId: string): void {
        this._furnitureId = furnitureId;
        this._pending = {};
        if (!this._panel) return;
        this._refresh();
        this._panel.style.display = 'flex';
    }

    hide(): void {
        this._furnitureId = null;
        this._pending = {};
        if (this._panel) this._panel.style.display = 'none';
    }

    isVisible(): boolean {
        return this._panel?.style.display !== 'none' && this._furnitureId !== null;
    }

    // ── DOM ───────────────────────────────────────────────────────────────────

    private _build(): HTMLElement {
        const panel = document.createElement('div');
        panel.id = 'kitchen-run-inspector';
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
        title.id = 'kri-title';
        title.style.cssText = 'font-size:12px;font-weight:700;color:var(--app-text,#1a1a1a);';
        hdr.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '×';
        closeBtn.style.cssText = 'background:none;border:none;font-size:18px;cursor:pointer;color:var(--app-text-muted,#999);line-height:1;padding:0 4px;';
        closeBtn.addEventListener('click', () => this.hide());
        hdr.appendChild(closeBtn);
        panel.appendChild(hdr);

        // Tab hint
        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:9px;color:var(--app-text-muted,#888);line-height:1.4;';
        hint.textContent = 'Adjust values then click Apply. Press Tab to select individual units.';
        panel.appendChild(hint);

        const div1 = document.createElement('div');
        div1.style.cssText = 'border-top:1px solid var(--app-border,#eee);margin:2px 0;';
        panel.appendChild(div1);

        // Dimension sliders
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
            transition: opacity 0.15s;
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

        panel.appendChild(this._buildMaterialSelect('kri-carcass-material', 'Carcass Body',
            ['Wood', 'Timber Engineered', 'Paint & Coating', 'Metal', 'Specialty Surfaces'],
            v => { this._pending['carcassMaterialId'] = v; },
        ));
        panel.appendChild(this._buildMaterialSelect('kri-front-material', 'Door / Front',
            ['Wood', 'Timber Engineered', 'Paint & Coating', 'Metal', 'Glass', 'Specialty Surfaces'],
            v => { this._pending['frontMaterialId'] = v; },
        ));
        panel.appendChild(this._buildMaterialSelect('kri-countertop-material', 'Countertop',
            ['Stone', 'Ceramic & Tile', 'Wood', 'Timber Engineered', 'Metal', 'Specialty Surfaces'],
            v => { this._pending['countertopMaterialId'] = v; },
        ));

        // Apply materials button (at bottom)
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

    // ── Refresh (sync from store) ─────────────────────────────────────────────

    private _refresh(): void {
        if (!this._panel || !this._furnitureId) return;
        const store = window.furnitureStore; // TODO(E.furniture.S): legacy furnitureStore — replace with runtime.stores.furniture
        const fd: any = store?.get(this._furnitureId);
        if (!fd?.kitchenConfig) return;

        const cfg: KitchenCabinetConfig = fd.kitchenConfig;
        const layout = cfg.layoutType;

        // Title
        const title = this._panel.querySelector('#kri-title') as HTMLElement | null;
        if (title) title.textContent = LAYOUT_LABELS[layout] ?? 'Kitchen';

        // Show/hide arm fields
        for (const spec of SLIDERS) {
            if (!spec.show) continue;
            const row = this._panel.querySelector(`#${spec.id}-row`) as HTMLElement | null;
            if (row) row.style.display = spec.show(layout) ? 'flex' : 'none';
        }

        // Sync slider values — also seed pending with current values
        for (const spec of SLIDERS) {
            const input = this._panel.querySelector(`#${spec.id}`) as HTMLInputElement | null;
            const badge = this._panel.querySelector(`#${spec.id}-badge`) as HTMLElement | null;
            if (!input || !badge) continue;
            const raw = (cfg as any)[spec.key] ?? null;
            if (raw === null) continue;
            const val = Number(raw);
            input.value = String(val);
            badge.textContent = spec.unit === '' ? String(Math.round(val)) : `${val.toFixed(2)}${spec.unit}`;
            // Pre-seed pending so Apply without touching sliders still works
            this._pending[spec.key] = spec.unit === '' ? Math.round(val) : val;
        }

        // Sync material selects
        const selects: [string, keyof KitchenCabinetConfig][] = [
            ['kri-carcass-material',   'carcassMaterialId'],
            ['kri-front-material',     'frontMaterialId'],
            ['kri-countertop-material','countertopMaterialId'],
        ];
        for (const [selId, cfgKey] of selects) {
            const sel = this._panel.querySelector(`#${selId}`) as HTMLSelectElement | null;
            if (sel) {
                const val = (cfg as any)[cfgKey] ?? '';
                sel.value = val;
                this._pending[cfgKey as string] = val;
            }
        }
    }

    // ── Apply all pending changes via command ─────────────────────────────────

    private _readSlider(id: string, fallback: number, isInt = false): number {
        const input = this._panel?.querySelector(`#${id}`) as HTMLInputElement | null;
        if (!input) return fallback;
        const v = parseFloat(input.value);
        if (!isFinite(v)) return fallback;
        return isInt ? Math.round(v) : v;
    }

    private _readSelect(id: string, fallback: string): string {
        const sel = this._panel?.querySelector(`#${id}`) as HTMLSelectElement | null;
        return sel?.value ?? fallback;
    }

    private _applyAll(): void {
        if (!this._furnitureId) return;
        const store = window.furnitureStore; // TODO(E.furniture.S): legacy furnitureStore — replace with runtime.stores.furniture
        if (!store) return;
        const fd: any = store.get(this._furnitureId);
        if (!fd?.kitchenConfig) return;

        const base: KitchenCabinetConfig = fd.kitchenConfig;

        // Read directly from DOM sliders for reliable values (avoids stale _pending state)
        const newDepth    = this._readSlider('kri-depth',    base.depth);
        const newLength   = this._readSlider('kri-length',   base.length);
        const newHeight   = this._readSlider('kri-height',   base.height);
        const newNumUnits = this._readSlider('kri-units',    base.numUnits, true);

        const newLengthLeft   = this._readSlider('kri-lleft',  base.lengthLeft   ?? 1.80);
        const newNumLeft      = this._readSlider('kri-uleft',  base.numUnitsLeft  ?? 3, true);
        const newLengthRight  = this._readSlider('kri-lright', base.lengthRight  ?? 1.80);
        const newNumRight     = this._readSlider('kri-uright', base.numUnitsRight ?? 3, true);
        const newUpperH       = this._readSlider('kri-upper-h',   base.upperCabinetHeight ?? 0.70);
        const newUpperD       = this._readSlider('kri-upper-d',   base.upperCabinetDepth  ?? 0.35);
        const newUpperGap     = this._readSlider('kri-upper-gap', base.upperCabinetGap    ?? 0.45);

        const rawCarcass      = this._readSelect('kri-carcass-material',   base.carcassMaterialId   ?? '');
        const rawFront        = this._readSelect('kri-front-material',     base.frontMaterialId     ?? '');
        const rawCountertop   = this._readSelect('kri-countertop-material', base.countertopMaterialId ?? '');

        const isArmLayout = base.layoutType === 'kitchen_l_shape' || base.layoutType === 'kitchen_u_shape'
            || base.layoutType === 'kitchen_l_shape_tall' || base.layoutType === 'kitchen_u_shape_tall';
        const isULayout   = base.layoutType === 'kitchen_u_shape' || base.layoutType === 'kitchen_u_shape_tall';

        // Rebuild units array to stay consistent with new counts (preserving existing configs)
        const updatedUnits = mergeUnits(
            base.units ?? [],
            newNumUnits,
            isArmLayout ? newNumLeft  : 0,
            isULayout   ? newNumRight : 0,
        );

        const newKitchenConfig: KitchenCabinetConfig = {
            ...base,
            depth:    newDepth,
            length:   newLength,
            height:   newHeight,
            numUnits: newNumUnits,
            lengthLeft:   isArmLayout ? newLengthLeft  : base.lengthLeft,
            numUnitsLeft: isArmLayout ? newNumLeft      : base.numUnitsLeft,
            lengthRight:  isULayout   ? newLengthRight  : base.lengthRight,
            numUnitsRight: isULayout  ? newNumRight     : base.numUnitsRight,
            upperCabinetHeight: newUpperH,
            upperCabinetDepth:  newUpperD,
            upperCabinetGap:    newUpperGap,
            carcassMaterialId:   rawCarcass    || base.carcassMaterialId,
            frontMaterialId:     rawFront      || base.frontMaterialId,
            countertopMaterialId: rawCountertop || base.countertopMaterialId,
            units: updatedUnits,
        };

        console.log('[KitchenRunInspector] Applying config:', {
            length: newLength, depth: newDepth, height: newHeight, numUnits: newNumUnits,
        });

        (window as any).runtime?.bus?.executeCommand('furniture.updateParameters', {
            id:            this._furnitureId,
            width:         newKitchenConfig.length,
            length:        newKitchenConfig.depth,
            height:        newKitchenConfig.height,
            kitchenConfig: newKitchenConfig,
        });

        // Refresh panel to reflect new state
        setTimeout(() => this._refresh(), 120);
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
export const kitchenRunInspector = new KitchenRunInspector();
