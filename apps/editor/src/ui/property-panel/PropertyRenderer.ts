/**
 * PropertyRenderer
 *
 * Renders PropertyDescriptor[] into DOM elements.
 * Maintains a draft map — changes are recorded without mutating stores.
 *
 * Contract: Tool Layer only. Pure DOM, no store writes.
 */

import { PropertyDescriptor } from './types';
import { SECTION_STEPS } from './PropertyPanelTheme';

export function renderPropertyRow(
    descriptor: PropertyDescriptor,
    currentValue: any,
    draft: Map<string, any>,
    validationErrors: Map<string, string>
): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:contents;';

    const label = document.createElement('div');
    label.className = 'gpp-prop-label';
    label.textContent = descriptor.label + (descriptor.unit ? ` (${descriptor.unit})` : '');
    row.appendChild(label);

    const inputWrap = document.createElement('div');
    inputWrap.style.cssText = 'align-self:center;';

    const errMsg = validationErrors.get(descriptor.key);

    if (!descriptor.editable || descriptor.type === 'readonly') {
        const val = document.createElement('div');
        val.className = 'gpp-prop-value-ro';
        val.textContent = formatValue(currentValue);
        val.title = 'Click to copy';
        val.addEventListener('click', () => {
            navigator.clipboard?.writeText(String(currentValue ?? '')).catch(() => {});
        });
        inputWrap.appendChild(val);
    } else if (descriptor.type === 'number') {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.className = 'gpp-input' + (errMsg ? ' error' : '');
        inp.value = currentValue !== undefined && currentValue !== null ? String(currentValue) : '';
        if (descriptor.min !== undefined) inp.min = String(descriptor.min);
        if (descriptor.max !== undefined) inp.max = String(descriptor.max);
        if (descriptor.step !== undefined) inp.step = String(descriptor.step);
        inp.addEventListener('input', () => {
            const v = parseFloat(inp.value);
            if (!isNaN(v)) draft.set(descriptor.key, v);
        });
        inp.setAttribute('data-prop-key', descriptor.key);
        inputWrap.appendChild(inp);
    } else if (descriptor.type === 'text') {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'gpp-input';
        inp.value = currentValue !== undefined ? String(currentValue) : '';
        inp.addEventListener('input', () => draft.set(descriptor.key, inp.value));
        inp.setAttribute('data-prop-key', descriptor.key);
        inputWrap.appendChild(inp);
    } else if (descriptor.type === 'boolean') {
        const wrap = document.createElement('label');
        wrap.className = 'gpp-checkbox-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!currentValue;
        cb.addEventListener('change', () => draft.set(descriptor.key, cb.checked));
        cb.setAttribute('data-prop-key', descriptor.key);
        wrap.appendChild(cb);
        inputWrap.appendChild(wrap);
    } else if (descriptor.type === 'enum' && descriptor.options) {
        const sel = document.createElement('select');
        sel.className = 'gpp-select';
        descriptor.options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            if (opt === currentValue) o.selected = true;
            sel.appendChild(o);
        });
        sel.addEventListener('change', () => draft.set(descriptor.key, sel.value));
        sel.setAttribute('data-prop-key', descriptor.key);
        inputWrap.appendChild(sel);
    } else if (descriptor.type === 'color') {
        const colorRow = document.createElement('div');
        colorRow.className = 'gpp-color-row';
        const inp = document.createElement('input');
        inp.type = 'color';
        inp.className = 'gpp-color-input';
        inp.value = normalizeColor(currentValue);
        inp.addEventListener('input', () => draft.set(descriptor.key, inp.value));
        inp.setAttribute('data-prop-key', descriptor.key);
        const hex = document.createElement('span');
        hex.className = 'gpp-color-hex';
        hex.textContent = inp.value;
        inp.addEventListener('input', () => { hex.textContent = inp.value; });
        colorRow.appendChild(inp);
        colorRow.appendChild(hex);
        inputWrap.appendChild(colorRow);
    }

    if (errMsg) {
        const err = document.createElement('div');
        err.className = 'gpp-error-row';
        err.textContent = errMsg;
        row.appendChild(label);
        row.appendChild(inputWrap);
        row.appendChild(err);
        return row;
    }

    row.appendChild(label);
    row.appendChild(inputWrap);
    return row;
}

/**
 * Renders a collapsible section card with step-circle header and property rows.
 * Uses the minimalist theme classes from PropertyPanelTheme.ts.
 */
export function renderSection(
    title: string,
    section: PropertyDescriptor['section'],
    descriptors: PropertyDescriptor[],
    elementData: Record<string, any>,
    draft: Map<string, any>,
    validationErrors: Map<string, string>,
    collapsed = false
): HTMLElement {
    const container = document.createElement('div');
    container.className = 'gpp-section';

    const headerEl = document.createElement('div');
    headerEl.className = 'gpp-section-header' + (collapsed ? '' : ' open');

    const stepNum = SECTION_STEPS[section] ?? '';
    const circle = document.createElement('div');
    circle.className = 'gpp-step-circle';
    circle.textContent = String(stepNum);
    headerEl.appendChild(circle);

    const titleEl = document.createElement('span');
    titleEl.className = 'gpp-section-title';
    titleEl.textContent = title;
    headerEl.appendChild(titleEl);

    const chevron = document.createElement('span');
    chevron.className = 'gpp-chevron';
    chevron.textContent = collapsed ? '▶' : '▼';
    headerEl.appendChild(chevron);

    const body = document.createElement('div');
    body.className = 'gpp-section-body' + (collapsed ? ' hidden' : '');

    descriptors.forEach(desc => {
        const value = getNestedValue(elementData, desc.key);
        const row = renderPropertyRow(desc, value, draft, validationErrors);
        body.appendChild(row);
    });

    headerEl.addEventListener('click', () => {
        const isHidden = body.classList.contains('hidden');
        if (isHidden) {
            body.classList.remove('hidden');
            body.style.display = 'grid';
            chevron.textContent = '▼';
            headerEl.classList.add('open');
        } else {
            body.classList.add('hidden');
            chevron.textContent = '▶';
            headerEl.classList.remove('open');
        }
    });

    container.appendChild(headerEl);
    container.appendChild(body);
    return container;
}

function formatValue(val: any): string {
    if (val === undefined || val === null) return '—';
    if (typeof val === 'object') return JSON.stringify(val).substring(0, 60);
    return String(val);
}

function normalizeColor(val: any): string {
    if (!val) return '#888888';
    const s = String(val).trim();
    if (s.startsWith('#') && (s.length === 7 || s.length === 4)) return s;
    if (s.startsWith('#')) return '#888888';
    const map: Record<string, string> = {
        white: '#ffffff', black: '#000000', red: '#ff0000',
        green: '#008000', blue: '#0000ff', gray: '#808080',
        grey: '#808080', yellow: '#ffff00', orange: '#ffa500',
    };
    return map[s.toLowerCase()] ?? '#888888';
}

function getNestedValue(obj: Record<string, any>, key: string): any {
    if (key in obj) return obj[key];
    if (key === 'ifcClass') return obj.ifcData?.ifcClass;
    if (key === 'globalId') return obj.ifcData?.guid;
    if (key === 'startX' && obj.baseLine) return obj.baseLine[0]?.x?.toFixed(3);
    if (key === 'startZ' && obj.baseLine) return obj.baseLine[0]?.z?.toFixed(3);
    if (key === 'endX' && obj.baseLine) return obj.baseLine[1]?.x?.toFixed(3);
    if (key === 'endZ' && obj.baseLine) return obj.baseLine[1]?.z?.toFixed(3);
    return undefined;
}
