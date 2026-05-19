/**
 * LinearDimOptionsBar — §DIM-IV-1/2
 *
 * Moved from src/engine/subsystems/core/views/plantools/LinearDimOptionsBar.ts
 * during Sprint C (S5.1-P2 2026-05-10). Original path is now a re-export shim.
 * injectAppTheme() replaced with plugin-local injectAnnotationStyles().
 */

import { injectAnnotationStyles } from '../annotation-styles';
import type { WallFaceType } from './WallFaceDetector';
import type { DimensionUnit } from '../subsystem/DimensionFormatter';

export type { WallFaceType, DimensionUnit };

interface FaceOption { label: string; value: WallFaceType; title: string; }

const FACE_OPTIONS: FaceOption[] = [
    { label: 'Exterior',   value: 'face:exterior',   title: 'Snap to finish exterior face' },
    { label: 'Interior',   value: 'face:interior',   title: 'Snap to finish interior face' },
    { label: 'Centerline', value: 'wall:centerline',  title: 'Snap to wall centerline / location line' },
];

const UNIT_OPTIONS: Array<{ label: string; value: DimensionUnit; title: string }> = [
    { label: 'mm', value: 'mm', title: 'Millimetres' },
    { label: 'cm', value: 'cm', title: 'Centimetres' },
    { label: 'm',  value: 'm',  title: 'Metres' },
];

export class LinearDimOptionsBar {
    private _el: HTMLElement | null = null;
    private _faceType: WallFaceType = 'face:exterior';
    private _unit: DimensionUnit = 'mm';
    private _isLocked = false;
    private _constraintType: 'hard' | 'soft' = 'soft';
    private _isString = false;
    private _showEQ = false;

    get preferredFaceType(): WallFaceType { return this._faceType; }
    get unit(): DimensionUnit             { return this._unit; }
    get isLocked(): boolean               { return this._isLocked; }
    get constraintType(): 'hard' | 'soft' { return this._constraintType; }
    get isString(): boolean               { return this._isString; }
    get showEQ(): boolean                 { return this._showEQ; }

    cycleFaceType(): void {
        const idx     = FACE_OPTIONS.findIndex(o => o.value === this._faceType);
        const nextIdx = (idx + 1) % FACE_OPTIONS.length;
        if (!this._el) { this._faceType = FACE_OPTIONS[nextIdx]!.value; return; }
        const group = this._el.querySelector<HTMLElement>('.ann-dim-opt-group');
        if (group) this._setFaceType(FACE_OPTIONS[nextIdx]!.value, group, nextIdx);
    }

    show(): void {
        injectAnnotationStyles();
        if (!this._el) this._build();
        if (this._el) this._el.style.display = 'flex';
    }

    hide(): void {
        if (this._el) this._el.style.display = 'none';
    }

    dispose(): void {
        if (this._el?.parentElement) this._el.parentElement.removeChild(this._el);
        this._el = null;
    }

    private _build(): void {
        const bar = document.createElement('div');
        bar.className = 'ann-dim-opt-bar';
        bar.setAttribute('role', 'toolbar');
        bar.setAttribute('aria-label', 'Linear Dimension Options');

        const label = document.createElement('span');
        label.className = 'ann-dim-opt-label';
        label.textContent = 'Linear Dim';
        bar.appendChild(label);
        bar.appendChild(this._makeDivider());

        const faceGroupLabel = document.createElement('span');
        faceGroupLabel.className = 'ann-dim-opt-group-label';
        faceGroupLabel.textContent = 'Snap';
        bar.appendChild(faceGroupLabel);

        const faceGroup = document.createElement('div');
        faceGroup.className = 'ann-dim-opt-group';
        FACE_OPTIONS.forEach((opt, idx) => {
            const btn = this._makeSegBtn(opt.label, opt.value === this._faceType, opt.title,
                () => this._setFaceType(opt.value, faceGroup, idx));
            btn.dataset.idx = String(idx);
            faceGroup.appendChild(btn);
        });
        bar.appendChild(faceGroup);
        bar.appendChild(this._makeDivider());

        const unitGroupLabel = document.createElement('span');
        unitGroupLabel.className = 'ann-dim-opt-group-label';
        unitGroupLabel.textContent = 'Unit';
        bar.appendChild(unitGroupLabel);

        const unitGroup = document.createElement('div');
        unitGroup.className = 'ann-dim-opt-group';
        UNIT_OPTIONS.forEach((opt, idx) => {
            const btn = this._makeSegBtn(opt.label, opt.value === this._unit, opt.title,
                () => this._setUnit(opt.value, unitGroup, idx));
            btn.dataset.idx = String(idx);
            unitGroup.appendChild(btn);
        });
        bar.appendChild(unitGroup);
        bar.appendChild(this._makeDivider());

        const lockBtn = document.createElement('button');
        lockBtn.className = 'ann-dim-opt-lock';
        lockBtn.type = 'button';
        lockBtn.setAttribute('aria-pressed', 'false');
        this._updateLockBtn(lockBtn);
        lockBtn.addEventListener('click', () => this._toggleLock(lockBtn));
        bar.appendChild(lockBtn);
        bar.appendChild(this._makeDivider());

        const strGroupLabel = document.createElement('span');
        strGroupLabel.className = 'ann-dim-opt-group-label';
        strGroupLabel.textContent = 'Chain';
        bar.appendChild(strGroupLabel);

        const strBtn = document.createElement('button');
        strBtn.type = 'button';
        this._updateStrBtn(strBtn);
        const eqBtn = document.createElement('button');
        eqBtn.type = 'button';
        this._updateEqBtn(eqBtn);
        strBtn.addEventListener('click', () => this._toggleString(strBtn, eqBtn));
        eqBtn.addEventListener('click', () => this._toggleEQ(eqBtn));
        bar.appendChild(strBtn);
        bar.appendChild(eqBtn);

        document.body.appendChild(bar);
        this._el = bar;
    }

