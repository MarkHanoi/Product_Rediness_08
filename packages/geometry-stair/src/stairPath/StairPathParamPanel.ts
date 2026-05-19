/**
 * StairPathParamPanel — floating parameter panel for the stair path drawing tool.
 *
 * Shows while the tool is active, letting the user tweak stair parameters
 * in real-time without leaving the drawing interaction:
 *
 *   Shape mode selector: I · L · U · C (curved)
 *
 *   Straight (I/L/U) controls:
 *     • Width                    (slider + number input, 0.9–2.4 m)
 *     • Riser height             (number input, 100–220 mm → converted to metres)
 *     • Tread depth              (number input, 220–360 mm → converted to metres)
 *     • Risers before landing    (only when shape is L / U / complex)
 *     • Turn direction           (only when shape is L / U / complex)
 *
 *   Curved (C) controls:
 *     • Width                    (slider + number input)
 *     • Riser height
 *     • Inner radius             (slider, 0.3–3.0 m)
 *     • Sweep angle              (slider, 45–360°)
 *     • Turn direction           (CW / CCW)
 *
 * Architecture:
 *   • No Three.js, no canvas — pure DOM.
 *   • Fires an `onChange` callback whenever any value changes.
 *   • Positions itself relative to the coordinate canvas (baseCanvas) passed in.
 *   • Uses the PRYZM design system (white/violet palette, §05-§06 contract).
 *   • Panel is draggable via its header bar.
 */

import { BUILT_IN_STAIR_TYPES } from '../StairTypeDefinitions';
import type { StairShape2D } from './StairSolver2D';

export type StairMode = 'straight' | 'curved';

export interface StairParams {
    baseLevelId:         string;
    topLevelId:          string;
    typeId?:             string;
    width:               number;   // metres
    riserHeight:         number;   // metres
    riserCount:          number;   // count (0 = auto from riser height)
    treadDepth:          number;   // metres
    risersBeforeLanding: number;   // count (0 = auto) — run 1 explicit step count
    risersInRun2:        number;   // count (0 = auto) — run 2 explicit step count (L/U only)
    turnDirection:       'left' | 'right';
    /** U-shape variant: '2-run' (default, 3 clicks) or '3-run' (4 clicks, 2 landings). */
    uVariant:            '2-run' | '3-run';
    // Curved-specific
    stairMode:           StairMode;
    innerRadius:         number;   // metres (curved mode)
    sweepAngle:          number;   // degrees (curved mode, positive = CCW)
}

export type OnParamsChange = (p: StairParams) => void;

export interface StairLevelOption {
    id: string;
    name: string;
    elevation: number;
}

export class StairPathParamPanel {
    private _el: HTMLElement | null = null;
    private _params: StairParams;
    private _onChange: OnParamsChange;
    private _onShapeSelect: ((shape: 'I' | 'L' | 'U') => void) | null = null;
    /** Solver-detected shape — used only for hint text. */
    private _shape: StairShape2D = 'I';
    /** User-explicitly-selected shape — drives the active button state. */
    private _selectedShape: 'I' | 'L' | 'U' | 'C' = 'I';
    private _levels: StairLevelOption[];

    // Drag state
    private _dragging = false;
    private _dragStartX = 0;
    private _dragStartY = 0;
    private _panelStartLeft = 0;
    private _panelStartTop  = 0;
    private _onMouseMove: ((e: MouseEvent) => void) | null = null;
    private _onMouseUp:   ((e: MouseEvent) => void) | null = null;

