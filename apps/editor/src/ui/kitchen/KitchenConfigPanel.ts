/**
 * @file KitchenConfigPanel.ts
 *
 * Floating configuration panel shown when a kitchen cabinet layout is active.
 * Provides inputs for depth, main-arm length, height, unit count, and (for
 * L/U layouts) arm lengths + arm unit counts.  Also exposes material selectors
 * for carcass body, door/drawer fronts, and countertop.
 *
 * The panel is appended to document.body and positioned at a fixed location.
 *
 * Contract:
 *  §05 §7.6 — styles are inline or use CSS custom props only.
 *  No external libraries.
 */

import { KitchenCabinetTool } from './KitchenCabinetTool';
import { KitchenLayoutType, KitchenUnitFront, KITCHEN_DEFAULTS } from '@pryzm/geometry-furniture';
import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';

const FRONT_OPTIONS: Array<{ value: KitchenUnitFront; label: string }> = [
    { value: 'door',              label: 'Door' },
    { value: 'glass_door',        label: 'Glass Door' },
    { value: 'framed_glass_door', label: 'Framed Glass Door' },
    { value: 'drawers',           label: 'Drawers' },
    { value: 'shelf',             label: 'Open Shelf' },
    { value: 'none',              label: 'Blank Panel' },
];

type FieldSpec = {
    id:    string;
    label: string;
    min:   number;
    max:   number;
    step:  number;
    unit:  string;
    key:   string;
    show?: (layout: KitchenLayoutType) => boolean;
};

function isArmLayout(l: KitchenLayoutType): boolean {
    return l === 'kitchen_l_shape' || l === 'kitchen_u_shape'
        || l === 'kitchen_l_shape_tall' || l === 'kitchen_u_shape_tall';
}
function isULayout(l: KitchenLayoutType): boolean {
    return l === 'kitchen_u_shape' || l === 'kitchen_u_shape_tall';
}

const FIELDS: FieldSpec[] = [
    { id: 'kcp-depth',  label: 'Cabinet Depth',    min: 0.30, max: 1.00, step: 0.05, unit: 'm', key: 'depth' },
    { id: 'kcp-length', label: 'Main Arm Length',  min: 0.60, max: 12.0, step: 0.30, unit: 'm', key: 'length' },
    { id: 'kcp-height', label: 'Base Height',      min: 0.60, max: 1.20, step: 0.05, unit: 'm', key: 'height' },
    { id: 'kcp-units',  label: 'Main Units',       min: 1,    max: 20,   step: 1,    unit: '',   key: 'numUnits' },
    { id: 'kcp-lleft',  label: 'Left Arm Length',  min: 0.60, max: 6.0,  step: 0.30, unit: 'm', key: 'lengthLeft',
      show: isArmLayout },
    { id: 'kcp-uleft',  label: 'Left Arm Units',   min: 1,    max: 10,   step: 1,    unit: '',   key: 'numUnitsLeft',
      show: isArmLayout },
    { id: 'kcp-lright', label: 'Right Arm Length', min: 0.60, max: 6.0,  step: 0.30, unit: 'm', key: 'lengthRight',
      show: isULayout },
    { id: 'kcp-uright', label: 'Right Arm Units',  min: 1,    max: 10,   step: 1,    unit: '',   key: 'numUnitsRight',
      show: isULayout },
    { id: 'kcp-upper-h', label: 'Upper Cabinet H', min: 0.40, max: 1.00, step: 0.05, unit: 'm', key: 'upperCabinetHeight',
      show: l => l === 'kitchen_straight_tall' || l === 'kitchen_l_shape_tall' || l === 'kitchen_u_shape_tall' },
    { id: 'kcp-upper-d', label: 'Upper Cabinet Depth', min: 0.20, max: 0.60, step: 0.05, unit: 'm', key: 'upperCabinetDepth',
      show: l => l === 'kitchen_straight_tall' || l === 'kitchen_l_shape_tall' || l === 'kitchen_u_shape_tall' },
    { id: 'kcp-upper-gap', label: 'Upper Start Gap', min: 0.20, max: 0.80, step: 0.05, unit: 'm', key: 'upperCabinetGap',
      show: l => l === 'kitchen_straight_tall' || l === 'kitchen_l_shape_tall' || l === 'kitchen_u_shape_tall' },
];

