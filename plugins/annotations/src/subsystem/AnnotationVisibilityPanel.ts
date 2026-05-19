/**
 * §ANN-B7 — Annotation Visibility/Graphics Panel
 *
 * Lightweight native-HTML panel for toggling annotation categories per view.
 * Mirrors Revit's Visibility/Graphics dialog — annotation category rows with
 * visibility checkboxes.
 *
 * Usage:
 *   const panel = new AnnotationVisibilityPanel(
 *     annotationManager.visibilityStore,
 *     () => annotationManager.getActiveViewId()
 *   );
 *   panel.mount(containerElement);   // inserts a floating panel
 *   panel.show();
 *   panel.hide();
 *
 * Contract compliance:
 *   §05 §7.8 — No bim-* / @thatopen/ui elements; native HTML only
 *   §01 §5   — CSS from AppTheme (ann-vg-* prefix)
 */

import { AnnotationVisibilityStore } from './AnnotationVisibilityStore';
import { AnnotationType } from './AnnotationTypes';

// All annotation categories in display order
const ALL_ANNOTATION_TYPES: { type: AnnotationType; label: string }[] = [
    { type: 'linear-dim',     label: 'Linear Dimensions' },
    { type: 'angular-dim',    label: 'Angular Dimensions' },
    { type: 'spot-elevation', label: 'Spot Elevations' },
    { type: 'tag',            label: 'Element Tags' },
    { type: 'keynote',        label: 'Keynotes' },
    { type: 'text-note',      label: 'Text Notes' },
    { type: 'detail-line',    label: 'Detail Lines' },
];

export class AnnotationVisibilityPanel {
    private _div: HTMLDivElement | null = null;
    private _visible = false;
    private _unsubscribe: (() => void) | null = null;

    constructor(
        private _store: AnnotationVisibilityStore,
        private _getViewId: () => string | null
    ) {}

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    mount(container: HTMLElement): void {
        if (this._div) return;

        const div = document.createElement('div');
        div.className = 'ann-vg-panel';
        div.style.display = 'none';
        container.appendChild(div);
        this._div = div;

        this._render();

        // Re-render when visibility changes
        this._unsubscribe = this._store.onChange(() => this._render());
    }

    show(): void {
        this._visible = true;
        if (this._div) {
            this._div.style.display = 'flex';
            this._render();
        }
    }

    hide(): void {
        this._visible = false;
        if (this._div) this._div.style.display = 'none';
    }

    toggle(): void {
        this._visible ? this.hide() : this.show();
    }

    isVisible(): boolean {
        return this._visible;
    }

    dispose(): void {
        this._unsubscribe?.();
        if (this._div?.parentElement) this._div.parentElement.removeChild(this._div);
        this._div = null;
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private _render(): void {
        const div = this._div;
        if (!div) return;
        div.innerHTML = '';

        const viewId = this._getViewId();

        const title = document.createElement('div');
        title.className = 'ann-vg-panel-title';
        title.textContent = 'Annotation Visibility';
        div.appendChild(title);

        if (!viewId) {
            const noView = document.createElement('div');
            noView.className = 'ann-vg-label';
            noView.style.color = 'var(--app-text-muted)';
            noView.style.fontSize = '11px';
            noView.textContent = 'No active view';
            div.appendChild(noView);
            return;
        }

        ALL_ANNOTATION_TYPES.forEach(({ type, label }) => {
            const isVis = this._store.isVisible(viewId, type);

            const row = document.createElement('label');
            row.className = 'ann-vg-row';
            row.title = isVis ? `Hide ${label}` : `Show ${label}`;

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'ann-vg-checkbox';
            cb.checked = isVis;
            cb.addEventListener('change', () => {
                const currentViewId = this._getViewId();
                if (!currentViewId) return;
                if (cb.checked) {
                    this._store.show(currentViewId, type);
                } else {
                    this._store.hide(currentViewId, type);
                }
            });

            const lbl = document.createElement('span');
            lbl.className = `ann-vg-label${isVis ? '' : ' ann-vg-label--hidden'}`;
            lbl.textContent = label;

            row.appendChild(cb);
            row.appendChild(lbl);
            div.appendChild(row);
        });

        // Reset all button
        const resetBtn = document.createElement('button');
        resetBtn.className = 'ann-btn ann-btn-ghost';
        resetBtn.textContent = 'Show All';
        resetBtn.style.marginTop = '4px';
        resetBtn.style.width = '100%';
        resetBtn.addEventListener('click', () => {
            const currentViewId = this._getViewId();
            if (currentViewId) this._store.reset(currentViewId);
        });
        div.appendChild(resetBtn);
    }
}