    private _makeSegBtn(label: string, active: boolean, title: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className = active ? 'ann-dim-opt-seg ann-dim-opt-seg--active' : 'ann-dim-opt-seg';
        btn.textContent = label; btn.title = title; btn.type = 'button';
        btn.addEventListener('click', onClick);
        return btn;
    }

    private _makeDivider(): HTMLElement {
        const d = document.createElement('span');
        d.className = 'ann-dim-opt-divider';
        return d;
    }

    private _setFaceType(value: WallFaceType, group: HTMLElement, activeIdx: number): void {
        this._faceType = value;
        this._refreshGroup(group, activeIdx);
        window.dispatchEvent(new CustomEvent('dim-opt-face-type', { detail: { faceType: value } })); // TODO(TASK-15)
        console.log('[LinearDimOptionsBar] preferredFaceType →', value);
    }

    private _setUnit(value: DimensionUnit, group: HTMLElement, activeIdx: number): void {
        this._unit = value;
        this._refreshGroup(group, activeIdx);
        window.dispatchEvent(new CustomEvent('dim-opt-unit', { detail: { unit: value } })); // TODO(TASK-15)
        console.log('[LinearDimOptionsBar] unit →', value);
    }

    private _refreshGroup(group: HTMLElement, activeIdx: number): void {
        Array.from(group.children).forEach((child, i) => {
            child.className = i === activeIdx ? 'ann-dim-opt-seg ann-dim-opt-seg--active' : 'ann-dim-opt-seg';
        });
    }

    private _toggleLock(btn: HTMLButtonElement): void {
        this._isLocked = !this._isLocked;
        this._updateLockBtn(btn);
        window.dispatchEvent(new CustomEvent('dim-opt-lock', { detail: { isLocked: this._isLocked, constraintType: this._constraintType } })); // TODO(TASK-15)
        console.log('[LinearDimOptionsBar] isLocked →', this._isLocked);
    }

    private _updateLockBtn(btn: HTMLButtonElement): void {
        btn.setAttribute('aria-pressed', String(this._isLocked));
        if (this._isLocked) {
            btn.className = 'ann-dim-opt-lock ann-dim-opt-lock--active';
            btn.textContent = '\uD83D\uDD12'; btn.title = 'Constraint LOCKED — click to unlock';
        } else {
            btn.className = 'ann-dim-opt-lock';
            btn.textContent = '\uD83D\uDD13'; btn.title = 'Lock next dimension as constraint';
        }
    }

    private _toggleString(strBtn: HTMLButtonElement, eqBtn: HTMLButtonElement): void {
        this._isString = !this._isString;
        this._updateStrBtn(strBtn); this._updateEqBtn(eqBtn);
        window.dispatchEvent(new CustomEvent('dim-opt-string', { detail: { isString: this._isString } })); // TODO(TASK-15)
        console.log('[LinearDimOptionsBar] isString →', this._isString);
    }

    private _updateStrBtn(btn: HTMLButtonElement): void {
        btn.setAttribute('aria-pressed', String(this._isString));
        btn.textContent = 'String';
        if (this._isString) { btn.className = 'ann-dim-str-toggle ann-dim-str-toggle--active'; btn.title = 'String mode ON'; }
        else { btn.className = 'ann-dim-str-toggle'; btn.title = 'String (chain) mode'; }
    }

    private _toggleEQ(btn: HTMLButtonElement): void {
        this._showEQ = !this._showEQ;
        this._updateEqBtn(btn);
        window.dispatchEvent(new CustomEvent('dim-opt-eq', { detail: { showEQ: this._showEQ } })); // TODO(TASK-15)
        console.log('[LinearDimOptionsBar] showEQ →', this._showEQ);
    }

    private _updateEqBtn(btn: HTMLButtonElement): void {
        btn.setAttribute('aria-pressed', String(this._showEQ));
        btn.textContent = 'EQ';
        const canEq = this._isString;
        btn.disabled = !canEq;
        if (this._showEQ && canEq) { btn.className = 'ann-dim-str-eq-toggle ann-dim-str-eq-toggle--active'; btn.title = 'EQ ON'; }
        else { btn.className = 'ann-dim-str-eq-toggle'; btn.title = canEq ? 'EQ mode' : 'Enable String mode first'; }
    }
}
