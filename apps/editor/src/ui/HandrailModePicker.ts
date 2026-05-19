/**
 * HandrailModePicker — In-viewport HUD for handrail type selection.
 *
 * CONTRACT COMPLIANCE:
 *   §05-BIM-UI-ARCHITECTURE §2.1  : CSS via AppTheme.ts (hrmp- prefix), no independent <style> tags.
 *   §05-BIM-UI-ARCHITECTURE §7.1  : No direct store mutations — callbacks delegate to tool/command path.
 *   §05-BIM-UI-ARCHITECTURE §7.8  : No @thatopen/ui (bim-*) elements — plain native HTML only.
 *   §01-BIM-ENGINE-CORE §1.5      : UI layer only — reads no stores, calls no builders.
 *
 * Shows a floating HUD at the top-centre of the viewport when Handrail is selected
 * via TOOL > CREATE > ARCHITECTURE > HANDRAIL.
 *
 * Panel layout (top to bottom):
 *   1. Gradient header: "HANDRAIL TYPE | Select handrail type"
 *   2. HANDRAIL TYPE dropdown (from HandrailTypeStore)
 *   3. Divider
 *   4. Type list — one row per type with colour swatch, name, and spec info
 *      Clicking a row activates the tool with that type and dismisses the HUD.
 *   5. ESC hint footer
 *
 * Selecting a type row dismisses the HUD and activates the handrail tool with
 * the chosen type. ESC dismisses without activating.
 */

export interface HandrailTypeOption {
    id: string;
    name: string;
    description: string;
    height: number;
    fillType: string;
    materialColor?: string;
}

export interface HandrailModePickerCallbacks {
    handrailTypes: HandrailTypeOption[];
    currentHandrailTypeId?: string;
    onHandrailTypeChange: (id: string | undefined) => void;
    onSelectType: (id: string | undefined) => void;
}

export class HandrailModePicker {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private el: HTMLElement | null = null;
    private escHandler: ((e: KeyboardEvent) => void) | null = null;

    show(callbacks: HandrailModePickerCallbacks): void {
        this.dismiss();

        const panel = document.createElement('div');
        panel.className = 'hrmp-panel';

        // ── Gradient header ────────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'hrmp-header';

        const headerTitle = document.createElement('span');
        headerTitle.className = 'hrmp-header-title';
        headerTitle.textContent = 'Handrail Type';

        const headerSep = document.createElement('span');
        headerSep.className = 'hrmp-header-sep';

        const headerSub = document.createElement('span');
        headerSub.className = 'hrmp-header-sub';
        headerSub.textContent = 'Select handrail type';

        header.appendChild(headerTitle);
        header.appendChild(headerSep);
        header.appendChild(headerSub);
        panel.appendChild(header);

        // ── Handrail Type dropdown row ─────────────────────────────────────────
        const typeRow = document.createElement('div');
        typeRow.className = 'hrmp-type-row';

        const typeLabel = document.createElement('span');
        typeLabel.className = 'hrmp-type-label';
        typeLabel.textContent = 'Handrail Type';
        typeRow.appendChild(typeLabel);

        const typeSelect = document.createElement('select');
        typeSelect.className = 'hrmp-type-select';

        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = '— Default Handrail —';
        typeSelect.appendChild(noneOpt);

        for (const t of callbacks.handrailTypes) {
            const opt = document.createElement('option');
            opt.value = t.id;
            const heightMm = Math.round(t.height * 1000);
            opt.textContent = `${t.name} (${heightMm} mm)`;
            typeSelect.appendChild(opt);
        }
        typeSelect.value = callbacks.currentHandrailTypeId ?? '';

        typeSelect.addEventListener('change', () => {
            const val = typeSelect.value || undefined;
            callbacks.onHandrailTypeChange(val);
            updateHighlight(val);
        });

        typeRow.appendChild(typeSelect);
        panel.appendChild(typeRow);

        // ── Type rows list ─────────────────────────────────────────────────────
        const modeRow = document.createElement('div');
        modeRow.className = 'hrmp-mode-row';

        const rowEls: { id: string | undefined; el: HTMLElement }[] = [];

        const makeRow = (type: HandrailTypeOption | null) => {
            const id = type?.id;
            const btn = document.createElement('button');
            btn.className = 'hrmp-btn';
            btn.setAttribute('title', type ? `${type.name} — ${type.description}` : 'Use default handrail settings');
            if (!type) {
                btn.dataset.typeId = '';
            } else {
                btn.dataset.typeId = type.id;
            }

            // Colour swatch
            const swatch = document.createElement('span');
            swatch.className = 'hrmp-swatch';
            if (type?.materialColor) {
                swatch.style.background = type.materialColor;
            } else {
                swatch.style.background = 'var(--app-border)';
            }
            btn.appendChild(swatch);

            // Text block
            const textSpan = document.createElement('span');
            textSpan.className = 'hrmp-btn-text';

            const labelSpan = document.createElement('span');
            labelSpan.className = 'hrmp-label';
            labelSpan.textContent = type ? type.name : '— Default —';

            const subSpan = document.createElement('span');
            subSpan.className = 'hrmp-sub';
            if (type) {
                const heightMm = Math.round(type.height * 1000);
                const fill = type.fillType.charAt(0).toUpperCase() + type.fillType.slice(1);
                subSpan.textContent = `${heightMm} mm · ${fill}`;
            } else {
                subSpan.textContent = 'Project default';
            }

            textSpan.appendChild(labelSpan);
            textSpan.appendChild(subSpan);
            btn.appendChild(textSpan);

            btn.addEventListener('click', () => {
                this.dismiss();
                callbacks.onSelectType(id);
            });

            rowEls.push({ id, el: btn });
            modeRow.appendChild(btn);
        };

        for (const t of callbacks.handrailTypes) {
            makeRow(t);
        }

        panel.appendChild(modeRow);

        // Helper: highlight the active type row
        const updateHighlight = (activeId: string | undefined) => {
            for (const row of rowEls) {
                const isActive = row.id === activeId || (!row.id && !activeId);
                row.el.classList.toggle('hrmp-btn--active', isActive);
            }
            // Sync dropdown
            typeSelect.value = activeId ?? '';
        };

        // Set initial highlight
        updateHighlight(callbacks.currentHandrailTypeId);

        // ── ESC hint ───────────────────────────────────────────────────────────
        const hint = document.createElement('div');
        hint.className = 'hrmp-hint';
        hint.textContent = 'Click a type to start drawing · ESC to cancel';
        panel.appendChild(hint);

        document.body.appendChild(panel);
        this.el = panel;

        this.escHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') this.dismiss();
        };
        window.addEventListener('keydown', this.escHandler, { capture: true });
    }

    dismiss(): void {
        if (this.escHandler) {
            window.removeEventListener('keydown', this.escHandler, { capture: true } as EventListenerOptions);
            this.escHandler = null;
        }
        if (this.el) {
            this.el.remove();
            this.el = null;
        }
    }

    isVisible(): boolean {
        return this.el !== null;
    }
}
