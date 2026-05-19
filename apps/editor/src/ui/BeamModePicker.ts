/**
 * BeamModePicker — In-viewport HUD for beam type selection.
 *
 * CONTRACT COMPLIANCE:
 *   §05-BIM-UI-ARCHITECTURE §2.1  : CSS via AppTheme.ts (bmp- prefix), no independent <style> tags.
 *   §05-BIM-UI-ARCHITECTURE §7.1  : No direct store mutations — callbacks delegate to toolManager path.
 *   §05-BIM-UI-ARCHITECTURE §7.8  : No @thatopen/ui (bim-*) elements — plain native HTML only.
 *   §01-BIM-ENGINE-CORE §1.5      : UI layer only — reads no stores, calls no builders.
 *
 * Shows a floating HUD at the top-centre of the viewport when Beam is selected
 * via TOOL > CREATE > STRUCTURE > BEAM.
 *
 * Panel layout (top to bottom):
 *   1. Gradient header: "BEAM | Select beam type"
 *   2. Info note: base offset is auto-set to sit under slab of floor above
 *   3. Group label: CONCRETE — three type rows
 *   4. Group label: STEEL    — three type rows
 *   5. ESC hint footer
 *
 * Clicking a type row selects that profile and activates the placement tool.
 * ESC dismisses without activating.
 */

import { BeamTypeConfig } from '@pryzm/input-host';

export type { BeamTypeConfig };

export interface BeamModePickerCallbacks {
    onSelectType: (config: BeamTypeConfig) => void;
}

export interface BeamTypeDisplay extends BeamTypeConfig {
    group: 'Concrete' | 'Steel';
    label: string;
    sub:   string;
    key:   string;
}

export const BEAM_TYPES: BeamTypeDisplay[] = [
    // ── Concrete ──────────────────────────────────────────────────────────────
    {
        id:      'concrete-b1',
        group:   'Concrete',
        label:   'Rectangular B1',
        sub:     'Concrete · 250 × 400 mm (span ≤ 7 m)',
        key:     '1',
        profile: 'rectangular',
        width:   0.25,
        depth:   0.40,
    },
    {
        id:      'concrete-b2',
        group:   'Concrete',
        label:   'Rectangular B2',
        sub:     'Concrete · 300 × 600 mm (span ≤ 10 m)',
        key:     '2',
        profile: 'rectangular',
        width:   0.30,
        depth:   0.60,
    },
    {
        id:      'concrete-b3',
        group:   'Concrete',
        label:   'Deep Beam B3',
        sub:     'Concrete · 400 × 800 mm (transfer)',
        key:     '3',
        profile: 'rectangular',
        width:   0.40,
        depth:   0.80,
    },
    // ── Steel ─────────────────────────────────────────────────────────────────
    {
        id:      'steel-ub254',
        group:   'Steel',
        label:   'UB 254×102',
        sub:     'Steel · 254×102×28 UB',
        key:     'A',
        profile: 'UB',
        width:   0.1022,
        depth:   0.2604,
        steelProfileName: '254x102x28',
    },
    {
        id:      'steel-ub406',
        group:   'Steel',
        label:   'UB 406×178',
        sub:     'Steel · 406×178×54 UB',
        key:     'B',
        profile: 'UB',
        width:   0.1777,
        depth:   0.4026,
        steelProfileName: '406x178x54',
    },
    {
        id:      'steel-uc152',
        group:   'Steel',
        label:   'UC 152×152',
        sub:     'Steel · 152×152×30 UC',
        key:     'C',
        profile: 'UC',
        width:   0.1529,
        depth:   0.1576,
        steelProfileName: '152x152x30',
    },
];

export class BeamModePicker {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private el: HTMLElement | null = null;
    private escHandler: ((e: KeyboardEvent) => void) | null = null;

