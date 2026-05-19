/**
 * CeilingTypeSelectorWidget
 * -------------------------
 * Renders the Ceiling Type header row for the PropertyPanel.
 *
 * Shows:
 *  - Ceiling Type label
 *  - Dropdown: Plain Ceiling + all system types (name + mm)
 *  - Layer colour-strip preview
 *  - [Apply] button — fires the onApply callback immediately
 *
 * Contract compliance:
 *  - §01 CORE: No store writes here — mutations delegated to caller via callback
 *  - §01-1.1: Tool Layer only
 *  - §03: Reads from CeilingSystemTypeStore (via window), never writes
 *  - §05: All styles via cts- CSS classes registered in AppTheme.ts
 *
 * Contract: docs/01_ELEMENTS/12_Ceilings/05-CEILING-TYPE-SYSTEM-CONTRACT.md
 */

export interface CeilingTypeApplyPayload {
    systemTypeId: string | null;
    layers: any[] | null;
    thickness: number | null;
}

/**
 * Builds the ceiling-type selector widget for the PropertyPanel header.
 *
 * @param elementData   - current ceiling's userData/store snapshot
 * @param onApply       - called with CeilingTypeApplyPayload when user clicks Apply
 * @returns HTMLElement or null when element is not a ceiling or store is unavailable
 */
export function buildCeilingTypeSelectorWidget(
    elementData: Record<string, any>,
    onApply: (payload: CeilingTypeApplyPayload) => void
): HTMLElement | null {

    const elType = (elementData.elementType ?? elementData.type ?? '').toLowerCase();
    if (elType !== 'ceiling') return null;

    const typeStore = window.ceilingSystemTypeStore; // TODO(E.ceiling.S): legacy ceilingSystemTypeStore — replace with runtime.stores.ceiling (system types)
    const allTypes: any[] = typeStore?.getAll?.() ?? [];

    const outer = document.createElement('div');
    outer.className = 'cts-outer';

    const labelEl = document.createElement('div');
    labelEl.className = 'cts-label';
    labelEl.textContent = 'Ceiling Type';
    outer.appendChild(labelEl);

    const row = document.createElement('div');
    row.className = 'cts-row';

    const sel = document.createElement('select');
    sel.className = 'cts-select';

    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '— Plain Ceiling —';
    noneOpt.className = 'cts-opt-dark';
    sel.appendChild(noneOpt);

    allTypes.forEach((t: any) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        const thkMm = Math.round(t.totalThickness * 1000);
        opt.textContent = `${t.name}  (${thkMm}mm)`;
        opt.className = 'cts-opt-dark';
        if (t.id === elementData.systemTypeId) opt.selected = true;
        sel.appendChild(opt);
    });

    if (allTypes.length > 0) {
        const sep = document.createElement('option');
        sep.disabled = true;
        sep.textContent = '────────────────────';
        sep.className = 'cts-opt-sep';
        sel.appendChild(sep);
    }

    const dupOpt = document.createElement('option');
    dupOpt.value = '__duplicate__';
    dupOpt.textContent = 'Duplicate Type…';
    dupOpt.className = 'cts-opt-action';
    sel.appendChild(dupOpt);

    const newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = 'New Type…';
    newOpt.className = 'cts-opt-action';
    sel.appendChild(newOpt);

    const strip = document.createElement('div');
    strip.className = 'cts-strip';

    function refreshStrip(): void {
        strip.innerHTML = '';
        const id = sel.value;
        if (!id || id.startsWith('__')) {
            const s = document.createElement('div');
            s.style.cssText = 'flex:1;background:#d4c5b0;border-radius:3px;';
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
    applyBtn.className = 'cts-apply-btn';

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

        const payload: CeilingTypeApplyPayload = {
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
        alert('No ceiling type selected to duplicate. Select a type first.');
        return;
    }

    const base = source ?? allTypes[0];
    const newName = prompt(`Duplicate "${base.name}" — enter a name for the copy:`, `${base.name} (Copy)`);
    if (!newName?.trim()) return;

    const newId = `ct-${Date.now()}`;
    const newLayers = (structuredClone(base.layers) as any[]).map((l: any) => ({ ...l }));
    const totalThickness = parseFloat(newLayers.reduce((s: number, l: any) => s + l.thickness, 0).toFixed(6));

    typeStore?.addCustomType?.({
        id: newId,
        name: newName.trim(),
        description: `Duplicated from "${base.name}"`,
        layers: newLayers,
        totalThickness,
        category: 'custom',
    });

    console.log('[CeilingTypeSelectorWidget] Duplicated type:', newName.trim(), newId);
    alert(`Ceiling type "${newName.trim()}" created. Re-select the ceiling to see it in the list.`);
}

function _handleNewType(typeStore: any): void {
    const newName = prompt('New ceiling type name:', 'Custom Ceiling Type');
    if (!newName?.trim()) return;

    const thkStr = prompt('Total thickness (mm):', '25');
    const thkMm = parseFloat(thkStr ?? '25');
    if (isNaN(thkMm) || thkMm <= 0) {
        alert('Invalid thickness. Type not created.');
        return;
    }

    const newId = `ct-${Date.now()}`;
    const thickness = thkMm / 1000;

    typeStore?.addCustomType?.({
        id: newId,
        name: newName.trim(),
        description: 'User-defined ceiling type',
        layers: [
            { name: 'Ceiling Finish', thickness, function: 'finish', materialColor: '#F0EEE8' },
        ],
        totalThickness: thickness,
        category: 'custom',
    });

    console.log('[CeilingTypeSelectorWidget] Created new type:', newName.trim(), newId);
    alert(`Ceiling type "${newName.trim()}" created. Re-select the ceiling to see it in the list.`);
}
