/**
 * @file src/tools/operations/OffsetTool.ts
 *
 * Creates a parallel copy of the selected element at a user-specified distance.
 *
 * Interaction flow (per implementation plan §6.7):
 *   1. SelectionOverlay calls activate(elementId, elementType)
 *   2. Distance input panel appears (oop-offset-panel)
 *   3. User enters distance and clicks Apply (or presses Enter)
 *   4. Instruction: "Click the side you want the offset copy to appear on"
 *   5. User clicks in viewport → sign of distance is determined by which side of
 *      the wall the click lands relative to the wall normal
 *   6. OffsetElementCommand executed with ±distance
 *
 * If the user checks "Both sides", the command is executed twice (positive + negative).
 *
 * Contract:
 *   §01 §2.1  — mutations via commandManager.execute() only
 *   §01 §2.6  — newId generated at Tool layer, passed to command
 *   §04 §2    — Tool layer
 */

import { OperationToolBase } from './OperationToolBase.js';
import type { OperationId } from './ElementCapabilities.js';
import { OffsetElementCommand } from '@pryzm/command-registry';
import type { CommandManager } from '@pryzm/command-registry';
import type { Point3D } from '@pryzm/core-app-model';

export class OffsetTool extends OperationToolBase {
    get operationId(): OperationId { return 'offset'; }

    private _elementId = '';
    private _distance  = 1.0;
    private _bothSides   = false;
    private _panel: HTMLDivElement | null = null;

    constructor(private readonly _cmd: CommandManager) {
        super();
    }

    activate(elementId: string, elementType: string): void {
        this._baseActivate(elementId, elementType);
        this._elementId = elementId;
        this._distance  = 1.0;
        this._bothSides = false;
        this._resetStep();

        this._showPanel();
        this._showInstructions('Enter offset distance and press Apply — Esc to cancel');
    }

    override cancel(): void {
        this._destroyPanel();
        super.cancel();
    }

    // ── Distance panel ───────────────────────────────────────────────────────

    private _showPanel(): void {
        this._destroyPanel();

        const panel = document.createElement('div');
        panel.className = 'oop-offset-panel';
        panel.setAttribute('data-tool', 'offset');
        panel.innerHTML = `
          <label class="oop-offset-label">Distance (m)</label>
          <input  class="oop-offset-input" id="oop-offset-dist"
                  type="number" min="0.01" step="0.1" value="1.0"
                  autocomplete="off" />
          <label class="oop-offset-check-label">
            <input type="checkbox" id="oop-offset-both" /> Both sides
          </label>
          <button class="oop-offset-apply" id="oop-offset-apply">Apply</button>
          <button class="oop-offset-cancel" id="oop-offset-cancel">✕</button>
        `;

        document.body.appendChild(panel);
        this._panel = panel;

        const input = panel.querySelector<HTMLInputElement>('#oop-offset-dist')!;
        setTimeout(() => input.focus(), 50);

        panel.querySelector('#oop-offset-apply')!.addEventListener('click', () => {
            this._commitDistance(panel);
        });
        panel.querySelector('#oop-offset-cancel')!.addEventListener('click', () => {
            this.cancel();
        });
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); this._commitDistance(panel); }
            if (e.key === 'Escape') this.cancel();
        });
    }

    private _destroyPanel(): void {
        this._panel?.remove();
        this._panel = null;
    }

    private _commitDistance(panel: HTMLDivElement): void {
        const distInput = panel.querySelector<HTMLInputElement>('#oop-offset-dist')!;
        const bothCheck = panel.querySelector<HTMLInputElement>('#oop-offset-both')!;
        const dist      = parseFloat(distInput.value);

        if (!isFinite(dist) || dist <= 0) {
            this._showInstructions('⚠ Enter a positive distance in metres (e.g. 1.5)');
            return;
        }

        this._distance  = dist;
        this._bothSides = bothCheck.checked;
        this._destroyPanel();
        this._enterDirectionStep();
    }

    // ── Direction pick ───────────────────────────────────────────────────────

    private _enterDirectionStep(): void {
        if (this._bothSides) {
            // No direction needed — create both sides immediately
            this._executeOffset(+this._distance);
            this._executeOffset(-this._distance);
            return;
        }

        this._setCursor('crosshair');
        this._nextStep('Click the SIDE where the offset copy should appear — Esc to cancel');

        const handler = (e: Event) => {
            const { worldPoint } = (e as CustomEvent).detail ?? {};
            if (!worldPoint) return;
            const sign = this._sideSign(worldPoint as Point3D);
            this._executeOffset(sign * this._distance);
        };

        this._addListener('bim-canvas-world-click', handler as EventListener, window);
    }

    private _executeOffset(distance: number): void {
        const newId  = crypto.randomUUID();
        const cmd    = new OffsetElementCommand({
            sourceId: this._elementId,
            newId,
            distance,
        });
        const result = this._cmd.execute(cmd);
        if (!result.success) {
            const info = result.info?.[0] ?? 'Offset failed';
            window.dispatchEvent(new CustomEvent('bim-operation-error', { detail: { msg: info } })); // TODO(TASK-12)
            return;
        }
        console.log('[OffsetTool] Offset created:', newId, 'distance:', distance);
        this._complete();
    }

    /**
     * Determines the sign of the offset based on which side of the wall the
     * user clicked.  Returns +1 or -1.
     *
     * Convention matches OffsetElementCommand._perpXZ:
     *   perp = (dz/len, 0, -dx/len)
     * A click point on the LEFT of the direction vector (dot product of
     * click-relative-to-wall-start with perp > 0) → positive.
     */
    private _sideSign(clickPoint: Point3D): number {
        const wall = window.wallStore?.getById?.(this._elementId); // TODO(TASK-08)
        if (!wall) return 1;

        const [a0, a1] = wall.baseLine;
        const dx  = a1.x - a0.x, dz = a1.z - a0.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        const px  = dz / len, pz = -dx / len;   // perp direction

        // Vector from wall start to click
        const ex  = clickPoint.x - a0.x, ez = clickPoint.z - a0.z;
        const dot = ex * px + ez * pz;
        return dot >= 0 ? 1 : -1;
    }
}
