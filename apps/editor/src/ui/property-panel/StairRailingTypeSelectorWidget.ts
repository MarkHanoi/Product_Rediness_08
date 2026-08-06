/**
 * StairRailingTypeSelectorWidget — §FIX-STAIR-RAILING-TYPE-PICKER
 * ===============================================================
 *
 * Renders the "Railing Type" header row for a selected STAIR RAILING, mirroring
 * `StairTypeSelectorWidget` (the shipped, proven picker the founder pointed at:
 * label + <select> over a catalogue + [Apply]).
 *
 * ── WHY THIS IS NOT `RailingTypeSelectorWidget` ──────────────────────────────
 *
 * That widget serves the STANDALONE handrail family (`handrailStore` /
 * `HandrailData`) and resolves the "current" selection by matching materialised
 * fields, because `HandrailData` carries no `typeId`. A stair railing is a different
 * element in a different store, and `StairRailingConfig` now DOES carry `typeId`, so
 * the current selection is read, not guessed. The catalogue is the SAME
 * (`handrailTypeStore`) — the five named types the draw-time picker offers — which is
 * the point: one vocabulary, two element families.
 *
 * Contract compliance:
 *  - §01 CORE / P6: no store writes here. Apply delegates to the caller, which
 *    dispatches `element.changeType` through the command bus.
 *  - §01-1.1: Tool Layer only — reads the type catalogue, writes nothing.
 *  - §05: reuses the shared `wts-*` classes, so no new theme registration.
 */

import { handrailTypeStore } from '@pryzm/core-app-model';

export interface StairRailingTypeApplyPayload {
    /** The chosen `HandrailTypeDefinition.id`. The bus handler resolves its fields. */
    typeId: string;
}

/** The metadata line the draw-time picker shows ("1100 mm · Glass"), kept identical. */
function describe(height: number, fillType: string): string {
    const mm = Math.round(height * 1000);
    const infill = fillType.charAt(0).toUpperCase() + fillType.slice(1);
    return `${mm} mm · ${infill}`;
}

/**
 * Builds the stair-railing "Railing Type" selector for the PropertyPanel header.
 *
 * @param elementData current stair-railing's userData/store snapshot
 * @param onApply     called with the chosen catalogue type id when Apply is clicked
 * @returns HTMLElement, or null when the element is not a stair railing / the
 *          catalogue offers no real choice (<2 types — nothing to swap to).
 */
export function buildStairRailingTypeSelectorWidget(
    elementData: Record<string, any>,
    onApply: (payload: StairRailingTypeApplyPayload) => void,
): HTMLElement | null {
    const elType = String(elementData.elementType ?? elementData.type ?? '').toLowerCase();
    if (elType !== 'stair-railing' && elType !== 'stairrailing') return null;

    const types = handrailTypeStore.getAll();
    if (types.length < 2) return null;

    const outer = document.createElement('div');
    outer.className = 'wts-outer';

    const labelEl = document.createElement('div');
    labelEl.className = 'wts-label';
    labelEl.textContent = 'Railing Type';
    outer.appendChild(labelEl);

    const row = document.createElement('div');
    row.className = 'wts-row';

    const sel = document.createElement('select');
    sel.className = 'wts-select';

    // A railing that has never been individually typed still follows its stair's
    // default. Say so rather than pre-selecting a type it does not have — the same
    // honesty rule the handrail widget applies to an unmatched record.
    const currentId: string | undefined = elementData.typeId;
    if (!currentId) {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '— Stair default —';
        placeholder.className = 'wts-opt-dark';
        sel.appendChild(placeholder);
    }

    types.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.name} (${describe(t.height, t.fillType)})`;
        opt.className = 'wts-opt-dark';
        sel.appendChild(opt);
    });
    sel.value = currentId ?? '';

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.className = 'wts-apply-btn';

    applyBtn.addEventListener('click', () => {
        const selectedId = sel.value;
        if (!selectedId || selectedId === currentId) return;
        if (!handrailTypeStore.getById(selectedId)) {
            console.warn('[StairRailingTypeSelectorWidget] type disappeared from the catalogue:', selectedId);
            return;
        }

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
