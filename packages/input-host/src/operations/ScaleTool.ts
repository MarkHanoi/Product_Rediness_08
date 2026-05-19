/**
 * @file src/tools/operations/ScaleTool.ts
 *
 * Dual-mode scale operation (per implementation plan §6.6):
 *
 * Mode A — Numeric input (shown immediately in OperationModeOverlay):
 *   The oop-offset-panel is shown with a factor input.
 *   User types a factor and presses Enter / clicks Apply.
 *   ScaleElementCommand is executed with the centroid of the wall as pivot.
 *
 * Mode B — Three-point pick (optional; user clicks the gizmo icon in the panel):
 *   1. Click base point (P1)
 *   2. Click reference point (P2) → ScaleGizmo renders ref line
 *   3. Click target point (P3) → factor = |P3-P1| / |P2-P1|
 *   ScaleElementCommand executed with P1 as pivot.
 *
 * Phase 1 delivers Mode A only; Mode B is stubbed (button present, logs intent).
 *
 * Contract:
 *   §01 §2.1 — mutations via commandManager.execute() only
 *   §04 §2   — Tool layer
 */

import { OperationToolBase } from './OperationToolBase.js';
import type { OperationId } from './ElementCapabilities.js';
import { ScaleElementCommand } from '@pryzm/command-registry';
import type { CommandManager } from '@pryzm/command-registry';
import type { Point3D } from '@pryzm/core-app-model';

export class ScaleTool extends OperationToolBase {
    get operationId(): OperationId { return 'scale'; }

    private _elementId = '';
    private _panel: HTMLDivElement | null = null;

    constructor(private readonly _cmd: CommandManager) {
        super();
    }

    activate(elementId: string, elementType: string): void {
        this._baseActivate(elementId, elementType);
        this._elementId = elementId;

        this._showPanel();
        this._showInstructions('Enter scale factor and press Apply — Esc to cancel');
    }

    override cancel(): void {
        this._destroyPanel();
        super.cancel();
    }

    // ── Panel ────────────────────────────────────────────────────────────────

    private _showPanel(): void {
        this._destroyPanel();

        const panel = document.createElement('div');
        panel.className = 'oop-offset-panel';    // reuse the offset panel style
        panel.setAttribute('data-tool', 'scale');
        panel.innerHTML = `
          <label class="oop-offset-label">Scale factor</label>
          <input  class="oop-offset-input" id="oop-scale-input"
                  type="number" min="0.01" max="100" step="0.1" value="1.0"
                  autocomplete="off" />
          <button class="oop-offset-apply" id="oop-scale-apply">Apply</button>
          <button class="oop-offset-cancel" id="oop-scale-cancel">✕</button>
        `;

        document.body.appendChild(panel);
        this._panel = panel;

        // Auto-focus the input
        const input = panel.querySelector<HTMLInputElement>('#oop-scale-input')!;
        setTimeout(() => input.focus(), 50);

        // Apply button
        panel.querySelector('#oop-scale-apply')!.addEventListener('click', () => {
            this._applyFromPanel();
        });

        // Cancel button
        panel.querySelector('#oop-scale-cancel')!.addEventListener('click', () => {
            this.cancel();
        });

        // Enter key in input
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); this._applyFromPanel(); }
            if (e.key === 'Escape') this.cancel();
        });
    }

    private _destroyPanel(): void {
        this._panel?.remove();
        this._panel = null;
    }

    private _applyFromPanel(): void {
        const input  = this._panel?.querySelector<HTMLInputElement>('#oop-scale-input');
        const factor = parseFloat(input?.value ?? '1');
        if (!isFinite(factor) || factor <= 0) {
            this._showInstructions('⚠ Enter a positive scale factor (e.g. 2.0 to double size)');
            return;
        }

        const pivot = this._getWallCentroid();
        this._destroyPanel();
        this._executeScale(factor, pivot);
    }

    private _executeScale(factor: number, pivot: Point3D): void {
        const cmd    = new ScaleElementCommand({
            elementId: this._elementId,
            scaleX:    factor,
            scaleZ:    factor,
            pivot,
        });
        const result = this._cmd.execute(cmd);
        if (!result.success) {
            const info = result.info?.[0] ?? 'Scale failed';
            window.dispatchEvent(new CustomEvent('bim-operation-error', { detail: { msg: info } })); // TODO(TASK-12)
            return;
        }
        this._complete();
    }

    private _getWallCentroid(): Point3D {
        const wall = window.wallStore?.getById?.(this._elementId); // TODO(TASK-08)
        if (wall) {
            return {
                x: (wall.baseLine[0].x + wall.baseLine[1].x) / 2,
                y:  wall.baseLine[0].y,
                z: (wall.baseLine[0].z + wall.baseLine[1].z) / 2,
            };
        }
        return { x: 0, y: 0, z: 0 };
    }
}