    show(callbacks: BeamModePickerCallbacks): void {
        this.dismiss();

        const panel = document.createElement('div');
        panel.className = 'bmp-panel';

        // ── Gradient header ────────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'bmp-header';

        const headerTitle = document.createElement('span');
        headerTitle.className = 'bmp-header-title';
        headerTitle.textContent = 'Beam';

        const headerSep = document.createElement('span');
        headerSep.className = 'bmp-header-sep';

        const headerSub = document.createElement('span');
        headerSub.className = 'bmp-header-sub';
        headerSub.textContent = 'Select beam type';

        header.appendChild(headerTitle);
        header.appendChild(headerSep);
        header.appendChild(headerSub);
        panel.appendChild(header);

        // ── Auto-offset info note ──────────────────────────────────────────────
        const note = document.createElement('div');
        note.className = 'bmp-note';
        note.innerHTML = `<span class="bmp-note-icon">⚠</span> Base offset is auto-set — beam seats under the slab of the floor above.`;
        panel.appendChild(note);

        // ── Type rows (grouped by Concrete / Steel) ────────────────────────────
        const modeRow = document.createElement('div');
        modeRow.className = 'bmp-mode-row';

        let lastGroup = '';
        for (const type of BEAM_TYPES) {
            if (type.group !== lastGroup) {
                lastGroup = type.group;
                const groupLabel = document.createElement('div');
                groupLabel.className = 'bmp-group-label';
                groupLabel.textContent = type.group.toUpperCase();
                modeRow.appendChild(groupLabel);
            }

            const btn = document.createElement('button');
            btn.className = 'bmp-btn';
            btn.type = 'button';
            btn.setAttribute('title', `${type.label} — ${type.sub} (${type.key})`);
            btn.innerHTML = `
                <span class="bmp-icon">${buildBeamSVG(type)}</span>
                <span class="bmp-btn-text">
                    <span class="bmp-key">${type.key}</span>
                    <span class="bmp-label">${type.label}</span>
                    <span class="bmp-sub">${type.sub}</span>
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
        hint.className = 'bmp-hint';
        hint.textContent = 'Click start point then end point to place · ESC to cancel';
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

// ─── Cross-section SVG icons (end-elevation view) ─────────────────────────────
// Beams are horizontal elements, so the cross-section is seen from the end.

function buildBeamSVG(type: BeamTypeDisplay): string {
    const id = type.id;

    // Concrete: solid filled rectangle
    if (id === 'concrete-b1') {
        return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="16" y="8" width="32" height="32" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" fill="currentColor" fill-opacity="0.18"/>
</svg>`;
    }
    if (id === 'concrete-b2') {
        return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="16" y="4" width="32" height="40" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" fill="currentColor" fill-opacity="0.18"/>
</svg>`;
    }
    if (id === 'concrete-b3') {
        return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="8" y="4" width="48" height="40" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" fill="currentColor" fill-opacity="0.18"/>
</svg>`;
    }

    // Steel UB/UC: I-beam cross-section (flanges top/bottom, web in middle)
    if (id === 'steel-ub254') {
        return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <!-- Top flange -->
  <rect x="8"  y="6"  width="48" height="9"  stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="currentColor" fill-opacity="0.18"/>
  <!-- Web -->
  <rect x="26" y="15" width="12" height="18" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="currentColor" fill-opacity="0.18"/>
  <!-- Bottom flange -->
  <rect x="8"  y="33" width="48" height="9"  stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="currentColor" fill-opacity="0.18"/>
</svg>`;
    }
    if (id === 'steel-ub406') {
        return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <!-- Top flange (wider) -->
  <rect x="6"  y="4"  width="52" height="10" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="currentColor" fill-opacity="0.18"/>
  <!-- Web (deeper) -->
  <rect x="26" y="14" width="12" height="20" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="currentColor" fill-opacity="0.18"/>
  <!-- Bottom flange (wider) -->
  <rect x="6"  y="34" width="52" height="10" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="currentColor" fill-opacity="0.18"/>
</svg>`;
    }
    if (id === 'steel-uc152') {
        // UC is stocky — flanges nearly as wide as section is deep
        return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <!-- Top flange -->
  <rect x="10" y="7"  width="44" height="9"  stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="currentColor" fill-opacity="0.18"/>
  <!-- Web -->
  <rect x="26" y="16" width="12" height="16" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="currentColor" fill-opacity="0.18"/>
  <!-- Bottom flange -->
  <rect x="10" y="32" width="44" height="9"  stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="currentColor" fill-opacity="0.18"/>
</svg>`;
    }

    // Generic fallback
    return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="12" y="10" width="40" height="28" stroke="currentColor" stroke-width="2.5" fill="currentColor" fill-opacity="0.18"/>
</svg>`;
}
