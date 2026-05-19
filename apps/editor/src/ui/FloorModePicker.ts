/**
 * FloorModePicker — In-viewport HUD for floor finish system type + drawing mode selection.
 *
 * Contract: docs/00_Contracts/49-FLOOR-CEILING-DRAWING-MODE-PARITY-CONTRACT.md
 *           docs/00_Contracts/05-BIM-UI-ARCHITECTURE-CONTRACT.md §2.1, §7.1, §7.8
 *           docs/00_Contracts/26-PLAN-VIEW-ELEMENT-CREATION-PARITY-CONTRACT.md
 *
 * Shows a floating HUD at the top-centre of the viewport when Floor is selected.
 * Mirrors the WallModePicker pattern with five modes:
 *   • Linear     — freeform straight segments, no axis snap
 *   • Orthogonal — 90°-constrained polygon
 *   • Curved     — arc segments (currently routes to LINEAR — arc draw deferred)
 *   • Rectangle  — 2-point axis-aligned rectangle
 *   • Auto       — click inside a room to use the room boundary
 *
 * Sprint pattern (matches WallModePicker §05):
 *   _lastMode persists the most recent selection.  PlanViewToolHandlers query
 *   getActiveMode() on every mousemove without requiring tool re-activation.
 *
 * Prefix: fmp-
 */

import { wallLinear, wallOrtho, wallCurved } from './icons/PryzmIcons';

export type FloorPickerMode = 'linear' | 'ortho' | 'curved' | 'rectangle' | 'auto';

export interface FloorTypeOption {
    id: string;
    name: string;
    totalThickness: number;
    category?: string;
}

export interface FloorModePickerCallbacks {
    floorTypes: FloorTypeOption[];
    currentTypeId?: string;
    onTypeChange: (id: string | undefined) => void;
    onSelectLinear:    () => void;
    onSelectOrtho:     () => void;
    onSelectCurved:    () => void;
    onSelectRectangle: () => void;
    onSelectAutoRoom:  () => void;
}

export class FloorModePicker {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private el: HTMLElement | null = null;
    private escHandler: ((e: KeyboardEvent) => void) | null = null;

    /** Last mode selected by the user. Defaults to 'linear'. */
    private _lastMode: FloorPickerMode = 'linear';

    /** Read by FloorPlanToolHandler on every mousemove. */
    getActiveMode(): FloorPickerMode { return this._lastMode; }

    /** Programmatically sets the active mode (used by FloorDrawingHUD switches). */
    setActiveMode(mode: FloorPickerMode): void {
        this._lastMode = mode;
        console.log('[FloorModePicker] setActiveMode →', mode);
    }

