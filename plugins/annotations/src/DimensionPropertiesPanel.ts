/**
 * §ANN-SEL — DimensionPropertiesPanel
 *
 * Moved from src/engine/subsystems/annotations/ during Sprint C (S5.1-P2).
 * Original path is now a re-export shim.
 * Command imports updated to use plugin-local commands/.
 */

import { AnnotationElement } from './subsystem/AnnotationTypes';

/**
 * C03 §P6 — dispatch one typed bus verb and report a refusal.
 *
 * ⚠ THIS PANEL USED TO DOUBLE-DISPATCH, and the two halves disagreed. `_delete()`
 * fired `annotation.delete` with `{ id }` — a key `DeleteAnnotationHandler.canExecute`
 * does not read, so that dispatch was ALWAYS refused — and then ran the legacy
 * `DeleteAnnotationCommand`, which is what actually deleted. The bus leg looked wired
 * and did nothing. One verb, the correct payload key, and the refusal is surfaced.
 */
function dispatch(type: string, payload: Record<string, unknown>): boolean {
    const bus = typeof window !== 'undefined' ? window.runtime?.bus : undefined;
    if (!bus || typeof bus.executeCommand !== 'function') {
        console.warn(`[DimensionPropertiesPanel] command bus unavailable — ${type} not dispatched`);
        return false;
    }
    try {
        void Promise.resolve(bus.executeCommand(type, payload)).catch(
            (err: unknown) => console.error(`[DimensionPropertiesPanel] ${type} refused:`, err),
        );
        return true;
    } catch (err) {
        console.error(`[DimensionPropertiesPanel] ${type} dispatch failed:`, err);
        return false;
    }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}

export class DimensionPropertiesPanel {
    readonly element: HTMLDivElement;
    private _ann: AnnotationElement | null = null;
    private _distanceDisplay!: HTMLDivElement;
    private _unitSelect!:      HTMLSelectElement;
    private _textSizeInput!:   HTMLInputElement;
    private _arrowSelect!:     HTMLSelectElement;
    private _lineColorInput!:  HTMLInputElement;
    private _textColorInput!:  HTMLInputElement;
    private _prefixInput!:     HTMLInputElement;
    private _suffixInput!:     HTMLInputElement;
    private _overrideInput!:   HTMLInputElement;
    private _lockedCheck!:     HTMLInputElement;
    private _constraintRow!:   HTMLDivElement;
    private _constraintSelect!: HTMLSelectElement;

    constructor() {
        this.element = document.createElement('div');
        this.element.className = 'ann-dim-prop-panel';
        this.element.style.display = 'none';
        this._build();
    }

    /**
     * @deprecated C03 §P6 — retained for call-site compatibility only. The panel
     * resolves the runtime command bus at dispatch time; a legacy CommandManager
     * handed here is ignored, never stored, and never called.
     */
    setCommandManager(_cmdMgr: unknown): void { /* no-op — see @deprecated above */ }

    show(ann: AnnotationElement): void { this._ann = ann; this._populate(ann); this.element.style.display = 'flex'; }
    hide(): void { this._ann = null; this.element.style.display = 'none'; }
    isVisible(): boolean { return this.element.style.display !== 'none'; }
    getSelectedId(): string | null { return this._ann?.id ?? null; }
    dispose(): void { if (this.element.parentElement) this.element.parentElement.removeChild(this.element); }

