/**
 * @file KitchenUnitInspector.ts
 *
 * Floating inspector panel for selecting and customising individual
 * kitchen cabinet units after placement.
 *
 * Ten front-finish options per unit:
 *   Drawers (4) | Drawers (3) | Drawers (2) |
 *   Solid Door  | Glass Door  | Framed Glass |
 *   Shelf (4)   | Shelf (3)   | Shelf (2)   | Open / Blank
 *
 * Mount flow:
 *   KitchenUnitInspector.mount(container) — call once
 *   KitchenUnitInspector.show(furnitureId, unitIndex, arm) — show on unit click
 *   KitchenUnitInspector.hide() — hide
 *
 * Contract:
 *  §01 §2  — writes via commands only; never direct scene mutation.
 *  §05 §7.6 — no independent <style> injection beyond inline styles.
 *  §05 §6   — no bim-* elements.
 */

import { KitchenHandleStyle, KitchenUnitFront, KitchenApplianceType } from '@pryzm/geometry-furniture';
import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';

// ── 10-option front matrix ────────────────────────────────────────────────────

type UnitFrontOption = {
    value:      KitchenUnitFront;
    label:      string;
    icon:       string;
    numDrawers?: number;
    numShelves?: number;
};

const FRONT_OPTIONS: UnitFrontOption[] = [
    { value: 'drawers',          label: 'Drawers ×4',  icon: '▤', numDrawers: 4 },
    { value: 'drawers',          label: 'Drawers ×3',  icon: '▤', numDrawers: 3 },
    { value: 'drawers',          label: 'Drawers ×2',  icon: '▤', numDrawers: 2 },
    { value: 'door',             label: 'Solid Door',  icon: '▭' },
    { value: 'glass_door',       label: 'Glass Door',  icon: '◫' },
    { value: 'framed_glass_door',label: 'Framed Glass',icon: '▣' },
    { value: 'shelf',            label: 'Shelf ×4',    icon: '≡', numShelves: 4 },
    { value: 'shelf',            label: 'Shelf ×3',    icon: '≡', numShelves: 3 },
    { value: 'shelf',            label: 'Shelf ×2',    icon: '≡', numShelves: 2 },
    { value: 'none',             label: 'Open',        icon: '□' },
];

const HANDLE_OPTIONS: Array<{ value: KitchenHandleStyle; label: string }> = [
    { value: 'bar',      label: 'Bar pull'  },
    { value: 'knob',     label: 'Knob'      },
    { value: 'recessed', label: 'Recessed'  },
    { value: 'line',     label: 'Line pull' },
    { value: 'none',     label: 'No handle' },
];

// ── Appliance options ─────────────────────────────────────────────────────────

type ApplianceOption = {
    value: KitchenApplianceType | 'none';
    label: string;
    icon:  string;
    group: 'countertop' | 'freestanding';
};

const APPLIANCE_OPTIONS: ApplianceOption[] = [
    { value: 'hob',                    label: 'Hob',         icon: '⊞', group: 'countertop'  },
    { value: 'sink_inox',              label: 'Sink Inox',   icon: '⬡', group: 'countertop'  },
    { value: 'sink_dark',              label: 'Sink Dark',   icon: '⬡', group: 'countertop'  },
    { value: 'washing_machine_white',  label: 'W.M. White',  icon: '⊙', group: 'freestanding'},
    { value: 'washing_machine_dark',   label: 'W.M. Dark',   icon: '⊙', group: 'freestanding'},
    { value: 'fridge_compact_silver',  label: 'Fridge Sil.', icon: '▣', group: 'freestanding'},
    { value: 'fridge_compact_dark',    label: 'Fridge Dark', icon: '▣', group: 'freestanding'},
    { value: 'fridge_combi_silver',    label: 'Combi Sil.',  icon: '▤', group: 'freestanding'},
    { value: 'fridge_combi_dark',      label: 'Combi Dark',  icon: '▤', group: 'freestanding'},
    { value: 'fridge_side_silver',     label: 'Side-by Sil.',icon: '▥', group: 'freestanding'},
    { value: 'fridge_side_dark',       label: 'Side-by Dark',icon: '▥', group: 'freestanding'},
];

