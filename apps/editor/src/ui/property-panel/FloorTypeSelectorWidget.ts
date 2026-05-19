/**
 * FloorTypeSelectorWidget
 * -----------------------
 * Renders the Floor Type header row for the PropertyPanel.
 *
 * Shows:
 *  - Floor Type label
 *  - Dropdown: Plain Floor + all system types (name + mm)
 *  - Layer colour-strip preview
 *  - [Apply] button — fires the onApply callback immediately
 *
 * Contract compliance:
 *  - §01 CORE: No store writes here — mutations delegated to caller via callback
 *  - §01-1.1: Tool Layer only
 *  - §03: Reads from FloorSystemTypeStore (via window), never writes
 *  - §05: All styles via fts- CSS classes registered in AppTheme.ts
 *
 * Contract: docs/01_ELEMENTS/08_Floors_Contract/05-FLOOR-TYPE-SYSTEM-CONTRACT.md §7
 */

export interface FloorTypeApplyPayload {
    systemTypeId: string | null;
    layers: any[] | null;
    thickness: number | null;
}

/**
 * Builds the floor-type selector widget for the PropertyPanel header.
 *
 * @param elementData   - current floor's userData/store snapshot
 * @param onApply       - called with FloorTypeApplyPayload when user clicks Apply
 * @returns HTMLElement or null when element is not a floor or store is unavailable
 */
export function buildFloorTypeSelectorWidget(
    elementData: Record<string, any>,
    onApply: (payload: FloorTypeApplyPayload) => void
): HTMLElement | null {

    const elType = (elementData.elementType ?? elementData.type ?? '').toLowerCase();
    if (elType !== 'floor') return null;

    const typeStore = window.floorSystemTypeStore; // TODO(E.floor.S): legacy floorSystemTypeStore — replace with runtime.stores.floor (system types)
    const allTypes: any[] = typeStore?.getAll?.() ?? [];

    const outer = document.createElement('div');
    outer.className = 'fts-outer';

    const labelEl = document.createElement('div');
    labelEl.className = 'fts-label';
    labelEl.textContent = 'Floor Type';
    outer.appendChild(labelEl);

    const row = document.createElement('div');
    row.className = 'fts-row';

    const sel = document.createElement('select');
    sel.className = 'fts-select';

    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '— Plain Floor —';
    noneOpt.className = 'fts-opt-dark';
    sel.appendChild(noneOpt);

    allTypes.forEach((t: any) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        const thkMm = Math.round(t.totalThickness * 1000);
        opt.textContent = `${t.name}  (${thkMm}mm)`;
        opt.className = 'fts-opt-dark';
        if (t.id === elementData.systemTypeId) opt.selected = true;
        sel.appendChild(opt);
    });

    if (allTypes.length > 0) {
        const sep = document.createElement('option');
        sep.disabled = true;
        sep.textContent = '────────────────────';
        sep.className = 'fts-opt-sep';
        sel.appendChild(sep);
    }

    const dupOpt = document.createElement('option');
    dupOpt.value = '__duplicate__';
    dupOpt.textContent = 'Duplicate Type…';
    dupOpt.className = 'fts-opt-action';
    sel.appendChild(dupOpt);

    const newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = 'New Type…';
    newOpt.className = 'fts-opt-action';
    sel.appendChild(newOpt);

    const strip = document.createElement('div');
    strip.className = 'fts-strip';

    function refreshStrip(): void {
        strip.innerHTML = '';
        const id = sel.value;
        if (!id || id.startsWith('__')) {
            const s = document.createElement('div');
            s.style.cssText = 'flex:1;background:#d4c4a8;border-radius:3px;';
            strip.appendChild(s);
            return;
        }
        const t = typeStore?.getById?.(id);
        if (!t) return;
        t.layers.forEach((l: any) => {
            const s = document.createElement('div');
            s.style.cssText = `flex:${l.thickness};background:${l.materialColor ?? '#ccc'};`;
            s.title = `${l.name}: ${Math.round(l.thickness * 1000)}mm`;
            strip.appendChild(s);
        });
    }
    refreshStrip();

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.className = 'fts-apply-btn';

    sel.addEventListener('change', () => {
        const v = sel.value;

        if (v === '__duplicate__') {
            sel.value = elementData.systemTypeId ?? '';
            _handleDuplicate(elementData, typeStore, allTypes);
            return;
        }
        if (v === '__new__') {
            sel.value = elementData.systemTypeId ?? '';
            _handleNewType(typeStore);
            return;
        }

        refreshStrip();
    });

    applyBtn.addEventListener('click', () => {
        const selectedId = sel.value;

        if (selectedId.startsWith('__')) return;

        const newType = selectedId ? typeStore?.getById?.(selectedId) : null;

        const payload: FloorTypeApplyPayload = {
            systemTypeId: selectedId || null,
            layers: newType
                ? (structuredClone(newType.layers) as any[]).map((l: any) => ({ ...l }))
                : null,
            thickness: newType
                ? parseFloat(newType.totalThickness.toFixed(6))
                : null,
        };

        onApply(payload);

        applyBtn.textContent = '✓ Applied';
        applyBtn.style.background = 'rgba(22,163,74,0.6)';
        setTimeout(() => {
            applyBtn.textContent = 'Apply';
            applyBtn.style.background = '';
        }, 1800);
    });

    row.appendChild(sel);
    row.appendChild(strip);
    row.appendChild(applyBtn);
    outer.appendChild(row);
    return outer;
}

