/**
 * StairPathHUD — DOM HUD component for the 2D stair path drawing tool.
 *
 * Renders a fixed pill bar at the bottom-centre of the screen while the tool
 * is active, showing:
 *   • State-aware instruction text
 *   • Live step count / riser / tread readout
 *   • Per-run breakdown for L/U/complex shapes  (e.g. "Run 1: 8 + Run 2: 7")
 *   • Shape badge (I / L / U / complex)
 *   • Key hints (Enter, ESC, SHIFT, Backspace)
 *   • SHIFT-snap active indicator
 *
 * No Three.js, no canvas — pure DOM manipulation.
 */

import type { SolverResult2D } from './StairSolver2D';
import type { CurvedSolverResult } from './CurvedStairSolver';

type HudPhase = 'start' | 'drawing' | 'multi-segment'
    | 'curved-center' | 'curved-radius' | 'curved-sweep';

interface HudState {
    phase:         HudPhase;
    result:        SolverResult2D | null;
    curvedResult:  CurvedSolverResult | null;
    shiftSnap:     boolean;
    pointCount:    number;
    shapeHint:     string | null;   // 'I' | 'L' | 'U' | null — from ribbon selection
}

export class StairPathHUD {
    private _bar:       HTMLElement | null = null;
    private _info:      HTMLElement | null = null;
    private _state:     HudState = {
        phase:        'start',
        result:       null,
        curvedResult: null,
        shiftSnap:    false,
        pointCount:   0,
        shapeHint:    null,
    };

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    show(): void {
        this._createElements();
        this._render();
    }

    hide(): void {
        this._bar?.remove();
        this._info?.remove();
        this._bar  = null;
        this._info = null;
    }

    destroy(): void {
        this.hide();
    }

    // ── State updates ─────────────────────────────────────────────────────────

    private update(patch: Partial<HudState>): void {
        Object.assign(this._state, patch);
        if (this._bar) this._render();
    }

    setResult(result: SolverResult2D | null): void {
        this.update({ result, curvedResult: null });
    }

    setCurvedResult(curvedResult: CurvedSolverResult | null): void {
        const phase: HudPhase = curvedResult ? 'curved-sweep' : 'curved-radius';
        this.update({ curvedResult, result: null, phase });
    }

    setShiftSnap(active: boolean): void {
        this.update({ shiftSnap: active });
    }

    /** Set shape hint from ribbon (I/L/U) so HUD can show step-by-step guidance. */
    setShapeHint(hint: string | null): void {
        this.update({ shapeHint: hint });
    }

    setPointCount(count: number): void {
        const curPhase = this._state.phase;
        const isCurved = curPhase.startsWith('curved-');
        let phase: HudPhase;
        if (isCurved) {
            phase = count === 0 ? 'curved-center'
                  : count === 1 ? 'curved-radius'
                  : 'curved-sweep';
        } else {
            phase = count === 0 ? 'start'
                  : count <= 2  ? 'drawing'
                  : 'multi-segment';
        }
        this.update({ phase, pointCount: count });
    }

    /** Switch HUD into curved-mode phases. */
    setCurvedPhase(phase: 'center' | 'radius' | 'sweep'): void {
        const hudPhase: HudPhase = `curved-${phase}`;
        this.update({ phase: hudPhase });
    }

    // ── DOM construction ──────────────────────────────────────────────────────

    private _createElements(): void {
        if (this._bar) return;

        // ── Main instruction bar ──────────────────────────────────────────────
        const bar = document.createElement('div');
        bar.id = 'spt-hud-bar';
        bar.className = 'spt-hud';
        document.body.appendChild(bar);
        this._bar = bar;

        // ── Per-run info strip ────────────────────────────────────────────────
        const info = document.createElement('div');
        info.id = 'spt-run-info';
        info.style.cssText = `
            position: fixed;
            bottom: 56px;
            left: 50%;
            transform: translateX(-50%);
            display: none;
            gap: 6px;
            z-index: 10002;
            pointer-events: none;
        `;
        document.body.appendChild(info);
        this._info = info;
    }

