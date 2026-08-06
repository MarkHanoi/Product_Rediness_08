/**
 * GenericTypeSelectorWidget — §FEAT-ELEMENT-TYPE-PICKER-REGISTRY
 * ==============================================================
 *
 * ONE widget that renders the type picker for ANY family declaring an
 * `ElementTypeCatalog`, so a new family gets a picker by publishing a catalogue
 * rather than by growing the `_buildTypeSelector` if-ladder (which is the reason
 * families without a picker were never reached — see ElementTypeCatalogRegistry).
 *
 * Visually and behaviourally identical to the proven bespoke pickers
 * (`StairTypeSelectorWidget`, `WallTypeSelectorWidget`): label + <select> + [Apply],
 * reusing the shared `wts-*` classes so no theme registration is required.
 *
 * The honest-refusal branch is the other half of the point: a family that declares
 * `unavailableReason` / `readOnlyReason` renders that sentence where the dropdown
 * would be. An element with no types must SAY it has no types; rendering nothing is
 * indistinguishable from the bug this pass fixes.
 *
 * Contract compliance:
 *  - §01 CORE / P6: no store writes. Apply delegates to `onApply`; the caller
 *    dispatches `element.changeType` through the command bus.
 *  - §01-1.1: Tool Layer only.
 */

import type { ElementTypeCatalog } from './ElementTypeCatalogRegistry';

export interface GenericTypeApplyPayload {
    typeId: string;
}

/**
 * Builds the type picker (or the honest "no types" note) for a declared family.
 *
 * @param catalog     the family's declaration
 * @param elementData the selected element's enriched record
 * @param onApply     called with the chosen type id when Apply is clicked
 * @returns the widget element, or null when the catalogue is published but empty
 *          (nothing to say, nothing to choose)
 */
export function buildGenericTypeSelectorWidget(
    catalog: ElementTypeCatalog,
    elementData: Record<string, any>,
    onApply: (payload: GenericTypeApplyPayload) => void,
): HTMLElement | null {
    const outer = document.createElement('div');
    outer.className = 'wts-outer';

    const labelEl = document.createElement('div');
    labelEl.className = 'wts-label';
    labelEl.textContent = catalog.label;
    outer.appendChild(labelEl);

    // ── Honest refusal ───────────────────────────────────────────────────────
    const refusal = catalog.unavailableReason ?? catalog.readOnlyReason;
    if (!catalog.listTypes) {
        if (!refusal) return null;   // a declaration must say one thing or the other
        const note = document.createElement('div');
        note.className = 'wts-note';
        note.textContent = refusal;
        note.style.cssText = 'font-size:11px;opacity:0.65;line-height:1.4;padding:2px 0;';
        outer.appendChild(note);
        return outer;
    }

    const types = catalog.listTypes();
    if (types.length === 0) return null;

    const row = document.createElement('div');
    row.className = 'wts-row';

    const sel = document.createElement('select');
    sel.className = 'wts-select';

    const currentId = catalog.currentTypeId?.(elementData);
    const known = currentId !== undefined && types.some(t => t.id === currentId);
    if (!known) {
        // The element's type is not in the catalogue (or it has none). Say so rather
        // than pre-selecting the first entry, which would misreport the element.
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = currentId ? `— ${currentId} (uncatalogued) —` : '— None —';
        placeholder.className = 'wts-opt-dark';
        sel.appendChild(placeholder);
    }

    types.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.detail ? `${t.name} (${t.detail})` : t.name;
        opt.className = 'wts-opt-dark';
        sel.appendChild(opt);
    });
    sel.value = known ? String(currentId) : '';

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.className = 'wts-apply-btn';

    applyBtn.addEventListener('click', () => {
        const selectedId = sel.value;
        if (!selectedId || selectedId === currentId) return;

        onApply({ typeId: selectedId });

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
