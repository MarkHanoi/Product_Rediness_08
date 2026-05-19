/**
 * CurtainWallModePicker — In-viewport HUD for curtain wall drawing mode selection.
 *
 * CONTRACT COMPLIANCE:
 *   §05-BIM-UI-ARCHITECTURE §2.1  : CSS via AppTheme.ts (cwmp- prefix), no independent <style> tags.
 *   §05-BIM-UI-ARCHITECTURE §7.1  : No direct store mutations — callbacks delegate to commandManager path.
 *   §05-BIM-UI-ARCHITECTURE §7.8  : No @thatopen/ui (bim-*) elements — plain native HTML only.
 *   §01-BIM-ENGINE-CORE §1.5      : UI layer only — reads no stores, calls no builders.
 *   §26-PLAN-VIEW-ELEMENT-CREATION-PARITY §2 : Mirrors WallModePicker pattern — getActiveMode() /
 *       setActiveMode() exposed for plan-view CurtainWallPlanToolHandler to read on every mousemove.
 *
 * Shows a floating HUD at the top-centre of the viewport when Curtain Wall is selected
 * in TOOL > CREATE > ARCHITECTURE > CURTAIN WALL.
 *
 * Four drawing modes:
 *   linear     — continuous straight polyline (end-point becomes next start, ESC to stop)
 *   ortho      — same as Linear, but endpoint constrained to 90° cardinal axes
 *   curved     — three-point arc (start → through-point → end), creates arc-approximation segments
 *   byslab     — generate curtain walls from the perimeter of the selected slab
 *
 * Sprint CW-1: _lastMode persists the most recently selected mode so that
 * CurtainWallPlanToolHandler can query getActiveMode() to apply the correct drawing
 * constraint without requiring tool re-activation.
 */

export type CurtainWallPickerMode = 'linear' | 'ortho' | 'curved' | 'byslab';

export interface CurtainWallModePickerCallbacks {
    onLinear:    () => void;
    onOrtho:     () => void;
    onCurved:    () => void;
    onBySlab:    () => void;
}

export class CurtainWallModePicker {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private el: HTMLElement | null = null;
    private escHandler: ((e: KeyboardEvent) => void) | null = null;

    /** Last mode selected by the user. Defaults to 'linear'. */
    private _lastMode: CurtainWallPickerMode = 'linear';

    /**
     * Returns the most recently selected drawing mode.
     * Read on every mousemove by CurtainWallPlanToolHandler — never cached by the handler.
     */
    getActiveMode(): CurtainWallPickerMode {
        return this._lastMode;
    }

    /**
     * Programmatically sets the active mode without showing the picker panel.
     * Called by Layout.ts when CurtainWallDrawingHUD switches mode mid-draw, or when the
     * curtain wall tool activates with a specific mode.
     * Keeps curtainWallModePicker._lastMode in sync so plan-view handlers read the correct mode.
     */
    setActiveMode(mode: CurtainWallPickerMode): void {
        this._lastMode = mode;
        console.log('[CurtainWallModePicker] setActiveMode →', mode);
    }

    show(callbacks: CurtainWallModePickerCallbacks): void {
        this.dismiss();

        const panel = document.createElement('div');
        panel.className = 'cwmp-panel';

        // ── Header ────────────────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'cwmp-header';

        const headerTitle = document.createElement('span');
        headerTitle.className = 'cwmp-header-title';
        headerTitle.textContent = 'Curtain Wall';

        const headerSep = document.createElement('span');
        headerSep.className = 'cwmp-header-sep';

        const headerSub = document.createElement('span');
        headerSub.className = 'cwmp-header-sub';
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
            modeId: CurtainWallPickerMode;
            action: () => void;
        }> = [
            {
                key:    'L',
                label:  'Linear',
                sub:    'Continuous straight segments',
                svg:    buildLinearSVG(),
                modeId: 'linear',
                action: callbacks.onLinear,
            },
            {
                key:    'O',
                label:  'Orthogonal',
                sub:    '90° constrained segments',
                svg:    buildOrthoSVG(),
                modeId: 'ortho',
                action: callbacks.onOrtho,
            },
            {
                key:    'C',
                label:  'Curved',
                sub:    'Three-point arc segments',
                svg:    buildCurvedSVG(),
                modeId: 'curved',
                action: callbacks.onCurved,
            },
            {
                key:    'S',
                label:  'By Slab',
                sub:    'From selected slab perimeter',
                svg:    buildBySlabSVG(),
                modeId: 'byslab',
                action: callbacks.onBySlab,
            },
        ];

        const modeRow = document.createElement('div');
        modeRow.className = 'cwmp-mode-row';

