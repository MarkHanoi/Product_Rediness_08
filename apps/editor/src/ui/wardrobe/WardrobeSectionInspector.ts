/**
 * @file WardrobeSectionInspector.ts
 *
 * Floating inspector panel for selecting and customising individual
 * wardrobe sections after placement.
 *
 * Ten interior options per section:
 *   Hanger | Hanger+Shelf | Shelves (×4) | Shelves (×3) | Shelves (×2) |
 *   Drawers (×4) | Drawers (×3) | Drawers (×2) | Open | (separator)
 *
 * Six door type options:
 *   Double Hinged | Sliding | Mirror | Glass | Open (no door)
 *
 * Contract:
 *  §01 §2  — writes via UpdateFurnitureParametersCommand (undo/redo + store event).
 *  §05 §7.6 — no independent <style> injection beyond inline styles.
 */

import { WardrobeSectionDoorType, WardrobeSectionInterior } from '@pryzm/geometry-furniture';
import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';

// ── Interior option matrix ─────────────────────────────────────────────────────

type InteriorOption = {
    value:      WardrobeSectionInterior;
    label:      string;
    icon:       string;
    numShelves?: number;
    numDrawers?: number;
};

const INTERIOR_OPTIONS: InteriorOption[] = [
    { value: 'hanger',       label: 'Hanger',      icon: '⌂'  },
    { value: 'hanger_shelf', label: 'Hanger+Shelf', icon: '⌂≡' },
    { value: 'shelves',      label: 'Shelves ×4',   icon: '≡',  numShelves: 4 },
    { value: 'shelves',      label: 'Shelves ×3',   icon: '≡',  numShelves: 3 },
    { value: 'shelves',      label: 'Shelves ×2',   icon: '≡',  numShelves: 2 },
    { value: 'drawers',      label: 'Drawers ×4',   icon: '▤',  numDrawers: 4 },
    { value: 'drawers',      label: 'Drawers ×3',   icon: '▤',  numDrawers: 3 },
    { value: 'drawers',      label: 'Drawers ×2',   icon: '▤',  numDrawers: 2 },
    { value: 'open',         label: 'Open',          icon: '□'  },
];

// ── Door type options ──────────────────────────────────────────────────────────

type DoorOption = { value: WardrobeSectionDoorType; label: string };

const DOOR_OPTIONS: DoorOption[] = [
    { value: 'double-hinged', label: 'Double Hinged' },
    { value: 'sliding',       label: 'Sliding'       },
    { value: 'mirror',        label: 'Mirror'        },
    { value: 'glass',         label: 'Glass'         },
    { value: 'none',          label: 'No Door'       },
];

// ── WardrobeSectionInspector ──────────────────────────────────────────────────