const DEFAULTS: Record<string, number> = {
    depth:              KITCHEN_DEFAULTS.depth,
    length:             KITCHEN_DEFAULTS.length,
    height:             KITCHEN_DEFAULTS.height,
    numUnits:           KITCHEN_DEFAULTS.numUnits,
    lengthLeft:         1.80,
    numUnitsLeft:       3,
    lengthRight:        1.80,
    numUnitsRight:      3,
    upperCabinetHeight: KITCHEN_DEFAULTS.upperCabinetHeight,
    upperCabinetDepth:  KITCHEN_DEFAULTS.upperCabinetDepth,
    upperCabinetGap:    KITCHEN_DEFAULTS.upperCabinetGap,
};

const LAYOUT_LABELS: Record<KitchenLayoutType, string> = {
    kitchen_straight:      'Straight Run',
    kitchen_l_shape:       'L-Shape Run',
    kitchen_u_shape:       'U-Shape Run',
    kitchen_island:        'Kitchen Island',
    kitchen_straight_tall: 'Straight + Wall Cabinets',
    kitchen_l_shape_tall:  'L-Shape + Wall Cabinets',
    kitchen_u_shape_tall:  'U-Shape + Wall Cabinets',
};

export class KitchenConfigPanel {

    private _panel: HTMLElement | null = null;
    private _activeLayout: KitchenLayoutType | null = null;
    private _values: Record<string, number> = { ...DEFAULTS };

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(private readonly _tool: KitchenCabinetTool, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;}

    mount(container: HTMLElement): void {
        if (this._panel) return;
        this._panel = this._build();
        container.appendChild(this._panel);
        this.hide();
    }

    show(layout: KitchenLayoutType): void {
        this._activeLayout = layout;
        if (!this._panel) return;
        this._refresh();
        this._panel.style.display = 'flex';
    }

    hide(): void {
        this._activeLayout = null;
        if (this._panel) this._panel.style.display = 'none';
    }

    // ── DOM ──────────────────────────────────────────────────────────────────

