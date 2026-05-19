/**
 * §ANN-SEL — DimensionPropertiesPanel
 *
 * Moved from src/engine/subsystems/annotations/ during Sprint C (S5.1-P2).
 * Original path is now a re-export shim.
 * Command imports updated to use plugin-local commands/.
 */

import { AnnotationElement } from './subsystem/AnnotationTypes';
import { UpdateAnnotationCommand } from './commands/UpdateAnnotationCommand';
import { DeleteAnnotationCommand } from './commands/DeleteAnnotationCommand';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}

export class DimensionPropertiesPanel {
    readonly element: HTMLDivElement;
    private _ann: AnnotationElement | null = null;
    private _commandManager: any = null;
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

    setCommandManager(cmdMgr: any): void { this._commandManager = cmdMgr; }

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
        if (!this._ann || !this._commandManager) return;
        const patch: Partial<AnnotationElement> = {
            parameters: { ...this._ann.parameters, unit: this._unitSelect.value, prefix: this._prefixInput.value || undefined, suffix: this._suffixInput.value || undefined, override: this._overrideInput.value || undefined, isLocked: this._lockedCheck.checked, constraintType: this._constraintSelect.value },
            style: { ...this._ann.style, textSizeMm: parseFloat(this._textSizeInput.value) || 2.5, arrowStyle: this._arrowSelect.value as any, lineColor: this._lineColorInput.value, textColor: this._textColorInput.value },
        };
        const cmd = new UpdateAnnotationCommand(this._ann.id, patch);
        this._commandManager.execute(cmd);
        console.log('[DimensionPropertiesPanel] Applied changes to dimension:', this._ann.id);
    }

    private _delete(): void {
        if (!this._ann || !this._commandManager) return;
        const annId = this._ann.id;
        const cmd = new DeleteAnnotationCommand(annId);
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.delete', { id: annId }).catch(() => {}); }
        this._commandManager.execute(cmd);
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
