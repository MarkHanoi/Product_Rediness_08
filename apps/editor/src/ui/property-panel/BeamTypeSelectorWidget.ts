/**
 * BeamTypeSelectorWidget
 * ----------------------
 * Renders the Beam Type / Section header row for the PropertyPanel.
 *
 * Shows:
 *  - Beam Type label
 *  - Section-type dropdown: Rectangular, UB Steel, UC Steel
 *  - For concrete: width / depth (mm) inputs
 *  - For steel: profile name dropdown from SteelProfileLibrary
 *  - [Apply] button — fires the onApply callback immediately
 *
 * Contract compliance:
 *  - §01 CORE: No store writes — mutations delegated to caller via callback
 *  - §01-1.1: Tool Layer only
 *  - §03: Reads SteelProfileLibrary constant, never writes to any store
 *  - §05: All styles via bts- CSS classes registered in AppTheme.ts
 */

import { SteelProfileLibrary } from '@pryzm/plugin-structural';

export interface BeamTypeApplyPayload {
    sectionType: 'rectangular' | 'UB' | 'UC';
    width: number;
    depth: number;
    steelProfileName?: string;
}

/**
 * Builds the beam-type selector widget for the PropertyPanel header.
 *
 * @param elementData  - current beam's userData / store snapshot
 * @param onApply      - called with BeamTypeApplyPayload when user clicks Apply
 * @returns HTMLElement or null when element is not a beam
 */
export function buildBeamTypeSelectorWidget(
    elementData: Record<string, any>,
    onApply: (payload: BeamTypeApplyPayload) => void
): HTMLElement | null {

    const elType = (elementData.elementType ?? elementData.type ?? '').toLowerCase();
    if (elType !== 'beam') return null;

    const currentSection: string = elementData.sectionType ?? 'rectangular';
    const currentWidth: number   = elementData.width  ?? 0.3;
    const currentDepth: number   = elementData.depth  ?? 0.5;
    const currentSteel: string   = elementData.steelProfileName ?? '';

    const outer = document.createElement('div');
    outer.className = 'bts-outer';

    const labelEl = document.createElement('div');
    labelEl.className = 'bts-label';
    labelEl.textContent = 'Beam Section';
    outer.appendChild(labelEl);

    const topRow = document.createElement('div');
    topRow.className = 'bts-row';

    const sectionSel = document.createElement('select');
    sectionSel.className = 'bts-select';
    [
        { value: 'rectangular', label: 'Rectangular (Concrete)' },
        { value: 'UB',          label: 'Steel UB (Universal Beam)' },
        { value: 'UC',          label: 'Steel UC (Used as Beam)' },
    ].forEach(({ value, label }) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        opt.className = 'bts-opt-dark';
        if (value === currentSection) opt.selected = true;
        sectionSel.appendChild(opt);
    });

    topRow.appendChild(sectionSel);
    outer.appendChild(topRow);

    const subRow = document.createElement('div');
    subRow.className = 'bts-sub-row';
    outer.appendChild(subRow);

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.className = 'bts-apply-btn';
    topRow.appendChild(applyBtn);

    function buildSubRow(sectionType: string): void {
        subRow.innerHTML = '';

        if (sectionType === 'rectangular') {
            const wLabel = document.createElement('span');
            wLabel.className = 'bts-dim-label';
            wLabel.textContent = 'W:';

            const wInput = document.createElement('input');
            wInput.type = 'number';
            wInput.className = 'bts-dim-input';
            wInput.min = '150';
            wInput.max = '1000';
            wInput.step = '25';
            wInput.value = Math.round(currentWidth * 1000).toString();
            wInput.title = 'Width (mm)';

            const dLabel = document.createElement('span');
            dLabel.className = 'bts-dim-label';
            dLabel.textContent = 'D:';

            const dInput = document.createElement('input');
            dInput.type = 'number';
            dInput.className = 'bts-dim-input';
            dInput.min = '200';
            dInput.max = '2000';
            dInput.step = '25';
            dInput.value = Math.round(currentDepth * 1000).toString();
            dInput.title = 'Depth (mm)';

            const mmLabel = document.createElement('span');
            mmLabel.className = 'bts-dim-label';
            mmLabel.textContent = 'mm';

            subRow.appendChild(wLabel);
            subRow.appendChild(wInput);
            subRow.appendChild(dLabel);
            subRow.appendChild(dInput);
            subRow.appendChild(mmLabel);

            applyBtn.addEventListener('click', function handler() {
                const w = parseFloat(wInput.value) / 1000;
                const d = parseFloat(dInput.value) / 1000;
                if (isNaN(w) || isNaN(d) || w <= 0 || d <= 0) return;
                onApply({ sectionType: 'rectangular', width: w, depth: d });
                flashApply(applyBtn);
            }, { once: true });

        } else {
            const series = sectionType as 'UB' | 'UC';
            const profiles = series === 'UB' ? SteelProfileLibrary.UB : SteelProfileLibrary.UC;

            const steelSel = document.createElement('select');
            steelSel.className = 'bts-select';
            profiles.forEach((p) => {
                const opt = document.createElement('option');
                opt.value = p.name;
                opt.textContent = `${p.name}  (${p.mass} kg/m)`;
                opt.className = 'bts-opt-dark';
                if (p.name === currentSteel) opt.selected = true;
                steelSel.appendChild(opt);
            });

            subRow.appendChild(steelSel);

            applyBtn.addEventListener('click', function handler() {
                const name = steelSel.value;
                const p = profiles.find(pr => pr.name === name);
                if (!p) return;
                onApply({
                    sectionType: series,
                    width: parseFloat((p.B / 1000).toFixed(4)),
                    depth: parseFloat((p.D / 1000).toFixed(4)),
                    steelProfileName: p.name,
                });
                flashApply(applyBtn);
            }, { once: true });
        }
    }

    buildSubRow(currentSection);

    sectionSel.addEventListener('change', () => {
        buildSubRow(sectionSel.value);
    });

    return outer;
}

function flashApply(btn: HTMLButtonElement): void {
    btn.textContent = '✓ Applied';
    btn.style.background = 'rgba(22,163,74,0.6)';
    setTimeout(() => {
        btn.textContent = 'Apply';
        btn.style.background = '';
    }, 1800);
}