    private _build(): void {
        const panel = this.element;
        const header = el('div', 'ann-dim-prop-header');
        const typeBadge = el('div', 'ann-dim-prop-type-badge', 'DIMENSION');
        const titleEl = el('div', 'ann-dim-prop-title', 'Linear Dimension');
        this._distanceDisplay = el('div', 'ann-dim-prop-measured');
        const closeBtn = el('button', 'ann-dim-prop-close', '×');
        closeBtn.title = 'Close'; closeBtn.addEventListener('click', () => this.hide());
        header.append(typeBadge, titleEl, this._distanceDisplay, closeBtn);

        const body = el('div', 'ann-dim-prop-body');

        const unitRow = el('div', 'ann-dim-prop-row');
        const unitLabel = el('span', 'ann-dim-prop-label', 'Unit');
        this._unitSelect = el('select', 'ann-dim-prop-select');
        (['mm', 'cm', 'm'] as const).forEach(u => { const opt = el('option', '', u.toUpperCase()); opt.value = u; this._unitSelect.appendChild(opt); });
        unitRow.append(unitLabel, this._unitSelect);

        const textRow = el('div', 'ann-dim-prop-row');
        const textLabel = el('span', 'ann-dim-prop-label', 'Text size (mm)');
        this._textSizeInput = el('input', 'ann-dim-prop-input');
        Object.assign(this._textSizeInput, { type: 'number', min: '1', max: '20', step: '0.5' });
        textRow.append(textLabel, this._textSizeInput);

        const arrowRow = el('div', 'ann-dim-prop-row');
        const arrowLabel = el('span', 'ann-dim-prop-label', 'Arrow');
        this._arrowSelect = el('select', 'ann-dim-prop-select');
        (['filled', 'open', 'dot', 'none'] as const).forEach(s => { const opt = el('option', '', s.charAt(0).toUpperCase() + s.slice(1)); opt.value = s; this._arrowSelect.appendChild(opt); });
        arrowRow.append(arrowLabel, this._arrowSelect);

        const colorRow = el('div', 'ann-dim-prop-row');
        const lineColorLabel = el('span', 'ann-dim-prop-label', 'Colors');
        const lineColorSub = el('span', 'ann-dim-prop-label-inline', 'Line');
        this._lineColorInput = el('input', 'ann-dim-prop-color'); this._lineColorInput.type = 'color';
        const textColorLabel = el('span', 'ann-dim-prop-label-inline', 'Text');
        this._textColorInput = el('input', 'ann-dim-prop-color'); this._textColorInput.type = 'color';
        colorRow.append(lineColorLabel, lineColorSub, this._lineColorInput, textColorLabel, this._textColorInput);

        const fixRow = el('div', 'ann-dim-prop-row');
        const prefixLabel = el('span', 'ann-dim-prop-label', 'Prefix / Suffix');
        this._prefixInput = el('input', 'ann-dim-prop-input ann-dim-prop-input-short'); this._prefixInput.placeholder = '—';
        this._suffixInput = el('input', 'ann-dim-prop-input ann-dim-prop-input-short'); this._suffixInput.placeholder = '—';
        fixRow.append(prefixLabel, this._prefixInput, this._suffixInput);

        const overrideRow = el('div', 'ann-dim-prop-row');
        const overrideLabel = el('span', 'ann-dim-prop-label', 'Override label');
        this._overrideInput = el('input', 'ann-dim-prop-input'); this._overrideInput.placeholder = 'Blank = measured value';
        overrideRow.append(overrideLabel, this._overrideInput);

        const lockRow = el('div', 'ann-dim-prop-row');
        const lockLabel = el('span', 'ann-dim-prop-label', 'Lock constraint');
        this._lockedCheck = el('input', 'ann-dim-prop-check'); this._lockedCheck.type = 'checkbox';
        this._lockedCheck.addEventListener('change', () => { this._constraintRow.style.display = this._lockedCheck.checked ? 'flex' : 'none'; });
        lockRow.append(lockLabel, this._lockedCheck);

        this._constraintRow = el('div', 'ann-dim-prop-row'); this._constraintRow.style.display = 'none';
        const constraintLabel = el('span', 'ann-dim-prop-label', 'Constraint type');
        this._constraintSelect = el('select', 'ann-dim-prop-select');
        (['soft', 'hard'] as const).forEach(t => { const opt = el('option', '', t.charAt(0).toUpperCase() + t.slice(1)); opt.value = t; this._constraintSelect.appendChild(opt); });
        this._constraintRow.append(constraintLabel, this._constraintSelect);

        body.append(unitRow, textRow, arrowRow, colorRow, fixRow, overrideRow, lockRow, this._constraintRow);

        const footer = el('div', 'ann-dim-prop-footer');
        const applyBtn = el('button', 'ann-dim-prop-btn ann-dim-prop-btn-primary', 'Apply');
        applyBtn.addEventListener('click', () => this._apply());
        const deleteBtn = el('button', 'ann-dim-prop-btn ann-dim-prop-btn-danger', 'Delete');
        deleteBtn.addEventListener('click', () => this._delete());
        footer.append(applyBtn, deleteBtn);
        panel.append(header, body, footer);
    }