    // ── Render ────────────────────────────────────────────────────────────────

    private _render(): void {
        this._renderBar();
        this._renderRunInfo();
    }

    private _renderBar(): void {
        const bar = this._bar;
        if (!bar) return;

        const { phase, result, curvedResult, shiftSnap } = this._state;
        bar.className = `spt-hud${shiftSnap ? ' spt-snap-active' : ''}`;

        const isCurved = phase.startsWith('curved-');
        const msg = this._phaseMsg(phase);

        const badge = curvedResult
            ? this._curvedBadge(curvedResult)
            : result ? this._badge(result) : '';

        const shapeBadge = curvedResult
            ? this._curvedShapeBadge()
            : (result && result.segments.length > 0 ? this._shapeBadge(result) : '');

        const undoHint = isCurved ? 'Back' : 'Undo pt';

        bar.innerHTML = `
            <span class="spt-icon">⌘</span>
            <span class="spt-msg">${msg}</span>
            ${shapeBadge ? `<span class="spt-sep"></span>${shapeBadge}` : ''}
            ${badge      ? `<span class="spt-sep"></span>${badge}`      : ''}
            <span class="spt-sep"></span>
            <span class="spt-key"><kbd>↵</kbd> Finish</span>
            <span class="spt-key"><kbd>⌫</kbd> ${undoHint}</span>
            ${!isCurved ? `<span class="spt-key"><kbd>⇧</kbd> ${shiftSnap ? '<b>Snap ON</b>' : 'Snap 90°'}</span>` : ''}
            <span class="spt-key"><kbd>ESC</kbd> Cancel</span>
        `;
    }

