/**
 * SlabLayersEditor
 * ----------------
 * Renders an editable layer-stack table for a selected Slab element.
 * Lives inside the Definition Properties section of PropertyPanel.
 *
 * Architecture:
 *  - Reads slab.layers from the store snapshot passed in via elementData
 *  - Edits are kept in a local mutable copy (no store mutation here)
 *  - "Save Layers" fires the onSave callback → caller executes the command
 *
 * Contract compliance:
 *  - §01 CORE: All mutations via the legacy command manager (caller's responsibility)
 *  - §01-1.1: Tool Layer only — never writes stores directly
 *  - §03: Reads from semantic model (slabStore snapshot)
 */

const LAYER_FUNCTIONS = [
    { value: 'structure',      label: 'Structure'        },
    { value: 'finish-surface', label: 'Finish Surface'   },
    { value: 'screed',         label: 'Screed'           },
    { value: 'insulation',     label: 'Insulation'       },
    { value: 'substrate',      label: 'Substrate'        },
    { value: 'waterproofing',  label: 'Waterproofing'    },
];

const FN_COLORS: Record<string, string> = {
    'structure':      '#909090',
    'finish-surface': '#e8e0d8',
    'screed':         '#c8bfa8',
    'insulation':     '#f5e07a',
    'substrate':      '#a0a0a0',
    'waterproofing':  '#404040',
};

function totalMm(layers: any[]): number {
    return Math.round(layers.reduce((s: number, l: any) => s + (l.thickness ?? 0), 0) * 1000);
}

/**
 * Builds the Layers sub-section for a slab element.
 * Returns null if elementData is not a slab.
 */
