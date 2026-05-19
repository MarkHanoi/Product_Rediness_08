/**
 * PlumbingTypeSelectorWidget
 * --------------------------
 * Renders the Plumbing Fixture Type header row for the PropertyPanel,
 * mirroring DoorTypeSelectorWidget / WallTypeSelectorWidget.
 *
 * Shows:
 *  - "Plumbing Type" label
 *  - Dropdown listing all variants applicable to the current fixture family
 *    (4 LOD400 toilet sub-families today; sink/bath default to a single entry
 *     and remain extensible — see Contract 39 §3).
 *  - Colour-strip preview of the variant's signature ceramic / metal palette.
 *  - [Apply] button — fires the onApply callback immediately.
 *
 * Contract compliance:
 *  - §01 CORE: No store writes here — mutations delegated to caller via callback.
 *  - §03 SEMANTIC: Reads variant catalogue from plumbingSystemTypeStore (window).
 *  - §39 PLUMBING-FIXTURE-TYPE-PATTERN: Type-as-data, swap via UpdatePlumbingParametersCommand.
 */

import {
    plumbingSystemTypeStore,
    TOILET_VARIANT_LABELS,
    SHOWER_VARIANT_LABELS,
} from '@pryzm/geometry-plumbing';
import type { PlumbingSystemType, ToiletVariant, ShowerVariant } from '@pryzm/geometry-plumbing';

export interface PlumbingTypeApplyPayload {
    /** Always sent. May equal the current variant if user hits Apply with no change. */
    toiletVariant?: ToiletVariant;
    /** Sent for shower fixtures. */
    showerVariant?: ShowerVariant;
}

function isPlumbingType(rawType: string): boolean {
    const t = (rawType || '').toLowerCase();
    return t === 'plumbingfixture'
        || t === 'plumbing_fixture'
        || t === 'plumbing';
}

export function buildPlumbingTypeSelectorWidget(
    elementData: Record<string, any>,
    onApply: (payload: PlumbingTypeApplyPayload) => void
): HTMLElement | null {

    const elType = elementData.elementType ?? elementData.type ?? '';
    if (!isPlumbingType(elType)) return null;

    const fixtureType: string = (elementData.fixtureType ?? '').toLowerCase();
    const variants: PlumbingSystemType[] = plumbingSystemTypeStore.getByFamily(fixtureType as any);
    if (variants.length === 0) return null;

    const outer = document.createElement('div');
    outer.className = 'dts-outer';

    const labelEl = document.createElement('div');
    labelEl.className = 'dts-label';
    const familyLabel = fixtureType.charAt(0).toUpperCase() + fixtureType.slice(1);
    labelEl.textContent = `${familyLabel} Type`;
    outer.appendChild(labelEl);

    const row = document.createElement('div');
    row.className = 'dts-row';

    const sel = document.createElement('select');
    sel.className = 'dts-select';

    const currentVariant: string | undefined =
        fixtureType === 'shower'
            ? (elementData.showerVariant ?? elementData.userData?.showerVariant)
            : (elementData.toiletVariant ?? elementData.userData?.toiletVariant);

    variants.forEach((v) => {
        const opt = document.createElement('option');
        opt.value = v.variant;
        opt.textContent = v.name;
        opt.className = 'dts-opt-dark';
        if (v.variant === currentVariant) opt.selected = true;
        sel.appendChild(opt);
    });

    const swatch = document.createElement('div');
    swatch.className = 'dts-swatch';

    function refreshSwatch(): void {
        swatch.innerHTML = '';
        const v = plumbingSystemTypeStore.getByVariant(sel.value);
        const ceramic = v?.ceramicColor ?? '#ffffff';
        const metal   = v?.metalColor   ?? '#aaaaaa';

        const c = document.createElement('div');
        c.style.cssText = `flex:2;background:${ceramic};border-radius:3px 0 0 3px;`;
        c.title = 'Ceramic';
        swatch.appendChild(c);

        const m = document.createElement('div');
        m.style.cssText = `flex:1;background:${metal};border-radius:0 3px 3px 0;`;
        m.title = 'Metal';
        swatch.appendChild(m);
    }
    refreshSwatch();

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.className = 'dts-apply-btn';

    sel.addEventListener('change', refreshSwatch);

    applyBtn.addEventListener('click', () => {
        const payload: PlumbingTypeApplyPayload = {};
        if (fixtureType === 'toilet' && TOILET_VARIANT_LABELS[sel.value as ToiletVariant]) {
            payload.toiletVariant = sel.value as ToiletVariant;
        }
        if (fixtureType === 'shower' && SHOWER_VARIANT_LABELS[sel.value as ShowerVariant]) {
            payload.showerVariant = sel.value as ShowerVariant;
        }
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
