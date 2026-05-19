/**
 * WallModePicker — In-viewport HUD for wall drawing mode selection.
 *
 * CONTRACT COMPLIANCE:
 *   §05-BIM-UI-ARCHITECTURE §2.1  : CSS via AppTheme.ts (wmp- prefix), no independent <style> tags.
 *   §05-BIM-UI-ARCHITECTURE §7.1  : No direct store mutations — callbacks delegate to commandManager path.
 *   §05-BIM-UI-ARCHITECTURE §7.8  : No @thatopen/ui (bim-*) elements — plain native HTML only.
 *   §01-BIM-ENGINE-CORE §1.5      : UI layer only — reads no stores, calls no builders.
 *   §04-WALL-TOOL-STATE-MACHINE   : Activation is via service.activateWallTool() in caller; this
 *                                   component is pure UI — it emits mode selection and dismisses.
 *
 * Shows a floating HUD at the top-centre of the viewport with:
 *   • Wall System Type dropdown (data provided by caller, not read from store here)
 *   • Three 3D-isometric wall-mode icons: Linear (POLYLINE), Orthogonal (POLYLINE_ORTHO), Curved (POLYLINE_ARC)
 *
 * Drawing continues until ESC — all three modes are polyline (continuous).
 *
 * Sprint 2 Phase 5: _lastMode persists the most recently selected mode so that
 * PlanViewToolHandlers can query getActiveMode() to apply the correct drawing
 * constraint without requiring tool re-activation.
 */

import { wallLinear, wallOrtho, wallCurved, wallBySlab } from './icons/PryzmIcons';

export type WallPickerMode = 'linear' | 'ortho' | 'curved' | 'byslab';

export interface WallTypeOption {
    id: string;
    name: string;
    totalThickness: number;
}

export interface WallModePickerCallbacks {
    wallTypes: WallTypeOption[];
    currentWallTypeId?: string;
    onWallTypeChange: (id: string | undefined) => void;
    onSelectLinear:  () => void;
    onSelectOrtho:   () => void;
    onSelectCurved:  () => void;
    onSelectBySlab?: () => void;
}

export class WallModePicker {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private el: HTMLElement | null = null;
    private escHandler: ((e: KeyboardEvent) => void) | null = null;

    /** Last mode selected by the user. Defaults to 'linear'. */
    private _lastMode: WallPickerMode = 'linear';

    /**
     * Returns the most recently selected drawing mode.
     * Read on every mousemove by PlanViewToolHandlers — never cached by the handler.
     */
    getActiveMode(): WallPickerMode {
        return this._lastMode;
    }

    /**
     * Programmatically sets the active mode without showing the picker panel.
     * Called by Layout.ts when WallDrawingHUD switches mode mid-draw, or when the
     * wall tool activates with a specific WallDrawingMode (e.g. POLYLINE_ORTHO).
     * Keeps wallModePicker._lastMode in sync so plan-view handlers read the correct mode.
     */
    setActiveMode(mode: WallPickerMode): void {
        this._lastMode = mode;
        console.log('[WallModePicker] setActiveMode →', mode);
    }

