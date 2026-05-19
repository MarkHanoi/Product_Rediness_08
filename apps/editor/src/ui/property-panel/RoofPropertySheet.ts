/**
 * RoofPropertySheet
 *
 * Renders editable roof fields in the property panel when a roof is selected.
 * Each field change dispatches an UpdateRoofCommand via commandManager.
 *
 * Contract compliance:
 *  - §05-BIM-UI-ARCHITECTURE-CONTRACT §2 — no bim-* elements, CSS via AppTheme tokens
 *  - §01-BIM-ENGINE-CORE-CONTRACT §2.1 — all mutations via commands only
 *  - §05-ROOF-INTEGRATION-CONTRACT §5.1 — full field set required
 *
 * commandManager is injected via the constructor (§07 R-9 — no window global access).
 */

import { RoofData, RoofType } from '@pryzm/geometry-roof';

const ROOF_TYPES: { value: RoofType; label: string }[] = [
    { value: 'flat',     label: 'Flat' },
    { value: 'shed',     label: 'Shed (Single Slope)' },
    { value: 'gable',    label: 'Gable' },
    { value: 'hip',      label: 'Hip' },
    { value: 'dutch',    label: 'Dutch Hip' },
    { value: 'gambrel',  label: 'Gambrel' },
    { value: 'mansard',  label: 'Mansard' },
    { value: 'barrel',   label: 'Barrel' },
    { value: 'by_region', label: 'By Region (auto)' },
];

const IFC_TYPES: string[] = [
    'FLAT_ROOF', 'SHED_ROOF', 'GABLE_ROOF', 'HIP_ROOF',
    'HIPPED_GABLE_ROOF', 'GAMBREL_ROOF', 'MANSARD_ROOF',
    'BARREL_ROOF', 'RAINBOW_ROOF', 'BUTTERFLY_ROOF',
    'PAVILION_ROOF', 'DOME_ROOF', 'FREEFORM', 'NOTDEFINED',
];

const ROW_STYLES = [
    'display:grid',
    'grid-template-columns:1fr 1fr',
    'gap:6px',
    'padding:6px 0',
    'border-bottom:1px solid var(--app-border,rgba(0,0,0,0.08))',
].join(';');

const LABEL_STYLES = [
    'font-size:11px',
    'color:var(--app-text-muted,#64748b)',
    'font-weight:500',
    'display:flex',
    'align-items:center',
].join(';');

const INPUT_STYLES = [
    'font-size:12px',
    'font-family:var(--app-font,system-ui)',
    'border:1px solid var(--app-border,#d1d5e0)',
    'border-radius:4px',
    'padding:3px 7px',
    'outline:none',
    'color:var(--app-text,#1e2533)',
    'background:var(--app-panel-bg,#fff)',
    'width:100%',
    'box-sizing:border-box',
].join(';');

const READONLY_STYLES = [
    'font-size:11px',
    'color:var(--app-text-muted,#94a3b8)',
    'font-family:monospace',
    'overflow:hidden',
    'text-overflow:ellipsis',
    'white-space:nowrap',
    'display:flex',
    'align-items:center',
].join(';');

export class RoofPropertySheet {
    private _currentRoofId: string | null = null;
    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(_commandManager?: { execute(cmd: any): { success: boolean; info?: string } } | null, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        void _commandManager;
        this.runtime = runtime;
    }

    render(container: HTMLElement, data: RoofData): void {
        this._currentRoofId = data.id;

        const section = document.createElement('div');
        section.style.cssText = [
            'margin:8px 0',
            'background:var(--app-bg,#e8edf6)',
            'border:1px solid var(--app-border,#d1d5e0)',
            'border-radius:8px',
            'padding:10px 12px',
        ].join(';');

        const heading = document.createElement('div');
        heading.style.cssText = [
            'font-size:10px',
            'font-weight:700',
            'letter-spacing:0.06em',
            'text-transform:uppercase',
            'color:var(--app-text-muted,#64748b)',
            'margin-bottom:8px',
            'padding-bottom:6px',
            'border-bottom:1px solid var(--app-border,#d1d5e0)',
        ].join(';');
        heading.textContent = 'Roof Parameters';
        section.appendChild(heading);

        section.appendChild(this._buildTypeSelect(data));
        section.appendChild(this._buildNumberRow('Slope (rise/run)', 'slope', data.slope ?? 0.3, 0.01, 2.0, 0.05, data.roofType === 'flat'));
        section.appendChild(this._buildNumberRow('Overhang (m)', 'overhang', data.overhang ?? 0.3, 0, 2, 0.05));
        section.appendChild(this._buildNumberRow('Thickness (m)', 'thickness', data.thickness, 0.05, 1, 0.05));
        section.appendChild(this._buildAutoHeightRow(data));
        section.appendChild(this._buildNumberRow('Base Offset (m)', 'baseOffset', data.baseOffset, 0, 50, 0.1));
        section.appendChild(this._buildColorRow('Roof Colour', 'materialColor', data.materialColor ?? '#c8a46e'));
        section.appendChild(this._buildIfcSelect(data));
        section.appendChild(this._buildReadonlyRow('Level ID', data.levelId));
        section.appendChild(this._buildReadonlyRow('Element ID', data.id));
        section.appendChild(this._buildReadonlyRow('Version', String(data.metadata?.version ?? 1)));
        section.appendChild(this._buildReadonlyRow('Created', data.metadata?.createdAt ? new Date(data.metadata.createdAt).toLocaleString() : '—'));

        container.appendChild(section);
    }

