/**
 * ColumnTypeSelectorWidget
 * ------------------------
 * Renders the Column Type / Profile header row for the PropertyPanel.
 *
 * Shows:
 *  - Column Type label
 *  - Section-type dropdown: Rectangular, Circular, UC Steel, UB Steel
 *  - For concrete profiles: width / depth (mm) inputs
 *  - For steel profiles: profile name dropdown from SteelProfileLibrary
 *  - [Apply] button — fires the onApply callback immediately
 *
 * Contract compliance:
 *  - §01 CORE: No store writes — mutations delegated to caller via callback
 *  - §01-1.1: Tool Layer only
 *  - §03: Reads SteelProfileLibrary constant, never writes to any store
 *  - §05: All styles via colts- CSS classes registered in AppTheme.ts
 */

import { SteelProfileLibrary } from '@pryzm/plugin-structural';

export interface ColumnTypeApplyPayload {
    profile: 'rectangular' | 'circular' | 'UC' | 'UB';
    width: number;
    depth: number;
    steelProfileName?: string;
}

/**
 * Builds the column-type selector widget for the PropertyPanel header.
 *
 * @param elementData  - current column's userData / store snapshot
 * @param onApply      - called with ColumnTypeApplyPayload when user clicks Apply
 * @returns HTMLElement or null when element is not a column
 */
export function buildColumnTypeSelectorWidget(
    elementData: Record<string, any>,
    onApply: (payload: ColumnTypeApplyPayload) => void
): HTMLElement | null {

    const elType = (elementData.elementType ?? elementData.type ?? '').toLowerCase();
    if (elType !== 'column') return null;

    const currentProfile: string = elementData.profile ?? 'rectangular';
    const currentWidth: number  = elementData.width  ?? 0.3;
    const currentDepth: number  = elementData.depth  ?? 0.3;
    const currentSteel: string  = elementData.steelProfileName ?? '';

    const outer = document.createElement('div');
    outer.className = 'colts-outer';

    const labelEl = document.createElement('div');
    labelEl.className = 'colts-label';
    labelEl.textContent = 'Column Profile';
    outer.appendChild(labelEl);

    const topRow = document.createElement('div');
    topRow.className = 'colts-row';

    const profileSel = document.createElement('select');
    profileSel.className = 'colts-select';
    [
        { value: 'rectangular', label: 'Rectangular (Concrete)' },
        { value: 'circular',    label: 'Circular (Concrete)' },
        { value: 'UC',          label: 'Steel UC (Universal Column)' },
        { value: 'UB',          label: 'Steel UB (Used as Column)' },
    ].forEach(({ value, label }) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        opt.className = 'colts-opt-dark';
        if (value === currentProfile) opt.selected = true;
        profileSel.appendChild(opt);
    });

    topRow.appendChild(profileSel);
    outer.appendChild(topRow);

    const subRow = document.createElement('div');
    subRow.className = 'colts-sub-row';
    outer.appendChild(subRow);

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.className = 'colts-apply-btn';
    topRow.appendChild(applyBtn);

    function buildSubRow(profileType: string): void {
        subRow.innerHTML = '';

        if (profileType === 'rectangular') {
            const wLabel = document.createElement('span');
            wLabel.className = 'colts-dim-label';
            wLabel.textContent = 'W:';

            const wInput = document.createElement('input');
            wInput.type = 'number';
            wInput.className = 'colts-dim-input';
            wInput.min = '150';
            wInput.max = '2000';
            wInput.step = '50';
            wInput.value = Math.round(currentWidth * 1000).toString();
            wInput.title = 'Width (mm)';

            const dLabel = document.createElement('span');
            dLabel.className = 'colts-dim-label';
            dLabel.textContent = 'D:';

            const dInput = document.createElement('input');
            dInput.type = 'number';
            dInput.className = 'colts-dim-input';
            dInput.min = '150';
            dInput.max = '2000';
            dInput.step = '50';
            dInput.value = Math.round(currentDepth * 1000).toString();
            dInput.title = 'Depth (mm)';

            const mmLabel = document.createElement('span');
            mmLabel.className = 'colts-dim-label';
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
                onApply({ profile: 'rectangular', width: w, depth: d });
                flashApply(applyBtn);
            }, { once: true });

        } else if (profileType === 'circular') {
            const dLabel = document.createElement('span');
            dLabel.className = 'colts-dim-label';
            dLabel.textContent = 'Ø:';

            const dInput = document.createElement('input');
            dInput.type = 'number';
            dInput.className = 'colts-dim-input';
            dInput.min = '150';
            dInput.max = '2000';
            dInput.step = '50';
            dInput.value = Math.round(currentWidth * 1000).toString();
            dInput.title = 'Diameter (mm)';

            const mmLabel = document.createElement('span');
            mmLabel.className = 'colts-dim-label';
            mmLabel.textContent = 'mm';

            subRow.appendChild(dLabel);
            subRow.appendChild(dInput);
            subRow.appendChild(mmLabel);

            applyBtn.addEventListener('click', function handler() {
                const d = parseFloat(dInput.value) / 1000;
                if (isNaN(d) || d <= 0) return;
                onApply({ profile: 'circular', width: d, depth: d });
                flashApply(applyBtn);
            }, { once: true });

        } else {
            const series = profileType as 'UC' | 'UB';
            const profiles = series === 'UC' ? SteelProfileLibrary.UC : SteelProfileLibrary.UB;

            const steelSel = document.createElement('select');
            steelSel.className = 'colts-select';
            profiles.forEach((p) => {
                const opt = document.createElement('option');
                opt.value = p.name;
                opt.textContent = `${p.name}  (${p.mass} kg/m)`;
                opt.className = 'colts-opt-dark';
                if (p.name === currentSteel) opt.selected = true;
                steelSel.appendChild(opt);
            });

            subRow.appendChild(steelSel);

            applyBtn.addEventListener('click', function handler() {
                const name = steelSel.value;
                const p = profiles.find(pr => pr.name === name);
                if (!p) return;
                onApply({
                    profile: series,
                    width: parseFloat((p.B / 1000).toFixed(4)),
                    depth: parseFloat((p.D / 1000).toFixed(4)),
                    steelProfileName: p.name,
                });
                flashApply(applyBtn);
            }, { once: true });
        }
    }

    buildSubRow(currentProfile);

    profileSel.addEventListener('change', () => {
        buildSubRow(profileSel.value);
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