    show(callbacks: WallModePickerCallbacks): void {
        this.dismiss();

        const panel = document.createElement('div');
        panel.className = 'wmp-panel';

        // ── Gradient header ───────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'wmp-header';
        const headerTitle = document.createElement('span');
        headerTitle.className = 'wmp-header-title';
        headerTitle.textContent = 'Wall Mode';
        const headerSep = document.createElement('span');
        headerSep.className = 'wmp-header-sep';
        const headerSub = document.createElement('span');
        headerSub.className = 'wmp-header-sub';
        headerSub.textContent = 'Select drawing mode';
        header.appendChild(headerTitle);
        header.appendChild(headerSep);
        header.appendChild(headerSub);
        panel.appendChild(header);

        // ── Wall System Type row ──────────────────────────────────────────────
        const typeRow = document.createElement('div');
        typeRow.className = 'wmp-type-row';

        const typeLabel = document.createElement('span');
        typeLabel.className = 'wmp-type-label';
        typeLabel.textContent = 'Wall Type';
        typeRow.appendChild(typeLabel);

        const typeSelect = document.createElement('select');
        typeSelect.className = 'wmp-type-select';

        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = '— Plain Wall —';
        typeSelect.appendChild(noneOpt);

        for (const t of callbacks.wallTypes) {
            const opt = document.createElement('option');
            opt.value = t.id;
            const thk = Math.round(t.totalThickness * 1000);
            opt.textContent = `${t.name}  (${thk} mm)`;
            typeSelect.appendChild(opt);
        }
        typeSelect.value = callbacks.currentWallTypeId ?? '';

        typeSelect.addEventListener('change', () => {
            const val = typeSelect.value || undefined;
            callbacks.onWallTypeChange(val);
        });

        typeRow.appendChild(typeSelect);
        panel.appendChild(typeRow);

        // ── Divider ───────────────────────────────────────────────────────────
        const divider = document.createElement('div');
        divider.className = 'wmp-divider';
        panel.appendChild(divider);

        // ── Mode buttons ──────────────────────────────────────────────────────
        const modes: Array<{ key: string; label: string; sub: string; svg: string; modeId: WallPickerMode; action: () => void; optional?: boolean }> = [
            {
                key: 'L',
                label: 'Linear',
                sub: 'Continuous straight',
                svg: wallLinear,
                modeId: 'linear',
                action: callbacks.onSelectLinear,
            },
            {
                key: 'O',
                label: 'Orthogonal',
                sub: '90° constrained',
                svg: wallOrtho,
                modeId: 'ortho',
                action: callbacks.onSelectOrtho,
            },
            {
                key: 'C',
                label: 'Curved',
                sub: 'Arc segments',
                svg: wallCurved,
                modeId: 'curved',
                action: callbacks.onSelectCurved,
            },
            ...(callbacks.onSelectBySlab ? [{
                key: 'S',
                label: 'By Slab',
                sub: 'From selected slab',
                svg: wallBySlab,
                modeId: 'byslab' as WallPickerMode,
                action: callbacks.onSelectBySlab,
            }] : []),
        ];

        const modeRow = document.createElement('div');
        modeRow.className = 'wmp-mode-row';

        for (const mode of modes) {
            const btn = document.createElement('button');
            btn.className = 'wmp-btn';
            btn.setAttribute('title', `${mode.label} — ${mode.sub} (${mode.key})`);
            btn.innerHTML = `
                <span class="wmp-icon">${mode.svg}</span>
                <span class="wmp-btn-text">
                    <span class="wmp-key">${mode.key}</span>
                    <span class="wmp-label">${mode.label}</span>
                </span>
            `;
            btn.addEventListener('click', () => {
                this._lastMode = mode.modeId;
                console.log('[WallModePicker] Mode selected:', mode.modeId);
                this.dismiss();
                mode.action();
            });
            modeRow.appendChild(btn);
        }

        panel.appendChild(modeRow);

        // ── ESC hint ─────────────────────────────────────────────────────────
        const hint = document.createElement('div');
        hint.className = 'wmp-hint';
        hint.textContent = 'Draw continues until ESC';
        panel.appendChild(hint);

        document.body.appendChild(panel);
        this.el = panel;

        this.escHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { this.dismiss(); return; }
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
            const k = e.key.toUpperCase();
            if (k === 'L') { e.preventDefault(); this._lastMode = 'linear';  this.dismiss(); callbacks.onSelectLinear(); }
            if (k === 'O') { e.preventDefault(); this._lastMode = 'ortho';   this.dismiss(); callbacks.onSelectOrtho(); }
            if (k === 'C') { e.preventDefault(); this._lastMode = 'curved';  this.dismiss(); callbacks.onSelectCurved(); }
            if (k === 'S' && callbacks.onSelectBySlab) { e.preventDefault(); this._lastMode = 'byslab'; this.dismiss(); callbacks.onSelectBySlab(); }
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

// SVG icons are now exported from src/ui/icons/PryzmIcons.ts
// (wallLinear, wallOrtho, wallCurved) — imported at the top of this file.
