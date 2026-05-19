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
 *  - §03: Reads from windowSystemTypeStore (via window), never writes
 *  - §05: All styles via wts- CSS classes registered in AppTheme.ts
 */

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

    const typeStore = window.windowSystemTypeStore; // TODO(E.window.S): legacy windowSystemTypeStore — replace with runtime.stores.window (system types)
    const allTypes: any[] = typeStore?.getAll?.() ?? [];

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

    if (allTypes.length > 0) {
        const sep = document.createElement('option');
        sep.disabled = true;
        sep.textContent = '────────────────────';
        sep.className = 'wts-opt-sep';
        sel.appendChild(sep);
    }

    const swatch = document.createElement('div');
    swatch.className = 'wts-swatch';

    function refreshSwatch(): void {
        swatch.innerHTML = '';
        const id = sel.value;
        if (!id) {
            const s = document.createElement('div');
            s.style.cssText = 'flex:1;background:#7ab8d4;border-radius:3px;';
            swatch.appendChild(s);
            return;
        }
        const t = typeStore?.getById?.(id);
        if (!t) return;

        const frameEl = document.createElement('div');
        frameEl.style.cssText = `flex:1;background:${t.frameFinish?.materialColor ?? '#888'};`;
        frameEl.title = `Frame: ${t.frameFinish?.name ?? ''}`;
        swatch.appendChild(frameEl);

        const glassEl = document.createElement('div');
        glassEl.style.cssText = `flex:3;background:${t.glazingFinish?.materialColor ?? '#7ab8d4'};`;
        glassEl.title = `Glazing: ${t.glazingFinish?.name ?? ''}`;
        swatch.appendChild(glassEl);
    }
    refreshSwatch();

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.className = 'wts-apply-btn';

    sel.addEventListener('change', () => {
        refreshSwatch();
    });

    applyBtn.addEventListener('click', () => {
        const selectedId = sel.value;
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
