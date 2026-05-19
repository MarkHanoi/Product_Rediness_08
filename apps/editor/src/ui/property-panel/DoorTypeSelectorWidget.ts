/**
 * DoorTypeSelectorWidget
 * ----------------------
 * Renders the Door Type header row for the PropertyPanel.
 *
 * Shows:
 *  - Door Type label
 *  - Dropdown: Plain Door + all system types (name)
 *  - Frame / leaf colour swatch preview
 *  - [Apply] button — fires the onApply callback immediately
 *
 * Contract compliance:
 *  - §01 CORE: No store writes here — mutations delegated to caller via callback
 *  - §01-1.1: Tool Layer only
 *  - §03: Reads from doorSystemTypeStore via direct module import (DI cleanup,
 *         §DOOR-AUDIT-2026 — no longer uses window-global casts) // TODO(E.door.S): legacy window-cast — replace with runtime.stores.door (system types) — JSDoc reference
 *  - §05: All styles via dts- CSS classes registered in AppTheme.ts
 */

import { doorSystemTypeStore } from '@pryzm/geometry-door';

export interface DoorTypeApplyPayload {
    systemTypeId: string | null;
}

/**
 * Builds the door-type selector widget for the PropertyPanel header.
 *
 * @param elementData  - current door's userData / store snapshot
 * @param onApply      - called with DoorTypeApplyPayload when user clicks Apply
 * @returns HTMLElement or null when element is not a door or store is unavailable
 */
export function buildDoorTypeSelectorWidget(
    elementData: Record<string, any>,
    onApply: (payload: DoorTypeApplyPayload) => void
): HTMLElement | null {

    const elType = (elementData.elementType ?? elementData.type ?? '').toLowerCase();
    if (elType !== 'door') return null;

    // §DOOR-AUDIT-2026 (DI cleanup): direct module import; no window globals.
    const allTypes: any[] = doorSystemTypeStore.getAll() ?? [];

    const outer = document.createElement('div');
    outer.className = 'dts-outer';

    const labelEl = document.createElement('div');
    labelEl.className = 'dts-label';
    labelEl.textContent = 'Door Type';
    outer.appendChild(labelEl);

    const row = document.createElement('div');
    row.className = 'dts-row';

    const sel = document.createElement('select');
    sel.className = 'dts-select';

    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '— Plain Door —';
    noneOpt.className = 'dts-opt-dark';
    sel.appendChild(noneOpt);

    allTypes.forEach((t: any) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        opt.className = 'dts-opt-dark';
        if (t.id === elementData.systemTypeId) opt.selected = true;
        sel.appendChild(opt);
    });

    if (allTypes.length > 0) {
        const sep = document.createElement('option');
        sep.disabled = true;
        sep.textContent = '────────────────────';
        sep.className = 'dts-opt-sep';
        sel.appendChild(sep);
    }

    const swatch = document.createElement('div');
    swatch.className = 'dts-swatch';

    function refreshSwatch(): void {
        swatch.innerHTML = '';
        const id = sel.value;
        if (!id || id.startsWith('__')) {
            const s = document.createElement('div');
            s.style.cssText = 'flex:1;background:#8b6914;border-radius:3px;';
            swatch.appendChild(s);
            return;
        }
        const t = doorSystemTypeStore.getById?.(id);
        if (!t) return;

        const frameEl = document.createElement('div');
        frameEl.style.cssText = `flex:1;background:${t.frameFinish?.materialColor ?? '#555'};`;
        frameEl.title = `Frame: ${t.frameFinish?.name ?? ''}`;
        swatch.appendChild(frameEl);

        const leafEl = document.createElement('div');
        leafEl.style.cssText = `flex:2;background:${t.leafFinish?.materialColor ?? '#8b6914'};`;
        leafEl.title = `Leaf: ${t.leafFinish?.name ?? ''}`;
        swatch.appendChild(leafEl);
    }
    refreshSwatch();

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.className = 'dts-apply-btn';

    sel.addEventListener('change', () => {
        refreshSwatch();
    });

    applyBtn.addEventListener('click', () => {
        const selectedId = sel.value;
        const payload: DoorTypeApplyPayload = {
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