    private _populate(ann: AnnotationElement): void {
        const p = ann.parameters; const s = ann.style ?? {};
        const refs = ann.references;
        if (refs.length >= 2) {
            const pA = refs[0]!.cachedPosition ?? ann.geometry2D.modelPoints?.[0];
            const pB = refs[1]!.cachedPosition ?? ann.geometry2D.modelPoints?.[1];
            if (pA && pB) {
                const dist = Math.hypot(pB.x - pA.x, pB.y - pA.y, pB.z - pA.z);
                const unit = (p.unit ?? 'mm') as string;
                const formatted = unit === 'mm' ? `${Math.round(dist * 1000)} mm` : unit === 'cm' ? `${(dist * 100).toFixed(1)} cm` : `${dist.toFixed(3)} m`;
                this._distanceDisplay.textContent = `Measured: ${formatted}`;
            }
        }
        this._unitSelect.value     = (p.unit ?? 'mm') as string;
        this._textSizeInput.value  = String(s.textSizeMm ?? 2.5);
        this._arrowSelect.value    = (s.arrowStyle ?? 'filled') as string;
        this._lineColorInput.value = this._toHex(s.lineColor ?? '#1a2035');
        this._textColorInput.value = this._toHex(s.textColor ?? '#1a2035');
        this._prefixInput.value    = (p.prefix ?? '') as string;
        this._suffixInput.value    = (p.suffix ?? '') as string;
        this._overrideInput.value  = (p.override ?? '') as string;
        const locked = Boolean(p.isLocked);
        this._lockedCheck.checked = locked;
        this._constraintRow.style.display = locked ? 'flex' : 'none';
        this._constraintSelect.value = (p.constraintType ?? 'soft') as string;
    }

    private _apply(): void {
        if (!this._ann) return;
        // `annotation.update` MERGES both maps onto the canonical element, and the
        // panel already builds each one merged over the element it is showing — so
        // the resulting record is what the legacy UpdateAnnotationCommand produced.
        dispatch('annotation.update', {
            annotationId: this._ann.id,
            parameters: { ...this._ann.parameters, unit: this._unitSelect.value, prefix: this._prefixInput.value || undefined, suffix: this._suffixInput.value || undefined, override: this._overrideInput.value || undefined, isLocked: this._lockedCheck.checked, constraintType: this._constraintSelect.value },
            style: { ...this._ann.style, textSizeMm: parseFloat(this._textSizeInput.value) || 2.5, arrowStyle: this._arrowSelect.value as any, lineColor: this._lineColorInput.value, textColor: this._textColorInput.value },
        });
        console.log('[DimensionPropertiesPanel] Applied changes to dimension:', this._ann.id);
    }

    private _delete(): void {
        if (!this._ann) return;
        const annId = this._ann.id;
        dispatch('annotation.delete', { annotationId: annId });
        console.log('[DimensionPropertiesPanel] Deleted dimension:', annId);
        this.hide();
    }

    private _toHex(color: string): string {
        if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
        if (/^#[0-9a-fA-F]{3}$/.test(color)) {
            const [, r, g, b] = color.match(/^#(.)(.)(.)$/)!;
            return `#${r}${r}${g}${g}${b}${b}`;
        }
        return '#1a2035';
    }
}