function _handleDuplicate(
    elementData: Record<string, any>,
    typeStore: any,
    allTypes: any[]
): void {
    const currentId = elementData.systemTypeId;
    const source = currentId ? typeStore?.getById?.(currentId) : null;

    if (!source && allTypes.length === 0) {
        alert('No floor type selected to duplicate. Select a type first.');
        return;
    }

    const base = source ?? allTypes[0];
    const newName = prompt(`Duplicate "${base.name}" — enter a name for the copy:`, `${base.name} (Copy)`);
    if (!newName?.trim()) return;

    const newId = `ft-${Date.now()}`;
    const newLayers = (structuredClone(base.layers) as any[]).map((l: any) => ({ ...l }));
    const totalThickness = parseFloat(newLayers.reduce((s: number, l: any) => s + l.thickness, 0).toFixed(6));

    typeStore?.addCustomType?.({
        id: newId,
        name: newName.trim(),
        description: `Duplicated from "${base.name}"`,
        layers: newLayers,
        totalThickness,
        category: 'custom',
        zoneTypes: base.zoneTypes ? [...base.zoneTypes] : ['dry'],
    });

    console.log('[FloorTypeSelectorWidget] Duplicated type:', newName.trim(), newId);
    alert(`Floor type "${newName.trim()}" created. Re-select the floor to see it in the list.`);
}

function _handleNewType(typeStore: any): void {
    const newName = prompt('New floor type name:', 'Custom Floor Type');
    if (!newName?.trim()) return;

    const thkStr = prompt('Total thickness (mm):', '75');
    const thkMm = parseFloat(thkStr ?? '75');
    if (isNaN(thkMm) || thkMm <= 0) {
        alert('Invalid thickness. Type not created.');
        return;
    }

    const newId = `ft-${Date.now()}`;
    const thickness = thkMm / 1000;

    typeStore?.addCustomType?.({
        id: newId,
        name: newName.trim(),
        description: 'User-defined floor type',
        layers: [
            { name: 'Floor Finish', thickness, function: 'finish', materialColor: '#C8C0B8' },
        ],
        totalThickness: thickness,
        category: 'custom',
        zoneTypes: ['dry'],
    });

    console.log('[FloorTypeSelectorWidget] Created new type:', newName.trim(), newId);
    alert(`Floor type "${newName.trim()}" created. Re-select the floor to see it in the list.`);
}
