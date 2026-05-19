import * as THREE from '@pryzm/renderer-three/three';
import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';

/**
 * Creates a material <select> pre-populated with STANDARD_MATERIAL_LIBRARY options.
 *
 * Extracted from PropertyInspector.createMaterialSelect (Wave 7 WS-B split).
 *
 * @param currentId  The material ID that should be pre-selected.
 * @param onChange   Handler called on the native 'change' event.
 */
export function createMaterialSelect(
    currentId: string,
    onChange: (e: Event) => void,
): HTMLSelectElement {
    const select = document.createElement('select');
    select.className = 'pi-input';

    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = 'Custom Color';
    select.appendChild(noneOpt);

    STANDARD_MATERIAL_LIBRARY.forEach(mat => {
        const opt = document.createElement('option');
        opt.value = mat.id;
        opt.textContent = mat.label;
        if (mat.id === currentId) opt.selected = true;
        select.appendChild(opt);
    });

    select.onchange = onChange;
    return select;
}

/**
 * Appends column orientation controls (degree input + Rotate 90° / Flip 180° buttons)
 * to the given parent element.
 *
 * Extracted from PropertyInspector.addColumnOrientationControls (Wave 7 WS-B split).
 */
export function appendColumnOrientationControls(parent: HTMLElement, column: any): void {
    const label = document.createElement('div');
    label.className = 'pi-label';
    label.textContent = 'Rotation';

    const wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = '1fr 1fr';
    wrap.style.gap = '6px';

    const input = document.createElement('input');
    input.id = 'column-rotation-deg';
    input.type = 'number';
    input.className = 'pi-input';
    input.step = '90';
    input.value = `${Math.round(THREE.MathUtils.radToDeg(column.rotation ?? 0))}`;
    input.style.gridColumn = '1 / -1';

    const rotateBtn = document.createElement('button');
    rotateBtn.type = 'button';
    rotateBtn.textContent = 'Rotate 90°';
    rotateBtn.onclick = () => {
        input.value = `${(parseFloat(input.value || '0') + 90) % 360}`;
    };

    const flipBtn = document.createElement('button');
    flipBtn.type = 'button';
    flipBtn.textContent = 'Flip 180°';
    flipBtn.onclick = () => {
        input.value = `${(parseFloat(input.value || '0') + 180) % 360}`;
    };

    [rotateBtn, flipBtn].forEach(btn => {
        (btn as HTMLButtonElement).className = 'pi-input';
        (btn as HTMLButtonElement).style.cursor = 'pointer';
    });

    wrap.appendChild(input);
    wrap.appendChild(rotateBtn);
    wrap.appendChild(flipBtn);
    parent.appendChild(label);
    parent.appendChild(wrap);
}