    constructor(
        initial: StairParams,
        onChange: OnParamsChange,
        levels: StairLevelOption[] = [],
        onShapeSelect?: (shape: 'I' | 'L' | 'U') => void,
    ) {
        this._params        = { ...initial };
        this._onChange      = onChange;
        this._levels        = levels;
        this._onShapeSelect = onShapeSelect ?? null;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    show(coordinateCanvas: HTMLElement): void {
        if (this._el) return;
        this._el = this._build();
        document.body.appendChild(this._el);
        this._positionNear(coordinateCanvas);
        this._render();
    }

    hide(): void {
        this._removeDragListeners();
        this._el?.remove();
        this._el = null;
    }

    destroy(): void {
        this.hide();
    }

    // ── State ─────────────────────────────────────────────────────────────────

    /**
     * Called when the solver detects a new shape.
     * Updates the hint text only — does NOT change the user-selected button.
     */
    updateShape(shape: StairShape2D): void {
        if (this._shape === shape) return;
        this._shape = shape;
        this._render();
    }

    getParams(): StairParams {
        return { ...this._params };
    }

    // ── DOM build ─────────────────────────────────────────────────────────────

    private _build(): HTMLElement {
        const el = document.createElement('div');
        el.id = 'spt-param-panel';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'Stair parameters');
        // PRYZM design system — §05 §2.3 / §06 §5
        el.style.cssText = `
            position: fixed;
            top: 80px;
            right: 16px;
            z-index: 10010;
            width: 260px;
            background: #e8edf6;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(30,50,120,0.13), 0 2px 8px rgba(30,50,120,0.07);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 12px;
            color: #1a2035;
            user-select: none;
            overflow: hidden;
        `;

        // Header — violet gradient + drag handle
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex; align-items: center; gap: 7px;
            padding: 9px 14px 8px;
            background: linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%);
            box-shadow: 0 2px 12px rgba(102,0,255,0.35);
            cursor: grab;
        `;
        header.title = 'Drag to move panel';
        header.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
                 style="flex-shrink:0; opacity:0.9">
                <rect x="0" y="9" width="13" height="4" rx="1" fill="rgba(255,255,255,0.7)"/>
                <rect x="4" y="5" width="9" height="4" rx="1" fill="rgba(255,255,255,0.8)"/>
                <rect x="8" y="1" width="5" height="4" rx="1" fill="#ffffff"/>
            </svg>
            <span style="font-weight:700; font-size:10px; color:#fff; letter-spacing:0.09em; text-transform:uppercase; flex:1;">
                STAIR PARAMETERS
            </span>
            <span style="font-size:9px; color:rgba(255,255,255,0.55); letter-spacing:0.05em;">⠿ drag</span>
        `;
        el.appendChild(header);

        // Bind drag behaviour to the header
        this._bindDrag(header, el);

        // Body wrapper
        const bodyWrap = document.createElement('div');
        bodyWrap.style.cssText = `padding: 8px 12px 10px; background: #f8f9fc;`;

        // Body (rebuilt on every render)
        const body = document.createElement('div');
        body.id = 'spt-param-body';
        bodyWrap.appendChild(body);
        el.appendChild(bodyWrap);

