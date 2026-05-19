/**
 * @file WardrobeConfigPanel.ts
 *
 * Floating configuration panel shown when a wardrobe cabinet layout is active.
 * Provides inputs for depth, main-arm length, height, section count, and (for
 * L/U layouts) arm lengths + arm section counts.  Also exposes material selectors
 * for carcass body and door/front panels.
 *
 * Contract:
 *  §05 §7.6 — styles are inline or use CSS custom props only.
 *  No external libraries.
 */

import { WardrobeCabinetTool } from './WardrobeCabinetTool';
import { WardrobeLayoutType, WARDROBE_CABINET_DEFAULTS } from '@pryzm/geometry-furniture';
import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';

type FieldSpec = {
    id:    string;
    label: string;
    min:   number;
    max:   number;
    step:  number;
    unit:  string;
    key:   string;
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

const FIELDS: FieldSpec[] = [
    { id: 'wcp-depth',     label: 'Cabinet Depth',       min: 0.40, max: 0.80, step: 0.05, unit: 'm', key: 'depth' },
    { id: 'wcp-length',    label: 'Main Run Length',      min: 0.60, max: 8.00, step: 0.30, unit: 'm', key: 'length' },
    { id: 'wcp-height',    label: 'Main Height',          min: 1.80, max: 2.80, step: 0.10, unit: 'm', key: 'height' },
    { id: 'wcp-sections',  label: 'Main Sections',        min: 1,    max: 12,   step: 1,    unit: '',   key: 'numSections' },
    { id: 'wcp-lleft',     label: 'Left Arm Length',      min: 0.60, max: 4.00, step: 0.30, unit: 'm', key: 'lengthLeft',
      show: isArmLayout },
    { id: 'wcp-uleft',     label: 'Left Arm Sections',    min: 1,    max: 8,    step: 1,    unit: '',   key: 'numSectionsLeft',
      show: isArmLayout },
    { id: 'wcp-lright',    label: 'Right Arm Length',     min: 0.60, max: 4.00, step: 0.30, unit: 'm', key: 'lengthRight',
      show: isULayout },
    { id: 'wcp-uright',    label: 'Right Arm Sections',   min: 1,    max: 8,    step: 1,    unit: '',   key: 'numSectionsRight',
      show: isULayout },
    { id: 'wcp-topmod',    label: 'Top Module Height',    min: 0.20, max: 0.80, step: 0.05, unit: 'm', key: 'topModuleHeight',
      show: isTallLayout },
];

const DEFAULTS: Record<string, number> = {
    depth:             WARDROBE_CABINET_DEFAULTS.depth,
    length:            WARDROBE_CABINET_DEFAULTS.length,
    height:            WARDROBE_CABINET_DEFAULTS.height,
    numSections:       WARDROBE_CABINET_DEFAULTS.numSections,
    lengthLeft:        1.20,
    numSectionsLeft:   2,
    lengthRight:       1.20,
    numSectionsRight:  2,
    topModuleHeight:   WARDROBE_CABINET_DEFAULTS.topModuleHeight,
};

const LAYOUT_LABELS: Record<WardrobeLayoutType, string> = {
    wardrobe_straight:      'Straight Wardrobe',
    wardrobe_l_shape:       'L-Shape Wardrobe',
    wardrobe_u_shape:       'Walk-In (U-Shape)',
    wardrobe_straight_tall: 'Straight + Top Module',
    wardrobe_l_shape_tall:  'L-Shape + Top Module',
    wardrobe_u_shape_tall:  'Walk-In + Top Module',
};

export class WardrobeConfigPanel {

    private _panel:       HTMLElement | null = null;
    private _activeLayout: WardrobeLayoutType | null = null;
    private _values:      Record<string, number> = { ...DEFAULTS };

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(private readonly _tool: WardrobeCabinetTool, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;}

    mount(container: HTMLElement): void {
        if (this._panel) return;
        this._panel = this._build();
        container.appendChild(this._panel);
        this.hide();
    }

    show(layout: WardrobeLayoutType): void {
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
        panel.id = 'wardrobe-config-panel';
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
        title.id = 'wcp-title';
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

        // Dimension sliders
        for (const field of FIELDS) {
            const row = this._buildField(field);
            row.id = `${field.id}-row`;
            panel.appendChild(row);
        }

        // Material divider
        const div2 = document.createElement('div');
        div2.style.cssText = 'border-top:1px solid var(--app-border,#eee);margin:2px 0;';
        panel.appendChild(div2);

        const matLabel = document.createElement('div');
        matLabel.style.cssText = 'font-size:9px;font-weight:700;color:var(--app-text-muted,#888);text-transform:uppercase;letter-spacing:0.06em;';
        matLabel.textContent = 'Materials';
        panel.appendChild(matLabel);

        panel.appendChild(this._buildMaterialField(
            'wcp-carcass-material', 'Carcass Body',
            ['Wood', 'Timber Engineered', 'Paint & Coating', 'Metal', 'Specialty Surfaces'],
            v => this._tool.updateConfig({ carcassMaterialId: v || undefined }),
        ));
        panel.appendChild(this._buildMaterialField(
            'wcp-front-material', 'Door / Front',
            ['Wood', 'Timber Engineered', 'Paint & Coating', 'Metal', 'Glass', 'Specialty Surfaces'],
            v => this._tool.updateConfig({ frontMaterialId: v || undefined }),
        ));

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
        selectId:   string,
        labelText:  string,
        categories: string[],
        onChange:   (value: string) => void,
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
        defaultOpt.textContent = '– default colour –';
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

    private _refresh(): void {
        if (!this._panel) return;

        const title = this._panel.querySelector('#wcp-title') as HTMLElement | null;
        if (title && this._activeLayout) {
            title.textContent = LAYOUT_LABELS[this._activeLayout] ?? 'Wardrobe';
        }

        for (const field of FIELDS) {
            if (!field.show) continue;
            const row = this._panel.querySelector(`#${field.id}-row`) as HTMLElement | null;
            if (!row) continue;
            const visible = this._activeLayout ? field.show(this._activeLayout) : false;
            row.style.display = visible ? 'flex' : 'none';
        }

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

        const isL = isArmLayout(this._activeLayout);
        const isU = isULayout(this._activeLayout);
        const isTall = isTallLayout(this._activeLayout);

        const numLeft  = isL ? (this._values.numSectionsLeft  ?? 2) : 0;
        const numRight = isU ? (this._values.numSectionsRight ?? 2) : 0;

        this._tool.updateConfig({
            depth:             this._values.depth,
            length:            this._values.length,
            height:            this._values.height,
            numSections:       Math.round(this._values.numSections),
            lengthLeft:        numLeft  > 0 ? this._values.lengthLeft  : undefined,
            numSectionsLeft:   numLeft  > 0 ? Math.round(numLeft)      : undefined,
            lengthRight:       numRight > 0 ? this._values.lengthRight : undefined,
            numSectionsRight:  numRight > 0 ? Math.round(numRight)     : undefined,
            ...(isTall ? { topModuleHeight: this._values.topModuleHeight } : {}),
        });
    }
}
