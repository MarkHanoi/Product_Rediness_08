/**
 * OpeningModePicker — In-viewport HUD for slab opening drawing mode selection.
 *
 * CONTRACT COMPLIANCE:
 *   §05-BIM-UI-ARCHITECTURE §2.1  : CSS via AppTheme.ts (omp- prefix), no independent <style> tags.
 *   §05-BIM-UI-ARCHITECTURE §7.1  : No direct store mutations — callbacks delegate to toolManager.
 *   §05-BIM-UI-ARCHITECTURE §7.8  : No @thatopen/ui (bim-*) elements — plain native HTML only.
 *   §01-BIM-ENGINE-CORE §1.5      : UI layer only — reads no stores, calls no builders.
 *   §05-SLAB-OPENING-SYSTEM       : Activation via toolManager.activateOpeningTool(mode).
 *
 * Shows a floating HUD at the top-centre of the viewport when the Slab Opening
 * button is pressed in TOOLS > CREATE > STRUCTURE > Slab Opening.
 * Two diagrammatic icons represent the available drawing modes:
 *   2-Point (rectangle from two corners), Polyline (free polygon).
 *
 * CSS prefix: omp- — claimed in §05 §3.
 */

export interface OpeningModePickerCallbacks {
    on2Point:   () => void;
    onPolyline: () => void;
}

export class OpeningModePicker {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private el: HTMLElement | null = null;
    private escHandler: ((e: KeyboardEvent) => void) | null = null;

    show(callbacks: OpeningModePickerCallbacks): void {
        this.dismiss();

        const panel = document.createElement('div');
        panel.className = 'omp-panel';

        // ── Header ────────────────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'omp-header';

        const headerTitle = document.createElement('span');
        headerTitle.className = 'omp-header-title';
        headerTitle.textContent = 'Slab Opening';

        const headerSep = document.createElement('span');
        headerSep.className = 'omp-header-sep';

        const headerSub = document.createElement('span');
        headerSub.className = 'omp-header-sub';
        headerSub.textContent = 'Select drawing mode';

        header.appendChild(headerTitle);
        header.appendChild(headerSep);
        header.appendChild(headerSub);
        panel.appendChild(header);

        // ── Mode buttons ──────────────────────────────────────────────────────
        const modes: Array<{
            key:    string;
            label:  string;
            sub:    string;
            svg:    string;
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
        ];

        const modeRow = document.createElement('div');
        modeRow.className = 'omp-mode-row';

        for (const mode of modes) {
            const btn = document.createElement('button');
            btn.className = 'omp-btn';
            btn.type = 'button';
            btn.setAttribute('title', `${mode.label} — ${mode.sub} (${mode.key})`);
            btn.innerHTML = `
                <span class="omp-icon">${mode.svg}</span>
                <span class="omp-btn-text">
                    <span class="omp-key">${mode.key}</span>
                    <span class="omp-label">${mode.label}</span>
                    <span class="omp-sub">${mode.sub}</span>
                </span>
            `;
            btn.addEventListener('click', () => {
                this.dismiss();
                mode.action();
            });
            modeRow.appendChild(btn);
        }

        panel.appendChild(modeRow);

        // ── ESC hint ──────────────────────────────────────────────────────────
        const hint = document.createElement('div');
        hint.className = 'omp-hint';
        hint.textContent = 'Select a slab first, then choose mode · ESC to cancel';
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

// ─── Diagrammatic plan-view opening SVG icons ─────────────────────────────────
// Each icon shows a top-down view of the opening hole in a slab.

/** 2-Point — rectangle defined by two corner points, with a hatched void in the centre */
function build2PointSVG(): string {
    return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="4" y="4" width="56" height="40" stroke="currentColor" stroke-width="2" opacity="0.25"/>
  <rect x="14" y="12" width="36" height="24" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-dasharray="4 2"/>
  <circle cx="14" cy="12" r="3.5" fill="currentColor"/>
  <circle cx="50" cy="36" r="3.5" fill="currentColor"/>
  <line x1="14" y1="12" x2="50" y2="36" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.35"/>
</svg>`;
}

/** Polyline — irregular polygon opening boundary with vertex markers */
function buildPolylineSVG(): string {
    return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="4" y="4" width="56" height="40" stroke="currentColor" stroke-width="2" opacity="0.25"/>
  <polygon points="14,38 16,14 34,10 52,20 48,38 28,40" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-dasharray="4 2"/>
  <circle cx="14" cy="38" r="2.5" fill="currentColor"/>
  <circle cx="16" cy="14" r="2.5" fill="currentColor"/>
  <circle cx="34" cy="10" r="2.5" fill="currentColor"/>
  <circle cx="52" cy="20" r="2.5" fill="currentColor"/>
  <circle cx="48" cy="38" r="2.5" fill="currentColor"/>
  <circle cx="28" cy="40" r="2.5" fill="currentColor"/>
</svg>`;
}