    private _renderRunInfo(): void {
        const el = this._info;
        if (!el) return;

        // Curved stair: show arc summary chip
        const cr = this._state.curvedResult;
        if (cr) {
            el.style.display = 'flex';
            const sweepDeg = Math.round(Math.abs(cr.sweepAngle) * 180 / Math.PI);
            const dir = cr.sweepAngle >= 0 ? 'CCW' : 'CW';
            el.innerHTML = `
                <span style="
                    background: rgba(15,20,30,0.88);
                    backdrop-filter: blur(8px);
                    border: 1px solid rgba(139,92,246,0.40);
                    border-radius: 6px;
                    padding: 3px 9px;
                    font-family: system-ui, sans-serif;
                    font-size: 11px;
                    color: #c4b5fd;
                    white-space: nowrap;
                ">
                    <b style="color:#a78bfa">Curved ${sweepDeg}° ${dir}</b>
                    &nbsp;·&nbsp;
                    ${cr.stepCount} risers
                    &nbsp;·&nbsp;
                    ${Math.round(cr.treadArcLength * 1000)} mm tread (walk)
                    &nbsp;·&nbsp;
                    Ø${Math.round((cr.innerRadius + cr.outerRadius) * 500)} mm walk ∅
                </span>
            `;
            return;
        }

        const r = this._state.result;
        if (!r || r.segments.length < 2) {
            el.style.display = 'none';
            return;
        }

        el.style.display = 'flex';

        const chips = r.segments.map((seg, i) => {
            const tread = Math.round(seg.treadDepth * 1000);
            return `
                <span style="
                    background: rgba(15,20,30,0.88);
                    backdrop-filter: blur(8px);
                    border: 1px solid rgba(59,130,246,0.35);
                    border-radius: 6px;
                    padding: 3px 9px;
                    font-family: system-ui, sans-serif;
                    font-size: 11px;
                    color: #93c5fd;
                    white-space: nowrap;
                ">
                    <b style="color:#60a5fa">Run ${i + 1}</b>
                    &nbsp;·&nbsp;
                    ${seg.stepCount} risers
                    &nbsp;·&nbsp;
                    ${tread} mm tread
                </span>
            `;
        }).join('');

        const rbl = r.risersBeforeLanding;
        const rblChip = rbl > 0 && r.segments.length >= 2
            ? `<span style="
                    background: rgba(30,58,138,0.7);
                    border: 1px solid rgba(96,165,250,0.4);
                    border-radius: 6px;
                    padding: 3px 9px;
                    font-family: system-ui, sans-serif;
                    font-size: 11px;
                    color: #bfdbfe;
                    white-space: nowrap;
                ">↓ ${rbl} before landing</span>`
            : '';

        el.innerHTML = chips + (rblChip ? rblChip : '');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private _phaseMsg(phase: HudPhase): string {
        const { shapeHint, pointCount } = this._state;

        switch (phase) {
            case 'start': {
                if (shapeHint === 'I') return 'Straight stair — click to set <b>start point</b>';
                if (shapeHint === 'L') return 'L-shape stair — click to set <b>start point</b>';
                if (shapeHint === 'U') return 'U-shape stair — click to set <b>start point</b>';
                return 'Click to set stair <b>start point</b>';
            }
            case 'drawing': {
                if (shapeHint === 'I') return 'Click to set the <b>end of run</b> (stair will be placed)';
                if (shapeHint === 'L') return `Click to set <b>end of run 1</b> (corner point)`;
                if (shapeHint === 'U') return `Click to set <b>end of run 1</b> (corner 1)`;
                return 'Click to add a <b>corner point</b> (or double-click to end)';
            }
            case 'multi-segment': {
                if (shapeHint === 'L') return 'Click to set <b>end of run 2</b> (stair will be placed)';
                if (shapeHint === 'U' && pointCount === 2) return 'Click to set <b>end of run 2</b> (corner 2)';
                if (shapeHint === 'U' && pointCount === 3) return 'Click to set <b>end of run 3</b> (stair will be placed)';
                return 'Continue — <b>double-click</b> or <kbd>↵</kbd> to finish';
            }
            case 'curved-center':  return 'Curved stair — click to set the <b>arc centre</b>';
            case 'curved-radius':  return 'Click to set <b>inner radius</b> &amp; start angle';
            case 'curved-sweep':   return 'Move to sweep the arc — click or <kbd>↵</kbd> to finish';
        }
    }

    private _shapeBadge(r: SolverResult2D): string {
        const colors: Record<string, string> = {
            I:       'rgba(16,185,129,0.18)',
            L:       'rgba(59,130,246,0.18)',
            U:       'rgba(139,92,246,0.18)',
            C:       'rgba(139,92,246,0.20)',
            complex: 'rgba(245,158,11,0.18)',
        };
        const borders: Record<string, string> = {
            I: '#10b981', L: '#3b82f6', U: '#8b5cf6', C: '#a78bfa', complex: '#f59e0b',
        };
        const bg = colors[r.shape] ?? colors.I;
        const bd = borders[r.shape] ?? borders.I;
        return `<span class="spt-badge" style="
            background:${bg}; border:1px solid ${bd};
            color:${bd}; font-size:10px; padding:2px 7px;
        ">${r.shape}-shape</span>`;
    }

    private _curvedShapeBadge(): string {
        return `<span class="spt-badge" style="
            background:rgba(139,92,246,0.22); border:1px solid #a78bfa;
            color:#a78bfa; font-size:10px; padding:2px 7px;
        ">C-curved</span>`;
    }

    private _badge(r: SolverResult2D): string {
        if (!r.isValid) {
            return `<span class="spt-badge spt-badge--err">✕ ${this._esc(r.validationMessage)}</span>`;
        }
        if (r.validationMessage.includes('⚠')) {
            return `<span class="spt-badge spt-badge--warn">${this._esc(r.validationMessage)}</span>`;
        }
        return `<span class="spt-badge spt-badge--ok">✓ ${this._esc(r.validationMessage)}</span>`;
    }

    private _curvedBadge(r: CurvedSolverResult): string {
        if (!r.isValid) {
            return `<span class="spt-badge spt-badge--err">✕ ${this._esc(r.validationMessage)}</span>`;
        }
        if (r.validationMessage.includes('⚠')) {
            return `<span class="spt-badge spt-badge--warn">${this._esc(r.validationMessage)}</span>`;
        }
        return `<span class="spt-badge spt-badge--ok">✓ ${this._esc(r.validationMessage)}</span>`;
    }

    private _esc(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}