export class WardrobeSectionInspector {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }


    private _panel:       HTMLElement | null = null;
    private _furnitureId: string | null = null;
    private _sectionIdx:  number | null = null;
    private _arm:         'main' | 'left' | 'right' = 'main';

    mount(container: HTMLElement): void {
        if (this._panel) return;
        this._panel = this._build();
        container.appendChild(this._panel);
        this.hide();
    }

    show(furnitureId: string, sectionIndex: number, arm: 'main' | 'left' | 'right'): void {
        this._furnitureId = furnitureId;
        this._sectionIdx  = sectionIndex;
        this._arm         = arm;
        if (!this._panel) return;
        this._refresh();
        this._panel.style.display = 'flex';
    }

    hide(): void {
        this._furnitureId = null;
        this._sectionIdx  = null;
        if (this._panel) this._panel.style.display = 'none';
    }

    // ── DOM builder ───────────────────────────────────────────────────────────

    private _build(): HTMLElement {
        const panel = document.createElement('div');
        panel.id = 'wardrobe-section-inspector';
        panel.style.cssText = `
            position: fixed;
            bottom: 90px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--app-bg, #ffffff);
            border: 1px solid var(--app-border, #e0e0e0);
            border-radius: 12px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.15);
            padding: 12px 16px;
            z-index: 900;
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-width: 380px;
            max-width: 500px;
            font-family: var(--app-font, system-ui);
            pointer-events: auto;
        `;

        // Header
        const hdr = document.createElement('div');
        hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';

        const titleEl = document.createElement('div');
        titleEl.id = 'wsi-title';
        titleEl.style.cssText = 'font-size:12px;font-weight:600;color:var(--app-text,#1a1a1a);';
        titleEl.textContent = 'Wardrobe Section';
        hdr.appendChild(titleEl);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '×';
        closeBtn.style.cssText = 'background:none;border:none;font-size:18px;cursor:pointer;color:var(--app-text-muted,#999);line-height:1;padding:0 4px;';
        closeBtn.addEventListener('click', () => this.hide());
        hdr.appendChild(closeBtn);
        panel.appendChild(hdr);

        // ── Door type ─────────────────────────────────────────────────────────
        const doorSubHdr = document.createElement('div');
        doorSubHdr.style.cssText = 'font-size:10px;font-weight:600;color:var(--app-text-muted,#999);text-transform:uppercase;letter-spacing:0.05em;';
        doorSubHdr.textContent = 'Door type';
        panel.appendChild(doorSubHdr);

        const doorRow = document.createElement('div');
        doorRow.id = 'wsi-door-options';
        doorRow.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;';
        panel.appendChild(doorRow);

        // ── Interior layout ───────────────────────────────────────────────────
        const intSubHdr = document.createElement('div');
        intSubHdr.style.cssText = 'font-size:10px;font-weight:600;color:var(--app-text-muted,#999);text-transform:uppercase;letter-spacing:0.05em;';
        intSubHdr.textContent = 'Interior (9 options)';
        panel.appendChild(intSubHdr);

        const intGrid = document.createElement('div');
        intGrid.id = 'wsi-interior-options';
        intGrid.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:5px;';
        panel.appendChild(intGrid);

        // ── Material / colour row ─────────────────────────────────────────────
        panel.appendChild(this._buildSelectRow('Door material', 'wsi-door-material'));
        panel.appendChild(this._buildColorRow('Door colour', 'wsi-door-color'));

        // ── Label input ───────────────────────────────────────────────────────
        const labelRow = document.createElement('div');
        labelRow.style.cssText = 'display:flex;align-items:center;gap:8px;';

        const labelLbl = document.createElement('label');
        labelLbl.textContent = 'Label:';
        labelLbl.style.cssText = 'font-size:10px;color:var(--app-text-muted,#888);white-space:nowrap;';
        labelRow.appendChild(labelLbl);

        const labelInput = document.createElement('input');
        labelInput.id          = 'wsi-label-input';
        labelInput.type        = 'text';
        labelInput.placeholder = 'e.g. Shoes, Shirts…';
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
        label.style.cssText = 'font-size:10px;color:var(--app-text-muted,#888);white-space:nowrap;width:90px;';
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
        label.style.cssText = 'font-size:10px;color:var(--app-text-muted,#888);white-space:nowrap;width:90px;';
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
        const sectionData = this._getSectionData();

        // Title
        const titleEl = this._panel.querySelector('#wsi-title') as HTMLElement;
        if (titleEl) {
            const armLabel = this._arm === 'main' ? '' : ` (${this._arm} arm)`;
            titleEl.textContent = `Section ${(this._sectionIdx ?? 0) + 1}${armLabel}`;
        }

        // Label input
        const lInput = this._panel.querySelector('#wsi-label-input') as HTMLInputElement;
        if (lInput) lInput.value = sectionData?.label ?? '';

        // Color input
        const colorInput = this._panel.querySelector('#wsi-door-color') as HTMLInputElement;
        if (colorInput) colorInput.value = sectionData?.doorColor ?? '#d4c4a0';

        // ── Door type buttons ─────────────────────────────────────────────────
        const doorRow = this._panel.querySelector('#wsi-door-options');
        if (doorRow) {
            doorRow.innerHTML = '';
            for (const opt of DOOR_OPTIONS) {
                const btn = document.createElement('button');
                btn.type = 'button';
                const isActive = sectionData?.doorType === opt.value;
                btn.style.cssText = `
                    padding:5px 10px;border-radius:8px;cursor:pointer;
                    font-size:10px;font-weight:500;
                    border:1.5px solid ${isActive ? 'var(--app-accent,#6600ff)' : 'var(--app-border,#ddd)'};
                    background:${isActive ? 'var(--app-accent,#6600ff)' : 'var(--app-surface,#f8f8f8)'};
                    color:${isActive ? '#fff' : 'var(--app-text,#333)'};
                    transition:background 0.1s,color 0.1s;
                `;
                btn.textContent = opt.label;
                btn.addEventListener('click', () => this._applyDoorType(opt.value));
                doorRow.appendChild(btn);
            }
        }

        // ── Interior option buttons ───────────────────────────────────────────
        const intGrid = this._panel.querySelector('#wsi-interior-options');
        if (!intGrid) return;
        intGrid.innerHTML = '';

        for (const opt of INTERIOR_OPTIONS) {
            const btn = document.createElement('button');
            btn.type = 'button';

            const isActive =
                sectionData?.interior === opt.value &&
                (opt.numShelves === undefined || (sectionData?.numShelves ?? 3) === opt.numShelves) &&
                (opt.numDrawers === undefined || (sectionData?.numDrawers ?? 3) === opt.numDrawers);

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
                this._applyInterior(opt.value, opt.numShelves, opt.numDrawers),
            );
            intGrid.appendChild(btn);
        }

        this._refreshMaterialSelect(sectionData);
    }

    private _refreshMaterialSelect(sectionData: any): void {
        if (!this._panel) return;
        const select = this._panel.querySelector('#wsi-door-material') as HTMLSelectElement | null;
        if (!select) return;
        select.innerHTML = '';
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = 'Use colour / global';
        select.appendChild(defaultOpt);
        for (const m of STANDARD_MATERIAL_LIBRARY.filter(m =>
            ['Wood', 'Timber Engineered', 'Paint & Coating', 'Metal', 'Glass', 'Specialty Surfaces'].includes(m.category)
        )) {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.label;
            select.appendChild(opt);
        }
        select.value = sectionData?.doorMaterialId ?? '';
        select.onchange = () => this._applyDoorMaterial(select.value || undefined);
    }

    // ── Data access ───────────────────────────────────────────────────────────

    private _getSectionData(): {
        doorType:       WardrobeSectionDoorType;
        interior:       WardrobeSectionInterior;
        label?:         string;
        doorMaterialId?: string;
        doorColor?:     string;
        numShelves?:    number;
        numDrawers?:    number;
    } | null {
        if (this._furnitureId === null || this._sectionIdx === null) return null;
        const store = window.furnitureStore; // TODO(E.furniture.S): legacy furnitureStore — replace with runtime.stores.furniture
        if (!store) return null;
        const fd: any = store.get(this._furnitureId);
        if (!fd?.wardrobeCabinetConfig?.sections) return null;
        const section = fd.wardrobeCabinetConfig.sections.find(
            (s: any) => s.arm === this._arm && s.index === this._sectionIdx
        );
        return section ?? null;
    }

    // ── Mutations ─────────────────────────────────────────────────────────────

    private _applyInterior(interior: WardrobeSectionInterior, numShelves?: number, numDrawers?: number): void {
        this._mutateSection(s => {
            s.interior = interior;
            if (numShelves !== undefined) s.numShelves = numShelves;
            if (numDrawers !== undefined) s.numDrawers = numDrawers;
        });
    }

    private _applyDoorType(doorType: WardrobeSectionDoorType): void {
        this._mutateSection(s => { s.doorType = doorType; });
    }

    private _applyLabel(label: string): void {
        this._mutateSection(s => { s.label = label || undefined; });
    }

    private _applyDoorMaterial(materialId: string | undefined): void {
        this._mutateSection(s => { s.doorMaterialId = materialId; });
    }

    private _applyDoorColor(color: string | undefined): void {
        this._mutateSection(s => {
            s.doorColor = color;
            if (color) s.doorMaterialId = undefined;
        });
    }

    private _mutateSection(mutate: (section: any) => void): void {
        if (this._furnitureId === null || this._sectionIdx === null) return;
        const store = window.furnitureStore; // TODO(E.furniture.S): legacy furnitureStore — replace with runtime.stores.furniture
        if (!store) return;
        const fd: any = store.get(this._furnitureId);
        if (!fd?.wardrobeCabinetConfig?.sections) return;

        const newCfg = structuredClone(fd.wardrobeCabinetConfig) as any;
        const section = newCfg.sections.find(
            (s: any) => s.arm === this._arm && s.index === this._sectionIdx
        );
        if (section) {
            mutate(section);
            this._applyWardrobeConfig(newCfg);
        }

        this._refresh();
    }

    private _applyWardrobeConfig(wardrobeCabinetConfig: any): void {
        if (this._furnitureId === null) return;
        // P6 E.5.3: bus-primary — window.commandManager removed.
        if ((window.runtime?.bus as any)?.executeCommand) {
            (window.runtime!.bus as any).executeCommand('furniture.updateParameters', {
                id: this._furnitureId,
                wardrobeCabinetConfig,
            })?.catch((e: Error) => console.error('[WardrobeSectionInspector] furniture.updateParameters failed:', e));
            return;
        }
        // Fallback: direct store update (no command bus available)
        const store = window.furnitureStore; // TODO(E.furniture.S): legacy furnitureStore — replace with runtime.stores.furniture
        const fd: any = store?.get(this._furnitureId);
        if (!fd) return;
        store.update(this._furnitureId, { ...fd, wardrobeCabinetConfig });
    }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

export const wardrobeSectionInspector = new WardrobeSectionInspector();
