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

        // §OP-LISTEN-DEFER — step0 is attached on the NEXT macrotask so the click
        // that activated the Cut tool (which selected wall A) cannot be consumed as
        // keepPointA. step0 legitimately accepts a click on wall A (it marks the
        // side to keep), so it does NOT ignore wall A — but the defer guarantees it
        // is the user's deliberate click, not the activating selection click.
        this._addCanvasClickListener(detail => this._handleStep0(detail));
    }

    /** Step 0 — pick keepPointA. Returns true when the click is consumed. */
    private _handleStep0(detail: { worldPoint?: unknown; elementId?: string | null }): boolean {
        const worldPoint = detail.worldPoint as Point3D | undefined;
        if (!worldPoint) return false;

        // Accept a click on wall A (or anywhere on the canvas) as the keep-side mark.
        this._keepPointA = worldPoint;
        this._nextStep('Click the wall to cut AGAINST — then click the side to keep');
        console.log('[CutTool] keepPointA recorded', this._keepPointA, 'picked element:', detail.elementId ?? null);

        // Advance to step1. The swap helper detaches step0 and attaches step1 with
        // the same multi-dispatch auto-remove guard.
        this._swapCanvasClickListener(d => this._handleStep1(d));
        return true;
    }

    /** Step 1 — pick wall B + keepPointB. Returns true when the click is consumed. */
    private _handleStep1(detail: { worldPoint?: unknown; elementId?: string | null; elementType?: string | null }): boolean {
        const worldPoint = detail.worldPoint as Point3D | undefined;
        const wallBId    = detail.elementId ?? null;
        const pickedType = detail.elementType ?? null;
        if (!worldPoint || !wallBId) {
            this._showInstructions('⚠ Click on a wall — Esc to cancel');
            return false;
        }
        if (pickedType && pickedType !== 'wall') {
            this._showInstructions('⚠ Only walls can be cut in Phase 1 — click a wall');
            return false;
        }
        if (wallBId === this._wallAId) {
            this._showInstructions('⚠ Cannot cut a wall against itself — click a different wall');
            return false;
        }
        return this._executeCut(wallBId, worldPoint);
    }

    /** Returns true when the cut consumed the click (succeeded OR errored on a real pick). */
    private _executeCut(wallBId: string, keepPointB: Point3D): boolean {
        if (!this._keepPointA) return false;
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
            this._complete();
            return true;
        }
        this._complete();
        return true;
    }
}
