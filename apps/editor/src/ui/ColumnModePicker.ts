/**
 * ColumnModePicker — In-viewport HUD for column type selection.
 *
 * CONTRACT COMPLIANCE:
 *   §05-BIM-UI-ARCHITECTURE §2.1  : CSS via AppTheme.ts (cmp- prefix), no independent <style> tags.
 *   §05-BIM-UI-ARCHITECTURE §7.1  : No direct store mutations — callbacks delegate to toolManager path.
 *   §05-BIM-UI-ARCHITECTURE §7.8  : No @thatopen/ui (bim-*) elements — plain native HTML only.
 *   §01-BIM-ENGINE-CORE §1.5      : UI layer only — reads no stores, calls no builders.
 *
 * Shows a floating HUD at the top-centre of the viewport when Column is selected
 * via TOOL > CREATE > STRUCTURE > COLUMN.
 *
 * Panel layout (top to bottom):
 *   1. Gradient header: "COLUMN | Select column type"
 *   2. Group label: CONCRETE  — three type rows
 *   3. Group label: STEEL     — three type rows
 *   4. ESC hint footer
 *
 * Clicking a type row selects that profile and activates the placement tool.
 * ESC dismisses without activating.
 */

export interface ColumnTypeConfig {
    id: string;
    group: 'Concrete' | 'Steel';
    label: string;
    sub: string;
    key: string;
    profile: 'rectangular' | 'circular' | 'UC' | 'UB';
    width: number;
    depth: number;
    steelProfileName?: string;
}

export interface ColumnModePickerCallbacks {
    onSelectType: (config: ColumnTypeConfig) => void;
}

export const COLUMN_TYPES: ColumnTypeConfig[] = [
    // ── Concrete ──────────────────────────────────────────────────────────────
    {
        id:      'concrete-rectangular',
        group:   'Concrete',
        label:   'Rectangular',
        sub:     'Concrete · 400 × 600 mm',
        key:     'R',
        profile: 'rectangular',
        width:   0.4,
        depth:   0.6,
    },
    {
        id:      'concrete-square',
        group:   'Concrete',
        label:   'Square',
        sub:     'Concrete · 400 × 400 mm',
        key:     'S',
        profile: 'rectangular',
        width:   0.4,
        depth:   0.4,
    },
    {
        id:      'concrete-round',
        group:   'Concrete',
        label:   'Round',
        sub:     'Concrete · ⌀ 400 mm',
        key:     'C',
        profile: 'circular',
        width:   0.4,
        depth:   0.4,
    },
    // ── Steel ─────────────────────────────────────────────────────────────────
    {
        id:      'steel-hss-square',
        group:   'Steel',
        label:   'HSS Square',
        sub:     'Steel · 150 × 150 mm hollow',
        key:     'H',
        profile: 'rectangular',
        width:   0.15,
        depth:   0.15,
    },
    {
        id:      'steel-hss-round',
        group:   'Steel',
        label:   'HSS Round',
        sub:     'Steel · ⌀ 150 mm hollow',
        key:     'O',
        profile: 'circular',
        width:   0.15,
        depth:   0.15,
    },
    {
        id:      'steel-wide-flange',
        group:   'Steel',
        label:   'UC 254×254',
        sub:     'Steel · 254×254×89 UC',
        key:     'W',
        profile: 'UC',
        width:   0.2563,
        depth:   0.2603,
        steelProfileName: '254x254x89',
    },
];

export class ColumnModePicker {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private el: HTMLElement | null = null;
    private escHandler: ((e: KeyboardEvent) => void) | null = null;

    show(callbacks: ColumnModePickerCallbacks): void {
        this.dismiss();

        const panel = document.createElement('div');
        panel.className = 'cmp-panel';

        // ── Gradient header ────────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'cmp-header';

        const headerTitle = document.createElement('span');
        headerTitle.className = 'cmp-header-title';
        headerTitle.textContent = 'Column';

        const headerSep = document.createElement('span');
        headerSep.className = 'cmp-header-sep';

        const headerSub = document.createElement('span');
        headerSub.className = 'cmp-header-sub';
        headerSub.textContent = 'Select column type';

        header.appendChild(headerTitle);
        header.appendChild(headerSep);
        header.appendChild(headerSub);
        panel.appendChild(header);

        // ── Type rows (grouped by Concrete / Steel) ────────────────────────────
        const modeRow = document.createElement('div');
        modeRow.className = 'cmp-mode-row';

        let lastGroup = '';
        for (const type of COLUMN_TYPES) {
            // Group label separator
            if (type.group !== lastGroup) {
                lastGroup = type.group;
                const groupLabel = document.createElement('div');
                groupLabel.className = 'cmp-group-label';
                groupLabel.textContent = type.group.toUpperCase();
                modeRow.appendChild(groupLabel);
            }

            const btn = document.createElement('button');
            btn.className = 'cmp-btn';
            btn.type = 'button';
            btn.setAttribute('title', `${type.label} — ${type.sub} (${type.key})`);
            btn.innerHTML = `
                <span class="cmp-icon">${buildColumnSVG(type)}</span>
                <span class="cmp-btn-text">
                    <span class="cmp-key">${type.key}</span>
                    <span class="cmp-label">${type.label}</span>
                    <span class="cmp-sub">${type.sub}</span>
                </span>
            `;
            btn.addEventListener('click', () => {
                this.dismiss();
                callbacks.onSelectType(type);
            });
            modeRow.appendChild(btn);
        }

        panel.appendChild(modeRow);

        // ── ESC hint ───────────────────────────────────────────────────────────
        const hint = document.createElement('div');
        hint.className = 'cmp-hint';
        hint.textContent = 'Click on floor plan to place · ESC to cancel';
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

// ─── Cross-section SVG icons (plan view from above) ───────────────────────────
// Each icon shows the column profile as seen in a floor plan section cut.

function buildColumnSVG(type: ColumnTypeConfig): string {
    const id = type.id;

    if (id === 'concrete-rectangular') {
        return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="12" y="6" width="40" height="36" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" fill="currentColor" fill-opacity="0.18"/>
</svg>`;
    }

    if (id === 'concrete-square') {
        return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="12" y="4" width="40" height="40" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" fill="currentColor" fill-opacity="0.18"/>
</svg>`;
    }

    if (id === 'concrete-round') {
        return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="32" cy="24" r="19" stroke="currentColor" stroke-width="2.5" fill="currentColor" fill-opacity="0.18"/>
</svg>`;
    }

    if (id === 'steel-hss-square') {
        return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="10" y="6" width="44" height="36" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>
  <rect x="17" y="12" width="30" height="24" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-dasharray="3 2"/>
</svg>`;
    }

    if (id === 'steel-hss-round') {
        return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="32" cy="24" r="20" stroke="currentColor" stroke-width="3"/>
  <circle cx="32" cy="24" r="13" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/>
</svg>`;
    }

    if (id === 'steel-wide-flange') {
        // Wide Flange (W-shape / I-beam) — cross-section from above
        return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <!-- Top flange -->
  <rect x="8"  y="6"  width="48" height="10" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" fill="currentColor" fill-opacity="0.18"/>
  <!-- Web -->
  <rect x="26" y="16" width="12" height="16" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" fill="currentColor" fill-opacity="0.18"/>
  <!-- Bottom flange -->
  <rect x="8"  y="32" width="48" height="10" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" fill="currentColor" fill-opacity="0.18"/>
</svg>`;
    }

    // Fallback generic column
    return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="12" y="4" width="40" height="40" stroke="currentColor" stroke-width="2.5" fill="currentColor" fill-opacity="0.18"/>
</svg>`;
}
