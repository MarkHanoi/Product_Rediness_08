/**
 * SlabModePicker — In-viewport HUD for slab drawing mode selection.
 *
 * CONTRACT COMPLIANCE:
 *   §05-BIM-UI-ARCHITECTURE §2.1  : CSS via AppTheme.ts (smp- prefix), no independent <style> tags.
 *   §05-BIM-UI-ARCHITECTURE §7.1  : No direct store mutations — callbacks delegate to commandManager path.
 *   §05-BIM-UI-ARCHITECTURE §7.8  : No @thatopen/ui (bim-*) elements — plain native HTML only.
 *   §01-BIM-ENGINE-CORE §1.5      : UI layer only — reads no stores, calls no builders.
 *   §04-SLAB-TOOL-STATE-MACHINE   : Activation is via service.activateSlabTool() in caller; this
 *                                   component is pure UI — it emits mode selection and dismisses.
 *
 * Shows a floating HUD at the top-centre of the viewport when the Slab
 * button is pressed in TOOL > CREATE > STRUCTURE > SLAB.
 * Five diagrammatic icons represent the available drawing modes:
 *   2-Point, Polyline, By Region, Hollow, Pick Walls.
 *
 * No slab system-type dropdown — per refactor spec, no subtypes are shown.
 */

export interface SlabModePickerCallbacks {
    on2Point:    () => void;
    onPolyline:  () => void;
    onRegion:    () => void;
    onHollow:    () => void;
    onPickWalls: () => void;
}

export class SlabModePicker {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private el: HTMLElement | null = null;
    private escHandler: ((e: KeyboardEvent) => void) | null = null;

    show(callbacks: SlabModePickerCallbacks): void {
        this.dismiss();

        const panel = document.createElement('div');
        panel.className = 'smp-panel';

        // ── Header ────────────────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'smp-header';

        const headerTitle = document.createElement('span');
        headerTitle.className = 'smp-header-title';
        headerTitle.textContent = 'Slab';

        const headerSep = document.createElement('span');
        headerSep.className = 'smp-header-sep';

        const headerSub = document.createElement('span');
        headerSub.className = 'smp-header-sub';
        headerSub.textContent = 'Select drawing mode';

        header.appendChild(headerTitle);
        header.appendChild(headerSep);
        header.appendChild(headerSub);
        panel.appendChild(header);

        // ── Mode buttons ──────────────────────────────────────────────────────
        const modes: Array<{
            key: string;
            label: string;
            sub: string;
            svg: string;
            action: () => void;
        }> = [
            {
                key:    '2',
                label:  '2-Point',
                sub:    'Rectangle by two corners',
                svg:    build2PointSVG(),
                action: callbacks.on2Point,
            },
            {
                key:    'P',
                label:  'Polyline',
                sub:    'Freeform polygon boundary',
                svg:    buildPolylineSVG(),
                action: callbacks.onPolyline,
            },
            {
                key:    'RG',
                label:  'By Region',
                sub:    'Auto-detect from enclosed walls',
                svg:    buildRegionSVG(),
                action: callbacks.onRegion,
            },
            {
                key:    'H',
                label:  'Hollow',
                sub:    'Rectangle with rectangular opening',
                svg:    buildHollowSVG(),
                action: callbacks.onHollow,
            },
            {
                key:    'PW',
                label:  'Pick Walls',
                sub:    'Associative boundary from walls',
                svg:    buildPickWallsSVG(),
                action: callbacks.onPickWalls,
            },
        ];

        const modeRow = document.createElement('div');
        modeRow.className = 'smp-mode-row';

        for (const mode of modes) {
            const btn = document.createElement('button');
            btn.className = 'smp-btn';
            btn.type = 'button';
            btn.setAttribute('title', `${mode.label} — ${mode.sub} (${mode.key})`);
            btn.innerHTML = `
                <span class="smp-icon">${mode.svg}</span>
                <span class="smp-btn-text">
                    <span class="smp-key">${mode.key}</span>
                    <span class="smp-label">${mode.label}</span>
                    <span class="smp-sub">${mode.sub}</span>
                </span>
            `;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[SlabModePicker] Mode selected:', mode.label);
                this.dismiss();
                try {
                    mode.action();
                } catch (err) {
                    console.error('[SlabModePicker] action threw for', mode.label, err);
                }
            });
            modeRow.appendChild(btn);
        }

        panel.appendChild(modeRow);

        // ── ESC hint ──────────────────────────────────────────────────────────
        const hint = document.createElement('div');
        hint.className = 'smp-hint';
        hint.textContent = 'ESC to cancel';
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

// ─── Diagrammatic plan-view slab SVG icons ────────────────────────────────────
// Each icon is a top-down floor-plan view showing how the slab boundary is defined.

/** 2-Point — rectangle defined by two corner points, with dot markers at corners */
function build2PointSVG(): string {
    return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="8" y="8" width="48" height="32" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="8"  cy="8"  r="3.5" fill="currentColor"/>
  <circle cx="56" cy="40" r="3.5" fill="currentColor"/>
  <line x1="8" y1="8" x2="56" y2="40" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.35"/>
</svg>`;
}

/** Polyline — irregular polygon boundary, multiple vertices */
function buildPolylineSVG(): string {
    return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <polygon points="8,40 10,10 36,6 58,18 54,42 28,44" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="8"  cy="40" r="2.5" fill="currentColor"/>
  <circle cx="10" cy="10" r="2.5" fill="currentColor"/>
  <circle cx="36" cy="6"  r="2.5" fill="currentColor"/>
  <circle cx="58" cy="18" r="2.5" fill="currentColor"/>
  <circle cx="54" cy="42" r="2.5" fill="currentColor"/>
  <circle cx="28" cy="44" r="2.5" fill="currentColor"/>
</svg>`;
}

/** By Region — closed wall boundary with a floor-fill indicator (dot in centre) */
function buildRegionSVG(): string {
    return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="8" y="8" width="48" height="32" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-dasharray="5 3"/>
  <circle cx="32" cy="24" r="5" fill="currentColor" opacity="0.85"/>
  <circle cx="32" cy="24" r="9" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
</svg>`;
}

/** Hollow — rectangle with a rectangular hole in the centre */
function buildHollowSVG(): string {
    return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="5"  y="5"  width="54" height="38" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
  <rect x="18" y="16" width="28" height="16" stroke="currentColor" stroke-width="2"   stroke-linejoin="round" stroke-dasharray="4 2"/>
  <circle cx="5"  cy="5"  r="2.5" fill="currentColor"/>
  <circle cx="59" cy="43" r="2.5" fill="currentColor"/>
  <circle cx="18" cy="16" r="2"   fill="currentColor"/>
  <circle cx="46" cy="32" r="2"   fill="currentColor"/>
</svg>`;
}

/** Pick Walls — two wall segments (double lines) forming an L, with slab fill implied */
function buildPickWallsSVG(): string {
    return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <!-- vertical wall -->
  <line x1="8"  y1="6"  x2="8"  y2="42" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="18" y1="6"  x2="18" y2="42" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
  <!-- horizontal wall -->
  <line x1="8"  y1="42" x2="56" y2="42" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="8"  y1="32" x2="56" y2="32" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
  <!-- slab surface hint -->
  <rect x="18" y="6" width="38" height="26" fill="currentColor" opacity="0.1"/>
  <!-- cursor/click indicator -->
  <circle cx="38" cy="20" r="3" fill="currentColor" opacity="0.6"/>
</svg>`;
}