        for (const mode of modes) {
            const btn = document.createElement('button');
            btn.className = 'cwmp-btn';
            btn.type = 'button';
            btn.setAttribute('title', `${mode.label} — ${mode.sub} (${mode.key})`);
            btn.innerHTML = `
                <span class="cwmp-icon">${mode.svg}</span>
                <span class="cwmp-btn-text">
                    <span class="cwmp-key">${mode.key}</span>
                    <span class="cwmp-label">${mode.label}</span>
                    <span class="cwmp-sub">${mode.sub}</span>
                </span>
            `;
            btn.addEventListener('click', () => {
                this._lastMode = mode.modeId;
                console.log('[CurtainWallModePicker] Mode selected:', mode.modeId);
                this.dismiss();
                mode.action();
            });
            modeRow.appendChild(btn);
        }

        panel.appendChild(modeRow);

        // ── Hint footer ───────────────────────────────────────────────────────
        const hint = document.createElement('div');
        hint.className = 'cwmp-hint';
        hint.textContent = 'ESC to cancel';
        panel.appendChild(hint);

        document.body.appendChild(panel);
        this.el = panel;

        this.escHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { this.dismiss(); return; }
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
            const k = e.key.toUpperCase();
            if (k === 'L') { e.preventDefault(); this._lastMode = 'linear';  this.dismiss(); callbacks.onLinear(); }
            if (k === 'O') { e.preventDefault(); this._lastMode = 'ortho';   this.dismiss(); callbacks.onOrtho(); }
            if (k === 'C') { e.preventDefault(); this._lastMode = 'curved';  this.dismiss(); callbacks.onCurved(); }
            if (k === 'S') { e.preventDefault(); this._lastMode = 'byslab';  this.dismiss(); callbacks.onBySlab(); }
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

    isVisible(): boolean { return this.el !== null; }
}

// ─── Plan-view diagrammatic SVG icons for curtain wall modes ─────────────────
// Curtain walls are represented as a glass curtain surface (fine vertical/horizontal grid lines).

/** Linear — straight curtain wall with fine grid lines (plan elevation view) */
function buildLinearSVG(): string {
    return `<svg viewBox="0 0 64 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <!-- outer frame -->
  <rect x="4" y="12" width="56" height="20" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
  <!-- vertical mullion lines -->
  <line x1="18" y1="12" x2="18" y2="32" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <line x1="32" y1="12" x2="32" y2="32" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <line x1="46" y1="12" x2="46" y2="32" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <!-- horizontal mullion -->
  <line x1="4" y1="22" x2="60" y2="22" stroke="currentColor" stroke-width="1" opacity="0.5"/>
</svg>`;
}

/** Orthogonal — L-shaped curtain wall corner in plan elevation */
function buildOrthoSVG(): string {
    return `<svg viewBox="0 0 64 60" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <!-- vertical leg outer -->
  <polyline points="4,6 4,54 54,54" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- vertical leg inner (wall depth) -->
  <polyline points="14,6 14,44 54,44" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- end caps -->
  <line x1="4"  y1="6"  x2="14" y2="6"  stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="52" y1="44" x2="52" y2="54" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- mullion lines vertical leg -->
  <line x1="4" y1="24" x2="14" y2="24" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <line x1="4" y1="40" x2="14" y2="40" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <!-- mullion lines horizontal leg -->
  <line x1="30" y1="44" x2="30" y2="54" stroke="currentColor" stroke-width="1" opacity="0.5"/>
</svg>`;
}

/** Curved — arc curtain wall from plan, two concentric arcs with grid lines */
function buildCurvedSVG(): string {
    return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <!-- outer arc -->
  <path d="M4,44 Q32,4 60,44" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <!-- inner arc (wall depth) -->
  <path d="M12,44 Q32,16 52,44" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <!-- end caps -->
  <line x1="4"  y1="43" x2="12" y2="43" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="52" y1="43" x2="60" y2="43" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- mullion verticals along arc -->
  <line x1="24" y1="20" x2="28" y2="28" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <line x1="32" y1="10" x2="32" y2="18" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <line x1="40" y1="20" x2="36" y2="28" stroke="currentColor" stroke-width="1" opacity="0.5"/>
</svg>`;
}

/** By Slab — slab outline with curtain wall perimeter segments indicated */
function buildBySlabSVG(): string {
    return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <!-- slab floor plate (dashed) -->
  <rect x="8" y="8" width="48" height="32" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 2" opacity="0.5" stroke-linejoin="round"/>
  <!-- curtain wall segments on each face -->
  <rect x="5" y="5" width="54" height="38" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
  <!-- grid lines on top face -->
  <line x1="21" y1="5" x2="21" y2="8"  stroke="currentColor" stroke-width="1" opacity="0.6"/>
  <line x1="37" y1="5" x2="37" y2="8"  stroke="currentColor" stroke-width="1" opacity="0.6"/>
  <line x1="53" y1="5" x2="53" y2="8"  stroke="currentColor" stroke-width="1" opacity="0.6"/>
  <!-- slab label dot -->
  <circle cx="32" cy="24" r="3" fill="currentColor" opacity="0.4"/>
</svg>`;
}
