/**
 * RailingTypeSelectorWidget
 * -------------------------
 * §FIX-TYPE-SWAP-ALL-FAMILIES (L-623), mirroring §FEAT-ELEMENT-CHANGE-TYPE (ADR-0105).
 *
 * Renders the "Railing Type" header row for a PLACED railing/handrail in the
 * PropertyPanel — the family's FIRST selection surface. `HandrailTypeStore` has
 * shipped five built-in definitions (glass guardrail, stainless handrail, timber
 * baluster, steel guardrail, stair handrail) since it was authored and NOTHING in
 * the product could choose one: no widget, no bus verb, no command route. That is
 * the authored-but-unwired pattern L-621 found for ceilings, one family over.
 *
 * Behaviour:
 *  - Lists every definition in `handrailTypeStore` (built-in + user-defined).
 *  - Selecting a type + Apply fires `onApply` with the definition id AND its
 *    concrete field values.
 *
 * WHY THE FIELDS AND NOT JUST THE ID: `HandrailData` carries no `typeId` — a
 * railing type is MATERIALISED into the record, not referenced by it. So the type
 * is resolved here and its fields travel in the payload, exactly as the wall /
 * floor / slab widgets pass `layers` + `thickness` rather than making the handler
 * re-resolve the assembly. This is a declared limitation of the family's schema,
 * not a shortcut: until `HandrailData` gains a `systemTypeId`, a swapped railing
 * cannot report which type it came from, and a later edit to a custom type will
 * not propagate to railings already placed from it.
 *
 * Contract compliance:
 *  - §01 CORE: no store writes here — the mutation is delegated to the caller,
 *    which dispatches `element.changeType` (P6: commands are the only mutation path).
 *  - §01-1.1: Tool Layer only — reads the type catalogue, writes nothing.
 *  - §05: styles reuse the shared `wts-*` classes (same look as the wall/furniture
 *    pickers), so no new theme registration is required.
 */

import { handrailTypeStore } from '@pryzm/core-app-model';

export interface RailingTypeApplyPayload {
    /** The chosen `HandrailTypeDefinition.id` (carried for provenance/telemetry). */
    typeId: string;
    /** The definition's concrete fields — what actually lands on `HandrailData`. */
    height: number;
    thickness: number;
    baseOffset: number;
    fillType: string;
    railProfile: string;
    railDiameter?: number;
    postSpacing?: number;
    materialColor?: string;
    /**
     * §FEAT-HANDRAIL-TYPE-LIBRARY-20 (C95 D5) — the infill members. Without these
     * the RETYPE path would apply a different railing from the CREATE path for the
     * same catalogue entry (C84 EI-9).
     */
    balusterShape?: 'rectangular' | 'round';
    balusterWidth?: number;
    balusterSpacing?: number;
    infillMaxGap?: number;
}

/**
 * Builds the railing "Type" selector widget for the PropertyPanel header.
 *
 * @param elementData current railing element's userData/store snapshot
 * @param onApply     called with the target type + its fields when Apply is clicked
 * @returns HTMLElement, or null when the element is not a railing / the catalogue
 *          offers no real choice (<2 types — nothing to swap to).
 */
export function buildRailingTypeSelectorWidget(
    elementData: Record<string, any>,
    onApply: (payload: RailingTypeApplyPayload) => void,
): HTMLElement | null {
    const elType = (elementData.elementType ?? elementData.type ?? '').toLowerCase();
    if (elType !== 'railing' && elType !== 'handrail' && elType !== 'guardrail') return null;

    const types = handrailTypeStore.getAll();
    if (types.length < 2) return null;

    // The element carries no `typeId` (see the header note), so "current" is resolved
    // by matching the record's materialised fields against the catalogue. A railing
    // whose fields were edited individually matches nothing — which is honest: the
    // dropdown then opens on no selection rather than claiming a type it is not.
    const currentId = types.find(t =>
        t.height      === elementData.height
        && t.fillType    === elementData.fillType
        && t.railProfile === elementData.railProfile,
    )?.id;

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

    types.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        opt.className = 'wts-opt-dark';
        sel.appendChild(opt);
    });
    if (currentId) sel.value = currentId;

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.className = 'wts-apply-btn';

    applyBtn.addEventListener('click', () => {
        const selectedId = sel.value;
        if (!selectedId || selectedId === currentId) return;
        const def = handrailTypeStore.getById(selectedId);
        if (!def) {
            console.warn('[RailingTypeSelectorWidget] type disappeared from the catalogue:', selectedId);
            return;
        }

        onApply({
            typeId:        def.id,
            height:        def.height,
            thickness:     def.thickness,
            baseOffset:    def.baseOffset,
            fillType:      def.fillType,
            railProfile:   def.railProfile,
            railDiameter:  def.railDiameter,
            postSpacing:   def.postSpacing,
            materialColor: def.materialColor,
            // §FEAT-HANDRAIL-TYPE-LIBRARY-20 — materialise the type WHOLE.
            balusterShape:   def.balusterShape,
            balusterWidth:   def.balusterWidth,
            balusterSpacing: def.balusterSpacing,
            infillMaxGap:    def.infillMaxGap,
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