    private _build(): HTMLElement {
        const panel = document.createElement('div');
        panel.id = 'kitchen-config-panel';
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
            min-width: 220px;
            font-family: var(--app-font, system-ui);
            pointer-events: auto;
        `;

        // Title row
        const titleRow = document.createElement('div');
        titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';

        const title = document.createElement('div');
        title.id = 'kcp-title';
        title.style.cssText = 'font-size:12px;font-weight:700;color:var(--app-text,#1a1a1a);';
        titleRow.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '×';
        closeBtn.style.cssText = 'background:none;border:none;font-size:18px;cursor:pointer;color:var(--app-text-muted,#999);line-height:1;padding:0 4px;';
        closeBtn.addEventListener('click', () => {
            this._tool.deactivate();
            this.hide();
        });
        titleRow.appendChild(closeBtn);
        panel.appendChild(titleRow);

        // Hint
        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:9px;color:var(--app-text-muted,#888);line-height:1.4;';
        hint.textContent = 'Click on the floor to place. Press R to rotate, Esc to cancel.';
        panel.appendChild(hint);

        // Divider
        const div1 = document.createElement('div');
        div1.style.cssText = 'border-top:1px solid var(--app-border,#eee);margin:2px 0;';
        panel.appendChild(div1);

        // Dimension fields
        for (const field of FIELDS) {
            const row = this._buildField(field);
            row.id = `${field.id}-row`;
            panel.appendChild(row);
        }

        // Default front-type selector (applies to every unit; user can re-tab
        // each unit individually after placement).
        panel.appendChild(this._buildDefaultFrontField());

        // Material divider
        const div2 = document.createElement('div');
        div2.style.cssText = 'border-top:1px solid var(--app-border,#eee);margin:2px 0;';
        panel.appendChild(div2);

        // Material label
        const matLabel = document.createElement('div');
        matLabel.style.cssText = 'font-size:9px;font-weight:700;color:var(--app-text-muted,#888);text-transform:uppercase;letter-spacing:0.06em;';
        matLabel.textContent = 'Materials';
        panel.appendChild(matLabel);

        panel.appendChild(this._buildMaterialField('kcp-carcass-material', 'Carcass Body',
            ['Wood', 'Timber Engineered', 'Paint & Coating', 'Metal', 'Specialty Surfaces'],
            v => this._tool.updateConfig({ carcassMaterialId: v || undefined }),
        ));
        panel.appendChild(this._buildMaterialField('kcp-front-material', 'Door / Front',
            ['Wood', 'Timber Engineered', 'Paint & Coating', 'Metal', 'Glass', 'Specialty Surfaces'],
            v => this._tool.updateConfig({ frontMaterialId: v || undefined }),
            'wood-oak',
        ));
        panel.appendChild(this._buildCountertopMaterialField());

        return panel;
    }

    private _buildField(field: FieldSpec): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-direction:column;gap:2px;';

        const labelEl = document.createElement('label');
        labelEl.htmlFor = field.id;
        labelEl.style.cssText = 'font-size:9px;font-weight:600;color:var(--app-text-muted,#888);text-transform:uppercase;letter-spacing:0.04em;';
        labelEl.textContent = field.label;
        row.appendChild(labelEl);

        const inputRow = document.createElement('div');
        inputRow.style.cssText = 'display:flex;align-items:center;gap:6px;';

        const input = document.createElement('input');
        input.type  = 'range';
        input.id    = field.id;
        input.min   = String(field.min);
        input.max   = String(field.max);
        input.step  = String(field.step);
        input.value = String(this._values[field.key] ?? DEFAULTS[field.key]);
        input.style.cssText = 'flex:1;accent-color:var(--app-accent,#6600ff);cursor:pointer;';

        const badge = document.createElement('span');
        badge.id = `${field.id}-badge`;
        badge.style.cssText = 'font-size:10px;font-weight:600;color:var(--app-text,#333);white-space:nowrap;min-width:36px;text-align:right;';
        this._updateBadge(badge, field, this._values[field.key] ?? DEFAULTS[field.key]);

        input.addEventListener('input', () => {
            const val = parseFloat(input.value);
            this._values[field.key] = val;
            this._updateBadge(badge, field, val);
            this._dispatch();
        });

        inputRow.appendChild(input);
        inputRow.appendChild(badge);
        row.appendChild(inputRow);
        return row;
    }

    private _updateBadge(badge: HTMLElement, field: FieldSpec, val: number): void {
        if (field.unit === '') {
            badge.textContent = String(Math.round(val));
        } else {
            badge.textContent = `${val.toFixed(2)}${field.unit}`;
        }
    }

    private _buildMaterialField(
        selectId: string,
        labelText: string,
        categories: string[],
        onChange: (value: string) => void,
        defaultValue = '',
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
        defaultOpt.textContent = '– custom colour –';
        select.appendChild(defaultOpt);

        for (const m of STANDARD_MATERIAL_LIBRARY.filter(m => categories.includes(m.category))) {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.label;
            select.appendChild(opt);
        }

        select.addEventListener('change', () => onChange(select.value));

        // Pre-select the default value and propagate it to the tool config
        if (defaultValue) {
            select.value = defaultValue;
            onChange(defaultValue);
        }

        row.appendChild(select);
        return row;
    }

    private _buildDefaultFrontField(): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-direction:column;gap:3px;';

        const label = document.createElement('label');
        label.htmlFor = 'kcp-default-front';
        label.textContent = 'Default Cabinet Front';
        label.style.cssText = 'font-size:9px;font-weight:600;color:var(--app-text-muted,#888);text-transform:uppercase;letter-spacing:0.04em;';
        row.appendChild(label);

        const select = document.createElement('select');
        select.id = 'kcp-default-front';
        select.style.cssText = 'font-size:10px;padding:5px 6px;border:1px solid var(--app-border,#ddd);border-radius:6px;background:var(--app-surface,#f8f8f8);color:var(--app-text,#1a1a1a);';

        for (const opt of FRONT_OPTIONS) {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            select.appendChild(o);
        }
        select.value = 'door';

        select.addEventListener('change', () => {
            this._tool.setDefaultFront(select.value as KitchenUnitFront);
        });

        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:9px;color:var(--app-text-muted,#888);line-height:1.4;';
        hint.textContent = 'Override per unit after placement.';

        row.appendChild(select);
        row.appendChild(hint);
        return row;
    }

    private _buildCountertopMaterialField(): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-direction:column;gap:3px;';

        const label = document.createElement('label');
        label.htmlFor = 'kcp-countertop-material';
        label.textContent = 'Countertop';
        label.style.cssText = 'font-size:9px;font-weight:600;color:var(--app-text-muted,#888);text-transform:uppercase;letter-spacing:0.04em;';
        row.appendChild(label);

        const select = document.createElement('select');
        select.id = 'kcp-countertop-material';
        select.style.cssText = 'font-size:10px;padding:5px 6px;border:1px solid var(--app-border,#ddd);border-radius:6px;background:var(--app-surface,#f8f8f8);color:var(--app-text,#1a1a1a);';

        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '– custom colour –';
        select.appendChild(defaultOpt);

        for (const m of STANDARD_MATERIAL_LIBRARY.filter(m => ['Stone', 'Ceramic & Tile', 'Wood', 'Timber Engineered', 'Metal', 'Specialty Surfaces'].includes(m.category))) {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.label;
            select.appendChild(opt);
        }

        select.addEventListener('change', () => {
            this._tool.updateConfig({ countertopMaterialId: select.value || undefined });
        });

        // Default to white marble and propagate immediately
        select.value = 'stone-marble-white';
        this._tool.updateConfig({ countertopMaterialId: 'stone-marble-white' });

        row.appendChild(select);

        return row;
    }

    private _refresh(): void {
        if (!this._panel) return;

        // Update title
        const title = this._panel.querySelector('#kcp-title') as HTMLElement | null;
        if (title && this._activeLayout) {
            title.textContent = LAYOUT_LABELS[this._activeLayout] ?? 'Kitchen';
        }

        // Show/hide conditional fields
        for (const field of FIELDS) {
            if (!field.show) continue;
            const row = this._panel.querySelector(`#${field.id}-row`) as HTMLElement | null;
            if (!row) continue;
            const visible = this._activeLayout ? field.show(this._activeLayout) : false;
            row.style.display = visible ? 'flex' : 'none';
        }

