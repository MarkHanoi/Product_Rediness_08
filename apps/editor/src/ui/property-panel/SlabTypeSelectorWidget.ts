/**
 * SlabTypeSelectorWidget
 * ----------------------
 * Renders the Slab Type header row for the PropertyPanel.
 *
 * Shows:
 *  - Slab Type label
 *  - Dropdown: Plain Slab + all system types (name + mm)
 *  - Layer colour-strip preview
 *  - [Apply] button — fires the onApply callback immediately
 *
 * Contract compliance:
 *  - §01 CORE: No store writes here — mutations delegated to caller via callback
 *  - §01-1.1: Tool Layer only
 *  - §03: Reads from SlabSystemTypeStore (via window), never writes
 */

export interface SlabTypeApplyPayload {
    systemTypeId: string | null;
    layers: any[] | null;
    thickness: number | null;
}

/**
 * Builds the slab-type selector widget for the PropertyPanel header.
 *
 * @param elementData   - current slab's userData/store snapshot
 * @param onApply       - called with SlabTypeApplyPayload when user clicks Apply
 * @returns HTMLElement or null when element is not a slab or store is unavailable
 */
export function buildSlabTypeSelectorWidget(
    elementData: Record<string, any>,
    onApply: (payload: SlabTypeApplyPayload) => void
): HTMLElement | null {

    const elType = (elementData.elementType ?? elementData.type ?? '').toLowerCase();
    if (elType !== 'slab') return null;

    const typeStore = window.slabSystemTypeStore; // TODO(E.slab.S): legacy slabSystemTypeStore — replace with runtime.stores.slab (system types)
    const allTypes: any[] = typeStore?.getAll?.() ?? [];

    const outer = document.createElement('div');
    outer.style.cssText = 'margin-bottom:6px;';

    const labelEl = document.createElement('div');
    labelEl.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.7);font-weight:600;margin-bottom:4px;letter-spacing:0.05em;text-transform:uppercase;';
    labelEl.textContent = 'Slab Type';
    outer.appendChild(labelEl);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;';

    const sel = document.createElement('select');
    sel.style.cssText = [
        'flex:1',
        'font-size:11px',
        'padding:4px 8px',
        'border-radius:6px',
        'border:none',
        'background:rgba(255,255,255,0.15)',
        'color:#fff',
        'cursor:pointer',
        'outline:none',
        'min-width:0',
    ].join(';');

    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '— Plain Slab —';
    noneOpt.style.cssText = 'background:#1e3a5f;color:#fff;';
    sel.appendChild(noneOpt);

    allTypes.forEach((t: any) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        const thkMm = Math.round(t.totalThickness * 1000);
        opt.textContent = `${t.name}  (${thkMm}mm)`;
        opt.style.cssText = 'background:#1e3a5f;color:#fff;';
        if (t.id === elementData.systemTypeId) opt.selected = true;
        sel.appendChild(opt);
    });

    if (allTypes.length > 0) {
        const sep = document.createElement('option');
        sep.disabled = true;
        sep.textContent = '────────────────────';
        sep.style.cssText = 'background:#1e3a5f;color:rgba(255,255,255,0.4);';
        sel.appendChild(sep);
    }

    const dupOpt = document.createElement('option');
    dupOpt.value = '__duplicate__';
    dupOpt.textContent = 'Duplicate Type…';
    dupOpt.style.cssText = 'background:#1e3a5f;color:#93c5fd;';
    sel.appendChild(dupOpt);

    const newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = 'New Type…';
    newOpt.style.cssText = 'background:#1e3a5f;color:#93c5fd;';
    sel.appendChild(newOpt);

    const strip = document.createElement('div');
    strip.style.cssText = 'display:flex;height:8px;width:44px;border-radius:3px;overflow:hidden;gap:1px;flex-shrink:0;';

    function refreshStrip(): void {
        strip.innerHTML = '';
        const id = sel.value;
        if (!id || id.startsWith('__')) {
            const s = document.createElement('div');
            s.style.cssText = 'flex:1;background:#909090;border-radius:3px;';
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
    applyBtn.style.cssText = [
        'font-size:10px',
        'padding:4px 10px',
        'background:rgba(255,255,255,0.2)',
        'border:1px solid rgba(255,255,255,0.35)',
        'border-radius:5px',
        'color:#fff',
        'cursor:pointer',
        'white-space:nowrap',
        'flex-shrink:0',
        'transition:background 0.1s',
    ].join(';');
    applyBtn.onmouseenter = () => { applyBtn.style.background = 'rgba(255,255,255,0.35)'; };
    applyBtn.onmouseleave = () => { applyBtn.style.background = 'rgba(255,255,255,0.2)'; };

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

        const payload: SlabTypeApplyPayload = {
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
            applyBtn.style.background = 'rgba(255,255,255,0.2)';
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
        alert('No slab type selected to duplicate. Select a type first.');
        return;
    }

    const base = source ?? allTypes[0];
    const newName = prompt(`Duplicate "${base.name}" — enter a name for the copy:`, `${base.name} (Copy)`);
    if (!newName?.trim()) return;

    const newId = `st-${Date.now()}`;
    const newLayers = (structuredClone(base.layers) as any[]).map((l: any) => ({ ...l }));
    const totalThickness = parseFloat(newLayers.reduce((s: number, l: any) => s + l.thickness, 0).toFixed(6));

    typeStore?.add?.({
        id: newId,
        name: newName.trim(),
        description: `Duplicated from "${base.name}"`,
        layers: newLayers,
        totalThickness,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
    });

    console.log('[SlabTypeSelectorWidget] Duplicated type:', newName.trim(), newId);
    alert(`Slab type "${newName.trim()}" created. Re-select the slab to see it in the list.`);
}

function _handleNewType(typeStore: any): void {
    const newName = prompt('New slab type name:', 'Custom Slab Type');
    if (!newName?.trim()) return;

    const thkStr = prompt('Total thickness (mm):', '200');
    const thkMm = parseFloat(thkStr ?? '200');
    if (isNaN(thkMm) || thkMm <= 0) {
        alert('Invalid thickness. Type not created.');
        return;
    }

    const newId = `st-${Date.now()}`;
    const thickness = thkMm / 1000;

    typeStore?.add?.({
        id: newId,
        name: newName.trim(),
        description: 'User-defined slab type',
        layers: [
            { name: 'Concrete Structure', thickness, function: 'structure', materialColor: '#909090' }
        ],
        totalThickness: thickness,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
    });

    console.log('[SlabTypeSelectorWidget] Created new type:', newName.trim(), newId);
    alert(`Slab type "${newName.trim()}" created. Re-select the slab to see it in the list.`);
}
