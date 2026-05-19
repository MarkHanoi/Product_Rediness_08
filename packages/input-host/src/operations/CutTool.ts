/**
 * @file src/tools/operations/CutTool.ts
 *
 * Two-click operation: user clicks on the part of wall A they want to keep
 * (click point becomes keepPointA), then clicks on wall B (click point becomes
 * keepPointB).  CutWallCommand trims both walls at their intersection.
 *
 * Interaction flow:
 *   1. SelectionOverlay calls activate(wallAId, elementType)
 *   2. Instruction: "Click on THIS wall to mark the side you want to KEEP"
 *   3. User clicks on wall A → keepPointA = worldPoint
 *   4. Instruction: "Click the second wall to cut against"
 *   5. User clicks wall B anywhere → wallBId = elementId, keepPointB = worldPoint
 *   6. CutWallCommand executed
 *
 * Contract:
 *   §01 §2.1 — mutations via commandManager.execute() only
 *   §04 §2   — Tool layer
 */

import { OperationToolBase } from './OperationToolBase.js';
import type { OperationId } from './ElementCapabilities.js';
import { CutWallCommand } from '@pryzm/command-registry';
import type { CommandManager } from '@pryzm/command-registry';
import type { Point3D } from '@pryzm/core-app-model';

export class CutTool extends OperationToolBase {
    get operationId(): OperationId { return 'cut'; }

    private _wallAId = '';
    private _keepPointA: Point3D | null = null;

    constructor(private readonly _cmd: CommandManager) {
        super();
    }

    activate(elementId: string, elementType: string): void {
        this._baseActivate(elementId, elementType);
        this._wallAId     = elementId;
        this._keepPointA  = null;
        this._resetStep();

        this._setCursor('crosshair');
        this._showInstructions('Click on THIS wall — the clicked side will be KEPT after the cut');

        // Step 0 handler — pick keepPointA by clicking on wall A
        const step0 = (e: Event) => {
            const detail = (e as CustomEvent).detail ?? {};
            const { worldPoint, elementId: pickedId } = detail;
            if (!worldPoint) return;

            // Accept if the user clicked wall A (or anywhere on the canvas for keepPoint)
            this._keepPointA = worldPoint as Point3D;
            this._nextStep('Click the wall to cut AGAINST — then click the side to keep');

            // Replace step0 with step1
            window.removeEventListener('bim-canvas-world-click', step0);
            window.addEventListener('bim-canvas-world-click', step1);
            // Remove from managed listeners and add step1
            this._replaceLastListener('bim-canvas-world-click', step0, step1);
            console.log(`[CutTool] keepPointA recorded`, this._keepPointA, 'picked element:', pickedId);
        };

        // Step 1 handler — pick wallB + keepPointB
        const step1 = (e: Event) => {
            const detail = (e as CustomEvent).detail ?? {};
            const { worldPoint, elementId: wallBId, elementType: pickedType } = detail;
            if (!worldPoint || !wallBId) {
                this._showInstructions('⚠ Click on a wall — Esc to cancel');
                return;
            }
            if (pickedType && pickedType !== 'wall') {
                this._showInstructions('⚠ Only walls can be cut in Phase 1 — click a wall');
                return;
            }
            if (wallBId === this._wallAId) {
                this._showInstructions('⚠ Cannot cut a wall against itself — click a different wall');
                return;
            }
            this._executeCut(wallBId, worldPoint as Point3D);
        };

        this._addListener('bim-canvas-world-click', step0 as EventListener, window);
    }

    private _executeCut(wallBId: string, keepPointB: Point3D): void {
        if (!this._keepPointA) return;
        const cmd = new CutWallCommand({
            wallAId:    this._wallAId,
            wallBId,
            keepPointA: this._keepPointA,
            keepPointB,
        });
        const result = this._cmd.execute(cmd);
        if (!result.success) {
            const info = result.info?.[0] ?? 'Cut failed';
            window.dispatchEvent(new CustomEvent('bim-operation-error', { detail: { msg: info } })); // TODO(TASK-12)
            return;
        }
        this._complete();
    }

    /**
     * Swaps step0 for step1 in the managed listeners array so cleanup on
     * cancel() still removes the active handler.
     */
    private _replaceLastListener(type: string, oldFn: EventListener, newFn: EventListener): void {
        const arr = (this as any)._listeners as Array<{ type: string; handler: EventListener; target: EventTarget }>;
        const idx = arr.findLastIndex((e: any) => e.type === type && e.handler === oldFn);
        if (idx >= 0) {
            arr[idx] = { type, handler: newFn, target: window };
        }
    }
}