export function buildSlabLayersEditor(
    elementData: Record<string, any>,
    onSave: (layers: any[]) => void
): HTMLElement | null {

    const type = (elementData.elementType ?? elementData.type ?? '').toLowerCase();
    if (type !== 'slab') return null;

    const sourceLayers: any[] = Array.isArray(elementData.layers) && elementData.layers.length > 0
        ? elementData.layers.map((l: any) => ({ ...l }))
        : [{ name: 'Layer 1', function: 'structure', thickness: elementData.thickness ?? 0.2, materialColor: '#909090' }];

    const editableLayers: any[] = sourceLayers.map((l: any) => ({ ...l }));

    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:10px;border-top:1px solid #e0e0e0;padding-top:8px;';

    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;';
    title.textContent = 'Layers';
    titleRow.appendChild(title);

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add Layer';
    addBtn.style.cssText = [
        'font-size:10px',
        'padding:2px 8px',
        'border:1px solid #2563eb',
        'border-radius:4px',
        'color:#2563eb',
        'background:#fff',
        'cursor:pointer',
    ].join(';');
    titleRow.appendChild(addBtn);
    wrap.appendChild(titleRow);

    const colHeader = document.createElement('div');
    colHeader.style.cssText = 'display:grid;grid-template-columns:16px 1fr 100px 48px 20px;gap:3px;padding:0 2px 3px;border-bottom:1px solid #e0e0e0;margin-bottom:3px;';
    ['', 'Name', 'Function', 'mm', ''].forEach(text => {
        const h = document.createElement('div');
        h.style.cssText = 'font-size:9px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.05em;';
        h.textContent = text;
        colHeader.appendChild(h);
    });
    wrap.appendChild(colHeader);

    const rowsContainer = document.createElement('div');
    wrap.appendChild(rowsContainer);

    function renderRows(): void {
        rowsContainer.innerHTML = '';
        editableLayers.forEach((layer: any, idx: number) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:grid;grid-template-columns:16px 1fr 100px 48px 20px;gap:3px;align-items:center;margin-bottom:3px;';

            const colorPick = document.createElement('input');
            colorPick.type = 'color';
            colorPick.value = layer.materialColor ?? FN_COLORS[layer.function] ?? '#cccccc';
            colorPick.style.cssText = 'width:14px;height:14px;border:none;padding:0;cursor:pointer;border-radius:2px;';
            colorPick.title = 'Layer colour';
            colorPick.addEventListener('input', () => { editableLayers[idx].materialColor = colorPick.value; });
            row.appendChild(colorPick);

            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = layer.name ?? '';
            nameInput.style.cssText = 'font-size:11px;border:1px solid #ddd;border-radius:3px;padding:2px 4px;width:100%;box-sizing:border-box;';
            nameInput.addEventListener('input', () => { editableLayers[idx].name = nameInput.value; });
            row.appendChild(nameInput);

            const fnSel = document.createElement('select');
            fnSel.style.cssText = 'font-size:10px;border:1px solid #ddd;border-radius:3px;padding:2px;width:100%;';
            LAYER_FUNCTIONS.forEach(({ value, label }) => {
                const opt = document.createElement('option');
                opt.value = value;
                opt.textContent = label;
                if (value === layer.function) opt.selected = true;
                fnSel.appendChild(opt);
            });
            fnSel.addEventListener('change', () => { editableLayers[idx].function = fnSel.value; });
            row.appendChild(fnSel);

            const thkInput = document.createElement('input');
            thkInput.type = 'number';
            thkInput.min = '1';
            thkInput.step = '1';
            thkInput.value = Math.round((layer.thickness ?? 0) * 1000).toString();
            thkInput.style.cssText = 'font-size:11px;border:1px solid #ddd;border-radius:3px;padding:2px 4px;width:100%;box-sizing:border-box;text-align:right;';
            thkInput.addEventListener('change', () => {
                const mm = parseFloat(thkInput.value);
                if (!isNaN(mm) && mm > 0) {
                    editableLayers[idx].thickness = mm / 1000;
                    refreshTotal();
                }
            });
            row.appendChild(thkInput);

            const removeBtn = document.createElement('button');
            removeBtn.textContent = '×';
            removeBtn.style.cssText = 'font-size:13px;border:none;background:none;color:#e53e3e;cursor:pointer;padding:0;line-height:1;';
            removeBtn.disabled = editableLayers.length <= 1;
            removeBtn.style.opacity = editableLayers.length <= 1 ? '0.3' : '1';
            removeBtn.addEventListener('click', () => {
                editableLayers.splice(idx, 1);
                renderRows();
                refreshTotal();
            });
            row.appendChild(removeBtn);

            rowsContainer.appendChild(row);
        });
    }

    const totalRow = document.createElement('div');
    totalRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:5px 2px 2px;border-top:1px solid #e0e0e0;margin-top:4px;font-size:11px;font-weight:600;color:#555;';

    const totalLabel = document.createElement('span');
    totalLabel.textContent = 'Total Thickness:';
    totalRow.appendChild(totalLabel);

    const totalVal = document.createElement('span');
    totalVal.style.cssText = 'color:#1e3a5f;font-weight:700;';
    totalRow.appendChild(totalVal);

    function refreshTotal(): void {
        totalVal.textContent = `${totalMm(editableLayers)} mm`;
    }

    renderRows();
    refreshTotal();
    wrap.appendChild(totalRow);

    addBtn.addEventListener('click', () => {
        editableLayers.push({
            name: `Layer ${editableLayers.length + 1}`,
            function: 'structure',
            thickness: 0.050,
            materialColor: '#909090',
        });
        renderRows();
        refreshTotal();
    });

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save Layers';
    saveBtn.style.cssText = [
        'margin-top:8px',
        'width:100%',
        'padding:6px',
        'font-size:11px',
        'font-weight:600',
        'border:none',
        'border-radius:5px',
        'background:#1e3a5f',
        'color:#fff',
        'cursor:pointer',
    ].join(';');
    saveBtn.addEventListener('click', () => {
        const valid = editableLayers.every((l: any) => l.thickness > 0 && l.name?.trim());
        if (!valid) {
            saveBtn.textContent = '⚠ Fix layer data first';
            saveBtn.style.background = '#dc2626';
            setTimeout(() => {
                saveBtn.textContent = 'Save Layers';
                saveBtn.style.background = '#1e3a5f';
            }, 2000);
            return;
        }
        const snapshot = editableLayers.map((l: any) => ({ ...l }));
        onSave(snapshot);
        saveBtn.textContent = '✓ Saved';
        saveBtn.style.background = '#16a34a';
        setTimeout(() => {
            saveBtn.textContent = 'Save Layers';
            saveBtn.style.background = '#1e3a5f';
        }, 1800);
    });
    wrap.appendChild(saveBtn);

    return wrap;
}
