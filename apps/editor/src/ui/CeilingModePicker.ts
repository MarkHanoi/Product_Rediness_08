/**
 * CeilingModePicker — In-viewport HUD for ceiling system type + drawing mode selection.
 *
 * Contract: docs/00_Contracts/49-FLOOR-CEILING-DRAWING-MODE-PARITY-CONTRACT.md
 *           docs/00_Contracts/05-BIM-UI-ARCHITECTURE-CONTRACT.md §2.1, §7.1, §7.8
 *           docs/00_Contracts/26-PLAN-VIEW-ELEMENT-CREATION-PARITY-CONTRACT.md
 *
 * Mirrors the WallModePicker pattern with five modes:
 *   • Linear     — freeform straight segments, no axis snap
 *   • Orthogonal — 90°-constrained polygon
 *   • Curved     — arc segments (currently routes to LINEAR — arc draw deferred)
 *   • Rectangle  — 2-point axis-aligned rectangle
 *   • Auto       — click inside a room to use the room boundary
 *
 * Prefix: cmp-
 */

import { wallLinear, wallOrtho, wallCurved } from './icons/PryzmIcons';

export type CeilingPickerMode = 'linear' | 'ortho' | 'curved' | 'rectangle' | 'auto';

export interface CeilingTypeOption {
    id: string;
    name: string;
    totalThickness: number;
    category?: string;
}

export interface CeilingModePickerCallbacks {
    ceilingTypes: CeilingTypeOption[];
    currentTypeId?: string;
    onTypeChange: (id: string | undefined) => void;
    onSelectLinear:    () => void;
    onSelectOrtho:     () => void;
    onSelectCurved:    () => void;
    onSelectRectangle: () => void;
    onSelectAutoRoom:  () => void;
}

export class CeilingModePicker {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private el: HTMLElement | null = null;
    private escHandler: ((e: KeyboardEvent) => void) | null = null;

    private _lastMode: CeilingPickerMode = 'linear';

    getActiveMode(): CeilingPickerMode { return this._lastMode; }

    setActiveMode(mode: CeilingPickerMode): void {
        this._lastMode = mode;
        console.log('[CeilingModePicker] setActiveMode →', mode);
    }

    show(callbacks: CeilingModePickerCallbacks): void {
        this.dismiss();

        const panel = document.createElement('div');
        panel.className = 'cmp-panel';

        // ── Gradient header ────────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'cmp-header';
        const headerTitle = document.createElement('span');
        headerTitle.className = 'cmp-header-title';
        headerTitle.textContent = 'New Ceiling';
        const headerSep = document.createElement('span');
        headerSep.className = 'cmp-header-sep';
        const headerSub = document.createElement('span');
        headerSub.className = 'cmp-header-sub';
        headerSub.textContent = 'Default Ceiling + Apply';
        header.appendChild(headerTitle);
        header.appendChild(headerSep);
        header.appendChild(headerSub);
        panel.appendChild(header);

        // ── System type row ───────────────────────────────────────────────────
        const typeRow = document.createElement('div');
        typeRow.className = 'cmp-type-row';

        const typeLabel = document.createElement('span');
        typeLabel.className = 'cmp-type-label';
        typeLabel.textContent = 'Ceiling Type';
        typeRow.appendChild(typeLabel);

        const typeSelect = document.createElement('select');
        typeSelect.className = 'cmp-type-select';

        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = '— Default Ceiling —';
        typeSelect.appendChild(noneOpt);

        for (const t of callbacks.ceilingTypes) {
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
        divider.className = 'cmp-divider';
        panel.appendChild(divider);

        // ── Mode buttons ──────────────────────────────────────────────────────
        const modes: Array<{
            key: string; label: string; sub: string; svg: string;
            modeId: CeilingPickerMode; action: () => void;
        }> = [
            { key: 'L', label: 'Linear',     sub: 'Freeform polygon',    svg: wallLinear,           modeId: 'linear',    action: callbacks.onSelectLinear    },
            { key: 'O', label: 'Orthogonal', sub: '90° constrained',     svg: wallOrtho,            modeId: 'ortho',     action: callbacks.onSelectOrtho     },
            { key: 'C', label: 'Curved',     sub: 'Arc segments',        svg: wallCurved,           modeId: 'curved',    action: callbacks.onSelectCurved    },
            { key: 'R', label: 'Rectangle',  sub: '2-point box',         svg: buildRectangleSVG(),  modeId: 'rectangle', action: callbacks.onSelectRectangle },
            { key: 'A', label: 'Auto',       sub: 'Click inside a room', svg: buildAutoRoomSVG(),   modeId: 'auto',      action: callbacks.onSelectAutoRoom  },
        ];

        const modeRow = document.createElement('div');
        modeRow.className = 'cmp-mode-row';

        for (const mode of modes) {
            const btn = document.createElement('button');
            btn.className = 'cmp-btn';
            btn.setAttribute('title', `${mode.label} — ${mode.sub} (${mode.key})`);
            btn.innerHTML = `
                <span class="cmp-icon">${mode.svg}</span>
                <span class="cmp-btn-text">
                    <span class="cmp-key">${mode.key}</span>
                    <span class="cmp-label">${mode.label}</span>
                </span>
            `;
            btn.addEventListener('click', () => {
                this._lastMode = mode.modeId;
                console.log('[CeilingModePicker] Mode selected:', mode.modeId);
                this.dismiss();
                mode.action();
            });
            modeRow.appendChild(btn);
        }

        panel.appendChild(modeRow);

        // ── ESC hint ──────────────────────────────────────────────────────────
        const hint = document.createElement('div');
        hint.className = 'cmp-hint';
        hint.textContent = 'Continuous creation · ESC to finish';
        panel.appendChild(hint);

        document.body.appendChild(panel);
        this.el = panel;

        this.escHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { this.dismiss(); return; }
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
            const k = e.key.toUpperCase();
            const map: Record<string, CeilingPickerMode> = { L: 'linear', O: 'ortho', C: 'curved', R: 'rectangle', A: 'auto' };
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
        fill="currentColor" fill-opacity="0.12"/>
  <line x1="32" y1="20" x2="32" y2="28" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <line x1="28" y1="24" x2="36" y2="24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <line x1="29" y1="21" x2="35" y2="27" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="35" y1="21" x2="29" y2="27" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;
}
