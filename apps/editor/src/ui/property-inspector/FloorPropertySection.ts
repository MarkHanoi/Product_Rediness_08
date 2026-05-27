/**
 * @file src/ui/property-inspector/FloorPropertySection.ts
 *
 * Lifted from PropertyInspector.ts (updateLevelIdentitySection floor branch)
 * — Wave 14 god-file split.
 *
 * Renders the Floor Layer Stack editor into the level-identity content container.
 *
 * Pure DOM factory — no class state, no `this` references.
 * All window.* reaches are preserved with their original TODO annotations.
 */

// §OI-055-SIBLING fix (2026-05-27): UpdateFloorCommand import removed — the bus
// dispatch pattern is `executeCommand('floor.update', { floorId, updates })`,
// not `executeCommand(cmd.type, cmd)`. The handler registered in
// `initBusHandlers.ts:184` consumes the RAW PAYLOAD shape, and `cmd.type` is the
// legacy enum value `'UPDATE_FLOOR'` (no bus handler) — both wrong. Same
// class of defect as the ProjectBrowser "Add level" button (OI-055).

type AddPropFn = (
    parent: HTMLElement,
    label: string,
    value: any,
    readonly?: boolean,
    key?: string,
) => void;

/**
 * Appends floor area, thickness, and an editable layer stack with Save button.
 *
 * @param content     Level-identity section body element
 * @param data        element userData (Three.js Object3D.userData)
 * @param elementId   element UUID
 * @param addProp     Bound reference to PropertyInspector.addProperty()
 */
