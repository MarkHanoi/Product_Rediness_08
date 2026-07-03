/**
 * FurnitureTypeSelectorWidget
 * ---------------------------
 * §FEAT-ELEMENT-CHANGE-TYPE (ADR-0105).
 *
 * Renders the "Type" header row for a PLACED furniture element in the
 * PropertyPanel — the founder's requested "change type" dropdown, generalised
 * from the wall WALL TYPE picker to the furniture family.
 *
 * Behaviour:
 *  - Lists every furniture type in the element's CURRENT category (e.g. select a
 *    sofa → the dropdown offers all sofas). Category is read from the element's
 *    `furnitureCategory`, or derived from its `furnitureType` when absent.
 *  - Selecting a new type + clicking Apply fires the onApply callback with the
 *    target type id + its catalogue default dimensions/colour/material so the
 *    swapped piece reads at the right scale. Position/rotation/host are preserved
 *    by the command, NOT this widget.
 *
 * Contract compliance:
 *  - §01 CORE: no store writes here — mutation delegated to the caller via callback.
 *  - §01-1.1: Tool Layer only. Reads the pure FurnitureCategoryRegistry (no THREE,
 *    no engine/store imports).
 *  - §05: styles reuse the shared `wts-*` classes (same look as the wall picker).
 */

import { deriveCategoryFromType, type FurnitureType } from '@pryzm/geometry-furniture';
import {
    getItemsForCategory,
    getDescriptorForType,
    getCategoryForType,
    type FurnitureTypeDescriptor,
} from '../furniture-carousel/FurnitureCategoryRegistry';

export interface FurnitureTypeApplyPayload {
    /** Target furniture type (its builder/asset). */
    newFurnitureType: FurnitureType;
    /** Target subcategory tag (kept in sync with the type). */
    furnitureCategory?: string;
    /** Catalogue default dimensions for the target type (metres). */
    width?: number;
    length?: number;
    height?: number;
    baseOffset?: number;
    color?: string;
    material?: string;
}

/**
 * Builds the furniture "Type" selector widget for the PropertyPanel header.
 *
 * @param elementData  current furniture element's userData/store snapshot
 * @param onApply      called with the target type + defaults when Apply is clicked
 * @returns HTMLElement, or null when the element is not furniture / has no category peers
 */
export function buildFurnitureTypeSelectorWidget(
    elementData: Record<string, any>,
    onApply: (payload: FurnitureTypeApplyPayload) => void,
): HTMLElement | null {
    const elType = (elementData.elementType ?? elementData.type ?? '').toLowerCase();
    if (elType !== 'furniture') return null;

    const currentType = elementData.furnitureType as FurnitureType | undefined;
    if (!currentType) return null;

    // §FIX-FURNITURE-TYPE-LIST-AND-UNDO (L-68) — resolve the category from the
    // REGISTRY that actually holds the dropdown items (reverse type→category)
    // FIRST, so the peer list is guaranteed to be the element's OWN family
    // (bed → beds), never a mismatched set. Neither the stored `furnitureCategory`
    // nor `deriveCategoryFromType` can be trusted here: both flow from the separate
    // `FURNITURE_TYPE_TO_CATEGORY` taxonomy which maps `bed → 'bedroom'`, whose
    // registry items are dresser + mirrors (the founder's wrong list). They remain
    // as fallbacks only for a type that isn't stocked in the carousel registry.
    let category = getCategoryForType(currentType) as string | undefined;
    if (!category) category = elementData.furnitureCategory as string | undefined;
    if (!category) {
        try { category = deriveCategoryFromType(currentType); }
        catch { return null; } // unknown type — no peer list to offer.
    }

    let items: readonly FurnitureTypeDescriptor[] = [];
    try { items = getItemsForCategory(category as any); }
    catch { items = []; }

    // §FIX-FURNITURE-TYPE-LIST-AND-UNDO (L-68) — de-duplicate by furniture TYPE.
    // A "change type" dropdown lists each type ONCE: some categories stock several
    // colour/finish CARDS that share one `type` (e.g. sofas has Sofa 3-Seat in
    // charcoal/beige/navy — all `sofa_3seat`). Three identical-value <option>s make
    // the single-select ambiguous and break current-type pre-selection (the current
    // type resolves to the wrong entry). First occurrence wins — matching
    // `getDescriptorForType`, which the Apply handler uses for the target defaults.
    const seen = new Set<string>();
    items = items.filter((it) => {
        const key = String(it.type);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Only surface the picker when there is a real choice (>1 peer). A category
    // with a single item offers nothing to swap to.
    if (items.length < 2) return null;

    // ── Outer wrapper (reuse wall-type-selector styling) ────────────────────
    const outer = document.createElement('div');
    outer.className = 'wts-outer';

    const labelEl = document.createElement('div');
    labelEl.className = 'wts-label';
    labelEl.textContent = 'Type';
    outer.appendChild(labelEl);

    const row = document.createElement('div');
    row.className = 'wts-row';

    // ── Dropdown ────────────────────────────────────────────────────────────
    const sel = document.createElement('select');
    sel.className = 'wts-select';

    items.forEach((it) => {
        const opt = document.createElement('option');
        opt.value = String(it.type);
        opt.textContent = it.label;
        opt.className = 'wts-opt-dark';
        if (it.type === currentType) opt.selected = true;
        sel.appendChild(opt);
    });
    // §FIX-FURNITURE-TYPE-LIST-AND-UNDO (L-68) — pre-select the element's CURRENT
    // type explicitly. Setting `select.value` is the robust cross-environment way
    // (a per-option `.selected` flag is not reliably reflected in `select.value`);
    // this guarantees the dropdown opens showing the element's own type, so a
    // no-change Apply is correctly a no-op.
    sel.value = String(currentType);

    // ── Apply button ────────────────────────────────────────────────────────
    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.className = 'wts-apply-btn';

    applyBtn.addEventListener('click', () => {
        const selectedType = sel.value as FurnitureType;
        if (!selectedType || selectedType === currentType) return;

        const desc = getDescriptorForType(selectedType);
        const dims = desc?.defaultDimensions;
        onApply({
            newFurnitureType:  selectedType,
            furnitureCategory: category,
            width:             dims?.width,
            length:            dims?.length,
            height:            dims?.height,
            baseOffset:        dims?.baseOffset,
            color:             desc?.defaultColor,
            material:          desc?.defaultMaterial,
        });

        applyBtn.textContent = '✓ Applied';
        applyBtn.style.background = 'rgba(22,163,74,0.6)';
        setTimeout(() => {
            applyBtn.textContent = 'Apply';
            applyBtn.style.background = '';
        }, 1800);
    });

    row.appendChild(sel);
    row.appendChild(applyBtn);
    outer.appendChild(row);
    return outer;
}
