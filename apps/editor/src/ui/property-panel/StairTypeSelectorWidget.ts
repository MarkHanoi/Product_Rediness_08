/**
 * StairTypeSelectorWidget
 * -----------------------
 * Renders the Stair Type header row for the PropertyPanel.
 *
 * Shows:
 *  - Stair Type label
 *  - Dropdown: all BUILT_IN_STAIR_TYPES (id + name)
 *  - [Apply] button — fires the onApply callback immediately
 *
 * Contract compliance:
 *  - §01 CORE: No store writes here — mutations delegated to caller via callback
 *  - §01-1.1: Tool Layer only
 *  - §03: Reads BUILT_IN_STAIR_TYPES constant, never writes to any store
 *  - §05: All styles via stairts- CSS classes registered in AppTheme.ts
 */

import { BUILT_IN_STAIR_TYPES } from '@pryzm/geometry-stair';

export interface StairTypeApplyPayload {
    typeId: string | null;
}

/**
 * Builds the stair-type selector widget for the PropertyPanel header.
 *
 * @param elementData  - current stair's userData / store snapshot
 * @param onApply      - called with StairTypeApplyPayload when user clicks Apply
 * @returns HTMLElement or null when element is not a stair
 */
export function buildStairTypeSelectorWidget(
    elementData: Record<string, any>,
    onApply: (payload: StairTypeApplyPayload) => void
): HTMLElement | null {

    const elType = (elementData.elementType ?? elementData.type ?? '').toLowerCase();
    if (elType !== 'stair' && elType !== 'stairs') return null;

    const outer = document.createElement('div');
    outer.className = 'stairts-outer';

    const labelEl = document.createElement('div');
    labelEl.className = 'stairts-label';
    labelEl.textContent = 'Stair Type';
    outer.appendChild(labelEl);

    const row = document.createElement('div');
    row.className = 'stairts-row';

    const sel = document.createElement('select');
    sel.className = 'stairts-select';

    const currentTypeId: string = elementData.typeId ?? '';

    BUILT_IN_STAIR_TYPES.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        opt.className = 'stairts-opt-dark';
        if (t.id === currentTypeId) opt.selected = true;
        sel.appendChild(opt);
    });

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.className = 'stairts-apply-btn';

    applyBtn.addEventListener('click', () => {
        const selectedId = sel.value;
        const payload: StairTypeApplyPayload = {
            typeId: selectedId || null,
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
    row.appendChild(applyBtn);
    outer.appendChild(row);

    return outer;
}
