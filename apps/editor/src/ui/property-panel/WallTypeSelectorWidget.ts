/**
 * WallTypeSelectorWidget
 * ----------------------
 * Renders the Wall Type header row for the PropertyPanel.
 *
 * Shows:
 *  - Wall Type label
 *  - Dropdown: Plain Wall + all system types (name + mm)
 *  - Layer colour-strip preview
 *  - [Apply] button — fires the onApply callback immediately
 *
 * Contract compliance:
 *  - §01 CORE: No store writes here — mutations delegated to caller via callback
 *  - §01-1.1: Tool Layer only
 *  - §03: Reads from WallSystemTypeStore (via window), never writes
 *  - §05: All styles via wts- CSS classes in AppTheme.ts
 */

export interface WallTypeApplyPayload {
    systemTypeId: string | null;
    layers: any[] | null;
    thickness: number | null;
}

/**
 * Builds the wall-type selector widget for the PropertyPanel header.
 *
 * @param elementData   - current wall's userData/store snapshot
 * @param onApply       - called with WallTypeApplyPayload when user clicks Apply
 * @returns HTMLElement or null when element is not a wall or store is unavailable
 */
export function buildWallTypeSelectorWidget(
    elementData: Record<string, any>,
    onApply: (payload: WallTypeApplyPayload) => void,
    opts?: { applyOnChange?: boolean }
): HTMLElement | null {

    const elType = (elementData.elementType ?? elementData.type ?? '').toLowerCase();
    if (elType !== 'wall') return null;

    const typeStore = window.wallSystemTypeStore; // TODO(E.wall.S): legacy wallSystemTypeStore — replace with runtime.stores.wall (system types)
    const allTypes: any[] = typeStore?.getAll?.() ?? [];

    // ── Outer wrapper ────────────────────────────────────────────────────────
    const outer = document.createElement('div');
    outer.className = 'wts-outer';

    // "Wall Type" label row
    const labelEl = document.createElement('div');
    labelEl.className = 'wts-label';
    labelEl.textContent = 'Wall Type';
    outer.appendChild(labelEl);

    // Row: dropdown + strip + apply button
    const row = document.createElement('div');
    row.className = 'wts-row';

    // ── Dropdown ─────────────────────────────────────────────────────────────
    const sel = document.createElement('select');
    sel.className = 'wts-select';

    // Plain wall option
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '— Plain Wall —';
    noneOpt.className = 'wts-opt-dark';
    sel.appendChild(noneOpt);

    // System type options
    allTypes.forEach((t: any) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        const thkMm = Math.round(t.totalThickness * 1000);
        opt.textContent = `${t.name}  (${thkMm}mm)`;
        opt.className = 'wts-opt-dark';
        if (t.id === elementData.systemTypeId) opt.selected = true;
        sel.appendChild(opt);
    });

    // Separator + action options
    if (allTypes.length > 0) {
        const sep = document.createElement('option');
        sep.disabled = true;
        sep.textContent = '────────────────────';
        sep.className = 'wts-opt-sep';
        sel.appendChild(sep);
    }

    const dupOpt = document.createElement('option');
    dupOpt.value = '__duplicate__';
    dupOpt.textContent = 'Duplicate Type…';
    dupOpt.className = 'wts-opt-action';
    sel.appendChild(dupOpt);

    const newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = 'New Type…';
    newOpt.className = 'wts-opt-action';
    sel.appendChild(newOpt);

    // ── Colour strip preview ─────────────────────────────────────────────────
    const strip = document.createElement('div');
    strip.className = 'wts-strip';

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

    // ── Apply button ─────────────────────────────────────────────────────────
    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.className = 'wts-apply-btn';

    // Build the apply payload for a concrete selected type id ('' = plain wall).
    function buildPayload(selectedId: string): WallTypeApplyPayload {
        const newType = selectedId ? typeStore?.getById?.(selectedId) : null;
        return {
            systemTypeId: selectedId || null,
            layers: newType
                ? (structuredClone(newType.layers) as any[]).map((l: any) => ({ ...l }))
                : null,
            thickness: newType
                ? parseFloat(newType.totalThickness.toFixed(6))
                : null,
        };
    }

    // ── Event handlers ────────────────────────────────────────────────────────
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

        // §WALL-TYPE-PLAN-FIX: in the new-wall pre-draw context (applyOnChange),
        // selecting a type from the dropdown applies it immediately — the user no
        // longer has to ALSO click "Apply" (which is the trap that left plan-drawn
        // walls stuck on the default). The existing-wall properties panel leaves
        // applyOnChange off, so browsing its dropdown still does NOT mutate the wall
        // until Apply is pressed.
        if (opts?.applyOnChange && !v.startsWith('__')) {
            onApply(buildPayload(v));
        }
    });

    applyBtn.addEventListener('click', () => {
        const selectedId = sel.value;

        if (selectedId.startsWith('__')) return;

        onApply(buildPayload(selectedId));

        // Visual feedback
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

// ─── Action helpers ──────────────────────────────────────────────────────────

function _handleDuplicate(
    elementData: Record<string, any>,
    typeStore: any,
    allTypes: any[]
): void {
    const currentId = elementData.systemTypeId;
    const source = currentId ? typeStore?.getById?.(currentId) : null;

    if (!source && allTypes.length === 0) {
        alert('No wall type selected to duplicate. Select a type first.');
        return;
    }

    const base = source ?? allTypes[0];
    const newName = prompt(`Duplicate "${base.name}" — enter a name for the copy:`, `${base.name} (Copy)`);
    if (!newName?.trim()) return;

    const newId = `wt-${Date.now()}`;
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

    console.log('[WallTypeSelectorWidget] Duplicated type:', newName.trim(), newId);
    alert(`Wall type "${newName.trim()}" created. Re-select the wall to see it in the list.`);
}

function _handleNewType(typeStore: any): void {
    const newName = prompt('New wall type name:', 'Custom Wall Type');
    if (!newName?.trim()) return;

    const thkStr = prompt('Total thickness (mm):', '200');
    const thkMm = parseFloat(thkStr ?? '200');
    if (isNaN(thkMm) || thkMm <= 0) {
        alert('Invalid thickness. Type not created.');
        return;
    }

    const newId = `wt-${Date.now()}`;
    const thickness = thkMm / 1000;

    typeStore?.add?.({
        id: newId,
        name: newName.trim(),
        description: 'User-defined wall type',
        layers: [
            { name: 'Wall Body', thickness, function: 'structure', materialColor: '#d4c5b0' }
        ],
        totalThickness: thickness,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
    });

    console.log('[WallTypeSelectorWidget] Created new type:', newName.trim(), newId);
    alert(`Wall type "${newName.trim()}" created. Re-select the wall to see it in the list.`);
}
