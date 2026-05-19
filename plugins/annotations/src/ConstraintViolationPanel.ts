/**
 * §ANN-C3 / §ANN-C4 — Constraint Violation Panel + Toast
 *
 * Moved from src/engine/subsystems/annotations/ during Sprint C (S5.1-P2).
 * Original path is now a re-export shim.
 * injectAppTheme() replaced with plugin-local injectAnnotationStyles().
 */

import { injectAnnotationStyles } from './annotation-styles';
import type { ConstraintStore, ConstraintRecord } from './subsystem/ConstraintStore';

const TOAST_DURATION_MS = 4500;

export class ConstraintViolationPanel {
    private _div: HTMLDivElement | null = null;
    private _unsubscribe: (() => void) | null = null;
    private _prevViolatedIds = new Set<string>();
    private _toastTimer: ReturnType<typeof setTimeout> | null = null;
    private _toastEl: HTMLElement | null = null;

    constructor(private _store: ConstraintStore) {}

    mount(container: HTMLElement): void {
        if (this._div) return;
        injectAnnotationStyles();
        const div = document.createElement('div');
        div.className = 'ann-cv-panel';
        div.style.display = 'none';
        container.appendChild(div);
        this._div = div;
        this._render(this._store.all);
        this._unsubscribe = this._store.subscribe(records => { this._render(records); });
    }

    dispose(): void {
        this._unsubscribe?.();
        this._unsubscribe = null;
        if (this._div?.parentElement) this._div.parentElement.removeChild(this._div);
        this._div = null;
        this._dismissToast();
    }

    private _render(records: ConstraintRecord[]): void {
        const div = this._div;
        if (!div) return;
        if (records.length === 0) { div.style.display = 'none'; this._prevViolatedIds.clear(); return; }
        div.style.display = 'flex'; div.innerHTML = '';
        const violated = records.filter(r => r.lastResult === 'violated');
        const satisfied = records.filter(r => r.lastResult === 'satisfied');
        const allSatisfied = violated.length === 0 && satisfied.length === records.length;
        const newHardViolations = violated.filter(r => r.type === 'hard' && !this._prevViolatedIds.has(r.id));
        if (newHardViolations.length > 0) this._showToast(newHardViolations);
        this._prevViolatedIds = new Set(violated.map(r => r.id));

        const header = document.createElement('div'); header.className = 'ann-cv-panel-header';
        const title = document.createElement('span'); title.className = 'ann-cv-panel-title'; title.textContent = 'Constraints';
        const badge = document.createElement('span');
        if (records.length === 0) { badge.className = 'ann-cv-badge ann-cv-badge--empty'; badge.textContent = '0'; }
        else if (allSatisfied) { badge.className = 'ann-cv-badge ann-cv-badge--ok'; badge.textContent = '✓'; badge.title = 'All constraints satisfied'; }
        else { badge.className = 'ann-cv-badge'; badge.textContent = String(violated.length); badge.title = `${violated.length} violation${violated.length !== 1 ? 's' : ''}`; }
        header.appendChild(title); header.appendChild(badge); div.appendChild(header);

        records.forEach(record => {
            const row = document.createElement('div'); row.className = 'ann-cv-row';
            row.title = `ID: ${record.id}\nType: ${record.type}\nOperator: ${record.operator}\nTarget: ${(record.valueMetres * 1000).toFixed(1)} mm`;
            const dot = document.createElement('span'); dot.className = `ann-cv-dot ann-cv-dot--${record.lastResult}`;
            const desc = document.createElement('span'); desc.className = 'ann-cv-desc'; desc.textContent = record.description;
            row.appendChild(dot); row.appendChild(desc);
            if (record.lastResult === 'violated') {
                const delta = document.createElement('span'); delta.className = 'ann-cv-delta';
                const deltaMm = record.violationDeltaMetres * 1000;
                delta.textContent = `${deltaMm > 0 ? '+' : ''}${deltaMm.toFixed(1)} mm`;
                row.appendChild(delta);
            }
            div.appendChild(row);
        });
    }

    private _showToast(hardViolations: ConstraintRecord[]): void {
        this._dismissToast();
        const toast = document.createElement('div'); toast.className = 'ann-constr-toast ann-constr-toast--hard';
        const icon = document.createElement('span'); icon.className = 'ann-constr-toast-icon'; icon.textContent = '\uD83D\uDD12';
        const body = document.createElement('div'); body.className = 'ann-constr-toast-body';
        const titleEl = document.createElement('div'); titleEl.className = 'ann-constr-toast-title';
        titleEl.textContent = hardViolations.length === 1 ? 'Hard Constraint Violated' : `${hardViolations.length} Hard Constraints Violated`;
        const msgEl = document.createElement('div'); msgEl.className = 'ann-constr-toast-msg';
        msgEl.textContent = hardViolations.slice(0, 3).map(r => {
            const deltaMm = (r.violationDeltaMetres * 1000).toFixed(1);
            const sign = r.violationDeltaMetres > 0 ? '+' : '';
            return `${r.description}  (${sign}${deltaMm} mm)`;
        }).join('\n');
        if (hardViolations.length > 3) msgEl.textContent += `\n…and ${hardViolations.length - 3} more`;
        body.appendChild(titleEl); body.appendChild(msgEl); toast.appendChild(icon); toast.appendChild(body);
        document.body.appendChild(toast); this._toastEl = toast;
        console.warn('[ConstraintViolationPanel] Hard violations:', hardViolations.map(r => r.description));
        this._toastTimer = setTimeout(() => { this._dismissToast(); }, TOAST_DURATION_MS);
    }

    private _dismissToast(): void {
        if (this._toastTimer !== null) { clearTimeout(this._toastTimer); this._toastTimer = null; }
        if (this._toastEl?.parentElement) this._toastEl.parentElement.removeChild(this._toastEl);
        this._toastEl = null;
    }
}