        return el;
    }

    // ── Drag support ──────────────────────────────────────────────────────────

    private _bindDrag(handle: HTMLElement, panel: HTMLElement): void {
        handle.addEventListener('mousedown', (e: MouseEvent) => {
            if (e.button !== 0) return;
            e.preventDefault();

            this._dragging = true;
            this._dragStartX = e.clientX;
            this._dragStartY = e.clientY;

            // Switch from right-based to left-based positioning so we can move freely
            const rect = panel.getBoundingClientRect();
            this._panelStartLeft = rect.left;
            this._panelStartTop  = rect.top;
            panel.style.right = 'auto';
            panel.style.left  = `${rect.left}px`;
            panel.style.top   = `${rect.top}px`;

            handle.style.cursor = 'grabbing';

            this._onMouseMove = (ev: MouseEvent) => {
                if (!this._dragging || !this._el) return;
                const dx = ev.clientX - this._dragStartX;
                const dy = ev.clientY - this._dragStartY;
                const newLeft = this._panelStartLeft + dx;
                const newTop  = this._panelStartTop  + dy;
                // Clamp within viewport
                const panelW = this._el.offsetWidth;
                const panelH = this._el.offsetHeight;
                this._el.style.left = `${Math.max(0, Math.min(window.innerWidth  - panelW, newLeft))}px`;
                this._el.style.top  = `${Math.max(0, Math.min(window.innerHeight - panelH, newTop))}px`;
            };
            this._onMouseUp = () => {
                this._dragging = false;
                handle.style.cursor = 'grab';
                this._removeDragListeners();
            };

            document.addEventListener('mousemove', this._onMouseMove);
            document.addEventListener('mouseup',   this._onMouseUp);
        });
    }

    private _removeDragListeners(): void {
        if (this._onMouseMove) {
            document.removeEventListener('mousemove', this._onMouseMove);
            this._onMouseMove = null;
        }
        if (this._onMouseUp) {
            document.removeEventListener('mouseup', this._onMouseUp);
            this._onMouseUp = null;
        }
        this._dragging = false;
    }

    // ── Render ────────────────────────────────────────────────────────────────

    private _render(): void {
        const body = this._el?.querySelector('#spt-param-body') as HTMLElement | null;
        if (!body) return;

        const p = this._params;
        const curved    = p.stairMode === 'curved';
        // isMultiRun: L, U, or complex (detected from solver)
        const isMultiRun = !curved && (this._shape !== 'I' && this._shape !== 'C');

        body.innerHTML = '';

        // ── Shape mode selector ───────────────────────────────────────────────
        body.appendChild(this._buildModeSelector());
        body.appendChild(this._divider());

        if (this._levels.length > 0) {
            body.appendChild(this._rowSelect('Base level', '_baseLevel',
                p.baseLevelId,
                this._levels.map(level => ({ value: level.id, label: level.name })),
                (v) => {
                    this._params.baseLevelId = v;
                    this._fire();
                },
            ));
            body.appendChild(this._rowSelect('Top level', '_topLevel',
                p.topLevelId,
                this._levels.map(level => ({ value: level.id, label: level.name })),
                (v) => {
                    this._params.topLevelId = v;
                    this._fire();
                },
            ));
        }

        body.appendChild(this._rowSelect('Stair type', '_type',
            p.typeId ?? '',
            [
                { value: '', label: 'Default' },
                ...BUILT_IN_STAIR_TYPES.map(type => ({ value: type.id, label: type.name })),
            ],
            (v) => {
                this._params.typeId = v || undefined;
                this._fire();
            },
        ));
        body.appendChild(this._divider());

        // ── Common: Width ─────────────────────────────────────────────────────
        body.appendChild(this._rowSlider('Width', '_width',
            (p.width * 100).toFixed(0), 90, 240, 5,
            'cm', (v) => {
                this._params.width = Number(v) / 100;
                this._fire();
            },
        ));

        // ── Common: Riser height ──────────────────────────────────────────────
        body.appendChild(this._rowNumber('Riser', '_riser',
            Math.round(p.riserHeight * 1000), 100, 220, 1,
            'mm', (v) => {
                this._params.riserHeight = Number(v) / 1000;
                this._params.riserCount = 0;
                this._fire();
            },
        ));

        body.appendChild(this._rowNumber('Risers', '_risers',
            p.riserCount, 0, 60, 1,
            '', (v) => {
                this._params.riserCount = Math.max(0, Math.round(Number(v) || 0));
                this._fire();
            },
            'Auto',
        ));

        if (!curved) {
            // ── Straight: Tread depth ─────────────────────────────────────────
            body.appendChild(this._rowNumber('Tread', '_tread',
                Math.round(p.treadDepth * 1000), 220, 360, 5,
                'mm', (v) => {
                    this._params.treadDepth = Number(v) / 1000;
                    this._fire();
                },
            ));

            // ── Straight: Per-run step count + turn direction (L / U) ─────────
            if (isMultiRun || this._selectedShape === 'L' || this._selectedShape === 'U') {
                body.appendChild(this._divider());

                const runSectionLabel = document.createElement('div');
                runSectionLabel.style.cssText = `
                    font-size: 10px; font-weight: 600; letter-spacing: 0.06em;
                    color: #8b9ac0; text-transform: uppercase;
                    margin-bottom: 6px;
                `;
                runSectionLabel.textContent = 'Steps per run (0 = auto)';
                body.appendChild(runSectionLabel);

                body.appendChild(this._rowNumber('Run 1 risers', '_rbl',
                    p.risersBeforeLanding || 0, 0, 99, 1,
                    '', (v) => {
                        this._params.risersBeforeLanding = Number(v);
                        this._fire();
                    },
                    '0 = auto',
                ));

                body.appendChild(this._rowNumber('Run 2 risers', '_rbl2',
                    p.risersInRun2 || 0, 0, 99, 1,
                    '', (v) => {
                        this._params.risersInRun2 = Number(v);
                        this._fire();
                    },
                    '0 = auto',
                ));

                body.appendChild(this._divider());
                body.appendChild(this._rowToggle('2nd run dir', p.turnDirection, (v) => {
                    this._params.turnDirection = v;
                    this._fire();
                }));

                // U-shape only: pick between 2-run (3 clicks) and 3-run (4 clicks).
                if (this._selectedShape === 'U') {
                    body.appendChild(this._divider());
                    body.appendChild(this._rowURuns(p.uVariant, (v) => {
                        this._params.uVariant = v;
                        this._fire();
                    }));
                }
            }
        } else {
            // ── Curved: Inner radius ──────────────────────────────────────────
            body.appendChild(this._rowSlider('Inner R', '_innerR',
                (p.innerRadius * 100).toFixed(0), 30, 300, 5,
                'cm', (v) => {
                    this._params.innerRadius = Number(v) / 100;
                    this._fire();
                },
            ));

            // ── Curved: Sweep angle ───────────────────────────────────────────
            body.appendChild(this._rowSlider('Sweep', '_sweep',
                p.sweepAngle.toFixed(0), 45, 360, 15,
                '°', (v) => {
                    this._params.sweepAngle = Number(v);
                    this._fire();
                },
            ));

            // ── Curved: Turn direction (CW / CCW) ─────────────────────────────
            body.appendChild(this._rowToggleCurved('Direction', p.turnDirection, (v) => {
                this._params.turnDirection = v;
                this._fire();
            }));
        }

        // ── Hint ──────────────────────────────────────────────────────────────
        const hint = document.createElement('div');
        hint.style.cssText = `
            margin-top: 10px; padding-top: 8px;
            border-top: 1px solid #dde3f0;
            color: #8b9ac0; font-size: 10px; line-height: 1.4;
        `;
        if (curved) {
            hint.textContent = 'Curved stair · Click center → radius → sweep · Enter to finish';
        } else if (this._selectedShape === 'U') {
            hint.textContent = p.uVariant === '3-run'
                ? 'U-shape · 3 runs · 4 clicks: Start → Corner 1 → Corner 2 → End'
                : 'U-shape · 2 runs · 3 clicks: Start → Landing → End';
        } else if (this._selectedShape === 'L') {
            hint.textContent = 'L-shape · Click: Start → Corner → End · 90° turn';
        } else if (isMultiRun) {
            hint.textContent = `${this._shape}-shape · Run 1/2 risers: 0 = auto-distribute`;
        } else {
            hint.textContent = 'Straight stair · Click start and end points';
        }
        body.appendChild(hint);
    }

    // ── Mode selector ─────────────────────────────────────────────────────────

    private _buildModeSelector(): HTMLElement {
        const wrap = document.createElement('div');
        wrap.style.cssText = `
            display: flex; align-items: center; gap: 6px; margin-bottom: 8px;
        `;

        const lbl = document.createElement('label');
        lbl.textContent = 'Shape';
        lbl.style.cssText = `
            min-width: 60px; font-size: 11px; font-weight: 600;
            color: #4a5578; flex-shrink: 0;
        `;
        wrap.appendChild(lbl);

        const btnWrap = document.createElement('div');
        btnWrap.style.cssText = `
            display:flex; gap:4px; flex:1;
            background: #e8edf6; border-radius: 8px; padding: 3px;
        `;

        const modes: { label: 'I' | 'L' | 'U' | 'C'; mode: StairMode; hint?: string }[] = [
            { label: 'I', mode: 'straight', hint: 'Straight stair' },
            { label: 'L', mode: 'straight', hint: 'L-shape (90° turn)' },
            { label: 'U', mode: 'straight', hint: 'U-shape (180° turn, two parallel runs)' },
            { label: 'C', mode: 'curved',   hint: 'Curved stair' },
        ];

        // Active label is driven by the explicitly user-selected shape — NOT the solver-detected shape
        const activeLabel = this._selectedShape;

        for (const m of modes) {
            const btn = document.createElement('button');
            btn.textContent = m.label;
            btn.title = m.hint ?? `${m.label}-shape stair`;

            const active = m.label === activeLabel;
            btn.style.cssText = `
                flex: 1; padding: 5px 0; border-radius: 6px; border: none;
                font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit;
                background: ${active ? 'linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%)' : 'transparent'};
                color: ${active ? '#fff' : '#6b7a9e'};
                box-shadow: ${active ? '0 2px 8px rgba(102,0,255,0.3)' : 'none'};
                transition: background 0.12s, color 0.12s, box-shadow 0.12s;
            `;
            btn.addEventListener('click', () => {
                if (m.label === 'C') {
                    this._params.stairMode = 'curved';
                    this._selectedShape    = 'C';
                    this._shape            = 'C';
                } else {
                    this._params.stairMode = 'straight';
                    this._selectedShape    = m.label;
                    this._shape            = m.label;
                    // Notify controller so it can update _expectedSegments
                    this._onShapeSelect?.(m.label);
                }
                console.log(`[StairPathParamPanel] Shape selected: ${m.label} (selectedShape=${this._selectedShape})`);
                this._render();
                this._fire();
            });
            btnWrap.appendChild(btn);
        }
        wrap.appendChild(btnWrap);
        return wrap;
    }

    // ── Row builders ──────────────────────────────────────────────────────────

    private _rowSlider(
        label: string,
        _id: string,
        value: string,
        min: number,
        max: number,
        step: number,
        unit: string,
        onChange: (v: string) => void,
    ): HTMLElement {
        const row = this._makeRow(label);

        const slider = document.createElement('input');
        slider.type  = 'range';
        slider.min   = String(min);
        slider.max   = String(max);
        slider.step  = String(step);
        slider.value = value;
        slider.style.cssText = `
            flex: 1; height: 3px; cursor: pointer;
            accent-color: #6600FF;
        `;

        const numInput = document.createElement('input');
        numInput.type  = 'number';
        numInput.min   = String(min);
        numInput.max   = String(max);
        numInput.step  = String(step);
        numInput.value = value;
        numInput.style.cssText = this._numInputCss();

        const unitLabel = document.createElement('span');
        unitLabel.textContent = unit;
        unitLabel.style.cssText = 'color:#8b9ac0; font-size:10px; min-width:14px;';

        slider.addEventListener('input', () => {
            numInput.value = slider.value;
            onChange(slider.value);
        });
        numInput.addEventListener('change', () => {
            slider.value = numInput.value;
            onChange(numInput.value);
        });

        row.append(slider, numInput, unitLabel);
        return row;
    }

    private _rowNumber(
        label: string,
        _id: string,
        value: number,
        min: number,
        max: number,
        step: number,
        unit: string,
        onChange: (v: string) => void,
        placeholder?: string,
    ): HTMLElement {
        const row = this._makeRow(label);

        const numInput = document.createElement('input');
        numInput.type  = 'number';
        numInput.min   = String(min);
        numInput.max   = String(max);
        numInput.step  = String(step);
        numInput.value = String(value);
        if (placeholder) numInput.placeholder = placeholder;
        numInput.style.cssText = this._numInputCss() + 'flex:1;';

        if (unit) {
            const unitLabel = document.createElement('span');
            unitLabel.textContent = unit;
            unitLabel.style.cssText = 'color:#8b9ac0; font-size:10px; min-width:14px;';
            numInput.addEventListener('change', () => onChange(numInput.value));
            row.append(numInput, unitLabel);
        } else {
            numInput.addEventListener('change', () => onChange(numInput.value));
            row.appendChild(numInput);
        }

        return row;
    }

    private _rowSelect(
        label: string,
        _id: string,
        value: string,
        options: { value: string; label: string }[],
        onChange: (v: string) => void,
    ): HTMLElement {
        const row = this._makeRow(label);
        const select = document.createElement('select');
        select.value = value;
        select.style.cssText = `
            flex: 1; min-width: 0; background: #fff;
            border: 1px solid #dde3f0; border-radius: 6px;
            color: #1a2035; padding: 4px 6px; font-size: 11px;
            font-family: inherit; outline: none;
            accent-color: #6600FF;
        `;

        for (const option of options) {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.textContent = option.label;
            if (option.value === value) opt.selected = true;
            select.appendChild(opt);
        }

        select.addEventListener('change', () => onChange(select.value));
        row.appendChild(select);
        return row;
    }

    private _rowToggle(
        label: string,
        current: 'left' | 'right',
        onChange: (v: 'left' | 'right') => void,
    ): HTMLElement {
        const row = this._makeRow(label);
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex; gap:4px; flex:1;';

        for (const val of ['left', 'right'] as const) {
            const btn = document.createElement('button');
            btn.textContent = val === 'left' ? '↰ Left' : '↱ Right';
            const active = val === current;
            btn.style.cssText = `
                flex: 1; padding: 4px 0; border-radius: 5px; border: 1px solid;
                font-size: 10px; font-weight: 600; cursor: pointer; font-family: inherit;
                background: ${active ? '#6600FF' : '#fff'};
                border-color: ${active ? '#6600FF' : '#dde3f0'};
                color: ${active ? '#fff' : '#4a5578'};
                transition: background 0.12s, border-color 0.12s, color 0.12s;
            `;
            btn.addEventListener('click', () => {
                this._params.turnDirection = val;
                this._render();
                onChange(val);
            });
            wrap.appendChild(btn);
        }
        row.appendChild(wrap);
        return row;
    }

    private _rowURuns(
        current: '2-run' | '3-run',
        onChange: (v: '2-run' | '3-run') => void,
    ): HTMLElement {
        const row = this._makeRow('U runs');
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex; gap:4px; flex:1;';

        for (const val of ['2-run', '3-run'] as const) {
            const btn = document.createElement('button');
            btn.textContent = val === '2-run' ? '2 runs' : '3 runs';
            btn.title = val === '2-run'
                ? '2 runs · 1 landing · 3 clicks'
                : '3 runs · 2 landings · 4 clicks';
            const active = val === current;
            btn.style.cssText = `
                flex: 1; padding: 4px 0; border-radius: 5px; border: 1px solid;
                font-size: 10px; font-weight: 600; cursor: pointer; font-family: inherit;
                background: ${active ? '#6600FF' : '#fff'};
                border-color: ${active ? '#6600FF' : '#dde3f0'};
                color: ${active ? '#fff' : '#4a5578'};
                transition: background 0.12s, border-color 0.12s, color 0.12s;
            `;
            btn.addEventListener('click', () => {
                this._params.uVariant = val;
                this._render();
                onChange(val);
            });
            wrap.appendChild(btn);
        }
        row.appendChild(wrap);
        return row;
    }

    private _rowToggleCurved(
        label: string,
        current: 'left' | 'right',
        onChange: (v: 'left' | 'right') => void,
    ): HTMLElement {
        const row = this._makeRow(label);
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex; gap:4px; flex:1;';

        for (const val of ['left', 'right'] as const) {
            const btn = document.createElement('button');
            btn.textContent = val === 'left' ? '↺ CCW' : '↻ CW';
            const active = val === current;
            btn.style.cssText = `
                flex: 1; padding: 4px 0; border-radius: 5px; border: 1px solid;
                font-size: 10px; font-weight: 600; cursor: pointer; font-family: inherit;
                background: ${active ? '#6600FF' : '#fff'};
                border-color: ${active ? '#6600FF' : '#dde3f0'};
                color: ${active ? '#fff' : '#4a5578'};
                transition: background 0.12s, border-color 0.12s, color 0.12s;
            `;
            btn.addEventListener('click', () => {
                this._params.turnDirection = val;
                this._render();
                onChange(val);
            });
            wrap.appendChild(btn);
        }
        row.appendChild(wrap);
        return row;
    }

    private _makeRow(label: string): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex; align-items: center; gap: 6px;
            margin-bottom: 7px; min-height: 22px;
        `;
        const lbl = document.createElement('label');
        lbl.textContent = label;
        lbl.style.cssText = `
            min-width: 80px; font-size: 11px; font-weight: 500;
            color: #4a5578; flex-shrink: 0;
        `;
        row.appendChild(lbl);
        return row;
    }

    private _divider(): HTMLElement {
        const d = document.createElement('div');
        d.style.cssText = `
            border-top: 1px solid #dde3f0;
            margin: 8px 0 9px;
        `;
        return d;
    }

    private _numInputCss(): string {
        return `
            width: 52px; background: #fff;
            border: 1px solid #dde3f0; border-radius: 5px;
            color: #1a2035; padding: 3px 6px; font-size: 11px;
            text-align: right; font-family: inherit; outline: none;
        `;
    }

    // ── Positioning ───────────────────────────────────────────────────────────

    private _positionNear(coordinateCanvas: HTMLElement): void {
        const rect = coordinateCanvas.getBoundingClientRect();
        if (!this._el) return;
        this._el.style.top   = `${rect.top + 8}px`;
        this._el.style.right = `${window.innerWidth - rect.right + 8}px`;
        this._el.style.left  = 'auto';
    }

    private _fire(): void {
        this._onChange({ ...this._params });
    }
}
