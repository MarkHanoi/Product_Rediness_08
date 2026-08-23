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

/**
 * §FIX-TYPE-CREATED-THEN-NOTHING (L-10068) — lane LAYERMAT10, 2026-08-23.
 *
 * Founder: *"new type creation doesn't work"*. His console, twice, and nothing after
 * it but unrelated topology rebuilds:
 *   [FloorTypeSelectorWidget] Created new type: Custom Floor Type st-1787522180714
 *   [FloorTypeSelectorWidget] Created new type: zfh st-1787522228499
 *
 * ⭐ MEASURED, and the two candidate halves are NOT both broken — which matters,
 * because they have different fixes and the log alone cannot tell them apart:
 *
 *   · APPLY / DISPATCH — **NOT BROKEN.** `onApply` -> `element.changeType` ->
 *     `UpdateFloorLayersCommand` on the LEGACY store is intact and exercised.
 *   · UI REFRESH — **THIS WAS THE WHOLE DEFECT.** The option list is built ONCE
 *     from `typeStore.getAll()` when the widget is constructed, and `_handleNewType`
 *     / `_handleDuplicate` wrote to the store and returned `void` with nothing
 *     listening. The type existed and was UNSELECTABLE.
 *
 * So no `UPDATE_FLOOR_TYPE` appeared in his console for the exact reason that he
 * could never reach the Apply button: you cannot apply what is not in the list. One
 * broken half, and it made the other half look broken too.
 *
 * ⛔ AND THE CODE SAID SO OUT LOUD. Both handlers ended with
 * `alert('... Re-select the floor to see it in the list.')` — a workaround shipped
 * in place of a fix, telling the user to work around a dropdown that could not
 * refresh itself. `WallTypeSelectorWidget` fixed exactly this for walls and its own
 * comment records the reasoning verbatim: *"The dropdown updates ITSELF ... A created
 * type is now immediately selectable, and selected."* This is that fix, for the
 * three families that never got it. The alert is REMOVED because it is now false.
 *
 * ⛔ CREATING A TYPE STILL DOES NOT APPLY IT. The new type is inserted and SELECTED;
 * committing it to this floor stays an explicit Apply. That is the wall widget's
 * rule and it is the same discipline as §FIX-LEVEL-MOVE-NEEDS-A-GESTURE (L-10060)
 * one file over: a model mutation needs a gesture, never a side effect of another one.
 *
 * ⚠ NAMED, NOT FIXED HERE — P6. This widget still calls `typeStore.add()` DIRECTLY
 * from the UI: no command, therefore no undo, no sync disposition and no RAC
 * reachability. The compliant route is `bus.executeCommand('elementType.create')`,
 * which walls use — but measured 2026-08-23, `elementTypeAuthoringAdapters.ts`
 * declares `family: 'wall'` and NOTHING ELSE, and `ElementTypeAuthoringRegistry`
 * declares only wall / door / window. There is no floor adapter to dispatch to.
 * Moving this family onto the command needs a store adapter, a registry declaration
 * and a bus-handler branch (the registry's own steps 1-4) — a real piece of work,
 * out of this report's scope, recorded here rather than left as an absence.
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

    // §FIX-TYPE-CREATED-THEN-NOTHING (L-10068) — the dropdown updates ITSELF.
    const status = document.createElement('div');
    status.className = 'ets-status';
    status.style.cssText = 'font-size:10px;line-height:1.4;margin-top:4px;color:rgba(255,255,255,0.85);display:none;';

    function _adoptCreatedType(t: any): void {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.name}  (${Math.round(t.totalThickness * 1000)}mm)`;
        opt.style.cssText = 'background:#1e3a5f;color:#fff;';
        // Before the separator when there is one, otherwise before the two action
        // rows — so a created type never lands underneath "New Type...".
        const anchor = sel.querySelector('option[disabled]')
            ?? sel.querySelector('option[value="__duplicate__"]');
        if (anchor) sel.insertBefore(opt, anchor); else sel.appendChild(opt);
        sel.value = t.id;
        refreshStrip();
        // C16 CA-21 — say what the route DID and what is still owed. Creating a type
        // deliberately does not retype this floor; the user is told the remaining
        // gesture instead of being left to wonder whether anything happened.
        status.style.display = 'block';
        status.textContent = `Type "${t.name}" created and selected — press Apply to use it on this floor.`;
    }

    sel.addEventListener('change', () => {
        const v = sel.value;

        if (v === '__duplicate__') {
            sel.value = elementData.systemTypeId ?? '';
            _handleDuplicate(elementData, typeStore, allTypes, _adoptCreatedType);
            return;
        }
        if (v === '__new__') {
            sel.value = elementData.systemTypeId ?? '';
            _handleNewType(typeStore, _adoptCreatedType);
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
    outer.appendChild(status);
    return outer;
}

function _handleDuplicate(
    elementData: Record<string, any>,
    typeStore: any,
    allTypes: any[],
    onCreated: (t: any) => void,
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
    // §FIX-TYPE-CREATED-THEN-NOTHING (L-10068) — READ THE RECORD BACK from the
    // store rather than handing the caller the literal we just built: the store is
    // the authority on what was actually stored, and a widget that re-renders from
    // its own input cannot notice a rejected or normalised write.
    const dup = typeStore?.getById?.(newId);
    if (dup) onCreated(dup);
    else console.warn('[FloorTypeSelectorWidget] Type created but not found in catalogue:', newId);
}

function _handleNewType(typeStore: any, onCreated: (t: any) => void): void {
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
    // §FIX-TYPE-CREATED-THEN-NOTHING (L-10068) — see _handleDuplicate.
    const created = typeStore?.getById?.(newId);
    if (created) onCreated(created);
    else console.warn('[FloorTypeSelectorWidget] Type created but not found in catalogue:', newId);
}
