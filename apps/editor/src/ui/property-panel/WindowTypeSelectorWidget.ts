/**
 * WindowTypeSelectorWidget
 * ------------------------
 * Renders the Window Type header row for the PropertyPanel.
 *
 * Shows:
 *  - Window Type label
 *  - Dropdown: Plain Window + all system types (name)
 *  - Frame / glass colour swatch preview
 *  - [Apply] button — fires the onApply callback immediately
 *
 * Contract compliance:
 *  - §01 CORE: No store writes here — mutations delegated to caller via callback
 *  - §01-1.1: Tool Layer only
 *  - §03: Reads from windowSystemTypeStore via direct module import (the
 *         `window.windowSystemTypeStore` global this file used to read was NEVER
 *         ASSIGNED anywhere in the app — the dropdown listed nothing but
 *         "— Plain Window —" while the pre-draw picker, which imports the store
 *         directly, showed the full catalogue). Never writes.
 *  - §05: All styles via wts- CSS classes registered in AppTheme.ts
 */

import { windowSystemTypeStore } from '@pryzm/geometry-window';
// §FEAT-HOSTED-TYPE-AUTHORING (C65) — the shared "Duplicate Type… / New Type…"
// machinery. Entries render ONLY when the family declares authoring; the mutation
// travels the elementType.* bus commands (P6), never a store write from here.
import {
    appendTypeAuthoringOptions,
    handleFinishTypeAuthoring,
    DUPLICATE_TYPE_OPTION,
    NEW_TYPE_OPTION,
} from './FinishTypeAuthoringActions';

export interface WindowTypeApplyPayload {
    systemTypeId: string | null;
}

/**
 * Builds the window-type selector widget for the PropertyPanel header.
 *
 * @param elementData  - current window's userData / store snapshot
 * @param onApply      - called with WindowTypeApplyPayload when user clicks Apply
 * @returns HTMLElement or null when element is not a window or store is unavailable
 */
export function buildWindowTypeSelectorWidget(
    elementData: Record<string, any>,
    onApply: (payload: WindowTypeApplyPayload) => void
): HTMLElement | null {

    const elType = (elementData.elementType ?? elementData.type ?? '').toLowerCase();
    if (elType !== 'window') return null;

    const typeStore = windowSystemTypeStore;
    const allTypes: any[] = typeStore.getAll() ?? [];

    const outer = document.createElement('div');
    outer.className = 'wts-outer';

    const labelEl = document.createElement('div');
    labelEl.className = 'wts-label';
    labelEl.textContent = 'Window Type';
    outer.appendChild(labelEl);

    const row = document.createElement('div');
    row.className = 'wts-row';

    const sel = document.createElement('select');
    sel.className = 'wts-select';

    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '— Plain Window —';
    noneOpt.className = 'wts-opt-dark';
    sel.appendChild(noneOpt);

    allTypes.forEach((t: any) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        opt.className = 'wts-opt-dark';
        if (t.id === elementData.systemTypeId) opt.selected = true;
        sel.appendChild(opt);
    });

    // §FEAT-HOSTED-TYPE-AUTHORING — separator + Duplicate/New entries, iff declared.
    const authoring = appendTypeAuthoringOptions(sel, 'window', allTypes.length > 0);

    // §CONTEXT-DATA-HONESTY (C65 §3.4) — a window referencing a type that is NOT in
    // the catalogue must show AS the missing reference, selected — never render as
    // "— Plain Window —" so failure and "genuinely plain" read as the same value.
    const currentId = elementData.systemTypeId as string | undefined;
    if (currentId && !typeStore.getById?.(currentId)) {
        const missing = document.createElement('option');
        missing.value = currentId;
        missing.textContent = `⚠ Missing type (${currentId})`;
        missing.className = 'wts-opt-dark';
        missing.selected = true;
        sel.insertBefore(missing, sel.firstChild);
    }

    const swatch = document.createElement('div');
    swatch.className = 'wts-swatch';

    function refreshSwatch(): void {
        swatch.innerHTML = '';
        const id = sel.value;
        if (!id || id.startsWith('__')) {
            const s = document.createElement('div');
            s.style.cssText = 'flex:1;background:#7ab8d4;border-radius:3px;';
            swatch.appendChild(s);
            return;
        }
        const t = typeStore.getById?.(id);
        if (!t) return;

        const frameEl = document.createElement('div');
        frameEl.style.cssText = `flex:1;background:${t.frameFinish?.materialColor ?? '#888'};`;
        frameEl.title = `Frame: ${t.frameFinish?.name ?? ''}`;
        swatch.appendChild(frameEl);

        // §FEAT-HOSTED-TYPE-AUTHORING — was `t.glazingFinish`, a field that does not
        // exist on WindowSystemType (the second finish slot is `sillFinish`), so the
        // swatch always painted the fallback colour. Now reads the real field.
        const sillEl = document.createElement('div');
        sillEl.style.cssText = `flex:3;background:${t.sillFinish?.materialColor ?? '#7ab8d4'};`;
        sillEl.title = `Sill: ${t.sillFinish?.name ?? ''}`;
        swatch.appendChild(sillEl);
    }
    refreshSwatch();

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.className = 'wts-apply-btn';

    sel.addEventListener('change', () => {
        const v = sel.value;
        if (v === DUPLICATE_TYPE_OPTION || v === NEW_TYPE_OPTION) {
            // Opening the editor must not look like a type change, and Cancel must
            // leave the window exactly as it was.
            sel.value = elementData.systemTypeId ?? '';
            if (!authoring) return;
            handleFinishTypeAuthoring({
                mode: v === NEW_TYPE_OPTION ? 'create' : 'duplicate',
                family: 'window',
                store: typeStore,
                currentTypeId: elementData.systemTypeId,
                onCreated: (created) => {
                    // The dropdown updates ITSELF — a created type is immediately
                    // selectable, and selected. Creating a type does not retype the
                    // selected window; that is a separate, explicit act (Apply).
                    const opt = document.createElement('option');
                    opt.value = created.id;
                    opt.textContent = created.name;
                    opt.className = 'wts-opt-dark';
                    sel.insertBefore(opt, sel.querySelector('.wts-opt-sep'));
                    sel.value = created.id;
                    refreshSwatch();
                },
            });
            return;
        }
        refreshSwatch();
    });

    applyBtn.addEventListener('click', () => {
        const selectedId = sel.value;
        if (selectedId.startsWith('__')) return;
        const payload: WindowTypeApplyPayload = {
            systemTypeId: selectedId || null,
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
    row.appendChild(swatch);
    row.appendChild(applyBtn);
    outer.appendChild(row);

    return outer;
}