export function appendFloorIdentitySection(
    content: HTMLElement,
    data: any,
    elementId: string,
    addProp: AddPropFn,
): void {
    const floor = window.floorStore?.getById(elementId); // TODO(E.floor.S): replace with runtime.stores.floor — Phase E.floor.S
    if (!floor) return;

    addProp(content, 'Area',      data.area      ? `${data.area.toFixed(2)}m²`                    : '—', true);
    addProp(content, 'Thickness', data.thickness !== undefined ? `${Math.round(data.thickness * 1000)}mm` : '—', true);

    const floorFnOptions: string[] = [
        'finish', 'adhesive', 'screed', 'underfloor-heating',
        'insulation', 'tanking', 'substrate'
    ];
    const floorFnColors: Record<string, string> = {
        'finish':             '#e8d5b0',
        'adhesive':           '#c8b89a',
        'screed':             '#c8bfa8',
        'underfloor-heating': '#f5c07a',
        'insulation':         '#f5e07a',
        'tanking':            '#4a5240',
        'substrate':          '#a0a0a0',
    };

    const layerSection = document.createElement('div');
    layerSection.style.cssText = 'margin-top:8px;';

    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;';

    const layerTitle = document.createElement('div');
    layerTitle.style.cssText = 'font-size:10px;font-weight:600;color:var(--app-text-muted,#888);text-transform:uppercase;letter-spacing:0.05em;';
    layerTitle.textContent = 'Floor Layers';
    titleRow.appendChild(layerTitle);

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add Layer';
    addBtn.style.cssText = 'font-size:10px;padding:2px 7px;background:var(--app-panel-bg,#f0f0f0);border:1px solid var(--app-border,#ddd);border-radius:4px;cursor:pointer;color:var(--app-text,#333);';
    titleRow.appendChild(addBtn);
    layerSection.appendChild(titleRow);

    const editableLayers: any[] = (floor.layers ?? []).map((l: any) => ({ ...l }));

    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:grid;grid-template-columns:18px 1fr 80px 46px 18px;gap:3px;padding:2px 0 4px;border-bottom:2px solid var(--app-border,#e8e8e8);margin-bottom:2px;';
    ['', 'Name', 'Function', 'mm', ''].forEach(h => {
        const hEl = document.createElement('span');
        hEl.style.cssText = 'font-size:9px;font-weight:700;color:var(--app-text-muted,#aaa);text-transform:uppercase;letter-spacing:0.04em;';
        hEl.textContent = h;
        headerRow.appendChild(hEl);
    });
    layerSection.appendChild(headerRow);

    const rowsContainer = document.createElement('div');

    const totalRow = document.createElement('div');
    totalRow.style.cssText = 'display:flex;justify-content:flex-end;font-size:10px;color:var(--app-text-2,#555);font-weight:600;padding-top:4px;margin-top:2px;border-top:2px solid var(--app-border,#e8e8e8);';

    const refreshFloorTotal = () => {
        const total = editableLayers.reduce((s: number, l: any) => s + (l.thickness ?? 0), 0);
        totalRow.textContent = `Total: ${Math.round(total * 1000)}mm`;
    };

    const renderFloorRows = () => {
        rowsContainer.innerHTML = '';
        editableLayers.forEach((layer: any, idx: number) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:grid;grid-template-columns:18px 1fr 80px 46px 18px;gap:3px;align-items:center;padding:2px 0;border-bottom:1px solid var(--app-border-light,#f0f0f0);';

            const swatch = document.createElement('div');
            const swatchColor = floorFnColors[layer.function] ?? layer.materialColor ?? '#ccc';
            swatch.style.cssText = `width:14px;height:14px;border-radius:3px;background:${swatchColor};border:1px solid var(--app-border,#ddd);flex-shrink:0;`;
            row.appendChild(swatch);

            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = layer.name;
            nameInput.style.cssText = 'font-size:11px;padding:2px 4px;border:1px solid var(--app-border,#e0e0e0);border-radius:3px;width:100%;box-sizing:border-box;';
            nameInput.addEventListener('input', () => { editableLayers[idx].name = nameInput.value; });
            row.appendChild(nameInput);

            const fnSel = document.createElement('select');
            fnSel.style.cssText = 'font-size:10px;padding:2px 2px;border:1px solid var(--app-border,#e0e0e0);border-radius:3px;width:100%;';
            floorFnOptions.forEach(fn => {
                const o = document.createElement('option');
                o.value = fn;
                o.textContent = fn.replace(/-/g, ' ');
                if (fn === layer.function) o.selected = true;
                fnSel.appendChild(o);
            });
            fnSel.addEventListener('change', () => {
                editableLayers[idx].function = fnSel.value;
                const newColor = floorFnColors[fnSel.value] ?? '#ccc';
                swatch.style.background = newColor;
                editableLayers[idx].materialColor = newColor;
            });
            row.appendChild(fnSel);

            const thkInput = document.createElement('input');
            thkInput.type = 'number';
            thkInput.min = '1';
            thkInput.step = '1';
            thkInput.value = String(Math.round(layer.thickness * 1000));
            thkInput.style.cssText = 'font-size:11px;padding:2px 4px;border:1px solid var(--app-border,#e0e0e0);border-radius:3px;width:100%;box-sizing:border-box;text-align:right;';
            thkInput.addEventListener('input', () => {
                const mm = parseFloat(thkInput.value);
                if (!isNaN(mm) && mm > 0) editableLayers[idx].thickness = mm / 1000;
            });
            row.appendChild(thkInput);

            const removeBtn = document.createElement('button');
            removeBtn.textContent = '×';
            removeBtn.style.cssText = 'font-size:13px;color:#999;background:none;border:none;cursor:pointer;padding:0;line-height:1;';
            removeBtn.title = 'Remove layer';
            removeBtn.addEventListener('click', () => {
                editableLayers.splice(idx, 1);
                renderFloorRows();
                refreshFloorTotal();
            });
            row.appendChild(removeBtn);

            rowsContainer.appendChild(row);
        });
    };

    addBtn.addEventListener('click', () => {
        editableLayers.push({ name: 'New Layer', thickness: 0.01, function: 'finish', materialColor: floorFnColors['finish'] });
        renderFloorRows();
        refreshFloorTotal();
    });

    renderFloorRows();
    refreshFloorTotal();
    layerSection.appendChild(rowsContainer);
    layerSection.appendChild(totalRow);

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save Layers';
    saveBtn.style.cssText = 'margin-top:6px;width:100%;font-size:11px;padding:4px 8px;background:var(--app-accent,#2196f3);color:#fff;border:none;border-radius:5px;cursor:pointer;';
    saveBtn.addEventListener('click', () => {
        // [P6-E.5.1] Migrated: window.commandManager → runtime.bus (01-BIM-ENGINE-CORE-CONTRACT §1).
        // §OI-055-SIBLING fix (2026-05-27): dispatch via bus type 'floor.update'
        // with the raw payload — matches the handler signature in
        // initBusHandlers.ts:184. Previously dispatched `cmd.type` (= 'UPDATE_FLOOR',
        // no handler) with the full Command instance (handler expects raw payload)
        // → silent no-op (same class as OI-055).
        if (!window.runtime?.bus) {
            console.warn('[FloorPropertySection] runtime.bus not available — UpdateFloor skipped');
            return;
        }
        window.runtime.bus.executeCommand('floor.update', {
            floorId: floor.id,
            updates: { layers: editableLayers.map((l: any) => ({ ...l })) },
        });
        saveBtn.textContent = '✓ Saved';
        saveBtn.style.background = 'var(--app-status-success,#22c55e)';
        setTimeout(() => {
            saveBtn.textContent = 'Save Layers';
            saveBtn.style.background = 'var(--app-accent,#2196f3)';
        }, 1500);
    });
    layerSection.appendChild(saveBtn);
    content.appendChild(layerSection);
}
