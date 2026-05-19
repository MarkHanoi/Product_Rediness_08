/**
 * WallLayersEditor
 * ----------------
 * Renders an editable layer-stack table for a selected Wall element.
 * Lives inside the Definition Properties section of PropertyPanel.
 *
 * Architecture:
 *  - Reads wall.layers from the store snapshot passed in via elementData
 *  - Edits are kept in a local mutable copy (no store mutation here)
 *  - "Save Layers" fires UpdateElementParameterCommand → store → builder → scene
 *
 * Contract compliance:
 *  - §01 CORE: All mutations via the legacy command manager
 *  - §01-1.1: Tool Layer only — never writes stores directly
 *  - §03: Reads from semantic model (wallStore snapshot)
 *  - §05: All styles via wle- CSS classes in AppTheme.ts
 */

// Values must match WALL_LAYER_FUNCTIONS in WallDataSchema.ts exactly
const LAYER_FUNCTIONS = [
    { value: 'structure',         label: 'Structure'          },
    { value: 'finish-interior',   label: 'Finish (Interior)'  },
    { value: 'finish-exterior',   label: 'Finish (Exterior)'  },
    { value: 'insulation',        label: 'Insulation'         },
    { value: 'substrate',         label: 'Substrate'          },
    { value: 'air-barrier',       label: 'Air Barrier'        },
];

const FN_COLORS: Record<string, string> = {
    'structure':        '#b0c4de',
    'finish-interior':  '#f5deb3',
    'finish-exterior':  '#d2b48c',
    'insulation':       '#ffe4b5',
    'substrate':        '#e0d8cc',
    'air-barrier':      '#98fb98',
};

function totalMm(layers: any[]): number {
    return Math.round(layers.reduce((s: number, l: any) => s + (l.thickness ?? 0), 0) * 1000);
}

/**
 * Builds the Layers sub-section for a wall element.
 * Returns null if elementData is not a wall.
 */
export function buildWallLayersEditor(
    elementData: Record<string, any>,
    onSave: (layers: any[]) => void
): HTMLElement | null {

    const type = (elementData.elementType ?? elementData.type ?? '').toLowerCase();
    if (type !== 'wall') return null;

    const sourceLayers: any[] = Array.isArray(elementData.layers) && elementData.layers.length > 0
        ? elementData.layers.map((l: any) => ({ ...l }))
        : [{ name: 'Layer 1', function: 'structure', thickness: 0.1, materialColor: '#b0c4de' }];

    const editableLayers: any[] = sourceLayers.map((l: any) => ({ ...l }));

    // ── Outer wrapper ───────────────────────────────────────────────────────
    const wrap = document.createElement('div');
    wrap.className = 'wle-wrap';

    // Title row
    const titleRow = document.createElement('div');
    titleRow.className = 'wle-title-row';

    const title = document.createElement('div');
    title.className = 'wle-title';
    title.textContent = 'Layers';
    titleRow.appendChild(title);

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add Layer';
    addBtn.className = 'wle-add-btn';
    titleRow.appendChild(addBtn);
    wrap.appendChild(titleRow);

    // ── Column header ────────────────────────────────────────────────────────
    const colHeader = document.createElement('div');
    colHeader.className = 'wle-col-header';
    ['', 'Name', 'Function', 'mm', ''].forEach(text => {
        const h = document.createElement('div');
        h.className = 'wle-col-label';
        h.textContent = text;
        colHeader.appendChild(h);
    });
    wrap.appendChild(colHeader);

    // ── Row container (re-rendered on add/remove) ─────────────────────────
    const rowsContainer = document.createElement('div');
    wrap.appendChild(rowsContainer);

    function renderRows(): void {
        rowsContainer.innerHTML = '';
        editableLayers.forEach((layer: any, idx: number) => {
            const row = document.createElement('div');
            row.className = 'wle-row';

            // Color swatch
            const colorPick = document.createElement('input');
            colorPick.type = 'color';
            colorPick.value = layer.materialColor ?? FN_COLORS[layer.function] ?? '#cccccc';
            colorPick.className = 'wle-color-pick';
            colorPick.title = 'Layer colour';
            colorPick.addEventListener('input', () => { editableLayers[idx].materialColor = colorPick.value; });
            row.appendChild(colorPick);

            // Name
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = layer.name ?? '';
            nameInput.className = 'wle-input';
            nameInput.addEventListener('input', () => { editableLayers[idx].name = nameInput.value; });
            row.appendChild(nameInput);

            // Function
            const fnSel = document.createElement('select');
            fnSel.className = 'wle-input';
            LAYER_FUNCTIONS.forEach(({ value, label }) => {
                const opt = document.createElement('option');
                opt.value = value;
                opt.textContent = label;
                if (value === layer.function) opt.selected = true;
                fnSel.appendChild(opt);
            });
            fnSel.addEventListener('change', () => { editableLayers[idx].function = fnSel.value; });
            row.appendChild(fnSel);

            // Thickness (mm)
            const thkInput = document.createElement('input');
            thkInput.type = 'number';
            thkInput.min = '1';
            thkInput.step = '1';
            thkInput.value = Math.round((layer.thickness ?? 0) * 1000).toString();
            thkInput.className = 'wle-input wle-input--num';
            thkInput.addEventListener('change', () => {
                const mm = parseFloat(thkInput.value);
                if (!isNaN(mm) && mm > 0) {
                    editableLayers[idx].thickness = mm / 1000;
                    refreshTotal();
                }
            });
            row.appendChild(thkInput);

            // Remove button
            const removeBtn = document.createElement('button');
            removeBtn.textContent = '×';
            removeBtn.className = 'wle-remove-btn';
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

    // ── Total row ─────────────────────────────────────────────────────────
    const totalRow = document.createElement('div');
    totalRow.className = 'wle-total-row';

    const totalLabel = document.createElement('span');
    totalLabel.textContent = 'Total Thickness:';
    totalRow.appendChild(totalLabel);

    const totalVal = document.createElement('span');
    totalVal.className = 'wle-total-val';
    totalRow.appendChild(totalVal);

    function refreshTotal(): void {
        totalVal.textContent = `${totalMm(editableLayers)} mm`;
    }

    renderRows();
    refreshTotal();
    wrap.appendChild(totalRow);

    // Add-layer wires
    addBtn.addEventListener('click', () => {
        editableLayers.push({
            name: `Layer ${editableLayers.length + 1}`,
            function: 'structure',
            thickness: 0.012,
            materialColor: '#cccccc',
        });
        renderRows();
        refreshTotal();
    });

    // ── Save Layers button ────────────────────────────────────────────────
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save Layers';
    saveBtn.className = 'wle-save-btn';
    saveBtn.addEventListener('click', () => {
        const valid = editableLayers.every((l: any) => l.thickness > 0 && l.name?.trim());
        if (!valid) {
            saveBtn.textContent = '⚠ Fix layer data first';
            saveBtn.style.background = 'var(--app-status-error)';
            setTimeout(() => {
                saveBtn.textContent = 'Save Layers';
                saveBtn.style.background = '';
            }, 2000);
            return;
        }
        const snapshot = editableLayers.map((l: any) => ({ ...l }));
        onSave(snapshot);
        saveBtn.textContent = '✓ Saved';
        saveBtn.style.background = 'var(--app-success)';
        setTimeout(() => {
            saveBtn.textContent = 'Save Layers';
            saveBtn.style.background = '';
        }, 1800);
    });
    wrap.appendChild(saveBtn);

    return wrap;
}