    show(callbacks: FloorModePickerCallbacks): void {
        this.dismiss();

        const panel = document.createElement('div');
        panel.className = 'fmp-panel';

        // ── Gradient header ────────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'fmp-header';
        const headerTitle = document.createElement('span');
        headerTitle.className = 'fmp-header-title';
        headerTitle.textContent = 'New Floor';
        const headerSep = document.createElement('span');
        headerSep.className = 'fmp-header-sep';
        const headerSub = document.createElement('span');
        headerSub.className = 'fmp-header-sub';
        headerSub.textContent = 'Default Floor + Apply';
        header.appendChild(headerTitle);
        header.appendChild(headerSep);
        header.appendChild(headerSub);
        panel.appendChild(header);

        // ── System type row ───────────────────────────────────────────────────
        const typeRow = document.createElement('div');
        typeRow.className = 'fmp-type-row';

        const typeLabel = document.createElement('span');
        typeLabel.className = 'fmp-type-label';
        typeLabel.textContent = 'Floor Type';
        typeRow.appendChild(typeLabel);

        const typeSelect = document.createElement('select');
        typeSelect.className = 'fmp-type-select';

        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = '— Default Floor —';
        typeSelect.appendChild(noneOpt);

        for (const t of callbacks.floorTypes) {
            const opt = document.createElement('option');
            opt.value = t.id;
            const thk = Math.round(t.totalThickness * 1000);
            opt.textContent = `${t.name}  (${thk} mm)`;
            typeSelect.appendChild(opt);
        }
        typeSelect.value = callbacks.currentTypeId ?? '';

        typeSelect.addEventListener('change', () => {
            const val = typeSelect.value || undefined;
            callbacks.onTypeChange(val);
        });

        typeRow.appendChild(typeSelect);
        panel.appendChild(typeRow);

        // ── Divider ───────────────────────────────────────────────────────────
        const divider = document.createElement('div');
        divider.className = 'fmp-divider';
        panel.appendChild(divider);

        // ── Mode buttons ──────────────────────────────────────────────────────
        const modes: Array<{
            key: string; label: string; sub: string; svg: string;
            modeId: FloorPickerMode; action: () => void;
        }> = [
            { key: 'L', label: 'Linear',     sub: 'Freeform polygon',      svg: wallLinear,                    modeId: 'linear',    action: callbacks.onSelectLinear     },
            { key: 'O', label: 'Orthogonal', sub: '90° constrained',       svg: wallOrtho,                     modeId: 'ortho',     action: callbacks.onSelectOrtho      },
            { key: 'C', label: 'Curved',     sub: 'Arc segments',          svg: wallCurved,                    modeId: 'curved',    action: callbacks.onSelectCurved     },
            { key: 'R', label: 'Rectangle',  sub: '2-point box',           svg: buildRectangleSVG(),           modeId: 'rectangle', action: callbacks.onSelectRectangle  },
            { key: 'A', label: 'Auto',       sub: 'Click inside a room',   svg: buildAutoRoomSVG(),            modeId: 'auto',      action: callbacks.onSelectAutoRoom   },
        ];

        const modeRow = document.createElement('div');
        modeRow.className = 'fmp-mode-row';

        for (const mode of modes) {
            const btn = document.createElement('button');
            btn.className = 'fmp-btn';
            btn.setAttribute('title', `${mode.label} — ${mode.sub} (${mode.key})`);
            btn.innerHTML = `
                <span class="fmp-icon">${mode.svg}</span>
                <span class="fmp-btn-text">
                    <span class="fmp-key">${mode.key}</span>
                    <span class="fmp-label">${mode.label}</span>
                </span>
            `;
            btn.addEventListener('click', () => {
                this._lastMode = mode.modeId;
                console.log('[FloorModePicker] Mode selected:', mode.modeId);
                this.dismiss();
                mode.action();
            });
            modeRow.appendChild(btn);
        }

        panel.appendChild(modeRow);

        // ── ESC hint ──────────────────────────────────────────────────────────
        const hint = document.createElement('div');
        hint.className = 'fmp-hint';
        hint.textContent = 'Continuous creation · ESC to finish';
        panel.appendChild(hint);

        document.body.appendChild(panel);
        this.el = panel;

        this.escHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { this.dismiss(); return; }
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
            const k = e.key.toUpperCase();
            const map: Record<string, FloorPickerMode> = { L: 'linear', O: 'ortho', C: 'curved', R: 'rectangle', A: 'auto' };
            const target = map[k];
            if (target) {
                e.preventDefault();
                this._lastMode = target;
                this.dismiss();
                if (target === 'linear')    callbacks.onSelectLinear();
                if (target === 'ortho')     callbacks.onSelectOrtho();
                if (target === 'curved')    callbacks.onSelectCurved();
                if (target === 'rectangle') callbacks.onSelectRectangle();
                if (target === 'auto')      callbacks.onSelectAutoRoom();
            }
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

// ─── Mode-specific plan-view diagram SVG icons ────────────────────────────────

/** Rectangle — 2-point axis-aligned box with corner handles */
function buildRectangleSVG(): string {
    return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="10" y="10" width="44" height="28" rx="1.5"
        stroke="currentColor" stroke-width="2.5" fill="currentColor" fill-opacity="0.10"/>
  <circle cx="10" cy="10" r="3" fill="currentColor"/>
  <circle cx="54" cy="38" r="3" fill="currentColor"/>
  <line x1="10" y1="10" x2="54" y2="38" stroke="currentColor" stroke-width="0.8" opacity="0.35" stroke-dasharray="3 2"/>
</svg>`;
}

/** Auto from Room — room boundary with auto-fill indication */
function buildAutoRoomSVG(): string {
    return `<svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="8" y="8" width="48" height="32" rx="2"
        stroke="currentColor" stroke-width="2.5" fill="currentColor" fill-opacity="0.06"/>
  <rect x="14" y="14" width="36" height="20" rx="1"
        stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"
        fill="currentColor" fill-opacity="0.14"/>
  <circle cx="32" cy="24" r="3.5" fill="currentColor" opacity="0.7"/>
  <line x1="32" y1="17" x2="32" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="32" y1="31" x2="32" y2="34" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="25" y1="24" x2="22" y2="24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="39" y1="24" x2="42" y2="24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;
}
