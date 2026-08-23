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

// §FEAT-LANDSCAPE-SLAB-TYPES (L-963) — the preview strip must RESOLVE a layer's
// master-catalogue reference. Landscape layers carry `materialId` and NO
// `materialColor` (C100 §2 — reference, never copy), so the previous
// `l.materialColor ?? '#ccc'` painted every landscape type a uniform grey: the
// picker would have contradicted the slab the user was about to get.
import { materialHexById } from '@pryzm/core-app-model/material-library';

/**
 * §FIX-TYPE-CREATED-THEN-NOTHING (L-10068) — lane LAYERMAT10, 2026-08-23.
 *
 * Founder: *"new type creation doesn't work"*. His console, twice, and nothing after
 * it but unrelated topology rebuilds:
 *   [SlabTypeSelectorWidget] Created new type: Custom Slab Type st-1787522180714
 *   [SlabTypeSelectorWidget] Created new type: zfh st-1787522228499
 *
 * ⭐ MEASURED, and the two candidate halves are NOT both broken — which matters,
 * because they have different fixes and the log alone cannot tell them apart:
 *
 *   · APPLY / DISPATCH — **NOT BROKEN.** `onApply` -> `element.changeType` ->
 *     `UpdateSlabLayersCommand` on the LEGACY store is intact and exercised.
 *   · UI REFRESH — **THIS WAS THE WHOLE DEFECT.** The option list is built ONCE
 *     from `typeStore.getAll()` when the widget is constructed, and `_handleNewType`
 *     / `_handleDuplicate` wrote to the store and returned `void` with nothing
 *     listening. The type existed and was UNSELECTABLE.
 *
 * So no `UPDATE_SLAB_TYPE` appeared in his console for the exact reason that he
 * could never reach the Apply button: you cannot apply what is not in the list. One
 * broken half, and it made the other half look broken too.
 *
 * ⛔ AND THE CODE SAID SO OUT LOUD. Both handlers ended with
 * `alert('... Re-select the slab to see it in the list.')` — a workaround shipped
 * in place of a fix, telling the user to work around a dropdown that could not
 * refresh itself. `WallTypeSelectorWidget` fixed exactly this for walls and its own
 * comment records the reasoning verbatim: *"The dropdown updates ITSELF ... A created
 * type is now immediately selectable, and selected."* This is that fix, for the
 * three families that never got it. The alert is REMOVED because it is now false.
 *
 * ⛔ CREATING A TYPE STILL DOES NOT APPLY IT. The new type is inserted and SELECTED;
 * committing it to this slab stays an explicit Apply. That is the wall widget's
 * rule and it is the same discipline as §FIX-LEVEL-MOVE-NEEDS-A-GESTURE (L-10060)
 * one file over: a model mutation needs a gesture, never a side effect of another one.
 *
 * ⚠ NAMED, NOT FIXED HERE — P6. This widget still calls `typeStore.add()` DIRECTLY
 * from the UI: no command, therefore no undo, no sync disposition and no RAC
 * reachability. The compliant route is `bus.executeCommand('elementType.create')`,
 * which walls use — but measured 2026-08-23, `elementTypeAuthoringAdapters.ts`
 * declares `family: 'wall'` and NOTHING ELSE, and `ElementTypeAuthoringRegistry`
 * declares only wall / door / window. There is no slab adapter to dispatch to.
 * Moving this family onto the command needs a store adapter, a registry declaration
 * and a bus-handler branch (the registry's own steps 1-4) — a real piece of work,
 * out of this report's scope, recorded here rather than left as an absence.
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
            const hex = (l.materialId ? materialHexById(l.materialId) : undefined) ?? l.materialColor ?? '#ccc';
            s.style.cssText = `flex:${l.thickness};background:${hex};`;
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
        // deliberately does not retype this slab; the user is told the remaining
        // gesture instead of being left to wonder whether anything happened.
        status.style.display = 'block';
        status.textContent = `Type "${t.name}" created and selected — press Apply to use it on this slab.`;
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
    // §FIX-TYPE-CREATED-THEN-NOTHING (L-10068) — READ THE RECORD BACK from the
    // store rather than handing the caller the literal we just built: the store is
    // the authority on what was actually stored, and a widget that re-renders from
    // its own input cannot notice a rejected or normalised write.
    const dup = typeStore?.getById?.(newId);
    if (dup) onCreated(dup);
    else console.warn('[SlabTypeSelectorWidget] Type created but not found in catalogue:', newId);
}

function _handleNewType(typeStore: any, onCreated: (t: any) => void): void {
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
    // §FIX-TYPE-CREATED-THEN-NOTHING (L-10068) — see _handleDuplicate.
    const created = typeStore?.getById?.(newId);
    if (created) onCreated(created);
    else console.warn('[SlabTypeSelectorWidget] Type created but not found in catalogue:', newId);
}