// ── KitchenUnitInspector ──────────────────────────────────────────────────────

export class KitchenUnitInspector {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }


    private _panel:       HTMLElement | null = null;
    private _furnitureId: string | null = null;
    private _unitIndex:   number | null = null;
    private _arm:         'main' | 'left' | 'right' = 'main';

    mount(container: HTMLElement): void {
        if (this._panel) return;
        this._panel = this._build();
        container.appendChild(this._panel);
        this.hide();
    }

    show(furnitureId: string, unitIndex: number, arm: 'main' | 'left' | 'right'): void {
        this._furnitureId = furnitureId;
        this._unitIndex   = unitIndex;
        this._arm         = arm;
        if (!this._panel) return;
        this._refresh();
        this._panel.style.display = 'flex';
    }

    hide(): void {
        this._furnitureId = null;
        this._unitIndex   = null;
        if (this._panel) this._panel.style.display = 'none';
    }

    // ── DOM builder ───────────────────────────────────────────────────────────

    private _build(): HTMLElement {
        const panel = document.createElement('div');
        panel.id = 'kitchen-unit-inspector';
        panel.style.cssText = `
            position: fixed;
            top: 50%;
            right: 16px;
            transform: translateY(-50%);
            background: var(--app-bg, #ffffff);
            border: 1px solid var(--app-border, #e0e0e0);
            border-radius: 12px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.15);
            padding: 12px 16px;
            z-index: 900;
            display: flex;
            flex-direction: column;
            gap: 10px;
            width: 260px;
            max-height: 90vh;
            overflow-y: auto;
            font-family: var(--app-font, system-ui);
            pointer-events: auto;
        `;

        // Header
        const hdr = document.createElement('div');
        hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';

        const title = document.createElement('div');
        title.id = 'kui-title';
        title.style.cssText = 'font-size:12px;font-weight:600;color:var(--app-text,#1a1a1a);';
        title.textContent = 'Cabinet Unit';
        hdr.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
            background:none;border:none;font-size:18px;cursor:pointer;
            color:var(--app-text-muted,#999);line-height:1;padding:0 4px;
        `;
        closeBtn.addEventListener('click', () => this.hide());
        hdr.appendChild(closeBtn);
        panel.appendChild(hdr);

        // Front finish sub-header
        const subHdr = document.createElement('div');
        subHdr.style.cssText = 'font-size:10px;font-weight:600;color:var(--app-text-muted,#999);text-transform:uppercase;letter-spacing:0.05em;';
        subHdr.textContent = 'Front finish (10 options)';
        panel.appendChild(subHdr);

        // 10-option button grid (5 per row)
        const optRow = document.createElement('div');
        optRow.id = 'kui-options';
        optRow.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:5px;';
        panel.appendChild(optRow);

        panel.appendChild(this._buildSelectRow('Door material', 'kui-door-material'));
        panel.appendChild(this._buildColorRow('Door colour', 'kui-door-color'));
        panel.appendChild(this._buildSelectRow('Handle style', 'kui-handle-style'));
        panel.appendChild(this._buildSelectRow('Countertop', 'kui-countertop-material'));

        // ── Divider ──────────────────────────────────────────────────────────
        const divider = document.createElement('div');
        divider.style.cssText = 'height:1px;background:var(--app-border,#e5e5e5);margin:2px 0;';
        panel.appendChild(divider);

        // ── Appliance section ────────────────────────────────────────────────
        const appHdr = document.createElement('div');
        appHdr.style.cssText = 'font-size:10px;font-weight:600;color:var(--app-text-muted,#999);text-transform:uppercase;letter-spacing:0.05em;';
        appHdr.textContent = 'Built-in Appliance';
        panel.appendChild(appHdr);

        // "None" button
        const appNoneWrap = document.createElement('div');
        appNoneWrap.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;margin-bottom:2px;';
        const appNoneBtn = document.createElement('button');
        appNoneBtn.type = 'button';
        appNoneBtn.id = 'kui-app-none';
        appNoneBtn.textContent = '✕ None';
        appNoneBtn.style.cssText = `
            font-size:10px;padding:4px 10px;border-radius:6px;cursor:pointer;
            border:1.5px solid var(--app-border,#ddd);
            background:var(--app-surface,#f8f8f8);color:var(--app-text,#333);
        `;
        appNoneBtn.addEventListener('click', () => this._applyAppliance(undefined));
        appNoneWrap.appendChild(appNoneBtn);
        panel.appendChild(appNoneWrap);

        // Appliance button grid (6 per row — 2 rows of 6 icons)
        const appGrid = document.createElement('div');
        appGrid.id = 'kui-appliances';
        appGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:4px;';
        panel.appendChild(appGrid);

        // Side-by-side fridge notice (shown only when side-by-side is active)
        const sideNote = document.createElement('div');
        sideNote.id = 'kui-side-note';
        sideNote.style.cssText = `
            display:none;font-size:9px;color:var(--app-text-muted,#888);
            background:#fff8e1;border:1px solid #f0c040;border-radius:6px;padding:5px 8px;
        `;
        sideNote.textContent = 'Side-by-side fridges need ≥90 cm unit width. Increase the unit width (via run inspector) and the arm length accordingly.';
        panel.appendChild(sideNote);

        // Label input
        const labelRow = document.createElement('div');
        labelRow.style.cssText = 'display:flex;align-items:center;gap:8px;';

        const labelLbl = document.createElement('label');
        labelLbl.textContent = 'Label:';
        labelLbl.style.cssText = 'font-size:10px;color:var(--app-text-muted,#888);white-space:nowrap;';
        labelRow.appendChild(labelLbl);

        const labelInput = document.createElement('input');
        labelInput.id          = 'kui-label-input';
        labelInput.type        = 'text';
        labelInput.placeholder = 'e.g. Sink, Hob…';
        labelInput.style.cssText = `
            flex:1;font-size:11px;padding:4px 8px;
            border:1px solid var(--app-border,#ddd);border-radius:6px;
            background:var(--app-surface,#f8f8f8);color:var(--app-text,#1a1a1a);
            outline:none;
        `;
        labelInput.addEventListener('change', () => this._applyLabel(labelInput.value));
        labelRow.appendChild(labelInput);
        panel.appendChild(labelRow);

        return panel;
    }

    private _buildSelectRow(labelText: string, selectId: string): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const label = document.createElement('label');
        label.htmlFor = selectId;
        label.textContent = `${labelText}:`;
        label.style.cssText = 'font-size:10px;color:var(--app-text-muted,#888);white-space:nowrap;width:86px;';
        row.appendChild(label);
        const select = document.createElement('select');
        select.id = selectId;
        select.style.cssText = 'flex:1;font-size:11px;padding:4px 8px;border:1px solid var(--app-border,#ddd);border-radius:6px;background:var(--app-surface,#f8f8f8);color:var(--app-text,#1a1a1a);';
        row.appendChild(select);
        return row;
    }

    private _buildColorRow(labelText: string, inputId: string): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const label = document.createElement('label');
        label.htmlFor = inputId;
        label.textContent = `${labelText}:`;
        label.style.cssText = 'font-size:10px;color:var(--app-text-muted,#888);white-space:nowrap;width:86px;';
        row.appendChild(label);
        const input = document.createElement('input');
        input.id = inputId;
        input.type = 'color';
        input.style.cssText = 'width:42px;height:26px;border:1px solid var(--app-border,#ddd);border-radius:6px;background:transparent;';
        input.addEventListener('input', () => this._applyDoorColor(input.value));
        row.appendChild(input);
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.textContent = 'Use global';
        clear.style.cssText = 'font-size:10px;padding:4px 8px;border:1px solid var(--app-border,#ddd);border-radius:6px;background:var(--app-surface,#f8f8f8);color:var(--app-text,#333);cursor:pointer;';
        clear.addEventListener('click', () => this._applyDoorColor(undefined));
        row.appendChild(clear);
        return row;
    }

    // ── Refresh ───────────────────────────────────────────────────────────────

    private _refresh(): void {
        if (!this._panel) return;
        const unitData = this._getUnitData();

        // Update title
        const title = this._panel.querySelector('#kui-title') as HTMLElement;
        if (title) {
            const armLabel = this._arm === 'main' ? '' : ` (${this._arm} arm)`;
            title.textContent = `Unit ${(this._unitIndex ?? 0) + 1}${armLabel}`;
        }

        // Update label input
        const lInput = this._panel.querySelector('#kui-label-input') as HTMLInputElement;
        if (lInput) lInput.value = unitData?.label ?? '';

        // Rebuild option buttons (10 total)
        const optRow = this._panel.querySelector('#kui-options');
        if (!optRow) return;
        optRow.innerHTML = '';

        for (const opt of FRONT_OPTIONS) {
            const btn = document.createElement('button');
            btn.type = 'button';

            // Active detection: match front type AND drawer/shelf count
            const isActive =
                unitData?.front === opt.value &&
                (opt.numDrawers === undefined || (unitData?.numDrawers ?? 2) === opt.numDrawers) &&
                (opt.numShelves === undefined || (unitData?.numShelves ?? 2) === opt.numShelves);

            btn.style.cssText = `
                display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
                padding:5px 4px;border-radius:8px;cursor:pointer;
                font-size:8px;font-weight:500;
                border:1.5px solid ${isActive ? 'var(--app-accent,#6600ff)' : 'var(--app-border,#ddd)'};
                background:${isActive ? 'var(--app-accent,#6600ff)' : 'var(--app-surface,#f8f8f8)'};
                color:${isActive ? '#fff' : 'var(--app-text,#333)'};
                transition:background 0.1s,color 0.1s;
                min-height:48px;
            `;

            const iconSpan = document.createElement('span');
            iconSpan.style.cssText = 'font-size:14px;line-height:1;';
            iconSpan.textContent = opt.icon;
            btn.appendChild(iconSpan);

            const lbl = document.createElement('span');
            lbl.style.cssText = 'text-align:center;line-height:1.2;';
            lbl.textContent = opt.label;
            btn.appendChild(lbl);

            btn.addEventListener('click', () =>
                this._applyFront(opt.value, opt.numDrawers, opt.numShelves),
            );
            optRow.appendChild(btn);
        }

        this._refreshMaterialSelect(unitData);
        this._refreshHandleSelect(unitData);
        this._refreshCountertopSelect();
        this._refreshAppliances(unitData);

        const colorInput = this._panel.querySelector('#kui-door-color') as HTMLInputElement | null;
        if (colorInput) colorInput.value = unitData?.doorColor ?? '#f0ebe4';
    }

    private _refreshAppliances(unitData: any): void {
        if (!this._panel) return;
        const grid = this._panel.querySelector('#kui-appliances');
        if (!grid) return;
        grid.innerHTML = '';

        const currentApp: string | undefined = unitData?.appliance;

        // Update "None" button active state
        const noneBtn = this._panel.querySelector('#kui-app-none') as HTMLElement | null;
        if (noneBtn) {
            const noneActive = !currentApp;
            noneBtn.style.borderColor = noneActive ? 'var(--app-accent,#6600ff)' : 'var(--app-border,#ddd)';
            noneBtn.style.background  = noneActive ? 'var(--app-accent,#6600ff)' : 'var(--app-surface,#f8f8f8)';
            noneBtn.style.color       = noneActive ? '#fff' : 'var(--app-text,#333)';
        }

        for (const opt of APPLIANCE_OPTIONS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            const isActive = currentApp === opt.value;
            btn.style.cssText = `
                display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
                padding:5px 3px;border-radius:7px;cursor:pointer;
                font-size:7.5px;font-weight:500;
                border:1.5px solid ${isActive ? 'var(--app-accent,#6600ff)' : 'var(--app-border,#ddd)'};
                background:${isActive ? 'var(--app-accent,#6600ff)' : 'var(--app-surface,#f8f8f8)'};
                color:${isActive ? '#fff' : 'var(--app-text,#333)'};
                min-height:44px;line-height:1.2;
            `;
            const iconSpan = document.createElement('span');
            iconSpan.style.cssText = 'font-size:13px;line-height:1;';
            iconSpan.textContent = opt.icon;
            btn.appendChild(iconSpan);
            const lbl = document.createElement('span');
            lbl.style.cssText = 'text-align:center;line-height:1.2;';
            lbl.textContent = opt.label;
            btn.appendChild(lbl);
            btn.addEventListener('click', () => this._applyAppliance(opt.value as KitchenApplianceType));
            grid.appendChild(btn);
        }

        // Show/hide side-by-side note
        const sideNote = this._panel.querySelector('#kui-side-note') as HTMLElement | null;
        if (sideNote) {
            const isSide = currentApp === 'fridge_side_silver' || currentApp === 'fridge_side_dark';
            sideNote.style.display = isSide ? 'block' : 'none';
        }
    }

    private _refreshMaterialSelect(unitData: any): void {
        if (!this._panel) return;
        const select = this._panel.querySelector('#kui-door-material') as HTMLSelectElement | null;
        if (!select) return;
        select.innerHTML = '';
        const custom = document.createElement('option');
        custom.value = '';
        custom.textContent = 'Use colour / global';
        select.appendChild(custom);
        for (const m of STANDARD_MATERIAL_LIBRARY.filter(m =>
            ['Wood', 'Timber Engineered', 'Paint & Coating', 'Metal', 'Glass', 'Specialty Surfaces'].includes(m.category)
        )) {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.label;
            select.appendChild(opt);
        }
        select.value = unitData?.doorMaterialId ?? '';
        select.onchange = () => this._applyDoorMaterial(select.value || undefined);
    }

    private _refreshHandleSelect(unitData: any): void {
        if (!this._panel) return;
        const select = this._panel.querySelector('#kui-handle-style') as HTMLSelectElement | null;
        if (!select) return;
        select.innerHTML = '';
        for (const option of HANDLE_OPTIONS) {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.textContent = option.label;
            select.appendChild(opt);
        }
        select.value = unitData?.handleStyle ?? (unitData?.front === 'drawers' ? 'line' : 'bar');
        select.onchange = () => this._applyHandleStyle(select.value as KitchenHandleStyle);
    }

    private _refreshCountertopSelect(): void {
        if (!this._panel || this._furnitureId === null) return;
        const store = window.furnitureStore; // TODO(E.furniture.S): legacy furnitureStore — replace with runtime.stores.furniture
        const fd: any = store?.get(this._furnitureId);
        const select = this._panel.querySelector('#kui-countertop-material') as HTMLSelectElement | null;
        if (!select) return;
        select.innerHTML = '';
        const custom = document.createElement('option');
        custom.value = '';
        custom.textContent = 'Default countertop';
        select.appendChild(custom);
        for (const m of STANDARD_MATERIAL_LIBRARY.filter(m =>
            ['Stone', 'Ceramic & Tile', 'Wood', 'Timber Engineered', 'Metal', 'Specialty Surfaces'].includes(m.category)
        )) {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.label;
            select.appendChild(opt);
        }
        select.value = fd?.kitchenConfig?.countertopMaterialId ?? '';
        select.onchange = () => this._applyCountertopMaterial(select.value || undefined);
    }

    private _getUnitData(): {
        front: KitchenUnitFront;
        label?: string;
        doorMaterialId?: string;
        doorColor?: string;
        handleStyle?: KitchenHandleStyle;
        numDrawers?: number;
        numShelves?: number;
        appliance?: KitchenApplianceType;
    } | null {
        if (this._furnitureId === null || this._unitIndex === null) return null;
        const store = window.furnitureStore; // TODO(E.furniture.S): legacy furnitureStore — replace with runtime.stores.furniture
        if (!store) return null;
        const fd: any = store.get(this._furnitureId);
        if (!fd?.kitchenConfig?.units) return null;
        const unit = fd.kitchenConfig.units.find(
            (u: any) => u.arm === this._arm && u.index === this._unitIndex
        );
        return unit ?? null;
    }

    // ── Mutations (via store) ─────────────────────────────────────────────────

    private _applyFront(front: KitchenUnitFront, numDrawers?: number, numShelves?: number): void {
        this._mutateUnit(u => {
            u.front = front;
            if (numDrawers !== undefined) u.numDrawers = numDrawers;
            if (numShelves !== undefined) u.numShelves = numShelves;
        });
    }

    private _applyAppliance(appliance: KitchenApplianceType | undefined): void {
        this._mutateUnit(u => {
            u.appliance = appliance;
            // For freestanding appliances, ensure the front is 'none' automatically
            if (appliance && (appliance.startsWith('washing_machine') || appliance.startsWith('fridge'))) {
                u.front = 'none';
            }
        });
    }

    private _applyLabel(label: string): void {
        this._mutateUnit(u => { u.label = label || undefined; });
    }

    private _applyDoorMaterial(materialId: string | undefined): void {
        this._mutateUnit(u => { u.doorMaterialId = materialId; });
    }

    private _applyDoorColor(color: string | undefined): void {
        this._mutateUnit(u => {
            u.doorColor = color;
            if (color) u.doorMaterialId = undefined;
        });
    }

    private _applyHandleStyle(style: KitchenHandleStyle): void {
        this._mutateUnit(u => { u.handleStyle = style; });
    }

    private _applyCountertopMaterial(materialId: string | undefined): void {
        if (this._furnitureId === null) return;
        const store = window.furnitureStore; // TODO(E.furniture.S): legacy furnitureStore — replace with runtime.stores.furniture
        if (!store) return;
        const fd: any = store.get(this._furnitureId);
        if (!fd?.kitchenConfig) return;
        const newFd = structuredClone(fd) as any;
        newFd.kitchenConfig.countertopMaterialId = materialId;
        this._applyKitchenConfig(newFd.kitchenConfig);
        this._refresh();
    }

    private _mutateUnit(mutate: (unit: any) => void): void {
        if (this._furnitureId === null || this._unitIndex === null) return;
        const store = window.furnitureStore; // TODO(E.furniture.S): legacy furnitureStore — replace with runtime.stores.furniture
        if (!store) return;
        const fd: any = store.get(this._furnitureId);
        if (!fd?.kitchenConfig?.units) return;

        const newFd = structuredClone(fd) as any;
        const unit  = newFd.kitchenConfig.units.find(
            (u: any) => u.arm === this._arm && u.index === this._unitIndex
        );
        if (unit) {
            mutate(unit);
            this._applyKitchenConfig(newFd.kitchenConfig);
        }

        this._refresh();
    }

    private _applyKitchenConfig(kitchenConfig: any): void {
        if (this._furnitureId === null) return;
        (window as any).runtime?.bus?.executeCommand('furniture.updateParameters', {
            id:            this._furnitureId,
            kitchenConfig,
        });
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const kitchenUnitInspector = new KitchenUnitInspector();