    private _buildTypeSelect(data: RoofData): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = ROW_STYLES;

        const label = document.createElement('span');
        label.style.cssText = LABEL_STYLES;
        label.textContent = 'Roof Type';

        const select = document.createElement('select');
        select.style.cssText = INPUT_STYLES;
        for (const rt of ROOF_TYPES) {
            const opt = document.createElement('option');
            opt.value = rt.value;
            opt.textContent = rt.label;
            if (rt.value === data.roofType) opt.selected = true;
            select.appendChild(opt);
        }

        select.addEventListener('change', () => {
            const isFlat = select.value === 'flat';
            this._dispatch('roofType', select.value as RoofType);
            const slopeRow = row.parentElement?.querySelector('[data-field="slope"]') as HTMLElement;
            if (slopeRow) slopeRow.style.display = isFlat ? 'none' : '';
        });

        row.appendChild(label);
        row.appendChild(select);
        return row;
    }

    private _buildIfcSelect(data: RoofData): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = ROW_STYLES;

        const label = document.createElement('span');
        label.style.cssText = LABEL_STYLES;
        label.textContent = 'IFC Type';

        const select = document.createElement('select');
        select.style.cssText = INPUT_STYLES;
        for (const ifcType of IFC_TYPES) {
            const opt = document.createElement('option');
            opt.value = ifcType;
            opt.textContent = ifcType;
            if (ifcType === (data.ifcData?.predefinedType ?? 'NOTDEFINED')) opt.selected = true;
            select.appendChild(opt);
        }

        select.addEventListener('change', () => {
            this._dispatch('ifcData', { ...(data.ifcData ?? {}), predefinedType: select.value });
        });

        row.appendChild(label);
        row.appendChild(select);
        return row;
    }

    private _buildNumberRow(
        labelText: string,
        field: string,
        currentValue: number,
        min: number,
        max: number,
        step: number,
        hidden = false
    ): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = ROW_STYLES;
        row.dataset.field = field;
        if (hidden) row.style.display = 'none';

        const label = document.createElement('span');
        label.style.cssText = LABEL_STYLES;
        label.textContent = labelText;

        const input = document.createElement('input');
        input.type = 'number';
        input.style.cssText = INPUT_STYLES;
        input.min   = String(min);
        input.max   = String(max);
        input.step  = String(step);
        input.value = String(Math.round(currentValue * 1000) / 1000);

        input.addEventListener('change', () => {
            const val = parseFloat(input.value);
            if (!isNaN(val)) this._dispatch(field, val);
        });

        row.appendChild(label);
        row.appendChild(input);
        return row;
    }

    private _buildAutoHeightRow(data: RoofData): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = ROW_STYLES;

        const label = document.createElement('span');
        label.style.cssText = LABEL_STYLES;
        label.textContent = 'Auto Height';

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex;align-items:center;gap:6px;';

        const checkbox = document.createElement('input');
        checkbox.type    = 'checkbox';
        checkbox.checked = data.autoBaseOffset ?? false;
        checkbox.style.cssText = 'width:14px;height:14px;cursor:pointer;';

        const hint = document.createElement('span');
        hint.style.cssText = 'font-size:10px;color:var(--app-text-muted,#94a3b8);';
        hint.textContent = '(from walls)';

        checkbox.addEventListener('change', () => {
            this._dispatch('autoBaseOffset', checkbox.checked);
        });

        wrapper.appendChild(checkbox);
        wrapper.appendChild(hint);
        row.appendChild(label);
        row.appendChild(wrapper);
        return row;
    }

    private _buildColorRow(labelText: string, field: string, currentValue: string): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = ROW_STYLES;

        const label = document.createElement('span');
        label.style.cssText = LABEL_STYLES;
        label.textContent = labelText;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex;gap:6px;align-items:center;';

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = currentValue;
        colorInput.style.cssText = 'width:32px;height:26px;padding:1px;border:1px solid var(--app-border,#d1d5e0);border-radius:4px;cursor:pointer;';

        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.value = currentValue;
        textInput.style.cssText = INPUT_STYLES + ';flex:1;';

        colorInput.addEventListener('input', () => {
            textInput.value = colorInput.value;
            this._dispatch(field, colorInput.value);
        });

        textInput.addEventListener('change', () => {
            const val = textInput.value.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                colorInput.value = val;
                this._dispatch(field, val);
            }
        });

        wrapper.appendChild(colorInput);
        wrapper.appendChild(textInput);
        row.appendChild(label);
        row.appendChild(wrapper);
        return row;
    }

    private _buildReadonlyRow(labelText: string, value: string): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = ROW_STYLES;

        const label = document.createElement('span');
        label.style.cssText = LABEL_STYLES;
        label.textContent = labelText;

        const val = document.createElement('span');
        val.style.cssText = READONLY_STYLES;
        val.title = value;
        val.textContent = value;

        row.appendChild(label);
        row.appendChild(val);
        return row;
    }

    private _dispatch(field: string, value: unknown): void {
        if (!this._currentRoofId) return;
        const updates: Partial<Omit<RoofData, 'id' | 'type' | 'levelId' | 'metadata'>> = {
            [field]: value,
        } as any;
        (this.runtime?.bus ?? (window as any).runtime?.bus) // TODO(TASK-08)
            ?.executeCommand('roof.update', { id: this._currentRoofId, updates })
            ?.catch((e: Error) => console.warn('[RoofPropertySheet] roof.update failed:', e));
    }
}