        // Sync input values
        for (const field of FIELDS) {
            const input = this._panel.querySelector(`#${field.id}`) as HTMLInputElement | null;
            const badge = this._panel.querySelector(`#${field.id}-badge`) as HTMLElement | null;
            if (input && badge) {
                const val = this._values[field.key] ?? DEFAULTS[field.key];
                input.value = String(val);
                this._updateBadge(badge, field, val);
            }
        }
    }

    private _dispatch(): void {
        if (!this._activeLayout) return;

        const isTall   = this._activeLayout.endsWith('_tall');
        const isL = this._activeLayout === 'kitchen_l_shape' || this._activeLayout === 'kitchen_u_shape'
                 || this._activeLayout === 'kitchen_l_shape_tall' || this._activeLayout === 'kitchen_u_shape_tall';
        const isU = this._activeLayout === 'kitchen_u_shape' || this._activeLayout === 'kitchen_u_shape_tall';
        const numLeft  = isL ? (this._values.numUnitsLeft  ?? 3) : 0;
        const numRight = isU ? (this._values.numUnitsRight ?? 3) : 0;

        this._tool.updateConfig({
            depth:              this._values.depth,
            length:             this._values.length,
            height:             this._values.height,
            numUnits:           Math.round(this._values.numUnits),
            lengthLeft:         numLeft  > 0 ? this._values.lengthLeft  : undefined,
            numUnitsLeft:       numLeft  > 0 ? Math.round(numLeft)      : undefined,
            lengthRight:        numRight > 0 ? this._values.lengthRight : undefined,
            numUnitsRight:      numRight > 0 ? Math.round(numRight)     : undefined,
            ...(isTall ? {
                upperCabinetHeight: this._values.upperCabinetHeight,
                upperCabinetDepth:  this._values.upperCabinetDepth,
                upperCabinetGap:    this._values.upperCabinetGap,
            } : {}),
        });
    }
}
